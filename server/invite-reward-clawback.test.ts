import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_REWARD_CONFIG } from "../shared/billing-config";
import { evaluateInviteRefundRate, resolveInviteClawbackAmount } from "./invite-rewards";

/**
 * 邀请奖励 —— 退款扣回测试（2026-09-13 新增）
 *
 * ## 为什么必须有这一层
 *
 * 邀请奖励上线时，退款链路**完全不认它的 source**：
 * 用户付费拿到奖励后退款，钱退回去了、积分还留着 —— 一条零成本的提款通道。
 * 这个缺口不会报错、不会有任何日志，只有对账时才会发现积分总量对不上。
 *
 * ⚠️ 同类缺口的通用形态：**接入新的发积分路径时，退款链路默认不认识它**。
 * deductCreditBatchesBySource 按 source 匹配，新来源天然落在匹配规则之外。
 *
 * ## 这里守的三件事
 *
 * 1. 退款必须扣回**两个人**的奖励（邀请人 + 被邀请人）；
 * 2. 奖励已被花掉时**扣到零即止**，绝不把余额扣成负数（用户 2026-09-13 定的规则）；
 * 3. 扣的必须是**各自账上**的那一份 —— 两份批次 source 完全相同、
 *    只有 userId 不同，按 source 全局扣会从一个人身上扣掉双份。
 */

let dataDir = "";

async function loadStores() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  const admin = await import("./admin-store");
  const auth = await import("./auth-store");
  return { admin, auth };
}

type Stores = Awaited<ReturnType<typeof loadStores>>;

async function getAdminAuthorization(auth: Stores["auth"]) {
  const result = await auth.handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(result.status).toBe(200);
  const body = result.body as { token?: string };
  expect(body.token).toBeTruthy();
  return `Bearer ${body.token}`;
}

async function register(
  auth: Stores["auth"],
  params: { username: string; ip?: string; inviteCode?: string }
) {
  const result = await auth.handleAuthAction(
    "register",
    {
      username: params.username,
      password: "secure-password",
      ...(params.inviteCode ? { inviteCode: params.inviteCode } : {}),
    },
    { ip: params.ip, userAgent: "vitest" }
  );
  expect(result.status).toBe(200);
  return (result.body as { user: { id: string; username: string } }).user;
}

/** 走完整付费链路：下单 → 确认支付。返回订单号。 */
async function purchase(
  admin: Stores["admin"],
  params: { userId: string; username: string }
) {
  const created = await admin.createBillingOrder({
    userId: params.userId,
    username: params.username,
    planId: "pro",
    cycleId: "monthly",
    paymentMethod: "wechat",
  });
  expect(created.status).toBe(200);
  const orderId = (created.body as { order: { id: string } }).order.id;
  const pending = await admin.getBillingOrderForPayment(orderId);
  const paid = await admin.markBillingOrderPaid({
    orderId,
    actorName: "test-runner",
    expectedAmountCents: (pending as { amountCents?: number } | undefined)?.amountCents,
    providerTransactionId: `txn_${orderId}`,
    eventType: "test_confirm",
  });
  expect(paid.status).toBe(200);
  return orderId;
}

type Snapshot = {
  balance: number;
  creditBatches: Array<{ source?: string; remainingCredits: number; status: string }>;
  ledger: Array<{ type: string; delta: number; source?: string }>;
};

async function readState(admin: Stores["admin"], userId: string) {
  const snapshot = (await admin.getBillingSnapshotForUser(userId)) as Snapshot | null;
  if (!snapshot) return { balance: 0, inviteBatches: [], clawbackLedger: [] };
  const inviteBatches = snapshot.creditBatches.filter((batch) =>
    String(batch.source || "").startsWith("rule/invite")
  );
  const clawbackLedger = snapshot.ledger.filter((entry) => entry.type === "邀请奖励扣回");
  return { balance: snapshot.balance, inviteBatches, clawbackLedger };
}

