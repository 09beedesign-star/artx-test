import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BILLING_CYCLES,
  MEMBERSHIP_PLANS,
  SUBSCRIPTION_PLAN_IDS,
  getPlanQuote,
} from "../shared/billing-config";

/**
 * 后台「套餐/金额配置」必须与 shared/billing-config.ts 实时同源。
 *
 * 历史事故：plans 被当成可持久化字段存进数据库，而 buildPricingPlans()
 * 从未被调用（死代码）。后台长期显示一份被冻结的旧快照 ——
 * Lite 月付 HKD 19 / 247 积分（实际 39 / 8,000）、Pro 月付 HKD 89 / 1,157
 * （实际 129 / 28,000），还列着前端早已下架的 Creator 与 Business。
 *
 * 这组测试锁三件事：
 *   1. 现算而非读库（normalizeDataAsync 里不得出现 value.plans）
 *   2. 只展示在售档位（跟货架走，不跟定价表走）
 *   3. 展示每期额度而非周期累计（避免运营误判用户余额）
 */

const source = readFileSync(resolve(__dirname, "admin-store.ts"), "utf-8");

/** 剥掉整行注释，防止断言命中我们自己写的解释性文字。 */
function stripComments(text: string): string {
  return text
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "")
    .replace(/^[ \t]*\*.*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const code = stripComments(source);

describe("后台套餐配置与 billing-config 同源", () => {
  it("剥注释后仍含实质代码（防断言空转）", () => {
    expect(code).toContain("function buildPricingPlans()");
    expect(code).toContain("normalizeDataAsync");
    expect(code.length).toBeGreaterThan(50000);
  });

  it("buildPricingPlans 不再是死代码，seed 与 normalize 都调用它", () => {
    // 定义 1 次 + seedAdminData 1 次 + normalizeDataAsync 1 次
    const callCount = (code.match(/buildPricingPlans\(\)/g) || []).length;
    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(code).toContain("plans: buildPricingPlans(),");
  });

  it("⭐ normalizeDataAsync 必须无条件重算，绝不沿用库里的 value.plans", () => {
    const normalizeBlock = code.match(
      /async function normalizeDataAsync[\s\S]*?\n\}/
    )?.[0];
    expect(normalizeBlock).toBeTruthy();
    expect(normalizeBlock).toContain("plans: buildPricingPlans(),");
    // 反向断言：一旦有人改回「库里有就用库里的」，这条立刻失败
    expect(normalizeBlock).not.toContain("value.plans");
    expect(normalizeBlock).not.toContain("seed.plans");
  });

  it("只展示在售档位，不得直接遍历 MEMBERSHIP_PLANS", () => {
    const block = code.match(
      /function buildPricingPlans\(\): PricingPlan\[\] \{[\s\S]*?\n\}/
    )?.[0];
    expect(block).toBeTruthy();
    expect(block).toContain("SUBSCRIPTION_PLAN_IDS");
    // 下架档位不应出现在后台
    expect(SUBSCRIPTION_PLAN_IDS).not.toContain("creator");
    expect(SUBSCRIPTION_PLAN_IDS).not.toContain("business");
    expect(SUBSCRIPTION_PLAN_IDS).not.toContain("free");
  });

  it("展示每期额度而非周期累计（避免运营误判余额）", () => {
    const block = code.match(
      /function buildPricingPlans\(\): PricingPlan\[\] \{[\s\S]*?\n\}/
    )?.[0];
    expect(block).toContain("credits: quote.creditsPerPeriod");
    // 反向断言：直接摆 totalCredits 会让人以为付款后立刻到账 336,000
    expect(block).not.toContain("credits: quote.totalCredits");
  });

  it("覆盖全部三个计费周期，不只是月付与全年", () => {
    const block = code.match(
      /function buildPricingPlans\(\): PricingPlan\[\] \{[\s\S]*?\n\}/
    )?.[0];
    // 历史版本写死了 filter 只留 monthly/annual，季度卡在后台根本看不到
    expect(block).not.toMatch(/cycle\.id === "monthly" \|\| cycle\.id === "annual"/);
    expect(BILLING_CYCLES.map((c) => c.id)).toEqual([
      "monthly",
      "quarterly",
      "annual",
    ]);
  });
});

describe("套餐数值与订阅页完全一致", () => {
  const sellable = MEMBERSHIP_PLANS.filter((plan) =>
    SUBSCRIPTION_PLAN_IDS.includes(plan.id)
  );

  it("在售档位恰好是 Lite / Pro / Studio 三档", () => {
    expect(sellable.map((p) => p.id)).toEqual(["lite", "pro", "studio"]);
  });

  it("应产出 3 档 × 3 周期 = 9 条配置", () => {
    expect(sellable.length * BILLING_CYCLES.length).toBe(9);
  });

  it("价格取自 billing-config，与旧快照的错误数值不同", () => {
    const lite = sellable.find((p) => p.id === "lite")!;
    const pro = sellable.find((p) => p.id === "pro")!;
    const monthly = BILLING_CYCLES.find((c) => c.id === "monthly")!;

    const liteQuote = getPlanQuote(lite, monthly);
    const proQuote = getPlanQuote(pro, monthly);

    // 旧快照里的错误值：Lite 19 / 247，Pro 89 / 1157
    expect(liteQuote.price).not.toBe(19);
    expect(liteQuote.creditsPerPeriod).not.toBe(247);
    expect(proQuote.price).not.toBe(89);
    expect(proQuote.creditsPerPeriod).not.toBe(1157);

    // 正向：必须等于当前定价
    expect(liteQuote.price).toBe(lite.monthlyPrice);
    expect(liteQuote.creditsPerPeriod).toBe(lite.monthlyCredits);
    expect(proQuote.price).toBe(pro.monthlyPrice);
    expect(proQuote.creditsPerPeriod).toBe(pro.monthlyCredits);
  });

  it("每期额度恒等于 monthlyCredits，与周期无关", () => {
    for (const plan of sellable) {
      for (const cycle of BILLING_CYCLES) {
        const quote = getPlanQuote(plan, cycle);
        expect(quote.creditsPerPeriod).toBe(plan.monthlyCredits);
        expect(quote.totalCredits).toBe(plan.monthlyCredits * cycle.months);
      }
    }
  });
});
