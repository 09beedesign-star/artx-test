/**
 * 全站「可点击强调元素」的唯一样式事实源。
 *
 * 【2026-11-12 用户点名】「站点当中所有这种浅绿色的高亮文字和标签全部看不清楚，
 * 把站点当中所有的可点击的绿色标签或者文字，全部改成黑色线体的按钮，只更换可点击的样式。」
 * 用户已确认：样式 = 黑框黑字线框按钮；范围 = 所有可点击绿色（含原实心绿底主按钮）。
 *
 * ⚠️ 色值本体只在 client/src/index.css 的 --artx-action-* 变量里定义一份。
 *    本文件只持有「引用」，不写死任何颜色 —— 深浅主题由 html.dark 自动切换，
 *    调用方不需要（也不应该）自己传 isDark 再算一遍颜色。
 *
 * ⚠️ 「只更换可点击的样式」是硬边界：图标、状态文字、徽章、focus 描边、
 *    滑块 accent、滚动条、动画装饰、纯展示绿字一律不动。
 *
 * 📌 选中态不能也用线框：否则 chip / tab 选中与未选中长得一样，等于把选中反馈删了。
 *    所以选中态走反相实心（黑底白字），这在黑白色系里仍然可读、可辨。
 */
import type { CSSProperties } from "react";

/** 常态 / 未选中：黑框 + 黑字 + 透明底（深色主题自动转白框白字）。 */
export const ACTION_OUTLINE_STYLE: CSSProperties = {
  background: "var(--artx-action-bg)",
  color: "var(--artx-action-fg)",
  border: "1px solid var(--artx-action-border)",
};

/** 选中态：反相实心，保证比例/分类/模型这类 tab 仍能看出选中了哪一个。 */
export const ACTION_ACTIVE_STYLE: CSSProperties = {
  background: "var(--artx-action-active-bg)",
  color: "var(--artx-action-active-fg)",
  border: "1px solid var(--artx-action-active-border)",
};

/**
 * 深色面板专用（浅色主题里的黑底弹窗，例如模型下拉）：
 * 这些容器不跟着 html.dark 走，用主题变量会变成黑字压黑底。
 */
export const ACTION_OUTLINE_ON_DARK_STYLE: CSSProperties = {
  background: "transparent",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.55)",
};

export const ACTION_ACTIVE_ON_DARK_STYLE: CSSProperties = {
  background: "#ffffff",
  color: "#161616",
  border: "1px solid #ffffff",
};

/**
 * 纯文字链接升级成「按钮」时补的形态。
 * 边框颜色由 ACTION_OUTLINE_STYLE 的 inline style 提供，这里只管形状与过渡。
 * ⚠️ 已有自己圆角/内边距的按钮不要加这个类，只换 style，避免动到布局。
 */
export const ACTION_OUTLINE_CLASS =
  "inline-flex items-center justify-center rounded-full transition-colors";

/** 供测试与浏览器探针断言用的色值口径（不参与渲染，只做契约锚点）。 */
export const ACTION_SURFACE_CONTRACT = {
  lightFg: "#161616",
  lightBorder: "rgba(22,22,22,0.55)",
  lightActiveBg: "#161616",
  lightActiveFg: "#ffffff",
  darkFg: "#ffffff",
  darkBorder: "rgba(255,255,255,0.55)",
  darkActiveBg: "#ffffff",
  darkActiveFg: "#161616",
  outlineBg: "transparent",
} as const;
