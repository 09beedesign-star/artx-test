/**
 * 🔒 2026-11-14 用户要求：三种底纹（棋盘格 / 点阵 / 轴测线）、
 * 每种可单独调透明度、磁铁吸附网格顶点，偏好要持久化。
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

// node 环境没有 localStorage；给模块用的 window.localStorage 做个内存替身。
const mem = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    clear: () => mem.clear(),
  },
});
import {
  CANVAS_BACKGROUND_PATTERNS,
  CANVAS_GRID_SIZE,
  DEFAULT_CANVAS_BACKGROUND_PREFERENCE,
  clampOpacity,
  readCanvasBackgroundPreference,
  snapToGrid,
  writeCanvasBackgroundPreference,
} from "@/lib/canvas-background-preference";

describe("画布底纹偏好", () => {
  beforeEach(() => mem.clear());

  it("默认是原点阵 + 不吸附（组件扩展默认=原行为）", () => {
    const pref = readCanvasBackgroundPreference();
    expect(pref.pattern).toBe("dots");
    expect(pref.snapEnabled).toBe(false);
  });

  it("三种底纹齐全", () => {
    expect(CANVAS_BACKGROUND_PATTERNS.map(p => p.id)).toEqual(["dots", "checker", "isometric"]);
  });

  it("每种底纹各自记忆透明度，切换回来不丢", () => {
    const pref = { ...DEFAULT_CANVAS_BACKGROUND_PREFERENCE, opacity: { dots: 1, checker: 0.3, isometric: 0.8 }, snapEnabled: true };
    writeCanvasBackgroundPreference(pref);
    expect(readCanvasBackgroundPreference()).toEqual(pref);
  });

  it("脏数据按字段回落，不会让整份设置坏掉", () => {
    mem.set("artx:canvas-background-pref-v1", JSON.stringify({ pattern: "nope", opacity: { checker: 99 }, snapEnabled: "yes" }));
    const pref = readCanvasBackgroundPreference();
    expect(pref.pattern).toBe("dots");
    expect(pref.opacity.checker).toBe(1);
    expect(pref.opacity.dots).toBe(1);
    expect(pref.snapEnabled).toBe(false);
  });

  it("透明度钳制在 0.05~1", () => {
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(-1)).toBe(0.05);
    expect(clampOpacity("abc", 0.5)).toBe(0.5);
    expect(clampOpacity(0.37)).toBe(0.37);
  });

  it("磁铁关闭时不动坐标，开启时对齐到最近顶点", () => {
    expect(snapToGrid(37, false)).toBe(37);
    expect(snapToGrid(37, true)).toBe(CANVAS_GRID_SIZE * 2);
    expect(snapToGrid(-13, true)).toBe(-CANVAS_GRID_SIZE);
    expect(snapToGrid(Number.NaN, true)).toBeNaN();
  });
});
