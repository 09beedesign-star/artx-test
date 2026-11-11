import { chromium } from "playwright";

const theme = process.env.PROBE_THEME || "light";
const routes = [
  "/ecommerce-canvas/history",
  "/ecommerce-canvas/templates",
  "/ecommerce-canvas/templates/1",
];
const browser = await chromium.launch();
for (const route of routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(t => {
    localStorage.setItem("theme-mode", t);
    localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
  }, theme);
  const page = await ctx.newPage();
  await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
    ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
    : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`http://localhost:3000${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const found = await page.evaluate(() => {
    const els = [...document.querySelectorAll("a, button")].filter(el => /返回/.test(el.innerText || ""));
    return els.map(el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: el.innerText.trim().slice(0, 30),
        bg: s.backgroundColor,
        color: s.color,
        border: s.borderColor,
        radius: s.borderRadius,
        font: s.fontSize,
        size: { w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
  });
  console.log(theme, route, JSON.stringify(found));
  const first = page.locator("a, button").filter({ hasText: /← 返回/ }).first();
  if (await first.count()) {
    await first.screenshot({ path: `/tmp/ecom-back-${theme}-${route.split("/").filter(Boolean).join("-")}.png` }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
