/** 截图：首页发送键 / 画布输入区（浅色 + 深色，开关关 + 开） */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();

async function open(mode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(m => {
    localStorage.setItem(
      "artx-auth-session",
      JSON.stringify({ token: "probe-token", user: { id: "probe-user", username: "probe" } })
    );
    localStorage.setItem("theme-mode", m);
  }, mode);
  const page = await context.newPage();
  await page.route("**/api/**", route => {
    const url = route.request().url();
    if (url.includes("/api/auth/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return { context, page };
}

// 首页浅色
{
  const { context, page } = await open("light");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: "/tmp/shot-home-light.png" });
  await context.close();
}

for (const mode of ["light", "dark"]) {
  const { context, page } = await open(mode);
  await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: /开始创作/ }).first().click();
  await page.waitForTimeout(2400);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
  const pill = page.locator('[data-testid="composer-memory-switch"]').locator("..");
  await pill.screenshot({ path: `/tmp/shot-pill-off-${mode}.png` });
  await page.locator('[data-testid="composer-memory-switch"]').click();
  await page.waitForTimeout(900);
  await pill.screenshot({ path: `/tmp/shot-pill-on-${mode}.png` });
  // 输入区整块
  const shell = pill.locator("xpath=ancestor::div[3]");
  await shell.screenshot({ path: `/tmp/shot-composer-${mode}.png` }).catch(() => {});
  await page.screenshot({ path: `/tmp/shot-canvas-${mode}.png` });
  await context.close();
}

await browser.close();
console.log("ok");
