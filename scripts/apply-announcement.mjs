#!/usr/bin/env node
/**
 * 换首页公告弹窗（图片 + 文案 + 轮播页数）—— 一条命令完成。
 *
 *   node scripts/apply-announcement.mjs <config.json> [--dry-run]
 *
 * config.json 结构（slides 1~5 页，页数 = 右下角锚点数；1 页时不显示锚点、不轮播）：
 * {
 *   "id": "artxstudio-xxx-2026-12",          // 可选；不填自动生成。必须与当前不同，否则老用户看不到
 *   "actionLabel": "我知道了",                 // 可选，默认「我知道了」
 *   "slides": [
 *     {
 *       "image": "/abs/path/banner.png",       // 本地图片 或 "keep:<assets 里已有文件名>" 复用旧图
 *       "imageAlt": "ArtXStudio x xxx",         // 可选，默认 title + subtitle
 *       "title": "ArtXStudio",
 *       "subtitle": "x xxx 正上架",              // 可选，null/省略 = 不显示
 *       "body": "正文，建议 100~130 字，上限 160",
 *       "tag": { "line1": "绿色第一行", "line2": "绿色第二行" }   // 可选，null = 不显示
 *     }
 *   ]
 * }
 *
 * 做的事：
 *   1. 校验（页数 1~5、必填字段、正文 ≤160 字、图片存在、id 与当前不同）
 *   2. 图片按弹窗图片区 865:308 居中裁切 → 1298×462 JPEG（q86）→ client/src/assets/announcement/
 *      文件名带内容哈希前缀，换图 URL 必变、缓存必失效
 *   3. 只重写 announcement-content.ts 里两段 @announcement-* 标记区，其余（类型/上限常量）不动
 *
 * ⚠️ 不负责提交/发布；跑完按项目流程跑测试 → 提交 → 按口令决定是否发布。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "client/src/components/announcement/announcement-content.ts");
const ASSETS = join(ROOT, "client/src/assets/announcement");
const MAX = 5;
const BODY_MAX = 160;
const OUT_W = 1298;
const OUT_H = 462; // 1298 / 462 ≈ 865 / 308

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const cfgPath = args.find(a => !a.startsWith("--"));
if (!cfgPath) {
  console.error("用法: node scripts/apply-announcement.mjs <config.json> [--dry-run]");
  process.exit(2);
}

const fail = msg => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const cfg = JSON.parse(readFileSync(resolve(cfgPath), "utf-8"));
const slides = cfg.slides;
if (!Array.isArray(slides) || slides.length < 1) fail("slides 至少 1 页");
if (slides.length > MAX) fail(`slides 最多 ${MAX} 页（锚点上限），当前 ${slides.length} 页`);

const src = readFileSync(CONTENT, "utf-8");
const MARKS = ["imports:begin", "imports:end", "slides:begin", "slides:end", "retired:begin", "retired:end"];
for (const m of MARKS) if (!src.includes(`@announcement-${m}`)) fail(`内容文件缺少标记 @announcement-${m}`);
const currentId = src.match(/\n  id: "([^"]+)"/)?.[1];

const id =
  cfg.id ||
  `artxstudio-${(slides[0].subtitle || slides[0].title || "announce")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "announce"}-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`id 只能用小写字母/数字/连字符：${id}`);
if (id === currentId) fail(`id 与当前线上一期相同（${id}），老用户会看不到新内容 → 换一个`);
const retiredRegion = src.match(/@announcement-retired:begin[\s\S]*?@announcement-retired:end/)?.[0] ?? "";
const retired = [...retiredRegion.matchAll(/"([^"]+)"/g)].map(m => m[1]);
if (retired.includes(id)) fail(`id ${id} 是已下线的历史期，老用户已读过 → 换一个`);
const nextRetired = currentId && !retired.includes(currentId) ? [...retired, currentId] : retired;

const strLen = s => String(s ?? "").replace(/\s/g, "").length;
slides.forEach((s, i) => {
  const n = `第 ${i + 1} 页`;
  if (!s.image) fail(`${n} 缺 image`);
  if (!s.title) fail(`${n} 缺 title`);
  if (!s.body) fail(`${n} 缺 body`);
  if (strLen(s.body) > BODY_MAX) fail(`${n} 正文 ${strLen(s.body)} 字，超过 ${BODY_MAX}（会撑高卡片）`);
  if (s.tag && (!s.tag.line1 || !s.tag.line2)) fail(`${n} tag 需同时有 line1/line2，或整个设为 null`);
  if (String(s.image).startsWith("keep:")) {
    const f = String(s.image).slice(5);
    if (!existsSync(join(ASSETS, f))) fail(`${n} keep 的旧图不存在：${f}`);
  } else if (!existsSync(resolve(s.image))) fail(`${n} 图片不存在：${s.image}`);
});

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  fail("缺少 sharp（项目依赖里应有，先 npm install）");
}

const imageFiles = [];
for (const [i, s] of slides.entries()) {
  if (String(s.image).startsWith("keep:")) {
    imageFiles.push(String(s.image).slice(5));
    continue;
  }
  const buf = await sharp(resolve(s.image))
    .rotate() // 尊重 EXIF 方向，否则手机图可能横躺
    .resize(OUT_W, OUT_H, { fit: "cover", position: "centre" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(buf).metadata();
  if (meta.width !== OUT_W || meta.height !== OUT_H) fail(`第 ${i + 1} 页裁切结果尺寸异常 ${meta.width}x${meta.height}`);
  const hash = createHash("sha1").update(buf).digest("hex").slice(0, 8);
  const name = `announcement-${hash}.jpg`;
  if (!dryRun) writeFileSync(join(ASSETS, name), buf);
  imageFiles.push(name);
}

const q = v => JSON.stringify(String(v));
const chunkBody = body => {
  // 按句读切成多行，便于 diff 阅读
  const parts = String(body).match(/[^，。；！？,.;!?]*[，。；！？,.;!?]?/g).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 40 && cur) {
      lines.push(cur);
      cur = p;
    } else cur += p;
  }
  if (cur) lines.push(cur);
  return lines.map(q).join(" +\n    ");
};

const importsBlock =
  "/* @announcement-imports:begin —— 本区由 scripts/apply-announcement.mjs 生成，换弹窗请用脚本，别手改 */\n" +
  imageFiles.map((f, i) => `import slide${i + 1}Image from "@/assets/announcement/${f}";`).join("\n") +
  "\n/* @announcement-imports:end */";

