import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVITE_REWARD_CONFIG } from "../shared/billing-config";
import { evaluateInviteRefundRate } from "./invite-rewards";

/**
 * 邀请退款率异常 —— 自动封禁测试（2026-09-13 新增）
 *
 * ## 这一层守的是什么
 *
 * 用户 2026-09-13 拍板：**被邀请人退款时邀请人的奖励硬扣，
 * 且邀请人退款率达到 40% 就封号，后台可解封。**
 *
 * 扣回部分由 invite-reward-clawback.test.ts 覆盖，本文件只管后半截：
 * 1. 阈值就是 0.4，不是别的数（现有的区间断言挡不住被改回 0.5）；
 * 2. 命中后**真的把人封了**，而不是只写一条风控事件；
 * 3. 封禁必须**双库同步**，否则后台按钮渲染成「停用账号」，运营点不到解封；
 * 4. 封禁失败/被拒时**退款本身不能挂**，且事件不许谎报成「已封禁」；
 * 5. 解封链路可用 —— 自动封禁不能是单向门。
 *
 * ## ⚠️ 为什么第 1 条要单独锁死 0.4
 *
 * 既有测试写的是 `toBeGreaterThan(0.2)` + `toBeLessThan(1)`，
 * 锁的是「关系」。那在配置刚定档时是对的写法，但用户这次给的是**具体数字**，
 * 区间断言把 0.5 改回来照样全绿 —— 等于用户的决策没有被任何测试守住。
 * 所以这里额外用边界场景锁：5 邀 2 退 = 40.0% 必须命中，
 * 这个场景在 0.5 阈值下是不命中的，改回去立刻挂。
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

async function purchase(admin: Stores["admin"], params: { userId: string; username: string }) {
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

async function refund(
  admin: Stores["admin"],
  authorization: string,
  orderId: string,
  reason = "测试退款率风控"
) {
  return admin.handleAdminApiRequest("POST", `/orders/${orderId}/refund`, authorization, {
    confirmation: "CONFIRM_REFUND_ORDER",
    reason,
  });
}

/**
 * 造一个邀请人 + N 个已付费的被邀请人，返回他们的订单号。
 * 之后按需退其中几单，就能精确构造任意退款率。
 */
async function setupInviterWithInvitees(stores: Stores, count: number) {
  const { admin, auth } = stores;
  const inviter = await register(auth, { username: "inviter@example.com", ip: "10.0.0.1" });
  const summary = await auth.getInviteSummaryForUser(inviter.id);
  expect(summary?.inviteCode).toBeTruthy();
  const invitees: Array<{ id: string; username: string; orderId: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const invitee = await register(auth, {
      username: `invitee${i}@example.com`,
      ip: `10.1.0.${i + 1}`,
      inviteCode: summary!.inviteCode,
    });
    const orderId = await purchase(admin, { userId: invitee.id, username: invitee.username });
    invitees.push({ ...invitee, orderId });
  }
  return { inviter, invitees };
}

/** 直接读 auth 库落盘文件，确认封禁真的写进去了（不信内存态）。 */
async function readAuthUserStatus(userId: string) {
  const raw = await readFile(path.join(dataDir, "auth-users.json"), "utf-8");
  const db = JSON.parse(raw) as { users: Array<{ id: string; status?: string }> };
  return db.users.find((item) => item.id === userId)?.status;
}

/**
 * 同样直接读 admin-data 落盘文件。
 * 刻意不走 loadAdminData()（它也没导出）—— 读文件能顺带证明
 * 封禁与风控事件**真的持久化了**，而不是只改在内存对象上。
 */
async function readAdminUserStatus(_admin: Stores["admin"], userId: string) {
  const raw = await readFile(path.join(dataDir, "admin-data.json"), "utf-8");
  const data = JSON.parse(raw) as {
    users: Array<{ id: string; status?: string }>;
    riskEvents?: Array<{ title: string; target?: string; detail: string }>;
    auditLogs?: Array<{ action: string; target?: string }>;
  };
  return {
    status: data.users.find((item) => item.id === userId)?.status,
    riskEvents: data.riskEvents || [],
    auditLogs: data.auditLogs || [],
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-invite-ban-"));
});

afterEach(async () => {
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true });
  }
  dataDir = "";
});

