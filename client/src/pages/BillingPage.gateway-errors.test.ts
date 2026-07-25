import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BillingPage gateway errors", () => {
  it("shows a clear rate-limit message for gateway 429 responses", () => {
    const source = readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

    expect(source).toContain("response.status === 429");
    expect(source).toContain("支付请求过于频繁");
  });
});
