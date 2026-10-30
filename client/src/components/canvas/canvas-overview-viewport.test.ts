import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeOverviewViewport,
  OVERVIEW_SINGLE_NODE_FRACTION,
} from "./canvas-overview-viewport";

const screen = { width: 1200, height: 900 };

describe("进入画布的全局概览视口", () => {
  it("单张大图不放大铺满：缩放 ≤ 1，且只占可视区一小部分", () => {
    const v = computeOverviewViewport(
      [{ x: 0, y: 0, width: 1024, height: 1024 }],
      screen,
      { minZoom: 0.1, maxZoom: 4 }
    )!;
    expect(v.zoom).toBeLessThanOrEqual(1);
    expect(1024 * v.zoom).toBeLessThanOrEqual(
      screen.height * OVERVIEW_SINGLE_NODE_FRACTION + 0.5
    );
  });

  it("小图也不会被放大超过 100%", () => {
    const v = computeOverviewViewport(
      [{ x: 0, y: 0, width: 80, height: 80 }],
      screen,
      { minZoom: 0.1, maxZoom: 4 }
    )!;
    expect(v.zoom).toBe(1);
  });

  it("内容居中于可视区", () => {
    const v = computeOverviewViewport(
      [{ x: 100, y: 200, width: 400, height: 300 }],
      screen,
      { minZoom: 0.1 }
    )!;
    expect(v.x + 300 * v.zoom).toBeCloseTo(screen.width / 2);
    expect(v.y + 350 * v.zoom).toBeCloseTo(screen.height / 2);
  });

  it("多节点时全部落在视口内", () => {
    const rects = [
      { x: -2000, y: -500, width: 800, height: 600 },
      { x: 3000, y: 1500, width: 800, height: 600 },
    ];
    const v = computeOverviewViewport(rects, screen, { minZoom: 0.01 })!;
    for (const r of rects) {
      expect(r.x * v.zoom + v.x).toBeGreaterThanOrEqual(0);
      expect((r.x + r.width) * v.zoom + v.x).toBeLessThanOrEqual(screen.width);
      expect((r.y + r.height) * v.zoom + v.y).toBeLessThanOrEqual(screen.height);
    }
  });

  it("空画布返回 null", () => {
    expect(computeOverviewViewport([], screen, { minZoom: 0.1 })).toBeNull();
  });

  it("ReactFlow 不再挂 fitView（否则会被放大铺满）", () => {
    const src = readFileSync(join(__dirname, "InfiniteCanvas.tsx"), "utf8");
    expect(src).not.toMatch(/^\s+fitView\s*$/m);
    expect(src).not.toContain("fitViewOptions=");
    expect(src).toContain("computeOverviewViewport(");
  });
});
