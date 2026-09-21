import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE_DRAFT_NODE_RATIO,
  computeDraftNodeRect,
  isCanvasEmpty,
} from "./canvas-empty-state";

/**
 * 空画布引导（暗纹缺省按钮）的防护测试。
 *
 * 【这组测试真正要守住的事故】
 * 用户的要求是「一旦画布中有任何内容之后，所有暗纹按钮自动消失」。
 * 这句话里的「任何」决定了判据必须用**排除法**：
 * 📌 正向列举「哪些类型算内容」会漏掉所有将来新增的节点类型，
 *    表现是「画布里明明有东西，暗纹按钮还压在上面」，且零报错。
 *
 * 另一半是占位节点的尺寸：用户要求「占画面 70% 面积、正方形」。
 * ⚠️ 边长若按宽高的**较大值**算，助手面板一展开就会超出可视区，
 *    用户只看得到节点的一角 —— 同样不报错。
 */

describe("isCanvasEmpty", () => {
  it("treats a brand new canvas as empty", () => {
    expect(isCanvasEmpty([])).toBe(true);
    expect(isCanvasEmpty(null)).toBe(true);
    expect(isCanvasEmpty(undefined)).toBe(true);
  });

  it("hides the guide as soon as any node exists", () => {
    expect(isCanvasEmpty([{ id: "a", type: "image" }])).toBe(false);
  });

  it("hides the guide for node types that do not exist yet (exclusion, not allowlist)", () => {
    // 📌 关键用例：一个从未登记过的类型也必须算作「有内容」。
    // 如果实现改成白名单，这条会红。
    expect(isCanvasEmpty([{ id: "x", type: "some-future-node-type" }])).toBe(false);
    expect(isCanvasEmpty([{ id: "y" }])).toBe(false);
  });

  it("ignores hidden nodes because the user cannot see them", () => {
    expect(isCanvasEmpty([{ id: "a", type: "image", hidden: true }])).toBe(true);
    // 一个隐藏 + 一个可见 = 有内容
    expect(
      isCanvasEmpty([
        { id: "a", type: "image", hidden: true },
        { id: "b", type: "image" },
      ])
    ).toBe(false);
  });

  it("survives malformed node entries instead of crashing the canvas", () => {
    expect(isCanvasEmpty([null as never])).toBe(true);
  });
});

describe("computeDraftNodeRect", () => {
  it("uses 70% of the viewport by default", () => {
    expect(EMPTY_STATE_DRAFT_NODE_RATIO).toBe(0.7);
    const rect = computeDraftNodeRect(1000, 1000);
    expect(rect.width).toBe(700);
    expect(rect.height).toBe(700);
  });

  it("always produces a square", () => {
    const rect = computeDraftNodeRect(1600, 900);
    expect(rect.width).toBe(rect.height);
  });

  it("takes the smaller side so the node never overflows a narrow viewport", () => {
    // 宽 1600 高 900：按较大值算会得到 1120，比高度还大 —— 会溢出。
    const rect = computeDraftNodeRect(1600, 900);
    expect(rect.width).toBe(630);
    expect(rect.width).toBeLessThanOrEqual(900);
  });

  it("stays inside the viewport even when the assistant panel squeezes it", () => {
    // 助手面板展开后画布被挤成窄条
    const rect = computeDraftNodeRect(520, 900);
    expect(rect.width).toBeLessThanOrEqual(520);
    expect(rect.x).toBeGreaterThanOrEqual(0);
  });

  it("centers the node in the viewport", () => {
    const rect = computeDraftNodeRect(1000, 800);
    expect(rect.x + rect.width / 2).toBe(500);
    expect(rect.y + rect.height / 2).toBe(400);
  });

  it("degrades safely on invalid measurements instead of producing NaN", () => {
    for (const [w, h] of [
      [0, 0],
      [Number.NaN, 600],
      [-100, 600],
    ] as Array<[number, number]>) {
      const rect = computeDraftNodeRect(w, h);
      expect(Number.isFinite(rect.width)).toBe(true);
      expect(Number.isFinite(rect.x)).toBe(true);
      expect(rect.width).toBeGreaterThanOrEqual(0);
    }
  });
});
