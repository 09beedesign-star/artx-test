import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_AUTH_MESSAGES, validatePhoneAuthPassword } from "../shared/phone-auth-rules";

let dataDir = "";

async function loadAuthStore(phoneAuth = true) {
  vi.resetModules();
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.SMS_DRY_RUN = "true";
  process.env.ARTX_PHONE_AUTH_ENABLED = phoneAuth ? "true" : "";
  return import("./auth-store");
}

type Body = Record<string, unknown>;
const errorOf = (r: { body: unknown }) => (r.body as { error?: string }).error;
const codeOf = (r: { body: unknown }) => (r.body as { debugCode: string }).debugCode;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-phone-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const key of ["ARTX_AUTH_DATA_BACKEND", "ARTX_ADMIN_DATA_BACKEND", "ARTX_DATA_DIR", "ADMIN_SESSION_SECRET", "SMS_DRY_RUN", "ARTX_PHONE_AUTH_ENABLED"]) {
    delete process.env[key];
  }
});

async function registerPhone(
  handleAuthAction: (action: never, body: Body) => Promise<{ status: number; body: unknown }>,
  phone: string,
  password = "abc12345",
) {
  const sent = await handleAuthAction("phone-send-code" as never, { phone, purpose: "register" });
  expect(sent.status).toBe(200);
  return handleAuthAction("phone-register" as never, { phone, password, code: codeOf(sent), agreed: true });
}

describe("password rules (shared, front + back)", () => {
  it("returns the SparkX copy for each failure", () => {
    expect(validatePhoneAuthPassword("")).toBe(PHONE_AUTH_MESSAGES.emptyPassword);
    expect(validatePhoneAuthPassword("abc123")).toBe(PHONE_AUTH_MESSAGES.passwordTooShort);
    expect(validatePhoneAuthPassword("abcdefgh")).toBe(PHONE_AUTH_MESSAGES.passwordNeedsLetterAndDigit);
    expect(validatePhoneAuthPassword("12345678")).toBe(PHONE_AUTH_MESSAGES.passwordNeedsLetterAndDigit);
    expect(validatePhoneAuthPassword("abc12345")).toBe("");
  });
});

