/**
 * 电商画布 · 长期记忆提示条与 Tooltip
 *
 * 用户 2026-10-17 要求：
 * - 板块内明确告知用户"您已开启长期记忆"
 * - hover 大脑图标出 tooltip：开启记忆可以了解您的出图习惯，如需编辑长期记忆，
 *   请在左侧边栏的长期记忆中编辑。
 *   （2026-10-17 二次调整：个人中心的长期记忆卡片已移除，唯一入口是侧栏 /memory）
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
    // ⚠️ 提示条必须始终渲染（内含电商画布记忆开关）：若跟着 memoryActive 隐藏，
    //    没写长期记忆的用户永远看不到开关 ——「开」在 A「关」在 B 必卡死。
    expect(source).not.toMatch(/\{memoryActive\s+&&\s*\(\s*<div\s+data-testid="ecommerce-memory-notice"/);
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
      /<TooltipTrigger[^>]*>[\s\S]*?<button[\s\S]*?aria-label="电商画布记忆说明"[\s\S]*?<Brain/,
    );
    // 延迟 0（即开即出）
    expect(source).toMatch(/<Tooltip\s+[^>]*delayDuration=\{0\}/);
  });

  it('Tooltip 指向左侧边栏「长期记忆」（/memory），不再指向个人中心', () => {
    expect(source).toContain("开启记忆可以了解您的出图习惯");
    expect(source).toContain("如需编辑长期记忆，请在左侧边栏的");
    expect(source).toMatch(/<Link\s+href="\/memory"/);
    // 个人中心已无长期记忆卡片，链过去 = 死路
    expect(source).not.toMatch(/<Link\s+href="\/profile"/);
  });

  it("带货图文不向用户展示积分（用户 2026-10-18 指定隐藏）", () => {
    // 模型标题旁、报价行、张数说明三处都不得再出现积分数字
    expect(source).not.toMatch(/\$\{unitCredits\}\s*积分/);
    expect(source).not.toMatch(/\{unitCredits\}\s*积分/);
    expect(source).not.toContain("= {quoteCredits} 积分");
    expect(source).toContain('aside={mode === "product" ? "多张同价" : undefined}');
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
