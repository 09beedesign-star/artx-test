import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_CYCLES, MEMBERSHIP_PLANS } from "../shared/billing-config";

/**
 * 锁死「user.credits 与 creditBatches 是同一笔账」。
 *
 * 背景：`5e84fc7` 把会员积分改成按月发放时只改了批次侧，
 * user.credits / order.issuedCredits / 退款扣回 / 经营看板仍按
 * expectedCredits（= 月额度 × 周期月数）走，导致年卡余额虚增
 * （Pro 年卡 +308,000，Business 年卡 +2,860,000）且虚增部分可被消费。
 *
 * 这个文件测的是**两套账在各条路径上必须相等**，而不是某个具体数字，
 * 所以调价、改周期都不需要动它；只有重新把「一次性发全额」写回去才会挂。
 */

let dataDir = "";

async function loadAdminStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./admin-store");
}

async function getAdminAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const result = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(result.status).toBe(200);
  return `Bearer ${(result.body as { token: string }).token}`;
}

type RawAdminData = {
  users: Array<{ id: string; credits: number; membership?: { monthlyCredits: number; totalPeriods: number; issuedPeriods: number } }>;
  orders: Array<{ id: string; expectedCredits: number; issuedCredits: number; status: string }>;
  creditBatches?: Array<{ userId: string; kind: string; source: string; initialCredits: number; remainingCredits: number; status: string }>;
  credits: Array<{ userId: string; type: string; delta: number; source: string }>;
};

/** 直接读磁盘上的原始账本，绕开任何展示层加工。 */
async function readRawAdminData(): Promise<RawAdminData> {
  const raw = await readFile(path.join(dataDir, "admin-data.json"), "utf8");
  return JSON.parse(raw) as RawAdminData;
}

