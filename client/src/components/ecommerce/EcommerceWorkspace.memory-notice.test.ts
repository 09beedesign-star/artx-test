/**
 * 电商画布 · 长期记忆提示条与 Tooltip
 *
 * 用户 2026-10-17 要求：
 * - 板块内明确告知用户"您已开启长期记忆"
 * - hover 大脑图标出 tooltip：开启记忆可以了解您的出图习惯，如需编辑长期记忆，
 *   请在个人中心下编辑你的长期记忆。
 * - memoryActive = contextEnabled 或 longTerm 非空
 * - 报价加上记忆附加费（本页面锁结构，EcommerceCanvasPage 负责计费逻辑）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync(
  "client/src/components/ecommerce/EcommerceWorkspace.tsx",
  "utf8",
);

describe("电商画布长期记忆提示条结构", () => {
  it("Props 必须包含记忆状态与附加费", () => {
    expect(source).toContain("memoryActive: boolean");
    expect(source).toContain("memorySurcharge: number");
  });

  it("提示条结构：Brain 图标 + 文字 + testid", () => {
    // 只在 memoryActive 时渲染
    expect(source).toMatch(/\{memoryActive\s+&&\s*\(/);
    // 包含 testid
    expect(source).toContain('data-testid="ecommerce-memory-notice"');
    // Brain 图标
    expect(source).toMatch(/<Brain\s+size=/);
    // 文字
    expect(source).toContain("您已开启长期记忆");
  });

  it("hover 大脑图标出 Radix Tooltip（用户要的是 hover 即出现，不是 title 那种延迟）", () => {
    // Tooltip / TooltipTrigger / TooltipContent 必须都用
    expect(source).toMatch(/import\s+\{[^}]*\bTooltip\b[^}]*\}\s+from/);
    expect(source).toContain("TooltipTrigger");
    expect(source).toContain("TooltipContent");
    // Brain 包在 TooltipTrigger 里
    expect(source).toMatch(
      /<TooltipTrigger[^>]*>[\s\S]*?<button[\s\S]*?aria-label="长期记忆说明"[\s\S]*?<Brain/,
    );
    // 延迟 0（即开即出）
    expect(source).toMatch(/<Tooltip\s+[^>]*delayDuration=\{0\}/);
  });

  it('Tooltip 内容与用户 2026-10-17 指定的文案一致，并带"个人中心"链接', () => {
    // 文案原样锁住，user-facing 不能自己改。
    expect(source).toContain("开启记忆可以了解您的出图习惯");
    expect(source).toContain("如需编辑长期记忆，请在");
    expect(source).toContain("下编辑你的长期记忆");
    // Link to /profile
    expect(source).toMatch(/<Link\s+href="\/profile"/);
    expect(source).toContain(">个人中心</Link>");
  });

  it("报价行：模型单价 × 张数 + 记忆附加费 = 总价", () => {
    // {modelLabel} {unitCredits} 积分/张 × {count} 张
    expect(source).toMatch(/\{modelLabel\}\s+\{unitCredits\}\s+积分\/张\s+×\s+\{count\}\s+张/);
    // + 记忆（只在有附加费时出现）
    expect(source).toMatch(/\{memorySurcharge\s+>\s+0\s+\?[^}]+记忆/);
    // = {quoteCredits}
    expect(source).toContain("= {quoteCredits} 积分");
  });
});

describe("提示条样式约束（防止与其他板块风格不一致）", () => {
  it("背景与边框：lime 半透明（与平台其他记忆 UI 同色系）", () => {
    const match = source.match(
      /background:\s*"rgba\(197,237,71,[\d.]+\)"/,
    );
    expect(match).toBeTruthy();
    expect(source).toMatch(
      /border:\s*"1px solid rgba\(197,237,71,[\d.]+\)"/,
    );
  });

  it("文字颜色 = LIME（定义在 shared.ts，电商画布统一用）", () => {
    expect(source).toMatch(/color:\s*LIME/);
  });
});
