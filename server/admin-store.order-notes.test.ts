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
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-order-notes-test-"));
  await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
    users: [],
    orders: [{
      id: "ord_note_1",
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
    alerts: [],
    riskEvents: [],
    auditLogs: [],
    plans: [],
    capabilityStatus: [],
  }, null, 2)}\n`);
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

describe("order notes", () => {
  it("keeps one note per order, overwrites it, and records deletion in the audit log", async () => {
    const { handleAdminApiRequest } = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    expect((await handleAdminApiRequest("POST", "/orders/ord_note_1/notes", authorization, { content: "初始备注" })).status).toBe(200);
    expect((await handleAdminApiRequest("POST", "/orders/ord_note_1/notes", authorization, { content: "覆盖后的备注" })).status).toBe(200);
    expect((await handleAdminApiRequest("DELETE", "/orders/ord_note_1/notes", authorization)).status).toBe(200);

    const data = JSON.parse(await readFile(path.join(dataDir, "admin-data.json"), "utf-8"));
    expect(data.orders[0].notes).toEqual([]);
    expect(data.auditLogs.map((entry: { action: string }) => entry.action)).toEqual(expect.arrayContaining([
      "新增订单处理备注",
      "覆盖订单处理备注",
      "删除订单处理备注",
    ]));
  });
});
