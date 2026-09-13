import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_HIGH_RISK_CREDIT_THRESHOLD } from "../shared/admin-risk-policy";

/**
 * 后台大额操作二次确认闸门的防护测试。
 *
 * ⚠️ 这个闸门曾经被架空过（2026-09-13 修复）：
 * 后端写着 `if (大额 && body.confirmHighRisk !== true) return 409`，
 * 前端却用**与后端完全相同的表达式**自动算出 confirmHighRisk 一起发过来：
 *
 *     confirmHighRisk: Math.abs(delta) >= 10000      // ❌ 已删除
 *
 * 于是「大额」成立时 confirmHighRisk 必然为 true，409 分支永远进不去。
 * 代码里两道防线都在、测试也能跑过、审计日志照常记录，**唯独拦不住任何人**。
 *
 * 所以本文件分两层守：
 *   1. 行为层：直接打后端，断言「未显式确认 → 409」。
 *   2. 源码层：断言前端没有把 confirmHighRisk 写成由金额推导的表达式。
 * 少了第 2 层，前端哪天再写回自动推导，第 1 层依然全绿（因为它自己传 true）。
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

async function getAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const login = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(login.status).toBe(200);
  return `Bearer ${(login.body as { token: string }).token}`;
}

async function pickUserIds(
  admin: Awaited<ReturnType<typeof loadAdminStore>>,
  authorization: string,
  count: number,
) {
  const result = await admin.handleAdminApiRequest("GET", "credits", authorization, {});
  const users = (result.body as { users: Array<{ id: string }> }).users;
  expect(users.length).toBeGreaterThan(0);
  return users.slice(0, count).map((user) => user.id);
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-high-risk-gate-"));
});

afterEach(async () => {
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

describe("credits/adjust 大额二次确认闸门", () => {
  it("未达阈值时无需确认，直接放行", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const [userId] = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/adjust", authorization, {
      userId,
      delta: ADMIN_HIGH_RISK_CREDIT_THRESHOLD - 1,
      reason: "小额补偿",
    });

    expect(result.status).toBe(200);
  });

  it("达到阈值但未传 confirmHighRisk 时返回 409", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const [userId] = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/adjust", authorization, {
      userId,
      delta: ADMIN_HIGH_RISK_CREDIT_THRESHOLD,
      reason: "大额补偿",
    });

    expect(result.status).toBe(409);
    expect((result.body as { error: string }).error).toContain("二次确认");
  });

  it("显式传 confirmHighRisk: false 同样被拦下", async () => {
    // ⚠️ 后端用的是 `!== true` 而不是 falsy 判断，这条锁住那个口径：
    // 前端复选框未勾选时传的就是 false，必须和「不传」一样被拦。
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const [userId] = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/adjust", authorization, {
      userId,
      delta: ADMIN_HIGH_RISK_CREDIT_THRESHOLD,
      reason: "大额补偿",
      confirmHighRisk: false,
    });

    expect(result.status).toBe(409);
  });

  it("大额扣减（负数）同样需要确认", async () => {
    // 口径是绝对值。只拦增加不拦扣减的话，恶意扣光用户积分反而畅通无阻。
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const [userId] = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/adjust", authorization, {
      userId,
      delta: -ADMIN_HIGH_RISK_CREDIT_THRESHOLD,
      reason: "大额扣减",
    });

    expect(result.status).toBe(409);
  });

  it("显式确认后放行", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const [userId] = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/adjust", authorization, {
      userId,
      delta: ADMIN_HIGH_RISK_CREDIT_THRESHOLD,
      reason: "大额补偿",
      confirmHighRisk: true,
    });

    expect(result.status).toBe(200);
  });
});

describe("credits/gift 大额二次确认闸门", () => {
  it("合计发放量未达阈值时无需确认", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 100,
      reason: "活动小额赠送",
      expiryDays: 30,
    });

    expect(result.status).toBe(200);
  });

  it("阈值按「单人额度 × 人数」算，而不是只看单人额度", async () => {
    // ⚠️ 这是批量赠送区别于人工调整的地方：每人 5000 看着不大，
    // 发给 2 个人就是 10000。只判单人额度等于给批量操作开了后门。
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 2);
    if (userIds.length < 2) return; // 种子数据不足 2 人时跳过，不做假断言

    const perUser = ADMIN_HIGH_RISK_CREDIT_THRESHOLD / 2;
    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: perUser,
      reason: "大额批量赠送",
      expiryDays: 30,
    });

    expect(result.status).toBe(409);
    expect((result.body as { error: string }).error).toContain("二次确认");
  });

  it("达到阈值且未确认时返回 409", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: ADMIN_HIGH_RISK_CREDIT_THRESHOLD,
      reason: "大额批量赠送",
      expiryDays: 30,
    });

    expect(result.status).toBe(409);
  });

  it("显式确认后放行", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: ADMIN_HIGH_RISK_CREDIT_THRESHOLD,
      reason: "大额批量赠送",
      expiryDays: 30,
      confirmHighRisk: true,
    });

    expect(result.status).toBe(200);
  });
});

describe("前端不得自行推导 confirmHighRisk（防回归）", () => {
  /**
   * ⚠️ 这一组是源码层断言，不是行为层。
   * 原因：行为层测试自己构造请求体，无论前端怎么写都能通过。
   * 前端一旦写回 `confirmHighRisk: Math.abs(delta) >= 10000`，
   * 上面所有测试依然全绿，而线上闸门已经被架空。
   */
  const adminPageSource = () =>
    readFile("client/src/pages/AdminPrototypePage.tsx", "utf-8");

  it("confirmHighRisk 只能来自 state，不能是比较表达式", async () => {
    const source = await adminPageSource();
    const assignments = source.match(/confirmHighRisk:\s*[^,\n]+/g) || [];
    expect(assignments.length).toBeGreaterThanOrEqual(2);
    for (const assignment of assignments) {
      // 反向断言：右侧不得出现任何比较/算术运算。
      // 逐个点名已知写法（如 Math.abs）只守得住历史那一种，
      // 守不住将来新写的 `totalCredits >= THRESHOLD`。
      expect(assignment).not.toMatch(/>=|<=|>|<|Math\.|\*|\+/);
      // 正向断言：必须是一个以 Confirmed 结尾的 state 变量。
      expect(assignment).toMatch(/confirmHighRisk:\s*\w*Confirmed\s*$/);
    }
  });

  it("确认状态必须是独立的 useState，不能由金额初始化", async () => {
    const source = await adminPageSource();
    expect(source).toMatch(/const \[creditAdjustmentConfirmed, setCreditAdjustmentConfirmed\] = useState\(false\)/);
    expect(source).toMatch(/const \[giftHighRiskConfirmed, setGiftHighRiskConfirmed\] = useState\(false\)/);
  });

  it("提交后必须复位确认状态，避免下一笔被顺带放行", async () => {
    // 不复位的话，操作员勾一次可以连续放行任意多笔大额操作，
    // 「二次确认」退化成「首次确认」。
    const source = await adminPageSource();
    expect(source).toMatch(/setCreditAdjustmentConfirmed\(false\)/);
    expect(source).toMatch(/setGiftHighRiskConfirmed\(false\)/);
  });

  it("前后端共用同一份阈值，不得各写字面量", async () => {
    const source = await adminPageSource();
    const backend = await readFile("server/admin-store.ts", "utf-8");
    expect(source).toMatch(/from "@shared\/admin-risk-policy"/);
    expect(backend).toMatch(/from "\.\.\/shared\/admin-risk-policy"/);
    // 两边都不得再出现裸的 10000 参与风控判断。
    expect(backend).not.toMatch(/Math\.abs\(delta\) >= 10000/);
    expect(source).not.toMatch(/>= 10000/);
  });
});
