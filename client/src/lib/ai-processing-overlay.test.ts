import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripSourceComments } from "@shared/strip-source-comments";
import { computeAiProcessingOverlayMetrics } from "./ai-processing-overlay";

/**
 * 「AI 处理中」遮罩的尺寸不变量。
 *
 * 被保护的事故：maxHeight 取 `blockSize - iconSize`，在字号/行高触底的小节点上
 * 小于两行实际所需 → 文字容器把两个 span 压扁、overflow:hidden 再裁一刀，
 * 两行字贴在一起像被截断，全程零报错。
 */

/** 真实浏览器里量过的节点尺寸谱：120 是最小边下限，其余是常见的占位/成品尺寸。 */
const NODE_SIZES: Array<[number, number]> = [
  [120, 120],
  [150, 150],
  [180, 180],
  [200, 200],
  [260, 200],
  [320, 240],
  [360, 360],
  [512, 512],
  [720, 960],
  [1024, 1024],
  [2048, 2048],
];

describe("AI 处理中遮罩尺寸", () => {
  it("⭐ 任何节点尺寸下，文字容器的 maxHeight 都不小于两行所需（不然 flex 会压扁）", () => {
    for (const [w, h] of NODE_SIZES) {
      const m = computeAiProcessingOverlayMetrics(w, h);
      expect(
        m.textBlockHeight,
        `${w}x${h} 的 textBlockHeight 小于两行所需`,
      ).toBeGreaterThanOrEqual(m.lineHeightPx * 2 + m.textGap);
    }
  });

  it("⭐ 逐像素扫过整个尺寸区间，不允许任何一处出现「留给文字的高度 < 两行所需」", () => {
    /**
     * 上面那张尺寸表是抽样，这里把 1..2000 全扫一遍。
     * 旧实现（blockSize - iconSize）会在这个区间里命中 120–222 一大段。
     */
    const failed: string[] = [];
    for (let side = 1; side <= 2000; side += 1) {
      const { iconSize, textSize, lineHeightPx, textGap, blockSize } =
        computeAiProcessingOverlayMetrics(side, side);
      const legacyMaxHeight = Math.max(8, blockSize - iconSize);
      const needed = lineHeightPx * 2 + textGap;
      if (legacyMaxHeight < needed - 1e-9) {
        failed.push(`${side}(差${(needed - legacyMaxHeight).toFixed(2)}px/${textSize}px字)`);
      }
    }
    // 记录旧实现确实会踩的量级：这是这条测试「不是恒绿」的证据。
    expect(failed.length).toBeGreaterThan(0);
    // 但现在的实现必须一处在都不踩。
    for (let side = 1; side <= 2000; side += 1) {
      const m = computeAiProcessingOverlayMetrics(side, side);
      expect(m.textBlockHeight).toBeGreaterThanOrEqual(m.lineHeightPx * 2 + m.textGap - 1e-9);
    }
  });

  it("尺寸随节点单调不减，且在上下限处夹住", () => {
    const tiny = computeAiProcessingOverlayMetrics(40, 40);
    expect(tiny.blockSize).toBe(30);
    expect(tiny.iconSize).toBeGreaterThanOrEqual(16);
    expect(tiny.textSize).toBeGreaterThanOrEqual(6);
    expect(tiny.lineHeightPx).toBeGreaterThanOrEqual(8);
    expect(tiny.textWidth).toBeGreaterThanOrEqual(44);

    const huge = computeAiProcessingOverlayMetrics(4096, 4096);
    expect(huge.blockSize).toBe(140);

    let previous = 0;
    for (let side = 1; side <= 2000; side += 7) {
      const m = computeAiProcessingOverlayMetrics(side, side);
      expect(m.blockSize).toBeGreaterThanOrEqual(previous);
      previous = m.blockSize;
    }
  });

  it("非正方形节点按较小边算（竖图不能把图标撑爆）", () => {
    const wide = computeAiProcessingOverlayMetrics(960, 200);
    const square = computeAiProcessingOverlayMetrics(200, 200);
    expect(wide.blockSize).toBe(square.blockSize);
    expect(wide.textWidth).toBeGreaterThan(square.textWidth);
  });

  it("非法尺寸不产生 NaN / 负数样式", () => {
    for (const bad of [
      [0, 0],
      [-10, -10],
      [Number.NaN, 100],
      [100, Number.POSITIVE_INFINITY],
    ] as Array<[number, number]>) {
      const m = computeAiProcessingOverlayMetrics(bad[0], bad[1]);
      for (const value of [m.blockSize, m.iconSize, m.textSize, m.lineHeightPx, m.textGap, m.textWidth, m.textBlockHeight]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

describe("宿主组件必须用同一套尺寸", () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const source = stripSourceComments(
    readFileSync(path.join(repoRoot, "client/src/components/canvas/InfiniteCanvas.tsx"), "utf8"),
  );

  it("遮罩的尺寸全部来自 computeAiProcessingOverlayMetrics", () => {
    expect(source).toContain("computeAiProcessingOverlayMetrics(dispW, dispH)");
    // 不许再在组件里就地算（就地算就会和上面那套不变量脱钩）
    expect(source).not.toContain("Math.min(140, Math.min(dispW, dispH) * 0.2)");
    expect(source).not.toContain("processingBlockSize");
  });

  it("⭐ 文字容器的 maxHeight 绑的是 textBlockHeight，不是「块高减图标高」", () => {
    expect(source).toContain("maxHeight: processingTextBlockHeight");
    expect(source).not.toContain("processingBlockSize - processingIconSize");
  });

  it("span 必须 flexShrink: 0，否则容器一矮就被压扁 + overflow 裁字形", () => {
    /**
     * ⚠️ 锚点必须只命中这个 span。全文有 7 处 `textOverflow: "ellipsis"`
     * （标题、标签等），第一版拿 ellipsis 当锚点结果盯错了元素 ——
     * 变异测试里删掉这里的 flexShrink 后断言依然通过，是被别处"喂"绿的。
     * `key={\`${line}-${index}\`}` 是这两行文字独有的。
     */
    const anchor = source.indexOf("${line}-${index}");
    expect(anchor, "找不到两行文字那个 span").toBeGreaterThan(-1);
    const spanStyle = source.slice(anchor, anchor + 1400);
    expect(spanStyle).toContain('textOverflow: "ellipsis"');
    expect(spanStyle).toContain('overflow: "hidden"');
    expect(spanStyle).toContain("flexShrink: 0");
    // 顺序也要对：flexShrink 必须出现在同一个 span 的样式里（ellipsis 之后）
    expect(spanStyle.indexOf("flexShrink: 0")).toBeGreaterThan(
      spanStyle.indexOf('textOverflow: "ellipsis"'),
    );
  });
});
