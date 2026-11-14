/**
 * 画布版式运行时。
 *
 * 唯一职责：把目录里的版式参数变成「画板 + 一组可独立编辑的子单元」，
 * 并提供唯一的 SVG 渲染出口 —— 画布节点、面板缩略图、下载、复制、
 * 参考图、打印导出全部复用 renderTemplateSvg / renderPieceSvg。
 * ⚠️ 不要在别处再写一份渲染逻辑，否则预览和导出迟早对不上。
 */
import type { Node } from "@xyflow/react";
import { TEMPLATE_CATALOG } from "./canvas-template-catalog";
import type {
  TemplateDecoration,
  TemplateGeometry,
  TemplateGradient,
  TemplateLabel,
  TemplateLayoutData,
} from "./canvas-template-types";

// ─── 积分 ────────────────────────────────────────────────────────────────────
/** 版式是本地排版素材：放置 / 编辑 / 下载 / 复制 / 打印统统不消耗积分。 */
export const TEMPLATE_CREDIT_COST = 0;
export const TEMPLATE_CREDIT_NOTE =
  "版式放置、编辑、下载、复制与打印均不消耗积分；只有调用 AI 生成才会扣积分。";
export const TEMPLATE_PRINT_NOTE = "打印不消耗积分（0 积分），仅按所选纸张与分辨率在本机导出图片。";

// ─── 纸张 / 分辨率 ──────────────────────────────────────────────────────────
export type TemplatePaperUnit = "mm" | "px";
export interface TemplatePaperPreset {
  id: string;
  label: string;
  group: string;
  w: number;
  h: number;
  unit: TemplatePaperUnit;
}
export const TEMPLATE_PAPER_PRESETS: TemplatePaperPreset[] = [
  { id: "a4", label: "A4 · 210×297 mm", group: "国际标准 ISO", w: 210, h: 297, unit: "mm" },
  { id: "a3", label: "A3 · 297×420 mm", group: "国际标准 ISO", w: 297, h: 420, unit: "mm" },
  { id: "a5", label: "A5 · 148×210 mm", group: "国际标准 ISO", w: 148, h: 210, unit: "mm" },
  { id: "a6", label: "A6 · 105×148 mm", group: "国际标准 ISO", w: 105, h: 148, unit: "mm" },
  { id: "a2", label: "A2 · 420×594 mm", group: "国际标准 ISO", w: 420, h: 594, unit: "mm" },
  { id: "a1", label: "A1 · 594×841 mm", group: "国际标准 ISO", w: 594, h: 841, unit: "mm" },
  { id: "a0", label: "A0 · 841×1189 mm", group: "国际标准 ISO", w: 841, h: 1189, unit: "mm" },
  { id: "b5", label: "B5 · 176×250 mm", group: "国际标准 ISO", w: 176, h: 250, unit: "mm" },
  { id: "b4", label: "B4 · 250×353 mm", group: "国际标准 ISO", w: 250, h: 353, unit: "mm" },
  { id: "letter", label: "Letter · 8.5×11 in", group: "北美规格", w: 215.9, h: 279.4, unit: "mm" },
  { id: "legal", label: "Legal · 8.5×14 in", group: "北美规格", w: 215.9, h: 355.6, unit: "mm" },
  { id: "tabloid", label: "Tabloid · 11×17 in", group: "北美规格", w: 279.4, h: 431.8, unit: "mm" },
  { id: "namecard", label: "名片 · 90×54 mm", group: "卡片与票据", w: 90, h: 54, unit: "mm" },
  { id: "postcard", label: "明信片 · 100×148 mm", group: "卡片与票据", w: 100, h: 148, unit: "mm" },
  { id: "ticket", label: "票券 · 210×80 mm", group: "卡片与票据", w: 210, h: 80, unit: "mm" },
  { id: "square", label: "方图 · 1080×1080", group: "屏幕与社交", w: 1080, h: 1080, unit: "px" },
  { id: "story", label: "竖屏 · 1080×1920", group: "屏幕与社交", w: 1080, h: 1920, unit: "px" },
  { id: "slide", label: "横屏 · 1920×1080", group: "屏幕与社交", w: 1920, h: 1080, unit: "px" },
  { id: "cover", label: "封面 · 1200×628", group: "屏幕与社交", w: 1200, h: 628, unit: "px" },
];
export const TEMPLATE_PAPER_GROUPS = Array.from(
  new Set(TEMPLATE_PAPER_PRESETS.map(p => p.group))
);

export type TemplateResolution =
  | { kind: "dpi"; value: number; label: string }
  | { kind: "long"; value: number; label: string };
export const TEMPLATE_RESOLUTIONS: TemplateResolution[] = [
  { kind: "dpi", value: 72, label: "72 DPI · 屏显" },
  { kind: "dpi", value: 150, label: "150 DPI · 打样" },
  { kind: "dpi", value: 300, label: "300 DPI · 印刷" },
  { kind: "dpi", value: 600, label: "600 DPI · 精细" },
  { kind: "long", value: 1024, label: "1K · 长边 1024 px" },
  { kind: "long", value: 2048, label: "2K · 长边 2048 px" },
  { kind: "long", value: 4096, label: "4K · 长边 4096 px" },
];
export const TEMPLATE_BLEED_OPTIONS = [0, 3, 5, 10, 15, 20, 25];
export const TEMPLATE_MATERIALS = [
  { id: "all", label: "全部用途" },
  { id: "poster", label: "海报招贴" },
  { id: "document", label: "文档页" },
  { id: "flat", label: "平面物料" },
  { id: "card", label: "卡片" },
  { id: "ticket", label: "票据" },
];
export type TemplateOrientation = "portrait" | "landscape";

