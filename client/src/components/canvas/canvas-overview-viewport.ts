/**
 * 进入画布时的「全局概览」视口。
 *
 * 2026-10-30 用户要求：任何时候进入画布，都要看到全局；
 * 不能一进来就把图片放得很大、铺满整个画布。
 *
 * ⚠️ 原来用的是 <ReactFlow fitView padding=0.15>，它会把内容「撑满」视口，
 * 而且最多放大到 maxZoom（4 倍）。只有一张图时，这张图就会铺满屏幕。
 *
 * ✅ 现在的规则：
 * - 内容的包围盒只占可视区的一部分：单个节点约 26%，多个节点约 62%，四周留出空白；
 * - 缩放上限是 1，宁可显示得小，也不放大；
 * - 内容居中放在「可视区」里，这里的可视区已经扣掉了右侧助手面板。
 */
export type OverviewRect = { x: number; y: number; width: number; height: number };

export const OVERVIEW_SINGLE_NODE_FRACTION = 0.26;
export const OVERVIEW_MULTI_NODE_FRACTION = 0.62;
export const OVERVIEW_MAX_ZOOM = 1;

export function computeOverviewViewport(
  rects: OverviewRect[],
  viewportSize: { width: number; height: number },
  options: { minZoom: number; maxZoom?: number }
): { x: number; y: number; zoom: number } | null {
  const valid = rects.filter(
    r =>
      Number.isFinite(r.x) &&
      Number.isFinite(r.y) &&
      r.width > 0 &&
      r.height > 0
  );
  if (!valid.length || viewportSize.width <= 0 || viewportSize.height <= 0)
    return null;

  const minX = Math.min(...valid.map(r => r.x));
  const minY = Math.min(...valid.map(r => r.y));
  const maxX = Math.max(...valid.map(r => r.x + r.width));
  const maxY = Math.max(...valid.map(r => r.y + r.height));
  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;

  const fraction =
    valid.length <= 1
      ? OVERVIEW_SINGLE_NODE_FRACTION
      : OVERVIEW_MULTI_NODE_FRACTION;
  const maxZoom = Math.min(options.maxZoom ?? OVERVIEW_MAX_ZOOM, OVERVIEW_MAX_ZOOM);
  const fitZoom = Math.min(
    (viewportSize.width * fraction) / boundsWidth,
    (viewportSize.height * fraction) / boundsHeight
  );
  const zoom = Math.max(options.minZoom, Math.min(maxZoom, fitZoom));

  const centerX = minX + boundsWidth / 2;
  const centerY = minY + boundsHeight / 2;
  return {
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
    zoom,
  };
}
