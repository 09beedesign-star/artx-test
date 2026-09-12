import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * 取若干现有用户 id。
 * ⚠️ 种子数据的用户数不固定（干净环境下可能只有 1 个引导管理员），
 * 所以这里按实际数量返回，调用方不要假设一定能拿到 N 个。
 */
async function pickUserIds(
  admin: Awaited<ReturnType<typeof loadAdminStore>>,
  authorization: string,
  count: number
) {
  const result = await admin.handleAdminApiRequest("GET", "credits", authorization, {});
  const users = (result.body as { users: Array<{ id: string }> }).users;
  expect(users.length).toBeGreaterThan(0);
  return users.slice(0, count).map((user) => user.id);
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-credit-gift-"));
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

describe("管理员批量赠送积分", () => {
  it("批量赠送成功并返回每个对象的结果", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 2);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 300,
      reason: "中秋运营活动赠送",
      expiryDays: 30,
    });

    expect(result.status).toBe(200);
    const giftResult = (result.body as {
      giftResult: {
        giftBatchNo: string;
        succeeded: Array<{ userId: string }>;
        failed: unknown[];
      };
    }).giftResult;
    expect(giftResult.succeeded).toHaveLength(userIds.length);
    expect(giftResult.failed).toHaveLength(0);
    expect(giftResult.giftBatchNo).toMatch(/^gift_/);
  });

  it("赠送后能在赠送记录里查到，且带有效期", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 500,
      reason: "新用户体验金",
    });

    const records = await admin.handleAdminApiRequest(
      "GET",
      "credits/gift-records",
      authorization,
      {}
    );
    expect(records.status).toBe(200);
    const body = records.body as {
      records: Array<{ delta: number; expiresAt?: string; reason: string }>;
      summary: { totalGifted: number; uniqueUsers: number };
    };
    const record = body.records.find((item) => item.reason === "新用户体验金");
    expect(record).toBeTruthy();
    expect(record?.delta).toBe(500);
    // 默认 30 天有效期必须体现在记录里。
    expect(record?.expiresAt).toBeTruthy();
    expect(body.summary.totalGifted).toBeGreaterThanOrEqual(500);
  });

  it("缺少赠送理由时拒绝，保证审计可追溯", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 100,
      reason: "   ",
    });

    expect(result.status).toBe(400);
  });

  it("没有选人或积分非正数时拒绝", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const noUser = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds: [],
      amount: 100,
      reason: "x",
    });
    expect(noUser.status).toBe(400);

    const badAmount = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: -50,
      reason: "x",
    });
    expect(badAmount.status).toBe(400);
  });

  it("大额批量赠送需要二次确认", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    // 单人 12000 也已越过 10000 的二次确认阈值，不依赖用户数量。
    const blocked = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 12000,
      reason: "大额发放",
    });
    expect(blocked.status).toBe(409);

    const confirmed = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 12000,
      reason: "大额发放",
      confirmHighRisk: true,
    });
    expect(confirmed.status).toBe(200);
  });

  it("用户不存在时计入失败列表，不影响其他人到账", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds: [...userIds, "u_not_exist"],
      amount: 100,
      reason: "部分失败测试",
    });

    expect(result.status).toBe(200);
    const giftResult = (result.body as {
      giftResult: { succeeded: unknown[]; failed: Array<{ userId: string }> };
    }).giftResult;
    expect(giftResult.succeeded).toHaveLength(1);
    expect(giftResult.failed).toHaveLength(1);
    expect(giftResult.failed[0].userId).toBe("u_not_exist");
  });

  it("全部对象都失败时返回错误而不是假成功", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds: ["u_ghost_1", "u_ghost_2"],
      amount: 100,
      reason: "全失败测试",
    });

    expect(result.status).toBe(400);
  });

  it("赠送会写入审计日志", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 200,
      reason: "审计链路验证",
    });

    const overview = await admin.handleAdminApiRequest("GET", "audit-logs", authorization, {});
    const logs = (overview.body as { auditLogs?: Array<{ action: string }> }).auditLogs || [];
    expect(logs.some((log) => log.action === "批量赠送积分")).toBe(true);
  });

  it("积分流水落库保留 ISO 时间戳，不被相对时间污染", async () => {
    // ⚠️ 回归防护：ensureBillingConsistency 位于 saveAdminData 落库路径上，
    // 曾把 credits[].createdAt 用 formatRelativeTime 改写成「刚刚」并持久化，
    // 导致真实时间永久丢失、按日统计（单日赠送额度）全部失效。
    // 相对时间只能在读取出口投影。
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 100,
      reason: "时间戳回归防护",
    });

    const raw = JSON.parse(
      await readFile(path.join(dataDir, "admin-data.json"), "utf8")
    ) as { credits: Array<{ createdAt: string; reason: string }> };
    const stored = raw.credits.find((entry) => entry.reason === "时间戳回归防护");
    expect(stored).toBeTruthy();
    expect(stored?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(new Date(stored!.createdAt).getTime())).toBe(false);
  });

  it("读取出口仍然返回相对时间，前端展示不受落库修复影响", async () => {
    const admin = await loadAdminStore();
    const authorization = await getAuthorization();
    const userIds = await pickUserIds(admin, authorization, 1);

    const result = await admin.handleAdminApiRequest("POST", "credits/gift", authorization, {
      userIds,
      amount: 100,
      reason: "出口展示验证",
    });
    const credits = (result.body as { credits: Array<{ createdAt: string; reason: string }> }).credits;
    const shown = credits.find((entry) => entry.reason === "出口展示验证");
    expect(shown?.createdAt).toBe("刚刚");
  });

  it("未登录时拒绝赠送", async () => {
    const admin = await loadAdminStore();
    const result = await admin.handleAdminApiRequest("POST", "credits/gift", "", {
      userIds: ["u_1"],
      amount: 100,
      reason: "未授权",
    });
    expect(result.status).toBe(401);
  });
});
