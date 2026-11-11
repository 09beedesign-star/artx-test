/**
 * 电商画布「返回」按钮改黑底白字回归（2026-11-10）。
 *
 * 用户原话：把这个「← 返回工作台」改成黑色按钮样式。
 * 旧样式是透明底 + 浅灰描边 + palette.sub 灰字，浅色页面上几乎看不见。
 *
 * ⚠️ 这类返回按钮有 4 个出口（生成记录 / 模板库 / 模板详情 / 生成结果区），
 *    只改一个 = 用户跳到下一页又看到旧胶囊，且零报错。
 *    所以本文件逐文件锁接线，并枚举出口数量。
 *
 * 三层守：
 *   1. 配色常量本身：黑底白字 + 对比度量化；
 *   2. 4 个出口都接上了常量，旧描边样式在该按钮块内消失（剥注释 + 精确切片）；
 *   3. 与全站黑按钮（SendActionButton / 侧栏「开始创作」）色值不跑偏。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripSourceComments,
  assertStripKeptSource,
} from "@shared/strip-source-comments";
import {
  ECOMMERCE_BACK_BUTTON_STYLE,
  ECOMMERCE_BACK_BUTTON_CLASS,
} from "./back-button-tokens";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const BASE = "client/src/components/ecommerce/";

function code(rel: string, maxLossRatio = 0.3): string {
  const raw = readFileSync(resolve(repoRoot, rel), "utf8");
  const stripped = stripSourceComments(raw);
  assertStripKeptSource(raw, stripped, maxLossRatio);
  return stripped;
}

/** sRGB 相对亮度，用于量化「白字在黑底上确实看得清」 */
function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`无法解析颜色：${hex}`);
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 精确切出「返回按钮」这个 JSX 块。
 * ⚠️ 不能从文案往前固定取 N 个字符：面包屑里还有另一个 `<Link>`，
 *    它带 `color: palette.sub`，会把反向断言直接判红（假阳性）。
 *    从文案往回找最近的开始标签，才是这一个按钮。
 */
function backButtonBlock(rel: string, anchor: string, tag: "Link" | "button"): string {
  const src = code(rel);
  const at = src.indexOf(anchor);
  if (at === -1) return "";
  const start = src.lastIndexOf(`<${tag}`, at);
  if (start === -1 || at - start > 600) return "";
  const end = src.indexOf(tag === "Link" ? "</Link>" : "</button>", at);
  return end === -1 ? "" : src.slice(start, end);
}

const OUTLETS: { name: string; rel: string; anchor: string; tag: "Link" | "button" }[] = [
  { name: "生成记录页", rel: `${BASE}EcommerceHistory.tsx`, anchor: "{backLink.label}", tag: "Link" },
  { name: "模板库页", rel: `${BASE}EcommerceTemplateGallery.tsx`, anchor: "← 返回工作台", tag: "Link" },
  { name: "模板详情页", rel: `${BASE}EcommerceTemplateDetail.tsx`, anchor: "← 返回", tag: "button" },
  { name: "生成结果区", rel: `${BASE}EcommerceWorkspace.tsx`, anchor: '← {mode === "post" ? "返回模板库" : "返回"}', tag: "button" },
];

describe("配色事实源：黑底白字胶囊", () => {
  it("底色 #161616 / 文字白 / 12% 白描边", () => {
    expect(ECOMMERCE_BACK_BUTTON_STYLE.background).toBe("#161616");
    expect(ECOMMERCE_BACK_BUTTON_STYLE.color).toBe("#ffffff");
    expect(ECOMMERCE_BACK_BUTTON_STYLE.border).toBe("1px solid rgba(255,255,255,0.12)");
  });

  it("白字压黑底对比度 ≥ 7（WCAG AAA）", () => {
    expect(contrast(
      ECOMMERCE_BACK_BUTTON_STYLE.background as string,
      ECOMMERCE_BACK_BUTTON_STYLE.color as string,
    )).toBeGreaterThan(7);
  });

  it("形状是全圆角胶囊，hover 只动 opacity", () => {
    expect(ECOMMERCE_BACK_BUTTON_CLASS).toContain("rounded-full");
    expect(ECOMMERCE_BACK_BUTTON_CLASS).toContain("hover:opacity-90");
    // 内联 background 优先级高于 hover:bg-*，写了也不会生效
    expect(ECOMMERCE_BACK_BUTTON_CLASS).not.toContain("hover:bg-");
  });
});

