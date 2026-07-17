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

async function getSuperAdminAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const login = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(login.status).toBe(200);
  return `Bearer ${(login.body as { token: string }).token}`;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-test-accounts-"));
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

describe("admin test accounts", () => {
  it("issues, limits, and irreversibly cancels a test account", async () => {
    const { admin, auth } = await loadStores();
    const authorization = await getSuperAdminAuthorization();

    const issued = await admin.handleAdminApiRequest("POST", "/test-accounts", authorization, {
      email: "qa-demo@example.com",
      initialCredits: 200,
      dailyCreditLimit: 50,
      expiresAt: "2026-08-17T15:59:59.000Z",
    });

    expect(issued.status).toBe(201);
    const issuedBody = issued.body as {
      user: { id: string; accountType: string; credits: number; testProfile: { dailyCreditLimit: number } };
      temporaryPassword: string;
    };
    expect(issuedBody.user).toMatchObject({ accountType: "test", credits: 200 });
    expect(issuedBody.user.testProfile.dailyCreditLimit).toBe(50);
    expect(issuedBody.temporaryPassword).toMatch(/^ArtX-/);

    const login = await auth.handleAuthAction("login", {
      username: "qa-demo@example.com",
      password: issuedBody.temporaryPassword,
    });
    expect(login.status).toBe(200);

    const adjusted = await admin.handleAdminApiRequest("POST", `/users/${issuedBody.user.id}/test-profile`, authorization, {
      creditDelta: 40,
      dailyCreditLimit: 30,
      expiresAt: "2026-08-18T15:59:59.000Z",
    });
    expect(adjusted.status).toBe(200);

    const cancelled = await admin.handleAdminApiRequest("POST", `/users/${issuedBody.user.id}/test-account/cancel`, authorization, { confirm: true });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      user: { status: "cancelled", credits: 0, accountType: "test" },
    });

    const blockedLogin = await auth.handleAuthAction("login", {
      username: "qa-demo@example.com",
      password: issuedBody.temporaryPassword,
    });
    expect(blockedLogin.status).toBe(403);
  });
});
