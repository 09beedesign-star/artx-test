import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
  localStorage.setItem("theme-mode", "light");
});
const page = await ctx.newPage();
await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
  : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.goto("http://localhost:3000/workspace", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(2500);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(()=>{}); await page.waitForTimeout(110); }
await page.getByRole("button", { name: "收起对话框" }).first().click();
await page.waitForTimeout(800);
const snap = async (label) => console.log(label, JSON.stringify(await page.evaluate(() => {
  const all = [...document.querySelectorAll("[data-artx-canvas-root] *")].filter(e => /上传图片/.test(e.textContent||"") && e.children.length===0);
  return all.map(e => ({ tag: e.tagName, cls: String(e.className||"").slice(0,30), txt: (e.textContent||"").slice(0,24), x: Math.round(e.getBoundingClientRect().x), parent: e.parentElement?.tagName }));
})));
await snap("COLLAPSED");
await page.getByRole("button", { name: "展开对话框" }).first().click();
await page.waitForTimeout(95);
await snap("EXPAND@95ms");
await page.waitForTimeout(500);
await snap("EXPANDED");
await browser.close();