describe("phone + password account flow (SparkX structure)", () => {
  it("registers with a code, then logs in with phone + password", async () => {
    const { handleAuthAction } = await loadAuthStore();
    const reg = await registerPhone(handleAuthAction as never, "13900139000");
    expect(reg.status).toBe(200);
    expect((reg.body as { user?: { username?: string } }).user?.username).toBe("+8613900139000");

    const login = await handleAuthAction("phone-login", { phone: "13900139000", password: "abc12345", agreed: true });
    expect(login.status).toBe(200);
    expect((login.body as { token?: string }).token).toBeTruthy();
  });

  it("rejects wrong password with the SparkX message", async () => {
    const { handleAuthAction } = await loadAuthStore();
    await registerPhone(handleAuthAction as never, "13900139001");
    const bad = await handleAuthAction("phone-login", { phone: "13900139001", password: "wrong1234", agreed: true });
    expect(bad.status).toBe(401);
    expect(errorOf(bad)).toBe(PHONE_AUTH_MESSAGES.wrongCredentials);
  });

  it("requires agreement on the server for register and login", async () => {
    const { handleAuthAction } = await loadAuthStore();
    const sent = await handleAuthAction("phone-send-code", { phone: "13900139002", purpose: "register" });
    const reg = await handleAuthAction("phone-register", { phone: "13900139002", password: "abc12345", code: codeOf(sent) });
    expect(reg.status).toBe(400);
    expect(errorOf(reg)).toBe(PHONE_AUTH_MESSAGES.agreementRequired);

    const login = await handleAuthAction("phone-login", { phone: "13900139002", password: "abc12345" });
    expect(login.status).toBe(400);
    expect(errorOf(login)).toBe(PHONE_AUTH_MESSAGES.agreementRequired);
  });

  it("enforces password rules on the server", async () => {
    const { handleAuthAction } = await loadAuthStore();
    const sent = await handleAuthAction("phone-send-code", { phone: "13900139003", purpose: "register" });
    const reg = await handleAuthAction("phone-register", { phone: "13900139003", password: "abcdefgh", code: codeOf(sent), agreed: true });
    expect(reg.status).toBe(400);
    expect(errorOf(reg)).toBe(PHONE_AUTH_MESSAGES.passwordNeedsLetterAndDigit);
  });

  it("refuses to send a register code to an already-registered phone (409)", async () => {
    const { handleAuthAction } = await loadAuthStore();
    await registerPhone(handleAuthAction as never, "13900139004");
    const again = await handleAuthAction("phone-send-code", { phone: "13900139004", purpose: "register" });
    expect(again.status).toBe(409);
    expect(errorOf(again)).toBe(PHONE_AUTH_MESSAGES.phoneRegistered);
  });

  it("refuses to send a reset code to an unregistered phone (404)", async () => {
    const { handleAuthAction } = await loadAuthStore();
    const res = await handleAuthAction("phone-send-code", { phone: "13900139005", purpose: "reset" });
    expect(res.status).toBe(404);
    expect(errorOf(res)).toBe(PHONE_AUTH_MESSAGES.phoneNotRegistered);
  });

  it("isolates code purposes: a register code cannot reset a password, nor an sms-login code register", async () => {
    const { handleAuthAction } = await loadAuthStore();
    // sms-login 码不能拿来注册
    const loginCode = await handleAuthAction("sms-send-code", { phone: "13900139006" });
    const crossReg = await handleAuthAction("phone-register", {
      phone: "13900139006", password: "abc12345", code: codeOf(loginCode), agreed: true,
    });
    expect(crossReg.status).toBe(400);
    expect(errorOf(crossReg)).toBe(PHONE_AUTH_MESSAGES.codeInvalidOrExpired);

    // 注册用掉的码不能再拿去重置密码（没有 reset 用途的挑战）
    const sent = await handleAuthAction("phone-send-code", { phone: "13900139007", purpose: "register" });
    const regCode = codeOf(sent);
    await handleAuthAction("phone-register", { phone: "13900139007", password: "abc12345", code: regCode, agreed: true });
    const crossReset = await handleAuthAction("phone-reset-password", { phone: "13900139007", password: "xyz98765", code: regCode });
    expect(crossReset.status).toBe(400);
    expect(errorOf(crossReset)).toBe(PHONE_AUTH_MESSAGES.codeInvalidOrExpired);
  });

  it("resets the password with a reset code, old password stops working", async () => {
    const { handleAuthAction } = await loadAuthStore();
    await registerPhone(handleAuthAction as never, "13900139008");
    const sent = await handleAuthAction("phone-send-code", { phone: "13900139008", purpose: "reset" });
    expect(sent.status).toBe(200);
    const reset = await handleAuthAction("phone-reset-password", { phone: "13900139008", password: "new12345", code: codeOf(sent) });
    expect(reset.status).toBe(200);

    const oldLogin = await handleAuthAction("phone-login", { phone: "13900139008", password: "abc12345", agreed: true });
    expect(oldLogin.status).toBe(401);
    const newLogin = await handleAuthAction("phone-login", { phone: "13900139008", password: "new12345", agreed: true });
    expect(newLogin.status).toBe(200);
  });

  it("keeps legacy username login working", async () => {
    const { handleAuthAction } = await loadAuthStore();
    const reg = await handleAuthAction("register", { username: "legacy@example.com", password: "legacy-pass" });
    expect(reg.status).toBe(200);
    const login = await handleAuthAction("login", { username: "legacy@example.com", password: "legacy-pass" });
    expect(login.status).toBe(200);
  });
});

describe("phone auth feature switch (ARTX_PHONE_AUTH_ENABLED)", () => {
  it("switch off: every phone-* action is 404 and features report off", async () => {
    const { handleAuthAction, getAuthFeatures } = await loadAuthStore(false);
    expect(getAuthFeatures()).toEqual({ phoneAuth: false });
    for (const action of ["phone-send-code", "phone-register", "phone-login", "phone-reset-password"] as const) {
      const res = await handleAuthAction(action, { phone: "13900139100", purpose: "register", password: "abc12345", code: "123456", agreed: true });
      expect(res.status, action).toBe(404);
    }
  });

  it("switch on: features report on", async () => {
    const { getAuthFeatures } = await loadAuthStore(true);
    expect(getAuthFeatures()).toEqual({ phoneAuth: true });
  });

  it("switch on: existing username/email accounts (even with short legacy passwords) still log in unchanged", async () => {
    const { handleAuthAction } = await loadAuthStore(true);
    const reg = await handleAuthAction("register", { username: "old-user@example.com", password: "1234" });
    expect(reg.status).toBe(200);
    const userId = (reg.body as { user: { id: string } }).user.id;

    const login = await handleAuthAction("login", { username: "old-user@example.com", password: "1234" });
    expect(login.status).toBe(200);
    // 同一个账号 id —— 积分 / 会员 / 作品都挂在 id 上，所以权益不变
    expect((login.body as { user: { id: string } }).user.id).toBe(userId);
  });
});
