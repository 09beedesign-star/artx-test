import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage inspiration entry", () => {
  it("shows a highlighted link to the full inspiration page", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain("查看全部灵感推荐");
    expect(source).toContain("const openInspirationPage = () => navigate(\"/inspiration\")");
    expect(source).toContain("onClick={openInspirationPage}");
  });
});
