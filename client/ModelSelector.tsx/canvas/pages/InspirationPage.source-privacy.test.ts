import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InspirationPage source privacy", () => {
  it("does not expose source navigation or legacy inspiration wording in the UI source", () => {
    const pageSource = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");
    const homeSource = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");
    const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
    const shellSource = readFileSync(resolve(__dirname, "../components/layout/AppShell.tsx"), "utf-8");
    const loadingSource = readFileSync(resolve(__dirname, "LoadingLoopPage.tsx"), "utf-8");

    expect(pageSource).not.toContain("查看来源");
    expect(pageSource).not.toContain("灵感选题");
    expect(pageSource).not.toContain("一级分类");
    expect(pageSource).not.toContain("二级分类");
    expect(pageSource).not.toContain("sourceUrl");
    expect(pageSource).not.toContain("licenseNote");
    expect(pageSource).toContain("主分类筛选");
    expect(pageSource).toContain("细分类筛选");
    expect(homeSource).not.toContain("灵感选题");
    expect(appSource).not.toContain("灵感选题");
    expect(shellSource).not.toContain("灵感选题");
    expect(loadingSource).not.toContain("灵感选题");
    /*
     * ⚠️ 实现搬家导致的失锚，按「约束是否还成立」重锚，不是删断言求绿。
     * 约束「只拉已验证提示词的条目」依然成立，但拼 URL 的代码已从本页
     * 抽到共享模块 `lib/inspiration-feed.ts`（首页和本页必须同源，
     * 否则同一条灵感在两页 title 不同，头像与点赞数对不上）。
     * 所以锚点跟着搬到共享模块，并在本页确认它确实走了共享取数函数。
     */
    const feedSource = readFileSync(
      resolve(__dirname, "../lib/inspiration-feed.ts"),
      "utf-8"
    );
    expect(feedSource).toContain("verifiedPromptOnly=1");
    expect(pageSource).toContain("fetchInspirationFeed(controller.signal, INSPIRATION_TARGET_COUNT)");
    expect(pageSource).toContain("const allPromptItems = useMemo(() => externalItems, [externalItems]);");
  });
});
