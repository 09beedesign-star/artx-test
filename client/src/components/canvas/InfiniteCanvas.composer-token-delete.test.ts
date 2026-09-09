import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 回归测试：图片引用标签「连按两次 Backspace 删除」
//
// 交互契约（两段式，防误删）：
//   第 1 次 Backspace（光标在文本段开头）→ 选中前一个标签，给出可见反馈
//   第 2 次 Backspace                    → 真正删除，并把焦点交还文本段
//
// 此前的缺陷：光标在开头时，若本段还有文字，handleComposerKeyDown 直接 return，
// 从未尝试选中前一个标签 —— 整个「连按两次删除」的交互完全不生效。
//
// 同时修复视觉侧：isBoxSelected 早已算好（渲染循环开头），但重构统一标签配色时
// 没有被消费，导致即使选中了也看不出来。

const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

function getKeyDownHandlerSource() {
  // handleComposerTextKeyDown 是个很长的 useCallback（方向键、全选、删空、
  // 标签删除等多条分支）。不能用固定窗口截断——写死长度既可能切不全，
  // 也可能把后面无关的代码带进来。这里做括号配平，精确切出整个回调。
  const start = source.indexOf("const handleComposerTextKeyDown");
  if (start < 0) return undefined;
  const open = source.indexOf("(", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return undefined;
}

// Backspace 分支的起点标记。方向键分支里有同名的 currentIndex /
// previousSegment，直接在整个回调上断言会误判，必须先切到这一段。
function getBackspaceBranchSource() {
  const fn = getKeyDownHandlerSource();
  if (!fn) return undefined;
  const start = fn.indexOf('if (event.key !== "Backspace") return;');
  if (start < 0) return undefined;
  return fn.slice(start);
}

function getTokenColorFnSource() {
  return source.match(
    /function getComposerRefTokenColors\([\s\S]*?\n}/
  )?.[0];
}

describe("composer token two-step backspace delete", () => {
  it("looks at the previous segment when the caret sits at offset 0", () => {
    const branch = getBackspaceBranchSource();
    expect(branch).toBeTruthy();

    // 必须定位当前段在 composerSegments 中的位置，才能取到前一个
    expect(branch).toContain("const currentIndex = composerSegments.findIndex");
    expect(branch).toContain("composerSegments[currentIndex - 1]");
    // 只有 token 类标签（image / annotation / skill）才参与两段式删除
    expect(branch).toContain("isAssistantTokenSegment(previousSegment)");
  });

  it("first press only selects, second press deletes", () => {
    const branch = getBackspaceBranchSource();
    expect(branch).toBeTruthy();

    // 通过 composerBoxSelection 判断是不是「第二次」
    expect(branch).toContain(
      "composerBoxSelection?.selectedIds.includes(previousSegment.id)"
    );
    expect(branch).toContain("if (alreadySelected)");
    // 第二次：真删
    expect(branch).toContain(
      "removeComposerSegmentsByIds([previousSegment.id])"
    );
    // 第一次：只选中
    expect(branch).toContain("setComposerBoxSelection({");
    expect(branch).toContain("selectedIds: [previousSegment.id]");
  });

  it("marks the selection as non-active so the global delete listener accepts it", () => {
    const branch = getBackspaceBranchSource();
    expect(branch).toBeTruthy();

    // 全局删除监听要求 active === false 才认这份选择；
    // 若写成 true 会被当作鼠标框选中间态而跳过。
    const selectionBlock = branch?.slice(
      branch.indexOf("setComposerBoxSelection({"),
      branch.indexOf("selectedIds: [previousSegment.id]")
    );
    expect(selectionBlock).toContain("active: false");
  });

  it("returns focus to the text segment after deleting", () => {
    const branch = getBackspaceBranchSource();
    expect(branch).toBeTruthy();

    // 删除后若不显式聚焦，光标会丢失 —— 与之前修好的「删空即失焦」同源
    const deleteBlock = branch?.slice(
      branch.indexOf("if (alreadySelected)"),
      branch.indexOf("setComposerBoxSelection({")
    );
    expect(deleteBlock).toContain(
      "activeComposerSegmentIdRef.current = segmentId"
    );
    expect(deleteBlock).toContain(
      "composerInputRefs.current[segmentId]?.focus()"
    );
  });

  it("declares the new dependencies so the callback is not stale", () => {
    const fn = getKeyDownHandlerSource();
    expect(fn).toBeTruthy();

    // composerBoxSelection 漏进依赖会让「第二次判断」永远读到旧值
    expect(fn).toContain("composerBoxSelection,");
    expect(fn).toContain("removeComposerSegmentsByIds,");
  });
});

describe("selected token gives visible feedback", () => {
  it("getComposerRefTokenColors accepts a selected flag", () => {
    const fn = getTokenColorFnSource();
    expect(fn).toBeTruthy();

    expect(fn).toContain("isSelected");
    // 选中态用描边 + 外发光表达
    expect(fn).toContain("isDragOver || isSelected");
  });

  it("keeps the background black regardless of selection", () => {
    const fn = getTokenColorFnSource();
    expect(fn).toBeTruthy();

    // 关键约束：选中态不得让底色再次跳变（那正是先前修掉的紫黑问题）
    const backgroundLine = fn
      ?.split("\n")
      .find(line => line.trimStart().startsWith("background:"));
    expect(backgroundLine).toBeTruthy();
    expect(backgroundLine).not.toContain("isSelected");
    expect(backgroundLine).toContain('isDark ? "#121110"');
  });

  it("both token renderers pass isBoxSelected through", () => {
    // 两类标签都要有反馈，否则注释标签选中了也看不出来
    const calls = source.match(
      /\.\.\.getComposerRefTokenColors\(\s*isDark,\s*dragOverComposerSegmentId === segment\.id,\s*isBoxSelected\s*\)/g
    );
    expect(calls?.length).toBe(2);
  });
});
