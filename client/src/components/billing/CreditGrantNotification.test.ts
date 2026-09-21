import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CreditGrantNotification", () => {
  it("polls manual credit gift notifications, acknowledges them, and broadcasts credit updates", () => {
    const source = readFileSync(resolve(__dirname, "CreditGrantNotification.tsx"), "utf-8");

    expect(source).toContain("/api/billing/credit-notifications");
    expect(source).toContain("/ack");
    expect(source).toContain("系统积分赠送");
    expect(source).toContain("artx:credits-updated");
    expect(source).toContain("当前积分余额");
  });
});
