/**
 * 画板「一键规整」的排布算法（唯一事实源）。
 *
 * 背景：画板（canvasFrame）里的图片节点（asset）是用户随手拖进去的，位置零散甚至重叠。
 * 用户要求在画板命令条上加一个「一键规整」，点一下把画板内的图片自动排成工整网格。
 *
 * 为什么抽成纯函数放 shared/：
 *   InfiniteCanvas.tsx 已经 3.7 万行，排布规则写在组件里既没法单测、又会变成第二个出口。
 *   这里是**唯一**计算目标坐标的地方，组件只负责「取节点 → 调它 → setNodes 写回」。
 *
 * ⚠️ 两条刻意的取舍（改之前先想清楚）：
 *
 * 1. **只缩不放（scale ≤ 1）**。把小图放大到撑满格子确实更"齐"，但会让低分辨率图发虚，
 *    而且等比放大也是"改变了尺寸"——用户对节点尺寸被悄悄改动很敏感。
 *    所以这里只在图片装不进格子时按比例缩小，装得下就保持原尺寸、在格子里居中。
 *
 * 2. **顺序按"阅读序"保留**，不是按 id、也不是按面积。用户心里已经有一个大致的先后
 *    （左上是第一张），重排后如果顺序被打乱，观感是"被打乱了"而不是"被规整了"。
 *    所以先按 y 分行（带容差），行内按 x 排，再按这个序填进网格。
 */

export interface FrameArrangeFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameArrangeNode {
  id: string;
  /** 节点当前左上角坐标（画布绝对坐标），用于推断阅读顺序 */
  x: number;
  y: number;
  /** 节点当前显示尺寸 */
  width: number;
  height: number;
}

export interface FrameArrangeItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameArrangeOptions {
  /** 画板四周留白；不传则按画板短边自适应 */
  padding?: number;
  /** 单元格之间的间距；不传则按画板短边自适应 */
  gap?: number;
}

export interface FrameArrangeResult {
  items: FrameArrangeItem[];
  columns: number;
  rows: number;
}

const MIN_PADDING = 16;
const MAX_PADDING = 48;
const MIN_GAP = 12;
const MAX_GAP = 32;
/** 单元格再小也不能小于这个值，否则算出来的尺寸没有意义 */
const MIN_CELL = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 选列数：让单元格的宽高比尽量贴近图片的平均宽高比，网格才不会出现
 * 「一排横图挤在竖长条里」这种明明对齐了却很难看的结果。
 *
 * 推导：设列数 c、行数 n/c，单元宽 = W/c，单元高 = H·c/n，
 * 令 (W/c) / (H·c/n) ≈ aspect  →  c = sqrt(W·n / (H·aspect))。
 */
export function pickGridColumns(
  count: number,
  innerWidth: number,
  innerHeight: number,
  averageAspect: number
): number {
  if (count <= 1) return Math.max(1, count);
  if (!isPositive(innerWidth) || !isPositive(innerHeight)) {
    return Math.ceil(Math.sqrt(count));
  }
  const aspect = isPositive(averageAspect) ? averageAspect : 1;
  const raw = Math.sqrt((innerWidth * count) / (innerHeight * aspect));
  const columns = Math.round(raw);
  return clamp(Number.isFinite(columns) ? columns : 1, 1, count);
}

/**
 * 按阅读顺序（先上后下、同一行内先左后右）排序。
 *
 * 行容差取平均高度的一半：纯比较 y 会让「肉眼明明在同一排、y 差了 3px」的两张图
 * 被判成上下两行，排序结果跟用户看到的不一致。
 */
export function sortNodesByReadingOrder(
  nodes: FrameArrangeNode[]
): FrameArrangeNode[] {
  if (nodes.length <= 1) return [...nodes];
  const averageHeight =
    nodes.reduce((sum, node) => sum + Math.max(1, node.height), 0) /
    nodes.length;
  const rowTolerance = Math.max(8, averageHeight * 0.5);
  return [...nodes].sort((a, b) => {
    const aCenterY = a.y + a.height / 2;
    const bCenterY = b.y + b.height / 2;
    if (Math.abs(aCenterY - bCenterY) > rowTolerance) {
      return aCenterY - bCenterY;
    }
    const byX = a.x - b.x;
    if (byX !== 0) return byX;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * 计算画板内图片节点的规整坐标。
 *
 * 返回的坐标是**画布绝对坐标**（和节点 position 同一套），调用方可以直接写回 position。
 * 空数组入参返回空结果，调用方据此提示「画板内没有图片」。
 */
export function computeFrameAutoArrange(
  frame: FrameArrangeFrame,
  nodes: FrameArrangeNode[],
  options: FrameArrangeOptions = {}
): FrameArrangeResult {
  const usable = nodes.filter(
    node => isPositive(node.width) && isPositive(node.height)
  );
  if (usable.length === 0) return { items: [], columns: 0, rows: 0 };

  const frameWidth = isPositive(frame.width) ? frame.width : 800;
  const frameHeight = isPositive(frame.height) ? frame.height : 600;
  const shortSide = Math.min(frameWidth, frameHeight);

  const padding = isPositive(options.padding)
    ? options.padding
    : clamp(Math.round(shortSide * 0.05), MIN_PADDING, MAX_PADDING);
  const gap = isPositive(options.gap)
    ? options.gap
    : clamp(Math.round(shortSide * 0.03), MIN_GAP, MAX_GAP);

  const innerWidth = Math.max(MIN_CELL, frameWidth - padding * 2);
  const innerHeight = Math.max(MIN_CELL, frameHeight - padding * 2);

  const averageAspect =
    usable.reduce((sum, node) => sum + node.width / node.height, 0) /
    usable.length;

  const columns = pickGridColumns(
    usable.length,
    innerWidth,
    innerHeight,
    averageAspect
  );
  const rows = Math.ceil(usable.length / columns);

  const cellWidth = Math.max(
    MIN_CELL,
    (innerWidth - gap * (columns - 1)) / columns
  );
  const cellHeight = Math.max(
    MIN_CELL,
    (innerHeight - gap * (rows - 1)) / rows
  );

  const ordered = sortNodesByReadingOrder(usable);
  const originX = frame.x + padding;
  const originY = frame.y + padding;

  const items = ordered.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    // 只缩不放：装得下就保持原尺寸，装不下才等比缩小。
    const scale = Math.min(1, cellWidth / node.width, cellHeight / node.height);
    const width = Math.max(1, Math.round(node.width * scale));
    const height = Math.max(1, Math.round(node.height * scale));
    const cellX = originX + column * (cellWidth + gap);
    const cellY = originY + row * (cellHeight + gap);
    return {
      id: node.id,
      x: Math.round(cellX + (cellWidth - width) / 2),
      y: Math.round(cellY + (cellHeight - height) / 2),
      width,
      height,
    };
  });

  return { items, columns, rows };
}
