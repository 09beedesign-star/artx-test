/**
 * 浏览器实测：第四处返回按钮（工作台「生成结果」区）
 *
 * 该按钮只在 showResults = results.length > 0 || generating || interrupted 时渲染，
 * 直接进工作台看不到。这里通过打桩一条历史记录 → 点「查看结果」把结果灌回工作台，
 * 让第四处出口真实渲染出来，再读 computed style + 截图。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
// 1x1 透明 PNG，只为了让 images.length > 0，不看画面
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const browser = await chromium.launch();
const fails = [];

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(({ t, pixel }) => {
    localStorage.setItem("theme-mode", t);
    localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
    const entry = {
      id: "probe-entry-1",
      mode: "post",
      model: "image2.5 medium",
      count: 1,
      credits: 180,
      templateName: "探针模板",
      backgroundName: "",
      prompt: "浏览器实测打桩记录",
      images: [pixel],
      createdAt: Date.now(),
    };
    const payload = JSON.stringify([entry]);
    // 账号 id 可能解析成 probe-user 或 guest，两个 key 都写
    localStorage.setItem("artx:ecommerce-canvas-history:probe-user", payload);
    localStorage.setItem("artx:ecommerce-canvas-history:guest", payload);
  }, { t: theme, pixel: PIXEL });

  const page = await ctx.newPage();
  await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
    ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
    : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await page.goto(`${BASE}/ecommerce-canvas/history`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const openBtn = page.getByRole("button", { name: "查看结果" });
  const count = await openBtn.count();
  console.log(`[${theme}] 历史记录「查看结果」按钮数: ${count}`);
  if (!count) {
    fails.push(`${theme}: 打桩未生效，没有历史记录条目`);
    await ctx.close();
    continue;
  }
  await openBtn.first().click();
  await page.waitForTimeout(1200);
  console.log(`[${theme}] 点击后 URL: ${page.url()}`);

  const backs = await page.evaluate(() => {
    return [...document.querySelectorAll("button, a")]
      .filter(el => /返回/.test(el.textContent || ""))
      .map(el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          text: (el.textContent || "").trim().slice(0, 20),
          bg: s.backgroundColor,
          color: s.color,
          border: s.borderTopColor,
          radius: s.borderRadius,
          visible: r.width > 0 && r.height > 0,
        };
      });
  });
  console.log(`[${theme}] 生成结果区返回按钮:`, JSON.stringify(backs));

  const target = backs.find(b => /返回模板库|返回$/.test(b.text));
  if (!target) {
    fails.push(`${theme}: 第四处返回按钮未渲染`);
  } else if (target.bg !== "rgb(22, 22, 22)" || target.color !== "rgb(255, 255, 255)") {
    fails.push(`${theme}: 第四处样式不符 bg=${target.bg} color=${target.color}`);
  } else {
    console.log(`[${theme}] ✅ 第四处返回按钮黑底白字生效`);
  }

  // 截图：生成结果区顶栏（含返回按钮）
  const header = page.locator("text=生成结果").locator("..");
  if (await header.count()) {
    await header.screenshot({ path: `/tmp/ecom-back-results-${theme}.png` }).catch(e => console.log("  截图失败:", e.message.slice(0, 60)));
  }
  await ctx.close();
}
await browser.close();

console.log("\n========== 汇总 ==========");
console.log(`FAIL ${fails.length}`);
for (const f of fails) console.log("  ❌", f);
process.exit(fails.length ? 1 : 0);
