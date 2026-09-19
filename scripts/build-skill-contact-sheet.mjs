#!/usr/bin/env node
/**
 * 把 verify-skill-outputs 的产物拼成一张对比长图，供人工一眼验收。
 * 每行一个技能：左 = withSkill，右 = baseline（对照）。
 *
 * 用法：node scripts/build-skill-contact-sheet.mjs [产物目录] [输出文件]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = process.argv[2] || "/tmp/artx-skill-verify";
const TARGET = process.argv[3] || path.join(OUT_DIR, "contact-sheet.png");

const report = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "report.json"), "utf8"));
const rows = report.filter(r => r.runs);

const CELL_W = 520;      // 单格宽
const CELL_H = 340;      // 单格高（留足竖版）
const LABEL_H = 34;      // 行标题条
const GAP = 10;
const ROW_H = LABEL_H + CELL_H + GAP;
const WIDTH = CELL_W * 2 + GAP * 3;
const HEIGHT = ROW_H * rows.length + GAP;

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const layers = [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const top = GAP + i * ROW_H;
  const withSkill = row.runs.find(r => r.variant === "withSkill");
  const baseline = row.runs.find(r => r.variant === "baseline");

  const label = `<svg width="${WIDTH}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${LABEL_H}" fill="#161b22"/>
    <text x="12" y="23" font-family="Helvetica,Arial,sans-serif" font-size="16" fill="#e6edf3">${esc(row.skillId)}</text>
    <text x="${CELL_W * 0.62}" y="23" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#7ee787">withSkill</text>
    <text x="${CELL_W + GAP * 2 + CELL_W * 0.62}" y="23" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#8b949e">baseline (对照)</text>
  </svg>`;
  layers.push({ input: Buffer.from(label), top, left: 0 });

  const cells = [
    [withSkill, GAP],
    [baseline, CELL_W + GAP * 2],
  ];
  for (const [run, left] of cells) {
    if (!run?.file || !fs.existsSync(run.file)) continue;
    const buf = await sharp(run.file)
      .resize(CELL_W, CELL_H, { fit: "contain", background: "#0d1117" })
      .png()
      .toBuffer();
    layers.push({ input: buf, top: top + LABEL_H, left });
  }
}

await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#0d1117" },
})
  .composite(layers)
  .png()
  .toFile(TARGET);

console.log(`对比长图：${TARGET}（${rows.length} 个技能，${WIDTH}x${HEIGHT}）`);
