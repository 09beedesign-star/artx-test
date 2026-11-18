/**
 * Figma 模板布局数据加载与类型定义
 */
import type { TemplatePiece } from "./canvas-templates";
import layoutsData from "./canvas-figma-layouts.data.json";

export interface FigmaLayoutPiece {
  kind: "text" | "path" | "rect" | "ellipse";
  role: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  order: number;
  // text 特有字段
  text?: string;
  sizeRatio?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  textAlign?: string;
  lineHeight?: number;
  trackingRatio?: number;
  // 图形特有字段
  fill?: string;
  path?: string;
  opacity?: number;
}

export interface FigmaLayout {
  i: string;
  figmaId: string;
  w: number;
  h: number;
  bg: string;
  pieces: FigmaLayoutPiece[];
  n: string;
}

export interface FigmaLayoutCategory {
  id: string;
  name: string;
  paper: string;
  orientation: "portrait" | "landscape";
  coverId: string;
  layouts: FigmaLayout[];
}

export const FIGMA_LAYOUT_CATEGORIES: FigmaLayoutCategory[] = layoutsData.categories as FigmaLayoutCategory[];
