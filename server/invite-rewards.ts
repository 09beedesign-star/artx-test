/**
 * 邀请注册奖励 —— 风控与发放规则
 *
 * ⚠️⚠️ 设计前提，改动前必读：
 *
 * 本项目的注册链路是**零成本**的：只要用户名 + 密码即可注册，没有邮箱验证、
 * 没有手机号、没有短信或图形验证码。这意味着任何「注册即发放」的奖励都等同于
 * 一台永久提款机 —— 攻击者用 a+1@gmail.com、a+2@gmail.com 这类 plus 地址，
 * 一个真实邮箱就能派生出无限个「不同账号」，全部投递到同一个收件箱。
 *
 * 项目此前正因为这个原因砍掉了「每日免费积分」功能，并确立了判断标准：
 *   **发放的触发条件，必须是「付了钱」或「管理员经手」二者之一。**
 *
 * 因此本模块的核心设计是：
 *   注册时**只绑定关系、不发任何积分**；
 *   只有当被邀请人**首次真实付费**时，才给双方发奖。
 *
 * 这样刷号者要拿奖励就必须先付钱，而奖励价值恒小于付款额，刷号变成亏本生意。
 * 任何把发放时机前移到「注册成功」的改动都会让整套防线失效，务必不要这么做。
 */

import crypto from "node:crypto";
import {
  INVITE_REWARD_CONFIG,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
} from "../shared/billing-config";

/** 风控判定所需的用户最小形状，与 auth-store 的 StoredUser 结构兼容。 */
export type InviteUserLike = {
  id: string;
  username: string;
  loginKey?: string;
  identityKey?: string;
  createdAt?: string;
  signupIp?: string;
  signupUserAgent?: string;
  invitedBy?: string;
  invitedAt?: string;
  inviteCode?: string;
  hasPaid?: boolean;
  status?: "active" | "disabled";
};

/** 奖励发放的来源前缀。必须落在 ALLOWED_GIFT_SOURCE_PREFIXES 的 `rule/` 白名单内。 */
export const INVITE_SOURCE_PREFIX = "rule/invite";

export type InviteRejectReason =
  | "self_invite"
  | "same_identity"
  | "same_ip"
  | "binding_expired"
  | "inviter_quota_exceeded"
  | "inviter_disabled"
  | "already_rewarded"
  | "amount_below_threshold"
  | "no_binding";

export type InviteEligibility =
  | { eligible: true }
  | { eligible: false; reason: InviteRejectReason; detail: string };

/**
 * 生成邀请码。
 *
 * 用 crypto.randomInt 而不是 Math.random：邀请码虽然不是密钥，但它可被枚举
 * 就意味着攻击者能批量试出他人邀请码并冒名绑定关系，进而污染他人的邀请配额。
 */
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[crypto.randomInt(0, INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/** 生成一个在给定用户集合中不重复的邀请码。 */
export function generateUniqueInviteCode(users: InviteUserLike[]): string {
  const taken = new Set(users.map((user) => String(user.inviteCode || "").toUpperCase()).filter(Boolean));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateInviteCode();
    if (!taken.has(code)) {
      return code;
    }
  }
  // 50 次仍撞车说明码空间接近枯竭（31^8 ≈ 8.5e11，实际不可能），
  // 退化为附加随机后缀而不是返回重复码 —— 返回重复码会让绑定关系张冠李戴。
  return `${generateInviteCode()}${crypto.randomInt(0, 999_999).toString().padStart(6, "0")}`;
}

export function findUserByInviteCode(users: InviteUserLike[], code: unknown): InviteUserLike | undefined {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }
  return users.find((user) => String(user.inviteCode || "").toUpperCase() === normalized);
}

/**
 * 注册阶段的绑定校验。
 *
 * 注意这里**不发任何积分**，只决定「这条邀请关系能不能建立」。
 * 即便建立成功，也要等被邀请人付费时再跑一次 evaluateRewardEligibility。
 * 两段式校验是刻意的：注册时能拿到的信号（IP、身份键）与付费时能拿到的信号
 * （配额是否已满、绑定是否过期）不是同一批，合并成一次校验必然漏掉一半。
 */
