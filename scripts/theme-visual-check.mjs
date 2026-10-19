/**
 * 主题视觉体检：白天 / 黑夜 / 跟随系统 三态截图 + 切换器交互。
 *
 * 用法：node scripts/theme-visual-check.mjs [--out 目录] [--url 地址]
 *
 * 📌 为什么要跑这个而不是只看代码：
 * 主题相关的失效几乎全是**视觉**的（白底白字、Logo 消失、描边过淡），
 * 编译和类型检查都发现不了。必须有截图才算验证过。
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const URL = getArg("--url", "http://localhost:3000");
const OUT = resolve(getArg("--out", "outputs/theme-visual-check"));
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  // 1) 全新会话（清除所有存储）→ 应该落到深色模式（默认）
  await page.goto(URL, { waitUntil: "load" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);

  // 首页有阻断式公告 + 首充横幅，不关掉的话后面所有点击都会被拦截层吃掉
  for (const name of ["我知道了", "立即充值", "关闭"]) {
    const btn = page.getByRole("button", { name: new RegExp(name) });
    for (let i = 0; i < 3 && (await btn.count()) > 0 && (await btn.first().isVisible()); i++) {
      await btn.first().click().catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  await page.waitForTimeout(800);

  // 等待 React ThemeProvider 的 useEffect 执行完成
  await page.waitForSelector("#root > *", { state: "attached", timeout: 5000 });
  await page.waitForTimeout(500); // 再等一个渲染周期

  const initial = await page.evaluate(() => ({
    classes: document.documentElement.className,
    colorScheme: document.documentElement.style.colorScheme,
    stored: localStorage.getItem("theme-mode"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  console.log("首访解析结果:", JSON.stringify(initial));
  await page.screenshot({ path: `${OUT}/01-home-dark-firstvisit.png` });

  // 2) 打开切换器菜单
  const trigger = page.locator('button[aria-label="主题模式"]');
  if ((await trigger.count()) === 0) {
    console.error("✗ 没找到 [aria-label=主题模式] 按钮 —— 切换器没挂上");
  } else {
    await trigger.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/02-switcher-menu-light.png` });

    // 3) 切到黑夜
    await page.getByRole("menuitemradio", { name: /黑夜模式/ }).click();
    await page.waitForTimeout(900);
    const dark = await page.evaluate(() => ({
      classes: document.documentElement.className,
      stored: localStorage.getItem("theme-mode"),
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    console.log("切黑夜后:", JSON.stringify(dark));
    await page.screenshot({ path: `${OUT}/03-home-dark.png` });

    // 4) 切到跟随系统
    await trigger.click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitemradio", { name: /跟随系统/ }).click();
    await page.waitForTimeout(600);
    const sys = await page.evaluate(() => ({
      classes: document.documentElement.className,
      stored: localStorage.getItem("theme-mode"),
    }));
    console.log("切跟随系统后:", JSON.stringify(sys));
    await page.screenshot({ path: `${OUT}/04-home-system.png` });

    // 5) 刷回白天并下拉看灵感区
    await trigger.click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitemradio", { name: /白天模式/ }).click();
    await page.waitForTimeout(900);
  }

  // 先滚动到灵感区域（大约 1000px）
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/05-inspiration-light.png` });
  
  // 再滚动到最底部
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/06-bottom-light.png` });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  await browser.close();

  const realErrors = errors.filter(
    (e) => !/favicon|net::ERR_|Failed to load resource|WebSocket|ERR_CONNECTION/.test(e),
  );
  if (realErrors.length) {
    console.log("\n⚠️ 页面报错（已过滤网络噪音）:");
    for (const e of realErrors.slice(0, 10)) console.log("  " + e);
  } else {
    console.log("\n✓ 无页面报错");
  }
  console.log("截图目录:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
