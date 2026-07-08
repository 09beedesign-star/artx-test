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
    expect(source).toContain("ALIPAY_LOGO_SOURCE_URL");
    expect(source).toContain("WECHAT_PAY_LOGO_SOURCE_URL");
    expect(source).toContain("https://huaban.com/pins/5786389200");
    expect(source).toContain("https://huaban.com/pins/3526742319");
    expect(source).toContain("/api/images/proxy?url=");
    expect(source).toContain('background: "#FFFFFF"');
  });
});
