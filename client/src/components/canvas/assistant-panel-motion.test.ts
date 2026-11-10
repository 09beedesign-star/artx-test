import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

const raw = readFileSync(
  resolve(__dirname, "InfiniteCanvas.tsx"),
  "utf8"
);
/** ⚠️ 源码里有注释提到旧写法（duration-200 / #222222 / calc(100% - ...)），不剥注释的话反向断言恒红。 */
const source = stripSourceComments(raw);

/** 从标记切到下一个标记，避免整文件 toContain 恒绿。 */
function slice(from: string, to: string): string {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + from.length);
  expect(a, `找不到起点 ${from}`).toBeGreaterThan(-1);
  expect(b, `找不到终点 ${to}`).toBeGreaterThan(a);
  return source.slice(a, b);
}

// 只切到 style 块内的 zIndex，不把 aside 里几百行别的按钮一起卷进来（整块 toContain 恒绿）。
const aside = slice("artx-canvas-composer", "zIndex: 120");
const emptyState = slice(
  'data-testid="canvas-empty-state-overlay"',
  'renderButton("upload"'
);
const canvasRoot = slice('ref={containerRef}', "onDragEnter={handleCanvasDragEnter}");
const reactFlowStyle = slice("style={{\n          background: canvasBg", "proOptions=");

describe("助手面板收起 / 展开动画", () => {
  it("剥注释没有把源码吃掉（检测器自检）", () => {
    assertStripKeptSource(raw, source, 0.3);
  });

  /**
   * 2026-11-10 用户：太快 + 取消回弹。
   * 原来 `transition-transform duration-200 ease-out`：200ms，而且 Tailwind
   * 会把 scale/rotate/translate 一并挂上过渡，叠按钮 active:scale 就有「弹一下」。
   */
  it("放慢到 360ms 且曲线末端不过冲（无回弹）", () => {
    const match = source.match(/ASSISTANT_PANEL_DURATION_MS = (\d+)/);
    expect(match, "找不到共享时长常量").not.toBeNull();
    expect(Number(match![1]), "还是原来 200ms 的快动画").toBeGreaterThanOrEqual(300);

    const easing = source.match(
      /ASSISTANT_PANEL_EASING = "cubic-bezier\(([^)]+)\)"/
    );
    expect(easing, "找不到共享曲线常量").not.toBeNull();
    const points = easing![1].split(",").map(v => Number(v.trim()));
    expect(points).toHaveLength(4);
    // y1 / y2 超过 1 就是 overshoot（回弹 / 弹性）
    expect(points[1], "y1 过冲会产生回弹").toBeLessThanOrEqual(1);
    expect(points[3], "y2 过冲会产生回弹").toBeLessThanOrEqual(1);

    expect(aside).not.toContain("duration-200");
    expect(aside).not.toContain("ease-out");
    expect(aside).not.toContain("transition-transform");
    expect(aside).toContain("ASSISTANT_PANEL_TRANSITION");
  });

  /** 背景 / 阴影 / 毛玻璃若 0ms 瞬切，收起第一帧就露出一大块底色（黑边）。 */
  it("背景、描边、阴影、毛玻璃与 transform 同节奏过渡", () => {
    for (const property of [
      "background",
      "border-color",
      "box-shadow",
      "backdrop-filter",
    ]) {
      expect(aside, `${property} 没有跟着过渡`).toContain(
        `\`${property} \${ASSISTANT_PANEL_DURATION_MS}ms`
      );
    }
  });

  /**
   * 抖动根因：空画布引导的 `right: inset` 从 372 瞬跳到 112，卡片中心瞬移 130px，
   * 而面板在 360ms 里平滑滑出 → 不同步。
   *
   * ⚠️ 试过「给 right 加过渡」和「改 transform 平移」，展开方向实测仍会在
   *    ~80ms 处多跑 50px 再退回（逐帧改布局 / 合成层都躲不掉非单调跳变）。
   * ✅ 最终口径：卡片恒定 inset、完全不动，面板自己慢慢滑。
   */
  it("中间引导卡片固定不动，不再随面板收起 / 展开搬家", () => {
    expect(emptyState).not.toContain("transition:");
    expect(source).not.toContain("ASSISTANT_PANEL_INSET_TRANSITION");
    expect(source).not.toContain("translateX(${offsetX}px)");

    const callSite = slice("<CanvasEmptyStateOverlay", "/>");
    expect(callSite).toContain("rightInset={assistantPanelWidth}");
    expect(callSite).not.toContain("rightInset={isAssistantCollapsed");
    expect(callSite).not.toContain("offsetX=");
  });

  /** 容器写死 #222222，与画布底色不同 → 任何一帧没铺满就露出黑边。 */
  it("画布容器与画布共用同一个底色，不再写死 #222222 夹层", () => {
    expect(canvasRoot).toContain("background: canvasBg");
    expect(canvasRoot).not.toContain('background: "#222222"');
    // ReactFlow 内部会把它自己的 width:100% 排在后面，这个 width 从来没生效过。
    expect(reactFlowStyle).not.toContain("width: isAssistantCollapsed");
    expect(reactFlowStyle).not.toContain("calc(100% -");
  });

  /**
   * ⚠️⚠️⚠️ 「抖动 + 回弹」的真正根因（逐帧截图 + scrollLeft 实测定位）：
   * 面板 translateX 滑出右边界 → 容器 overflow:hidden 变成可滚动容器
   * （scrollWidth 1482 > clientWidth 1440）→ 展开时按钮获焦触发 scrollIntoView，
   * 容器被横向滚 42px 又滚回 0，整块画布左移再弹回，零报错。
   * ✅ overflow:clip 裁溢出但不产生滚动容器，程序也滚不动。
   */
  it("画布根容器用 clip 而不是 hidden，杜绝被程序横向滚动", () => {
    expect(canvasRoot).toContain('overflow: "clip"');
    expect(canvasRoot).not.toContain('overflow: "hidden"');
    // className 上也不能留 overflow-hidden（inline 虽会覆盖，但那是两个真相）。
    const rootClass = slice('data-artx-canvas-root=""', "style={{");
    expect(rootClass).not.toContain("overflow-hidden");
  });
});
