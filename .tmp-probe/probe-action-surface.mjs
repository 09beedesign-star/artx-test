/**
 * 浏览器实测：全站可点击绿色 → 黑框黑字线框按钮
 * 浅/深双主题，读 computed style + 截图留证。
 * 同时验证「纯展示绿色」没被误伤。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const pass = [], fail = [];

function expectStyle(label, got, theme) {
  const dark = theme === "dark";
  const wantFg = dark ? "rgb(255, 255, 255)" : "rgb(22, 22, 22)";
  const wantBorder = dark ? "rgba(255, 255, 255, 0.55)" : "rgba(22, 22, 22, 0.55)";
  const ok = got.color === wantFg && got.borderColor === wantBorder && got.borderWidth === "1px";
  (ok ? pass : fail).push(`${theme}/${label}: fg=${got.color} border=${got.borderColor} ${got.borderWidth}`);
  console.log(`  ${ok ? "✅" : "❌"} ${label}: ${JSON.stringify(got)}`);
  return ok;
}

const readStyle = () => {
  const wrap = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 20),
      bg: s.backgroundColor,
      color: s.color,
      borderColor: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      radius: s.borderTopLeftRadius,
      w: Math.round(r.width), h: Math.round(r.height),
      visible: r.width > 0 && r.height > 0,
    };
  };
  const byText = (sel, txt) => [...document.querySelectorAll(sel)].find(e => (e.textContent || "").includes(txt));
  return {
    aiWrite: wrap(byText("button", "AI 帮写")),
    hint: wrap(document.querySelector('[data-testid="ecommerce-hint-first-template"]')),
    viewAll: wrap(document.querySelector('[data-testid="ecommerce-view-all-templates"]')),
    tabPost: wrap(document.querySelector('[data-testid="ecommerce-mode-tab-post"]')),
    tabProduct: wrap(document.querySelector('[data-testid="ecommerce-mode-tab-product"]')),
    homeMore: wrap(byText("button", "查看全部灵感模板")),
    useTemplate: wrap(byText("button", "使用此模板生成")),
    category: wrap(byText("button", "全部")),
  };
};

for (const theme of ["light", "dark"]) {
  for (const route of ["/ecommerce-canvas/post", "/ecommerce-canvas/templates/1", "/"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => {
      localStorage.setItem("theme-mode", t);
      localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
    }, theme);
    const page = await ctx.newPage();
    await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
      ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1700);

    const s = await page.evaluate(readStyle);
    console.log(`\n[${theme}] ${route}`);

    if (route === "/ecommerce-canvas/post") {
      if (s.aiWrite) expectStyle("AI 帮写", s.aiWrite, theme); else fail.push(`${theme}/AI帮写未找到`);
      if (s.hint) expectStyle("在右侧选择模板", s.hint, theme); else fail.push(`${theme}/提示按钮未找到`);
      if (s.viewAll) expectStyle("展示所有模板", s.viewAll, theme); else fail.push(`${theme}/展示所有模板未找到`);
      // 选中态必须是反相实心（不能和未选中同为线框）
      const sel = s.tabPost, unsel = s.tabProduct;
      if (sel && unsel) {
        const ok = sel.bg !== unsel.bg && sel.color !== unsel.color;
        (ok ? pass : fail).push(`${theme}/Tab选中态反相:${sel.bg}/${sel.color}`);
        console.log(`  ${ok ? "✅" : "❌"} Tab 选中态: bg=${sel.bg} fg=${sel.color} | 未选中: bg=${unsel.bg} fg=${unsel.color}`);
      } else fail.push(`${theme}/模式Tab未找到`);
      // 截图：左栏（两个用户截图里的元素）
      const left = page.locator("aside").first();
      if (await left.count()) {
        await left.screenshot({ path: `/tmp/action-surface-left-${theme}.png` }).catch(() => {});
      }
    }
    if (route === "/ecommerce-canvas/templates/1") {
      if (s.useTemplate) expectStyle("使用此模板生成", s.useTemplate, theme); else fail.push(`${theme}/使用此模板未找到`);
      // 纯展示：分类徽章仍应是绿色（没被误伤）
      const badge = await page.evaluate(() => {
        const el = [...document.querySelectorAll("span")].find(e => /商品|场景|风格|全部/.test(e.textContent || "") && getComputedStyle(e).color.includes("197"));
        return el ? getComputedStyle(el).color : null;
      });
      console.log(`  纯展示徽章颜色: ${badge}`);
    }
    if (route === "/") {
      if (s.homeMore) expectStyle("查看全部灵感模板", s.homeMore, theme); else fail.push(`${theme}/首页入口未找到`);
    }
    await ctx.close();
  }
}

await browser.close();
console.log("\n========== 汇总 ==========");
console.log(`PASS ${pass.length} / FAIL ${fail.length}`);
for (const f of fail) console.log("  ❌", f);
process.exit(fail.length ? 1 : 0);
