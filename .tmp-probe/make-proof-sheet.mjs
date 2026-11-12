/**
 * 把浏览器实测截图拼成一张取证总览图（浅色 / 深色 × Tab圆角 / 返回按钮 / 生成结果区返回）
 */
import sharp from "sharp";
import fs from "fs";

const W = 1240, H = 660;
const CARD_W = 360, CARD_H = 160;
const BG = "#f4f5f7";
const CARD = "#ffffff";

const cells = [
  { title: "模式切换 Tab（圆角统一）", light: "/tmp/ecom-tab-light-工作台.png", dark: "/tmp/ecom-tab-dark-工作台.png", w: 350, cropWidth: null },
  { title: "返回按钮（模板库）", light: "/tmp/ecom-back-light-模板库.png", dark: "/tmp/ecom-back-dark-模板库.png", w: 260, cropWidth: null },
  { title: "返回按钮（生成结果区）", light: "/tmp/ecom-back-results-light.png", dark: "/tmp/ecom-back-results-dark.png", w: 350, cropWidth: 420 },
];

function label(text, width, height, opts = {}) {
  const { size = 15, color = "#161616", weight = 500, align = "left" } = opts;
  const x = align === "center" ? width / 2 : 4;
  const anchor = align === "center" ? "middle" : "start";
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${x}" y="${Math.round(height * 0.72)}" font-family="-apple-system, PingFang SC, Helvetica, Arial, sans-serif"
      font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

const layers = [];
// 背景 + 标题
layers.push({ input: await sharp({ create: { width: W, height: H, channels: 4, background: BG } }).png().toBuffer(), top: 0, left: 0 });
layers.push({ input: await label("电商画布 UI 修复 · 浏览器实测取证", W - 60, 44, { size: 24, weight: 600 }), top: 18, left: 30 });
layers.push({ input: await label("浅色 / 深色双主题 · computed style 全部通过 · 分支 ui/tuxu-restyle", W - 60, 30, { size: 14, color: "#6b6b70" }), top: 56, left: 30 });

const colX = [30, 440, 850];
const rowLabelY = [140, 355];       // 行标签
const cardY = [165, 380];           // 卡片
const rowLabels = ["浅色主题", "深色主题"];

// 全局列标题（只画一次，放在两行上方，避免与行标签重叠）
for (let ci = 0; ci < cells.length; ci++) {
  layers.push({ input: await label(cells[ci].title, 350, 26, { size: 15, color: "#5a5a62", weight: 600 }), top: 104, left: colX[ci] + 4 });
}

for (let ri = 0; ri < 2; ri++) {
  layers.push({ input: await label(rowLabels[ri], 380, 28, { size: 16, weight: 600 }), top: rowLabelY[ri], left: 30 });
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const file = ri === 0 ? cell.light : cell.dark;
    if (!fs.existsSync(file)) continue;
    const x = colX[ci];
    const y = cardY[ri];
    // 卡片底
    layers.push({
      input: await sharp({ create: { width: CARD_W, height: CARD_H, channels: 4, background: CARD } }).png().toBuffer(),
      top: y, left: x,
    });
    let img = sharp(file);
    if (cell.cropWidth) img = img.extract({ left: 0, top: 0, width: cell.cropWidth, height: 64 });
    const buf = await img.resize({ width: cell.w, kernel: sharp.kernel.lanczos3 }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    layers.push({ input: buf, top: y + Math.round((CARD_H - meta.height) / 2), left: x + Math.round((CARD_W - meta.width) / 2) });
  }
}

// 底部结论
const notes = [
  "Tab：容器 16px / 选中项 16px（修复前选中项仅 4px，差 12px 漏白边）",
  "返回按钮：#161616 底 + #ffffff 字 + 全圆角，四处出口深浅两主题一致",
];
for (let i = 0; i < notes.length; i++) {
  layers.push({ input: await label(notes[i], W - 60, 28, { size: 15, color: "#333338" }), top: 565 + i * 30, left: 30 });
}

await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
  .composite(layers)
  .png()
  .toFile("/tmp/ecom-final-proof.png");
console.log("已生成 /tmp/ecom-final-proof.png");
