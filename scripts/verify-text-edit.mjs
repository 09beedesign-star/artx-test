/**
 * 文字回填链路的量化验证（离线，不调用外部 AI）。
 *
 * 不靠肉眼，而是直接测量回填后文字的墨迹包围盒，与 OCR 区域做对比，
 * 输出：是否溢出区域、水平/垂直偏心程度、区域填充率、非目标区域是否被污染。
 *
 * 用法：node scripts/verify-text-edit.mjs
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const { drawTextReplacement } = await import(
  path.join(projectRoot, "server", "text-replace-precise.ts")
);

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 找出与背景不同的像素的包围盒（即"墨迹"范围） */
async function inkBBox(buffer, region, W, H, bgBuffer) {
  const x0 = Math.round(region.x * W);
  const y0 = Math.round(region.y * H);
  const w = Math.round(region.width * W);
  const h = Math.round(region.height * H);
  const crop = { left: x0, top: y0, width: w, height: h };
  const a = await sharp(buffer).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bgBuffer).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = a.info.channels;
  let minX = w, maxX = -1, minY = h, maxY = -1, ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > 60) {
        ink++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, maxX, minY, maxY, w, h, fill: ink / (w * h) };
}

/** 统计区域外被改动的像素数（应为 0） */
async function outsideDelta(resultBuf, cleanBuf, regions, W, H) {
  const a = await sharp(resultBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(cleanBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = a.info.channels;
  const inside = new Uint8Array(W * H);
  for (const r of regions) {
    const x0 = Math.max(0, Math.round(r.x * W)), y0 = Math.max(0, Math.round(r.y * H));
    const x1 = Math.min(W, x0 + Math.round(r.width * W)), y1 = Math.min(H, y0 + Math.round(r.height * H));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) inside[y * W + x] = 1;
  }
  let changed = 0;
  for (let p = 0; p < W * H; p++) {
    if (inside[p]) continue;
    const i = p * ch;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 30) changed++;
  }
  return changed;
}

const scenarios = [
  {
    name: "居中标题 / 深底浅字 / 等长替换",
    W: 900, H: 400, bg: `<rect width="900" height="400" fill="#12203a"/>`, color: "#ffffff",
    items: [{ text: "限时特惠活动", to: "年终感恩回馈", x: 150, y: 90, w: 600, h: 90, size: 64, weight: 700, align: "center" }],
  },
  {
    name: "左对齐正文 / 浅底深字 / 文案变长",
    W: 900, H: 400, bg: `<rect width="900" height="400" fill="#f5f2ea"/>`, color: "#2b2b2b",
    items: [{ text: "轻量高效的解决方案", to: "面向企业级场景的一站式智能内容生产与协作平台", x: 80, y: 190, w: 640, h: 50, size: 32, weight: 400, align: "left" }],
  },
  {
    name: "右对齐 / 文案变短",
    W: 800, H: 300, bg: `<rect width="800" height="300" fill="#ffffff"/>`, color: "#c0392b",
    items: [{ text: "原价九百九十九元", to: "仅需九元", x: 200, y: 110, w: 540, h: 70, size: 44, weight: 400, align: "right" }],
  },
  {
    name: "小尺寸图 / 验证参数自适应",
    W: 320, H: 160, bg: `<rect width="320" height="160" fill="#1b1b1b"/>`, color: "#f0e68c",
    items: [{ text: "小图测试", to: "缩略图文字", x: 40, y: 55, w: 240, h: 44, size: 30, weight: 400, align: "center" }],
  },
];

let pass = 0, fail = 0;

for (const s of scenarios) {
  const texts = s.items.map(it => {
    const anchor = it.align === "left" ? "start" : it.align === "right" ? "end" : "middle";
    const ax = it.align === "left" ? it.x : it.align === "right" ? it.x + it.w : it.x + it.w / 2;
    return `<text x="${ax}" y="${it.y + it.h / 2}" font-family="PingFang SC" font-size="${it.size}" font-weight="${it.weight}" fill="${s.color}" text-anchor="${anchor}" dominant-baseline="central">${esc(it.text)}</text>`;
  }).join("");

  const original = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s.W}" height="${s.H}">${s.bg}${texts}</svg>`)).png().toBuffer();
  const cleaned = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s.W}" height="${s.H}">${s.bg}</svg>`)).png().toBuffer();

  const regions = s.items.map(it => ({
    x: it.x / s.W, y: it.y / s.H, width: it.w / s.W, height: it.h / s.H,
    text: it.text, targetText: it.to,
  }));

  const drawn = await drawTextReplacement({
    imageBuffer: cleaned, originalBuffer: original, textRegions: regions,
    editedText: s.items.map(i => i.to).join("\n"),
    targetWidth: s.W, targetHeight: s.H,
  });

  console.log(`\n【${s.name}】`);
  const outside = await outsideDelta(drawn, cleaned, regions, s.W, s.H);

  for (let i = 0; i < regions.length; i++) {
    const box = await inkBBox(drawn, regions[i], s.W, s.H, cleaned);
    if (!box) { console.log(`  ✗ 区域${i} 未绘制出任何文字`); fail++; continue; }
    const overflow = box.minX < 0 || box.minY < 0 || box.maxX >= box.w || box.maxY >= box.h;
    const leftGap = box.minX, rightGap = box.w - 1 - box.maxX;
    const topGap = box.minY, bottomGap = box.h - 1 - box.maxY;
    const vCenterOff = Math.abs(topGap - bottomGap) / box.h;
    const widthUse = (box.maxX - box.minX + 1) / box.w;
    const heightUse = (box.maxY - box.minY + 1) / box.h;

    console.log(`  文案: "${s.items[i].text}" → "${s.items[i].to}"`);
    console.log(`    墨迹占宽 ${(widthUse * 100).toFixed(1)}% / 占高 ${(heightUse * 100).toFixed(1)}%`);
    console.log(`    左留白 ${leftGap}px  右留白 ${rightGap}px  上 ${topGap}px  下 ${bottomGap}px`);
    console.log(`    垂直居中偏差 ${(vCenterOff * 100).toFixed(1)}%  溢出区域: ${overflow ? "是" : "否"}`);

    const ok = !overflow && widthUse > 0.25 && heightUse > 0.25 && vCenterOff < 0.22;
    console.log(`    ${ok ? "✓ 通过" : "✗ 不达标"}`);
    ok ? pass++ : fail++;
  }
  console.log(`  区域外被改动像素: ${outside} ${outside === 0 ? "✓" : "✗ 存在污染"}`);
  outside === 0 ? pass++ : fail++;
}

console.log(`\n===== 汇总: 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail > 0 ? 1 : 0);
