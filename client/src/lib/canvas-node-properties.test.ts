/**
 * 🔒 2026-11-14 属性编辑面板：字段必须按节点真实属性读取，
 * 视觉类字段用 panel 前缀，避免与节点组件内部的 opacity/rotation 叠乘。
 */
import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { BLEND_MODES, num, readNodeForm } from "@/lib/canvas-node-properties";

function node(data: Record<string, unknown>, extra: Partial<Node> = {}): Node {
  return {
    id: "n1", type: "asset", position: { x: 120, y: 80 },
    data, style: { width: 300, height: 200 }, ...extra,
  } as Node;
}

describe("属性编辑读值", () => {
  it("读真实 position / style / title", () => {
    const f = readNodeForm(node({ title: "主视觉" }));
    expect(f).toMatchObject({ title: "主视觉", x: 120, y: 80, width: 300, height: 200 });
  });

  it("读 panel 前缀字段，并回落到节点历史字段", () => {
    const f = readNodeForm(node({ panelOpacity: 0.4, panelRotation: 30, panelBlendMode: "multiply", panelShadowEnabled: true, panelCornerRadius: 16 }));
    expect(f).toMatchObject({ opacity: 0.4, rotation: 30, blendMode: "multiply", shadowEnabled: true, cornerRadius: 16 });
    const legacy = readNodeForm(node({ opacity: 0.6, rotation: 12 }));
    expect(legacy.opacity).toBe(0.6);
    expect(legacy.rotation).toBe(12);
  });

  it("隐藏 / 锁定按布尔真值判定，脏值不误判", () => {
    expect(readNodeForm(node({ layerHidden: true, layerLocked: true }))).toMatchObject({ hidden: true, locked: true });
    expect(readNodeForm(node({ layerHidden: "yes", layerLocked: 1 }))).toMatchObject({ hidden: false, locked: false });
  });

  it("无节点给默认值，不透明度钳在 0~1", () => {
    expect(readNodeForm(null).opacity).toBe(1);
    expect(readNodeForm(node({ panelOpacity: 9 })).opacity).toBe(1);
    expect(readNodeForm(node({ panelOpacity: -3 })).opacity).toBe(0);
  });

  it("混合模式齐全且默认 normal", () => {
    expect(BLEND_MODES.map(m => m.value)).toContain("normal");
    expect(BLEND_MODES.length).toBeGreaterThanOrEqual(8);
    expect(readNodeForm(node({})).blendMode).toBe("normal");
  });

  it("num 对脏输入回落，避免 NaN 写进节点", () => {
    expect(num("12")).toBe(12);
    expect(num("abc", 7)).toBe(7);
    expect(num(Number.NaN, 3)).toBe(3);
  });
});
