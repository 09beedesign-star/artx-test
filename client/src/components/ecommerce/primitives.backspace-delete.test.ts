/**
 * 电商画布 Stepper Backspace 回删测试
 * 2026-10-20 用户需求：图片张数支持 Backspace 删除后重新输入
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync(
  "client/src/components/ecommerce/primitives.tsx",
  "utf8",
);

describe("Stepper Backspace 回删功能", () => {
  it("应该使用 defaultValue + key 替代 value（受控 → 非受控）", () => {
    // 2026-10-20：从 value={value} 改为 defaultValue={value} key={value}
    // 这样允许用户 Backspace 清空输入框，失焦时才同步回 value
    expect(source).toMatch(/defaultValue=\{value\}/);
    expect(source).toMatch(/key=\{value\}/);
    
    // 应该不再使用 value={value} 受控模式
    const inputMatch = source.match(/<input[^>]*>/g);
    const stepperInput = inputMatch?.find(tag => tag.includes('data-testid="ecommerce-count-input"'));
    expect(stepperInput).toBeDefined();
    // 确保这个 input 没有 value={value} 属性（避免与 defaultValue 冲突）
    expect(stepperInput).not.toMatch(/\svalue=\{value\}/);
  });

  it("handleInputChange 允许空字符串（Backspace 清空）", () => {
    // 空字符串时直接 return，不触发 onChange，允许输入框显示为空
    expect(source).toMatch(/if\s*\(raw\s*===\s*['"]{2}\)/);
  });

  it("handleInputBlur 在失焦时恢复当前值", () => {
    // 失焦时检查输入框是否为空，为空则恢复 value
    const blurMatch = source.match(/const\s+handleInputBlur[^}]*\{[^}]*\}/s);
    expect(blurMatch).toBeDefined();
    expect(blurMatch![0]).toContain('if (e.target.value === "")');
    expect(blurMatch![0]).toContain("String(value)");
  });

  it("注释应该说明 2026-10-20 的需求", () => {
    // 确保保留了新需求说明
    expect(source).toContain("2026-10-20");
    expect(source).toMatch(/Backspace|回删/i);
  });

  it("最大值应该限制为 8", () => {
    // 2026-10-20 用户要求：单次数字最大不能超过 8
    // 虽然这个限制在调用方 EcommerceWorkspace.tsx 中传入 max={8}，
    // 但这里验证 Stepper 组件正确使用了 max 参数
    expect(source).toMatch(/Math\.max\(min,\s*Math\.min\(max,\s*num\)\)/);
  });
});
