/**
 * 引导蒙层挖孔几何 —— 回归测试
 *
 * ⚠️ 这些用例锁的是一个**真实发生过**的事故（2026-09-14 实测发现）：
 * 首页「灵感推荐」锚点打在 min-h-screen 的外层 section 上（实测 1308×6108），
 * 视口只有 1280×577 → 四块遮罩全被压成 0 高度 → 遮罩覆盖率 0%，
 * 黑色蒙层在视觉上完全消失，而代码全程零报错。
 *
 * 📌 判据：只断言「遮罩块有 4 个」是**测不出**这个 bug 的 —— 四块高度全为 0 时
 * 数量仍然是 4。必须断言**覆盖率**。
 */

import { describe, expect, it } from "vitest";
import {
  MAX_CUTOUT_VIEWPORT_RATIO,
  buildMaskPieces,
  computeCutoutRect,
  maskCoverageRatio,
} from "./cutout-geometry";

const VP = { width: 1280, height: 577 };

function boxOf(top: number, left: number, width: number, height: number) {
  return { top, left, bottom: top + height, right: left + width };
}

describe("computeCutoutRect", () => {
  it("clips a normal in-viewport element and keeps it intact", () => {
    const rect = computeCutoutRect(boxOf(214, 781, 250, 206), 12, VP);
    expect(rect).not.toBeNull();
    expect(rect!.top).toBe(202);
    expect(rect!.left).toBe(769);
    expect(rect!.width).toBe(274);
    expect(rect!.height).toBe(230);
  });

  it("clips an element that overflows the viewport bottom", () => {
    // 元素从 y=500 开始、高 800，视口只有 577 → 底部必须被裁到 577
    const rect = computeCutoutRect(boxOf(500, 100, 200, 800), 0, VP);
    expect(rect).not.toBeNull();
    expect(rect!.top).toBe(500);
    expect(rect!.height).toBe(77);
  });

  it("returns null for the giant min-h-screen section that caused the incident", () => {
    // 真实数值：首页灵感推荐 section 实测 1308×6108
    const rect = computeCutoutRect(boxOf(0, 0, 1308, 6108), 12, VP);
    expect(rect).toBeNull();
  });

  it("returns null when the element is scrolled completely out of view", () => {
    const above = computeCutoutRect(boxOf(-500, 100, 200, 100), 0, VP);
    expect(above).toBeNull();
    const below = computeCutoutRect(boxOf(900, 100, 200, 100), 0, VP);
    expect(below).toBeNull();
  });

  it("returns null once the cutout exceeds the viewport ratio cap", () => {
    const area = VP.width * VP.height;
    // 刚好超过阈值
    const tooBig = Math.ceil(area * (MAX_CUTOUT_VIEWPORT_RATIO + 0.02));
    const h = Math.min(VP.height, Math.ceil(tooBig / VP.width));
    expect(computeCutoutRect(boxOf(0, 0, VP.width, h), 0, VP)).toBeNull();
  });

  it("still allows a large-but-acceptable cutout below the cap", () => {
    // 占约 50% 视口，应当正常挖孔
    const rect = computeCutoutRect(boxOf(0, 0, VP.width, Math.floor(VP.height * 0.5)), 0, VP);
    expect(rect).not.toBeNull();
  });
});

describe("buildMaskPieces + maskCoverageRatio", () => {
  it("falls back to a single full-screen mask when there is no cutout", () => {
    const pieces = buildMaskPieces(null, VP);
    expect(pieces).toHaveLength(1);
    expect(maskCoverageRatio(pieces, VP)).toBe(1);
  });

  it("⚠️ still covers most of the viewport when a cutout exists", () => {
    const rect = computeCutoutRect(boxOf(214, 781, 250, 206), 12, VP)!;
    const pieces = buildMaskPieces(rect, VP);
    expect(pieces).toHaveLength(4);
    // 这是核心断言：遮罩必须真的盖住屏幕，而不是四块高度全为 0
    expect(maskCoverageRatio(pieces, VP)).toBeGreaterThan(0.8);
  });

  it("⚠️⚠️ never degrades to zero coverage for the giant section (the actual bug)", () => {
    // 走完整链路：巨型 section → computeCutoutRect 返回 null → 全屏蒙层
    const rect = computeCutoutRect(boxOf(0, 0, 1308, 6108), 12, VP);
    const pieces = buildMaskPieces(rect, VP);
    const coverage = maskCoverageRatio(pieces, VP);
    // 修复前这里是 0
    expect(coverage).toBe(1);
  });

  it("cutout area plus mask coverage accounts for the whole viewport", () => {
    const rect = computeCutoutRect(boxOf(100, 200, 300, 150), 0, VP)!;
    const pieces = buildMaskPieces(rect, VP);
    const covered = maskCoverageRatio(pieces, VP) * VP.width * VP.height;
    const hole = rect.width * rect.height;
    expect(Math.round(covered + hole)).toBe(VP.width * VP.height);
  });

  it("mask pieces never have negative dimensions", () => {
    const rect = computeCutoutRect(boxOf(0, 0, VP.width, 100), 0, VP)!;
    for (const piece of buildMaskPieces(rect, VP)) {
      expect(piece.width).toBeGreaterThanOrEqual(0);
      expect(piece.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("OnboardingTour wires the geometry module (not a second copy)", () => {
  it("imports the shared geometry helpers instead of inlining the math", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "OnboardingTour.tsx"),
      "utf-8",
    );
    expect(source).toContain('from "./cutout-geometry"');
    expect(source).toContain("computeCutoutRect(");
    expect(source).toContain("buildMaskPieces(");
    /*
      ⚠️ 反向断言：不允许组件里再留一份自己算的四块遮罩。
      本项目老坑「同一份数据的多个出口」—— 留第二份必然发散。
    */
    expect(source).not.toContain('width: "100vw", height: "100vh"');
  });
});
