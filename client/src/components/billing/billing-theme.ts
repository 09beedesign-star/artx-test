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
    /**
     * 强调色：图标 / 价格数字 / 勾选 / 选中态描边。
     *
     * 【2026-11-10 用户点名】「订阅、充值与升级页面，所有的绿色系全部改为黑白色系，
     * 按钮变成黑色白字按钮」。原来是品牌荧光绿 #C5ED47。
     *
     * ⚠️⚠️ 字段名从 `wechatGreen` 改成 `accent`：一个叫 green 的字段装着黑色，
     * 下一个读代码的人只会认为这是写错了，然后「顺手修回去」。
     * 色值和名字必须一起改，否则改动本身会留下一个反向诱导。
     */
    accent: isDark ? "#F2F2F2" : "#161616",
    /** 实心按钮底：浅色黑底，深色反相为白底（黑底在 #222 面板上等于隐形）。 */
    solid: isDark ? "#F2F2F2" : "#161616",
    /** 实心按钮上的文字 / 图标。 */
    solidText: isDark ? "#161616" : "#FFFFFF",
    alipayBlue: "#1677FF",   // 支付宝蓝色（品牌色，未在本次黑白化范围内）
    purple: "#161616",
  };
}

export type BillingTheme = ReturnType<typeof getBillingTheme>;

/**
 * 根据支付方式获取对应的品牌色
 */
export function getPaymentColor(method: PaymentMethod, theme: BillingTheme): string {
  return method === "wechat" ? theme.accent : theme.alipayBlue;
}
