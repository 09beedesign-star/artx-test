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
await page.screenshot({ path: "/tmp/f0-collapsed.png", clip: { x: 100, y: 260, width: 900, height: 240 } });
await page.getByRole("button", { name: "展开对话框" }).first().click();
for (const [ms, name] of [[60,"f1"],[40,"f2"],[60,"f3"],[300,"f4"]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `/tmp/${name}.png`, clip: { x: 100, y: 260, width: 900, height: 240 } });
}
// 用 python 找白卡左边界，避免靠肉眼
await browser.close();
