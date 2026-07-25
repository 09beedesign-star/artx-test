import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir = "";

async function loadStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./admin-store");
}

async function authorization() {
  const { handleAuthAction } = await import("./auth-store");
  const login = await handleAuthAction("login", { username: "admin@example.com", password: "secure-admin-password" });
  return `Bearer ${(login.body as { token: string }).token}`;
}

beforeEach(async () => { dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-test-usage-")); });
afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

describe("test account AI limits", () => {
  it("reserves credits before provider work and releases them after failure", async () => {
    const store = await loadStore();
    const issued = await store.handleAdminApiRequest("POST", "/test-accounts", await authorization(), {
      email: "quota@example.com", initialCredits: 100, dailyCreditLimit: 20, expiresAt: "2030-01-01T00:00:00.000Z",
    });
    const userId = (issued.body as { user: { id: string } }).user.id;

    await expect(store.reserveTestAccountAiUsage({ userId, taskId: "task-1", estimatedCredits: 12 }))
      .resolves.toEqual({ status: "reserved" });
    await expect(store.reserveTestAccountAiUsage({ userId, taskId: "task-2", estimatedCredits: 12 }))
      .rejects.toThrow("测试账号今日 AI 限额已用尽");
    await store.releaseTestAccountAiUsage({ userId, taskId: "task-1" });
    await expect(store.reserveTestAccountAiUsage({ userId, taskId: "task-2", estimatedCredits: 12 }))
      .resolves.toEqual({ status: "reserved" });
  });

  it("keeps provider token usage only when the upstream supplied it", async () => {
    const store = await loadStore();
    const withTokens = await store.recordAiUsage({
      userId: "usage-user",
      username: "usage@example.com",
      capability: "提示词优化 / 文案生成",
      capabilityKey: "text_generation",
      provider: "AI_TEXT",
      model: "gpt-5.4-mini",
      status: "success",
      inputTokens: 812,
      outputTokens: 216,
    });
    const image = await store.recordAiUsage({
      userId: "usage-user",
      username: "usage@example.com",
      capability: "图片生成",
      capabilityKey: "text_to_image",
      provider: "AI_IMAGE",
      model: "gpt-image-2",
      status: "success",
      outputUnits: 2,
    });

    expect(withTokens.usage).toEqual({
      usageKind: "tokens",
      promptTokens: 812,
      completionTokens: 216,
    });
    expect(image.usage).toEqual({ usageKind: "images", imageCount: 2 });

    const detail = await store.handleAdminApiRequest("GET", "/users/usage-user/detail", await authorization());
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      aiTasks: [
        { model: "gpt-image-2", usage: { usageKind: "images", imageCount: 2 } },
        { model: "gpt-5.4-mini", usage: { usageKind: "tokens", promptTokens: 812, completionTokens: 216 } },
      ],
    });
  });
});
