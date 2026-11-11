import { chromium } from "playwright";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
  localStorage.setItem("theme-mode", "light");
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

const snap = async (label) => {
  const data = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const box = el => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    const root = q("[data-artx-canvas-root]");
    const rf = q(".react-flow");
    const vp = q(".react-flow__viewport");
    const bg = q(".react-flow__background");
    const pane = q(".react-flow__pane");
    const empty = [...document.querySelectorAll("[data-artx-canvas-root] *")].find(e => /上传图片/.test(e.textContent || "") && e.children.length === 0);
    const m = vp ? new DOMMatrix(getComputedStyle(vp).transform) : null;
    return {
      root: box(root), rootBg: root && getComputedStyle(root).backgroundColor,
      rf: box(rf), rfBg: rf && getComputedStyle(rf).backgroundColor, rfStyle: rf && rf.getAttribute("style"),
      pane: box(pane), bg: box(bg),
      vp: m ? { x: Math.round(m.e), y: Math.round(m.f), z: +m.a.toFixed(4) } : null,
      emptyLabel: box(empty),
      innerH: window.innerHeight,
    };
  });
  console.log(label, JSON.stringify(data));
};
await snap("EXPANDED ");
await page.getByRole("button", { name: "收起对话框" }).first().click();
await page.waitForTimeout(700);
await snap("COLLAPSED");
await page.getByRole("button", { name: "展开对话框" }).first().click();
await page.waitForTimeout(700);
await snap("REEXPAND ");
await browser.close();