export const MM_PER_INCH = 25.4;
/** 画布显示尺寸上限，避免 A0@96dpi 把画布撑爆。 */
export const TEMPLATE_MAX_DISPLAY_EDGE = 4500;
/** 浏览器单次 canvas 的安全上限，超出时等比缩小并明确提示。 */
export const TEMPLATE_MAX_PRINT_EDGE = 8000;
export const TEMPLATE_MAX_PRINT_PIXELS = 40_000_000;

export function mmToPx(mm: number, dpi = 96): number {
  return (mm / MM_PER_INCH) * dpi;
}

export interface TemplateSizeResult {
  display: { width: number; height: number };
  print: { width: number; height: number };
  aspect: number;
  /** 已经因为浏览器上限被缩小 */
  clamped: boolean;
  /** 实际输出 DPI（长边档位时按纸张反算） */
  effectiveDpi: number;
}
export function resolveTemplateSize(options: {
  paperId: string;
  orientation: TemplateOrientation;
  resolution: TemplateResolution;
  bleedMm: number;
}): TemplateSizeResult {
  const paper =
    TEMPLATE_PAPER_PRESETS.find(p => p.id === options.paperId) ||
    TEMPLATE_PAPER_PRESETS[0];
  let w = paper.w;
  let h = paper.h;
  const naturalPortrait = h >= w;
  const wantPortrait = options.orientation === "portrait";
  if (naturalPortrait !== wantPortrait) [w, h] = [h, w];
  const bleed = Math.max(0, Math.min(25, options.bleedMm || 0));

  let displayW: number;
  let displayH: number;
  if (paper.unit === "mm") {
    displayW = mmToPx(w, 96);
    displayH = mmToPx(h, 96);
    const k = Math.min(
      1,
      TEMPLATE_MAX_DISPLAY_EDGE / Math.max(displayW, displayH)
    );
    displayW = Math.round(displayW * k);
    displayH = Math.round(displayH * k);
  } else {
    const k = Math.min(1, 1200 / Math.max(w, h));
    displayW = Math.round(w * k);
    displayH = Math.round(h * k);
  }

  let printW: number;
  let printH: number;
  let effectiveDpi: number;
  if (options.resolution.kind === "dpi") {
    const dpi = options.resolution.value;
    printW = paper.unit === "mm" ? mmToPx(w + bleed * 2, dpi) : (w + bleed * 6) * (dpi / 96);
    printH = paper.unit === "mm" ? mmToPx(h + bleed * 2, dpi) : (h + bleed * 6) * (dpi / 96);
    effectiveDpi = dpi;
  } else {
    const long = options.resolution.value;
    const ratio = w / h;
    if (ratio >= 1) {
      printW = long;
      printH = Math.round(long / ratio);
    } else {
      printH = long;
      printW = Math.round(long * ratio);
    }
    effectiveDpi = paper.unit === "mm" ? Math.round((printW / (w / MM_PER_INCH)) * 10) / 10 : 96;
  }
  let clamped = false;
  const edgeK = Math.min(1, TEMPLATE_MAX_PRINT_EDGE / Math.max(printW, printH));
  if (edgeK < 1) {
    printW = Math.round(printW * edgeK);
    printH = Math.round(printH * edgeK);
    clamped = true;
  }
  if (printW * printH > TEMPLATE_MAX_PRINT_PIXELS) {
    const k = Math.sqrt(TEMPLATE_MAX_PRINT_PIXELS / (printW * printH));
    printW = Math.round(printW * k);
    printH = Math.round(printH * k);
    clamped = true;
  }
  return {
    display: { width: Math.max(1, displayW), height: Math.max(1, displayH) },
    print: { width: Math.max(1, Math.round(printW)), height: Math.max(1, Math.round(printH)) },
    aspect: displayW / displayH,
    clamped,
    effectiveDpi,
  };
}

// ─── 目录查询 ────────────────────────────────────────────────────────────────
export function getTemplateLayout(id: string): TemplateLayoutData | undefined {
  return TEMPLATE_CATALOG.layouts.find(l => l.i === id);
}
export function pickTemplateVariant(
  layout: TemplateLayoutData,
  aspect: number
): TemplateGeometry {
  let best = layout.g[0];
  let bestDelta = Infinity;
  for (const entry of layout.g) {
    const delta = Math.abs(Math.log(entry[0] / Math.max(0.001, aspect)));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = entry;
    }
  }
  return layout.v[best[1]] || layout.v[0];
}
export interface TemplateFilter {
  category: string;
  keyword: string;
  material: string;
  aspect: number;
}
export function filterTemplateLayouts(filter: TemplateFilter): TemplateLayoutData[] {
  const kw = filter.keyword.trim().toLowerCase();
  return TEMPLATE_CATALOG.layouts.filter(layout => {
    if (filter.category && filter.category !== "all" && layout.c !== filter.category) return false;
    if (filter.material && filter.material !== "all" && !layout.pc.mt.includes(filter.material)) return false;
    if (filter.aspect < layout.pc.mn - 0.001 || filter.aspect > layout.pc.mx + 0.001) return false;
    if (!kw) return true;
    return [layout.n, layout.h, layout.pt, layout.d, layout.c, layout.i]
      .join(" ")
      .toLowerCase()
      .includes(kw);
  });
}