describe("退款率阈值必须是用户拍板的 40%", () => {
  it("⭐⭐ 5 邀 2 退（恰好 40.0%）必须命中 —— 这个场景在 0.5 阈值下不命中", () => {
    /*
     * 这条是整个文件里最重要的断言。
     * 既有的区间断言 toBeGreaterThan(0.2) 把阈值改回 0.5 照样全绿，
     * 用「恰好 40%」这个边界场景才能真正把用户的决策钉死。
     */
    const verdict = evaluateInviteRefundRate({ rewardedInvites: 5, refundedInvites: 2 });
    expect(verdict.rate).toBeCloseTo(0.4, 10);
    expect(verdict.abnormal).toBe(true);
  });

  it("阈值常量本身就是 0.4", () => {
    expect(INVITE_REWARD_CONFIG.refundRateAlertThreshold).toBe(0.4);
  });

  it("判定用 >= 而不是 >，恰好等于阈值也算异常", () => {
    // 10 邀 4 退 = 40.0%，如果实现写成 > 则此处会漏判。
    expect(evaluateInviteRefundRate({ rewardedInvites: 10, refundedInvites: 4 }).abnormal).toBe(true);
  });

  it("39% 不命中，确认阈值没有被放宽到 0.3 以下", () => {
    // 100 邀 39 退 = 39%，紧挨着阈值下方。
    const verdict = evaluateInviteRefundRate({ rewardedInvites: 100, refundedInvites: 39 });
    expect(verdict.abnormal).toBe(false);
  });

  it("最小样本闸门仍然有效：2 邀 2 退（100%）不判定", () => {
    /*
     * 阈值调低到 0.4 之后小样本误报的风险更大了，
     * 这条确保降阈值没有把最小样本数一起动掉。
     */
    expect(evaluateInviteRefundRate({ rewardedInvites: 2, refundedInvites: 2 }).abnormal).toBe(false);
  });
});