async function purchaseMembership(
  admin: Awaited<ReturnType<typeof loadAdminStore>>,
  params: { userId: string; username: string; planId: string; cycleId: string }
) {
  const created = await admin.createBillingOrder({
    userId: params.userId,
    username: params.username,
    planId: params.planId,
    cycleId: params.cycleId,
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

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-membership-credit-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD;
});

describe("会员积分：user.credits 必须与 creditBatches 同账", () => {
  /**
   * 主断言。用**年卡**而不是月卡：月卡的「首期额度」和「全周期总额」
   * 恰好相等，把按月发放改回一次性发全额，月卡场景照样全绿 ——
   * 必须选差异被放大的周期才锁得住。
   */
  it("年卡支付后 user.credits 只增加首期额度，且等于批次合计", async () => {
    const admin = await loadAdminStore();
    const orderId = await purchaseMembership(admin, {
      userId: "usr_annual",
      username: "annual@example.com",
      planId: "pro",
      cycleId: "annual",
    });

    const data = await readRawAdminData();
    const user = data.users.find((item) => item.id === "usr_annual");
    expect(user).toBeTruthy();

    const plan = MEMBERSHIP_PLANS.find((item) => item.id === "pro")!;
    const months = BILLING_CYCLES.find((item) => item.id === "annual")!.months;

    const batches = (data.creditBatches || []).filter((batch) => batch.userId === "usr_annual");
    const batchTotal = batches.reduce((sum, batch) => sum + batch.remainingCredits, 0);

    // ① 只发了一期批次
    expect(batches).toHaveLength(1);
    expect(batches[0].initialCredits).toBe(plan.monthlyCredits);

    // ② 两套账严格相等 —— 这是本文件的核心
    expect(user!.credits).toBe(batchTotal);

    // ③ 反向断言：绝不能等于全周期总额。
    //    少了这条，把实现改回 `user.credits += order.expectedCredits`
    //    时上面两条仍可能因为别处兜底而侥幸通过。
    expect(user!.credits).not.toBe(plan.monthlyCredits * months);
    expect(user!.credits).toBe(plan.monthlyCredits);
  });

  it("order.issuedCredits 记录的是实发而不是订单总额度", async () => {
    const admin = await loadAdminStore();
    const orderId = await purchaseMembership(admin, {
      userId: "usr_issued",
      username: "issued@example.com",
      planId: "creator",
      cycleId: "annual",
    });

    const data = await readRawAdminData();
    const order = data.orders.find((item) => item.id === orderId);
    expect(order).toBeTruthy();

    const plan = MEMBERSHIP_PLANS.find((item) => item.id === "creator")!;
    expect(order!.issuedCredits).toBe(plan.monthlyCredits);
    // expectedCredits 保持订单总额度语义不变（前台要用它展示"全年累计"）
    expect(order!.expectedCredits).toBeGreaterThan(order!.issuedCredits);
  });

  it("积分流水的 delta 合计等于 user.credits，账实相符", async () => {
    const admin = await loadAdminStore();
    await purchaseMembership(admin, {
      userId: "usr_ledger",
      username: "ledger@example.com",
      planId: "studio",
      cycleId: "quarterly",
    });

    const data = await readRawAdminData();
    const user = data.users.find((item) => item.id === "usr_ledger")!;
    const ledgerTotal = data.credits
      .filter((entry) => entry.userId === "usr_ledger")
      .reduce((sum, entry) => sum + entry.delta, 0);
    expect(ledgerTotal).toBe(user.credits);
  });

  /**
   * 充值订单必须**不受影响** —— 它本来就是一次性到账。
   * 这是一条正向保护断言：防止"修复虚增"时一刀切地把所有订单都按月拆，
   * 把充值也误伤成分期到账。
   */
  it("充值订单仍然一次性全额入账，不被按月拆分", async () => {
    const admin = await loadAdminStore();
    const created = await admin.createCreditRechargeOrder({
      userId: "usr_recharge",
      username: "recharge@example.com",
      packageId: undefined,
      amount: 100,
      paymentMethod: "wechat",
    } as never);
    expect(created.status).toBe(200);
    const order = (created.body as { order: { id: string; credits?: number } }).order;

    const pending = await admin.getBillingOrderForPayment(order.id);
    const paid = await admin.markBillingOrderPaid({
      orderId: order.id,
      actorName: "test-runner",
      expectedAmountCents: (pending as { amountCents?: number } | undefined)?.amountCents,
    });
    expect(paid.status).toBe(200);

    const data = await readRawAdminData();
    const stored = data.orders.find((item) => item.id === order.id)!;
    // 充值：实发 === 预期，一分不少
    expect(stored.issuedCredits).toBe(stored.expectedCredits);

    const user = data.users.find((item) => item.id === "usr_recharge")!;
    const batchTotal = (data.creditBatches || [])
      .filter((batch) => batch.userId === "usr_recharge")
      .reduce((sum, batch) => sum + batch.remainingCredits, 0);
    expect(user.credits).toBe(batchTotal);
  });

  /**
   * 补发路径同样要维持同账，并把 issuedCredits 累加上去。
   * 后者是退款扣回的依据：只写首期会导致「用了 5 个月后退款只扣回 1 个月」。
   */
  it("按月补发后两套账仍然相等，且 issuedCredits 随之累加", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T00:00:00.000Z"));

    const admin = await loadAdminStore();
    const orderId = await purchaseMembership(admin, {
      userId: "usr_issue",
      username: "issue@example.com",
      planId: "lite",
      cycleId: "annual",
    });

    const plan = MEMBERSHIP_PLANS.find((item) => item.id === "lite")!;

    // 跨过 3 个月：应补发第 2、3、4 期
    vi.setSystemTime(new Date("2026-04-10T00:00:00.000Z"));
    const authorization = await getAdminAuthorization();
    await admin.handleAdminApiRequest("GET", "overview", authorization, {});

    const data = await readRawAdminData();
    const user = data.users.find((item) => item.id === "usr_issue")!;
    const activeBatches = (data.creditBatches || []).filter(
      (batch) => batch.userId === "usr_issue" && batch.status === "active"
    );
    const batchTotal = activeBatches.reduce((sum, batch) => sum + batch.remainingCredits, 0);

    // 补发确实发生了（不止首期）
    expect((data.creditBatches || []).filter((batch) => batch.userId === "usr_issue").length).toBeGreaterThan(1);

    // ① 两套账仍然相等 —— 补发路径不能破坏同账
    expect(user.credits).toBe(batchTotal);

    /*
     * ② issuedCredits 是**累计实发**，等于 monthlyCredits × 已发期数，
     *    与"当前余额"是两个不同的量，不要写成 toBe(user.credits)。
     *
     * 跨 3 个月后共发 4 期 = 32,000，但滚存封顶
     * （MEMBERSHIP_ROLLOVER_PERIODS + 1 期额度）会把超出部分立即过期，
     * 所以余额只剩 16,000。**这是设计内的正确行为**，不是掉账：
     * 封顶的意义就是防止会员积分变成永不过期的囤积工具。
     * 因此这里只能断言「累计实发 ≥ 当前余额」。
     */
    const order = data.orders.find((item) => item.id === orderId)!;
    const issuedPeriods = user.membership!.issuedPeriods;
    expect(issuedPeriods).toBeGreaterThan(1);
    expect(order.issuedCredits).toBe(plan.monthlyCredits * issuedPeriods);
    expect(order.issuedCredits).toBeGreaterThanOrEqual(user.credits);
  });

  /**
   * 源码层防护：markBillingOrderPaid 里不能再出现
   * `user.credits += order.expectedCredits` 这种写法。
   *
   * ⚠️ 行为层断言会被下游兜底（enforceMembershipRolloverCap 会把超额
   * 部分清掉）遮蔽，所以必须补一层源码断言直接钉死写法。
   * 先剥注释，否则会命中上面那段解释历史问题的文字。
   */
  it("源码层：支付路径不得直接用 expectedCredits 记账", async () => {
    const source = await readFile(path.join(__dirname, "admin-store.ts"), "utf8");
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    const paidBlock = stripped.slice(stripped.indexOf("export async function markBillingOrderPaid"));
    expect(paidBlock).not.toMatch(/user\.credits\s*\+=\s*order\.expectedCredits/);
    expect(paidBlock).not.toMatch(/issuedCredits\s*=\s*order\.expectedCredits/);
    expect(paidBlock).toMatch(/resolveOrderCreditsIssuedAtPayment\(order\)/);
  });
});
