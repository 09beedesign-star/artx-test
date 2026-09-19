/**
 * 「AI 处理中」遮罩（生成中 / 生成失败 / 去背景 / 擦除）的尺寸计算。
 *
 * 【为什么单独一个文件】
 * 宿主组件 InfiniteCanvas.tsx 有三万多行，任何一行断言都只能靠正则读源码，
 * 而这里要守的恰恰是**一组尺寸之间的关系**（见下面 processingTextBlockHeight
 * 的注释），靠正则守不住。抽成纯函数后可以对全部节点尺寸做不变量测试。
 *
 * 这里的每个数字都直接决定用户看到的样子，改动前先看 ai-processing-overlay.test.ts。
 */

export type AiProcessingOverlayMetrics = {
  /** 图标 + 文字的「一块」预算，取节点较小边的 20%，夹在 30–140 之间。 */
  blockSize: number;
  /** 图标（A 标记 / 转圈）的边长。 */
  iconSize: number;
  /** 文字字号。 */
  textSize: number;
  /** 行高（px 数值，便于参与计算）。 */
  lineHeightPx: number;
  /** 行高（CSS 字符串，直接给 style 用）。 */
  lineHeight: string;
  /** 两行之间的间隙。 */
  textGap: number;
  /** 文字容器的宽度。 */
  textWidth: number;
  /**
   * 两行文字真正需要的高度，用作文字容器的 maxHeight。
   *
   * ⚠️ 它必须 >= `lineHeightPx * 2 + textGap`，否则 flex 会把两个 span 各自压扁。
   *
   * 踩过的坑：maxHeight 原先取 `blockSize - iconSize`，看着像「留给文字的空间」，
   * 但字号有 6px 下限、行高有 8px 下限 —— 小节点上这两个下限不再随 blockSize 缩小，
   * 而 `blockSize - iconSize` 还在继续缩。于是 maxHeight 小于两行实际所需，
   * 文字容器（flex column）把两个 span 按比例压扁，span 上又挂着 overflow:hidden：
   * 150px 的节点行盒从 8px 被压到 5.8px，两行字贴在一起、字形紧贴裁切边，
   * 看起来就是「文字被截断」。全程零报错。
   */
  textBlockHeight: number;
};

export function computeAiProcessingOverlayMetrics(
  dispW: number,
  dispH: number,
): AiProcessingOverlayMetrics {
  const safeW = Number.isFinite(dispW) && dispW > 0 ? dispW : 0;
  const safeH = Number.isFinite(dispH) && dispH > 0 ? dispH : 0;

  const blockSize = Math.max(30, Math.min(140, Math.min(safeW, safeH) * 0.2));
  const iconSize = Math.max(16, blockSize * 0.58);
  const textSize = Math.max(6, blockSize * 0.13);
  const lineHeightPx = Math.max(8, textSize * 1.22);
  const textGap = Math.max(1, blockSize * 0.025);
  const textWidth = Math.max(44, Math.min(safeW * 0.72, blockSize * 4.8));

  return {
    blockSize,
    iconSize,
    textSize,
    lineHeightPx,
    lineHeight: `${lineHeightPx}px`,
    textGap,
    textWidth,
    textBlockHeight: lineHeightPx * 2 + textGap,
  };
}
