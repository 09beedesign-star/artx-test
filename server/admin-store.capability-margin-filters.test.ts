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
  const login = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(login.status).toBe(200);
  return `Bearer ${(login.body as { token: string }).token}`;
}

function task(id: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    generationId: `gen-${id}`,
    backendTaskId: `backend-${id}`,
    providerTaskId: `provider-${id}`,
    userId: "user-avery",
    user: "Avery Chen",
    capability: "图片生成",
    provider: "image-provider",
    model: "image-v1",
    status: "success",
    latencyMs: 500,
    failureReason: "",
    inputUnits: 1,
    outputUnits: 1,
    estimatedCost: 0.2,
    chargedCredits: 100,
    grossMargin: 0.8,
    createdAt,
    ...overrides,
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-capability-margin-filters-"));
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  await writeFile(path.join(dataDir, "admin-data.json"), `${JSON.stringify({
    users: [
      {
        id: "user-avery", name: "Avery Chen", email: "avery@example.com", account: "avery@example.com",
        registeredAt: ago(200), loginMethod: "email", role: "viewer", status: "normal", plan: "Free",
        organization: "个人", credits: 0, frozenCredits: 0, expiredCredits: 0, totalRecharge: 0,
        totalConsumed: 0, lastSeen: "刚刚", risk: "低",
      },
      {
        id: "user-morgan", name: "Morgan Studio", email: "morgan@example.com", account: "morgan@example.com",
        registeredAt: ago(200), loginMethod: "email", role: "viewer", status: "normal", plan: "Free",
        organization: "个人", credits: 0, frozenCredits: 0, expiredCredits: 0, totalRecharge: 0,
        totalConsumed: 0, lastSeen: "刚刚", risk: "低",
      },
    ],
    orders: [], credits: [], creditNotifications: [], providers: [], feedback: [], alerts: [], riskEvents: [],
    auditLogs: [], plans: [], capabilityStatus: [],
    aiTasks: [
      task("task-1d-success", ago(0.5)),
      task("task-1d-failed", ago(0.5), { status: "failed", chargedCredits: 0, estimatedCost: 0, grossMargin: 0, failureReason: "upstream timeout" }),
      task("task-3d", ago(2), { userId: "user-morgan", user: "Morgan Studio", capability: "文案生成", provider: "text-provider", model: "text-v1", chargedCredits: 50, estimatedCost: 0.35, grossMargin: 0.3 }),
      task("task-7d", ago(6), { userId: "user-morgan", user: "Morgan Studio", capability: "文案生成", provider: "text-provider", model: "text-v2", chargedCredits: 200, estimatedCost: 0.1, grossMargin: 0.95 }),
      task("task-15d", ago(14), { model: "image-v2" }),
      task("task-30d", ago(29), { model: "image-v3" }),
      task("task-90d", ago(89), { model: "image-v4" }),
      task("task-180d", ago(179), { model: "image-v5" }),
      task("task-too-old", ago(181), { model: "image-v6" }),
      task("task-negative", ago(181), { capability: "负毛利能力", model: "negative-v1", chargedCredits: 100, estimatedCost: 1.1, grossMargin: -0.1 }),
    ],
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

describe("capability margin filters", () => {
  it("applies every inclusive time range to persisted task records", async () => {
    const store = await loadAdminStore();

    await expect(store.getCapabilityMarginAnalysis({ time: "1d" })).resolves.toMatchObject({
      tasks: expect.arrayContaining([expect.objectContaining({ id: "task-1d-failed" }), expect.objectContaining({ id: "task-1d-success" })]),
    });
    await expect(store.getCapabilityMarginAnalysis({ time: "3d" })).resolves.toMatchObject({ kpis: { taskCount: 3 } });
    await expect(store.getCapabilityMarginAnalysis({ time: "7d" })).resolves.toMatchObject({ kpis: { taskCount: 4 } });
    await expect(store.getCapabilityMarginAnalysis({ time: "15d" })).resolves.toMatchObject({ kpis: { taskCount: 5 } });
    await expect(store.getCapabilityMarginAnalysis({ time: "30d" })).resolves.toMatchObject({ kpis: { taskCount: 6 } });
    await expect(store.getCapabilityMarginAnalysis({ time: "90d" })).resolves.toMatchObject({ kpis: { taskCount: 7 } });
    await expect(store.getCapabilityMarginAnalysis({ time: "180d" })).resolves.toMatchObject({ kpis: { taskCount: 8 } });
  });

  it("uses one combined filter set for task detail, KPI, capability, and model totals", async () => {
    const store = await loadAdminStore();
    const result = await store.getCapabilityMarginAnalysis({
      time: "7d",
      model: "image-v1",
      account: "AVERY",
      minChargedCredits: 90,
      maxChargedCredits: 110,
      grossMarginBand: ">=60",
      minGrossMargin: 0.7,
      maxGrossMargin: 0.9,
    });

    expect(result).toEqual({
      tasks: [expect.objectContaining({
        id: "task-1d-success",
        userAccount: "avery@example.com",
        model: "image-v1",
        capability: "图片生成",
        chargedCredits: 100,
        estimatedCost: 0.2,
        grossMargin: 0.8,
        status: "success",
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      })],
      kpis: {
        taskCount: 1,
        successCount: 1,
        failedCount: 0,
        chargedCredits: 100,
        estimatedCost: 0.2,
        grossProfitCredits: 80,
        avgGrossMargin: 0.8,
      },
      capabilities: [{
        key: "图片生成",
        label: "图片生成",
        taskCount: 1,
        successCount: 1,
        failedCount: 0,
        chargedCredits: 100,
        estimatedCost: 0.2,
        grossProfitCredits: 80,
        avgGrossMargin: 0.8,
      }],
      models: [{
        key: "image-v1",
        label: "image-v1",
        taskCount: 1,
        successCount: 1,
        failedCount: 0,
        chargedCredits: 100,
        estimatedCost: 0.2,
        grossProfitCredits: 80,
        avgGrossMargin: 0.8,
      }],
    });
  });

  it("supports every gross-margin band without counting failed task value", async () => {
    const store = await loadAdminStore();

    await expect(store.getCapabilityMarginAnalysis({ grossMarginBand: "negative" })).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: "task-negative" })],
      kpis: { taskCount: 1, successCount: 1, failedCount: 0, chargedCredits: 100, estimatedCost: 1.1, grossProfitCredits: -10, avgGrossMargin: -0.1 },
    });
    await expect(store.getCapabilityMarginAnalysis({ grossMarginBand: "0-30" })).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: "task-1d-failed" })],
      kpis: { taskCount: 1, successCount: 0, failedCount: 1, chargedCredits: 0, estimatedCost: 0, grossProfitCredits: 0, avgGrossMargin: 0 },
    });
    await expect(store.getCapabilityMarginAnalysis({ grossMarginBand: "30-60" })).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: "task-3d" })],
    });
    await expect(store.getCapabilityMarginAnalysis({ grossMarginBand: ">=60" })).resolves.toMatchObject({
      tasks: expect.arrayContaining([expect.objectContaining({ id: "task-1d-success" }), expect.objectContaining({ id: "task-7d" })]),
    });
  });

  it("serves authenticated capability-margin queries", async () => {
    const store = await loadAdminStore();
    const authorization = await getAdminAuthorization();

    const response = await store.handleAdminApiRequest(
      "GET",
      "/capability-margin?time=1d&model=image-v1&account=avery",
      authorization,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tasks: expect.arrayContaining([expect.objectContaining({ id: "task-1d-failed" }), expect.objectContaining({ id: "task-1d-success" })]),
      kpis: { taskCount: 2, successCount: 1, failedCount: 1, chargedCredits: 100, estimatedCost: 0.2 },
    });
  });
});
