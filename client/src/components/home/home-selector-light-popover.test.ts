/**
 * 🔒 2026-11-14 用户要求：首页提示词框里的「模型选择器」和「Skill 选择器」
 * 展开面板在浅色首页上必须是白色模式。
 *
 * 改之前：两个面板都恒为 #161616 黑底；Skill 面板行文字还是 #161616 → 黑底黑字。
 * 根因：ModelSelector 早有 popoverTheme（电商页在用），首页没传；SkillSelector 压根没有浅色分支。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "@shared/strip-source-comments";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function code(rel: string): string {
  const raw = readFileSync(resolve(repoRoot, rel), "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, 0.45);
  return stripped;
}

function sliceBlock(src: string, startAnchor: string, endAnchor: string, minLength = 60): string {
  const hits = src.split(startAnchor).length - 1;
  expect(hits, `锚点必须唯一命中，实际 ${hits} 次：${startAnchor}`).toBe(1);
  const start = src.indexOf(startAnchor);
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new Error(`切片终点不存在：${endAnchor}`);
  const block = src.slice(start, end);
  expect(block.length, "切片过短，多半锚错了").toBeGreaterThan(minLength);
  return block;
}

const PANEL = "client/src/components/home/CenteredPromptPanel.tsx";
const SKILL = "client/src/components/canvas/SkillSelector.tsx";

describe("首页两个选择器的展开面板跟随浅色主题", () => {
  it("模型选择器传 popoverTheme", () => {
    const block = sliceBlock(code(PANEL), "<ModelSelector", "/>");
    expect(block).toContain('popoverTheme={isDark ? "dark" : "light"}');
  });

  it("Skill 选择器传 popoverTheme", () => {
    const block = sliceBlock(code(PANEL), "<SkillSelector", "/>");
    expect(block).toContain('popoverTheme={isDark ? "dark" : "light"}');
  });

  it("SkillSelector 面板底色/描边/行文字都来自 modelPopoverTokens", () => {
    const src = code(SKILL);
    expect(src).toContain("const pop = modelPopoverTokens(popoverTheme, { text, border }, isDark);");
    expect(src).toContain('popoverTheme = "dark",');
    const portal = sliceBlock(src, "createPortal(", "document.body", 400);
    expect(portal).toContain("background: popBg,");
    expect(portal).toContain("border: `1px solid ${popBorder}`,");
    expect(portal).toContain("color: popText,");
    expect(portal).toContain("color: active ? activeText : popText,");
    // 旧的「浅色也写死 #161616」不得回来
    expect(src).not.toContain('const popBg = isDark ? "#161616" : "#161616";');
  });
});
