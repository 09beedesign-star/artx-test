import { chromium } from "playwright";

const theme = process.env.PROBE_THEME || "light";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(t => {
  localStorage.setItem("theme-mode", t);
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
}, theme);
const page = await ctx.newPage();
await page.route("**/api/**", r => {
  const url = r.request().url();
  if (url.includes("/api/auth/me")) {
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) });
  }
  if (url.includes("/api/user/memory")) {
    const enabled = r.request().method() === "PUT";
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ document: { ecommerceMemoryEnabled: enabled, contextEnabled: false } }),
    });
  }
  return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});
await page.goto("http://localhost:3000/ecommerce-canvas/product", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const read = () => page.evaluate(() => {
  const box = document.querySelector('[data-testid="ecommerce-memory-notice"]');
  if (!box) return { error: "提示条没渲染" };
  const s = getComputedStyle(box);
  const brain = box.querySelector("svg");
  const label = box.querySelector("span.flex-1");
  const sw = box.querySelector('[data-testid="ecommerce-memory-switch"]');
  const sws = sw ? getComputedStyle(sw) : null;
  const thumb = sw?.querySelector("[data-slot='switch-thumb']");
  const ts = thumb ? getComputedStyle(thumb) : null;
  return {
    background: s.backgroundColor,
    border: s.borderColor,
    radius: s.borderRadius,
    boxColor: s.color,
    labelColor: label ? getComputedStyle(label).color : null,
    labelText: label?.innerText?.trim(),
    brainColor: brain ? getComputedStyle(brain).color : null,
    switchSize: sw?.getAttribute("data-size"),
    switchState: sw?.getAttribute("data-state"),
    switchBg: sws?.backgroundColor,
    switchRect: sw ? { w: Math.round(sw.getBoundingClientRect().width), h: Math.round(sw.getBoundingClientRect().height) } : null,
    thumbBg: ts?.backgroundColor,
  };
});

console.log("MEMORY_NOTICE", theme, JSON.stringify(await read()));
await page.screenshot({ path: `/tmp/ecom-memory-switch-${theme}.png` });

const sw = page.locator('[data-testid="ecommerce-memory-switch"]');
if (await sw.count()) {
  await sw.first().click();
  await page.waitForTimeout(700);
  console.log("AFTER_TOGGLE", theme, JSON.stringify(await read()));
  await page.screenshot({ path: `/tmp/ecom-memory-switch-${theme}-on.png` });
}

await browser.close();
