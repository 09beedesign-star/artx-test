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
await page.waitForTimeout(2600);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(()=>{}); await page.waitForTimeout(120); }

const btn = page.getByRole("button", { name: "收起对话框" }).first();
console.log("collapse button count:", await btn.count());
const before = await page.evaluate(() => {
  const root = document.querySelector("[data-artx-canvas-root]");
  const rf = document.querySelector(".react-flow");
  const vp = document.querySelector(".react-flow__viewport");
  const aside = document.querySelector(".artx-canvas-composer");
  return {
    root: { w: root.getBoundingClientRect().width, bg: getComputedStyle(root).backgroundColor },
    rf: { w: rf.getBoundingClientRect().width, bg: getComputedStyle(rf).backgroundColor, styleW: rf.style.width },
    vp: { transform: getComputedStyle(vp).transform },
    aside: { w: aside.getBoundingClientRect().width, transform: getComputedStyle(aside).transform, transition: getComputedStyle(aside).transition },
  };
});
console.log("BEFORE", JSON.stringify(before, null, 1));

// 逐帧采样
const frames = await page.evaluate(async () => {
  const root = document.querySelector("[data-artx-canvas-root]");
  const rf = document.querySelector(".react-flow");
  const vp = document.querySelector(".react-flow__viewport");
  const aside = document.querySelector(".artx-canvas-composer");
  const btn = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "收起对话框");
  const out = [];
  const t0 = performance.now();
  btn.click();
  await new Promise(res => {
    const tick = () => {
      const a = aside.getBoundingClientRect();
      const r = rf.getBoundingClientRect();
      const v = new DOMMatrix(getComputedStyle(vp).transform);
      out.push({
        t: Math.round(performance.now() - t0),
        rfW: Math.round(r.width),
        asideLeft: Math.round(a.left),
        vpX: Math.round(v.e),
        vpY: Math.round(v.f),
        vpScale: +v.a.toFixed(3),
      });
      if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  return out;
});
console.log("FRAMES", frames.length);
console.log(frames.map(f => `${f.t}ms rf=${f.rfW} asideLeft=${f.asideLeft} vpX=${f.vpX} vpY=${f.vpY} z=${f.vpScale}`).join("\n"));
await browser.close();
