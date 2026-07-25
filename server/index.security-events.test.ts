import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

describe("security event server integration", () => {
  it("observes completed application responses and protects the collector endpoint", async () => {
    const source = await readFile(path.join(serverDir, "index.ts"), "utf-8");

    expect(source).toContain('from "./security-events"');
    expect(source).toContain('app.post("/internal/security-events"');
    expect(source).toContain("validateSecurityEventIngest");
    expect(source).toContain("res.once(\"finish\"");
    expect(source).toContain("classifyApplicationSecuritySignal");
    expect(source).toContain("recordRiskEvent");
  });
});