/** 只吃「已算好的矩形」，避免把节点尺寸逻辑复制到第二个文件里。 */
export function computeTemplatePlacement(
  bounds: Array<{ x: number; y: number; width: number; height: number }>,
  size: { width: number; height: number },
  gap = 120
): { x: number; y: number } {
  if (bounds.length === 0) return { x: 0, y: 0 };
  let right = -Infinity;
  let top = Infinity;
  for (const b of bounds) {
    right = Math.max(right, b.x + b.width);
    top = Math.min(top, b.y);
  }
  if (!Number.isFinite(right) || !Number.isFinite(top)) return { x: 0, y: 0 };
  // x 取全部节点的右边界之外，天然不会与任何已有节点重叠
  return { x: Math.round(right + gap), y: Math.round(top) };
}

// ─── 子单元 ──────────────────────────────────────────────────────────────────
export type TemplatePieceKind =
  | "rect"
  | "ellipse"
  | "path"
  | "dots"
  | "text"
  | "placeholder";
export type TemplatePieceRole = "底纹" | "图形" | "文字" | "图位" | "页眉页脚";
export interface TemplatePiece {
  id: string;
  name: string;
  role: TemplatePieceRole;
  kind: TemplatePieceKind;
  /** 归一化到画板的 [x, y, w, h] */
  x: number;
  y: number;
  w: number;
  h: number;
  order: number;
  fill?: string;
  gradient?: TemplateGradient;
  stroke?: string;
  /** 线宽 / 画板高度 */
  strokeRatio?: number;
  opacity?: number;
  /** 圆角 / min(W,H) */
  cornerRadiusRatio?: number;
  rotation?: number;
  /** kind=path：归一化路径 */
  path?: string;
  /** kind=dots：相对本单元的 [x, y, r] */
  dots?: Array<[number, number, number]>;
  text?: string;
  /** 字号 / 画板高度 */
  sizeRatio?: number;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  color?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  /** 字距 / 画板高度 */
  trackingRatio?: number;
  strokeColor?: string;

  /* ── 2026-11-14 属性编辑命令新增（截图标注的全部字段） ── */
  /** 混合模式：透传 CSS mix-blend-mode，"穿透" = 不设置 */
  blendMode?: string;
  /** 描边虚线长度 / 间隙（相对画板高度）；0 = 实线 */
  strokeDash?: number;
  strokeGap?: number;
  strokeJoin?: "miter" | "round" | "bevel";
  strokeAlign?: "inside" | "center" | "outside";
  /** 填充 / 描边独立开关（截图里的两个复选框） */
  fillEnabled?: boolean;
  strokeEnabled?: boolean;
  /** 锁定：画布不可拖动，属性面板仍可解锁 */
  locked?: boolean;
  hidden?: boolean;
  /** 剪切蒙版：用本单元矩形裁切自身内容 */
  clipMask?: boolean;
  /** 空间 3D 旋转（CSS perspective + rotateX/rotateY，作用在节点容器） */
  rotateX?: number;
  rotateY?: number;
  /** 沿路径文字：textBody 改走 <textPath> */
  pathText?: boolean;
  /** 布尔运算：命令处理器把参与形状烘进来，渲染时用 SVG mask / clipPath 合成 */
  composite?: {
    mode: "union" | "subtract" | "intersect" | "exclude";
    shapes: TemplatePiece[];
  };
  /** 重复网格标记 */
  repeatGrid?: { cols: number; rows: number };
  /** 水平 / 垂直翻转 */
  flipX?: boolean;
  flipY?: boolean;
  /** 3D 立体厚度（节点容器 translateZ 视觉强度） */
  depth?: number;
}

/** 版式单元可执行的命令 id（悬浮命令条 / 属性面板共用同一套）。 */
export type TemplatePieceCommand = "align-left" | "align-hcenter" | "align-right"
  | "align-top" | "align-vcenter" | "align-bottom" | "distribute"
  | "repeat-grid" | "boolean-union" | "boolean-subtract" | "boolean-intersect" | "boolean-exclude"
  | "3d-extrude" | "3d-path" | "3d-rotate" | "path-text"
  | "clip-mask" | "flip-x" | "flip-y" | "reset-rotation" | "toggle-lock" | "bring-front" | "send-back";

