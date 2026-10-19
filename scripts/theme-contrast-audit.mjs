/**
 * ArtX 主题对比度体检（WCAG 2.1）
 *
 * 用法：node scripts/theme-contrast-audit.mjs
 *
 * 📌 为什么要单独一个脚本：
 * 「浅色模式看起来能看清」是主观判断，而 WCAG 是可计算的相对亮度比。
 * 换色板时如果靠肉眼，一定会有组合悄悄掉到 4.5:1 以下却没人发现
 * （现象就是「字发灰」，零报错）。这里把所有 foreground/background
 * 组合集中成一张表，改动色板后跑一次就能看到是哪一对掉了。
 *
 * 判定口径（WCAG 2.1）：
 *   - 1.4.3  正文文本        AA 4.5:1  / AAA 7:1
 *   - 1.4.3  大文本(≥24px 或 ≥18.66px bold) AA 3:1 / AAA 4.5:1
 *   - 1.4.11 非文本(边框/图标) AA 3:1
 */

/** #rgb / #rrggbb / rgb() / 具名 → [r,g,b] 0-255 */
function parseColor(input) {
  const s = String(input).trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.length === 4
          ? hex
              .split("")
              .map((c) => c + c)
              .join("")
          : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[,/]/).map((v) => parseFloat(v));
    return [parts[0], parts[1], parts[2]];
  }
  throw new Error(`无法解析颜色: ${input}`);
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(color) {
  const [r, g, b] = parseColor(color).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** alpha 混合：把 fg 以 alpha 压在 bg 上，得到实际渲染色 */
export function flatten(fg, bg, alpha) {
  const [fr, fg2, fb] = parseColor(fg);
  const [br, bg2, bb] = parseColor(bg);
  const mix = (f, b) => Math.round(f * alpha + b * (1 - alpha));
  return `rgb(${mix(fr, br)}, ${mix(fg2, bg2)}, ${mix(fb, bb)})`;
}

/* ────────────────────────────────────────────────────────────
   浅色模式色板（唯一事实源，必须与 client/src/index.css 的
   html.light 变量保持一致；不一致时以本脚本为准并回改 CSS）
   ──────────────────────────────────────────────────────────── */
export const LIGHT = {
  appBg: "#F4F6F8", // 应用底 —— 冷调浅灰，避免纯白刺眼
  surface: "#FFFFFF", // 卡片 / 面板
  surfaceSunken: "#EDF0F3", // 内凹块（输入框底、代码块）
  surfaceHover: "#E9EDF1",
  textStrong: "#14161B", // 主文本
  textBody: "#2E333C", // 正文
  textMuted: "#5A626F", // 次要/辅助文本
  textFaint: "#666e7b", // 三级（仍需 4.5:1，不能再淡）
  borderSubtle: "rgba(0, 0, 0, 0.08)",
  borderDefault: "rgba(0, 0, 0, 0.14)",
  borderStrong: "rgba(0, 0, 0, 0.34)",
  // 品牌高亮色 —— 锁定，任何模式都不改
  brandPurple: "#936CFF",
  brandLime: "#C5ED47",
  // 品牌 ink 变体：只在「浅底上的小字 / 需要描边」时用，
  // 高亮色本身仍是上面两个，这两个只是同色系的可读深版
  brandPurpleInk: "#5B2FBF",
  brandLimeInk: "#3F6100",
  // 语义色
  danger: "#C4281C",
  success: "#1A7F37",
  warning: "#8A5A00",
  info: "#1B5FCC",
};

export const DARK = {
  appBg: "#222222",
  surface: "#171717",
  surfaceSunken: "#1E1E1E",
  surfaceHover: "#2B2B2B",
  textStrong: "#FFFFFF",
  textBody: "#E8E8EA",
  textMuted: "#A8A8AE",
  textFaint: "#8f8f95",
  borderSubtle: "#333333",
  borderDefault: "#454545",
  borderStrong: "#5A5A5A",
  brandPurple: "#936CFF",
  brandLime: "#C5ED47",
  brandPurpleInk: "#C4AEFF",
  brandLimeInk: "#C5ED47",
  danger: "#F87171",
  success: "#42D392",
  warning: "#FFB020",
  info: "#1677FF",
};

function buildCases() {
  const L = LIGHT;
  const D = DARK;
  // ⚠️ rgba 半透明色必须先 flatten 成实体色再算对比度，
  // 否则「线对底」算出来全是 1:1 无穷小。
  const lightBorderOnAppBg = flatten(L.borderDefault, L.appBg, 0.14);
  const lightBorderStrongOnAppBg = flatten(L.borderStrong, L.appBg, 0.34);

  return [
    // ── 浅色 ──
    ["浅·主文本 / 应用底", L.textStrong, L.appBg, "text"],
    ["浅·主文本 / 卡片", L.textStrong, L.surface, "text"],
    ["浅·正文 / 应用底", L.textBody, L.appBg, "text"],
    ["浅·正文 / 卡片", L.textBody, L.surface, "text"],
    ["浅·次要文本 / 应用底", L.textMuted, L.appBg, "text"],
    ["浅·次要文本 / 卡片", L.textMuted, L.surface, "text"],
    ["浅·三级文本 / 应用底", L.textFaint, L.appBg, "text"],
    ["浅·三级文本 / 卡片", L.textFaint, L.surface, "text"],
    ["浅·边框(默认) / 应用底", lightBorderOnAppBg, L.appBg, "ui"],
    ["浅·边框(强) / 应用底", lightBorderStrongOnAppBg, L.appBg, "ui"],
    ["浅·品牌紫填充 / 应用底", L.brandPurple, L.appBg, "ui"],
    ["浅·主按钮：白字 / 紫底", "#FFFFFF", L.brandPurple, "text"],
    ["浅·主按钮：深墨字 / 紫底", L.textStrong, L.brandPurple, "text"],
    ["浅·紫 ink 小字 / 卡片", L.brandPurpleInk, L.surface, "text"],
    ["浅·紫 ink 小字 / 应用底", L.brandPurpleInk, L.appBg, "text"],
    ["浅·绿高亮底：深墨字", L.textStrong, L.brandLime, "text"],
    ["浅·绿 ink 小字 / 卡片", L.brandLimeInk, L.surface, "text"],
    ["浅·绿 ink 小字 / 应用底", L.brandLimeInk, L.appBg, "text"],
    ["浅·危险文本 / 卡片", L.danger, L.surface, "text"],
    ["浅·成功文本 / 卡片", L.success, L.surface, "text"],
    ["浅·警告文本 / 卡片", L.warning, L.surface, "text"],
    ["浅·信息文本 / 卡片", L.info, L.surface, "text"],

    // ── 深色 ──
    ["深·主文本 / 应用底", D.textStrong, D.appBg, "text"],
    ["深·主文本 / 卡片", D.textStrong, D.surface, "text"],
    ["深·三级文本 / 应用底", D.textFaint, D.appBg, "text"],
    ["深·品牌紫填充 / 应用底", D.brandPurple, D.appBg, "ui"],
    ["深·主按钮：白字 / 紫底", "#FFFFFF", D.brandPurple, "text"],
    ["深·绿高亮底：深墨字", "#172000", D.brandLime, "text"],
    ["深·绿文本 / 应用底", D.brandLime, D.appBg, "text"],
  ];
}

const THRESHOLD = { text: 4.5, ui: 3 };

function main() {
  const rows = buildCases().map(([label, fg, bg, kind]) => {
    const ratio = contrastRatio(fg, bg);
    const need = THRESHOLD[kind];
    return { label, fg, bg, kind, ratio, need, pass: ratio >= need };
  });

  const pad = (s, n) => String(s).padEnd(n, " ");
  console.log(
    pad("组合", 30) + pad("前景", 10) + pad("背景", 10) + pad("档位", 8) + pad("实测", 8) + "结果",
  );
  console.log("-".repeat(76));
  for (const r of rows) {
    console.log(
      pad(r.label, 30) +
        pad(r.fg, 10) +
        pad(r.bg, 10) +
        pad(`${r.need}:1`, 8) +
        pad(r.ratio.toFixed(2) + ":1", 8) +
        (r.pass ? "PASS" : "FAIL"),
    );
  }
  const failed = rows.filter((r) => !r.pass);
  console.log("-".repeat(76));
  console.log(`共 ${rows.length} 组，失败 ${failed.length} 组`);
  if (failed.length) {
    for (const f of failed) {
      console.log(`  ✗ ${f.label}: ${f.ratio.toFixed(2)} < ${f.need}`);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
