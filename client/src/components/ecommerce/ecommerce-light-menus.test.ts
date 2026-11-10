/**
 * 电商画布「展开菜单看不清」回归（2026-11-10）。
 *
 * 现象：浅色页面里模型下拉整块是黑的、模型名也是黑的；预设上拉菜单是深灰底
 * 配深灰字。根因是两处底色被写死成深色，而文字跟着页面的浅色 palette 走。
 *
 * 这里分两层守：
 *   1. 配色事实源是纯函数 → 直接断言返回值，并用亮度差量化「看得清」；
 *   2. 组件与页面确实接上了这套事实源 → 剥注释 + 切片后的源码断言。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "@shared/strip-source-comments";
import { modelPopoverTokens } from "@/components/canvas/model-popover-tokens";
import { ecommercePresetMenuTokens } from "@/components/ecommerce/shared";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function code(rel: string, maxLossRatio = 0.3): string {
  const raw = readFileSync(resolve(repoRoot, rel), "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

/** 切片必须抛错而不是返回空串，否则区间内所有 not.toContain 都会恒绿。 */
function sliceBlock(src: string, startAnchor: string, endAnchor: string, minLength = 100): string {
  const hits = src.split(startAnchor).length - 1;
  expect(hits, `锚点必须唯一命中，实际 ${hits} 次：${startAnchor}`).toBe(1);
  const start = src.indexOf(startAnchor);
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new Error(`切片终点不存在：${endAnchor}`);
  const block = src.slice(start, end);
  expect(block.length, "切片过短，多半锚错了").toBeGreaterThan(minLength);
  return block;
}

/**
 * 相对亮度（0=黑，1=白），支持 #rrggbb / rgb() / rgba()。
 * 半透明色按「叠在白底上」合成后再算 —— 菜单里的 hover / 选中底色
 * 都是低透明度黑，忽略 alpha 会把浅灰误判成近黑。
 */
function luminance(color: string): number {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  let r: number;
  let g: number;
  let b: number;
  let a = 1;
  if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?/i);
    if (!m) throw new Error(`无法解析颜色：${color}`);
    [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4] !== undefined) a = Number(m[4]);
  }
  const blend = (channel: number) => channel * a + 255 * (1 - a);
  return (0.2126 * blend(r) + 0.7152 * blend(g) + 0.0722 * blend(b)) / 255;
}

const BORDER = "rgba(20,20,36,0.11)";
/** 首页 surface 传进来的浅色文字 —— 深色面板必须仍然用它，不能被浅色主题接管 */
const SURFACE_TEXT = "rgba(255,255,255,0.92)";

describe("模型下拉面板配色", () => {
  it("light：白底 + 深字 + 深图标，亮度差足够读清", () => {
    const t = modelPopoverTokens("light", { text: "#161616", border: BORDER }, false);
    expect(t.background).toBe("#ffffff");
    expect(luminance(t.background)).toBeGreaterThan(0.95);
    expect(luminance(t.background) - luminance(t.text)).toBeGreaterThan(0.6);
    expect(luminance(t.background) - luminance(t.icon)).toBeGreaterThan(0.6);
    expect(t.shadow).not.toBeNull();
  });

  it("light：hover / 选中行是浅灰，不是深色块", () => {
    const t = modelPopoverTokens("light", { text: "#161616", border: BORDER }, false);
    expect(luminance(t.hoverBackground)).toBeGreaterThan(0.8);
    expect(luminance(t.selectedBackground)).toBeGreaterThan(0.8);
    expect(t.hoverBackground).not.toBe(t.background);
  });

  it("dark（默认）：黑底白图标，文字沿用调用方 surface，阴影沿用组件", () => {
    const t = modelPopoverTokens("dark", { text: SURFACE_TEXT, border: BORDER }, false);
    expect(t.background).toBe("#161616");
    expect(t.icon).toBe("#FFFFFF");
    expect(t.text).toBe(SURFACE_TEXT);
    expect(t.border).toBe(BORDER);
    expect(t.selectedBackground).toBe("transparent");
    expect(t.shadow).toBeNull();
    expect(luminance(t.icon) - luminance(t.background)).toBeGreaterThan(0.8);
  });

  it("两个主题的底色必须不同（本次事故就是被写成同一个值）", () => {
    const light = modelPopoverTokens("light", { text: "#161616", border: BORDER }, false);
    const dark = modelPopoverTokens("dark", { text: "#161616", border: BORDER }, false);
    expect(light.background).not.toBe(dark.background);
  });
});

