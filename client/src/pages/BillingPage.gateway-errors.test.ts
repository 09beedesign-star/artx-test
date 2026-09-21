import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BillingPage gateway errors", () => {
  it("shows a clear rate-limit message for gateway 429 responses", () => {
    /*
      ⚠️ 2026-09-15 billingFetch() 被抽到 components/billing/billing-shared.ts
      （/billing 页面与画布充值弹窗共用同一个网络层），锚点跟着搬。
      把断言删掉或改成「只要哪个文件里有就行」都等于放弃这道锁。
    */
    const source = readFileSync(
      resolve(__dirname, "../components/billing/billing-shared.ts"),
      "utf-8",
    );

    expect(source).toContain("response.status === 429");
    expect(source).toContain("支付请求过于频繁");
  });
});
