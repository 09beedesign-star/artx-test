import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("skills store filters", () => {
  it("keeps only a right-aligned search field in the filter row", () => {
    const source = readFileSync(resolve(__dirname, "SkillsPage.tsx"), "utf-8");

    expect(source).not.toContain(">热度<");
    expect(source).not.toContain(">状态<");
    expect(source).not.toContain("setSortMode");
    expect(source).not.toContain("sortMode");
    expect(source).toContain("md:ml-auto");
    expect(source).toContain('placeholder="搜索技能、尺寸"');
  });
});
