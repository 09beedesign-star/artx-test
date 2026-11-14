/**
 * 🔒 2026-11-14 用户要求：
 *  1. 技能商店卡片封面 hover 内的两枚按钮整块删除（只留轻压暗）；
 *  2. 底部常驻「快速加载」按钮增加 hover，hover 是黑色按钮态。
 *
 * ⚠️ CardHoverOverlay 是技能商店 / 灵感模板 / 个人中心共用的唯一实现，
 *    这里只锁 SkillsPage 这个调用点，不动共享组件本身。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/pages/SkillsPage.tsx", "utf8");

function sliceBlock(start: string, end: string): string {
  const i = source.indexOf(start);
  expect(i, `锚点不存在：${start}`).toBeGreaterThan(0);
  const j = source.indexOf(end, i);
  expect(j, `终点不存在：${end}`).toBeGreaterThan(i);
  return source.slice(i, j);
}

describe("技能商店卡片 hover 按钮", () => {
  it("封面 hover 层不再传任何按钮，且是轻压暗", () => {
    const call = sliceBlock("<CardHoverOverlay", "/>");
    expect(call).toContain("dim={0.18}");
    expect(call).not.toContain("actions=");
    expect(call).not.toContain("compact");
    expect(source).not.toContain("copySkillPrompt(");
    expect(source).not.toContain('label: "复制提示词"');
  });

  it("底部「快速加载」按钮 hover 切黑色按钮态", () => {
    // 按钮标签里含 => 箭头，不能用 ">" 当切片终点；取标记前后整段。
    const anchor = source.indexOf("data-skills-quick-load=");
    expect(anchor).toBeGreaterThan(0);
    const btn = source.slice(source.lastIndexOf("<button", anchor), source.indexOf("快速加载", anchor));
    expect(btn.length).toBeGreaterThan(200);
    expect(btn).toContain('onMouseEnter={() => setHoveredQuickLoadId(skill.id)}');
    expect(btn).toContain("hoveredQuickLoadId === skill.id");
    expect(btn).toContain('background: "#161616"');
    expect(btn).toContain('color: "#ffffff"');
  });

  it("默认态仍是原有的 transparent + 描边按钮", () => {
    expect(source).toContain('background: "var(--artx-action-bg)"');
    expect(source).toContain('border: "1px solid var(--artx-action-border)"');
  });
});
