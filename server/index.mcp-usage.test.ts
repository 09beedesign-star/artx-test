import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

describe("MCP external-agent usage instrumentation", () => {
  it("records safe API-key identity and request-local agent metadata without raw keys", async () => {
    const source = await readFile(path.join(serverDir, "index.ts"), "utf8");

    expect(source).toContain('recordExternalAgentUsage');
    expect(source).toContain('apiKeyId: auth.body.apiKey.id');
    expect(source).toContain('apiKeyPrefix: auth.body.apiKey.prefix');
    expect(source).toContain('meta.agentSource');
    expect(source).not.toContain('apiKeyValue:');
  });

  it("records success and failure after the existing MCP AI ledger calls", async () => {
    const source = await readFile(path.join(serverDir, "index.ts"), "utf8");
    const ledgerCall = source.indexOf('await recordAiRouteUsage({');
    const externalCall = source.indexOf('await recordExternalAgentUsage({');

    expect(ledgerCall).toBeGreaterThan(-1);
    expect(externalCall).toBeGreaterThan(ledgerCall);
    expect(source.match(/recordExternalAgentUsage\(\{/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
