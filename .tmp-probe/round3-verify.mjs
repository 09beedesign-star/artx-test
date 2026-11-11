import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const feed = readFileSync("/tmp/inspiration-900.json", "utf8");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
  localStorage.setItem("theme-mode", "light");
});
const page = await ctx.newPage();
await page.route("**/api/**", r => {
  const u = r.request().url();
  if (u.includes("/api/auth/me")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) });
  if (u.includes("/api/inspiration/references")) return r.fulfill({ status: 200, contentType: "application/json", body: feed });
  return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

// ── 0) 先建一块画板，工作台才有「未归类画板」卡片 ──
await page.goto("http://localhost:3000/workspace", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(1800);

// ── 1) 工作台卡片菜单 ──
await page.goto("http://localhost:3000/workspace", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
const more = page.getByRole("button", { name: "更多操作" }).first();
console.log("more buttons", await page.getByRole("button", { name: "更多操作" }).count());
await more.scrollIntoViewIfNeeded().catch(() => {});
await more.click();
await page.waitForTimeout(220);
const menu = await page.evaluate(() => {
  const el = document.querySelector("[data-card-menu]");
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const items = [...el.querySelectorAll("button")].map(b => b.textContent.trim());
  const center = document.elementFromPoint(r.x + r.width / 2, r.y + 20);
  return {
    found: true,
    parentIsBody: el.parentElement === document.body,
    position: s.position,
    top: Math.round(r.top), left: Math.round(r.left),
    width: Math.round(r.width), height: Math.round(r.height),
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    items,
    topmostIsMenu: el.contains(center),
  };
});
console.log("MENU", JSON.stringify(menu));
await page.screenshot({ path: "/tmp/r3-menu.png", clip: { x: Math.max(0, menu.left - 240), y: Math.max(0, menu.top - 150), width: 480, height: Math.min(430, 900 - Math.max(0, menu.top - 150)) } });
await page.keyboard.press("Escape").catch(()=>{});
await page.mouse.click(20, 200);

// ── 2) 进画布，测收起动画 ──
await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(2600);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(()=>{}); await page.waitForTimeout(110); }
const before = await page.evaluate(() => {
  const root = document.querySelector("[data-artx-canvas-root]");
  const rf = document.querySelector(".react-flow");
  return { rootBg: getComputedStyle(root).backgroundColor, rfBg: getComputedStyle(rf).backgroundColor };
});
console.log("BG", JSON.stringify(before));
const frames = await page.evaluate(async () => {
  const label = () => [...document.querySelectorAll("[data-artx-canvas-root] *")]
    .find(e => /上传图片/.test(e.textContent || "") && e.children.length === 0);
  const aside = document.querySelector(".artx-canvas-composer");
  const btn = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "收起对话框");
  const out = [];
  const t0 = performance.now();
  btn.click();
  await new Promise(res => {
    const tick = () => {
      const el = label();
      out.push({
        t: Math.round(performance.now() - t0),
        x: el ? Math.round(el.getBoundingClientRect().x) : null,
        asideLeft: Math.round(aside.getBoundingClientRect().left),
      });
      if (performance.now() - t0 < 520) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  return out;
});
const xs = frames.map(f => f.x).filter(v => v !== null);
const first = xs[0], last = xs[xs.length - 1];
const maxStep = Math.max(...xs.slice(1).map((v, i) => Math.abs(v - xs[i])));
const distinct = new Set(xs).size;
const overshoot = Math.max(...xs) > last + 2;
console.log("ANIM", JSON.stringify({ frames: frames.length, first, last, maxStep, distinctPositions: distinct, overshoot }));
console.log("TRACE", frames.filter((f, i) => i % 4 === 0).map(f => `${f.t}:${f.x}/${f.asideLeft}`).join(" "));

// ── 3) 灵感模板弹窗 ──
await page.getByRole("button", { name: "展开对话框" }).first().click().catch(()=>{});
await page.waitForTimeout(500);
const inspirationBtn = page.locator('[title="灵感模板"], [aria-label="灵感模板"]').first();
console.log("inspiration entry", await inspirationBtn.count());
if (await inspirationBtn.count()) {
  await inspirationBtn.click();
  await page.waitForTimeout(1400);
  const dlg = await page.evaluate(() => {
    const el = document.querySelector("[data-inspiration-prompt-dialog]");
    if (!el) return { found: false };
    return {
      found: true,
      heading: el.querySelector("h2")?.textContent.trim(),
      cards: el.querySelectorAll("article").length,
      loadMore: [...el.querySelectorAll("button")].map(b => b.textContent.trim()).filter(t => t.includes("加载更多")),
    };
  });
  console.log("DIALOG", JSON.stringify(dlg));
  const lm = page.getByRole("button", { name: /加载更多/ }).first();
  if (await lm.count()) {
    await lm.click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const el = document.querySelector("[data-inspiration-prompt-dialog]");
      return { cards: el.querySelectorAll("article").length, label: [...el.querySelectorAll("button")].map(b=>b.textContent.trim()).find(t=>t.includes("加载更多")) };
    });
    console.log("AFTER_MORE", JSON.stringify(after));
  }
  await page.screenshot({ path: "/tmp/r3-inspiration.png" });
}
await browser.close();
