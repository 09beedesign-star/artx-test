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
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(2500);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(()=>{}); await page.waitForTimeout(110); }
await page.addStyleTag({ content: `.artx-canvas-composer { transition: transform 360ms cubic-bezier(0.32,0.72,0,1) !important; }` });
await page.getByRole("button", { name: "收起对话框" }).first().click();
await page.waitForTimeout(800);
const out = await page.evaluate(async () => {
  const ov = () => document.querySelector('[data-testid="canvas-empty-state-overlay"]');
  const btn = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "展开对话框");
  const rows = []; const t0 = performance.now(); btn.click();
  await new Promise(res => { const tick = () => {
    const o = ov();
    if (o) {
      const or = o.getBoundingClientRect();
      const b = o.querySelector("button").getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(o).transform);
      rows.push({ t: Math.round(performance.now()-t0), ox: Math.round(or.x), ow: Math.round(or.width), tf: Math.round(m.e), bx: Math.round(b.x), delta: Math.round(b.x - or.x) });
    }
    if (performance.now()-t0 < 220) requestAnimationFrame(tick); else res();
  }; requestAnimationFrame(tick); });
  return rows;
});
console.log(out.map(r=>`${r.t}: ovX=${r.ox} ovW=${r.ow} tf=${r.tf} btnX=${r.bx} delta=${r.delta}`).join("\n"));
await browser.close();
