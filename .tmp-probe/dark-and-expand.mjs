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
const bg = await page.evaluate(() => {
  const root = document.querySelector("[data-artx-canvas-root]");
  const rf = document.querySelector(".react-flow");
  return { rootBg: getComputedStyle(root).backgroundColor, rfBg: getComputedStyle(rf).backgroundColor };
});
console.log("DARK_BG", JSON.stringify(bg));
const sample = async (label) => await page.evaluate(async (label) => {
  const find = () => [...document.querySelectorAll("[data-artx-canvas-root] *")].find(e => /上传图片/.test(e.textContent || "") && e.children.length === 0);
  const btn = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === label);
  const out = []; const t0 = performance.now(); btn.click();
  await new Promise(res => { const tick = () => {
    const el = find(); out.push({ t: Math.round(performance.now()-t0), x: el ? Math.round(el.getBoundingClientRect().x) : null });
    if (performance.now()-t0 < 500) requestAnimationFrame(tick); else res();
  }; requestAnimationFrame(tick); });
  return out;
}, label);
const collapse = await sample("收起对话框");
await page.waitForTimeout(300);
const expand = await sample("展开对话框");
console.log("EXPAND_TRACE", expand.map(a=>`${a.t}:${a.x}`).join(" "));
for (const [name, arr] of [["collapse", collapse], ["expand", expand]]) {
  const xs = arr.map(a=>a.x).filter(v=>v!==null);
  console.log(name, JSON.stringify({ first: xs[0], last: xs.at(-1), maxStep: Math.max(...xs.slice(1).map((v,i)=>Math.abs(v-xs[i]))), distinct: new Set(xs).size, overshoot: name==="collapse" ? Math.max(...xs) > xs.at(-1)+2 : Math.min(...xs) < xs.at(-1)-2 }));
}
await browser.close();
