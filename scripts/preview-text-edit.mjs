/**
 * 文字回填链路可视化验证脚本（离线，不调用任何外部 AI 接口）。
 *
 * 用途：在本地直接检验「确定性文字绘制」的排版效果——字号、对齐、换行、
 * 颜色、字重是否贴合原始版式。跑完在 outputs/text-edit-preview/ 下生成对照图。
 *
 * 用法：
 *   node scripts/preview-text-edit.mjs
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const outDir = path.join(projectRoot, "outputs", "text-edit-preview");

const { drawTextReplacement } = await import(
  path.join(projectRoot, "server", "text-replace-precise.ts")
);

/** 构造一张带文字的测试海报，同时返回「擦字后」的干净底图 */
async function makeCase({ name, width, height, bg, textColor, items }) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const texts = items
    .map(it => {
      const anchor = it.align === "left" ? "start" : it.align === "right" ? "end" : "middle";
      const ax = it.align === "left" ? it.x : it.align === "right" ? it.x + it.w : it.x + it.w / 2;
      return `<text x="${ax}" y="${it.y + it.h / 2}" font-family="PingFang SC" font-size="${it.size}" font-weight="${it.weight || 400}" fill="${textColor}" text-anchor="${anchor}" dominant-baseline="central">${esc(it.text)}</text>`;
    })
    .join("");

  const original = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}${texts}</svg>`,
  )).png().toBuffer();

  // 「擦字图」：只有背景，没有文字（模拟美图擦字的理想输出）
  const cleaned = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}</svg>`,
  )).png().toBuffer();

  return { name, width, height, original, cleaned, items };
}

const cases = [
  await makeCase({
    name: "01-居中标题-深底浅字",
    width: 900, height: 400,
    bg: `<rect width="900" height="400" fill="#12203a"/><circle cx="740" cy="90" r="120" fill="#1d3a63"/>`,
    textColor: "#ffffff",
    items: [
      { text: "限时特惠活动", x: 150, y: 90, w: 600, h: 90, size: 64, weight: 700, align: "center" },
      { text: "全场五折起", x: 150, y: 210, w: 600, h: 60, size: 40, align: "center" },
    ],
  }),
  await makeCase({
    name: "02-左对齐正文-浅底深字",
    width: 900, height: 400,
    bg: `<rect width="900" height="400" fill="#f5f2ea"/>`,
    textColor: "#2b2b2b",
    items: [
      { text: "产品介绍", x: 80, y: 80, w: 500, h: 70, size: 48, weight: 700, align: "left" },
      { text: "轻量高效的解决方案", x: 80, y: 190, w: 640, h: 50, size: 32, align: "left" },
    ],
  }),
];

/** 每个用例的替换文案：覆盖等长、变长（触发换行/缩放）、变短三种情况 */
const edits = {
  "01-居中标题-深底浅字": ["年终感恩回馈", "全场三折起"],
  "02-左对齐正文-浅底深字": ["全新产品线介绍", "面向企业级场景的一站式智能内容生产与协作平台"],
};

await fs.promises.mkdir(outDir, { recursive: true });

for (const c of cases) {
  const regions = c.items.map((it, i) => ({
    x: it.x / c.width,
    y: it.y / c.height,
    width: it.w / c.width,
    height: it.h / c.height,
    text: it.text,
    targetText: edits[c.name][i],
  }));

  const drawn = await drawTextReplacement({
    imageBuffer: c.cleaned,
    originalBuffer: c.original,
    textRegions: regions,
    editedText: edits[c.name].join("\n"),
    targetWidth: c.width,
    targetHeight: c.height,
  });

  // 上下拼接：原图 vs 回填结果
  const label = async (text, w) =>
    sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34"><rect width="${w}" height="34" fill="#000"/><text x="12" y="17" font-family="PingFang SC" font-size="18" fill="#0f0" dominant-baseline="central">${text}</text></svg>`,
    )).png().toBuffer();

  const compare = await sharp({
    create: { width: c.width, height: c.height * 2 + 68, channels: 4, background: "#000" },
  })
    .composite([
      { input: await label("原图 ORIGINAL", c.width), top: 0, left: 0 },
      { input: c.original, top: 34, left: 0 },
      { input: await label("回填结果 RESULT", c.width), top: c.height + 34, left: 0 },
      { input: drawn, top: c.height + 68, left: 0 },
    ])
    .png()
    .toBuffer();

  await fs.promises.writeFile(path.join(outDir, `${c.name}.png`), compare);
  console.log(`✓ ${c.name}`);
  regions.forEach((r, i) => console.log(`    "${r.text}" -> "${r.targetText}"`));
}

console.log(`\n输出目录: ${outDir}`);
