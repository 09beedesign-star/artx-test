import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../../shared/strip-source-comments";

/**
 * 【2026-11-10 用户需求】
 * 「订阅、充值与升级页面，所有的绿色系全部改为黑白色系，按钮变成黑色白字按钮」
 *
 * 这一组断言锁的是**结果**：这页面上不再有任何绿色像素源。
 * 不是「某个变量改成了黑色」—— 那样只能证明我改了一个地方，
 * 证明不了页面上别处没有第二个绿色出口。
 */

const ROOT = resolve(__dirname, "../../");
const read = (rel: string) => stripSourceComments(readFileSync(resolve(ROOT, rel), "utf-8"));

/**
 * 计费相关的全部源码文件（页面 + 组件）。
 *
 * ⚠️ 必须连 `.ts` 一起收：主题色板是 `billing-theme.ts`，只收 `.tsx`
 * 会把它整份漏掉 —— 变异自证时抓到过一次（把 accent 改回荧光绿，
 * 7 条断言全绿），检测器看起来跑了，实际上一个绿值都没看过。
 */
const BILLING_FILES = [
  ...readdirSync(resolve(__dirname))
    .filter(f => (f.endsWith(".tsx") || f.endsWith(".ts")) && !/\.test\.tsx?$/.test(f))
    .map(f => `components/billing/${f}`),
  "pages/BillingPage.tsx",
  "pages/CreditsGuidePage.tsx",
];

/**
 * 绿色判定：不靠关键字，靠色值本身。
 *
 * ⚠️ 只搜 `C5ED47` 这种写法，换个等效色 `#c5ed47` / `rgb(197,237,71)` 就漏了。
 * 这里把十六进制和 rgb 两种写法都拆成通道再判色相。
 */
function hexChannels(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isGreenish(r: number, g: number, b: number) {
  // 荧光绿 / 微信绿 / 深橄榄绿 都落在这一片：绿通道明显压过红和蓝。
  return g > 90 && g > r + 25 && g > b + 35;
}

function findGreens(source: string) {
  const hits: string[] = [];
  for (const m of source.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const ch = hexChannels(m[1]);
    if (ch && isGreenish(...ch)) hits.push(m[0]);
  }
  for (const m of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    if (isGreenish(+m[1], +m[2], +m[3])) hits.push(m[0]);
  }
  return hits;
}

describe("计费页绿色系清零", () => {
  it("自检：检测器真的能认出绿色（否则下面全是空转）", () => {
    expect(findGreens("#C5ED47")).not.toEqual([]);
    expect(findGreens("rgba(197,237,71,0.24)")).not.toEqual([]);
    expect(findGreens("rgba(7, 193, 96, 0.14)")).not.toEqual([]);
    // 反向：中性色不能误报
    expect(findGreens("#161616")).toEqual([]);
    expect(findGreens("rgba(22,22,22,0.18)")).toEqual([]);
    expect(findGreens("rgba(255,255,255,0.10)")).toEqual([]);
  });

  it("⚠️ 计费相关文件里不得残留任何绿色值", () => {
    const offenders: string[] = [];
    for (const file of BILLING_FILES) {
      const greens = findGreens(read(file));
      if (greens.length) offenders.push(`${file}: ${[...new Set(greens)].join(", ")}`);
    }
    expect(
      offenders,
      "还有绿色残留 —— 用户要求这一页彻底黑白",
    ).toEqual([]);
  });

  it("⚠️ 微信 logo 的品牌绿必须彻底消失，改为跟随文字色", () => {
    /**
     * 用户说的是「所有绿色系」—— logo 也是绿色，不能例外。
     * 留一个绿点在页面上，整页黑白就不成立。
     *
     * 支付宝的品牌蓝保留：用户点名的是「绿色系」，蓝色不在范围内。
     * 但 compact（按钮内）必须也用 currentColor —— 蓝按钮上挂蓝图标等于隐形。
     */
    const logo = read("components/billing/PaymentMethodLogo.tsx");
    expect(logo, "微信的品牌绿还在").not.toContain("#07C160");
    expect(logo).toContain('"#1677FF"');
    expect(logo).toContain("currentColor");
    expect(logo).toContain("fill={fill}");
    // 不能退回「两个分支各自写死 fill」
    expect(logo).not.toContain('fill="#07C160"');
    expect(logo).not.toContain('fill="#1677FF"');
  });
});

describe("实心按钮：底和字必须成对", () => {
  it("主题里必须给出 solid / solidText 两个字段，且深色模式反相", () => {
    const theme = read("components/billing/billing-theme.ts");
    expect(theme).toContain("solid:");
    expect(theme).toContain("solidText:");
    /**
     * ⚠️ 深色模式下不能还是黑底：黑按钮压在 #222 面板上等于隐形。
     * 断言的是「反相」这个事实，不是具体色值。
     */
    expect(theme).toContain('solid: isDark ? "#F2F2F2" : "#161616"');
    expect(theme).toContain('solidText: isDark ? "#161616" : "#FFFFFF"');
  });

  it("⚠️⚠️ 所有 background: solid 的位置都必须同时指定 solidText", () => {
    /**
     * 这是这次最容易犯的错：换底不换字。
     * 黑底 + 原来的近黑色文字（#10130A / #171717 / #000）= 黑底黑字，零报错地消失。
     *
     * ⚠️ 判据要落在**同一个 style 对象内**（截到最近的 `}`），
     * 不能用整文件计数 —— 一条没有文字的纯色条（`style={{ background: solid }}`）
     * 也会被算进去，逼着人去给它塞一个没意义的 color。
     */
    const audit = (source: string) => {
      const bad: string[] = [];
      for (const m of source.matchAll(/background: solid/g)) {
        const tail = source.slice(m.index, m.index + 200).split("}")[0];
        const color = tail.match(/color:\s*([^,\n]+)/);
        if (!color) continue; // 纯色条，没有文字，不需要配文字色
        if (!color[1].includes("solidText")) bad.push(color[1].trim());
      }
      return bad;
    };

    const offenders: string[] = [];
    for (const file of BILLING_FILES) {
      const bad = audit(read(file));
      if (bad.length) offenders.push(`${file}: ${bad.join(" / ")}`);
    }
    expect(offenders, "有按钮只换了底、没换字").toEqual([]);

    // 自检：检测器真能抓到「黑底配近黑字」
    expect(audit('<div style={{ background: solid, color: "#10130A" }} />')).toEqual(['"#10130A"']);
    expect(audit("<div style={{ background: solid, color: solidText }} />")).toEqual([]);
  });

  it("旧的「绿底配近黑字」硬编码必须清除", () => {
    const theme = read("components/billing/billing-theme.ts");
    expect(theme).not.toContain("wechatGreen");
    // 名字叫 green 的字段装着黑色，下一个人会把它"修回去"。
    const source = BILLING_FILES.map(read).join("\n");
    expect(source).not.toContain("wechatGreen");
    expect(source).not.toContain('color: "#10130A"');
    expect(source).not.toContain('color: "#171717"');
  });
});

describe("积分指南页：强调色跟主题走", () => {
  it("accent / accentText 成对定义，且深色模式反相", () => {
    const page = read("pages/CreditsGuidePage.tsx");
    expect(page).toContain('const accent = isDark ? "#F2F2F2" : "#161616"');
    expect(page).toContain('const accentText = isDark ? "#161616" : "#FFFFFF"');
    // 反向：退回到写死的单一值就变红
    expect(page).not.toContain('const accent = "#C5ED47"');
  });
});
