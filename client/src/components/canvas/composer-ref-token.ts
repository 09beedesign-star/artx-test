/**
 * 「引用标签」（chip）的唯一事实源。
 *
 * 【为什么要单独抽出来】
 * 这套尺寸/配色最早只长在 InfiniteCanvas.tsx 内部，服务于提示词框里的
 * image / annotation 两类引用标签。2026-09-16 智能产品图的「风格参考图」
 * 也要求「UI 交互和视觉效果与图片引用标签保持一致」——
 * 如果在 SmartCommerceProductDialog 里照着抄一份常量，就又造出了本项目
 * 踩过十一次的那个坑：同一份视觉规格有了两个出口，改一处另一处不动，
 * 而且不会报任何错，只会在某一天被用户发现「这两个标签长得不一样」。
 *
 * 所以这里是唯一定义处，InfiniteCanvas 与 SmartCommerceProductDialog
 * 都必须 import 它，禁止各自硬编码。
 */

/**
 * 引用类标签（image / annotation / 风格参考图）的统一尺寸。
 *
 * 这些值不允许挂在任何状态上（尤其是选中态）。历史上 image 标签的
 * maxWidth 在 82/62 之间、height 在 26/undefined 之间随选中态跳变，
 * annotation 又另写了一套 Tailwind 尺寸类，导致同一行里两类标签明显不一样大。
 */
export const COMPOSER_REF_TOKEN_SIZE = {
  maxWidth: 82,
  height: 26,
  gap: 6,
  padding: "4px 8px 4px 4px",
  iconSize: 18,
  labelMaxWidth: 51,
  labelFontSize: 12,
} as const;

/**
 * 引用类标签的统一配色（黑色系）。
 *
 * isSelected 指「按 Backspace 待删除」的选中态，不是画布节点的选中态——
 * 后者曾导致标签紫黑跳变，已废除。底色始终保持黑，仅用描边和外发光
 * 表达选中，既给出删除前的可见反馈，又不破坏「配色恒定」的约定。
 */
export function getComposerRefTokenColors(
  isDark: boolean,
  isDragOver: boolean,
  isSelected = false
) {
  const accent = isDragOver
    ? "rgba(42,42,45,0.55)"
    : isSelected
      ? "rgba(42,42,45,0.62)"
      : "rgba(42,42,45,0.13)";
  return {
    background: isDark ? "#121110" : "rgba(18,17,16,0.12)",
    border: `1px solid ${accent}`,
    color: isDark ? "#c7c7c7" : "rgba(28,28,40,0.72)",
    boxShadow:
      isDragOver || isSelected ? "0 0 0 2px rgba(42,42,45,0.18)" : "none",
  };
}
