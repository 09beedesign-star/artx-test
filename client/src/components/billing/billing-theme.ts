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
    bg: isDark ? "#171717" : "var(--design-surface-soft)",
    panel: isDark ? "#222222" : "oklch(1 0 0 / 0.82)",
    panelStrong: isDark ? "#222222" : "oklch(1 0 0 / 0.94)",
    border: isDark ? "oklch(1 0 0 / 9%)" : "oklch(0 0 0 / 10%)",
    text: isDark ? "oklch(0.88 0.01 270)" : "oklch(0.22 0.018 255)",
    sub: isDark ? "oklch(0.71 0.010 270)" : "oklch(0.64 0.010 255)",
    faint: isDark ? "oklch(0.61 0.010 270)" : "oklch(0.71 0.010 255)",
    green: "#C5ED47",
    purple: "oklch(0.68 0.20 292)",
  };
}

export type BillingTheme = ReturnType<typeof getBillingTheme>;