/** 建立「邀请人 + 被邀请人已付费拿到奖励」的初始状态。 */
async function setupRewardedInvite(stores: Stores, suffix = "1") {
  const { admin, auth } = stores;
  const inviter = await register(auth, {
    username: `inviter${suffix}@example.com`,
    ip: `10.0.0.${suffix}`,
  });
  const summary = await auth.getInviteSummaryForUser(inviter.id);
  expect(summary?.inviteCode).toBeTruthy();
  const invitee = await register(auth, {
    username: `invitee${suffix}@example.com`,
    ip: `10.1.0.${suffix}`,
    inviteCode: summary!.inviteCode,
  });
  const orderId = await purchase(admin, { userId: invitee.id, username: invitee.username });
  return { inviter, invitee, orderId };
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-invite-clawback-"));
});

afterEach(async () => {
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true });
  }
  dataDir = "";
});

describe("邀请奖励扣回额度计算", () => {
  it("余额充足时按发放额全额扣回", () => {
    expect(resolveInviteClawbackAmount(300, 300)).toBe(300);
    expect(resolveInviteClawbackAmount(300, 500)).toBe(300);
  });

  it("⭐ 余额不足时扣到零即止，绝不返回超过余额的数字", () => {
    /*
     * 这是用户 2026-09-13 明确定的规则：「应扣，但余额为零时停止扣款」。
     * 最关键的是第三条 —— 余额为 0 时必须返回 0 而不是负数或原额，
     * 返回原额会让调用方把用户余额扣成负数。
     */
    expect(resolveInviteClawbackAmount(300, 120)).toBe(120);
    expect(resolveInviteClawbackAmount(300, 0)).toBe(0);
    expect(resolveInviteClawbackAmount(300, -50)).toBe(0);
  });

  it("发放额本身为 0 或负数时不扣", () => {
    expect(resolveInviteClawbackAmount(0, 300)).toBe(0);
    expect(resolveInviteClawbackAmount(-10, 300)).toBe(0);
  });
});

describe("邀请渠道退款率风控阈值", () => {
  it("样本不足时一律不告警（小样本比率没有意义）", () => {
    /*
     * ⚠️ 这条守的是风控里最常见的误报源：
     * 邀请 1 人、那人退款 → 退款率 100%，但这完全可能只是朋友试了一下不合适。
     * 少了这道闸门，风控列表会被单次退款刷屏，真正的刷单反而被淹没。
     */
    const verdict = evaluateInviteRefundRate({ rewardedInvites: 1, refundedInvites: 1 });
    expect(verdict.rate).toBe(1);
    expect(verdict.abnormal).toBe(false);

    const two = evaluateInviteRefundRate({ rewardedInvites: 2, refundedInvites: 2 });
    expect(two.abnormal).toBe(false);
  });

  it("样本够且超过阈值才告警", () => {
    expect(evaluateInviteRefundRate({ rewardedInvites: 4, refundedInvites: 3 }).abnormal).toBe(true);
    expect(evaluateInviteRefundRate({ rewardedInvites: 10, refundedInvites: 9 }).abnormal).toBe(true);
  });

  it("正常波动范围内不告警", () => {
    // 10 邀请退 2 单 = 20%，属于正常退款率，不该打扰人工。
    expect(evaluateInviteRefundRate({ rewardedInvites: 10, refundedInvites: 2 }).abnormal).toBe(false);
  });

  it("零邀请不会除零", () => {
    const verdict = evaluateInviteRefundRate({ rewardedInvites: 0, refundedInvites: 0 });
    expect(verdict.rate).toBe(0);
    expect(verdict.abnormal).toBe(false);
  });

  it("阈值与最小样本数必须是有意义的值", () => {
    /*
     * 锁的是「关系」不是具体数字（与 invite-reward-economics.test.ts 同思路）：
     * 阈值调成 0 等于每次退款都告警，调成 1 等于永不告警，两头都是废掉风控。
     */
    expect(INVITE_REWARD_CONFIG.refundRateAlertThreshold).toBeGreaterThan(0.2);
    expect(INVITE_REWARD_CONFIG.refundRateAlertThreshold).toBeLessThan(1);
    expect(INVITE_REWARD_CONFIG.refundRateMinSamples).toBeGreaterThanOrEqual(2);
  });
});

