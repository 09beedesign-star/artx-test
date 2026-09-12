/**
 * 统一积分赠送服务
 *
 * 收口所有赠送场景：管理员赠送、规则自动赠送、首充收编。
 * 单一入口完成 creditBatches(kind=gift) + credits 流水 + creditNotifications + user.credits 更新。
 *
 * 设计原则：
 * - 幂等：idempotencyKey 防重复发放
 * - 原子：单事务内完成四表写入（由 admin-store 的 saveAdminData 保证）
 * - 可审计：所有赠送记录留完整审计链路
 * - 风控：单笔/单日额度校验
 */

import crypto from "node:crypto";

/**
 * ⚠️ 这里用**结构化类型**而不是从 admin-store 导入。
 * admin-store 要反过来引用本模块（grantCredits），直接 import 会形成循环依赖。
 * 只声明本服务真正用到的最小字段集，TypeScript 结构化类型系统保证
 * admin-store 里的 AdminData / AdminUserAccount 能直接传进来。
 */
export type GiftableUser = {
  id: string;
  name: string;
  credits: number;
};

export type GiftLedgerEntry = {
  id: string;
  userId: string;
  user: string;
  type: string;
  delta: number;
  reason: string;
  source: string;
  operator: string;
  createdAt: string;
};

/**
 * 批次的**读**侧类型。
 * ⚠️ kind/status 必须放宽成 string：数组里同时存着 membership/recharge/manual
 * 等其他 kind，收窄成 "gift" 会让 AdminData 整体无法赋值进来。
 * 本服务只**写入** gift 批次（见 GiftCreditBatch）。
 */
export type GiftCreditBatchLike = {
  id: string;
  userId: string;
  user: string;
  kind: string;
  source: string;
  initialCredits: number;
  remainingCredits: number;
  status: string;
  reason: string;
  operator: string;
  createdAt: string;
  expiresAt?: string;
};

/** 本服务写入的批次形状（kind 恒为 gift）。 */
export type GiftCreditBatch = GiftCreditBatchLike & {
  kind: "gift";
  status: "active";
};

export type GiftNotification = {
  id: string;
  userId: string;
  ledgerId: string;
  amount: number;
  balance: number;
  message: string;
  status: string;
  createdAt: string;
};

/** 本服务需要读写的 AdminData 最小切面。 */
export type GiftableData = {
  credits: GiftLedgerEntry[];
  creditBatches: GiftCreditBatchLike[];
  creditNotifications: GiftNotification[];
};

/**
 * 赠送流水的 type 字面量。
 * ⚠️ 单日额度统计靠它过滤，改动要同步 grantCredits 里的统计条件。
 */
export const GIFT_LEDGER_TYPE = "积分赠送";

export const DEFAULT_GIFT_EXPIRY_DAYS = 30;
export const SINGLE_GIFT_MAX_CREDITS = 100000;
export const DAILY_GIFT_MAX_CREDITS_PER_USER = 500000;

export type GiftCreditsInput = {
  /** 收件人用户对象 */
  user: GiftableUser;
  /** 赠送积分数（正整数，自动 round） */
  amount: number;
  /** 赠送理由（必填，用于审计与流水） */
  reason: string;
  /** 来源标识（如 admin/batch-gift、rule/signup-bonus、order/first-recharge） */
  source: string;
  /** 操作者名称（系统 = "系统"，管理员 = username） */
  operator: string;
  /** 操作时间（ISO 8601，不传默认当前） */
  createdAt?: string;
  /** 有效期天数（不传默认 30 天） */
  expiryDays?: number;
  /** 幂等键（选填，传了则防重复发放） */
  idempotencyKey?: string;
};

export type GiftCreditsResult =
  | { success: true; ledgerId: string; batchId: string; notificationId: string }
  | { success: false; error: string };

/**
 * 统一赠送积分入口
 *
 * @param data AdminData 对象（会被原地修改，调用后须 saveAdminData）
 * @param input 赠送参数
 * @returns 成功返回 ledger/batch/notification ID，失败返回 error
 */
