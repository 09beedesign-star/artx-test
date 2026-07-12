import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InspirationPage source privacy", () => {
  it("does not expose source navigation or legacy inspiration wording in the UI source", () => {
    const pageSource = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");
    const homeSource = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(pageSource).not.toContain("查看来源");
    expect(pageSource).not.toContain("灵感选题");
    expect(pageSource).not.toContain("一级分类");
    expect(pageSource).not.toContain("二级分类");
    expect(pageSource).not.toContain("sourceUrl");
    expect(pageSource).not.toContain("licenseNote");
    expect(pageSource).toContain("主分类筛选");
    expect(pageSource).toContain("细分类筛选");
    expect(homeSource).not.toContain("灵感选题");
    expect(pageSource).toContain("verifiedPromptOnly=1");
  });
});
