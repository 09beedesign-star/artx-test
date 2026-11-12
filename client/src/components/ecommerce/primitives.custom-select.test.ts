/**
 * 电商画布自定义 Select 下拉菜单测试
 * 2026-10-20 用户需求：白色主题 + 位置自适应
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync(
  "client/src/components/ecommerce/primitives.tsx",
  "utf8",
);

describe("自定义 Select 下拉菜单", () => {
  it("应该引入 useState, useRef, useEffect", () => {
    // 自定义下拉菜单需要状态管理和 DOM 引用
    expect(source).toMatch(/import.*\{[^}]*useState[^}]*\}/);
    expect(source).toMatch(/import.*\{[^}]*useRef[^}]*\}/);
    expect(source).toMatch(/import.*\{[^}]*useEffect[^}]*\}/);
  });

  it("应该有 isOpen 状态控制展开/收起", () => {
    const selectMatch = source.match(/export function Select\([^)]*\)[^{]*\{[\s\S]*?(?=\nexport|$)/);
    expect(selectMatch).toBeDefined();
    expect(selectMatch![0]).toMatch(/const\s+\[isOpen,\s*setIsOpen\]\s*=\s*useState/);
  });

  it("应该有 dropDirection 状态控制展开方向", () => {
    const selectMatch = source.match(/export function Select\([^)]*\)[^{]*\{[\s\S]*?(?=\nexport|$)/);
    expect(selectMatch).toBeDefined();
    expect(selectMatch![0]).toMatch(/dropDirection.*useState.*["']down["'].*["']up["']/);
  });

  it("应该计算浏览器空间决定展开方向", () => {
    // 检测下方和上方空间，决定向上还是向下
    expect(source).toContain("window.innerHeight");
    expect(source).toContain("spaceBelow");
    expect(source).toContain("spaceAbove");
  });

  it("应该在点击外部时关闭下拉菜单", () => {
    // useEffect 监听点击外部事件
    expect(source).toMatch(/handleClickOutside.*MouseEvent/);
    expect(source).toContain("document.addEventListener");
    expect(source).toContain("document.removeEventListener");
  });

  it("白色模式下展开面板应该是白色背景", () => {
    // isDark ? "#2a2a2a" : "#ffffff"
    expect(source).toMatch(/background:\s*isDark\s*\?\s*["']#2a2a2a["']\s*:\s*["']#ffffff["']/);
  });

  it("选中项应该高亮显示", () => {
    // 【2026-11-12 用户点名】可点击绿色统一改黑框线体按钮：
    // 选中项不再用「深绿文字 + 浅绿底」，改走全站反相实心事实源。
    expect(source).toContain("ACTION_ACTIVE_STYLE");
    expect(source).toMatch(/style=\{option === value \? ACTION_ACTIVE_STYLE/);
    // 反向断言：旧的荧光绿文字 / 浅绿底不能回来
    expect(source, "选中项还在用 LIME 绿字").not.toMatch(/isDark\s*\?\s*LIME/);
    expect(source, "选中项还在用浅绿底").not.toContain('rgba(178,237,154,0.08)');
  });

  it("箭头图标应该随展开状态旋转", () => {
    // isOpen ? 180 : 0
    // 箭头应该垂直居中：top: "50%" + translateY(-50%)
    expect(source).toMatch(/rotate.*isOpen\s*\?\s*180\s*:\s*0/);
    expect(source).toMatch(/top:\s*["']50%["']/);
    expect(source).toMatch(/translateY\(-50%\)/);
  });

  it("展开面板应该支持向上和向下", () => {
    // 根据 dropDirection 动态设置 top 或 bottom
    expect(source).toMatch(/\[dropDirection\s*===\s*["']down["']\s*\?\s*["']top["']\s*:\s*["']bottom["']\]/);
  });

  it("注释应该说明 2026-10-20 的需求", () => {
    expect(source).toContain("2026-10-20");
    expect(source).toMatch(/白色模式.*展开面板|展开面板.*白色/);
    expect(source).toMatch(/自适应|展开方向/);
  });
});
