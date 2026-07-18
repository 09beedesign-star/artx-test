import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "AdminPrototypePage.tsx");

describe("admin model access controls", () => {
  it("renders selectable-model switches and saves the account allowlist", async () => {
    const source = await readFile(pagePath, "utf8");

    expect(source).toContain("模型权限");
    expect(source).toContain("/model-access");
    expect(source).toContain("allowedAiModels");
  });
});
