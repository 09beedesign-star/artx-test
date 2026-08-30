import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("billing hero copy", () => {
  it("uses the subscription and recharge value proposition", () => {
    const source = readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

    expect(source).toContain(
      "订阅或充值，享受更多高阶模型，尊享全部的优质创作AI服务。"
    );
    expect(source).not.toContain(
      "GPT 大语言模型、Image Two 与 Nano Banana\n                  作为统一创作能力池提供服务。"
    );
  });
});
