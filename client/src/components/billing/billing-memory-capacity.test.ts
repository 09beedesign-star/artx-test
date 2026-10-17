import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(__dirname + "/../../" + p, "utf8");

describe("套餐福利：长期记忆容量（2026-10-18）", () => {
  it("套餐卡片需从 memoryLimits 现算，不能写死数字", () => {
    const shared = read("components/billing/billing-shared.ts");
    const panel = read("components/billing/SubscriptionPanel.tsx");
    // 老规则：有测试 BillingPage.plan-credits.test.ts 锁「任何 feature label 不准出现积分数字」。
    // 新规则：套餐福利里「容量」数字也必须从 MEMBERSHIP_PLANS 现算，不能写死。
    expect(shared).toContain("memoryLimits");
    expect(panel).toContain("memoryLimits");
    // 写死数字（如 1000、5000、10000）的痕迹不能在套餐福利相关代码出现。
    const allCode = shared + panel;
    const suspiciousCap = allCode.match(/memoryLimits[^\n]*[:\s](1000|5000|10000)[^\d]/);
    expect(suspiciousCap).toBe(null);
  });

  it("长期记忆页容量提示条与升级入口都存在且不写死档位数字", () => {
    const page = read("pages/LongTermMemoryPage.tsx");
    expect(page).toContain("当前套餐");
    expect(page).toContain("data-testid=\"memory-plan-capacity\"");
    expect(page).toContain("currentLimits.perDimension");
    expect(page).toContain("currentLimits.total");
    // 升级入口需从货架现算下一档：nextPlan，不能写死「升级 Pro」「升级 Studio」。
    expect(page).toContain("nextPlan");
    expect(page).toContain("data-testid=\"memory-upgrade-link\"");
  });
});
