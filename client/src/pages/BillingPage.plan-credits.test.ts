import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
 * 加载失败并显示「0 test」—— 不是失败，是压根没跑，极易被误判成通过。
 */
import {
  BILLING_CYCLES,
  MEMBERSHIP_PLANS,
} from "../../../shared/billing-config";

const source = () =>
  readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");

/**
 * 断言必须锚在剥掉注释的源码上。
 * 本项目反复踩过：`not.toContain("8,000")` 命中的是我自己写的解释性注释，
 * 于是测试挂在一个根本不存在的问题上。
 */
const sourceWithoutComments = () =>
  source()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 取出 subscriptionPlans 数组字面量本体（已剥注释）。 */
function subscriptionPlansBlock() {
  const src = sourceWithoutComments();
  const start = src.indexOf("const subscriptionPlans = [");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("\n];", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("订阅套餐卡片的积分文案必须现算", () => {
  /**
   * 核心用例。
   *
   * 用户反馈「月度/季度/年度的积分金额和描述对不上」，根因是
   * subscriptionPlans[].features 里硬写着「每月 8,000 / 28,000 / 80,000 创作积分」，
   * 与 MEMBERSHIP_PLANS[].monthlyCredits 是两份数据：
   *   - 改配置额度 → 卡片文案不动，变成虚标；
   *   - 切换计费周期 → 文案不随周期变，年卡看起来和月卡一样。
   * 所以这里断言的是「配置数组里不许出现任何额度字面量」。
   */
  it("subscriptionPlans 里不得出现任何套餐额度数字", () => {
    const block = subscriptionPlansBlock();

    for (const plan of MEMBERSHIP_PLANS) {
      const raw = String(plan.monthlyCredits);
      const grouped = plan.monthlyCredits.toLocaleString("zh-HK");
      expect(
        block,
        `套餐额度 ${grouped} 被硬编码进 subscriptionPlans，` +
          `配置改了文案不会跟着变。额度那句请交给 buildCreditFeature() 现算。`,
      ).not.toContain(raw);
      expect(block).not.toContain(grouped);
    }
  });

  it("额度条目由 buildCreditFeature 从 quote 现算", () => {
    const src = sourceWithoutComments();
    expect(src).toContain("function buildCreditFeature(");
    expect(src).toContain("buildCreditFeature(");
    // 三个入参都必须来自同一个 quote，和上方价格区共用一份数据
    expect(src).toContain("quote.creditsPerPeriod");
    expect(src).toContain("quote.periods");
    expect(src).toContain("quote.totalCredits");
  });

  /**
   * 📌 选年卡而不是月卡来锁语义：月卡 periods = 1，
   * 「只写每月」和「每月+期数」两种实现都能过，差异被抹平；
   * 年卡把差距拉到 12 期、累计 12 倍，错误实现一定露馅。
   */
  it("多期套餐必须同时给出每月到账与总期数", () => {
    const src = sourceWithoutComments();
    expect(src).toContain("每月到账");
    expect(src).toContain("periods > 1");
    expect(src).toContain("共 ${periods} 期");
    expect(src).toContain("累计 ${totalCredits.toLocaleString(\"zh-HK\")}");
  });

  it("每个套餐都有与额度无关的 creditsNote 尾巴", () => {
    const block = subscriptionPlansBlock();
    const notes = block.match(/creditsNote:/g) ?? [];
    expect(notes.length).toBe(3);
  });
});

describe("计费周期说明必须随周期切换", () => {
  /**
   * 反向 + 正向双断言。
   * 正向：说明文案取自 BILLING_CYCLES[].creditRule。
   * 反向：任一周期的 creditRule 原文都不许被抄进页面 —— 抄了就等于写死，
   * 切到别的周期后说明还停在旧口径，正是用户说的「信息对不上」。
   */
  it("周期说明取自 activeCycleConfig.creditRule 而非静态文案", () => {
    const src = sourceWithoutComments();
    expect(src).toContain("activeCycleConfig.creditRule");

    for (const cycle of BILLING_CYCLES) {
      expect(
        src,
        `周期「${cycle.label}」的 creditRule 被抄进了页面，` +
          `切换周期后说明不会更新。请只渲染 activeCycleConfig.creditRule。`,
      ).not.toContain(cycle.creditRule);
    }
  });
});