/** 对齐命令 → 单元在画板中的目标 x/y（归一化坐标）。 */
export function alignPiece(piece: TemplatePiece, command: TemplatePieceCommand): Partial<TemplatePiece> {
  switch (command) {
    case "align-left": return { x: 0 };
    case "align-hcenter": return { x: Math.max(0, (1 - piece.w) / 2) };
    case "align-right": return { x: Math.max(0, 1 - piece.w) };
    case "align-top": return { y: 0 };
    case "align-vcenter": return { y: Math.max(0, (1 - piece.h) / 2) };
    case "align-bottom": return { y: Math.max(0, 1 - piece.h) };
    case "distribute": return { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    default: return {};
  }
}

/** 重复网格：把单元按 cols×rows 平铺，返回新增的单元（不含原单元）。 */
export function repeatPieceGrid(
  piece: TemplatePiece,
  cols: number,
  rows: number,
): TemplatePiece[] {
  const c = Math.max(1, Math.min(12, Math.round(cols)));
  const r = Math.max(1, Math.min(12, Math.round(rows)));
  const gapX = 0.006;
  const gapY = 0.006;
  const w = (piece.w - gapX * (c - 1)) / c;
  const h = (piece.h - gapY * (r - 1)) / r;
  const out: TemplatePiece[] = [];
  for (let row = 0; row < r; row += 1) {
    for (let col = 0; col < c; col += 1) {
      if (row === 0 && col === 0) continue;
      out.push({
        ...piece,
        id: `${piece.id}-grid-${row}-${col}`,
        name: `${piece.name} ${row + 1}-${col + 1}`,
        x: piece.x + col * (w + gapX),
        y: piece.y + row * (h + gapY),
        w: Math.max(0.001, w),
        h: Math.max(0.001, h),
        order: piece.order + out.length + 1,
        composite: undefined,
      });
    }
  }
  return out;
}

export interface TemplatePalette {
  name: string;
  colors: [string, string, string, string];
}

const DEFAULT_PALETTE: [string, string, string, string] = [
  "#f5f2ea",
  "#212724",
  "#b55235",
  "#ddd9cf",
];
export function resolveTemplateColor(
  value: string | undefined,
  palette: [string, string, string, string],
  fallback: string
): string {
  if (!value) return fallback;
  switch (value) {
    case "background": return palette[0];
    case "ink": return palette[1];
    case "accent": return palette[2];
    case "neutral": return palette[3];
    case "none": return "none";
    default: return value;
  }
}
function resolveGradient(
  value: string | TemplateGradient | undefined,
  palette: [string, string, string, string]
): { fill: string; gradient?: TemplateGradient } {
  if (!value) return { fill: "none" };
  if (typeof value === "string") return { fill: resolveTemplateColor(value, palette, value) };
  const stops = value.slice(4).map(s =>
    typeof s === "string" ? resolveTemplateColor(s, palette, s) : s
  );
  return { fill: "gradient", gradient: [...value.slice(0, 4), ...stops] as TemplateGradient };
}
function decorationFill(
  d: TemplateDecoration,
  palette: [string, string, string, string]
): { fill: string; gradient?: TemplateGradient } {
  if (d.f !== undefined) return resolveGradient(d.f, palette);
  if (d.c === "none") return { fill: "none" };
  return { fill: resolveTemplateColor(d.c, palette, palette[3]) };
}

const dotsCache = new Map<number, Array<[number, number, number]>>();
function decodeDots(index: number): Array<[number, number, number]> {
  const cached = dotsCache.get(index);
  if (cached) return cached;
  const entry = TEMPLATE_CATALOG.dots[index];
  if (!entry) return [];
  let binary = "";
  if (typeof atob === "function") {
    binary = atob(entry.b);
  } else {
    binary = Buffer.from(entry.b, "base64").toString("binary");
  }
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i + 4 < binary.length; i += 5) {
    const x = binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8);
    const y = binary.charCodeAt(i + 2) | (binary.charCodeAt(i + 3) << 8);
    const r = binary.charCodeAt(i + 4) / 100000;
    out.push([x / 10000, y / 10000, r]);
  }
  dotsCache.set(index, out);
  return out;
}

function labelToPiece(
  lb: TemplateLabel,
  palette: [string, string, string, string],
  name: string,
  order: number
): TemplatePiece {
  const [x, y, w, h] = lb.b;
  const rotation = lb.rr || 0;
  const swapped = Math.abs(rotation) === 90;
  const font = TEMPLATE_CATALOG.fonts[lb.ff || ""] || lb.ff || TEMPLATE_CATALOG.fonts.sans;
  return {
    id: "",
    name,
    role: "文字",
    kind: "text",
    x,
    y,
    w: swapped ? h : w,
    h: swapped ? w : h,
    order,
    rotation,
    text: lb.t,
    sizeRatio: lb.s,
    fontFamily: font,
    fontWeight: lb.w || 500,
    italic: !!lb.i,
    color: resolveTemplateColor(lb.c, palette, palette[1]),
    textAlign: (lb.a as TemplatePiece["textAlign"]) || "left",
    lineHeight: lb.lh || 1.12,
    trackingRatio: lb.tr || 0,
    strokeColor: lb.st ? resolveTemplateColor(lb.st, palette, "none") : undefined,
    strokeRatio: lb.sw || 0.001,
  };
}

/** 页眉页脚全部是本平台自己的文案，与参考站点不重名。 */
const BRAND_LINE = "ARTX / 版式工作台";

