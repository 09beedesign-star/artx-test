/**
 * 模型选择器「展开面板」的配色事实源。
 *
 * 2026-11-10：电商画布（浅色页面）里模型下拉整块是黑的，模型名也是黑的，
 * 用户看不清楚。追到 `ModelSelector` 里那次 oklch→hex 全量替换：
 * 浅色分支原本是近白的面板底色，被一起换成了 #161616，
 * 而列表行文字仍跟着触发按钮的深色文字走 → 黑底黑字，零报错。
 *
 * 【为什么抽成纯函数】
 *   ModelSelector 是首页 + 画布 + 电商画布共用的唯一实现，
 *   「下拉面板长什么样」不能由组件里四处散落的 isDark 三元临时拼。
 *   把配色收成一份可直接断言返回值的纯函数，测试才不用去扫 JSX 源码。
 *
 * ⚠️ 默认值必须是 "dark"：画布/首页的下拉在深色玻璃面板上是既定设计，
 *    组件扩展新字段默认=原行为，只有显式传 "light" 的调用点才走浅色。
 */

export type ModelPopoverTheme = "dark" | "light";

export type ModelPopoverTokens = {
  /** 面板底色 */
  background: string;
  /** 面板描边（不含 1px solid 前缀） */
  border: string;
  /** 模型名 / 描述文字 */
  text: string;
  /** 品牌图标是 CSS mask，颜色必须显式传，不能靠 currentColor */
  icon: string;
  hoverBackground: string;
  /** 当前选中行的底色；深色主题下没有选中底色 */
  selectedBackground: string;
  scrollbar: string;
  /** null = 沿用组件上的 shadow-2xl（深色口径不动） */
  shadow: string | null;
};

export function modelPopoverTokens(
  theme: ModelPopoverTheme,
  fallback: { text: string; border: string },
  isDark: boolean,
): ModelPopoverTokens {
  if (theme === "light") {
    return {
      background: "#ffffff",
      border: "rgba(20,20,36,0.11)",
      text: "rgba(20,20,36,0.88)",
      icon: "rgba(20,20,36,0.88)",
      hoverBackground: "rgba(20,20,36,0.055)",
      selectedBackground: "rgba(20,20,36,0.045)",
      scrollbar: "rgba(0,0,0,0.18)",
      shadow: "0 12px 32px rgba(20,20,36,0.14)",
    };
  }
  return {
    background: "#161616",
    border: fallback.border,
    text: fallback.text,
    icon: "#FFFFFF",
    hoverBackground: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    selectedBackground: "transparent",
    scrollbar: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)",
    shadow: null,
  };
}
