import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripSourceComments } from "../../../../shared/strip-source-comments";

/**
 * 【2026-11-10 用户需求】
 * 「订阅、充值与升级页面，所有的绿色系全部改为黑白色系，按钮变成黑色白字按钮」
 * 【2026-11-12 用户补充】
 * 「订阅页面当中微信和支付宝的支付方式的 LOGO 保持是彩色的，不是现在黑白的」
 *
 * 这一组断言锁的是**结果**：除品牌 logo 外，这页面上不再有任何绿色像素源；
 * 同时品牌 logo 必须真的是彩色的（不是把绿色删掉就完事）。
 */

const ROOT = resolve(__dirname, "../../");
const read = (rel: string) => stripSourceComments(readFileSync(resolve(ROOT, rel), "utf-8"));

/**
 * 计费相关的全部源码文件（页面 + 组件）。
 *
 * ⚠️ 必须连 `.ts` 一起收：主题色板是 `billing-theme.ts`，只收 `.tsx`
 * 会把它整份漏掉 —— 变异自证时抓到过一次（把 accent 改回荧光绿，
 * 7 条断言全绿），检测器看起来跑了，实际上一个绿值都没看过。
 *
 * 【2026-11-12】BRAND_LOGO_FILE 是**唯一**的绿色例外：用户要求微信 / 支付宝
 * logo 保持品牌彩色。排除不等于放过 —— 下面既有「例外必须真带品牌色」的
 * 正向断言，也有「排除名单不许偷偷变多」的反向断言。
 */
const BRAND_LOGO_FILE = "PaymentMethodLogo.tsx";
const BILLING_FILES = [
  ...readdirSync(resolve(__dirname))
    .filter(f => (f.endsWith(".tsx") || f.endsWith(".ts")) && !/\.test\.tsx?$/.test(f) && f !== BRAND_LOGO_FILE)
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

  it("⚠️ 除品牌 logo 外，计费相关文件里不得残留任何绿色值", () => {
    const offenders: string[] = [];
    for (const file of BILLING_FILES) {
      const greens = findGreens(read(file));
      if (greens.length) offenders.push(`${file}: ${[...new Set(greens)].join(", ")}`);
    }
    expect(
      offenders,
      "还有绿色残留 —— 按钮/卡片仍要求黑白，只有品牌 logo 例外",
    ).toEqual([]);

    // 排除名单不能靠「再塞几个文件进来」把上面的检测洗绿。
    const excluded = readdirSync(resolve(__dirname))
      .filter(f => (f.endsWith(".tsx") || f.endsWith(".ts")) && !/\.test\.tsx?$/.test(f))
      .filter(f => !BILLING_FILES.includes(`components/billing/${f}`));
    expect(excluded, "只允许排除品牌 logo 这一个文件").toEqual([BRAND_LOGO_FILE]);
  });

  it("微信/支付宝 logo 恒为品牌彩色，不随容器文字色变回黑白", () => {
    /**
     * 【2026-11-12 用户反转】上一轮要求整页黑白时把 fill 改成 currentColor，
     * 结果 logo 在黑底白字按钮上被洗成白色，compact 两处（套餐卡 / 充值按钮）
     * 连支付宝蓝也一起没了。用户明确要求恢复彩色。
     *
     * 断言走的是「结果」：绿色像素源真的存在于代码里（findGreens 自检过），
     * 而不是「注释里提到了绿色」—— read() 已剥注释。
     */
    const logo = read(`components/billing/${BRAND_LOGO_FILE}`);
    expect(findGreens(logo), "微信 logo 的品牌绿没回来").toContain("#07C160");
    expect(logo).toContain('"#1677FF"');
    // 四个出口共用唯一事实源，不能退回「两支各自写死 fill」。
    expect(logo).toContain("fill={fill}");
    expect(logo).not.toContain('fill="#07C160"');
    expect(logo).not.toContain('fill="#1677FF"');
    // currentColor 正是上一次把 logo 洗成黑白的原因。
    expect(logo).not.toContain("currentColor");
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
