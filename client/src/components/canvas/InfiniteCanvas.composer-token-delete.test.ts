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

  it("returns focus to the segment that survives the merge, not the stale one", () => {
    const branch = getBackspaceBranchSource();
    expect(branch).toBeTruthy();

    // 删除后若不显式聚焦，光标会丢失 —— 与之前修好的「删空即失焦」同源。
    //
    // 但仅仅 focus(segmentId) 是不够的，而且是错的：
    // normalizeAssistantComposerSegments 会把标签两侧的文本段合并（:17880），
    // 保留**前一段**的 id 并丢弃本段的 id。交还 segmentId 等于交给一个
    // 已不存在的 segment，ref 取到 undefined，?.focus() 静默失败 ——
    // 表现为「删掉标签后必须用鼠标点一下才能继续 Backspace」。
    const deleteBlock = branch?.slice(
      branch.indexOf("if (alreadySelected)"),
      branch.indexOf("setComposerBoxSelection({")
    );

    // 必须先算出合并后的幸存 id（标签**前面**那个文本段，即 currentIndex - 2）
    expect(deleteBlock).toContain("composerSegments[currentIndex - 2]");
    expect(deleteBlock).toContain("const survivingId");
    expect(deleteBlock).toContain(
      "activeComposerSegmentIdRef.current = survivingId"
    );
    expect(deleteBlock).toContain("composerInputRefs.current[survivingId]");

    // 反向断言：不得回退成直接用 segmentId（那正是本次修掉的缺陷）
    const stripComments = (text: string) =>
      text
        .split("\n")
        .filter(line => !line.trimStart().startsWith("//"))
        .join("\n");
    const code = stripComments(deleteBlock ?? "");
    expect(code).not.toContain("activeComposerSegmentIdRef.current = segmentId");
    expect(code).not.toContain("composerInputRefs.current[segmentId]?.focus()");
  });

  it("restores the caret to where the token was, not the end of the text", () => {
    const branch = getBackspaceBranchSource();
    expect(branch).toBeTruthy();

    const deleteBlock = branch?.slice(
      branch.indexOf("if (alreadySelected)"),
      branch.indexOf("setComposerBoxSelection({")
    );

    // 合并后光标应落在「前一段文字的末尾」= 原标签所在处，
    // 否则浏览器默认把光标放到整段末尾，继续 Backspace 删的是尾部文字。
    expect(deleteBlock).toContain("segmentBeforeToken.text.length");
    expect(deleteBlock).toContain("const survivingCursor");
    expect(deleteBlock).toContain(
      "input.setSelectionRange(survivingCursor, survivingCursor)"
    );
    // contenteditable 也要处理，否则富文本分支光标依然跑到末尾
    expect(deleteBlock).toContain("range.setStart(textNode, offset)");
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

// 回归测试：图片引用标签必须插在光标闪烁的位置
//
// 缺陷：图片同步 effect 里写死 insertIndex = withMissingAssets.length - 1，
// 即永远插到倒数第二个位置，完全无视光标。用户先打字、把光标停在文案末尾
// 再引用图片，标签会跑到文字**前面**，与预期相反。
//
// 根因是两套插入路径长期分叉：注释标签走 insertComposerToken（光标感知），
// 图片这条路径没复用它。本组断言锁住「图片路径也按光标切分」这一语义。

function getImageSyncEffectSource() {
  // 定位图片同步 effect：以 missingAssets 的计算为锚点，
  // 切到该 effect 的依赖数组 [referencedAssets] 为止。
  const anchor = source.indexOf("const missingAssets = referencedAssets.filter");
  if (anchor < 0) return undefined;
  const end = source.indexOf("}, [referencedAssets]);", anchor);
  if (end < 0) return undefined;
  return source.slice(anchor, end);
}

describe("image reference token is inserted at the caret", () => {
  it("resolves the active text segment instead of a hardcoded slot", () => {
    const effect = getImageSyncEffectSource();
    expect(effect).toBeTruthy();

    // 必须以「当前活动文本段」为插入锚点
    expect(effect).toContain("activeComposerSegmentIdRef.current");
    expect(effect).toContain('segment.id === activeId && segment.type === "text"');
  });

  it("splits the active text at the caret offset", () => {
    const effect = getImageSyncEffectSource();
    expect(effect).toBeTruthy();

    // 读取光标偏移，并夹在 [0, text.length] 内防越界
    expect(effect).toContain("activeComposerCursorRef.current");
    expect(effect).toContain("activeText.slice(0, cursor)");
    expect(effect).toContain("activeText.slice(cursor)");
  });

  it("places the tokens between the before/after halves", () => {
    const effect = getImageSyncEffectSource();
    expect(effect).toBeTruthy();

    // 顺序必须是 before → 图片标签 → after，写反就等于没修
    const beforeIdx = effect!.indexOf("{ ...activeSegment, text: before }");
    const tokenIdx = effect!.indexOf(
      "...missingAssets.map(asset => createAssistantImageSegment(asset))"
    );
    const afterIdx = effect!.indexOf("afterSegment,");
    expect(beforeIdx).toBeGreaterThan(-1);
    expect(tokenIdx).toBeGreaterThan(beforeIdx);
    expect(afterIdx).toBeGreaterThan(tokenIdx);
  });

  it("moves the caret to the segment after the token", () => {
    const effect = getImageSyncEffectSource();
    expect(effect).toBeTruthy();

    // 插入后光标应落在标签之后，用户可以接着往下打字
    expect(effect).toContain(
      "activeComposerSegmentIdRef.current = afterSegment.id"
    );
    expect(effect).toContain("activeComposerCursorRef.current = 0");
  });

  it("keeps an append fallback when no text segment is active", () => {
    const effect = getImageSyncEffectSource();
    expect(effect).toBeTruthy();

    // 输入框从未获得过焦点时没有光标可用，仍需退回追加，不能直接丢掉引用
    const fallback = effect!.slice(effect!.indexOf("} else {"));
    expect(fallback).toContain("createAssistantImageSegment(asset)");
  });

  it("no longer uses the caret-blind hardcoded index on the main path", () => {
    const effect = getImageSyncEffectSource();
    expect(effect).toBeTruthy();

    // 必须先剥掉 // 注释再断言：这段代码的注释里原样引用了被废弃的旧写法
    // （用于说明修复动机），不去掉的话断言会命中注释而非真实代码，
    // 变成一个永远失败的假警报。
    const stripComments = (text: string) =>
      text
        .split("\n")
        .filter(line => !line.trimStart().startsWith("//"))
        .join("\n");

    // 写死的倒数第二槽位只允许出现在 fallback 里；
    // 若它回到主路径（else 之前），说明修复被回退了。
    const elseIdx = effect!.indexOf("} else {");
    const mainPath = stripComments(
      elseIdx > -1 ? effect!.slice(0, elseIdx) : effect!
    );
    expect(mainPath).not.toContain("withMissingAssets.length - 1");

    // 反向确认 fallback 里确实还留着它，否则这条断言等于没测东西
    const fallback = stripComments(effect!.slice(elseIdx));
    expect(fallback).toContain("withMissingAssets.length - 1");
  });
});
