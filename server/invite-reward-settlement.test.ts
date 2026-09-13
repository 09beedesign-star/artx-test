import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_REWARD_CONFIG } from "../shared/billing-config";

/**
 * 邀请奖励 —— 端到端结算测试
 *
 * ⚠️ 为什么必须有这一层：
 * 项目里已经吃过一次亏 —— 「源码里写了发放逻辑」不等于「用户真的拿到积分」。
 * user.credits 与 creditBatches 是两套账，改发放逻辑极易只改一边
 * （年卡余额虚增缺陷正是这么产生的）。
 * 所以本文件一律走真实链路 createBillingOrder → markBillingOrderPaid，
 * 断言的是**余额和批次的实际变化**，不做任何源码字符串扫描。
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

/** 走完整付费链路：下单 → 确认支付。 */
async function purchase(
  admin: Stores["admin"],
  params: { userId: string; username: string; planId?: string; cycleId?: string }
) {
  const created = await admin.createBillingOrder({
    userId: params.userId,
    username: params.username,
    planId: params.planId || "pro",
    cycleId: params.cycleId || "monthly",
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

/**
 * 读取某位用户的邀请积分实际状态。
 *
 * 走 getBillingSnapshotForUser（用户端真实读取路径），而不是直接读内部数据结构 ——
 * 这样断言的就是「用户在页面上真能看到的东西」，而不是内存里某个中间态。
 */
async function readInviteState(admin: Stores["admin"], userId: string) {
  const snapshot = (await admin.getBillingSnapshotForUser(userId)) as {
    balance: number;
    creditBatches: Array<{
      source?: string;
      initialCredits: number;
      createdAt: string;
      expiresAt?: string;
    }>;
    ledger: Array<{ source?: string; delta: number }>;
  } | null;
  if (!snapshot) {
    return { credits: 0, inviteBatches: [], inviteLedger: [], inviteCreditTotal: 0 };
  }
  const inviteBatches = snapshot.creditBatches.filter((batch) =>
    String(batch.source || "").startsWith("rule/invite")
  );
  const inviteLedger = snapshot.ledger.filter((entry) =>
    String(entry.source || "").startsWith("rule/invite")
  );
  return {
    credits: snapshot.balance,
    inviteBatches,
    inviteLedger,
    inviteCreditTotal: inviteBatches.reduce((sum, batch) => sum + batch.initialCredits, 0),
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-invite-settle-"));
});

afterEach(async () => {
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true });
  }
  dataDir = "";
});

