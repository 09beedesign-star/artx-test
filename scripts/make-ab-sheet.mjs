// 生成 A/B 上下对照图
import sharp from "sharp";

const A = "/tmp/ab-OFF.png";
const B = "/tmp/ab-ON.png";
const OUT = "/Users/ericbi/WorkBuddy/2026-09-07-21-55-56/text-edit-basketball-v2/ab-compare.png";

const Wt = 1000;
const a = await sharp(A).resize(Wt).toBuffer();
const b = await sharp(B).resize(Wt).toBuffer();
const ma = await sharp(a).metadata();
const mb = await sharp(b).metadata();
const GAP = 46;
const H = ma.height + mb.height + GAP * 2 + 20;

const label = (text, sub) => Buffer.from(
  `<svg width="${Wt}" height="${GAP}"><rect width="${Wt}" height="${GAP}" fill="#1d1d1f"/>` +
  `<text x="16" y="30" font-family="-apple-system,PingFang SC,sans-serif" font-size="22" fill="#ffffff">${text}</text>` +
  `<text x="${Wt - 16}" y="30" text-anchor="end" font-family="-apple-system,PingFang SC,sans-serif" font-size="18" fill="#a1a1a6">${sub}</text></svg>`
);

await sharp({ create: { width: Wt, height: H, channels: 3, background: "#000000" } })
  .composite([
    { input: label("A · 关闭坐标校正（旧行为）", "橙字行改动 8.0 — 原字未被处理"), top: 0, left: 0 },
    { input: a, top: GAP, left: 0 },
    { input: label("B · 开启主色吸附校正（当前）", "橙字行改动 34.7 — 原字已擦除重绘"), top: GAP + ma.height + 20, left: 0 },
    { input: b, top: GAP * 2 + ma.height + 20, left: 0 },
  ])
  .png()
  .toFile(OUT);

console.log("已生成", OUT);