describe("邀请奖励退款扣回（端到端）", () => {
  it("⭐ 退款后邀请人与被邀请人的奖励都被扣回", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitee, orderId } = await setupRewardedInvite(stores);

    // 前置确认：奖励确实发出去了，否则下面的断言会在空数据上假通过。
    const inviterBefore = await readState(admin, inviter.id);
    const inviteeBefore = await readState(admin, invitee.id);
    expect(inviterBefore.inviteBatches.length).toBe(1);
    expect(inviteeBefore.inviteBatches.length).toBe(1);
    expect(inviterBefore.inviteBatches[0].remainingCredits).toBe(
      INVITE_REWARD_CONFIG.inviterCredits
    );
    expect(inviteeBefore.inviteBatches[0].remainingCredits).toBe(
      INVITE_REWARD_CONFIG.inviteeCredits
    );

    const authorization = await getAdminAuthorization(auth);
    const refund = await admin.handleAdminApiRequest(
      "POST",
      `/orders/${orderId}/refund`,
      authorization,
      { confirmation: "CONFIRM_REFUND_ORDER", reason: "测试邀请奖励扣回" }
    );
    expect(refund.status).toBe(200);

    const inviterAfter = await readState(admin, inviter.id);
    const inviteeAfter = await readState(admin, invitee.id);

    expect(inviterAfter.inviteBatches[0].remainingCredits).toBe(0);
    expect(inviterAfter.inviteBatches[0].status).toBe("refunded");
    expect(inviteeAfter.inviteBatches[0].remainingCredits).toBe(0);
    expect(inviteeAfter.inviteBatches[0].status).toBe("refunded");

    // 台账两侧都要有记录，否则对账时查不到钱去哪了。
    expect(inviterAfter.clawbackLedger.length).toBe(1);
    expect(inviterAfter.clawbackLedger[0].delta).toBe(-INVITE_REWARD_CONFIG.inviterCredits);
    expect(inviteeAfter.clawbackLedger.length).toBe(1);
    expect(inviteeAfter.clawbackLedger[0].delta).toBe(-INVITE_REWARD_CONFIG.inviteeCredits);
  });

  it("⭐ 奖励已被消费时扣到零即止，余额不会变成负数", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitee, orderId } = await setupRewardedInvite(stores);

    /*
     * 让邀请人把奖励花掉一部分。
     * 走真实消费路径（recordAiUsage → deductCreditBatchesForUsage）而不是直接改数据 ——
     * 直接改会绕过批次扣减逻辑，造出一个业务上不可能出现的状态，测出来的结论不作数。
     *
     * ⚠️ 模型必须挑 **非 high 档**：recordAiUsage 对 high 档会 excludeKinds=["gift"]，
     * 而邀请奖励批次正是 kind=gift —— 用 high 档模型这笔消费根本扣不到奖励批次，
     * 余额纹丝不动，后面的「扣到零即止」就成了空转断言。
     */
    const inviterBefore = await readState(admin, inviter.id);
    const spend = INVITE_REWARD_CONFIG.inviterCredits - 40;
    await admin.recordAiUsage({
      userId: inviter.id,
      username: inviter.username,
      capability: "图片生成",
      provider: "AI_IMAGE",
      model: "vod-og25-sunburst-medium",
      status: "success",
      outputUnits: 1,
      // 不传 capabilityKey → 不走报价表，直接按这个数扣，便于精确造出「只剩 40」的状态。
      chargedCredits: spend,
    });
    const afterSpend = await readState(admin, inviter.id);
    expect(afterSpend.balance).toBe(inviterBefore.balance - spend);
    expect(afterSpend.inviteBatches[0].remainingCredits).toBe(40);

    const authorization = await getAdminAuthorization(auth);
    const refund = await admin.handleAdminApiRequest(
      "POST",
      `/orders/${orderId}/refund`,
      authorization,
      { confirmation: "CONFIRM_REFUND_ORDER", reason: "测试扣到零即止" }
    );
    expect(refund.status).toBe(200);

    const inviterAfter = await readState(admin, inviter.id);
    // 只剩 40 分可扣，绝不能扣 300 把余额打成负数。
    expect(inviterAfter.balance).toBeGreaterThanOrEqual(0);
    expect(inviterAfter.inviteBatches[0].remainingCredits).toBe(0);
    expect(inviterAfter.clawbackLedger[0].delta).toBe(-40);

    // 被邀请人那份没被消费，仍应全额扣回 —— 一方余额不足不影响另一方。
    const inviteeAfter = await readState(admin, invitee.id);
    expect(inviteeAfter.clawbackLedger[0].delta).toBe(-INVITE_REWARD_CONFIG.inviteeCredits);
  });

  it("⭐ 两份批次 source 相同但不能互相误扣", async () => {
    /*
     * 这条守的是本次实现里最隐蔽的坑：
     * 邀请人与被邀请人的批次 source 完全相同（rule/invite/<inviteeId>），
     * 只有 userId 不同。若复用不按 userId 过滤的 deductCreditBatchesBySource，
     * 就会从先创建的那个人身上一次扣掉两份，另一个人分文未动 ——
     * 两人扣回总额看起来还是对的，**总量对账发现不了**，只有按人查才暴露。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitee, orderId } = await setupRewardedInvite(stores);

    const authorization = await getAdminAuthorization(auth);
    await admin.handleAdminApiRequest("POST", `/orders/${orderId}/refund`, authorization, {
      confirmation: "CONFIRM_REFUND_ORDER",
      reason: "测试跨账号误扣",
    });

    const inviterAfter = await readState(admin, inviter.id);
    const inviteeAfter = await readState(admin, invitee.id);

    // 各扣各的：数额必须分别等于各自的发放额，不能一方 500 一方 0。
    expect(inviterAfter.clawbackLedger.map((entry) => entry.delta)).toEqual([
      -INVITE_REWARD_CONFIG.inviterCredits,
    ]);
    expect(inviteeAfter.clawbackLedger.map((entry) => entry.delta)).toEqual([
      -INVITE_REWARD_CONFIG.inviteeCredits,
    ]);
    // 反向断言：任何一方都不该出现"被扣了两份"的条目。
    for (const entry of [...inviterAfter.clawbackLedger, ...inviteeAfter.clawbackLedger]) {
      expect(Math.abs(entry.delta)).toBeLessThanOrEqual(
        Math.max(INVITE_REWARD_CONFIG.inviterCredits, INVITE_REWARD_CONFIG.inviteeCredits)
      );
    }
  });

  it("⭐⭐ 被邀请人余额不足时，缺口不得溢出到邀请人的批次上", async () => {
    /*
     * ## 为什么单有上面那条"source 相同不能互相误扣"还不够
     *
     * 变异测试实测：把被邀请人那一侧换成不按 userId 过滤的
     * deductCreditBatchesBySource，上面那条**照样通过**。
     * 原因是两份批次的 createdAt 取自同一个 paidAt，完全相等，
     * 稳定排序下被邀请人的批次恰好排在前面 —— 全局扣 200 正好落在他自己头上。
     * **通过是巧合，不是实现正确。**
     *
     * 这条测试刻意破坏那个巧合：先让被邀请人花掉大部分奖励，
     * 于是他自己的批次不够扣，全局扣减就必然溢出到邀请人的批次上，
     * 导致邀请人随后只能扣到残额 —— 误扣行为被稳定放大成可观测的数值差。
     *
     * 业务上这也是真实场景：被邀请人拿了奖励、花掉一些、然后退款。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitee, orderId } = await setupRewardedInvite(stores);

    // 被邀请人花掉奖励的大部分，只留 30 分。
    const spend = INVITE_REWARD_CONFIG.inviteeCredits - 30;
    await admin.recordAiUsage({
      userId: invitee.id,
      username: invitee.username,
      capability: "图片生成",
      provider: "AI_IMAGE",
      model: "vod-og25-sunburst-medium",
      status: "success",
      outputUnits: 1,
      chargedCredits: spend,
    });
    const inviteeAfterSpend = await readState(admin, invitee.id);
    expect(inviteeAfterSpend.inviteBatches[0].remainingCredits).toBe(30);

    const authorization = await getAdminAuthorization(auth);
    await admin.handleAdminApiRequest("POST", `/orders/${orderId}/refund`, authorization, {
      confirmation: "CONFIRM_REFUND_ORDER",
      reason: "测试缺口溢出",
    });

    const inviterAfter = await readState(admin, inviter.id);
    const inviteeAfter = await readState(admin, invitee.id);

    // 被邀请人只剩 30 可扣，就只扣 30。
    expect(inviteeAfter.clawbackLedger.map((entry) => entry.delta)).toEqual([-30]);

    /*
     * ⭐⭐ 短缺必须被风控事件记下来 —— 这是变异测试逼出来的第二道断言。
     *
     * 实测：把读余额的 getRemainingCreditBatchBalanceByUserSource 换成
     * 不带 userId 的全局版，上面所有数值断言**照样全过** ——
     * 因为扣减那一步仍按 userId 夹住了实际扣减额，账面看不出任何异常。
     * 唯一漏出来的破绽是：应扣额被算成了 200（两人余额相加）而不是 30，
     * 于是「短缺 170」这条本该响的告警**不响了**，缺口被静默吞掉。
     *
     * 少了这条断言，那个变异就是一个完全无声的缺陷：
     * 钱少扣了、没人知道、对账时才发现。
     */
    const riskResponse = await admin.handleAdminApiRequest("GET", "/risk-events", authorization);
    const riskEvents = (riskResponse.body as { riskEvents: Array<{ title: string; detail: string }> })
      .riskEvents;
    const shortfallEvent = riskEvents.find((event) => event.title === "邀请奖励扣回短缺");
    expect(shortfallEvent).toBeTruthy();
    // 短缺额必须按**被邀请人自己**的余额算：应扣 200、实扣 30 → 短缺 170。
    // 若读余额时把两人的钱加在了一起，这里会算成别的数字。
    expect(shortfallEvent!.detail).toContain(`短缺 ${INVITE_REWARD_CONFIG.inviteeCredits - 30} 积分`);
    // ⭐ 关键：邀请人那份分文未动过，必须仍能被**全额**扣回。
    // 若实现按全局 source 扣，被邀请人的 170 缺口会从这里补走，此处就变成 -130。
    expect(inviterAfter.clawbackLedger.map((entry) => entry.delta)).toEqual([
      -INVITE_REWARD_CONFIG.inviterCredits,
    ]);
    expect(inviterAfter.inviteBatches[0].remainingCredits).toBe(0);
  });

  it("退款后释放邀请人的配额（hasPaid 复位）", async () => {
    /*
     * 不复位的话，这条已被撤销的邀请会永久占用邀请人 10 个名额之一 ——
     * 用一笔退掉的订单卡住邀请人的配额，对邀请人不公平。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitee, orderId } = await setupRewardedInvite(stores);

    const before = await auth.getInviteSummaryForUser(inviter.id);
    expect(before?.rewardedCount).toBe(1);

    const authorization = await getAdminAuthorization(auth);
    await admin.handleAdminApiRequest("POST", `/orders/${orderId}/refund`, authorization, {
      confirmation: "CONFIRM_REFUND_ORDER",
      reason: "测试配额释放",
    });

    const after = await auth.getInviteSummaryForUser(inviter.id);
    expect(after?.rewardedCount).toBe(0);
    expect(invitee.id).toBeTruthy();
  });

  it("⭐⭐ 被邀请人余额花光（订单侧一分扣不到）时，邀请人的奖励仍必须扣回", async () => {
    /*
     * ## 变异测试逼出来的场景
     *
     * 实测：把邀请奖励扣回整块塞回 `if (creditsToDeduct > 0)` 里面，
     * 其余 14 条测试**全部照过** —— 因为它们的被邀请人余额都还够扣订单积分。
     *
     * `creditsToDeduct > 0` 说的是「**订单本身**有积分可扣」，
     * 跟「邀请奖励该不该扣」是两码事。被邀请人完全可能把钱花光后再退款：
     * 订单侧扣不到任何积分 → 条件为假 → 邀请人那份奖励整块被跳过，
     * 于是**邀请人白拿 300 积分，还没有任何告警**。
     *
     * 这里把被邀请人的余额彻底清零（订单积分 + 首充赠送 + 邀请奖励全花掉），
     * 造出 creditsToDeduct === 0，验证邀请人那一侧照常扣回。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitee, orderId } = await setupRewardedInvite(stores);

    const inviteeBefore = await readState(admin, invitee.id);
    expect(inviteeBefore.balance).toBeGreaterThan(0);
    // 花光全部余额，让订单侧无可扣。
    await admin.recordAiUsage({
      userId: invitee.id,
      username: invitee.username,
      capability: "图片生成",
      provider: "AI_IMAGE",
      model: "vod-og25-sunburst-medium",
      status: "success",
      outputUnits: 1,
      chargedCredits: inviteeBefore.balance,
    });
    const drained = await readState(admin, invitee.id);
    expect(drained.balance).toBe(0);

    const authorization = await getAdminAuthorization(auth);
    const refund = await admin.handleAdminApiRequest(
      "POST",
      `/orders/${orderId}/refund`,
      authorization,
      { confirmation: "CONFIRM_REFUND_ORDER", reason: "测试余额花光后退款" }
    );
    expect(refund.status).toBe(200);

    // ⭐ 关键：邀请人分文未花，必须被全额扣回，不能因为被邀请人没钱就放过他。
    const inviterAfter = await readState(admin, inviter.id);
    expect(inviterAfter.clawbackLedger.map((entry) => entry.delta)).toEqual([
      -INVITE_REWARD_CONFIG.inviterCredits,
    ]);
    expect(inviterAfter.inviteBatches[0].remainingCredits).toBe(0);
    expect(inviterAfter.inviteBatches[0].status).toBe("refunded");
  });

  it("没有邀请关系的普通订单退款不受影响", async () => {
    /*
     * 回归保护：新加的扣回逻辑跑在每一次退款上，
     * 必须确认它对「压根没有邀请关系」的订单是彻底的 no-op，
     * 不会误扣、不会写出莫名其妙的台账条目。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;
    const solo = await register(auth, { username: "solo@example.com", ip: "10.9.9.9" });
    const orderId = await purchase(admin, { userId: solo.id, username: solo.username });

    const authorization = await getAdminAuthorization(auth);
    const refund = await admin.handleAdminApiRequest(
      "POST",
      `/orders/${orderId}/refund`,
      authorization,
      { confirmation: "CONFIRM_REFUND_ORDER", reason: "无邀请关系退款" }
    );
    expect(refund.status).toBe(200);

    const after = await readState(admin, solo.id);
    expect(after.inviteBatches.length).toBe(0);
    expect(after.clawbackLedger.length).toBe(0);
    expect(after.balance).toBeGreaterThanOrEqual(0);
  });
});