export function buildTemplatePieces(
  layout: TemplateLayoutData,
  geometry: TemplateGeometry
): TemplatePiece[] {
  const palette = TEMPLATE_CATALOG.palettes[layout.p] || DEFAULT_PALETTE;
  const pieces: TemplatePiece[] = [];
  let seq = 0;
  const add = (p: Omit<TemplatePiece, "id">) => {
    seq += 1;
    pieces.push({ ...p, id: `u${seq}` });
  };

  // 底纹（渐变或纯色覆盖画板底色）
  if (geometry.bf !== undefined) {
    const g = resolveGradient(geometry.bf, palette);
    add({
      name: "底纹", role: "底纹", kind: "rect",
      x: 0, y: 0, w: 1, h: 1, order: 0,
      fill: g.fill,
      gradient: g.gradient,
    });
  }

  // 装饰图形
  geometry.d.forEach((d, i) => {
    const f = decorationFill(d, palette);
    const base = {
      name: `${d.k === "r" ? "色块" : d.k === "e" ? "圆形" : d.k === "o" ? "网点" : "曲形"} ${String(i + 1).padStart(2, "0")}`,
      role: "图形" as const,
      kind: (d.k === "r" ? "rect" : d.k === "e" ? "ellipse" : d.k === "o" ? "dots" : "path") as TemplatePieceKind,
      x: d.b[0], y: d.b[1], w: d.b[2], h: d.b[3],
      order: 1,
      fill: f.fill,
      gradient: f.gradient,
      stroke: d.st ? resolveTemplateColor(d.st, palette, "none") : undefined,
      strokeRatio: d.sw,
      opacity: d.o,
      cornerRadiusRatio: d.cr,
      rotation: d.rr,
    };
    if (d.k === "p" && typeof d.p === "number") {
      add({ ...base, path: TEMPLATE_CATALOG.paths[d.p] || "", strokeRatio: d.sw || 0.0015 });
    } else if (d.k === "o" && typeof d.dt === "number") {
      add({ ...base, dots: decodeDots(d.dt) });
    } else {
      add(base);
    }
  });

  // 背景层标签
  geometry.l.forEach((lb, i) => {
    if (!lb.bg) return;
    add(labelToPiece(lb, palette, `背层文字 ${String(i + 1).padStart(2, "0")}`, 2));
  });

  // 主标题
  const ts = layout.ts || {};
  if (geometry.t) {
    const [x, y, w, h] = geometry.t;
    const familyKey = ts.ff || ts.f || "sans";
    const font = TEMPLATE_CATALOG.fonts[familyKey] || familyKey || TEMPLATE_CATALOG.fonts.sans;
    add({
      name: "主标题", role: "文字", kind: "text",
      x, y, w, h, order: 3,
      text: layout.pt || layout.n,
      sizeRatio: geometry.z * (typeof ts.s === "number" ? ts.s : 1),
      fontFamily: font,
      fontWeight: typeof ts.w === "number" ? ts.w : 800,
      italic: !!ts.i,
      color: resolveTemplateColor(ts.c, palette, palette[1]),
      textAlign: (ts.a as TemplatePiece["textAlign"]) || "left",
      lineHeight: typeof ts.lh === "number" ? ts.lh : familyKey === "display" ? 1.08 : 1.03,
      trackingRatio: typeof ts.t === "number" ? ts.t : 0,
    });
  }

  // 页眉页脚
  if (!geometry.hc) {
    const m = geometry.m;
    const idx = String(layout.ix).padStart(2, "0");
    add({
      name: "页眉标识", role: "页眉页脚", kind: "text",
      x: m, y: 0.036, w: 0.7, h: 0.035, order: 4,
      text: BRAND_LINE, sizeRatio: 0.012,
      fontFamily: TEMPLATE_CATALOG.fonts.sans, fontWeight: 600,
      color: palette[1], textAlign: "left", lineHeight: 1.12,
    });
    add({
      name: "目录编号", role: "页眉页脚", kind: "text",
      x: 0.83, y: 0.036, w: 0.115, h: 0.035, order: 4,
      text: `${idx} / 104`, sizeRatio: 0.013,
      fontFamily: TEMPLATE_CATALOG.fonts.mono, fontWeight: 500,
      color: palette[1], textAlign: "right", lineHeight: 1.12,
    });
    const sub = geometry.s || [m, 0.78, 0.83, 0.034];
    add({
      name: "副题", role: "页眉页脚", kind: "text",
      x: sub[0], y: sub[1], w: sub[2], h: sub[3], order: 4,
      text: layout.h, sizeRatio: 0.011,
      fontFamily: TEMPLATE_CATALOG.fonts.sans, fontWeight: 600,
      color: palette[2], textAlign: "left", lineHeight: 1.12,
    });
    add({
      name: "分隔线", role: "页眉页脚", kind: "rect",
      x: m, y: 0.94, w: Math.max(0.01, 1 - 2 * m), h: 0.0015, order: 4,
      fill: palette[1],
    });
    add({
      name: "页脚说明", role: "页眉页脚", kind: "text",
      x: m, y: 0.953, w: 0.77, h: 0.027, order: 4,
      text: `${layout.n} · ${layout.cl} 栏骨架 · ${geometry.md.length} 处图位`,
      sizeRatio: 0.01, fontFamily: TEMPLATE_CATALOG.fonts.sans, fontWeight: 500,
      color: palette[1], textAlign: "left", lineHeight: 1.12,
    });
    add({
      name: "页码", role: "页眉页脚", kind: "text",
      x: 0.85, y: 0.95, w: 0.095, h: 0.031, order: 4,
      text: idx, sizeRatio: 0.012,
      fontFamily: TEMPLATE_CATALOG.fonts.mono, fontWeight: 700,
      color: palette[2], textAlign: "right", lineHeight: 1.12,
    });
    if (layout.xr) {
      add({
        name: "强调短线", role: "页眉页脚", kind: "rect",
        x: m, y: 0.085, w: 0.12, h: 0.008, order: 4,
        fill: palette[2],
      });
    }
  }

  // 前景标签
  geometry.l.forEach((lb, i) => {
    if (lb.bg) return;
    add(labelToPiece(lb, palette, `文字 ${String(i + 1).padStart(2, "0")}`, 5));
  });

  // 图片位
  geometry.md.forEach((box, i) => {
    if (!box) return;
    add({
      name: `图位 ${String(i + 1).padStart(2, "0")}`, role: "图位", kind: "placeholder",
      x: box[0], y: box[1], w: box[2], h: box[3], order: 6,
      fill: palette[3],
      text: `图位 ${String(i + 1).padStart(2, "0")}`,
      sizeRatio: Math.min(0.014, box[3] * 0.11),
      fontFamily: TEMPLATE_CATALOG.fonts.sans, fontWeight: 500,
      color: palette[1], textAlign: "center", lineHeight: 1.12,
    });
  });

  // 正文框
  geometry.tx.forEach((box, i) => {
    if (!box) return;
    add({
      name: `正文 ${String(i + 1).padStart(2, "0")}`, role: "文字", kind: "text",
      x: box[0], y: box[1], w: box[2], h: box[3], order: 6,
      text: "在此补充文字", sizeRatio: Math.min(0.022, box[3] * 0.4),
      fontFamily: TEMPLATE_CATALOG.fonts.sans, fontWeight: 400,
      color: palette[1], textAlign: "left", lineHeight: 1.2,
    });
  });

  return pieces.sort((a, b) => a.order - b.order);
}

