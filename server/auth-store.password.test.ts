import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir = "";

async function loadAuthStore() {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  return import("./auth-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-password-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
});

describe("password change", () => {
  it("requires the current password and returns a fresh session token", async () => {
    const { handleAuthAction } = await loadAuthStore();

    const registerResult = await handleAuthAction("register", {
      username: "admin@example.com",
      password: "old-password",
    });
    expect(registerResult.status).toBe(200);
    const originalToken = (registerResult.body as { token: string }).token;

    const wrongPasswordResult = await handleAuthAction("change-password", {
      token: originalToken,
      currentPassword: "wrong-password",
      newPassword: "new-password",
    });
    expect(wrongPasswordResult.status).toBe(401);

    const changeResult = await handleAuthAction("change-password", {
      token: originalToken,
      currentPassword: "old-password",
      newPassword: "new-password",
    });
    expect(changeResult.status).toBe(200);
    const newToken = (changeResult.body as { token?: string }).token;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(originalToken);

    const oldTokenSession = await handleAuthAction("me", { token: originalToken });
    expect(oldTokenSession.status).toBe(401);

    const newLogin = await handleAuthAction("login", {
      username: "admin@example.com",
      password: "new-password",
    });
    expect(newLogin.status).toBe(200);
  });
});
