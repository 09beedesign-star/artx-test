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

describe("积分规则入口", () => {
  const source = () =>
    readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

  /**
   * 只剥「整行都是块注释」的形态。
   *
   * 不能用通用的 /\/\*[\s\S]*?\*\//g：源码里的正则字面量、字符串中出现的 `/*`
   * 会成为假起点，一路贪婪吞到下一个 `*​/`，把真实代码一起删掉 ——
   * 断言会在残缺源码上"通过"，是最难发现的一种假绿。
   */
  const stripComments = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
      .replace(/^\s*\/\/.*$/gm, "");

  /**
   * ⚠️ 这组用例的历史：入口最初只放在 activeTab === "recharge" 分支里，
   * 而默认标签是 subscription —— 用户进页面看不到，反馈「找不到入口」，
   * 于是加了页头常驻胶囊，并写了「页头必须有入口」「链接不得少于 2 处」两条锁。
   *
   * 2026-09-13 用户要求把**页头那个胶囊**去掉。
   * 所以那两条锁的前提已经不成立，必须一起改 —— 留着它们只会恒挂。
   *
   * 但「规则页不能变成没人找得到的孤岛」这个**真正要守的东西**没变，
   * 因此改成守新的口径：入口仍然存在，且页头不得再出现那个胶囊。
   */
  it("充值标签内保留通往规则页的入口，规则页不是孤岛", () => {
    const src = stripComments(source());
    expect(src).toContain('href="/credits-guide"');
    expect(src).toContain("查看完整积分规则");
  });

  it("页头不再有积分规则胶囊（2026-09-13 移除）", () => {
    const src = stripComments(source());
    // 页头区域 = 第一个 activeTab 条件渲染之前的部分
    const heroEnd = src.indexOf('activeTab === "subscription"');
    expect(heroEnd).toBeGreaterThan(0);

    const hero = src.slice(0, heroEnd);
    expect(hero).not.toContain('href="/credits-guide"');
    // 文案锚点单独再守一道：换个链接写法也不能把这句话摆回页头。
    expect(hero).not.toContain("积分规则说明：有效期、到账比例与消耗标准");
  });

  it("被移除的胶囊文案不得在任何地方复活", () => {
    // 反向断言必须在剥注释后的源码上做，
    // 否则会命中上面那段解释「为什么删掉」的注释，变成恒挂。
    const src = stripComments(source());
    expect(src).not.toContain("积分规则说明：有效期、到账比例与消耗标准");
  });

  it("剥注释不会误删真实代码（上面几条断言的前置保障）", () => {
    // 剥离一旦过度，上面的 not.toContain 会因为源码残缺而假通过。
    const raw = source();
    const stripped = stripComments(raw);
    const countIn = (text: string) =>
      (text.match(/href="\/credits-guide"/g) || []).length;
    expect(countIn(stripped)).toBe(countIn(raw));
    // 同时确认剥离确实生效了，否则等于没剥。
    expect(stripped.length).toBeLessThan(raw.length);
    expect(stripped).not.toContain("按要求移除页头的积分规则入口胶囊");
  });
});