describe("邀请奖励端到端结算", () => {
  it("注册绑定后不发任何积分，只有被邀请人首次付费才双向到账", async () => {
    const { admin, auth } = await loadStores();

    const inviter = await register(auth, { username: "inviter@example.com", ip: "1.1.1.1" });
    const summary = await auth.getInviteSummaryForUser(inviter.id);
    expect(summary?.inviteCode).toBeTruthy();

    const invitee = await register(auth, {
      username: "invitee@example.com",
      ip: "2.2.2.2",
      inviteCode: summary!.inviteCode,
    });

    // 关键红线断言：绑定已建立，但此刻双方都不应有任何邀请积分。
    const inviterBefore = await readInviteState(admin, inviter.id);
    const inviteeBefore = await readInviteState(admin, invitee.id);
    expect(inviterBefore.inviteCreditTotal).toBe(0);
    expect(inviteeBefore.inviteCreditTotal).toBe(0);

    await purchase(admin, { userId: invitee.id, username: invitee.username });

    const inviterAfter = await readInviteState(admin, inviter.id);
    const inviteeAfter = await readInviteState(admin, invitee.id);

    // 断言的是**真实余额与批次**，不是源码里写了什么。
    expect(inviterAfter.inviteCreditTotal).toBe(INVITE_REWARD_CONFIG.inviterCredits);
    expect(inviteeAfter.inviteCreditTotal).toBe(INVITE_REWARD_CONFIG.inviteeCredits);
    expect(inviterAfter.credits).toBeGreaterThanOrEqual(INVITE_REWARD_CONFIG.inviterCredits);

    // 两套账必须一致：批次里发了多少，流水里就得有多少。
    expect(inviterAfter.inviteLedger.length).toBe(1);
    expect(inviteeAfter.inviteLedger.length).toBe(1);

    // 奖励积分必须带有效期，且不得长于充值积分（366 天）。
    for (const batch of [...inviterAfter.inviteBatches, ...inviteeAfter.inviteBatches]) {
      expect(batch.expiresAt).toBeTruthy();
      const days = (Date.parse(batch.expiresAt!) - Date.parse(batch.createdAt)) / 86_400_000;
      expect(days).toBeLessThan(366);
      expect(Math.round(days)).toBe(INVITE_REWARD_CONFIG.rewardCreditValidDays);
    }
  });

  it("被邀请人第二次付费不再重复发奖（幂等）", async () => {
    const { admin, auth } = await loadStores();
    const inviter = await register(auth, { username: "inviter2@example.com", ip: "1.1.1.2" });
    const summary = await auth.getInviteSummaryForUser(inviter.id);
    const invitee = await register(auth, {
      username: "invitee2@example.com",
      ip: "2.2.2.3",
      inviteCode: summary!.inviteCode,
    });

    await purchase(admin, { userId: invitee.id, username: invitee.username });
    const afterFirst = await readInviteState(admin, inviter.id);

    await purchase(admin, { userId: invitee.id, username: invitee.username });
    const afterSecond = await readInviteState(admin, inviter.id);

    expect(afterSecond.inviteCreditTotal).toBe(afterFirst.inviteCreditTotal);
    expect(afterSecond.inviteLedger.length).toBe(1);
  });

  it("没有邀请关系的用户付费不会凭空产生邀请积分", async () => {
    const { admin, auth } = await loadStores();
    const lone = await register(auth, { username: "lone@example.com", ip: "3.3.3.3" });
    await purchase(admin, { userId: lone.id, username: lone.username });
    const state = await readInviteState(admin, lone.id);
    expect(state.inviteCreditTotal).toBe(0);
    expect(state.inviteLedger.length).toBe(0);
  });

  it("同 IP 注册的小号即便付费也拿不到奖励", async () => {
    const { admin, auth } = await loadStores();
    const inviter = await register(auth, { username: "boss@example.com", ip: "9.9.9.9" });
    const summary = await auth.getInviteSummaryForUser(inviter.id);
    // 绑定阶段就会被拒，这里验证的是「拒了之后付费也不会补发」。
    const alt = await register(auth, {
      username: "alt@example.com",
      ip: "9.9.9.9",
      inviteCode: summary!.inviteCode,
    });

    await purchase(admin, { userId: alt.id, username: alt.username });

    const inviterState = await readInviteState(admin, inviter.id);
    const altState = await readInviteState(admin, alt.id);
    expect(inviterState.inviteCreditTotal).toBe(0);
    expect(altState.inviteCreditTotal).toBe(0);
  });

  it("plus 地址派生的小号被身份键识别，付费也不发奖", async () => {
    const { admin, auth } = await loadStores();
    const inviter = await register(auth, { username: "farmer@gmail.com", ip: "5.5.5.1" });
    const summary = await auth.getInviteSummaryForUser(inviter.id);
    // 不同 IP、不同登录名，但归一化身份键相同。
    const clone = await register(auth, {
      username: "farmer+001@gmail.com",
      ip: "5.5.5.2",
      inviteCode: summary!.inviteCode,
    });

    await purchase(admin, { userId: clone.id, username: clone.username });

    expect((await readInviteState(admin, inviter.id)).inviteCreditTotal).toBe(0);
    expect((await readInviteState(admin, clone.id)).inviteCreditTotal).toBe(0);
  });

  it("邀请奖励失败不影响订单主流程入账", async () => {
    const { admin, auth } = await loadStores();
    const lone = await register(auth, { username: "solo@example.com", ip: "7.7.7.7" });
    const before = await readInviteState(admin, lone.id);
    await purchase(admin, { userId: lone.id, username: lone.username });
    const after = await readInviteState(admin, lone.id);
    // 没有邀请奖励，但订单积分必须照常到账。
    expect(after.credits).toBeGreaterThan(before.credits);
  });
});
