import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage capability margin filters", () => {
  it("renders server-backed margin search controls and filtered analysis", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    for (const label of ["最近一天", "近3天", "近7天", "近半个月", "近一个月", "近三个月", "近半年"]) {
      expect(page).toContain(label);
    }

    expect(page).toContain('aria-label="毛利区间"');
    expect(page).toContain('aria-label="最低毛利"');
    expect(page).toContain('aria-label="最高毛利"');
    expect(page).toContain('aria-label="模型"');
    expect(page).toContain('aria-label="搜索账号"');
    expect(page).toContain('aria-label="最低积分"');
    expect(page).toContain('aria-label="最高积分"');
    expect(page).toContain('"/api/admin/capability-margin"');
    expect(page).toContain('activeSection !== "integrations"');
    expect(page).toContain("if (!token) {\n      setCapabilityMarginLoading(false);");
    expect(page).toContain("预估成本");
    expect(page).not.toContain("· 成本 ${formatCurrency(item.estimatedCost)}");
    expect(page).toContain("能力汇总");
    expect(page).toContain("模型汇总");
    expect(page).toContain("筛选后的任务明细");
    expect(page).toContain("任务 ID：{task.id}");
    expect(page).toContain('formatExactOrderTime(task.createdAt, "未提供精确时间")');
  });
});
