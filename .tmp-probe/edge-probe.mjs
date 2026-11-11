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
await page.getByRole("button", { name: "收起对话框" }).first().click();
await page.waitForTimeout(700);
const info = await page.evaluate(() => {
  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { x, y, el: null };
    const chain = [];
    let cur = el;
    for (let i = 0; i < 5 && cur; i++) {
      const s = getComputedStyle(cur);
      chain.push({ tag: cur.tagName, cls: (cur.className || "").toString().slice(0, 70), bg: s.backgroundColor });
      cur = cur.parentElement;
    }
    return { x, y, chain };
  };
  return [probe(700, 890), probe(700, 870), probe(700, 800), probe(1040, 500), probe(1400, 500)];
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