export function evaluateBindingEligibility(params: {
  inviter: InviteUserLike | undefined;
  inviteeIdentityKey: string;
  inviteeIp?: string;
  allUsers: InviteUserLike[];
  now?: Date;
}): InviteEligibility {
  const { inviter, inviteeIdentityKey, inviteeIp, allUsers } = params;

  if (!inviter) {
    return { eligible: false, reason: "no_binding", detail: "邀请码无效" };
  }

  if (inviter.status === "disabled") {
    return { eligible: false, reason: "inviter_disabled", detail: "邀请人账号已停用" };
  }

  // 自邀检测第一层：归一化后的身份键相同 = 同一个邮箱派生出来的账号。
  const inviterIdentity = String(inviter.identityKey || inviter.loginKey || "").toLowerCase();
  if (inviterIdentity && inviteeIdentityKey && inviterIdentity === inviteeIdentityKey) {
    return { eligible: false, reason: "same_identity", detail: "不能邀请自己" };
  }

  // 自邀检测第二层：同一注册 IP。
  // ⚠️ 这一层刻意做得「宽松」——只在双方 IP 都存在且完全相同时才拒绝。
  // 因为同事、同学、家人共用出口 IP 是极常见的正常情况，
  // 收紧成网段匹配会大面积误伤真实用户。它的定位是兜住最省事的刷号者，
  // 不是万能防线，真正的防线是「必须付费才发奖」。
  if (inviter.signupIp && inviteeIp && inviter.signupIp === inviteeIp) {
    return { eligible: false, reason: "same_ip", detail: "检测到同一来源的重复注册" };
  }

  // 配额预检：已经拿满奖励的邀请人不再接受新绑定，避免用户白白建立一条
  // 永远不会兑现的关系（体验上比「绑定成功但付费后才告诉你没奖」好得多）。
  const rewardedCount = countRewardedInvites(allUsers, inviter.id);
  if (rewardedCount >= INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser) {
    return {
      eligible: false,
      reason: "inviter_quota_exceeded",
      detail: `邀请人已达奖励上限（${INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser} 人）`,
    };
  }

  return { eligible: true };
}

/** 统计某个邀请人已经真正拿到奖励的人数（即被邀请人已付费的那些）。 */
export function countRewardedInvites(users: InviteUserLike[], inviterId: string): number {
  return users.filter((user) => user.invitedBy === inviterId && user.hasPaid === true).length;
}

/** 统计某个邀请人已绑定但尚未付费的人数（前端展示「待转化」用）。 */
export function countPendingInvites(users: InviteUserLike[], inviterId: string, now = new Date()): number {
  return users.filter((user) => {
    if (user.invitedBy !== inviterId || user.hasPaid === true) {
      return false;
    }
    return !isBindingExpired(user, now);
  }).length;
}

export function isBindingExpired(invitee: InviteUserLike, now = new Date()): boolean {
  if (!invitee.invitedAt) {
    return false;
  }
  const bound = Date.parse(invitee.invitedAt);
  if (!Number.isFinite(bound)) {
    // 时间戳解析不出来时保守判定为「未过期」，把决定权留给其他校验层。
    // 判成已过期会让数据异常直接变成用户损失。
    return false;
  }
  const ageMs = now.getTime() - bound;
  return ageMs > INVITE_REWARD_CONFIG.bindingValidDays * 24 * 60 * 60 * 1000;
}

/**
 * 付费阶段的发奖校验 —— 奖励发放的唯一闸门。
 *
 * @param paidAmountHkd 本次付费金额（港币）。低于门槛不发奖，
 *        防止有人用 1 元小额付款把「必须付费」这道门槛降到近乎零成本。
 */
export function evaluateRewardEligibility(params: {
  invitee: InviteUserLike;
  inviter: InviteUserLike | undefined;
  allUsers: InviteUserLike[];
  paidAmountHkd: number;
  now?: Date;
}): InviteEligibility {
  const { invitee, inviter, allUsers, paidAmountHkd } = params;
  const now = params.now || new Date();

  if (!invitee.invitedBy || !inviter) {
    return { eligible: false, reason: "no_binding", detail: "该用户没有有效的邀请关系" };
  }

  if (invitee.invitedBy === invitee.id || inviter.id === invitee.id) {
    return { eligible: false, reason: "self_invite", detail: "不能邀请自己" };
  }

  if (inviter.status === "disabled") {
    return { eligible: false, reason: "inviter_disabled", detail: "邀请人账号已停用" };
  }

  // hasPaid 已为 true 说明这不是「首次」付费，奖励只在首次付费时发一次。
  // 真正的防重复仍然依赖 grantCredits 的幂等键，这里只是提前短路。
  if (invitee.hasPaid === true) {
    return { eligible: false, reason: "already_rewarded", detail: "该用户的邀请奖励已发放" };
  }

  if (paidAmountHkd < INVITE_REWARD_CONFIG.minPaidAmountHkd) {
    return {
      eligible: false,
      reason: "amount_below_threshold",
      detail: `首次付费需满 ${INVITE_REWARD_CONFIG.minPaidAmountHkd} 港币才触发邀请奖励`,
    };
  }

  if (isBindingExpired(invitee, now)) {
    return {
      eligible: false,
      reason: "binding_expired",
      detail: `邀请关系已超过 ${INVITE_REWARD_CONFIG.bindingValidDays} 天有效期`,
    };
  }

  const inviterIdentity = String(inviter.identityKey || inviter.loginKey || "").toLowerCase();
  const inviteeIdentity = String(invitee.identityKey || invitee.loginKey || "").toLowerCase();
  if (inviterIdentity && inviteeIdentity && inviterIdentity === inviteeIdentity) {
    return { eligible: false, reason: "same_identity", detail: "邀请人与被邀请人为同一身份" };
  }

  if (inviter.signupIp && invitee.signupIp && inviter.signupIp === invitee.signupIp) {
    return { eligible: false, reason: "same_ip", detail: "邀请人与被邀请人注册来源相同" };
  }

  const rewardedCount = countRewardedInvites(allUsers, inviter.id);
  if (rewardedCount >= INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser) {
    return {
      eligible: false,
      reason: "inviter_quota_exceeded",
      detail: `邀请人已达奖励上限（${INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser} 人）`,
    };
  }

  return { eligible: true };
}

