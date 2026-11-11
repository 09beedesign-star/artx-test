import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
});
const page = await ctx.newPage();
await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
  : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.goto("http://localhost:3000/ecommerce-canvas", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const btn = page.locator('[data-testid="ecommerce-generate"]');
console.log("count", await btn.count());
if (await btn.count()) {
  const box = await btn.first().boundingBox();
  const styles = await btn.first().evaluate(el => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, radius: s.borderRadius, text: el.innerText };
  });
  console.log(JSON.stringify({ box, styles }));
  await page.screenshot({ path: "/tmp/ecom-generate.png", clip: { x: Math.max(0, box.x - 120), y: Math.max(0, box.y - 40), width: 260, height: 120 } });
}
await page.screenshot({ path: "/tmp/ecom-full.png" });
await browser.close();
