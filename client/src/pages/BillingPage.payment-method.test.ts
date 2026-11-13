import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../shared/strip-source-comments";

describe("BillingPage payment method selection", () => {
  /*
    ⚠️ 2026-09-15 支付方式相关代码被拆到 components/billing/ 下三个文件
    （/billing 页面与画布充值弹窗共用）：
      - PaymentMethodLogo.tsx   —— 两个品牌图标的内联 SVG
      - PaymentMethodPicker.tsx —— 选择区
      - use-billing-center.ts   —— 下单时带上 selectedPaymentMethod
    锚点跟着搬，并按语义分到对应文件上，别用一个大字符串通吃。
  */
  /**
   * ⚠️ 必须剥注释再断言色值：源码注释里会写明"原来的品牌绿是什么"，
   * 不剥的话 `not.toContain("#07C160")` 会被注释命中而恒红 ——
   * 恒红和恒绿一样，都是坏检测器。
   */
  const read = (file: string) =>
    stripSourceComments(
      readFileSync(resolve(__dirname, "../components/billing", file), "utf-8"),
    );

  it("下单永远带上用户选的支付方式，不写死微信", () => {
    const controller = read("use-billing-center.ts");
    // 写死 'wechat' 会让支付宝按钮变成摆设（点了还是出微信码）。
    expect(controller).not.toContain('paymentMethod: "wechat"');
    expect(controller).toContain("paymentMethod: selectedPaymentMethod");
  });

  it("两种支付方式都可选，且各自有品牌标识", () => {
    const picker = read("PaymentMethodPicker.tsx");
    const shared = read("billing-shared.ts");
    expect(picker).toContain("selectedPaymentMethod");
    expect(picker).toContain("PaymentMethodLogo");
    expect(shared).toContain("微信支付");
    expect(shared).toContain("支付宝");
  });

  it("品牌图标是内联 SVG，不依赖外链或图片代理", () => {
    const logo = read("PaymentMethodLogo.tsx");
    expect(logo).toContain('aria-label="支付宝 logo"');
    expect(logo).toContain('aria-label="微信支付 logo"');
    expect(logo).toContain('data-payment-brand-icon="alipay"');
    expect(logo).toContain('data-payment-brand-icon="wechat-pay"');
    // 外链图标曾经挂过（图床 403 + 代理超时），现在必须是内联路径数据。
    expect(logo).not.toContain("huaban.com/pins");
    expect(logo).not.toContain("/api/images/proxy?url=");
    expect(logo).not.toContain('circle cx="11.4"');
    expect(logo).not.toContain('rect width="64" height="64"');
    expect(logo).toContain("M12 2c3.713 0 6.993 1.534");
    expect(logo).toContain("M10.5 2h2v2.788h7.002");
    /**
     * 【2026-11-12 用户反转】支付方式 logo 必须保持彩色：
     * 上一轮把 fill 改成 currentColor，logo 在黑底白字按钮上被洗成白色，
     * compact 两处（套餐卡 / 充值按钮）连支付宝蓝也一起没了。
     * fill 仍必须走同一个变量（四个出口共用），两支色值都恢复品牌色。
     */
    expect(logo).toContain('"#07C160"');
    expect(logo).toContain('"#1677FF"');
    expect(logo).toContain("fill={fill}");
    expect(logo).not.toContain("currentColor");
  });

  it("未选中是白底灰线框，选中是黑底白字，不用透明度区分", () => {
    /**
     * 【2026-11-12】未选中原本是「黑底 + opacity 0.72」洗出来的深灰，
     * 区分度差，且 opacity 作用于整棵子树会把品牌彩色 logo 一起洗淡。
     * 现在两态各自独立配色，文字色也必须跟着 active 翻 —— 否则白底白字。
     */
    const picker = read("PaymentMethodPicker.tsx");
    expect(picker).toContain('const surfaceIdle = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF"');
    expect(picker).toContain('const borderIdle = isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.18)"');
    expect(picker).toContain("active ? surfaceActive : surfaceIdle");
    expect(picker).toContain("active ? titleActive : titleIdle");
    expect(picker).toContain("active ? hintActive : hintIdle");
    expect(picker).not.toContain("opacity: active");
  });
});

describe("左侧 tab 与支付方式选择按钮同款两态", () => {
  /**
   * 【2026-11-13】用户要的是「跟支付方式选择那种一样的样式」——
   * 选中实心黑底白字、未选中白底灰线框黑字，不是「把选中态文字改黑」。
   * 这组 tab 有两个出口（页面侧栏 + 画布弹窗），只改一个等于没改。
   *
   * 锁法：三处必须逐项使用同一组两态 token；任何一处退回灰底/透明底，
   * 或某个出口漏改，下面的断言都会红。
   */
  const TOKENS = [
    'const surfaceActive = isDark ? "#F2F2F2" : "#161616"',
    'const surfaceIdle = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF"',
    'const borderActive = isDark ? "rgba(255,255,255,0.30)" : "#161616"',
    'const borderIdle = isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.18)"',
    'const titleActive = isDark ? "#161616" : "#FFFFFF"',
    'const titleIdle = isDark ? "#F2F2F2" : "#161616"',
  ];
  const strip = (p: string) =>
    stripSourceComments(readFileSync(p, "utf-8"));
  const page = () => strip(resolve(__dirname, "BillingPage.tsx"));
  const dialog = () =>
    strip(resolve(__dirname, "../components/billing/BillingDialog.tsx"));
  const picker = () =>
    strip(resolve(__dirname, "../components/billing/PaymentMethodPicker.tsx"));

  it("支付方式选择器仍是这套色值的事实源", () => {
    for (const token of TOKENS) expect(picker(), token).toContain(token);
  });

  it("页面侧栏 tab 逐项同色，且两态都作用在按钮上", () => {
    const src = page();
    for (const token of TOKENS) expect(src, token).toContain(token);
    expect(src).toContain("active ? surfaceActive : surfaceIdle");
    expect(src).toContain("active ? borderActive : borderIdle");
    expect(src).toContain("active ? titleActive : titleIdle");
    expect(src).toContain("active ? hintActive : hintIdle");
  });

  it("画布弹窗 tab 逐项同色，且两态都作用在按钮上", () => {
    const src = dialog();
    for (const token of TOKENS) expect(src, token).toContain(token);
    expect(src).toContain("active ? surfaceActive : surfaceIdle");
    expect(src).toContain("active ? borderActive : borderIdle");
    expect(src).toContain("active ? titleActive : titleIdle");
  });
});
