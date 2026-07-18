import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let dataDir = "";

async function loadStore() {
  vi.resetModules();
  process.env.ARTX_ADMIN_DATA_BACKEND = "json";
  process.env.ARTX_AUTH_DATA_BACKEND = "json";
  process.env.ARTX_DATA_DIR = dataDir;
  return import("./admin-store");
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "artx-external-agent-usage-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.ARTX_ADMIN_DATA_BACKEND;
  delete process.env.ARTX_AUTH_DATA_BACKEND;
  delete process.env.ARTX_DATA_DIR;
});

describe("external agent usage monitor", () => {
  it("aggregates masked API-key usage and converts immutable USD estimates to HKD", async () => {
    const store = await loadStore();
    await store.recordExternalAgentUsage({
      apiKeyId: "key-1",
      apiKeyPrefix: "artx_sk_abc12345",
      agentSource: "Claude Desktop",
      toolName: "artx_generate_image",
      capability: "text_to_image",
      model: "og-image2-medium",
      status: "success",
      latencyMs: 820,
      outputUnits: 1,
      chargedCredits: 10,
      estimatedCostUsd: 0.4,
    });

    const usage = await store.getExternalAgentUsage({ range: "all" });

    expect(usage.summary).toMatchObject({
      calls: 1,
      successfulCalls: 1,
      chargedCredits: 10,
      estimatedCostUsd: 0.4,
      estimatedCostHkd: 3.12,
    });
    expect(usage.byKey).toEqual([expect.objectContaining({
      apiKeyId: "key-1",
      apiKey: "artx_sk_abc12345...",
      agentSource: "Claude Desktop",
      calls: 1,
    })]);
    expect(JSON.stringify(usage)).not.toContain("artx_sk_abc12345_secret");
  });

  it("keeps missing tokens empty and filters failed calls by source", async () => {
    const store = await loadStore();
    await store.recordExternalAgentUsage({
      apiKeyId: "key-2", apiKeyPrefix: "artx_sk_def67890", agentSource: "Custom Agent",
      toolName: "artx_generate_image", capability: "text_to_image", model: "mj-v7",
      status: "failed", latencyMs: 300, outputUnits: 0, chargedCredits: 0, estimatedCostUsd: 0,
      failureCategory: "上游失败",
    });

    const usage = await store.getExternalAgentUsage({ range: "all", agentSource: "Custom Agent", status: "failed" });

    expect(usage.summary).toMatchObject({ calls: 1, failedCalls: 1, inputTokens: 0, outputTokens: 0 });
    expect(usage.events[0]).toMatchObject({ failureCategory: "上游失败" });
    expect(usage.events[0]).not.toHaveProperty("inputTokens");
    expect(usage.events[0]).not.toHaveProperty("outputTokens");
  });
});
