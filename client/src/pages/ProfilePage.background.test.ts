/**
 * ProfilePage 白天模式配色契约测试
 *
 * 需求：个人中心页面配色与技能商店统一 —— 浅色底、黑色线框/实心按钮体系。
 *
 * 验证点：
 * 1. 主容器背景：白天用 var(--design-surface-soft)（与 SkillsPage 同源 token），黑夜 #222222
 * 2. 头部横幅：白天浅灰 rgba(20,20,36,0.06)，黑夜 #222222
 * 3. 信息卡：白天纯白 rgba(255,255,255,0.92)
 * 4. 顶部操作按钮 / 标签胶囊 / 收藏 tab：走 var(--artx-action-*) 黑色体系（选中实心黑、未选中线框）
 * 5. 表单 label 不允许白字（浅色弹窗上白字不可见）
 * 6. 弹窗遮罩保留暗色 scrim（bg-[#222222]/35 ×2、/45 ×1）
 */

import { describe, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const sourceFile = resolve(__dirname, "ProfilePage.tsx");
const source = readFileSync(sourceFile, "utf-8");

describe("ProfilePage 白天模式配色", () => {
  it("主容器背景：白天用 design-surface-soft token（与技能商店同源）", ({ expect }) => {
    const match = source.match(
      /background:\s*isDark\s*\?\s*"#222222"\s*:\s*"var\(--design-surface-soft\)"/
    );
    expect(match).toBeTruthy();
  });

  it("头部横幅背景：白天浅灰，不再写死黑色", ({ expect }) => {
    const match = source.match(
      /background:\s*isDark\s*\?\s*"#222222"\s*:\s*"rgba\(20,20,36,0\.06\)"/
    );
    expect(match).toBeTruthy();
  });

  it("信息卡：白天为纯白 rgba(255,255,255,0.92)", ({ expect }) => {
    const matches = source.match(/rgba\(255,255,255,0\.92\)/g);
    expect(matches?.length).toBe(2);
  });

  it("顶部操作按钮走 artx-action 黑色线框体系", ({ expect }) => {
    const matches = source.match(
      /background:\s*"var\(--artx-action-bg\)",\s*\n\s*border:\s*"1px solid var\(--artx-action-border\)",\s*\n\s*color:\s*"var\(--artx-action-fg\)"/g
    );
    // 修改密码 + 编辑资料 + 标签胶囊若干，≥3 处
    expect(matches?.length).toBeGreaterThanOrEqual(3);
  });

  it("收藏 tab 选中态为实心黑（artx-action-active-*）", ({ expect }) => {
    expect(source).toContain("var(--artx-action-active-bg)");
    expect(source).toContain("var(--artx-action-active-fg)");
    expect(source).toContain("var(--artx-action-active-border)");
  });

  it("表单 label 不允许白字（浅色弹窗上不可见）", ({ expect }) => {
    expect(source).not.toContain('style={{ color: "rgba(255,255,255,0.64)" }}');
    expect(source).not.toContain("placeholder:text-white/32");
    expect(source).toContain('style={{ color: "rgba(20,20,36,0.56)" }}');
  });

  it("弹窗遮罩保留暗色 scrim（编辑/密码 ×2 /35，头像hover+裁剪 ×2 /45）", ({ expect }) => {
    expect(source.match(/bg-\[#222222\]\/35/g)?.length).toBe(2);
    expect(source.match(/bg-\[#222222\]\/45/g)?.length).toBe(2);
  });

  it("不再使用硬编码的黑色背景（background: \"#222222\"）在条件判断之外", ({ expect }) => {
    const lines = source.split("\n");
    const problematicLines = lines.filter((line, index) => {
      if (line.includes('background: "#222222"')) {
        const contextLines = lines.slice(Math.max(0, index - 2), index + 3).join("\n");
        return !contextLines.includes("isDark");
      }
      return false;
    });

    expect(problematicLines.length).toBe(0);
  });
});