export function grantCredits(data: GiftableData, input: GiftCreditsInput): GiftCreditsResult {
  const amount = Math.max(0, Math.round(input.amount));
  if (amount <= 0) {
    return { success: false, error: "赠送积分必须大于 0" };
  }

  // 单笔额度校验
  if (amount > SINGLE_GIFT_MAX_CREDITS) {
    return {
      success: false,
      error: `单笔赠送不能超过 ${SINGLE_GIFT_MAX_CREDITS.toLocaleString("zh-CN")} 积分`,
    };
  }

  const createdAt = input.createdAt || new Date().toISOString();

  // 幂等检查：把 idempotencyKey 落到流水的 source 上，靠它精确比对。
  // ⚠️ 不能用 (source, userId, reason, amount) 组合近似判重——那会把
  // 「同一天给同一个人发两笔同额度运营奖励」这种合法操作误判成重复。
  if (input.idempotencyKey) {
    const existing = data.credits.find(
      (entry) => entry.userId === input.user.id && entry.source === input.idempotencyKey
    );
    if (existing) {
      return { success: false, error: "该赠送已发放过（幂等键命中），未重复入账" };
    }
  }

  // 单日额度校验：同一用户当日累计赠送上限。
  // 只统计 type 为「积分赠送」的正向流水，避免把充值入账算进来。
  const dayStart = createdAt.slice(0, 10);
  const grantedToday = data.credits
    .filter(
      (entry) =>
        entry.userId === input.user.id &&
        entry.type === GIFT_LEDGER_TYPE &&
        entry.delta > 0 &&
        entry.createdAt.slice(0, 10) === dayStart
    )
    .reduce((sum, entry) => sum + entry.delta, 0);
  if (grantedToday + amount > DAILY_GIFT_MAX_CREDITS_PER_USER) {
    return {
      success: false,
      error: `超出单用户单日赠送上限（当日已赠 ${grantedToday.toLocaleString("zh-CN")}，上限 ${DAILY_GIFT_MAX_CREDITS_PER_USER.toLocaleString("zh-CN")}）`,
    };
  }
  const expiryDays = input.expiryDays ?? DEFAULT_GIFT_EXPIRY_DAYS;

  // 计算过期时间
  const expiresAt = addDaysIso(createdAt, expiryDays);
  if (!expiresAt) {
    return { success: false, error: "createdAt 时间格式无效" };
  }

  // 1. 写入流水
  // source 优先落 idempotencyKey，保证重放时能被上面的幂等检查精确命中；
  // 没有幂等键时才回落到业务 source。
  const ledgerEntry: GiftLedgerEntry = {
    id: `cr_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`,
    userId: input.user.id,
    user: input.user.name,
    type: GIFT_LEDGER_TYPE,
    delta: amount,
    reason: input.reason,
    source: input.idempotencyKey || input.source,
    operator: input.operator,
    createdAt,
  };
  data.credits = [ledgerEntry, ...data.credits].slice(0, 500);

  // 2. 创建 gift 批次（带过期）
  // 批次 source 保留**业务** source（而非幂等键），便于按来源追溯发放渠道。
  const batch: GiftCreditBatch = {
    id: `cb_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`,
    userId: input.user.id,
    user: input.user.name,
    kind: "gift" as const,
    source: input.source,
    initialCredits: amount,
    remainingCredits: amount,
    status: "active" as const,
    reason: input.reason,
    operator: input.operator,
    createdAt,
    expiresAt,
  };
  data.creditBatches = [batch, ...(data.creditBatches || [])].slice(0, 1000);

  // 3. 创建通知
  const notification: GiftNotification = {
    id: `cgn_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`,
    userId: input.user.id,
    ledgerId: ledgerEntry.id,
    amount,
    balance: input.user.credits + amount,
    message: buildGiftMessage(amount, input.reason),
    status: "unread" as const,
    createdAt,
  };
  data.creditNotifications = [notification, ...data.creditNotifications].slice(0, 500);

  // 4. 更新余额
  input.user.credits += amount;

  return {
    success: true,
    ledgerId: ledgerEntry.id,
    batchId: batch.id,
    notificationId: notification.id,
  };
}

/**
 * 生成赠送通知文案
 */
function buildGiftMessage(amount: number, reason: string): string {
  const formattedAmount = amount.toLocaleString("zh-CN");
  if (reason.includes("首充") || reason.includes("邀请") || reason.includes("注册")) {
    return `恭喜！您已获得 ${formattedAmount} 积分奖励（${reason}）。`;
  }
  return `您好，您已收到 ${formattedAmount} 积分赠送（${reason}）。`;
}

/**
 * 日期加天数（UTC）
 */
function addDaysIso(input: string, days: number): string | undefined {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/** id 生成与 admin-store 现有风格保持一致。 */
function randomUUID(): string {
  return crypto.randomUUID();
}
