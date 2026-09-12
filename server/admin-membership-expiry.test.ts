import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_PLAN_DISPLAY_NAME } from "../shared/billing-config";

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

/** 走完「下单 → 记录支付 → 确认支付」的完整链路，返回订单 id。 */
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

/**
 * 读取用户的展示态数据。
 *
 * ⚠️ 每次都重新登录换 token：本文件大量使用假时间跨越数周，
 * 早先签发的管理会话会过期，复用旧 authorization 会拿到 401、
 * body 里没有 users 字段，报成 "Cannot read properties of undefined"。
 */
async function findUser(
  admin: Awaited<ReturnType<typeof loadAdminStore>>,
  _authorization: string,
  userId: string
) {
  const authorization = await getAdminAuthorization();
  const result = await admin.handleAdminApiRequest("GET", "overview", authorization, {});
  const users = (result.body as {
    users: Array<{
      id: string;
      plan: string;
      planExpiresAt?: string;
      planRemainingDays?: number;
      planExpiringSoon?: boolean;
      previousPlan?: string;
    }>;
  }).users;
  const user = users.find((item) => item.id === userId);
  expect(user).toBeTruthy();
  return user!;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-membership-expiry-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dataDir, { recursive: true, force: true });
  for (const key of [
    "ARTX_ADMIN_DATA_BACKEND",
    "ARTX_AUTH_DATA_BACKEND",
    "ARTX_DATA_DIR",
    "ADMIN_SESSION_SECRET",
    "ARTX_BOOTSTRAP_ADMIN_USERNAME",
    "ARTX_BOOTSTRAP_ADMIN_PASSWORD",
  ]) delete process.env[key];
});

describe("会员到期与积分同步失效", () => {
  it("购买月度会员会写入 planExpiresAt，且与会员积分批次到期日一致", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-1";

    await purchaseMembership(admin, {
      userId,
      username: "member1@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    const snapshot = await admin.getBillingSnapshotForUser(userId) as {
      creditBatches: Array<{ kind: string; expiresAt?: string; remainingCredits: number }>;
    };
    const membershipBatch = snapshot.creditBatches.find((batch) => batch.kind === "membership");
    expect(membershipBatch).toBeTruthy();

    const user = await findUser(admin, authorization, userId);
    expect(user.planExpiresAt).toBe("2026-04-01T00:00:00.000Z");
    // 账号档位与积分批次必须同源，否则会出现「积分过期了但账号还是付费档」。
    expect(membershipBatch!.expiresAt).toBe(user.planExpiresAt);
  });

  it("会员到期后 plan 降级为 Free，同时会员积分清零", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const userId = "user-membership-expire";

    await purchaseMembership(admin, {
      userId,
      username: "expire@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    const before = await admin.getBillingSnapshotForUser(userId) as { balance: number };
    expect(before.balance).toBeGreaterThan(0);

    // 跨过到期日后重新加载数据，触发惰性过期。
    vi.setSystemTime(new Date("2026-04-02T00:00:00.000Z"));
    const authorization = await getAdminAuthorization();
    const user = await findUser(admin, authorization, userId);

    expect(user.plan).toBe(FREE_PLAN_DISPLAY_NAME);
    expect(user.previousPlan).toBe("Lite 入门版");
    // 降级后不再保留到期时间，避免被重复判定。
    expect(user.planExpiresAt).toBeUndefined();

    const after = await admin.getBillingSnapshotForUser(userId) as { balance: number };
    expect(after.balance).toBe(0);
  });

  it("提前续费按原到期日顺延，而不是从付款日重算", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-renew";

    await purchaseMembership(admin, {
      userId,
      username: "renew@example.com",
      planId: "lite",
      cycleId: "monthly",
    });
    const first = await findUser(admin, authorization, userId);
    expect(first.planExpiresAt).toBe("2026-04-01T00:00:00.000Z");

    // 到期前 10 天续费：新到期日应为 4/1 再加一个月，而不是 3/22 加一个月。
    vi.setSystemTime(new Date("2026-03-22T00:00:00.000Z"));
    await purchaseMembership(admin, {
      userId,
      username: "renew@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    const renewed = await findUser(admin, authorization, userId);
    expect(renewed.planExpiresAt).toBe("2026-05-01T00:00:00.000Z");

    // 上一周期未用完的会员积分必须一起顺延，否则会在会员仍有效时提前过期。
    const snapshot = await admin.getBillingSnapshotForUser(userId) as {
      creditBatches: Array<{ kind: string; expiresAt?: string; status: string }>;
    };
    const membershipBatches = snapshot.creditBatches.filter((batch) => batch.kind === "membership" && batch.status === "active");
    expect(membershipBatches.length).toBe(2);
    for (const batch of membershipBatches) {
      expect(batch.expiresAt).toBe("2026-05-01T00:00:00.000Z");
    }
  });

  it("已过期后再购买从付款日重新起算，不补偿断档期", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-lapsed";

    await purchaseMembership(admin, {
      userId,
      username: "lapsed@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    // 到期两个月后才回来续费。
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    await purchaseMembership(admin, {
      userId,
      username: "lapsed@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    const user = await findUser(admin, authorization, userId);
    expect(user.planExpiresAt).toBe("2026-07-01T00:00:00.000Z");
    expect(user.plan).toBe("Lite 入门版");
  });

  it("年度会员按 12 个月计算到期时间", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-annual";

    await purchaseMembership(admin, {
      userId,
      username: "annual@example.com",
      planId: "lite",
      cycleId: "annual",
    });

    const user = await findUser(admin, authorization, userId);
    expect(user.planExpiresAt).toBe("2027-03-01T00:00:00.000Z");
  });

  it("积分充值不写入会员到期时间，Free 用户没有剩余天数", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-recharge-only";

    const created = await admin.createCreditRechargeOrder({
      userId,
      username: "recharge@example.com",
      amount: 50,
      paymentMethod: "wechat",
    });
    expect(created.status).toBe(200);
    const orderId = (created.body as { order: { id: string } }).order.id;
    const pending = await admin.getBillingOrderForPayment(orderId);
    await admin.markBillingOrderPaid({
      orderId,
      actorName: "test-runner",
      expectedAmountCents: (pending as { amountCents?: number } | undefined)?.amountCents,
      providerTransactionId: `txn_${orderId}`,
      eventType: "test_confirm",
    });

    const user = await findUser(admin, authorization, userId);
    // 充值只给积分不给会员身份，没有到期概念。
    expect(user.planExpiresAt).toBeUndefined();
    expect(user.planRemainingDays).toBeUndefined();
    expect(user.planExpiringSoon).toBe(false);
  });

  it("临近到期会标记 planExpiringSoon 并给出剩余天数", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const userId = "user-membership-soon";

    await purchaseMembership(admin, {
      userId,
      username: "soon@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    // 到期前 3 天。
    vi.setSystemTime(new Date("2026-03-29T00:00:00.000Z"));
    const authorization = await getAdminAuthorization();
    const user = await findUser(admin, authorization, userId);

    expect(user.planExpiringSoon).toBe(true);
    expect(user.planRemainingDays).toBe(3);
    expect(user.plan).toBe("Lite 入门版");
  });
});