const slideDecls = slides
  .map((s, i) => {
    const alt = s.imageAlt || [s.title, s.subtitle].filter(Boolean).join(" ");
    const tag = s.tag ? `{ line1: ${q(s.tag.line1)}, line2: ${q(s.tag.line2)} }` : "null";
    return [
      `const SLIDE_${i + 1}: AnnouncementSlide = {`,
      `  image: slide${i + 1}Image,`,
      `  imageAlt: ${q(alt)},`,
      `  title: ${q(s.title)},`,
      `  subtitle: ${s.subtitle ? q(s.subtitle) : "null"},`,
      `  body:\n    ${chunkBody(s.body)},`,
      `  tag: ${tag},`,
      `};`,
    ].join("\n");
  })
  .join("\n\n");

const slidesBlock =
  "/* @announcement-slides:begin —— 本区由 scripts/apply-announcement.mjs 生成，换弹窗请用脚本，别手改 */\n" +
  `/* 生成于 ${new Date().toISOString().slice(0, 10)}，共 ${slides.length} 页 */\n` +
  slideDecls +
  "\n\nexport const HOME_ANNOUNCEMENT: AnnouncementContent = {\n" +
  "  /* 换内容必须换 id，否则看过上一期的老用户看不到且不报错 */\n" +
  `  id: ${q(id)},\n` +
  "  ...SLIDE_1,\n" +
  `  actionLabel: ${q(cfg.actionLabel || "我知道了")},\n` +
  `  slides: [${slides.map((_, i) => `SLIDE_${i + 1}`).join(", ")}],\n` +
  "  /* 整图模式已停用：整图里的小字在 480 宽下只有约 6px，看不清 */\n" +
  "  fullImage: null,\n" +
  "};\n" +
  "/* @announcement-slides:end */";

const replaceRegion = (text, name, block) => {
  const re = new RegExp(`/\\* @announcement-${name}:begin[\\s\\S]*?@announcement-${name}:end \\*/`);
  if (!re.test(text)) fail(`无法定位标记区 ${name}`);
  return text.replace(re, () => block);
};

const retiredBlock =
  "/* @announcement-retired:begin */\n" +
  "export const RETIRED_ANNOUNCEMENT_IDS: readonly string[] = [\n" +
  nextRetired.map(r => `  ${q(r)},\n`).join("") +
  "];\n/* @announcement-retired:end */";

let out = replaceRegion(src, "imports", importsBlock);
out = replaceRegion(out, "retired", retiredBlock);
out = replaceRegion(out, "slides", slidesBlock);

if (dryRun) {
  console.log(out.slice(out.indexOf("@announcement-slides:begin") - 3));
  console.log("\n(dry-run：未写入任何文件)");
} else {
  writeFileSync(CONTENT, out);
}

console.log(`✓ id: ${currentId} → ${id}`);
console.log(`✓ ${slides.length} 页（锚点 ${slides.length > 1 ? slides.length + " 个" : "不显示"}）`);
slides.forEach((s, i) =>
  console.log(`  ${i + 1}. ${s.title} ${s.subtitle ?? ""} | 图 ${imageFiles[i]} | 正文 ${strLen(s.body)} 字`),
);
console.log(`下一步：npx tsc --noEmit && npx vitest run client/src/components/announcement`);
console.log(`未被引用的旧图可自行清理：${basename(ASSETS)}/`);
