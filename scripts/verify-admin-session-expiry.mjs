#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-session-"));
process.env.ARTX_DATA_DIR = dataDir;
process.env.ARTX_SESSION_TTL_MS = "5";

try {
  const { handleAuthAction, getAdminSessionFromAuthorization } = await import(`../server/auth-store.ts?sessionExpiry=${Date.now()}`);
  const login = await handleAuthAction("login", { username: "09bee", password: "1234" });
  assert.equal(login.status, 200, "default admin should login before session expiry");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const session = await getAdminSessionFromAuthorization(`Bearer ${login.body.token}`);
  assert.equal(session.status, 401, "expired admin session should be rejected");
  console.log("verify-admin-session-expiry: ok");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
