import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

type StoredUser = {
  id: string;
  role?: string;
  plan: string;
  planExpiresAt?: string;
  previousPlan?: string;
  membership?: unknown;
};

function adminDataFile() {
  return path.join(dataDir, "admin-data.json");
}

/**
 * 直接改落库文件注入脏数据。
 *
 * ⚠️ loadAdminData / saveAdminData **没有导出**，且这里要造的正是
 * 「正常业务路径写不出来」的历史脏数据（付费档 + 无到期日 + 无 membership），
 * 所以只能落到文件层。走 API 造不出这种状态 —— 那恰恰说明代码已经修好了。
 */
async function mutateStoredUser(userId: string, patch: Partial<StoredUser>) {
  const raw = JSON.parse(await readFile(adminDataFile(), "utf-8")) as { users: StoredUser[] };
  const user = raw.users.find((item) => item.id === userId);
  expect(user, `注入脏数据失败：落库文件里找不到用户 ${userId}`).toBeTruthy();
  Object.assign(user!, patch);
  await writeFile(adminDataFile(), JSON.stringify(raw, null, 2), "utf-8");
}

async function readStoredUser(userId: string) {
  const raw = JSON.parse(await readFile(adminDataFile(), "utf-8")) as { users: StoredUser[] };
  return raw.users.find((item) => item.id === userId);
}

/** 触发一次惰性维护链（loadAdminData 内部会跑 expireMemberships）。 */
async function runMaintenance(admin: Awaited<ReturnType<typeof loadAdminStore>>) {
  const authorization = await getAdminAuthorization();
  const result = await admin.handleAdminApiRequest("GET", "overview", authorization, {});
  expect(result.status).toBe(200);
  return (result.body as {
    users: Array<{ id: string; plan: string; planExpiresAt?: string; previousPlan?: string; role?: string }>;
  }).users;
}

async function payOrder(
  admin: Awaited<ReturnType<typeof loadAdminStore>>,
  orderId: string
) {
  const pending = await admin.getBillingOrderForPayment(orderId);
  const paid = await admin.markBillingOrderPaid({
    orderId,
    actorName: "test-runner",
    expectedAmountCents: (pending as { amountCents?: number } | undefined)?.amountCents,
    providerTransactionId: `txn_${orderId}`,
    eventType: "test_confirm",
  });
  expect(paid.status).toBe(200);
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-plan-orphan-"));
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

describe("孤儿付费档降级（付费档必须拿得出凭据）", () => {
  it("充值用户被写脏成 Lite 后，会被降回 Free 并留下 previousPlan", async () => {
    const admin = await loadAdminStore();
    const userId = "orphan-recharge-user";

    const created = await admin.createCreditRechargeOrder({
      userId,
      username: "recharge@example.com",
      amount: 50,
      paymentMethod: "wechat",
    });
    expect(created.status).toBe(200);
    await payOrder(admin, (created.body as { order: { id: string } }).order.id);

    // 注入生产库里真实存在的脏状态：付费档字面量 + 无到期日 + 无订阅
    await mutateStoredUser(userId, {
      plan: "Lite 入门版",
      planExpiresAt: undefined,
      membership: undefined,
    });
    expect((await readStoredUser(userId))?.plan).toBe("Lite 入门版");

    const users = await runMaintenance(admin);
    const user = users.find((item) => item.id === userId);
    expect(user?.plan).toBe(FREE_PLAN_DISPLAY_NAME);
    expect(user?.previousPlan).toBe("Lite 入门版");
    // 必须真的落库，否则下次加载又变回 Lite。
    expect((await readStoredUser(userId))?.plan).toBe(FREE_PLAN_DISPLAY_NAME);
  });

  it("零订单账号被写脏成 Pro 也会被降回 Free", async () => {
    const admin = await loadAdminStore();
    const userId = "orphan-pro-user";

    const created = await admin.createCreditRechargeOrder({
      userId,
      username: "orphan-pro@example.com",
      amount: 10,
      paymentMethod: "wechat",
    });
    expect(created.status).toBe(200);

    await mutateStoredUser(userId, {
      plan: "Pro 专业版",
      planExpiresAt: undefined,
      membership: undefined,
    });

    const users = await runMaintenance(admin);
    const user = users.find((item) => item.id === userId);
    expect(user?.plan).toBe(FREE_PLAN_DISPLAY_NAME);
    expect(user?.previousPlan).toBe("Pro 专业版");
  });

  it("⚠️ 反向：角色派发的档位绝不能被孤儿降级误伤", async () => {
    const admin = await loadAdminStore();
    // bootstrap 管理员是 super_admin，档位 Studio，天然无到期日、无订阅 ——
    // 与孤儿的特征完全一致，全靠角色白名单豁免。这条挂了说明白名单被删了。
    const users = await runMaintenance(admin);
    const superAdmin = users.find((item) => item.role === "super_admin");
    expect(superAdmin, "测试环境应存在 bootstrap super_admin").toBeTruthy();
    expect(superAdmin!.plan).toBe("Studio 工作室版");
    expect(superAdmin!.planExpiresAt).toBeUndefined();

    // 反复维护也不能动它
    await runMaintenance(admin);
    const after = (await runMaintenance(admin)).find((item) => item.id === superAdmin!.id);
    expect(after?.plan).toBe("Studio 工作室版");
    expect(after?.previousPlan).toBeUndefined();
  });

  it("⚠️ 反向：订阅进行中的会员绝不能被孤儿降级误伤（哪怕到期日丢了）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const userId = "active-annual-member";

    // 年卡：只丢到期日不丢 membership，必须靠步骤 1 补算出来救回
    const created = await admin.createBillingOrder({
      userId,
      username: "annual@example.com",
      planId: "pro",
      cycleId: "annual",
      paymentMethod: "wechat",
    });
    expect(created.status).toBe(200);
    await payOrder(admin, (created.body as { order: { id: string } }).order.id);

    await mutateStoredUser(userId, { planExpiresAt: undefined });

    const users = await runMaintenance(admin);
    const user = users.find((item) => item.id === userId);
    expect(user?.plan).toBe("Pro 专业版");
    // 到期日被补算成 startedAt + 12 个月，而不是被当成孤儿降级
    expect(user?.planExpiresAt).toBe("2027-03-01T00:00:00.000Z");
    expect(user?.previousPlan).toBeUndefined();
  });
});

