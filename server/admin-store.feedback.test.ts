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
  process.env.ARTX_UPLOADS_DIR = path.join(dataDir, "uploads");
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME = "admin@example.com";
  process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD = "secure-admin-password";
  return {
    admin: await import("./admin-store"),
    auth: await import("./auth-store"),
  };
}

async function getAdminAuthorization() {
  const { handleAuthAction } = await import("./auth-store");
  const result = await handleAuthAction("login", {
    username: "admin@example.com",
    password: "secure-admin-password",
  });
  expect(result.status).toBe(200);
  const body = result.body as { token?: string };
  expect(body.token).toBeTruthy();
  return `Bearer ${body.token}`;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-feedback-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ARTX_UPLOADS_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD;
});

describe("user feedback submission", () => {
  it("stores user feedback with image attachments and creates an unread admin message", async () => {
    const { admin, auth } = await loadStores();
    const register = await auth.handleAuthAction("register", {
      username: "feedback-user@example.com",
      password: "feedback-password",
    });
    expect(register.status).toBe(200);
    const user = (register.body as { user: { id: string; username: string } }).user;

    const result = await admin.submitUserFeedback({
      user,
      content: "支付之后没有看到积分到账，请帮我看一下。",
      attachments: [
        {
          name: "payment-screenshot.png",
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        },
      ],
    });

    expect(result.status).toBe(200);
    const feedback = (result.body as { feedback: { user: string; content: string; attachments: Array<{ src: string; name: string }> } }).feedback;
    expect(feedback).toMatchObject({
      user: "feedback-user@example.com",
      content: "支付之后没有看到积分到账，请帮我看一下。",
    });
    expect(feedback.attachments).toEqual([
      expect.objectContaining({
        name: "payment-screenshot.png",
        src: expect.stringMatching(/^\/uploads\/feedback\/feedback-user%40example\.com\//),
      }),
    ]);

    const overview = await admin.handleAdminApiRequest("GET", "/overview", await getAdminAuthorization());
    expect(overview.status).toBe(200);
    const body = overview.body as {
      feedback: Array<{ id: string; status: string; attachments?: Array<{ src: string }> }>;
    };
    expect(body.feedback).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^fb_/),
      status: "new",
      attachments: [expect.objectContaining({ src: feedback.attachments[0].src })],
    }));
  });
});
