import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BillingPage payment method selection", () => {
  it("lets users choose WeChat Pay or Alipay instead of always creating WeChat QR codes", () => {
    const source = readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

    expect(source).not.toContain('paymentMethod: "wechat"');
    expect(source).toContain("selectedPaymentMethod");
    expect(source).toContain("PaymentMethodLogo");
    expect(source).toContain("微信支付");
    expect(source).toContain("支付宝");
    expect(source).toContain('aria-label="支付宝 logo"');
    expect(source).toContain('aria-label="微信支付 logo"');
    expect(source).toContain('data-payment-brand-icon="alipay"');
    expect(source).toContain('data-payment-brand-icon="wechat-pay"');
    expect(source).not.toContain("huaban.com/pins");
    expect(source).not.toContain("/api/images/proxy?url=");
    expect(source).not.toContain('circle cx="11.4"');
    expect(source).not.toContain('rect width="64" height="64"');
    expect(source).toContain("M12 2c3.713 0 6.993 1.534");
    expect(source).toContain("M10.5 2h2v2.788h7.002");
    expect(source).toContain('fill="#07C160"');
    expect(source).toContain('fill="#1677FF"');
  });
});
