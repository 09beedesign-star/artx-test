import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BillingPage payment method selection", () => {
  /*
    ⚠️ 2026-09-15 支付方式相关代码被拆到 components/billing/ 下三个文件
    （/billing 页面与画布充值弹窗共用）：
      - PaymentMethodLogo.tsx   —— 两个品牌图标的内联 SVG
      - PaymentMethodPicker.tsx —— 选择区
      - use-billing-center.ts   —— 下单时带上 selectedPaymentMethod
    锚点跟着搬，并按语义分到对应文件上，别用一个大字符串通吃。
  */
  const read = (file: string) =>
    readFileSync(resolve(__dirname, "../components/billing", file), "utf-8");

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
    expect(logo).toContain('fill="#07C160"');
    expect(logo).toContain('fill="#1677FF"');
  });
});
