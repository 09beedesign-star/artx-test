import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir = "";

async function loadStore() {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return import("./auth-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-model-access-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const key of [
    "ARTX_AUTH_DATA_BACKEND",
    "ARTX_DATA_DIR",
    "ADMIN_SESSION_SECRET",
    "ARTX_BOOTSTRAP_ADMIN_USERNAME",
    "ARTX_BOOTSTRAP_ADMIN_PASSWORD",
  ]) delete process.env[key];
});

describe("auth user model access", () => {
  it("defaults new users to every selectable model and persists an admin allowlist", async () => {
    const store = await loadStore();
    const created = await store.createAuthUserForAdmin({
      actorId: "admin",
      actorName: "admin@example.com",
      username: "limited@example.com",
    });

    expect(created.status).toBe(201);
    if (created.status !== 201) throw new Error("Expected test user to be created");
    expect(created.body.user.allowedAiModels).toEqual(expect.arrayContaining([
      "gpt-image-2",
      "gpt-5.4-mini",
    ]));

    const updated = await store.updateAuthUserAdmin({
      actorId: "admin",
      actorName: "admin@example.com",
      userId: created.body.user.id,
      allowedAiModels: ["IMAGE2", "gpt-5.4-mini", "picwish-scale"],
    });

    expect(updated.status).toBe(200);
    expect(updated.body.user.allowedAiModels).toEqual(["gpt-image-2", "gpt-5.4-mini"]);
  });
});
