/**
 * 空画布引导（暗纹缺省按钮）的显示判据——**唯一事实源**。
 *
 * 【为什么单独抽一个文件】
 * 「画布是不是空的」这个判断会被至少两处消费：引导层要不要渲染、
 * 以及后续可能的埋点/新手引导。本项目的老毛病是同一份逻辑散落成多个出口，
 * 只改一个出口 = 功能等于没做且零报错。所以判据先收口，再接入。
 *
 * 【判据为什么不是 `nodes.length === 0`】
 * 画布里存在**用户看不见但确实存在**的节点形态：
 *   - 被隐藏（hidden）的节点；
 *   - 正在拖拽绘制、尚未落定的临时矩形。
 * 如果直接数 nodes.length，用户会遇到「画布明明空空如也，引导却不出现」，
 * 而这种失效是**静默的**——不报错，只是按钮没了。
 *
 * ⚠️ 反过来同样要命：一旦画布有任何内容就必须立刻隐藏引导（用户明确要求），
 * 所以这里采取**排除法**——排除掉「不算内容」的，剩下任何一个都算有内容。
 * 📌 正向匹配「哪些算内容」会漏掉所有将来新增的节点类型（本项目已踩过）。
 */

/** 判定用的最小节点形状，避免依赖 ReactFlow 的具体类型。 */
export type CanvasEmptyStateNode = {
  id?: string;
  type?: string;
  hidden?: boolean;
  data?: Record<string, unknown> | null;
};

/**
 * 不计入「画布有内容」的节点类型。
 *
 * ⚠️ 只放**纯辅助性、用户不认为是自己创作物**的类型。
 * 拿不准时不要加进来：漏判导致引导早消失（用户少一个入口），
 * 误判导致引导压在真实内容上（用户被挡住），后者严重得多。
 */
const NON_CONTENT_NODE_TYPES = new Set<string>([]);

/**
 * 画布是否处于「空白」状态（应当显示暗纹引导）。
 *
 * 只要存在任意一个可见的内容节点就返回 false。
 */
export function isCanvasEmpty(nodes: CanvasEmptyStateNode[] | null | undefined): boolean {
  if (!Array.isArray(nodes) || nodes.length === 0) return true;
  return !nodes.some(node => {
    if (!node) return false;
    // 隐藏节点用户看不见，不足以构成「画布有内容」。
    if (node.hidden === true) return false;
    const type = typeof node.type === "string" ? node.type : "";
    if (type && NON_CONTENT_NODE_TYPES.has(type)) return false;
    return true;
  });
}

/**
 * 空白图片节点的边长占画布可视区的比例（用户要求 70%）。
 */
export const EMPTY_STATE_DRAFT_NODE_RATIO = 0.7;

/**
 * 计算「生成图片」占位节点的尺寸与左上角坐标。
 *
 * 用户要求：占据画面 70% 面积、**正方形**、位于画布正中。
 *
 * ⚠️ 边长取宽高中的**较小值**再乘以比例：
 * 若按较大值算，在窄屏（或助手面板展开把画布挤窄时）节点会超出可视区，
 * 用户只能看到它的一角 —— 而这不会报任何错。
 *
 * @param viewportWidth  画布可视区宽度（CSS 像素，已扣除侧栏）
 * @param viewportHeight 画布可视区高度
 */
export function computeDraftNodeRect(
  viewportWidth: number,
  viewportHeight: number,
  ratio: number = EMPTY_STATE_DRAFT_NODE_RATIO
): { width: number; height: number; x: number; y: number } {
  const safeWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const safeHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;
  const side = Math.round(Math.min(safeWidth, safeHeight) * ratio);

  return {
    width: side,
    height: side,
    // 居中：左上角 = 中心 - 半边长
    x: Math.round(safeWidth / 2 - side / 2),
    y: Math.round(safeHeight / 2 - side / 2),
  };
}