describe("充值不授予也不剥夺会员档位", () => {
  it("Free 用户充值后仍是 Free", async () => {
    const admin = await loadAdminStore();
    const userId = "free-recharge-user";

    const created = await admin.createCreditRechargeOrder({
      userId,
      username: "free@example.com",
      amount: 50,
      paymentMethod: "wechat",
    });
    await payOrder(admin, (created.body as { order: { id: string } }).order.id);

    const user = (await runMaintenance(admin)).find((item) => item.id === userId);
    expect(user?.plan).toBe(FREE_PLAN_DISPLAY_NAME);
    expect(user?.planExpiresAt).toBeUndefined();
  });

  it("⚠️ 反向：Pro 会员再充值，档位和到期日都不能被改", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const admin = await loadAdminStore();
    const userId = "pro-then-recharge-user";

    const membership = await admin.createBillingOrder({
      userId,
      username: "pro@example.com",
      planId: "pro",
      cycleId: "monthly",
      paymentMethod: "wechat",
    });
    await payOrder(admin, (membership.body as { order: { id: string } }).order.id);

    let user = (await runMaintenance(admin)).find((item) => item.id === userId);
    expect(user?.plan).toBe("Pro 专业版");
    expect(user?.planExpiresAt).toBe("2026-04-01T00:00:00.000Z");

    // 会员期内再充一笔积分。
    // 曾经的错误实现是「充值订单 → user.plan = Free」，会当场把 Pro 降掉。
    const recharged = await admin.createCreditRechargeOrder({
      userId,
      username: "pro@example.com",
      amount: 50,
      paymentMethod: "wechat",
    });
    await payOrder(admin, (recharged.body as { order: { id: string } }).order.id);

    user = (await runMaintenance(admin)).find((item) => item.id === userId);
    expect(user?.plan).toBe("Pro 专业版");
    expect(user?.planExpiresAt).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("normalizePlanDisplayName 不得把充值映射成付费档", () => {
  it("「积分充值 / recharge」在展示侧一律归到 Free", async () => {
    const admin = await loadAdminStore();
    for (const [index, dirtyPlan] of ["积分充值", "recharge", "Recharge"].entries()) {
      const userId = `dirty-plan-${index}`;
      const created = await admin.createCreditRechargeOrder({
        userId,
        username: `dirty${index}@example.com`,
        amount: 10,
        paymentMethod: "wechat",
      });
      expect(created.status).toBe(200);
      /*
       * ⚠️ 必须给一个**未来到期日**，否则这条断言是假的。
       *
       * 不给到期日的话，孤儿降级（步骤 3）会把用户降成 Free —— 于是哪怕
       * normalizePlanDisplayName 把「积分充值」映射成 Lite，最终读出来
       * 也还是 Free，断言照样通过。**两个机制互相遮蔽，测试静默失效。**
       * 实测：把映射改回 Lite 做变异，8 条测试全绿，一条都没抓到。
       *
       * 给未来到期日可以同时关掉步骤 2（未到期）和步骤 3（有到期日），
       * 让断言只面对归一化映射本身。
       */
      await mutateStoredUser(userId, { plan: dirtyPlan, planExpiresAt: "2099-01-01T00:00:00.000Z" });

      const user = (await runMaintenance(admin)).find((item) => item.id === userId);
      expect(user?.plan, `"${dirtyPlan}" 必须归到 Free，绝不能变成付费档`).toBe(FREE_PLAN_DISPLAY_NAME);
    }
  });

  it("⚠️ 反向：真实付费档名不受影响，仍正常归一化", async () => {
    const admin = await loadAdminStore();
    const cases: Array<[string, string]> = [
      ["Lite", "Lite 入门版"],
      ["Pro", "Pro 专业版"],
      ["Studio", "Studio 工作室版"],
      ["Creator 创作者版", "Lite 入门版"],
    ];
    for (const [index, [input, expected]] of cases.entries()) {
      const userId = `real-plan-${index}`;
      const created = await admin.createCreditRechargeOrder({
        userId,
        username: `real${index}@example.com`,
        amount: 10,
        paymentMethod: "wechat",
      });
      expect(created.status).toBe(200);
      // 给一个未来到期日，避开孤儿降级，单独验归一化映射本身
      await mutateStoredUser(userId, { plan: input, planExpiresAt: "2099-01-01T00:00:00.000Z" });

      const user = (await runMaintenance(admin)).find((item) => item.id === userId);
      expect(user?.plan, `"${input}" 应归一化成 "${expected}"`).toBe(expected);
    }
  });
});
