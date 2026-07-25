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
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-auth-session-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
});

describe("auth session restore", () => {
  it("returns ok=true for valid sessions so the frontend keeps local auth state", async () => {
    const { handleAuthAction } = await loadAuthStore();

    const registerResult = await handleAuthAction("register", {
      username: "restore@example.com",
      password: "old-password",
    });
    expect(registerResult.status).toBe(200);
    const token = (registerResult.body as { token: string }).token;

    const sessionResult = await handleAuthAction("me", { token });
    expect(sessionResult.status).toBe(200);
    expect(sessionResult.body).toMatchObject({
      ok: true,
      user: {
        username: "restore@example.com",
      },
    });
  });
});