// ─── 唯一的 SVG 渲染出口 ─────────────────────────────────────────────────────
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0";
}

/** 把归一化路径按单元尺寸放大到绝对坐标。 */
export function scaleSvgPath(
  d: string,
  sx: number,
  sy: number,
  ox: number,
  oy: number
): string {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  let cmd = "";
  let i = 0;
  const parts: string[] = [];
  const read = () => Number(tokens[i++]);
  const ax = (v: number, relative: boolean) => n(v * sx + (relative ? 0 : ox));
  const ay = (v: number, relative: boolean) => n(v * sy + (relative ? 0 : oy));
  let guard = 0;
  while (i < tokens.length && guard++ < 20000) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
      const up = cmd.toUpperCase();
      if (up === "Z") {
        parts.push("Z");
        cmd = "";
        continue;
      }
    }
    if (!cmd) {
      i += 1;
      continue;
    }
    const up = cmd.toUpperCase();
    const relative = cmd !== up;
    switch (up) {
      case "M":
      case "L":
      case "T": {
        const x = read(), y = read();
        parts.push(`${cmd}${ax(x, relative)} ${ay(y, relative)}`);
        if (up === "M") cmd = relative ? "l" : "L";
        break;
      }
      case "H": parts.push(`${cmd}${ax(read(), relative)}`); break;
      case "V": parts.push(`${cmd}${ay(read(), relative)}`); break;
      case "C": {
        const a = read(), b = read(), c = read(), e = read(), f = read(), g = read();
        parts.push(`${cmd}${ax(a, relative)} ${ay(b, relative)} ${ax(c, relative)} ${ay(e, relative)} ${ax(f, relative)} ${ay(g, relative)}`);
        break;
      }
      case "S":
      case "Q": {
        const a = read(), b = read(), c = read(), e = read();
        parts.push(`${cmd}${ax(a, relative)} ${ay(b, relative)} ${ax(c, relative)} ${ay(e, relative)}`);
        break;
      }
      default: i += 1; break;
    }
  }
  return parts.join(" ");
}

function gradientDefs(piece: TemplatePiece, W: number, H: number, key: string): string {
  const g = piece.gradient;
  if (!g || g.length < 5) return "";
  const [x0, y0, x1, y1] = g.slice(0, 4) as number[];
  const stops = g.slice(4);
  const body = stops
    .map((s, i) => `<stop offset="${n(i / Math.max(1, stops.length - 1))}" stop-color="${esc(String(s))}"/>`)
    .join("");
  return `<defs><linearGradient id="${key}" gradientUnits="userSpaceOnUse" x1="${n(x0 * W)}" y1="${n(y0 * H)}" x2="${n(x1 * W)}" y2="${n(y1 * H)}">${body}</linearGradient></defs>`;
}

/** 生成单个几何图元（布尔合成时会被复用，不带 <g> 包裹）。 */
function shapeBody(piece: TemplatePiece, W: number, H: number, key: string, attrs = ""): string {
  const px = piece.x * W;
  const py = piece.y * H;
  const pw = Math.max(0, piece.w * W);
  const ph = Math.max(0, piece.h * H);
  const cx = px + pw / 2;
  const cy = py + ph / 2;
  const fillOn = piece.fillEnabled !== false;
  const strokeOn = piece.strokeEnabled !== false && !!piece.stroke && piece.stroke !== "none";
  const fill = fillOn
    ? (piece.fill === "gradient" ? `url(#${key})` : piece.fill || "none")
    : "none";
  const sw = Math.max(0.5, (piece.strokeRatio || 0) * H);
  const dash = (piece.strokeDash || 0) > 0 || (piece.strokeGap || 0) > 0
    ? ` stroke-dasharray="${n(Math.max(0, (piece.strokeDash || 0) * H))} ${n(Math.max(0, (piece.strokeGap || 0) * H))}"`
    : "";
  const join = piece.strokeJoin ? ` stroke-linejoin="${piece.strokeJoin}"` : "";
  const stroke = strokeOn
    ? ` stroke="${esc(piece.stroke!)}" stroke-width="${n(sw)}"${dash}${join}`
    : "";
  const opacity = piece.opacity === undefined ? "" : ` opacity="${n(piece.opacity)}"`;
  // 描边位置：SVG 没有原生 stroke-alignment，inside 把图元内缩半个线宽，outside 外扩。
  const inset = piece.strokeAlign === "inside" ? sw / 2 : piece.strokeAlign === "outside" ? -sw / 2 : 0;
  const rx = (piece.cornerRadiusRatio || 0) * Math.min(W, H);
  const extra = attrs ? ` ${attrs}` : "";
  switch (piece.kind) {
    case "rect":
    case "placeholder":
      return `<rect x="${n(px + inset)}" y="${n(py + inset)}" width="${n(Math.max(0, pw - inset * 2))}" height="${n(Math.max(0, ph - inset * 2))}" rx="${n(rx)}" fill="${esc(fill)}"${stroke}${opacity}${extra}/>`;
    case "ellipse":
      return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(Math.max(0, pw / 2 - inset))}" ry="${n(Math.max(0, ph / 2 - inset))}" fill="${esc(fill)}"${stroke}${opacity}${extra}/>`;
    case "path":
      return `<path d="${esc(scaleSvgPath(piece.path || "", pw, ph, px, py))}" fill="${esc(fill)}"${stroke}${opacity}${extra}/>`;
    case "dots": {
      const r0 = Math.min(W, H);
      return (piece.dots || [])
        .map(([dx, dy, r]) => `<circle cx="${n(px + dx * pw)}" cy="${n(py + dy * ph)}" r="${n(r * r0)}" fill="${esc(fill)}"${opacity}${extra}/>`)
        .join("");
    }
    default:
      return "";
  }
}

