import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      { allowedAiModels: ["gpt-image-2", "gpt-5.4-mini"] },
    );

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      user: {
        id: created.body.user.id,
        allowedAiModels: ["gpt-image-2", "gpt-5.4-mini"],
      },
    });
  });
});