describe("预设上拉菜单配色", () => {
  it("浅色主题：白底、无毛玻璃、选中浅灰、操作图标转深色", () => {
    const t = ecommercePresetMenuTokens(false, BORDER);
    expect(t.background).toBe("#ffffff");
    expect(t.backdropFilter).toBeUndefined();
    expect(luminance(t.background) - luminance(t.accentColor)).toBeGreaterThan(0.6);
    expect(luminance(t.background) - luminance(t.dangerColor)).toBeGreaterThan(0.4);
    expect(luminance(t.activeBackground)).toBeGreaterThan(0.8);
    expect(t.rowHoverClass).toContain("black");
  });

  it("深色主题：保留原来的毛玻璃深底与绿色强调", () => {
    const t = ecommercePresetMenuTokens(true, "rgba(255,255,255,0.11)");
    expect(t.background).not.toBe("#ffffff");
    expect(t.backdropFilter).toBe("blur(12px)");
    expect(t.rowHoverClass).toContain("white");
    expect(luminance(t.accentColor)).toBeGreaterThan(0.7);
  });
});

describe("接线：浅色配色必须真的被组件消费", () => {
  it("电商工作台的模型选择器显式传 light", () => {
    const src = code("client/src/components/ecommerce/EcommerceWorkspace.tsx");
    const hits = src.split('popoverTheme={isDark ? "dark" : "light"}').length - 1;
    expect(hits, "浅色主题传参必须且只能出现一次").toBe(1);
    const block = sliceBlock(src, "<ModelSelector", "/>", 120);
    expect(block).toContain('popoverTheme={isDark ? "dark" : "light"}');
  });

  it("电商画布页把 isDark 传给预设面板", () => {
    const src = code("client/src/pages/EcommerceCanvasPage.tsx", 0.45);
    const block = sliceBlock(src, "presetSlot={", "accountId={accountId}", 120);
    expect(block).toContain("isDark={isDark}");
  });

  it("ModelSelector 的 portal 面板、行文字、品牌图标都吃同一组 token", () => {
    const src = code("client/src/components/canvas/ModelSelector.tsx");
    expect(src).toContain(
      "const pop = modelPopoverTokens(popoverTheme, { text, border }, isDark);",
    );
    const portal = sliceBlock(src, "createPortal(", "document.body", 800);
    expect(portal).toContain("background: pop.background,");
    expect(portal).toContain("color: pop.text,");
    expect(portal).toContain("color={pop.icon}");
    expect(portal).toContain("background = pop.hoverBackground");
  });

  it("预设菜单不再写死深灰底，底色来自 token", () => {
    const src = code("client/src/components/ecommerce/EcommerceCanvasPresetPanel.tsx");
    expect(src).toContain(
      "const menu = ecommercePresetMenuTokens(isDark, palette.border);",
    );
    const menuBlock = sliceBlock(src, 'data-testid="ecommerce-preset-menu"', 'role="menu"', 150);
    expect(menuBlock).toContain("background: menu.background,");
    expect(menuBlock).toContain("boxShadow: menu.boxShadow,");
    expect(menuBlock).not.toContain('background: "rgba(42, 42, 42, 0.8)"');
    // 绿色强调色不能留在浅色菜单里：白底上几乎看不见「更新」和选中勾。
    // 两个出口都要换，只换一个等于没换 → 用计数而不是 toContain。
    const accentHits = src.split("style={{ color: menu.accentColor }}").length - 1;
    expect(accentHits, "选中勾与「更新」按钮必须都用 accentColor").toBe(2);
    const dangerHits = src.split("style={{ color: menu.dangerColor }}").length - 1;
    expect(dangerHits, "删除按钮必须用 dangerColor").toBe(1);
  });
});
