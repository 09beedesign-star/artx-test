import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_REWARD_CONFIG, validateInviteRewardConfig } from "../shared/billing-config";
import {
  buildInviteReportCsv,
  clampCommissionRate,
  estimateDirectCommissionHkd,
  MAX_COMMISSION_RATE_PERCENT,
  type InviteReportInviter,
} from "../client/src/pages/invite-admin-report";

/**
 * 后台「邀请管理」测试（2026-09-28 新增）
 *
 * 🔒🔒🔒 最重要的一条：**只统计一层**（A→B→C 时 C 不得出现在 A 的任何数字里）。
 * 用户原话：「绝对不能违反类似于传销组织的三层定律」。
 * 《禁止传销条例》第七条把「以下线业绩为依据给上线计酬」（团队计酬）列为传销，
 * 所以分成基数只能是**直接**邀请用户自己的付费。
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

async function adminAuth(auth: Stores["auth"]) {
  const result = await auth.handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(result.status).toBe(200);
  return `Bearer ${(result.body as { token: string }).token}`;
}

async function register(auth: Stores["auth"], username: string, ip: string, inviteCode?: string) {
  const result = await auth.handleAuthAction(
    "register",
    { username, password: "secure-password", ...(inviteCode ? { inviteCode } : {}) },
    { ip, userAgent: "vitest" }
  );
  expect(result.status).toBe(200);
  return (result.body as { user: { id: string; username: string } }).user;
}

async function codeOf(auth: Stores["auth"], userId: string) {
  const summary = await auth.getInviteSummaryForUser(userId);
  expect(summary?.inviteCode).toBeTruthy();
  return summary!.inviteCode;
}

async function purchase(admin: Stores["admin"], user: { id: string; username: string }) {
  const created = await admin.createBillingOrder({
    userId: user.id,
    username: user.username,
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

type Report = {
  levels: number;
  config: { inviterCredits: number; inviteeCredits: number };
  totals: { inviterCount: number; inviteeCount: number };
  inviters: InviteReportInviter[];
};

async function getReport(admin: Stores["admin"], authorization: string) {
  const res = await admin.handleAdminApiRequest("GET", "/invites", authorization);
  expect(res.status).toBe(200);
  return res.body as Report;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-invite-report-"));
});
afterEach(async () => {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  dataDir = "";
});

describe("邀请奖励配置校验（后台可改，服务端兜底）", () => {
  const base = { ...INVITE_REWARD_CONFIG };

  it("代码默认值必须能通过校验（否则后台一保存就 400）", () => {
    expect(validateInviteRewardConfig(base)).toEqual([]);
  });

  it("多打一个 0、非整数、零值、门槛低于最便宜套餐都会被拒", () => {
    expect(validateInviteRewardConfig({ ...base, inviterCredits: 3000 }).length).toBeGreaterThan(0);
    expect(validateInviteRewardConfig({ ...base, inviterCredits: 12.5 }).length).toBeGreaterThan(0);
    expect(validateInviteRewardConfig({ ...base, inviteeCredits: 0 }).length).toBeGreaterThan(0);
    expect(validateInviteRewardConfig({ ...base, minPaidAmountHkd: 1 }).length).toBeGreaterThan(0);
    expect(validateInviteRewardConfig({ ...base, bindingValidDays: 365 }).length).toBeGreaterThan(0);
    expect(validateInviteRewardConfig({ ...base, maxRewardedInvitesPerUser: 1000 }).length).toBeGreaterThan(0);
  });

  it("被邀请人奖励不得高于邀请人（否则变成「注册小号领钱」）", () => {
    expect(validateInviteRewardConfig({ ...base, inviterCredits: 100, inviteeCredits: 200 }).length).toBeGreaterThan(0);
  });
});

describe("resolveInviteRewardConfig 版本化回落", () => {
  it("库里没存 / 版本落后 / 值不合规 → 一律回落代码默认", async () => {
    const { admin } = await loadStores();
    const defaults = admin.resolveInviteRewardConfig(undefined);
    expect(defaults.inviterCredits).toBe(INVITE_REWARD_CONFIG.inviterCredits);

    const stale = admin.resolveInviteRewardConfig({
      ...defaults,
      inviterCredits: 400,
      configVersion: INVITE_REWARD_CONFIG.configVersion - 1,
    });
    expect(stale.inviterCredits).toBe(INVITE_REWARD_CONFIG.inviterCredits);

    const invalid = admin.resolveInviteRewardConfig({
      ...defaults,
      inviterCredits: 999999,
      configVersion: INVITE_REWARD_CONFIG.configVersion,
    });
    expect(invalid.inviterCredits).toBe(INVITE_REWARD_CONFIG.inviterCredits);

    const ok = admin.resolveInviteRewardConfig({
      ...defaults,
      inviterCredits: 400,
      configVersion: INVITE_REWARD_CONFIG.configVersion,
    });
    expect(ok.inviterCredits).toBe(400);
  });
});

describe("🔒 邀请关系报表只统计一层（防团队计酬）", () => {
  it("⭐⭐⭐ A→B→C：C 的注册与付费绝不计入 A", async () => {
    const { admin, auth } = await loadStores();
    const a = await register(auth, "a@example.com", "10.0.0.1");
    const b = await register(auth, "b@example.com", "10.0.0.2", await codeOf(auth, a.id));
    const c = await register(auth, "c@example.com", "10.0.0.3", await codeOf(auth, b.id));
    // 只有 C（孙辈）付费，B 不付费。
    await purchase(admin, c);

    const report = await getReport(admin, await adminAuth(auth));
    expect(report.levels).toBe(1);

    const rowA = report.inviters.find((row) => row.inviterId === a.id)!;
    const rowB = report.inviters.find((row) => row.inviterId === b.id)!;
    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();

    // A 只看得到 B 一个人，且净付费为 0 —— C 付的钱与 A 无关。
    expect(rowA.invitees.map((row) => row.id)).toEqual([b.id]);
    expect(rowA.directInviteCount).toBe(1);
    expect(rowA.directNetPaidHkd).toBe(0);
    expect(rowA.paidInviteCount).toBe(0);
    expect(estimateDirectCommissionHkd(rowA, 20)).toBe(0);
    // C 的 id 不得出现在 A 行的任何位置。
    expect(JSON.stringify(rowA)).not.toContain(c.id);

    // B 是独立的邀请人，C 的付费只算给 B。
    expect(rowB.invitees.map((row) => row.id)).toEqual([c.id]);
    expect(rowB.directNetPaidHkd).toBeGreaterThan(0);
    expect(rowB.rewardedCount).toBe(1);
    expect(rowB.earnedRewardCredits).toBe(INVITE_REWARD_CONFIG.inviterCredits);

    // 总数按人去重：B、C 各被邀请一次，共 2 人，不会因为「层级」重复计数。
    expect(report.totals.inviteeCount).toBe(2);
  });

  it("邀请人名单与人数：一人邀请多人时全部列出", async () => {
    const { admin, auth } = await loadStores();
    const a = await register(auth, "boss@example.com", "10.2.0.1");
    const code = await codeOf(auth, a.id);
    const x = await register(auth, "x@example.com", "10.2.0.2", code);
    const y = await register(auth, "y@example.com", "10.2.0.3", code);
    await purchase(admin, x);

    const report = await getReport(admin, await adminAuth(auth));
    const rowA = report.inviters.find((row) => row.inviterId === a.id)!;
    expect(rowA.directInviteCount).toBe(2);
    expect(rowA.invitees.map((row) => row.id).sort()).toEqual([x.id, y.id].sort());
    expect(rowA.paidInviteCount).toBe(1);
    const stateOf = (id: string) => rowA.invitees.find((row) => row.id === id)!.state;
    expect(stateOf(x.id)).toBe("rewarded");
    expect(stateOf(y.id)).toBe("pending");
  });
});

describe("后台保存邀请奖励配置", () => {
  it("缺二次确认 409、不合规 400、合规 200 并写审计、对之后的首付生效", async () => {
    const { admin, auth } = await loadStores();
    const authorization = await adminAuth(auth);

    const noConfirm = await admin.handleAdminApiRequest("POST", "/invite-reward-config/save", authorization, {
      inviterCredits: 400,
    });
    expect(noConfirm.status).toBe(409);

    const bad = await admin.handleAdminApiRequest("POST", "/invite-reward-config/save", authorization, {
      confirmation: "CONFIRM_INVITE_REWARD_CONFIG",
      inviterCredits: 30000,
    });
    expect(bad.status).toBe(400);

    const ok = await admin.handleAdminApiRequest("POST", "/invite-reward-config/save", authorization, {
      confirmation: "CONFIRM_INVITE_REWARD_CONFIG",
      inviterCredits: 400,
    });
    expect(ok.status).toBe(200);

    const audit = await admin.handleAdminApiRequest("GET", "/audit-logs", authorization);
    const logs = (audit.body as { auditLogs: Array<{ action: string }> }).auditLogs;
    expect(logs.some((log) => log.action === "更新邀请奖励配置")).toBe(true);

    // 新额度真的被发奖链路消费（不是只存进库）。
    const a = await register(auth, "cfg-a@example.com", "10.3.0.1");
    const b = await register(auth, "cfg-b@example.com", "10.3.0.2", await codeOf(auth, a.id));
    await purchase(admin, b);
    const report = await getReport(admin, authorization);
    expect(report.config.inviterCredits).toBe(400);
    const rowA = report.inviters.find((row) => row.inviterId === a.id)!;
    expect(rowA.earnedRewardCredits).toBe(400);

    // 用户侧邀请面板展示的「已获积分」按实发额，不按人数×当前额度。
    expect(await admin.getInviteEarnedCreditsForUser(a.id)).toBe(400);
  });

  it("⭐ 改过额度后退款，扣回的是当初实发的额度而不是新额度", async () => {
    const { admin, auth } = await loadStores();
    const authorization = await adminAuth(auth);
    const a = await register(auth, "old-a@example.com", "10.4.0.1");
    const b = await register(auth, "old-b@example.com", "10.4.0.2", await codeOf(auth, a.id));
    const orderId = await purchase(admin, b); // 按默认 300 发放

    const saved = await admin.handleAdminApiRequest("POST", "/invite-reward-config/save", authorization, {
      confirmation: "CONFIRM_INVITE_REWARD_CONFIG",
      inviterCredits: 400,
    });
    expect(saved.status).toBe(200);

    const refund = await admin.handleAdminApiRequest("POST", `/orders/${orderId}/refund`, authorization, {
      confirmation: "CONFIRM_REFUND_ORDER",
      reason: "改额度后退款",
    });
    expect(refund.status).toBe(200);

    const snapshot = (await admin.getBillingSnapshotForUser(a.id)) as {
      ledger: Array<{ type: string; delta: number }>;
    };
    const clawback = snapshot.ledger.filter((entry) => entry.type === "邀请奖励扣回");
    expect(clawback.map((entry) => entry.delta)).toEqual([-INVITE_REWARD_CONFIG.inviterCredits]);

    // 风控里不应出现「短缺 100」这种按新额度算出来的假短缺。
    const risk = await admin.handleAdminApiRequest("GET", "/risk-events", authorization);
    const events = (risk.body as { riskEvents: Array<{ title: string }> }).riskEvents;
    expect(events.some((event) => event.title === "邀请奖励扣回短缺")).toBe(false);
  });
});

describe("前端分成估算与导出", () => {
  const inviter = {
    inviterId: "u1",
    inviterName: "=cmd@example.com",
    inviteCode: "ABC",
    inviterStatus: "active",
    acceptDisabled: false,
    directInviteCount: 2,
    paidInviteCount: 1,
    rewardedCount: 1,
    pendingCount: 1,
    remainingQuota: 9,
    directNetPaidHkd: 100,
    earnedRewardCredits: 300,
    invitees: [
      { id: "i1", username: "p@x.com", registeredAt: "", invitedAt: "", status: "active", hasPaid: true,
        state: "rewarded", paidOrders: 1, paidHkd: 100, refundedHkd: 0, netPaidHkd: 100,
        inviterRewardCredits: 300, inviteeRewardCredits: 200 },
      { id: "i2", username: "q@x.com", registeredAt: "", invitedAt: "", status: "active", hasPaid: false,
        state: "pending", paidOrders: 0, paidHkd: 0, refundedHkd: 0, netPaidHkd: 0,
        inviterRewardCredits: 0, inviteeRewardCredits: 0 },
    ],
  } satisfies InviteReportInviter;

  it("分成 = 直接邀请净付费 × 比例，比例封顶 30%", () => {
    expect(estimateDirectCommissionHkd(inviter, 10)).toBe(10);
    expect(estimateDirectCommissionHkd(inviter, 90)).toBe(MAX_COMMISSION_RATE_PERCENT);
    expect(clampCommissionRate(-5)).toBe(0);
    expect(clampCommissionRate("abc")).toBe(0);
  });

  it("CSV 带 BOM、一行一个被邀请人、防公式注入", () => {
    const csv = buildInviteReportCsv([inviter], 10);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines.length).toBe(3);
    expect(lines[1].startsWith("'=cmd@example.com")).toBe(true);
  });
});
