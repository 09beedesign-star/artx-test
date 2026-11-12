/**
 * 只读探针：量电商工作台 Tab 容器与选中项的 computed border-radius
 * 用法: node probe-ecom-tab-ab.mjs <label>
 */
import { chromium } from "playwright";

const label = process.argv[2] || "?";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("theme-mode", "light");
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
});
const page = await ctx.newPage();
await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
  : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.goto("http://localhost:3000/ecommerce-canvas/post", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const r = await page.evaluate(() => {
  const post = document.querySelector('[data-testid="ecommerce-mode-tab-post"]');
  if (!post) return null;
  const container = post.parentElement;
  return {
    container: getComputedStyle(container).borderTopLeftRadius,
    selected: getComputedStyle(post).borderTopLeftRadius,
    cls: post.className,
  };
});
console.log(`${label}\t${r ? JSON.stringify(r) : "未找到Tab"}`);
await browser.close();
