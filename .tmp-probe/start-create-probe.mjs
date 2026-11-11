/**
 * 探针：工作台侧栏「开始创作」是否一键进画布。
 *
 * 判据（缺一不可）：
 * 1. 按钮文案是「开始创作」，页面上不存在「新创作」
 * 2. 点击后 URL 变成 /project/canvas-xxx
 * 3. 全程不出现「画板名称」表单（不再弹新建画布弹窗）
 * 4. localStorage 里真的多出一块画板
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const HISTORY_KEY = "artx:workspace-project-history";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

await context.addInitScript(() => {
  localStorage.setItem(
    "artx-auth-session",
    JSON.stringify({ token: "probe-token", user: { id: "probe-user", username: "probe" } })
  );
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));

// 本地没有后端：把所有 /api 请求打桩，免得登录态被 /api/auth/me 失败带走
await page.route("**/api/**", async route => {
  const url = route.request().url();
  if (url.includes("/api/auth/me")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }),
    });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const labelCount = await page.getByText("开始创作", { exact: true }).count();
const oldLabelCount = await page.getByText("新创作", { exact: true }).count();

const beforeBoards = await page.evaluate(key => {
  const prefix = Object.keys(localStorage).find(k => k.startsWith(key));
  if (!prefix) return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(prefix));
    return Array.isArray(raw) ? raw.length : Object.keys(raw?.projects ?? {}).length;
  } catch {
    return -1;
  }
}, HISTORY_KEY);

await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(1800);

const urlAfter = page.url();
const dialogVisible = await page.getByText("画板名称", { exact: true }).count();

const afterBoards = await page.evaluate(key => {
  const prefix = Object.keys(localStorage).find(k => k.startsWith(key));
  if (!prefix) return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(prefix));
    return Array.isArray(raw) ? raw.length : Object.keys(raw?.projects ?? {}).length;
  } catch {
    return -1;
  }
}, HISTORY_KEY);

await page.screenshot({ path: ".tmp-probe/start-create.png", fullPage: false });

console.log(
  JSON.stringify(
    {
      labelCount,
      oldLabelCount,
      urlAfter,
      dialogVisible,
      beforeBoards,
      afterBoards,
      pageErrors: errors.slice(0, 3),
    },
    null,
    2
  )
);

await browser.close();
