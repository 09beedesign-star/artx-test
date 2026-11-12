/**
 * 全站可点击强调元素：黑色线框按钮事实源契约
 *
 * 【2026-11-12 用户点名】浅绿色高亮文字/标签看不清楚 → 所有可点击绿色
 * 统一改成黑框黑字线框按钮，且「只更换可点击的样式」。
 * 用户确认：样式 = 黑框黑字线框；范围 = 所有可点击绿色（含原实心绿底主按钮）。
 *
 * ⚠️ 切片断言必须先剥注释：注释里写了旧写法的名字（LIME / #C5ED47 / lime 档），
 *    不剥会让「反向断言」恒红，也会让「正向断言」恒绿。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  ACTION_OUTLINE_STYLE,
  ACTION_ACTIVE_STYLE,
  ACTION_OUTLINE_ON_DARK_STYLE,
  ACTION_ACTIVE_ON_DARK_STYLE,
  ACTION_OUTLINE_CLASS,
  ACTION_SURFACE_CONTRACT,
} from "./action-surface-tokens";

const SRC = resolve(__dirname, "..");
const css = readFileSync(resolve(SRC, "index.css"), "utf-8");
const tokens = readFileSync(resolve(__dirname, "action-surface-tokens.ts"), "utf-8");

/**
 * 按行保守剥离注释。
 *
 * ⚠️⚠️ 不能用 /\/\*[\s\S]*?\*\//g：AppShell.tsx:616 的 JSX 字符串里有一个
 * 字面量 "/*"，直到 L855 才有配对的 *\/，全局正则会把中间 240 行真实代码
 * 整块吃掉（刚改的 L730 就在其中），而且整文件还剩 71.8% 源码，
 * assertStripKeptSource(0.3) 完全不会报警 —— 检测器就这样静默失真。
 * 只认「行首注释」+「单行内闭合的块注释」，绝不跨行匹配。
 */
function stripSourceComments(code: string): string {
  let inBlock = false;
  return code.split("\n").map(line => {
    const t = line.trim();
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      return "";
    }
    if (t.startsWith("//")) return "";
    if (t.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      return "";
    }
    return line.replace(/\/\*[^*]*\*\//g, "");
  }).join("\n");
}

function assertStripKeptSource(original: string, stripped: string, minRatio = 0.3) {
  const ratio = stripped.length / original.length;
  if (ratio < minRatio) {
    throw new Error(
      `剥离注释后只剩 ${(ratio * 100).toFixed(1)}% 源码，疑似误删代码块（阈值 ${minRatio * 100}%）`
    );
  }
}

const cssClean = stripSourceComments(css);
assertStripKeptSource(css, cssClean, 0.4);
const tokensClean = stripSourceComments(tokens);
assertStripKeptSource(tokens, tokensClean, 0.3);

// 只取本次新增的变量区块，避免扫到文件里其它 :root
const actionBlockStart = cssClean.indexOf("--artx-action-bg");
const actionBlock = cssClean.slice(actionBlockStart, actionBlockStart + 1400);

