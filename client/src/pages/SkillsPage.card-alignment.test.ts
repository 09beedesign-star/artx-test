import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("skills store card alignment", () => {
  it("anchors every quick-load button to the bottom of its equal-height grid card", () => {
    const source = readFileSync(resolve(__dirname, "SkillsPage.tsx"), "utf-8");

    expect(source).toContain('className="mt-auto pt-3"');
    expect(source).toContain("h-full min-h-[220px]");
    expect(source).toContain('className="inline-flex h-9 w-full');
  });
});
