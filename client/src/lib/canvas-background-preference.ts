/**
 * 画布辅助底纹 / 网格吸附的偏好（2026-11-14）。
 *
 * 🔒 纯本地 UI 偏好，不进云同步、不进画布文档。
 * ⚠️ 默认必须是「点阵 + 不吸附」= 改动前的行为，组件扩展新字段默认=原行为。
 */
export type CanvasBackgroundPattern = "dots" | "checker" | "isometric";

export const CANVAS_BACKGROUND_PATTERNS: Array<{ id: CanvasBackgroundPattern; label: string }> = [
  { id: "dots", label: "点阵" },
  { id: "checker", label: "棋盘格" },
  { id: "isometric", label: "轴测网格" },
];

/** 网格顶点间距（世界坐标），与原点阵 gap 一致。 */
export const CANVAS_GRID_SIZE = 24;

export interface CanvasBackgroundPreference {
  pattern: CanvasBackgroundPattern;
  /** 每种底纹各自的透明度，切换回来时保留上次调的值 */
  opacity: Record<CanvasBackgroundPattern, number>;
  /** 磁铁：拖动结束后吸附到网格顶点 */
  snapEnabled: boolean;
}

const STORAGE_KEY = "artx:canvas-background-pref-v1";

export const DEFAULT_CANVAS_BACKGROUND_PREFERENCE: CanvasBackgroundPreference = {
  pattern: "dots",
  opacity: { dots: 1, checker: 0.5, isometric: 0.65 },
  snapEnabled: false,
};

export function clampOpacity(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.05, Math.round(n * 100) / 100));
}

function isPattern(value: unknown): value is CanvasBackgroundPattern {
  return value === "dots" || value === "checker" || value === "isometric";
}

/** 读偏好。任何脏数据都按字段回落到默认值，不让整份设置坏掉。 */
export function readCanvasBackgroundPreference(): CanvasBackgroundPreference {
  if (typeof window === "undefined") return DEFAULT_CANVAS_BACKGROUND_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CANVAS_BACKGROUND_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<CanvasBackgroundPreference>;
    const base = DEFAULT_CANVAS_BACKGROUND_PREFERENCE;
    return {
      pattern: isPattern(parsed.pattern) ? parsed.pattern : base.pattern,
      opacity: {
        dots: clampOpacity(parsed.opacity?.dots, base.opacity.dots),
        checker: clampOpacity(parsed.opacity?.checker, base.opacity.checker),
        isometric: clampOpacity(parsed.opacity?.isometric, base.opacity.isometric),
      },
      snapEnabled: typeof parsed.snapEnabled === "boolean" ? parsed.snapEnabled : base.snapEnabled,
    };
  } catch {
    return DEFAULT_CANVAS_BACKGROUND_PREFERENCE;
  }
}

export function writeCanvasBackgroundPreference(pref: CanvasBackgroundPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // 偏好写失败不影响画布使用
  }
}

/** 吸附到最近的网格顶点。snap 关闭时原样返回。 */
export function snapToGrid(value: number, enabled: boolean, grid = CANVAS_GRID_SIZE): number {
  if (!enabled || !Number.isFinite(value)) return value;
  return Math.round(value / grid) * grid;
}
