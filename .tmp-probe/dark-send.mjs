import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
  localStorage.setItem("theme-mode", "dark");
});
const page = await ctx.newPage();
await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
  : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.goto("http://localhost:3000/workspace", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(2400);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(()=>{}); await page.waitForTimeout(150); }
const btn = page.getByRole("button", { name: "发送" }).first();
await btn.scrollIntoViewIfNeeded().catch(()=>{});
const box = await btn.boundingBox();
await page.screenshot({ path: "/tmp/dark-send-zoom.png", clip: { x: box.x - 40, y: box.y - 40, width: 120, height: 120 } });
await browser.close();
