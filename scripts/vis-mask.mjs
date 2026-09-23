/**
 * 蒙版 alpha 可视化 + 量测。
 *
 * 📌 为什么需要它：text_edit 的蒙版把「可编辑区」编码在 **alpha 通道**，
 * RGB 恒为白。直接 Read 这张 PNG 只会看到一片纯白，什么都判断不了 ——
 * 必须把 alpha 提成灰度图才能肉眼核对范围。
 *
 * 用法：node scripts/vis-mask.mjs <mask.png> [out.png]
 */
const sharp = (await import("sharp")).default;

const file = process.argv[2];
if (!file) {
  console.error("用法: node scripts/vis-mask.mjs <mask.png> [out.png]");
  process.exit(1);
}
const outFile = process.argv[3] || file.replace(/\.png$/i, "-alpha-vis.png");

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const c = info.channels;

// 契约：alpha <= 127 表示「可编辑 / 需擦除」区域。
let minX = w;
let minY = h;
let maxX = -1;
let maxY = -1;
let count = 0;
const vis = Buffer.alloc(w * h);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * c + 3];
    if (a <= 127) {
      vis[y * w + x] = 255;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

console.log(`尺寸 ${w}x${h}，可编辑像素 ${count} (${((count / (w * h)) * 100).toFixed(1)}%)`);
if (maxX < 0) {
  console.log("⚠️ 没有任何可编辑像素 —— alpha 可能在传输中被有损压缩抹平");
} else {
  console.log(
    `包围盒 x:${minX}-${maxX} y:${minY}-${maxY}  宽 ${maxX - minX + 1} 高 ${maxY - minY + 1}`,
  );
}

// 纵向连通带：几条带就对应几个文字行，便于核对是否多圈/漏圈
const runs = [];
let inRun = false;
let start = 0;
for (let y = 0; y < h; y++) {
  let rowCount = 0;
  for (let x = 0; x < w; x++) if (vis[y * w + x]) rowCount++;
  if (rowCount > 0 && !inRun) {
    inRun = true;
    start = y;
  } else if (rowCount === 0 && inRun) {
    inRun = false;
    runs.push([start, y - 1]);
  }
}
if (inRun) runs.push([start, h - 1]);
console.log(
  `纵向连通带 ${runs.length} 条: ` +
    runs.map(r => `y${r[0]}-${r[1]}(高 ${r[1] - r[0] + 1})`).join(" | "),
);

await sharp(vis, { raw: { width: w, height: h, channels: 1 } }).png().toFile(outFile);
console.log(`已落盘: ${outFile}`);
