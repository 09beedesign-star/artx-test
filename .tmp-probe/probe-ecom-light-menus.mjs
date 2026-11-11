import { chromium } from "playwright";

const theme = process.env.PROBE_THEME || "light";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(t => {
  localStorage.setItem("theme-mode", t);
  localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
}, theme);
const page = await ctx.newPage();
await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
  ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
  : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
await page.goto("http://localhost:3000/ecommerce-canvas/product", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

console.log("theme class:", await page.evaluate(() => document.documentElement.className));

// ---------- 1. 生成模型下拉 ----------
const trigger = page.locator("div.nodrag.nopan > button").first();
console.log("model trigger count:", await page.locator("div.nodrag.nopan > button").count());
if (await trigger.count()) {
  console.log("model trigger text:", (await trigger.innerText()).trim());
  await trigger.click();
  await page.waitForTimeout(350);
  const model = await page.evaluate(() => {
    const scroller = document.querySelector(".model-selector-scroll");
    if (!scroller) return { error: "下拉没打开" };
    const panel = scroller.parentElement;
    const row = scroller.querySelector("button");
    const icon = row?.querySelector("[data-model-brand-icon] > *");
    const s = getComputedStyle(panel);
    const rs = row ? getComputedStyle(row) : null;
    const is = icon ? getComputedStyle(icon) : null;
    return {
      panelBg: s.backgroundColor,
      panelBorder: s.borderColor,
      panelShadow: s.boxShadow,
      rowColor: rs?.color,
      rowBg: rs?.backgroundColor,
      iconColor: is?.color,
      iconBg: is?.backgroundColor,
      rows: scroller.querySelectorAll("button").length,
      firstRowText: row?.innerText?.trim().slice(0, 60),
      // 品牌图标走 CSS mask，颜色落在 backgroundColor 上；白底上必须转成深色
      brandMasks: [...scroller.querySelectorAll("[data-model-brand-icon]")]
        .map(el => ({
          kind: el.getAttribute("data-model-brand-icon"),
          bg: el.firstElementChild ? getComputedStyle(el.firstElementChild).backgroundColor : null,
        }))
        .filter(x => !["auto", "image", "none"].includes(x.kind))
        .slice(0, 4),
    };
  });
  console.log("MODEL_POPOVER", JSON.stringify(model));
  await page.screenshot({ path: "/tmp/ecom-menu-model.png" });
  await page.mouse.click(1200, 700);
  await page.waitForTimeout(200);
}

// ---------- 2. 预设上拉菜单 ----------
const saveBtn = page.getByRole("button", { name: /保存预设/ });
if (await saveBtn.count()) {
  await saveBtn.first().click();
  await page.waitForTimeout(250);
}
const presetToggle = page.locator('[aria-label="我的预设参数"]');
console.log("preset toggle count:", await presetToggle.count());
if (await presetToggle.count()) {
  await presetToggle.first().click();
  await page.waitForTimeout(300);
  const preset = await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="ecommerce-preset-menu"]');
    if (!menu) return { error: "预设菜单没打开" };
    const s = getComputedStyle(menu);
    const updateBtn = [...menu.querySelectorAll("button")].find(b => b.innerText.includes("更新"));
    const us = updateBtn ? getComputedStyle(updateBtn) : null;
    const check = menu.querySelector("svg");
    return {
      menuBg: s.backgroundColor,
      menuBorder: s.borderColor,
      menuShadow: s.boxShadow,
      backdrop: s.backdropFilter,
      updateColor: us?.color,
      firstIconColor: check ? getComputedStyle(check).color : null,
      text: menu.innerText.replace(/\n/g, " | ").slice(0, 120),
    };
  });
  console.log("PRESET_MENU", JSON.stringify(preset));
  await page.screenshot({ path: "/tmp/ecom-menu-preset.png" });
}

await browser.close();
