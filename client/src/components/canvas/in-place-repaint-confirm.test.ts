import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRepaintSnapshotLive } from "./in-place-repaint-confirm";

/**
 * 局部重绘「撤销」按钮的回归锁。
 *
 * ── 历史 ──
 * 2026-09-23：本文件原本锁的是「确认修改」按钮（撤销旁边的第二个按钮）。
 * 2026-09-24：用户要求**把确认按钮去掉**，并把撤销按钮尺寸缩小一倍。
 *   原需求原文：「把图片重绘的之后的确认修改按钮去掉。撤销重绘的按钮尺寸缩小一倍。」
 *
 * ⚠️⚠️⚠️ 为什么把整份测试改成「反向锁」而不是直接删掉这个文件：
 *   功能被移除时，最容易发生的回归是**它被悄悄加回来**
 *   （比如以后有人 revert 了一个提交、或从旧分支合并）。
 *   删掉测试 = 放弃了这道防线；留着旧断言 = 一堆假红。
 *   正确做法是把断言方向翻过来：锁住「确认按钮确实不存在」。
 *
 * ⚠️ 快照判据（isRepaintSnapshotLive）仍然在用 —— 它现在是**撤销按钮**
 *   的唯一显示条件，所以那部分真行为断言原样保留，一条都不能删。
 */

const source = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");