/**
 * 版式单元的完整 SVG 片段。
 * ⚠️ 所有属性编辑命令的视觉结果都必须收口在这里（画布节点 / 缩略图 / 下载 / 复制 /
 *    参考图 / 打印共用 renderPieceSvg → pieceBody），不能在组件里另画一套。
 */
function pieceBody(piece: TemplatePiece, W: number, H: number, key: string): string {
  if (piece.hidden) return "";
  const px = piece.x * W;
  const py = piece.y * H;
  const pw = Math.max(0, piece.w * W);
  const ph = Math.max(0, piece.h * H);
  const cx = px + pw / 2;
  const cy = py + ph / 2;
  const rotation = piece.rotation || 0;
  const blend = piece.blendMode && piece.blendMode !== "穿透" && piece.blendMode !== "pass-through" && piece.blendMode !== "normal"
    ? ` style="mix-blend-mode:${esc(piece.blendMode)}"`
    : "";
  const transforms: string[] = [];
  if (rotation) transforms.push(`rotate(${n(rotation)} ${n(cx)} ${n(cy)})`);
  if (piece.flipX) transforms.push(`translate(${n(2 * cx)} 0) scale(-1 1)`);
  if (piece.flipY) transforms.push(`translate(0 ${n(2 * cy)}) scale(1 -1)`);
  const rotationAttr = transforms.length ? ` transform="${transforms.join(" ")}"` : "";
  let defs = gradientDefs(piece, W, H, key);

  // 剪切蒙版：用本单元矩形裁掉溢出内容（截图「剪切蒙版」命令）
  let clipAttr = "";
  if (piece.clipMask) {
    defs += `<defs><clipPath id="${key}Clip"><rect x="${n(px)}" y="${n(py)}" width="${n(pw)}" height="${n(ph)}" rx="${n((piece.cornerRadiusRatio || 0) * Math.min(W, H))}"/></clipPath></defs>`;
    clipAttr = ` clip-path="url(#${key}Clip)"`;
  }

  let body = "";
  const composite = piece.composite;
  if (composite && composite.shapes.length) {
    // 布尔运算：用 SVG 原生 mask / clipPath 做可见、可逆的合成，不需要几何引擎。
    const shapeId = `${key}Shape`;
    const maskId = `${key}Mask`;
    const partnerMarkup = composite.shapes
      .map(p => shapeBody(p, W, H, `${key}p`, 'fill="#ffffff" stroke="none"'))
      .join("");
    if (composite.mode === "union") {
      body = `${shapeBody(piece, W, H, key)}${composite.shapes.map(p => shapeBody(p, W, H, key)).join("")}`;
    } else if (composite.mode === "intersect") {
      defs += `<defs><clipPath id="${shapeId}">${composite.shapes.map(p => shapeBody(p, W, H, key)).join("")}</clipPath></defs>`;
      body = `<g clip-path="url(#${shapeId})">${shapeBody(piece, W, H, key)}</g>`;
    } else {
      const holeColor = composite.mode === "subtract" ? "#000000" : "#000000";
      const baseColor = composite.mode === "subtract" ? "#ffffff" : "#000000";
      defs += `<defs><mask id="${maskId}"><rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="${baseColor}"/>${partnerMarkup.replace(/fill="#ffffff"/g, `fill="${holeColor}"`)}</mask></defs>`;
      if (composite.mode === "subtract") {
        // 白底 + 黑色参与形状 = 挖掉重叠区
        defs = defs.replace(`<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#ffffff"/>`, `<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#ffffff"/>`);
        body = `<g mask="url(#${maskId})">${shapeBody(piece, W, H, key)}</g>`;
      } else {
        // 排除：两份形状各自减去对方，再叠加
        defs += `<defs><mask id="${maskId}2"><rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="#ffffff"/>${shapeBody(piece, W, H, key, 'fill="#000000" stroke="none"')}</mask></defs>`;
        body = `<g mask="url(#${maskId}2)">${composite.shapes.map(p => shapeBody(p, W, H, key)).join("")}</g><g mask="url(#${maskId})">${shapeBody(piece, W, H, key)}</g>`;
      }
    }
  } else {
    body = shapeBody(piece, W, H, key);
    if (piece.kind === "text") {
      body += textBody(piece, W, H, px, py, pw, piece.textAlign || "left", key);
    } else if (piece.kind === "placeholder" && piece.text) {
      body += textBody(piece, W, H, px + pw * 0.02, py + ph * 0.42, pw * 0.96, "center", key);
    }
  }
  return `${defs}<g${rotationAttr}${blend}${clipAttr}>${body}</g>`;
}

