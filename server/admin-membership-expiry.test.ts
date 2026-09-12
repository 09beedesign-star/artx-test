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

/**
 * 续费语义锁 —— 产品已确认采用「顺延」，本组用例负责钉死它。
 *
 * 这里刻意不用源码扫描，而用行为断言：「从付款日重算」这个错误实现在
 * 单次续费上很难和顺延区分（差异只有几天，容易被误当成时区/取整问题），
 * 但在**同日连续续费**上差异是成倍的、无法狡辩的 —— 顺延得到 N 个周期，
 * 重算恒定只得到 1 个周期。
 */
describe("续费语义锁：必须顺延，不得从付款日重算", () => {
  it("同一天连续续费 3 次，时长必须累加而不是被覆盖", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-stacking";

    for (let i = 0; i < 3; i += 1) {
      await purchaseMembership(admin, {
        userId,
        username: "stack@example.com",
        planId: "lite",
        cycleId: "monthly",
      });
    }

    const user = await findUser(admin, authorization, userId);
    // 顺延：3/1 + 1 + 1 + 1 = 6/1。若改成从付款日重算，这里会是 4/1。
    expect(user.planExpiresAt).toBe("2026-06-01T00:00:00.000Z");
    expect(user.planExpiresAt).not.toBe("2026-04-01T00:00:00.000Z");
  });

  it("提前续费不得损失剩余天数：续费后剩余天数 >= 续费前剩余 + 新周期", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-no-loss";

    await purchaseMembership(admin, {
      userId,
      username: "noloss@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    // 仅过去 1 天就续费，此时还剩 30 天。
    vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
    const before = await findUser(admin, authorization, userId);
    const remainingBefore = before.planRemainingDays as number;
    expect(remainingBefore).toBe(30);

    await purchaseMembership(admin, {
      userId,
      username: "noloss@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    const after = await findUser(admin, authorization, userId);
    // 顺延后剩余天数必须把原来的 30 天保住，再叠加新周期。
    // 从付款日重算的话这里只会是 31 天左右，剩余的 30 天被吞掉。
    expect(after.planRemainingDays as number).toBeGreaterThan(remainingBefore);
    expect(after.planExpiresAt).toBe("2026-05-01T00:00:00.000Z");
  });

  it("年卡提前续费同样顺延，按 12 个月往后接", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-membership-yearly-renew";

    await purchaseMembership(admin, {
      userId,
      username: "yearly@example.com",
      planId: "lite",
      cycleId: "annual",
    });
    const first = await findUser(admin, authorization, userId);
    expect(first.planExpiresAt).toBe("2027-03-01T00:00:00.000Z");

    // 还剩大半年就续费，新到期日应为 2028-03-01。
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    await purchaseMembership(admin, {
      userId,
      username: "yearly@example.com",
      planId: "lite",
      cycleId: "annual",
    });

    const renewed = await findUser(admin, authorization, userId);
    expect(renewed.planExpiresAt).toBe("2028-03-01T00:00:00.000Z");
    expect(renewed.planExpiresAt).not.toBe("2027-06-01T00:00:00.000Z");
  });
});

/**
 * 【融合语义锁】会员批次有效期 = min(滚存有效期, 会员到期日)
 *
 * 这组用例守护的是 feature/credit-gifting 与 main 合并时的融合结果。
 * 当时两边各实现了一半，**任何一边单独存在都是错的**：
 *
 *   只留滚存侧：批次一律「发放日 + 2 个月」，会员没了积分还在 → 规则三失效
 *   只留会员侧：批次一律拉齐到账号会员到期日，年卡 = 一年后 → 滚存封顶失效
 *
 * ⚠️ **必须用年卡验证**。月卡下「发放日+2月」与「会员到期日」相差不大，
 * 两种错误实现都能蒙混过关；年卡把差距放大到 10 个月，无从狡辩。
 */
describe("融合语义锁：会员批次有效期取 min(滚存, 会员到期日)", () => {
  it("年卡首期批次受滚存约束，不得跟着会员到期日跑到一年后", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-fusion-annual";

    await purchaseMembership(admin, {
      userId,
      username: "fusion-annual@example.com",
      planId: "lite",
      cycleId: "annual",
    });

    const user = await findUser(admin, authorization, userId);
    expect(user.planExpiresAt).toBe("2027-03-01T00:00:00.000Z");

    const snapshot = await admin.getBillingSnapshotForUser(userId) as {
      creditBatches: Array<{ kind: string; expiresAt?: string }>;
    };
    const membershipBatch = snapshot.creditBatches.find((batch) => batch.kind === "membership");
    expect(membershipBatch).toBeTruthy();

    // 滚存侧更早（2026-05-01），必须胜出。
    expect(membershipBatch!.expiresAt).toBe("2026-05-01T00:00:00.000Z");
    // 反向断言：这正是「只取会员侧」会产出的错误值。
    expect(membershipBatch!.expiresAt).not.toBe("2027-03-01T00:00:00.000Z");
  });

  it("月卡批次受会员到期日约束，不得靠滚存多活一个月", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const authorization = await getAdminAuthorization();
    const userId = "user-fusion-monthly";

    await purchaseMembership(admin, {
      userId,
      username: "fusion-monthly@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    const user = await findUser(admin, authorization, userId);
    expect(user.planExpiresAt).toBe("2026-04-01T00:00:00.000Z");

    const snapshot = await admin.getBillingSnapshotForUser(userId) as {
      creditBatches: Array<{ kind: string; expiresAt?: string }>;
    };
    const membershipBatch = snapshot.creditBatches.find((batch) => batch.kind === "membership");

    // 会员到期日更早（2026-04-01），必须胜出。
    expect(membershipBatch!.expiresAt).toBe("2026-04-01T00:00:00.000Z");
    // 反向断言：这正是「只取滚存侧」会产出的错误值——积分比会员多活一个月。
    expect(membershipBatch!.expiresAt).not.toBe("2026-05-01T00:00:00.000Z");
  });

  /**
   * 续费顺延不得撤销滚存封顶。
   *
   * 早期实现把所有批次无条件拉齐到新会员到期日，在按月发放模型下
   * 等于让第 1 期积分跟着年卡活满一年，用户按月续费即可无限囤积。
   */
  it("续费顺延时，老批次仍受自己的滚存有效期封顶", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const userId = "user-fusion-renew";

    await purchaseMembership(admin, {
      userId,
      username: "fusion-renew@example.com",
      planId: "lite",
      cycleId: "monthly",
    });

    // 同月再续一次年卡，会员到期日被顺延到 2027-04-01。
    await purchaseMembership(admin, {
      userId,
      username: "fusion-renew@example.com",
      planId: "lite",
      cycleId: "annual",
    });

    const snapshot = await admin.getBillingSnapshotForUser(userId) as {
      creditBatches: Array<{ kind: string; createdAt?: string; expiresAt?: string }>;
    };
    const membershipBatches = snapshot.creditBatches.filter((batch) => batch.kind === "membership");
    expect(membershipBatches.length).toBeGreaterThan(0);

    for (const batch of membershipBatches) {
      // 任何一期都不得超过「自己的发放日 + 2 个月」。
      const issuedMs = Date.parse(batch.createdAt || "2026-03-01T00:00:00.000Z");
      const cap = new Date(issuedMs);
      cap.setUTCMonth(cap.getUTCMonth() + 2);
      expect(Date.parse(batch.expiresAt!)).toBeLessThanOrEqual(cap.getTime());
      // 具体地说，绝不允许被拉到一年后。
      expect(batch.expiresAt).not.toBe("2027-04-01T00:00:00.000Z");
    }
  });
});