describe("命中阈值后自动封禁邀请人", () => {
  it("⭐⭐ 退款率达到 40% 时邀请人被真正封禁（auth 库落盘确认）", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 5);
    const authorization = await getAdminAuthorization(auth);

    // 前置确认：封禁前是 active。少了这句，下面的断言可能在「本来就 disabled」上假通过。
    expect(await readAuthUserStatus(inviter.id)).not.toBe("disabled");

    // 退 1 单 = 20%，不该封。
    expect((await refund(admin, authorization, invitees[0].orderId)).status).toBe(200);
    expect(await readAuthUserStatus(inviter.id)).not.toBe("disabled");

    // 退第 2 单 = 2/5 = 40%，达到阈值 → 必须封。
    expect((await refund(admin, authorization, invitees[1].orderId)).status).toBe(200);
    expect(await readAuthUserStatus(inviter.id)).toBe("disabled");
  });

  it("⭐⭐ 封禁必须双库同步，admin 侧 status 也要变 blocked", async () => {
    /*
     * 只写 auth 库的话：用户确实登不上了，但后台用户列表读的是 admin 侧 status，
     * 会显示「正常」，那个二合一按钮渲染成「停用账号」——
     * 运营根本点不到「恢复账号」，自动封禁就变成了单向门。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 5);
    const authorization = await getAdminAuthorization(auth);

    await refund(admin, authorization, invitees[0].orderId);
    await refund(admin, authorization, invitees[1].orderId);

    const after = await readAdminUserStatus(admin, inviter.id);
    expect(after.status).toBe("blocked");
  });

  it("封禁后会话被踢掉，被封的人立刻登不上", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 5);
    const authorization = await getAdminAuthorization(auth);

    // 封禁前能正常登录，作为基准。
    const before = await auth.handleAuthAction("login", {
      username: "inviter@example.com",
      password: "secure-password",
    });
    expect(before.status).toBe(200);

    await refund(admin, authorization, invitees[0].orderId);
    await refund(admin, authorization, invitees[1].orderId);

    const after = await auth.handleAuthAction("login", {
      username: "inviter@example.com",
      password: "secure-password",
    });
    expect(after.status).not.toBe(200);
  });

  it("写风控事件 + 审计日志，运营能查到为什么被封", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 5);
    const authorization = await getAdminAuthorization(auth);

    await refund(admin, authorization, invitees[0].orderId);
    await refund(admin, authorization, invitees[1].orderId);

    const after = await readAdminUserStatus(admin, inviter.id);
    const banEvent = after.riskEvents.find(
      (event) => event.target === inviter.id && event.title.includes("退款率异常")
    );
    expect(banEvent).toBeTruthy();
    // 事件必须说清楚「封了」而不是含糊的「建议核查」，否则运营不知道已经处置过。
    expect(banEvent!.title).toContain("已自动封禁");
    expect(banEvent!.detail).toContain("恢复账号");

    const banAudit = after.auditLogs.find(
      (log) => log.target === inviter.id && log.action.includes("自动封禁")
    );
    expect(banAudit).toBeTruthy();
  });

  it("退款率没到阈值时绝不封禁（防止误伤正常用户）", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 5);
    const authorization = await getAdminAuthorization(auth);

    // 只退 1 单 = 20%，属于正常退款率。
    await refund(admin, authorization, invitees[0].orderId);

    expect(await readAuthUserStatus(inviter.id)).not.toBe("disabled");
    const after = await readAdminUserStatus(admin, inviter.id);
    expect(after.status).not.toBe("blocked");
    expect(
      after.riskEvents.some((event) => event.target === inviter.id && event.title.includes("退款率异常"))
    ).toBe(false);
  });

  it("样本不足时不封禁：2 邀 2 退虽然 100% 也放过", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 2);
    const authorization = await getAdminAuthorization(auth);

    await refund(admin, authorization, invitees[0].orderId);
    await refund(admin, authorization, invitees[1].orderId);

    expect(await readAuthUserStatus(inviter.id)).not.toBe("disabled");
  });
});

describe("封禁失败不得拖垮退款主流程", () => {
  it("⭐⭐ 邀请人就是执行退款的管理员本人（封禁会被拒）时，退款照样成功且积分照扣", async () => {
    /*
     * updateAuthUserAdmin 的三道拒绝里，`isSelf && status === "disabled"`
     * （不能停用当前登录的管理员账号）是唯一能稳定构造的：
     *
     * ⚠️ 别用「把邀请人提成 super_admin」那个思路 —— 提权之后系统里就有了
     * 两个 super_admin，而保护条件是 `activeSuperAdminCount <= 1`，
     * 于是封禁合法通过，这条测试会退化成「又一次成功封禁」，
     * 守不住任何东西。（这个坑实测踩过。）
     *
     * 这条守的是：那个拒绝不能让退款 500。
     * 退款是资金动作，走到封禁那一步时订单状态和积分扣减都已经改在
     * data 对象上但还没落库，异常冒泡会让这些改动全部丢失，
     * 运营看到「退款失败」去重试 —— 而订单仍是 paid，等于再退一次。
     */
    const stores = await loadStores();
    const { admin, auth } = stores;

    // 让 bootstrap 管理员自己充当邀请人：他既是 actor 又是封禁目标 → isSelf 命中。
    const adminLogin = await auth.handleAuthAction("login", {
      username: "admin@example.com",
      password: "secure-admin-password",
    });
    const adminUser = (adminLogin.body as { user: { id: string; username: string } }).user;
    const summary = await auth.getInviteSummaryForUser(adminUser.id);
    expect(summary?.inviteCode).toBeTruthy();

    const invitees: Array<{ id: string; username: string; orderId: string }> = [];
    for (let i = 0; i < 5; i += 1) {
      const invitee = await register(auth, {
        username: `selfinvitee${i}@example.com`,
        ip: `10.2.0.${i + 1}`,
        inviteCode: summary!.inviteCode,
      });
      const orderId = await purchase(admin, { userId: invitee.id, username: invitee.username });
      invitees.push({ ...invitee, orderId });
    }
    const inviter = adminUser;
    const authorization = await getAdminAuthorization(auth);

    await refund(admin, authorization, invitees[0].orderId);
    const second = await refund(admin, authorization, invitees[1].orderId);

    // 核心断言：退款本身必须成功。
    expect(second.status).toBe(200);

    // 而且订单积分该扣的还是扣了 —— 证明封禁失败没有回滚掉前面的资金处理。
    const inviteeSnapshot = (await admin.getBillingSnapshotForUser(invitees[1].id)) as {
      creditBatches: Array<{ source?: string; status: string }>;
    } | null;
    const inviteBatch = inviteeSnapshot?.creditBatches.find((batch) =>
      String(batch.source || "").startsWith("rule/invite")
    );
    expect(inviteBatch?.status).toBe("refunded");

    // 事件必须如实说「没封成」，不许谎报成已封禁。
    const after = await readAdminUserStatus(admin, inviter.id);
    const event = after.riskEvents.find(
      (item) => item.target === inviter.id && item.title.includes("退款率异常")
    );
    expect(event).toBeTruthy();
    expect(event!.title).toContain("封禁未生效");
    expect(event!.title).not.toContain("已自动封禁");
  });
});

