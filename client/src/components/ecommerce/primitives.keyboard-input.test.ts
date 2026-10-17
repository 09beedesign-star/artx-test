/**
 * 电商画布 Stepper 键盘输入测试
 * 2026-10-17 用户需求：生成数量支持键盘直接输入 1-9 张
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync(
  "client/src/components/ecommerce/primitives.tsx",
  "utf8",
);

describe("Stepper 键盘输入功能", () => {
  it("应该将中间的数字显示改为 input 元素", () => {
    // 旧版本是 <span>，新版本应该是 <input>
    expect(source).toContain("<input");
    expect(source).toContain('type="text"');
    expect(source).toContain('data-testid="ecommerce-count-input"');
  });

  it("input 应该支持 numeric 输入模式", () => {
    // 移动端优化：弹出数字键盘
    expect(source).toContain('inputMode="numeric"');
  });

  it("应该有 onChange 处理函数处理输入", () => {
    // 检查是否有 handleInputChange 函数
    expect(source).toMatch(/const\s+handleInputChange\s*=/);
    expect(source).toMatch(/onChange=\{handleInputChange\}/);
  });

  it("应该有 onBlur 处理函数防止空值", () => {
    // 失焦时恢复当前值
    expect(source).toMatch(/const\s+handleInputBlur\s*=/);
    expect(source).toMatch(/onBlur=\{handleInputBlur\}/);
  });

  it("应该有 onKeyDown 支持方向键", () => {
    // 方向键上下调整数量
    expect(source).toMatch(/const\s+handleKeyDown\s*=/);
    expect(source).toMatch(/onKeyDown=\{handleKeyDown\}/);
    expect(source).toContain("ArrowUp");
    expect(source).toContain("ArrowDown");
  });

  it("应该限制输入范围在 min-max 之间", () => {
    // clamped = Math.max(min, Math.min(max, num))
    expect(source).toMatch(/Math\.max\(min,\s*Math\.min\(max/);
  });

  it("应该阻止非数字字符输入", () => {
    // 正则检查：只允许数字
    expect(source).toMatch(/\/\^\\d\*\$\//);
  });

  it("按钮应该有 hover 效果", () => {
    // 按钮加上 hover:bg-white/5 样式
    expect(source).toContain("hover:bg-white/5");
  });

  it("input 应该有 focus 样式", () => {
    // input focus 时背景高亮
    expect(source).toContain("focus:bg-white/5");
  });

  it("注释应该说明 2026-10-17 的用户需求", () => {
    // 确保保留了需求说明
    expect(source).toContain("2026-10-17 用户需求");
    expect(source).toContain("支持键盘直接输入 1-9 张");
  });
});
