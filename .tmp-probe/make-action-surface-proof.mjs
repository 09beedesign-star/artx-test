/**
 * 取证总览：修复前（用户原截图） vs 修复后（浅色 / 深色实测）
 */
import sharp from "sharp";

const W = 1500, H = 870;
const BG = "#f4f5f7", CARD = "#ffffff";
const COL_W = 470, COL_X = [25, 515, 1005], IMG_W = 450, IMG_H = 540;
const BEFORE = "/Users/ericbi/Desktop/截屏2026-11-12 10.56.26.png";
const LIGHT = "/tmp/action-surface-left-light.png";
const DARK = "/tmp/action-surface-left-dark.png";

function txt(text, w, h, { size = 16, color = "#161616", weight = 500, align = "left" } = {}) {
  const x = align === "center" ? w / 2 : 4;
  const anchor = align === "center" ? "middle" : "start";
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="${x}" y="${Math.round(h * 0.72)}" font-family="-apple-system, PingFang SC, Helvetica, Arial, sans-serif"
      font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${text}</text></svg>`);
}

const layers = [
  { input: await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).png().toBuffer(), top: 0, left: 0 },
  { input: await txt("可点击绿色 → 黑框黑字线框按钮", W - 60, 46, { size: 26, weight: 600 }), top: 16, left: 30 },
  { input: await txt("只更换可点击的样式；纯展示绿色（图标 / 徽章 / 状态 / 描边）保持原样 · 分支 ui/tuxu-restyle", W - 60, 30, { size: 14, color: "#6b6b70" }), top: 58, left: 30 },
];

const cols = [
  { label: "修复前（你的截图）", sub: "浅绿文字 / 浅绿线框，白底上看不清", file: BEFORE, crop: null },
  { label: "修复后 · 浅色主题", sub: "黑字 + 1px 黑框 + 透明底 + 全圆角", file: LIGHT, crop: { left: 0, top: 950, width: 680, height: 800 } },
  { label: "修复后 · 深色主题", sub: "自动反相：白字 + 1px 白框", file: DARK, crop: { left: 0, top: 950, width: 680, height: 800 } },
];

for (let i = 0; i < cols.length; i++) {
  const c = cols[i], x = COL_X[i];
  layers.push({ input: await txt(c.label, COL_W, 32, { size: 18, weight: 600 }), top: 100, left: x + 8 });
  layers.push({ input: await txt(c.sub, COL_W, 26, { size: 13, color: "#8a8a90" }), top: 130, left: x + 8 });
  layers.push({
    input: await sharp({ create: { width: COL_W, height: IMG_H + 20, channels: 4, background: CARD } }).png().toBuffer(),
    top: 162, left: x,
  });
  let img = sharp(c.file);
  if (c.crop) img = img.extract(c.crop);
  const buf = await img.resize({ width: IMG_W, height: IMG_H, fit: "contain", background: CARD, kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  layers.push({ input: buf, top: 172, left: x + Math.round((COL_W - IMG_W) / 2) });
}

const notes = [
  "实测 computed style（浅色）：color rgb(22,22,22) · border 1px rgba(22,22,22,.55) · background transparent",
  "实测 computed style（深色）：color rgb(255,255,255) · border 1px rgba(255,255,255,.55)",
  "选中态（Tab / chip）走反相实心，不与未选中同为线框 —— 否则选不出来",
  "覆盖 18 个业务文件 / 58 个可点击出口；测试 35 条全绿、14 条变异全红",
];
for (let i = 0; i < notes.length; i++) {
  layers.push({ input: await txt(notes[i], W - 60, 26, { size: 14, color: "#333338" }), top: 742 + i * 28, left: 30 });
}

await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
  .composite(layers).png().toFile("/tmp/action-surface-proof.png");
console.log("已生成 /tmp/action-surface-proof.png");
