import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir = "";

async function loadAdminStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  return import("./admin-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-admin-risk-test-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
  delete process.env.ADMIN_SESSION_SECRET;
});

describe("risk event recording", () => {
  it("writes a risk event and matching alert", async () => {
    const { recordRiskEvent } = await loadAdminStore();

    await recordRiskEvent({
      title: "短信验证码错误次数过多",
      detail: "测试手机号触发验证码错误次数限制",
      target: "phone:138****8000",
      severity: "high",
    });

    const data = JSON.parse(await readFile(path.join(dataDir, "admin-data.json"), "utf-8"));
    expect(data.riskEvents[0]).toMatchObject({
      title: "短信验证码错误次数过多",
      target: "phone:138****8000",
      severity: "high",
      status: "open",
    });
    expect(data.alerts[0]).toMatchObject({
      category: "风控",
      severity: "critical",
      linkedSection: "risk",
      time: expect.stringMatching(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/),
    });
  });
});
