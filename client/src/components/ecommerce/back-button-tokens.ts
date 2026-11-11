/**
 * 电商画布「返回」类按钮的黑色样式事实源（2026-11-10）。
 *
 * 用户原话：把这个「← 返回工作台」改成黑色按钮样式。
 * 旧样式：透明底 + 浅灰描边 + `palette.sub` 灰字，浅色页面上几乎看不见。
 * 新样式对齐全站黑按钮（侧栏「开始创作」/ SendActionButton）：
 *   `#161616` 底 + `#ffffff` 字 + 全圆角胶囊。
 *
 * ⚠️ 这类返回按钮有 **4 个出口**，都长得一模一样：
 *   - EcommerceHistory（生成记录页，Link，backLink 可配置）
 *   - EcommerceTemplateGallery（模板库页，Link）
 *   - EcommerceTemplateDetail（模板详情，button，走浏览器后退）
 *   - EcommerceWorkspace（生成结果区，button，onClearResults）
 *   只改一个 = 用户跳到下一页又看到旧的浅灰胶囊，且零报错。
 *
 * ⚠️ 描边是给深色主题留的：黑胶囊贴在深色页面上会糊进底色，
 *    一条 12% 白边把它勾出来（与 SendActionButton 同口径）。
 *    hover 只动 opacity，不动 background —— 内联 background 优先级高于
 *    Tailwind 的 hover:bg-*，写 hover:bg-[#333333] 会静默不生效。
 */
import type { CSSProperties } from "react";

export const ECOMMERCE_BACK_BUTTON_STYLE: CSSProperties = {
  background: "#161616",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.12)",
};

/** 尺寸仍是各页面自己的 `text-[11px]` / `text-[12px]`，这里只管形状与反馈 */
export const ECOMMERCE_BACK_BUTTON_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 font-medium transition-all duration-150 hover:opacity-90 active:scale-95";
