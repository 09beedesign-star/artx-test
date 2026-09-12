import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEXT_MODEL } from "../shared/text-models";
import { DEFAULT_IMAGE_MODEL_ID } from "../shared/image-models";

let dataDir = "";

async function loadStores() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return {
    admin: await import("./admin-store"),
    auth: await import("./auth-store"),
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-model-access-"));
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

describe("admin model access", () => {
  it("updates a regular account's selectable model allowlist", async () => {
    const { admin, auth } = await loadStores();
    const adminLogin = await auth.handleAuthAction("login", {
      username: "admin@example.com",
      password: "secure-admin-password",
    });
    if (adminLogin.status !== 200) throw new Error("Expected admin login");
    const authorization = `Bearer ${adminLogin.body.token}`;
    const created = await auth.createAuthUserForAdmin({
      actorId: adminLogin.body.user.id,
      actorName: "admin@example.com",
      username: "regular@example.com",
    });
    if (created.status !== 201) throw new Error("Expected account creation");

    const updated = await admin.handleAdminApiRequest(
      "POST",
      `/users/${created.body.user.id}/model-access`,
      authorization,
      { allowedAiModels: [DEFAULT_IMAGE_MODEL_ID, DEFAULT_TEXT_MODEL] },
    );

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      user: {
        id: created.body.user.id,
        allowedAiModels: [DEFAULT_IMAGE_MODEL_ID, DEFAULT_TEXT_MODEL],
      },
    });
  });

  it("migrates a retired relay image model written through the admin API", async () => {
    /**
     * 管理后台可以直接写任意 id（比如运营从旧文档里复制粘贴），
     * 这条路径绕过了前端选择器，是旧 id 进入系统的最后一个入口。
     *
     * 写入时必须就地迁移成等价 VOD 模型，而不是原样落库或静默丢弃：
     * 原样落库会在下次读盘时被 filter 掉（白名单被清空），
     * 静默丢弃则会让运营以为「授权成功了」实际一个模型都没授权。
     */
    const { admin, auth } = await loadStores();
    const adminLogin = await auth.handleAuthAction("login", {
      username: "admin@example.com",
      password: "secure-admin-password",
    });
    if (adminLogin.status !== 200) throw new Error("Expected admin login");
    const created = await auth.createAuthUserForAdmin({
      actorId: adminLogin.body.user.id,
      actorName: "admin@example.com",
      username: "legacy-write@example.com",
    });
    if (created.status !== 201) throw new Error("Expected account creation");

    const updated = await admin.handleAdminApiRequest(
      "POST",
      `/users/${created.body.user.id}/model-access`,
      `Bearer ${adminLogin.body.token}`,
      { allowedAiModels: ["og-image2-medium", "keling", DEFAULT_TEXT_MODEL] },
    );

    expect(updated.status).toBe(200);
    expect(updated.body.user.allowedAiModels).toEqual([
      DEFAULT_IMAGE_MODEL_ID,
      "vod-kling",
      DEFAULT_TEXT_MODEL,
    ]);
  });
});
