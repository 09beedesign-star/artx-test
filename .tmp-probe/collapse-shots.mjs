import { chromium } from "playwright";
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((th) => {
    localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
    localStorage.setItem("theme-mode", th);
  }, theme);
  const page = await ctx.newPage();
  await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
    ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
    : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto("http://localhost:3000/workspace", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /开始创作/ }).first().click();
  await page.waitForTimeout(2600);
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(()=>{}); await page.waitForTimeout(120); }
  await page.screenshot({ path: `/tmp/cs-${theme}-0-expanded.png` });
  const btn = page.getByRole("button", { name: "收起对话框" }).first();
  await btn.click();
  await page.waitForTimeout(90);
  await page.screenshot({ path: `/tmp/cs-${theme}-1-mid.png` });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/cs-${theme}-2-collapsed.png` });
  // 再展开，抓中间帧
  const expand = page.getByRole("button", { name: "展开对话框" }).first();
  console.log(theme, "expand count", await expand.count());
  if (await expand.count()) {
    await expand.click();
    await page.waitForTimeout(90);
    await page.screenshot({ path: `/tmp/cs-${theme}-3-openmid.png` });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/tmp/cs-${theme}-4-expanded.png` });
  }
  await ctx.close();
}
await browser.close();
