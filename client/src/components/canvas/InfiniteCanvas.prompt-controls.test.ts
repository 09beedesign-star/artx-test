import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InfiniteCanvas prompt controls", () => {
  it("uses the minimap surface color for prompt model and Skill button defaults while keeping hover styling", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("getMinimapSurfaceBackground");
    expect(source).toContain("const bg = getMinimapSurfaceBackground(isDark)");
    expect(source).toContain("hoverButtonBg");
    expect(source).toContain("buttonHover");
  });
});
