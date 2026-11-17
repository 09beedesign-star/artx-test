/**
 * Figma「100+ Page Layout Collection」Layout 页导入的版式（2026-11-17）。
 *
 * 数据由 scripts/figma-layout/build.py 从 Figma REST API 离线生成，
 * 分类口径：每一排最左侧的黑色封面 frame = 一个分类，同排其余 frame 全部归入。
 * ⚠️ 统一文案仍只走 canvas-templates 的 applyTemplateDefaultCopy（唯一出口），这里不另写。
 */
import type { TemplatePiece } from "./canvas-templates";
import raw from "./canvas-figma-layouts.data.json";

export interface FigmaLayout {
  /** 版式 id，统一以 fg- 开头，用来和老目录区分 */
  i: string;
  n: string;
  figmaId: string;
  w: number;
  h: number;
  bg: string;
  pieces: TemplatePiece[];
}
export interface FigmaLayoutCategory {
  id: string;
  name: string;
  paper: string;
  orientation: "portrait" | "landscape";
  coverId: string;
  layouts: FigmaLayout[];
}

const DATA = raw as unknown as { source: string; categories: FigmaLayoutCategory[] };

export const FIGMA_LAYOUT_CATEGORIES: FigmaLayoutCategory[] = DATA.categories;

const BY_ID = new Map<string, { layout: FigmaLayout; category: FigmaLayoutCategory }>();
for (const category of FIGMA_LAYOUT_CATEGORIES) {
  for (const layout of category.layouts) BY_ID.set(layout.i, { layout, category });
}

export function isFigmaLayoutId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith("fg-");
}
export function getFigmaLayout(id: string | undefined | null): FigmaLayout | undefined {
  return id ? BY_ID.get(id)?.layout : undefined;
}
export function getFigmaLayoutCategory(id: string | undefined | null): FigmaLayoutCategory | undefined {
  return id ? BY_ID.get(id)?.category : undefined;
}
export function figmaLayoutCount(): number {
  return BY_ID.size;
}