function countOf(needle: string): number {
  let count = 0;
  let cursor = 0;
  for (;;) {
    const hit = source.indexOf(needle, cursor);
    if (hit === -1) return count;
    count += 1;
    cursor = hit + needle.length;
  }
}

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`起始锚点失效，找不到：${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`终止锚点失效，找不到：${endMarker}`);
  return source.slice(start, end);
}

describe("快照有效性：撤销按钮的唯一显示判据", () => {
  it("没有快照 → 按钮不出现", () => {
    expect(isRepaintSnapshotLive({ localSrc: "a.png" })).toBe(false);
    expect(isRepaintSnapshotLive({})).toBe(false);
    expect(isRepaintSnapshotLive(null)).toBe(false);
    expect(isRepaintSnapshotLive(undefined)).toBe(false);
  });

  it("快照有效（当前像素 === 重绘后像素）→ 出现", () => {
    expect(
      isRepaintSnapshotLive({
        localSrc: "new.png?v=2",
        inPlaceRepaintUndo: {
          localSrc: "old.png",
          repaintedLocalSrc: "new.png?v=2",
        },
      })
    ).toBe(true);
  });

  it("⚠️⚠️ 重绘前没有 localSrc（内置素材图节点）也必须能撤销", () => {
    /*
     * 判据若写成「重绘前的 localSrc 是字符串」，这种节点永远拿不到按钮，
     * 用户不能撤销，且零报错。
     */
    expect(
      isRepaintSnapshotLive({
        localSrc: "repainted.png",
        inPlaceRepaintUndo: {
          localSrc: undefined,
          repaintedLocalSrc: "repainted.png",
        },
      })
    ).toBe(true);
  });

  it("⚠️⚠️ 快照过期（重绘后又换了图）→ 必须消失", () => {
    expect(
      isRepaintSnapshotLive({
        localSrc: "user-later-uploaded.png",
        inPlaceRepaintUndo: {
          localSrc: "old.png",
          repaintedLocalSrc: "repainted.png",
        },
      })
    ).toBe(false);
  });

  it("快照字段类型不对时不能崩，也不能放行", () => {
    expect(isRepaintSnapshotLive({ inPlaceRepaintUndo: "oops" })).toBe(false);
    expect(isRepaintSnapshotLive({ inPlaceRepaintUndo: 42 })).toBe(false);
    expect(
      isRepaintSnapshotLive({
        localSrc: "a.png",
        inPlaceRepaintUndo: { repaintedLocalSrc: 7 },
      })
    ).toBe(false);
  });
});

describe("【2026-09-24】「确认修改」按钮已按用户要求移除", () => {
  /*
   * ⚠️ 先锁住定位锚点。锚点一旦失效，下面所有 not.toContain 都会恒绿 ——
   *    "没量到"和"没问题"输出一模一样，这是本项目反复强调的判据。
   */
  it("定位锚点必须有效（否则下面的反向断言全部恒绿）", () => {
    expect(
      countOf("{canUndoInPlaceRepaint && !isAiProcessingImage && ("),
      "按钮组锚点失效 —— 反向断言将失去意义"
    ).toBe(1);
    expect(countOf('aria-label="撤销局部重绘"'), "撤销按钮不见了").toBe(1);
  });

  it("按钮组里不能再出现确认按钮", () => {
    const group = sliceBetween(
      "{canUndoInPlaceRepaint && !isAiProcessingImage && (",
      "{isCameraViewAdjusting && !isAiProcessingImage && ("
    );
    expect(group, "撤销按钮必须还在").toContain('aria-label="撤销局部重绘"');
    expect(group, "确认按钮又被加回来了").not.toContain(
      "REPAINT_CONFIRM_BUTTON_ARIA"
    );
    expect(group, "确认按钮的文案又出现了").not.toContain("确认修改");
    expect(group, "确认事件又被派发了").not.toContain(
      "IN_PLACE_REPAINT_CONFIRM_EVENT"
    );
    // 只剩一个按钮 → 只该有一处阻止冒泡的 onPointerDown
    expect(
      (group.match(/<button/g) || []).length,
      "按钮组里不止一个按钮 —— 确认按钮可能被加回来了"
    ).toBe(1);
  });

  it("⚠️⚠️ 确认事件的监听器必须整体移除，不能只藏按钮", () => {
    /*
     * 留着监听器 = 留下一个没有 UI 入口但仍可被 dispatch 触发的旁路：
     * 任何一句 dispatch 都能清掉撤销快照，让撤销按钮凭空消失，且零报错。
     */
    expect(
      countOf("window.addEventListener(IN_PLACE_REPAINT_CONFIRM_EVENT"),
      "确认事件的监听器还在 —— 按钮没了但链路仍可被触发"
    ).toBe(0);
    expect(
      countOf('"in-place-repaint-confirm-request"'),
      "tsx 里硬编码了确认事件名"
    ).toBe(0);
  });

  it("重绘完成的 toast 不能再让用户去点「确认修改」", () => {
    const toastLine = sliceBetween(
      'toast(image ? "局部重绘已完成" : "局部重绘失败"',
      "        return;"
    );
    expect(
      toastLine,
      "提示还在引导用户点一个已经不存在的按钮"
    ).not.toContain("确认修改");
    expect(toastLine, "提示里丢了撤销入口").toContain("撤销重绘");
  });
});

describe("【2026-09-24】撤销按钮尺寸缩小一倍", () => {
  /**
   * 用户要求：「撤销重绘的按钮尺寸缩小一倍。」
   *
   * ⚠️⚠️⚠️ 判据不能只看 height。只把高度砍半、字号图标不动，
   *   视觉上是「被压扁」而不是「变小」，而且字会溢出按钮 —— 零报错。
   *   所以这里逐项锁住**整套等比缩小后的度量**。
   *
   * 基线（缩小前）：height 30 / fontSize 11 / padding 0 11px / icon 13。
   * 目标（缩小后）：height 15 / fontSize 8  / padding 0 6px  / icon 9。
   */
  const undoButton = sliceBetween(
    'aria-label="撤销局部重绘"',
    "</button>"
  );

  it("高度减半：30 → 15", () => {
    expect(undoButton, "按钮高度没缩小").toContain("height: 15,");
    expect(undoButton, "还残留着旧的 30px 高度").not.toContain("height: 30,");
  });

  it("字号同步缩小：11 → 8（只改高度会让字溢出）", () => {
    expect(undoButton, "字号没跟着缩").toContain("fontSize: 8,");
    expect(undoButton, "还残留着旧字号").not.toContain("fontSize: 11,");
  });

  it("内边距同步收紧：11px → 6px", () => {
    expect(undoButton, "左右内边距没收紧").toContain('padding: "0 6px"');
  });

  it("图标同步缩小：13 → 9", () => {
    expect(undoButton, "图标没缩小，会顶破按钮").toContain("size={9}");
    expect(undoButton, "还残留着旧图标尺寸").not.toContain("size={13}");
  });
});
