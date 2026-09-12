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

describe("积分规则入口可发现性", () => {
  const source = () =>
    readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

  /**
   * ⚠️ 这条用例存在的原因：入口最初只放在 activeTab === "recharge" 的分支里，
   * 而默认标签是 subscription —— 用户进页面根本看不到，反馈「找不到入口」。
   * 所以断言的不是「有没有链接」，而是「链接在不在标签条件分支之外」。
   */
  it("页头有常驻入口，不依赖用户先切到充值标签", () => {
    const src = source();
    const heroEnd = src.indexOf('activeTab === "subscription"');
    expect(heroEnd).toBeGreaterThan(0);

    // 页头区域 = 第一个 activeTab 条件渲染之前的部分
    const hero = src.slice(0, heroEnd);
    expect(hero).toContain('href="/credits-guide"');
  });

  it("入口文案要说明页面内容，不能只写「积分规则」四个字", () => {
    expect(source()).toContain("积分规则说明：有效期、到账比例与消耗标准");
  });

  /**
   * 反向断言：防止后人把页头入口删掉、退回成只在充值标签里挂一个链接。
   * 正向断言只能保证「现在有」，守不住「将来被挪走」。
   */
  it("credits-guide 链接不得只出现一次（页头 + 充值标签各一处）", () => {
    const matches = source().match(/href="\/credits-guide"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