describe("CSS 变量：色值只在这一处定义", () => {
  it("浅色：黑框黑字透明底 + 选中态反相黑底白字", () => {
    expect(actionBlock).toContain("--artx-action-bg: transparent");
    expect(actionBlock).toContain("--artx-action-fg: #161616");
    expect(actionBlock).toContain("--artx-action-border: rgba(22,22,22,0.55)");
    expect(actionBlock).toContain("--artx-action-active-bg: #161616");
    expect(actionBlock).toContain("--artx-action-active-fg: #ffffff");
  });

  it("深色：线框与选中态必须反相成白，否则黑字压黑底同样看不清", () => {
    // ⚠️ 必须取最后一个：文件前面还有 html.dark .gradient-brand-text 等规则
    const darkStart = cssClean.lastIndexOf("html.dark");
    expect(darkStart).toBeGreaterThanOrEqual(0);
    const dark = cssClean.slice(darkStart, darkStart + 500);
    expect(dark).toContain("--artx-action-fg: #ffffff");
    expect(dark).toContain("--artx-action-border: rgba(255,255,255,0.55)");
    expect(dark).toContain("--artx-action-active-bg: #ffffff");
    expect(dark).toContain("--artx-action-active-fg: #161616");
  });

  it("深色浮层专用变量存在（画布里有一批浅色主题下的黑底面板）", () => {
    expect(actionBlock).toContain("--artx-action-ondark-fg: #ffffff");
    expect(actionBlock).toContain("--artx-action-ondark-border: rgba(255,255,255,0.55)");
    expect(actionBlock).toContain("--artx-action-ondark-active-bg: #ffffff");
  });

  it("反向断言：变量区块里不允许出现任何品牌绿", () => {
    expect(actionBlock).not.toMatch(/#C5ED47|197,237,71|BAFF2E|B2ED9A/i);
  });
});

describe("TS 常量：只引用变量，不复制色值", () => {
  it("常态线框是透明底 + 黑字 + 1px 边框（主题由 CSS 变量决定）", () => {
    expect(ACTION_OUTLINE_STYLE.background).toBe("var(--artx-action-bg)");
    expect(ACTION_OUTLINE_STYLE.color).toBe("var(--artx-action-fg)");
    expect(ACTION_OUTLINE_STYLE.border).toBe("1px solid var(--artx-action-border)");
  });

  it("选中态走反相实心，不能和未选中一样都是线框（否则选不出来）", () => {
    expect(ACTION_ACTIVE_STYLE.background).toBe("var(--artx-action-active-bg)");
    expect(ACTION_ACTIVE_STYLE.color).toBe("var(--artx-action-active-fg)");
    expect(ACTION_ACTIVE_STYLE.background).not.toBe(ACTION_OUTLINE_STYLE.background);
  });

  it("深色浮层常量是白框白字（不跟 html.dark 走）", () => {
    expect(ACTION_OUTLINE_ON_DARK_STYLE.color).toBe("#ffffff");
    expect(ACTION_ACTIVE_ON_DARK_STYLE.background).toBe("#ffffff");
    expect(ACTION_ACTIVE_ON_DARK_STYLE.color).toBe("#161616");
  });

  it("纯文字链接升级成按钮时补的形态：全圆角 + inline-flex", () => {
    expect(ACTION_OUTLINE_CLASS).toContain("rounded-full");
    expect(ACTION_OUTLINE_CLASS).toContain("inline-flex");
  });

  it("契约锚点与 CSS 实际值一致（防止测试与实现各说各话）", () => {
    expect(actionBlock).toContain(`--artx-action-fg: ${ACTION_SURFACE_CONTRACT.lightFg}`);
    expect(actionBlock).toContain(`--artx-action-active-fg: ${ACTION_SURFACE_CONTRACT.lightActiveFg}`);
    expect(cssClean).toContain(`--artx-action-fg: ${ACTION_SURFACE_CONTRACT.darkFg}`);
  });

  it("TS 文件不写死任何绿色/黑色十六进制（除 on-dark 固定白色系）", () => {
    expect(tokensClean).not.toMatch(/#C5ED47|197,237,71/i);
  });
});

describe("接线：三类出口都接到了事实源", () => {
  const wired = [
    // 电商画布（用 TS 常量）
    "components/ecommerce/EcommerceWorkspace.tsx",
    "components/ecommerce/EcommerceTemplateGallery.tsx",
    "components/ecommerce/EcommerceHistory.tsx",
    "components/ecommerce/primitives.tsx",
    // 画布与智能电商弹窗（用裸 CSS 变量，保持 style 对象结构）
    "components/canvas/InfiniteCanvas.tsx",
    "components/canvas/SmartCommerceProductDialog.tsx",
    // 其余页面 / 全局框架
    "components/workspace/TopBar.tsx",
    "components/layout/AppShell.tsx",
    "components/inspiration/InspirationPromptDialog.tsx",
    "components/canvas/PicwishBackgroundSelector.tsx",
    "pages/HomePage.tsx",
    "pages/ProfilePage.tsx",
    "pages/LongTermMemoryPage.tsx",
    "pages/HelpPage.tsx",
    "pages/CrossBorderCommercePage.tsx",
    "components/announcement/AnnouncementModal.tsx",
  ];

  for (const rel of wired) {
    it(`${rel} 的底色出口接到了事实源`, () => {
      const raw = readFileSync(resolve(SRC, rel), "utf-8");
      const clean = stripSourceComments(raw);
      assertStripKeptSource(raw, clean, 0.3);
      // ⚠️ 必须锁「背景」这一路：只查任意 --artx-action-* 的话，
      //    把某个按钮的 background 单独改回 #C5ED47 仍会留着 fg/border 引用而恒绿。
      expect(clean).toMatch(
        /--artx-action-bg|--artx-action-active-bg|--artx-action-ondark-bg|ACTION_OUTLINE_STYLE|ACTION_ACTIVE_STYLE|ACTION_OUTLINE_ON_DARK_STYLE/
      );
    });
  }

  it("比例/分辨率/分类共用的 chipStyle 选中态走反相实心", () => {
    const ws = stripSourceComments(readFileSync(resolve(SRC, "components/ecommerce/EcommerceWorkspace.tsx"), "utf-8"));
    const start = ws.indexOf("const chipStyle");
    expect(start).toBeGreaterThanOrEqual(0);
    const chip = ws.slice(start, start + 420);
    expect(chip).toContain("ACTION_ACTIVE_STYLE");
    expect(chip, "chip 又用回浅绿底了").not.toMatch(/rgba\(178,237,154/);
    expect(chip, "chip 又用回绿字了").not.toContain("color: lime");
  });

  it("用户截图里的两个元素已换成线框按钮", () => {
    const ws = stripSourceComments(readFileSync(resolve(SRC, "components/ecommerce/EcommerceWorkspace.tsx"), "utf-8"));
    const aiWrite = ws.slice(ws.indexOf("AI 帮写") - 900, ws.indexOf("AI 帮写"));
    expect(aiWrite).toContain("ACTION_OUTLINE_STYLE");
    expect(aiWrite).toContain("ACTION_OUTLINE_CLASS");
    const hint = ws.slice(ws.indexOf("在右侧选择模板") - 900, ws.indexOf("在右侧选择模板"));
    expect(hint).toContain("ACTION_OUTLINE_STYLE");
    expect(hint).not.toContain("brand-green-light");
  });
});

describe("边界：只换可点击，纯展示绿色必须原样保留", () => {
  it("电商 LIME 常量本身仍是绿色（图标/角标/边框还在用）", () => {
    const shared = stripSourceComments(readFileSync(resolve(SRC, "components/ecommerce/shared.ts"), "utf-8"));
    expect(shared).toContain('export const LIME = "#c5ed71"');
  });

  it("模板卡片的 Sparkles 图标和选中角标仍用 LIME", () => {
    const card = stripSourceComments(readFileSync(resolve(SRC, "components/ecommerce/EcommerceTemplateCard.tsx"), "utf-8"));
    expect(card).toContain("background: LIME");
    const gallery = stripSourceComments(readFileSync(resolve(SRC, "components/ecommerce/EcommerceTemplateGallery.tsx"), "utf-8"));
    expect(gallery).toContain('<Sparkles size={20} style={{ color: LIME }} />');
  });

  it("公告弹窗的装饰竖条与 tag 文字仍用 ACCENT_LIME", () => {
    const modal = stripSourceComments(readFileSync(resolve(SRC, "components/announcement/AnnouncementModal.tsx"), "utf-8"));
    expect(modal).toContain("background: ACCENT_LIME");
    expect(modal).toContain("color: ACCENT_LIME");
  });

  it("滑块 accent、focus 描边、拖拽态、状态文字这些绿色没被误伤", () => {
    const profile = stripSourceComments(readFileSync(resolve(SRC, "pages/ProfilePage.tsx"), "utf-8"));
    expect(profile).toContain('accent-[#C5ED47]');
    const ws = stripSourceComments(readFileSync(resolve(SRC, "components/ecommerce/EcommerceWorkspace.tsx"), "utf-8"));
    expect(ws).toContain("rgba(197,237,71,0.42)"); // 卖点框 focus 描边
    expect(ws).toContain("rgba(197,237,71,0.08)"); // 拖拽态
    expect(ws).toContain("建议一次生成多张"); // 提示文案仍在
  });

  it("GreenTestPage 演示色板页没被批量替换", () => {
    const page = stripSourceComments(readFileSync(resolve(SRC, "pages/GreenTestPage.tsx"), "utf-8"));
    // ⚠️ 不能只 toContain 或 >=N：文件里有 4 处同款 background，
    //    改掉一处后两种方式都仍会恒绿。必须锁精确次数。
    expect(page.split('background: "var(--color-brand-green-light)"').length - 1).toBe(4);
    expect(page.split("var(--color-brand-green-light)").length - 1).toBe(5);
  });
});

describe("上游 token 收口：Switch 不会再被重新染绿", () => {
  it("switch.tsx 的 lime 档已删除，激活态黑白", () => {
    const sw = stripSourceComments(readFileSync(resolve(SRC, "components/ui/switch.tsx"), "utf-8"));
    expect(sw).not.toContain('"default" | "lime"');
    expect(sw).not.toContain("bg-[#C5ED47]");
    expect(sw).toContain('data-[state=checked]:bg-[#161616]');
  });

  it("记忆开关常量与画布调用点一致，且不再是 lime", () => {
    const tokenFile = stripSourceComments(resolve(SRC, "lib/memory-switch-tokens.ts") && readFileSync(resolve(SRC, "lib/memory-switch-tokens.ts"), "utf-8"));
    expect(tokenFile).toContain('MEMORY_SWITCH_TONE = "default"');
    const canvas = stripSourceComments(readFileSync(resolve(SRC, "components/canvas/InfiniteCanvas.tsx"), "utf-8"));
    expect(canvas).toContain('tone="default"');
    expect(canvas).not.toContain('tone="lime"');
  });
});
