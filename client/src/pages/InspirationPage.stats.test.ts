import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InspirationPage summary stats", () => {
  it("does not render the image and category summary modules", () => {
    const pageSource = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");

    expect(pageSource).not.toContain('{ icon: ImageIcon, label: "图片案例"');
    expect(pageSource).not.toContain('{ icon: Tags, label: "分类"');
    expect(pageSource).not.toContain("Object.values(INSPIRATION_TAXONOMY).flat().length");
  });
});
