import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const canvasPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "InfiniteCanvas.tsx");

describe("canvas model access", () => {
  it("filters visible model menus using the authenticated allowlist", async () => {
    const source = await readFile(canvasPath, "utf8");

    expect(source).toContain("filterAllowedAiModelOptions");
    expect(source).toContain("allowedAiModels");
    expect(source).toContain("resolveAllowedAiModelId");
    expect(source).toContain('allowedAiModels.includes("og-image2-medium")');
  });
});
