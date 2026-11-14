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
  opacity: 1, fill: "#ffffff", stroke: "#161616", strokeWidth: 0,
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

/**
 * 「恢复默认」快照（2026-11-14）。
 *
 * 第一次通过属性面板改节点时，patchPropertiesNode 把节点**当时**的
 * 位置/尺寸/名称以及所有面板可写字段的原值拍进 data[PROPERTIES_ORIGINAL_KEY]，
 * 之后不再覆盖；恢复默认 = 按快照逐字段写回，原本不存在的字段直接删除
 * （而不是写成默认值，避免把「没设置」变成「设置成默认」）。
 */
export const PROPERTIES_ORIGINAL_KEY = "panelOriginal";

/** 属性面板会写入 data 的全部字段；恢复默认要逐个还原。 */
export const PROPERTIES_DATA_KEYS = [
  "title", "imgW", "imgH",
  "panelRotation", "panelOpacity", "panelCornerRadius",
  "fill", "stroke", "strokeWidth",
  "panelBlendMode", "panelShadowEnabled", "panelShadowBlur", "panelShadowColor",
  "layerHidden", "layerLocked",
] as const;

export interface PropertiesSnapshot {
  position: { x: number; y: number };
  style: { width?: unknown; height?: unknown };
  data: Record<string, unknown>;
  /** 原本不存在的 data 字段，恢复时要删除 */
  absent: string[];
}

export function capturePropertiesSnapshot(node: Node): PropertiesSnapshot {
  const d = (node.data || {}) as Record<string, unknown>;
  const style = (node.style || {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const absent: string[] = [];
  for (const key of PROPERTIES_DATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(d, key)) data[key] = d[key];
    else absent.push(key);
  }
  return {
    position: { x: num(node.position?.x), y: num(node.position?.y) },
    style: { width: style.width, height: style.height },
    data,
    absent,
  };
}

export function restorePropertiesSnapshot<T extends Node>(node: T): T {
  const d = { ...((node.data || {}) as Record<string, unknown>) };
  const snap = d[PROPERTIES_ORIGINAL_KEY] as PropertiesSnapshot | undefined;
  if (!snap) return node;
  for (const key of snap.absent) delete d[key];
  Object.assign(d, snap.data);
  delete d[PROPERTIES_ORIGINAL_KEY];
  const style = { ...((node.style || {}) as Record<string, unknown>) };
  for (const k of ["width", "height"] as const) {
    if (snap.style[k] === undefined) delete style[k];
    else style[k] = snap.style[k];
  }
  return { ...node, data: d, style, position: { ...snap.position } };
}
