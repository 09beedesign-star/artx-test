/**
 * 引导蒙层挖孔的几何计算（纯函数，唯一事实源）
 *
 * ⚠️⚠️ 为什么要单独抽一个模块：
 * 这里的数学一旦错了，症状是「黑色遮罩视觉上完全消失」，而代码**零报错**。
 * 抽成纯函数才能被 vitest 真正断言（本项目 environment 是 node，
 * 组件渲染测不了，源码字符串匹配又只是「测常量」不是「测修复」）。
 *
 * 背景事故（2026-09-14 实测）：
 * 首页「灵感推荐」锚点原本打在 `min-h-screen` 的外层 section 上，
 * 实测高度 6108px，而视口只有 577px。
 * 四块遮罩（上/下/左/右）的尺寸都由「视口尺寸 - 挖孔矩形」推出，
 * rect 一旦溢出视口，四块全被 `Math.max(0, …)` 压成 0 → 遮罩覆盖率 0%。
 */

export interface CutoutRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface BoxLike {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * 挖孔面积占视口的上限。
 *
 * 超过它就不挖孔，直接退化成全屏蒙层：
 * 宁可「孔没挖出来但文案还读得到」，也不能「遮罩静默消失」。
 */
export const MAX_CUTOUT_VIEWPORT_RATIO = 0.85;

/**
 * 把目标元素矩形加上 padding 后裁剪到视口内。
 *
 * @returns 可用于挖孔的矩形；返回 `null` 表示**不适合挖孔**，
 *          调用方应退化为全屏蒙层 + 居中气泡。
 *
 * 返回 null 的两种情况：
 *  1. 元素完全滚出视口（交集为空）；
 *  2. 裁剪后仍占据视口 85% 以上 —— 挖了等于没挖。
 */
export function computeCutoutRect(
  box: BoxLike,
  padding: number,
  viewport: Viewport,
): CutoutRect | null {
  const top = Math.max(0, box.top - padding);
  const left = Math.max(0, box.left - padding);
  const bottom = Math.min(viewport.height, box.bottom + padding);
  const right = Math.min(viewport.width, box.right + padding);

  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) return null;
  if (width * height > viewport.width * viewport.height * MAX_CUTOUT_VIEWPORT_RATIO) {
    return null;
  }

  return { top, left, width, height };
}

/**
 * 由挖孔矩形推出四块遮罩（上 / 下 / 左 / 右）。
 * `rect` 为 null 时返回单块全屏遮罩。
 */
export function buildMaskPieces(
  rect: CutoutRect | null,
  viewport: Viewport,
): CutoutRect[] {
  if (!rect) {
    return [{ top: 0, left: 0, width: viewport.width, height: viewport.height }];
  }
  return [
    { top: 0, left: 0, width: viewport.width, height: Math.max(0, rect.top) },
    {
      top: rect.top + rect.height,
      left: 0,
      width: viewport.width,
      height: Math.max(0, viewport.height - rect.top - rect.height),
    },
    { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
    {
      top: rect.top,
      left: rect.left + rect.width,
      width: Math.max(0, viewport.width - rect.left - rect.width),
      height: rect.height,
    },
  ];
}

/**
 * 计算四块遮罩实际覆盖了视口的百分之多少（0~1）。
 *
 * ⭐ 这是判断「遮罩到底有没有生效」的唯一硬指标。
 * 只数遮罩块的数量是不够的 —— 四块高度全为 0 时数量仍然是 4。
 */
export function maskCoverageRatio(
  pieces: CutoutRect[],
  viewport: Viewport,
): number {
  const total = viewport.width * viewport.height;
  if (total <= 0) return 0;
  const covered = pieces.reduce((sum, piece) => {
    const w = Math.max(0, Math.min(piece.left + piece.width, viewport.width) - Math.max(piece.left, 0));
    const h = Math.max(0, Math.min(piece.top + piece.height, viewport.height) - Math.max(piece.top, 0));
    return sum + w * h;
  }, 0);
  return covered / total;
}
