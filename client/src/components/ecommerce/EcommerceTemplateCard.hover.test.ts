import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 电商模板卡片 hover 规则测试 —— 必须与灵感推荐卡（InspirationCard）规则一致。
 *
 * 规则（2026-10-18 用户需求）：
 * - 悬停满 500ms 才认定 hover
 * - 仅缩略图放大 scale(1.08) + 300ms ease-out 过渡
 * - 卡片容器不位移（禁 hover:-translate-y-0.5）
 * - 文案区固定高度，标题单行截断，流程描述恒占两行（line-clamp-2 + h-[30px]）
 *
 * 🔴 **禁止 CSS group-hover:scale** —— 会立刻放大，绕过 500ms 延时。
 */

const source = readFileSync(resolve(__dirname, "EcommerceTemplateCard.tsx"), "utf-8");

describe("EcommerceTemplateCard hover", () => {
  it("delays hover activation by 500ms", () => {
    expect(source).toContain("useState");
    expect(source).toContain("setTimeout");
    expect(source).toContain("500");
    expect(source).toContain("clearTimeout");
    expect(source).toContain("hoverTimer");
    expect(source).toContain("setHovered(true)");
  });

  it("zooms only the thumbnail image/grid, not the card container", () => {
    // 缩略图接收 thumbStyle inline style（内含 transform scale）
    expect(source).toContain('hovered ? "scale(1.08)" : "scale(1)"');
    expect(source).toContain("data-tpl-thumb");
    expect(source).toContain("thumbStyle");
    expect(source).toContain("transition-transform duration-300 ease-out");
    // 卡片容器不能有位移动画
    expect(source).not.toContain("hover:-translate-y");
    expect(source).not.toContain("translate-y");
    // 禁 CSS group-hover:scale（立刻放大，绕过 500ms）
    expect(source).not.toContain("group-hover:scale");
  });

  it("fixes card height with fixed-height text area", () => {
    // 标题单行截断，固定 18px 高
    expect(source).toContain('h-[18px]');
    expect(source).toContain("truncate");
    // 流程描述恒占两行（line-clamp-2）+ 固定 30px 高（10.5px * 1.5 leading * 2 行 ≈ 31.5，取 30 规整）
    expect(source).toContain("line-clamp-2");
    expect(source).toContain('h-[30px]');
    expect(source).toContain("leading-[15px]"); // 10.5px 字号 + 1.5 leading = 15px 行高
  });

  it("has data-tpl-text landmark for text area", () => {
    // 文案区固定高度容器必须可识别，便于后续定位
    expect(source).toContain("data-tpl-text");
  });
});
