/**
 * 浏览器实测：电商画布返回按钮（四处出口）+ 模式切换 Tab 圆角统一
 * 深浅两主题各跑一遍，读 computed style，并截图留证。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const routes = [
  { path: "/ecommerce-canvas/post", label: "工作台", expect: "tab" },
  { path: "/ecommerce-canvas/history", label: "生成记录", expect: "back" },
  { path: "/ecommerce-canvas/templates", label: "模板库", expect: "back" },
  { path: "/ecommerce-canvas/templates/1", label: "模板详情", expect: "back" },
];

const browser = await chromium.launch();
const summary = { pass: [], fail: [] };

for (const theme of ["light", "dark"]) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => {
      localStorage.setItem("theme-mode", t);
      localStorage.setItem("artx-auth-session", JSON.stringify({ token: "t", user: { id: "probe-user", username: "probe" } }));
    }, theme);
    const page = await ctx.newPage();
    await page.route("**/api/**", r => r.request().url().includes("/api/auth/me")
      ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }) })
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);

    // ---- 返回按钮：读所有含「返回」的 a/button ----
    const backs = await page.evaluate(() => {
      return [...document.querySelectorAll("a, button")]
        .filter(el => /返回/.test(el.textContent || ""))
        .map(el => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent || "").trim().slice(0, 20),
            bg: s.backgroundColor,
            color: s.color,
            border: s.borderTopColor,
            radius: s.borderRadius,
            w: Math.round(r.width),
            h: Math.round(r.height),
            visible: r.width > 0 && r.height > 0,
          };
        });
    });

    // ---- Tab 圆角：容器 + 两个 tab ----
    const tabs = await page.evaluate(() => {
      const post = document.querySelector('[data-testid="ecommerce-mode-tab-post"]');
      const product = document.querySelector('[data-testid="ecommerce-mode-tab-product"]');
      if (!post) return null;
      const container = post.parentElement;
      const read = el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          radius: s.borderTopLeftRadius,
          bg: s.backgroundColor,
          w: Math.round(r.width),
          h: Math.round(r.height),
          selected: el.getAttribute("aria-selected"),
        };
      };
      return { container: read(container), post: read(post), product: read(product) };
    });

    console.log(`\n[${theme}] ${route.label} (${route.path})`);
    if (backs.length) {
      for (const b of backs) {
        console.log("  返回按钮:", JSON.stringify(b));
        const ok = b.bg === "rgb(22, 22, 22)" && b.color === "rgb(255, 255, 255)";
        (ok ? summary.pass : summary.fail).push(`${theme}/${route.label}/back:${b.text}:bg=${b.bg},color=${b.color}`);
      }
    } else if (route.expect === "back") {
      console.log("  ⚠️ 未找到返回按钮");
      summary.fail.push(`${theme}/${route.label}/back:未找到元素`);
    }
    if (tabs) {
      console.log("  Tab 容器:", JSON.stringify(tabs.container));
      console.log("  Tab 项  :", JSON.stringify(tabs.post));
      const same = tabs.container.radius === tabs.post.radius
        && tabs.container.radius === tabs.product.radius;
      console.log(`  圆角一致: ${same ? "✅" : "❌"} (容器 ${tabs.container.radius} / 选中 ${tabs.post.radius})`);
      (same ? summary.pass : summary.fail).push(`${theme}/${route.label}/tab-radius:${tabs.container.radius}:${tabs.post.radius}`);
    }

    // 截图：返回按钮 / Tab 区域
    const slug = `${theme}-${route.label}`;
    if (backs.length) {
      const loc = page.locator("a, button").filter({ hasText: /返回/ }).first();
      if (await loc.count() && await loc.isVisible()) {
        await loc.screenshot({ path: `/tmp/ecom-back-${slug}.png` }).catch(e => console.log("  截图失败:", e.message.slice(0, 60)));
      }
    }
    if (tabs) {
      const container = page.locator('[data-testid="ecommerce-mode-tab-post"]').locator("..");
      await container.screenshot({ path: `/tmp/ecom-tab-${slug}.png` }).catch(e => console.log("  Tab截图失败:", e.message.slice(0, 60)));
    }
    await ctx.close();
  }
}
await browser.close();

console.log("\n========== 汇总 ==========");
console.log(`PASS ${summary.pass.length} / FAIL ${summary.fail.length}`);
for (const f of summary.fail) console.log("  ❌", f);
process.exit(summary.fail.length ? 1 : 0);
