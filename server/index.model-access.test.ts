import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

describe("AI route model access enforcement", () => {
  it("checks user model access before reserving AI usage", async () => {
    const source = await readFile(path.join(serverDir, "index.ts"), "utf8");
    expect(source).toContain('from "./user-model-access"');
    expect(source).toContain("assertUserCanUseSelectableModel(user, tracking.model, tracking.capabilityKey)");
    expect(source.indexOf("assertUserCanUseSelectableModel(user, tracking.model, tracking.capabilityKey)")).toBeLessThan(
      source.indexOf("reserveAiRouteUsage({ user, tracking, request: req.body })"),
    );
  });
});
