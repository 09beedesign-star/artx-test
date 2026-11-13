import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

const rawSources = new Map<string, string>();
const read = (file: string) => {
  if (!rawSources.has(file)) {
    rawSources.set(file, readFileSync(resolve(__dirname, file), "utf-8"));
  }
  // ⚠️ 源码注释里写了旧的 `.slice(0, 60)`，不剥注释反向断言会恒红。
  return stripSourceComments(rawSources.get(file)!);
};

describe("InspirationPromptDialog", () => {
  it("剥注释没有把源码吃掉（检测器自检）", () => {
    const raw = readFileSync(resolve(__dirname, "InspirationPromptDialog.tsx"), "utf-8");
    assertStripKeptSource(raw, stripSourceComments(raw), 0.3);
  });
  it("uses the shared verified inspiration feed instead of a private copy of the endpoint", () => {
    const source = read("InspirationPromptDialog.tsx");
    const feed = read("../../lib/inspiration-feed.ts");

    // 端点参数现在收口在唯一事实源里；弹窗只负责调用。
    expect(feed).toContain("verifiedPromptOnly=1");
    expect(source).toContain("fetchInspirationFeed(controller.signal");
    expect(source).toContain("INSPIRATION_TARGET_COUNT");
    // ⚠️ 弹窗里再出现一份请求/映射就是多出口，口径漂移零报错。
    expect(source).not.toContain("/api/inspiration/references?");
    expect(source).not.toContain("toPromptItem");

    expect(source).toContain("onDoubleClick");
    expect(source).toContain("data-inspiration-prompt-dialog");
  });

  /**
   * 2026-11-10 用户报「灵感模板少了很多」：
   * 线上接口 900 条完好，是弹窗末尾写死 `.slice(0, 60)` 只给看 60 条。
   * ✅ 改为按 DIALOG_PAGE_SIZE 分批 + 「加载更多」，并把真实总量写出来。
   */
  it("paginates the full feed instead of hard-capping the list at 60", () => {
    const source = read("InspirationPromptDialog.tsx");

    expect(source).not.toContain(".slice(0, 60)");
    expect(source).toContain("DIALOG_PAGE_SIZE");
    expect(source).toContain("scopedItems.slice(0, visibleCount)");
    expect(source).toContain("canLoadMore");
    expect(source).toContain("加载更多");
    // 🔒 2026-11-13 用户要求：灵感总数不在前端显示
    expect(source).not.toContain("共 {scopedItems.length} 条");
    expect(source).not.toContain("{scopedItems.length}");
    // 分类切换要回到第一批，否则换分类后还停在上一批的可见数量上。
    expect(source).toContain("setVisibleCount(DIALOG_PAGE_SIZE)");
  });

  /** 远程空数组 / 失败时不能整页空态 —— 专题页早就有这条兜底。 */
  it("falls back to the shared local feed when the remote returns nothing", () => {
    const source = read("InspirationPromptDialog.tsx");
    expect(source).toContain("getInspirationFallbackFeed()");
    expect(source).toContain("loaded.length > 0 ? loaded :");
    expect(source).toContain(".catch(");
  });

  it("delays inspiration image zoom until a card has been hovered for 500ms", () => {
    const source = read("InspirationPromptDialog.tsx");

    expect(source).toContain("hoveredItemKey");
    expect(source).toContain("setTimeout");
    expect(source).toContain("500");
    expect(source).toContain("clearTimeout");
    expect(source).toContain('transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)"');
    expect(source).toContain("transition-transform");
  });
});