describe("后台解封链路", () => {
  it("⭐⭐ 自动封禁的账号能被后台解封并恢复登录 —— 不是单向门", async () => {
    const stores = await loadStores();
    const { admin, auth } = stores;
    const { inviter, invitees } = await setupInviterWithInvitees(stores, 5);
    const authorization = await getAdminAuthorization(auth);

    await refund(admin, authorization, invitees[0].orderId);
    await refund(admin, authorization, invitees[1].orderId);
    expect(await readAuthUserStatus(inviter.id)).toBe("disabled");

    // 走后台用户列表「恢复账号」按钮的那条真实链路。
    const restored = await admin.handleAdminApiRequest(
      "POST",
      `/users/${inviter.id}/status`,
      authorization,
      { status: "normal" }
    );
    expect(restored.status).toBe(200);

    // 双库都要放出来。
    expect(await readAuthUserStatus(inviter.id)).toBe("active");
    const after = await readAdminUserStatus(admin, inviter.id);
    expect(after.status).toBe("normal");

    // 最终判据：人能重新登录。状态字段对了但登不上等于没解封。
    const login = await auth.handleAuthAction("login", {
      username: "inviter@example.com",
      password: "secure-password",
    });
    expect(login.status).toBe(200);
  });
});

describe("源码层防护", () => {
  it("⭐ 自动封禁必须写 admin 侧 status，不能只写 auth 库", async () => {
    /*
     * 行为层已经断言过 blocked，但那只覆盖「封禁成功」这一条路径。
     * 这里从源码层锁住：改动里必须同时出现两侧的写入，
     * 防止有人为了「简化」把 admin 侧那行删掉 —— 删了之后
     * 只有上面那条双库测试会挂，而它很容易被误认为是夹具问题而放宽。
     */
    const source = await readFile(path.join(process.cwd(), "server/admin-store.ts"), "utf-8");
    const start = source.indexOf("if (verdict.abnormal) {");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 4000);
    expect(block.length).toBeGreaterThan(1000); // 锚点失效保护

    expect(block).toContain("updateAuthUserAdmin");
    expect(block).toMatch(/status:\s*"disabled"/);
    expect(block).toMatch(/inviterAccount\.status\s*=\s*"blocked"/);
  });

  it("⭐ 封禁调用必须包在 try/catch 里，且不许 rethrow", async () => {
    const source = await readFile(path.join(process.cwd(), "server/admin-store.ts"), "utf-8");
    const start = source.indexOf("if (verdict.abnormal) {");
    const block = source.slice(start, start + 4000);
    expect(block).toContain("try {");
    expect(block).toContain("catch (error)");
    // 反向断言：catch 块里出现 throw 就等于异常仍会冒泡，退款照样会 500。
    const catchStart = block.indexOf("catch (error)");
    const catchBlock = block.slice(catchStart, catchStart + 300);
    expect(catchBlock).not.toContain("throw");
  });

  it("⭐ 必须检查 updateAuthUserAdmin 的返回码，不能假定一定成功", async () => {
    /*
     * updateAuthUserAdmin 的三道拒绝是 return 非 200 而不是抛错，
     * 只有 try/catch 是抓不住的。不检查返回码就会把「被拒」写成「已封禁」，
     * 运营以为止损了实际没有。
     */
    const source = await readFile(path.join(process.cwd(), "server/admin-store.ts"), "utf-8");
    const start = source.indexOf("if (verdict.abnormal) {");
    const block = source.slice(start, start + 4000);
    expect(block).toMatch(/\.status\s*===\s*200/);
    expect(block).toContain("rejected");
  });
});
