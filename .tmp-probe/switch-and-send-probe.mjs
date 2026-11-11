/**
 * 探针：① 记忆开关药丸宽度是否恒定（不随 hover / 开启伸缩）② 开关几何是否居中
 *       ③ 首页与画布的发送键是不是同一个黑圆白飞机
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    "artx-auth-session",
    JSON.stringify({ token: "probe-token", user: { id: "probe-user", username: "probe" } })
  );
});
const page = await context.newPage();
await page.route("**/api/**", route => {
  const url = route.request().url();
  if (url.includes("/api/auth/me")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "probe-user", username: "probe" } }),
    });
  }
  if (url.includes("/api/user/memory")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contextEnabled: false }),
    });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

const report = {};

// ── 首页：发送/生成键 ──
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
const homeSend = page.getByRole("button", { name: "生成图片" });
report.homeSend = await homeSend.count()
  ? await homeSend.first().evaluate(el => {
      const s = getComputedStyle(el);
      return {
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        radius: s.borderRadius,
        bg: s.backgroundColor,
        color: s.color,
      };
    })
  : null;
if (report.homeSend) await homeSend.first().screenshot({ path: "/tmp/probe-home-send.png" });

// ── 进画布（首页没有侧栏，要先到工作台）──
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);
await page.getByRole("button", { name: /开始创作/ }).first().click();
await page.waitForTimeout(2200);
// 关掉新手引导（有就关，没有也不报错）
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(300);
for (const label of ["跳过", "知道了", "开始使用", "下一步"]) {
  const btn = page.getByRole("button", { name: label });
  if (await btn.count()) {
    await btn.first().click().catch(() => {});
    await page.waitForTimeout(250);
  }
}
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(500);

const pill = page.locator('[data-testid="composer-memory-switch"]').locator("..");
const measure = async label => {
  const box = await pill.boundingBox();
  const sw = await page.locator('[data-testid="composer-memory-switch"]').boundingBox();
  const brain = await pill.locator("svg").first().boundingBox();
  return {
    label,
    pill: box && { w: Math.round(box.width), h: Math.round(box.height) },
    switch: sw && { x: Math.round(sw.x), y: Math.round(sw.y), w: Math.round(sw.width), h: Math.round(sw.height) },
    icon: brain && { w: Math.round(brain.width), h: Math.round(brain.height) },
    // 垂直居中判据：开关与药丸的上下留白应当相等
    topGap: box && sw ? Math.round(sw.y - box.y) : null,
    bottomGap: box && sw ? Math.round(box.y + box.height - (sw.y + sw.height)) : null,
  };
};

report.pillIdle = await measure("idle");
await pill.hover();
await page.waitForTimeout(400);
report.pillHover = await measure("hover");
await page.locator('[data-testid="composer-memory-switch"]').click();
await page.waitForTimeout(900);
report.pillOn = await measure("on");
report.switchTrackOn = await page
  .locator('[data-testid="composer-memory-switch"]')
  .evaluate(el => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, state: el.getAttribute("data-state") };
  });
await pill.screenshot({ path: "/tmp/probe-switch-on.png" });
report.pillText = (await pill.innerText()).trim();

// 发送键（画布主输入框）
const canvasSend = page.getByRole("button", { name: "发送" }).first();
if (await canvasSend.count()) {
  report.canvasSend = await canvasSend.evaluate(el => {
    const s = getComputedStyle(el);
    return {
      w: el.getBoundingClientRect().width,
      radius: s.borderRadius,
      bg: s.backgroundColor,
      color: s.color,
    };
  });
  await canvasSend.screenshot({ path: "/tmp/probe-canvas-send.png" }).catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
