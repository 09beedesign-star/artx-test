/**
 * 绿色系统验证脚本
 * 访问 /green-test 页面并截图
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "outputs", "green-test");
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// 屏蔽 API 请求错误
page.on("console", (msg) => {
  const txt = msg.text();
  if (!txt.includes("CORS") && !txt.includes("net::ERR")) {
    console.log(`console: ${txt}`);
  }
});

console.log("✅ 启动浏览器");

// 访问测试页面
await page.goto("http://localhost:3000/green-test", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

console.log("📸 白色模式截图...");
await page.screenshot({ path: join(OUT, "01-green-light.png"), fullPage: true });

// 切换到深色模式
await page.evaluate(() => {
  document.documentElement.classList.remove("light");
  document.documentElement.classList.add("dark");
});
await page.waitForTimeout(300);

console.log("📸 深色模式截图...");
await page.screenshot({ path: join(OUT, "02-green-dark.png"), fullPage: true });

// 截图首页按钮（白色模式）
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

console.log("📸 首页白色模式...");
await page.screenshot({ path: join(OUT, "03-homepage-light.png") });

// 切换到深色
await page.evaluate(() => {
  document.documentElement.classList.remove("light");
  document.documentElement.classList.add("dark");
});
await page.waitForTimeout(300);

console.log("📸 首页深色模式...");
await page.screenshot({ path: join(OUT, "04-homepage-dark.png") });

await browser.close();

console.log(`\n✅ 截图完成！\n输出目录: ${OUT}\n`);
console.log("绿色系统变量：");
console.log("  --color-brand-green        按钮背景（中等绿）");
console.log("  --color-brand-green-light  标签背景（浅绿）");
console.log("  --color-brand-green-text   文字和图标（深绿）");
