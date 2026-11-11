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
await page.getByRole("button", { name: "收起对话框" }).first().click();
await page.waitForTimeout(700);
const out = await page.evaluate(async () => {
  const overlay = () => document.querySelector('[data-testid="canvas-empty-state-overlay"]');
  const btn = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "展开对话框");
  const rows = []; const t0 = performance.now(); btn.click();
  await new Promise(res => { const tick = () => {
    const ov = overlay();
    const label = ov ? [...ov.querySelectorAll("*")].find(e => /上传图片/.test(e.textContent||"") && e.children.length===0) : null;
    rows.push({
      t: Math.round(performance.now()-t0),
      right: ov ? getComputedStyle(ov).right : null,
      ovW: ov ? Math.round(ov.getBoundingClientRect().width) : null,
      x: label ? Math.round(label.getBoundingClientRect().x) : null,
      tag: label ? label.tagName + "." + String(label.className||"").slice(0,25) : null,
      btnX: label ? Math.round(label.closest("button").getBoundingClientRect().x) : null,
      btnW: label ? Math.round(label.closest("button").getBoundingClientRect().width) : null,
      btnT: label ? getComputedStyle(label.closest("button")).transform : null,
      hovered: label ? label.closest("button").matches(":hover") : null,
    });
    if (performance.now()-t0 < 260) requestAnimationFrame(tick); else res();
  }; requestAnimationFrame(tick); });
  return rows;
});
console.log(out.filter(r=>r.t>=55&&r.t<=200).map(r=>`${r.t}: right=${r.right} ovW=${r.ovW} x=${r.x} btnX=${r.btnX} btnW=${r.btnW} tf=${r.btnT} hov=${r.hovered}`).join("\n"));
await browser.close();
