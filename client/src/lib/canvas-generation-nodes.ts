/**
 * 画布「生成中占位框」的判定与回收。
 *
 * 【为什么单独成文件】
 * 判定条件直接决定「会不会把用户已有的图删掉」，而宿主组件
 * InfiniteCanvas.tsx 有三万六千行、无法单测。把这段纯逻辑切出来，
 * 边界（批量 4 张 / 有图节点 / 别的 generationId / 原地复活的节点）
 * 才能用行为测试守住。
 */

export type CanvasGenerationNodeLike = {
  id: string;
  data?: unknown;
};

/**
 * 是否是**本次生成**插进画布、且**至今没有任何图**的空占位框。
 *
 * 四个条件缺一不可：
 * - generationId 相同：否则会误伤同画布上其它生成任务；
 * - placeholderForGeneration === true：**不能靠节点 id 的 `generated-` 前缀认**，
 *   出图成功后补建的真实图节点用的是同一个 id 规则，靠 id 认会连有图的节点一起删；
 * - isGeneratingImage === true 且没有 localSrc：已经出图的节点必须留下 ——
 *   即便它带着占位标记，也只是说明它曾是占位框。
 */
export function isGenerationPlaceholder(
  node: CanvasGenerationNodeLike,
  generationId: string
): boolean {
  const data = (node.data || {}) as Record<string, unknown>;
  return (
    data.generationId === generationId &&
    data.placeholderForGeneration === true &&
    data.isGeneratingImage === true &&
    typeof data.localSrc !== "string"
  );
}

/**
 * 撤掉本次生成留下的空占位框（计费拦截时用）。
 *
 * 返回 `null` 而不是原数组，是为了让调用方能区分**两种完全不同的结局**：
 * - 返回数组：确实有占位框被撤掉了，画布不该再出现任何失败节点；
 * - 返回 null：一个占位框都没有。此时失败的是「原地复活」链路
 *   （「再次生成」把用户已有的节点直接改造成了生成中，不新建节点），
 *   撤节点等于把用户的图弄丢 —— 调用方必须退回原来的失败态标记。
 *
 * ⚠️ 两种情况下都不能把返回的数组当成「结果一定变过」：
 * React 的 setNodes updater 会被调用两次，这里必须保持纯函数语义。
 */
export function removeGenerationPlaceholders<T extends CanvasGenerationNodeLike>(
  nodes: T[],
  generationId: string
): T[] | null {
  const placeholderIds = new Set(
    nodes
      .filter((node) => isGenerationPlaceholder(node, generationId))
      .map((node) => node.id)
  );
  if (placeholderIds.size === 0) return null;
  return nodes.filter((node) => !placeholderIds.has(node.id));
}
