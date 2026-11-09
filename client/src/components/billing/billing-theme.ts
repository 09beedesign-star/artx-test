import type { PaymentMethod } from "./billing-shared";

/**
 * 计费面板的配色。
 *
 * ⚠️ 页面和弹窗必须长得一样，所以这组色值也只能有一份。
 * 原先这十来行是写在 BillingPage 组件体里的，抽成函数后
 * BillingDialog 直接调同一个函数，不会出现「弹窗里的灰比页面浅一点」。
 */
export function getBillingTheme(isDark: boolean) {
  return {
    isDark,
    bg: isDark ? "#222222" : "var(--design-surface-soft)",
    panel: isDark ? "#222222" : "rgba(255,255,255,0.82)",
    panelStrong: isDark ? "#222222" : "rgba(255,255,255,0.94)",
    border: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)",
    text: isDark ? "#e6e3df" : "#262627",
    sub: isDark ? "#99999e" : "#888888",
    faint: isDark ? "#161616" : "#aaaaaa",
    wechatGreen: "#C5ED47",  // 微信支付绿色（背景、按钮）
    wechatGreenText: isDark ? "#C5ED47" : "#5C7A1A",  // 绿色文字（白天模式加深）
    alipayBlue: "#1677FF",   // 支付宝蓝色
    purple: "#161616",
  };
}

export type BillingTheme = ReturnType<typeof getBillingTheme>;

/**
 * 根据支付方式获取对应的品牌色
 */
export function getPaymentColor(method: PaymentMethod, theme: BillingTheme): string {
  return method === "wechat" ? theme.wechatGreen : theme.alipayBlue;
}
