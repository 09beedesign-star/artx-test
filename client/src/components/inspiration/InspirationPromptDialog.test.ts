import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InspirationPromptDialog", () => {
  it("uses the same verified inspiration endpoint and supports double-click detail plus prompt copying", () => {
    const source = readFileSync(resolve(__dirname, "InspirationPromptDialog.tsx"), "utf-8");

    expect(source).toContain("verifiedPromptOnly=1");
    expect(source).toContain("onDoubleClick");
    expect(source).toContain("复制提示词");
    expect(source).toContain("data-inspiration-prompt-dialog");
  });

  it("delays inspiration image zoom until a card has been hovered for 500ms", () => {
    const source = readFileSync(resolve(__dirname, "InspirationPromptDialog.tsx"), "utf-8");

    expect(source).toContain("hoveredItemKey");
    expect(source).toContain("setTimeout");
    expect(source).toContain("500");
    expect(source).toContain("clearTimeout");
    expect(source).toContain('transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)"');
    expect(source).toContain("transition-transform");
  });
});