describe("4 个出口逐个接线（只改一个等于没做）", () => {
  for (const outlet of OUTLETS) {
    describe(outlet.name, () => {
      const block = backButtonBlock(outlet.rel, outlet.anchor, outlet.tag);

      it("切片有效（空切片会让本组断言全部恒绿）", () => {
        expect(block.length).toBeGreaterThan(100);
        expect(block.startsWith(`<${outlet.tag}`)).toBe(true);
        expect(block).toContain("className=");
        expect(block).toContain("style=");
      });

      it("用了黑色按钮的 class 与 style 常量", () => {
        expect(block).toContain("ECOMMERCE_BACK_BUTTON_CLASS");
        expect(block).toContain("style={ECOMMERCE_BACK_BUTTON_STYLE}");
      });

      it("旧的透明描边胶囊样式在该按钮块内消失", () => {
        expect(block).not.toContain("palette.border");
        expect(block).not.toContain("palette.sub");
        expect(block).not.toContain("palette.text");
        expect(block).not.toContain("rounded-md px-2.5 py-1");
      });

      it("文件 import 了事实源模块", () => {
        expect(code(outlet.rel)).toContain('from "./back-button-tokens"');
      });
    });
  }

  it("出口枚举完整：4 个文件、每个恰好使用一次 style 常量", () => {
    const files = OUTLETS.map(o => o.rel);
    expect(new Set(files).size).toBe(4);
    for (const rel of files) {
      const occurrences = code(rel).split("style={ECOMMERCE_BACK_BUTTON_STYLE}").length - 1;
      expect(occurrences, `${rel} 的使用次数不是 1`).toBe(1);
    }
  });
});

describe("与全站黑按钮色值不跑偏", () => {
  it("SendActionButton 用同一个黑底白字与白描边", () => {
    // ⚠️ 这个文件只有 ~70 行、开头一大段 JSDoc，剥注释占比 30.3% 属正常。
    //    默认 0.3 阈值在这里是假阳性；放宽到 0.45 仍保留「剥离器退化」的护栏。
    const sab = code("client/src/components/ui/send-action-button.tsx", 0.45);
    expect(sab).toContain(`background: "${ECOMMERCE_BACK_BUTTON_STYLE.background}"`);
    expect(sab).toContain(`color: "${ECOMMERCE_BACK_BUTTON_STYLE.color}"`);
    expect(sab).toContain(`border: "${ECOMMERCE_BACK_BUTTON_STYLE.border}"`);
  });

  it("侧栏「开始创作」黑按钮也是同色", () => {
    const shell = code("client/src/components/layout/AppShell.tsx");
    // ⚠️ 只切这一个按钮：AppShell 里还有十几处 `color: "#ffffff"`，
    //    拿全文件做 toContain 的话，把这个按钮改成灰字照样恒绿 —— 锁等于没锁。
    const start = shell.indexOf("title={`开始创作");
    const end = shell.indexOf("</button>", start);
    const startBtn = start === -1 || end === -1 ? "" : shell.slice(start, end);
    expect(startBtn.length, "开始创作按钮切片为空").toBeGreaterThan(100);
    expect(startBtn).toContain("开始创作");
    expect(startBtn).toContain(`background: "${ECOMMERCE_BACK_BUTTON_STYLE.background}"`);
    expect(startBtn).toContain(`color: "${ECOMMERCE_BACK_BUTTON_STYLE.color}"`);
  });
});
