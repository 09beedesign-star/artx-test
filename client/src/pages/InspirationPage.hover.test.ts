import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InspirationPage card hover", () => {
  it("delays image zoom until a card has been hovered for 500ms", () => {
    const source = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");

    expect(source).toContain("hoveredItemKey");
    expect(source).toContain("setTimeout");
    expect(source).toContain("500");
    expect(source).toContain("clearTimeout");
    expect(source).toContain('transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)"');
    expect(source).toContain("transition-transform");
    expect(source).not.toContain("group-hover:scale-105");
  });
});
