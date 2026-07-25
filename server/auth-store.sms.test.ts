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
  process.env.SMS_DRY_RUN = "true";
  return import("./auth-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-sms-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.SMS_DRY_RUN;
});

describe("SMS auth", () => {
  it("sends a verification code and logs in a phone user with the correct code", async () => {
    const { handleAuthAction } = await loadAuthStore();

    const sendResult = await handleAuthAction("sms-send-code", { phone: "13800138000" });

    expect(sendResult.status).toBe(200);
    expect("debugCode" in sendResult.body).toBe(true);
    const debugCode = (sendResult.body as { debugCode: string }).debugCode;

    const failedLogin = await handleAuthAction("sms-login", { phone: "13800138000", code: "000000" });
    expect(failedLogin.status).toBe(401);

    const loginResult = await handleAuthAction("sms-login", { phone: "13800138000", code: debugCode });

    expect(loginResult.status).toBe(200);
    expect((loginResult.body as { token?: string }).token).toBeTruthy();
    expect((loginResult.body as { user?: { username?: string } }).user?.username).toBe("+8613800138000");
  });

  it("rate limits repeated SMS code requests within the resend window", async () => {
    const { handleAuthAction } = await loadAuthStore();

    const first = await handleAuthAction("sms-send-code", { phone: "13800138001" });
    const second = await handleAuthAction("sms-send-code", { phone: "13800138001" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect((second.body as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(0);
  });
});
