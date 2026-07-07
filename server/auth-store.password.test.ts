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
  delete process.env.EMAIL_DRY_RUN;
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

describe("forgot password", () => {
  it("does not expose reset tokens or reveal whether an account exists", async () => {
    const { handleAuthAction } = await loadAuthStore();

    const registerResult = await handleAuthAction("register", {
      username: "admin@example.com",
      password: "old-password",
    });
    expect(registerResult.status).toBe(200);

    const existingResult = await handleAuthAction("forgot-password", {
      username: "admin@example.com",
    });
    expect(existingResult.status).toBe(200);
    expect(existingResult.body).toMatchObject({
      ok: true,
      message: "如果账号存在，密码重置申请已记录，请联系管理员处理。",
    });
    expect(existingResult.body).not.toHaveProperty("resetToken");

    const missingResult = await handleAuthAction("forgot-password", {
      username: "missing@example.com",
    });
    expect(missingResult.status).toBe(200);
    expect(missingResult.body).toEqual(existingResult.body);
  });
});

describe("email verification auth", () => {
  it("registers a custom email account with a verification code", async () => {
    process.env.EMAIL_DRY_RUN = "true";
    const { handleAuthAction } = await loadAuthStore();

    const sendResult = await handleAuthAction("email-send-code", {
      email: "owner@custom-domain.test",
    });
    expect(sendResult.status).toBe(200);
    const debugCode = (sendResult.body as { debugCode?: string }).debugCode;
    expect(debugCode).toMatch(/^\d{6}$/);

    const loginResult = await handleAuthAction("email-login", {
      email: "owner@custom-domain.test",
      code: debugCode,
    });
    expect(loginResult.status).toBe(200);
    expect((loginResult.body as { user?: { username?: string } }).user?.username).toBe("owner@custom-domain.test");
    expect((loginResult.body as { token?: string }).token).toBeTruthy();
  });

  it("supports Gmail addresses through the same email verification flow", async () => {
    process.env.EMAIL_DRY_RUN = "true";
    const { handleAuthAction } = await loadAuthStore();

    const sendResult = await handleAuthAction("email-send-code", {
      email: "beekangrui@gmail.com",
    });
    expect(sendResult.status).toBe(200);
    const debugCode = (sendResult.body as { debugCode?: string }).debugCode;

    const loginResult = await handleAuthAction("email-login", {
      email: "beekangrui@gmail.com",
      code: debugCode,
    });
    expect(loginResult.status).toBe(200);
    expect((loginResult.body as { user?: { username?: string } }).user?.username).toBe("beekangrui@gmail.com");
  });
});
