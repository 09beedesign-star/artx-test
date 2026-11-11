import { chromium } from "playwright";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    "artx-auth-session",
    JSON.stringify({ token: "probe-token", user: { id: "probe-user", username: "probe" } })
  );
});
const page = await context.newPage();
await page.route("**/api/**", route => {
  if (route.request().url().includes("/api/auth/me")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }),
    });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});
await page.goto("http://localhost:3000/workspace", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
const btn = page.getByRole("button", { name: /开始创作/ }).first();
await btn.screenshot({ path: "/tmp/start-create-button.png" });
const box = await btn.boundingBox();
const label = await btn.innerText();
console.log(JSON.stringify({ box, label }, null, 2));
await page.screenshot({ path: "/tmp/workspace-before.png" });
await browser.close();