/**
 * 构造奖励发放的幂等键。
 *
 * 以被邀请人 id 为主键而非邀请人 —— 一个被邀请人一生只触发一次奖励，
 * 用它做键天然保证「同一条邀请关系不会重复发奖」，
 * 即便发放流程被并发调用或重试也只会入账一次。
 */
export function buildInviteIdempotencyKey(inviteeId: string, role: "inviter" | "invitee"): string {
  return `${INVITE_SOURCE_PREFIX}/${inviteeId}/${role}`;
}

/**
 * 计算退款时应从某一方扣回多少邀请奖励积分。
 *
 * ⭐ 用户定的规则（2026-09-13）：**应扣，但余额为零时停止扣款**。
 * 也就是「能扣多少扣多少，绝不把余额扣成负数，也绝不去动别的来源的积分」。
 *
 * 为什么不允许扣成负数（哪怕记成欠款）：
 *   - 负余额会让 getUserCreditBatchBalance 的 legacyBalance 兜底算出诡异结果，
 *     且前台积分数字是现算的，用户会看到一个无法解释的负数；
 *   - 奖励积分本就是零成本发出的，追不回来的部分是风控成本而不是应收账款，
 *     记成欠款会让用户下次充值时莫名被吞掉，体验上等同于偷扣。
 * 追不回的差额由调用方记为短缺并生成风控事件，走人工复核。
 *
 * @param granted  当初发放的数量
 * @param available 该用户名下**这笔奖励来源**当前还剩多少（不含其他来源）
 */
export function resolveInviteClawbackAmount(granted: number, available: number): number {
  const grantedAmount = Math.max(0, Math.round(granted));
  const availableAmount = Math.max(0, Math.round(available));
  return Math.min(grantedAmount, availableAmount);
}

/**
 * 判断某个邀请人的退款率是否异常。
 *
 * ⚠️ 两个条件是 **and** 不是 or：必须同时「样本够」且「比率超阈值」。
 * 漏掉样本数那一半会让「邀请 1 人、那人退款」直接报 100% 异常 ——
 * 这是小样本比率的经典陷阱，也是风控告警最常见的噪音来源。
 *
 * 返回 rate 供调用方写进告警详情，让人工一眼看到是 3/5 还是 9/10。
 */
export function evaluateInviteRefundRate(input: {
  rewardedInvites: number;
  refundedInvites: number;
}): { abnormal: boolean; rate: number } {
  const rewarded = Math.max(0, Math.round(input.rewardedInvites));
  const refunded = Math.max(0, Math.round(input.refundedInvites));
  if (rewarded <= 0) return { abnormal: false, rate: 0 };
  const rate = Math.min(1, refunded / rewarded);
  const abnormal =
    rewarded >= INVITE_REWARD_CONFIG.refundRateMinSamples
    && rate >= INVITE_REWARD_CONFIG.refundRateAlertThreshold;
  return { abnormal, rate };
}

export function buildInviteRewardReason(role: "inviter" | "invitee", counterpartName: string): string {
  if (role === "inviter") {
    return `邀请好友 ${counterpartName} 完成首次付费的奖励`;
  }
  return "受邀注册并完成首次付费的奖励";
}

/** 前端邀请面板所需的聚合数据。 */
export function buildInviteSummary(user: InviteUserLike, allUsers: InviteUserLike[], now = new Date()) {
  const rewarded = countRewardedInvites(allUsers, user.id);
  const pending = countPendingInvites(allUsers, user.id, now);
  return {
    inviteCode: user.inviteCode || "",
    rewardedCount: rewarded,
    pendingCount: pending,
    remainingQuota: Math.max(0, INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser - rewarded),
    maxQuota: INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser,
    earnedCredits: rewarded * INVITE_REWARD_CONFIG.inviterCredits,
    inviterCredits: INVITE_REWARD_CONFIG.inviterCredits,
    inviteeCredits: INVITE_REWARD_CONFIG.inviteeCredits,
    bindingValidDays: INVITE_REWARD_CONFIG.bindingValidDays,
    rewardCreditValidDays: INVITE_REWARD_CONFIG.rewardCreditValidDays,
    minPaidAmountHkd: INVITE_REWARD_CONFIG.minPaidAmountHkd,
  };
}