function textBody(
  piece: TemplatePiece,
  W: number,
  H: number,
  px: number,
  py: number,
  pw: number,
  align: "left" | "center" | "right",
  key = "artxTplText"
): string {
  const fontSize = Math.max(1, (piece.sizeRatio || 0.014) * H);
  const lineHeight = (piece.lineHeight || 1.12) * fontSize;
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const tx = align === "center" ? px + pw / 2 : align === "right" ? px + pw : px;
  const lines = (piece.text || "").split("\n");
  // ⚠️ 基线必须落在「盒子顶 + 1 倍字号」附近：0.86 会让字形上沿越过
  //    viewBox 上边界，被 SVG 裁掉半个字（画布实测过，缩略图里看不出来）。
  const baseline = py + fontSize * 1.02;
  const tspans = lines
    .map((line, i) =>
      `<tspan x="${n(tx)}" ${i === 0 ? `y="${n(baseline)}"` : `dy="${n(lineHeight)}"`}>${esc(line || " ")}</tspan>`
    )
    .join("");
  const paint = piece.strokeColor && piece.strokeColor !== "none"
    ? ` stroke="${esc(piece.strokeColor)}" stroke-width="${n(Math.max(0.5, (piece.strokeRatio || 0.001) * H))}" paint-order="stroke fill"`
    : "";
  const common = `fill="${esc(piece.color || "#000000")}" font-family="${esc(piece.fontFamily || "sans-serif")}" font-size="${n(fontSize)}" font-weight="${piece.fontWeight || 500}"${piece.italic ? ' font-style="italic"' : ""} text-anchor="${anchor}" letter-spacing="${n((piece.trackingRatio || 0) * H)}"${paint}${piece.opacity === undefined ? "" : ` opacity="${n(piece.opacity)}"`}`;
  // 沿路径文字：把单元自身的 path 当成文字基线路径
  if (piece.pathText && piece.path) {
    const pathId = `${key}Path`;
    const ph = Math.max(1, fontSize * 2.4);
    const d = scaleSvgPath(piece.path, pw, ph, px, py);
    return `<defs><path id="${pathId}" d="${esc(d)}"/></defs><text ${common}><textPath href="#${pathId}" startOffset="0%">${esc(lines.join(" "))}</textPath></text>`;
  }
  return `<text x="${n(tx)}" y="${n(baseline)}" ${common}>${tspans}</text>`;
}

/** 整张版式（面板缩略图 / 打印导出共用）。 */
export function renderTemplateSvg(
  pieces: TemplatePiece[],
  width: number,
  height: number,
  background?: string
): string {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const bg = background ? `<rect width="${n(W)}" height="${n(H)}" fill="${esc(background)}"/>` : "";
  const body = pieces
    .map((p, i) => pieceBody(p, W, H, `artxTplGrad${i}`))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}">${bg}${body}</svg>`;
}

/** 单个子单元（画布节点 / 下载 / 复制 / 参考图共用）。 */
export function renderPieceSvg(
  piece: TemplatePiece,
  width: number,
  height: number
): string {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const pw = Math.max(1, piece.w * W);
  const ph = Math.max(1, piece.h * H);
  // 只改 viewBox 做裁切，图元仍用整张画板的绝对坐标；
  // 这样渐变 userSpaceOnUse 的坐标、旋转中心都与整图渲染完全一致。
  const body = pieceBody(piece, W, H, "artxTplGrad0");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(pw)}" height="${n(ph)}" viewBox="${n(piece.x * W)} ${n(piece.y * H)} ${n(pw)} ${n(ph)}" overflow="visible">${body}</svg>`;
}

export function templateBackground(layout: TemplateLayoutData): string {
  const palette = TEMPLATE_CATALOG.palettes[layout.p] || DEFAULT_PALETTE;
  return palette[0];
}

// ─── SVG → 位图 ──────────────────────────────────────────────────────────────
export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.src = url;
  try {
    if (typeof image.decode === "function") await image.decode();
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("svg load failed"));
    });
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, "image/png")
  );
}
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ─── 生成 ReactFlow 节点 ─────────────────────────────────────────────────────
export interface TemplateBuildOptions {
  frameId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  print: {
    paperId: string;
    orientation: TemplateOrientation;
    resolution: TemplateResolution;
    bleedMm: number;
    printWidth: number;
    printHeight: number;
  };
}
export function buildTemplateNodes(
  layout: TemplateLayoutData,
  options: TemplateBuildOptions
): Node[] {
  const { frameId, position, size, zIndex } = options;
  const geometry = pickTemplateVariant(layout, size.width / size.height);
  const pieces = buildTemplatePieces(layout, geometry);
  const bg = templateBackground(layout);
  const frame: Node = {
    id: frameId,
    type: "canvasFrame",
    position: { ...position },
    style: { width: size.width, height: size.height, background: bg },
    data: {
      id: frameId,
      title: layout.n,
      width: size.width,
      height: size.height,
      bgColor: bg,
      originalBgColor: bg,
      templateLayoutId: layout.i,
      templatePrint: options.print,
    },
    zIndex,
    selected: true,
  };
  const children: Node[] = pieces.map((piece, index) => {
    const id = `${frameId}-${piece.id}`;
    return {
      id,
      type: "templatePiece",
      position: {
        x: position.x + piece.x * size.width,
        y: position.y + piece.y * size.height,
      },
      style: {
        width: Math.max(1, piece.w * size.width),
        height: Math.max(1, piece.h * size.height),
      },
      data: {
        id,
        title: piece.name,
        piece,
        frameW: size.width,
        frameH: size.height,
        embeddedInFrame: frameId,
        templateOwner: frameId,
        templateLayoutId: layout.i,
        sizeCustomized: true,
      },
      zIndex: zIndex + 1 + index,
      selected: false,
    };
  });
  return [frame, ...children];
}
