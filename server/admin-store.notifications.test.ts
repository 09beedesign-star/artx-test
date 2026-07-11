import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  return `Bearer ${(result.body as { token: string }).token}`;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-notifications-test-"));
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

describe("admin notification actions", () => {
  it("persists a read timestamp for existing order data and hides a dismissed urgent alert", async () => {
    await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
      users: [],
      orders: [{
        id: "ord_notification_1",
        userId: "user_1",
        user: "user@example.com",
        packageName: "积分充值",
        channel: "微信支付",
        amount: 20,
        expectedCredits: 2000,
        issuedCredits: 0,
        status: "pending",
        createdAt: "2026/07/12 10:00:00",
        event: "等待支付",
        reconciliation: "pending",
      }],
      credits: [],
      aiTasks: [],
      providers: [],
      feedback: [],
      alerts: [{
        id: "al_notification_1",
        category: "风控",
        title: "异常登录拦截",
        detail: "同一 IP 高频尝试后台登录",
        severity: "critical",
        time: "2026/07/12 10:01:00",
        owner: "Security",
        unread: true,
        linkedSection: "risk",
      }],
      riskEvents: [],
      auditLogs: [],
      plans: [],
      capabilityStatus: [],
    }, null, 2)}\n`);

    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    expect((await handleAdminApiRequest("POST", "/notifications/order/ord_notification_1/read", authorization)).status).toBe(200);
    expect((await handleAdminApiRequest("POST", "/notifications/alert/al_notification_1/dismiss", authorization)).status).toBe(200);

    const data = JSON.parse(await readFile(path.join(dataDir, "admin-data.json"), "utf-8"));
    expect(data.orders[0].notificationReadAt).toEqual(expect.any(String));
    expect(data.alerts[0]).toMatchObject({
      unread: false,
      notificationDismissedAt: expect.any(String),
    });
  });
});
