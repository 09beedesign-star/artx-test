/**
 * 画布「属性编辑」面板的纯函数 / 类型事实源（2026-11-14）。
 * 与 UI 组件分离，便于直接单测字段读取与回落逻辑。
 */
import type { Node } from "@xyflow/react";

export type LayerOrderAction = "bring-to-front" | "send-to-back" | "bring-forward" | "send-backward";

export interface NodePropertiesPatch {
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  cornerRadius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  blendMode?: string;
  shadowEnabled?: boolean;
  shadowBlur?: number;
  shadowColor?: string;
  layerHidden?: boolean;
  layerLocked?: boolean;
}

export const BLEND_MODES = [
  { value: "normal", label: "正常" },
  { value: "multiply", label: "正片叠底" },
  { value: "screen", label: "滤色" },
  { value: "overlay", label: "叠加" },
  { value: "darken", label: "变暗" },
  { value: "lighten", label: "变亮" },
  { value: "color-dodge", label: "颜色减淡" },
  { value: "difference", label: "差值" },
  { value: "hue", label: "色相" },
  { value: "luminosity", label: "明度" },
];

export type NodePropertiesForm = Required<Omit<NodePropertiesPatch, "layerHidden" | "layerLocked">> & {
  hidden: boolean;
  locked: boolean;
};

export const DEFAULT_NODE_PROPERTIES_FORM: NodePropertiesForm = {
  title: "", x: 0, y: 0, width: 0, height: 0, rotation: 0,
  opacity: 1, cornerRadius: 0, fill: "#ffffff", stroke: "#161616", strokeWidth: 0,
  blendMode: "normal", shadowEnabled: false, shadowBlur: 12, shadowColor: "#000000",
  hidden: false, locked: false,
};

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/** 从真实节点读出表单值；视觉类字段优先 panel 前缀，回落到节点历史字段。 */
export function readNodeForm(node: Node | null): NodePropertiesForm {
  if (!node) return DEFAULT_NODE_PROPERTIES_FORM;
  const d = (node.data || {}) as Record<string, unknown>;
  const style = (node.style || {}) as Record<string, unknown>;
  return {
    title: str(d.title, str(d.text, "未命名图层")),
    x: Math.round(num(node.position?.x)),
    y: Math.round(num(node.position?.y)),
    width: Math.round(num(style.width ?? d.imgW ?? node.width)),
    height: Math.round(num(style.height ?? d.imgH ?? node.height)),
    rotation: num(d.panelRotation, num(d.rotation)),
    opacity: Math.min(1, Math.max(0, num(d.panelOpacity, num(d.opacity, 1)))),
    cornerRadius: num(d.panelCornerRadius, num(d.cornerRadius)),
    fill: str(d.fill, "#ffffff"),
    stroke: str(d.stroke, "#161616"),
    strokeWidth: num(d.strokeWidth),
    blendMode: str(d.panelBlendMode, "normal"),
    shadowEnabled: d.panelShadowEnabled === true,
    shadowBlur: num(d.panelShadowBlur, 12),
    shadowColor: str(d.panelShadowColor, "#000000"),
    hidden: d.layerHidden === true,
    locked: d.layerLocked === true,
  };
}
