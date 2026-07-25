import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function getAdminAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const result = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(result.status).toBe(200);
  const body = result.body as { token?: string };
  expect(body.token).toBeTruthy();
  return `Bearer ${body.token}`;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-credit-notification-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD;
});

describe("admin credit gift notifications", () => {
  it("creates an unread user notification for positive manual credit adjustments and acknowledges it", async () => {
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
      users: [
        {
          id: "credit-gift-user",
          name: "gift-user",
          email: "gift-user@example.com",
          account: "gift-user@example.com",
          registeredAt: "2026-07-11 10:00",
          loginMethod: "email",
          role: "viewer",
          status: "normal",
          plan: "Free",
          organization: "个人",
          credits: 120,
          frozenCredits: 0,
          expiredCredits: 0,
          totalRecharge: 0,
          totalConsumed: 0,
          lastSeen: "刚刚",
          risk: "低",
        },
      ],
      orders: [],
      credits: [],
      creditNotifications: [],
      aiTasks: [],
      providers: [],
      feedback: [],
      alerts: [],
      riskEvents: [],
      auditLogs: [],
      plans: [],
      capabilityStatus: [],
    }, null, 2)}\n`);

    const {
      acknowledgeCreditGiftNotification,
      getBillingSnapshotForUser,
      getCreditGiftNotificationsForUser,
      handleAdminApiRequest,
    } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const adjusted = await handleAdminApiRequest("POST", "/credits/adjust", authorization, {
      userId: "credit-gift-user",
      delta: 350,
      reason: "后台感谢赠送",
    });
    expect(adjusted.status).toBe(200);

    await expect(getBillingSnapshotForUser("credit-gift-user")).resolves.toMatchObject({
      balance: 470,
    });

    const pending = await getCreditGiftNotificationsForUser("credit-gift-user");
    expect(pending).toMatchObject({
      balance: 470,
      notifications: [
        expect.objectContaining({
          amount: 350,
          balance: 470,
          message: "您好，您已收到系统为您赠送的 350 积分作为感谢。",
        }),
      ],
    });

    const acked = await acknowledgeCreditGiftNotification("credit-gift-user", pending.notifications[0].id);
    expect(acked.status).toBe(200);
    await expect(getCreditGiftNotificationsForUser("credit-gift-user")).resolves.toMatchObject({
      balance: 470,
      notifications: [],
    });
  });
});
