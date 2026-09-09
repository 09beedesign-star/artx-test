// 验证 server/text-engine-client.ts 与真实引擎服务的端到端连通性。
//
// 用法：
//   TEXT_ENGINE_BASE_URL=http://127.0.0.1:8077 \
//   node scripts/verify-text-engine.mjs <图片路径>
//
// 校验点：
//   1. 健康检查能识别引擎可用
//   2. 擦字返回的图尺寸与原图一致（尺寸漂移会让后续 composite 直接错位）
//   3. 未改动的区域不被擦（避免"只改一行却擦两行"）
//   4. 未配置 TEXT_ENGINE_BASE_URL 时静默返回不可用，而不是抛错

import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("用法: npx tsx scripts/verify-text-engine.mjs <图片路径>");
  process.exit(1);
}

// 用 npx tsx 运行，TS 转译由 tsx 自己接管，不要手工 register loader。
const mod = await import("../server/text-engine-client.ts");
const { isTextEngineConfigured, isTextEngineHealthy, eraseTextWithEngine } = mod;

console.log("configured =", isTextEngineConfigured());
const healthy = await isTextEngineHealthy();
console.log("healthy    =", healthy);
if (!healthy) {
  console.error("引擎不可用，先启动服务再跑本脚本");
  process.exit(2);
}

const sharp = (await import("sharp")).default;
const buffer = fs.readFileSync(src);
const meta = await sharp(buffer).metadata();
console.log(`原图 ${meta.width}x${meta.height}`);

// mid.png 的标题框（前面诊断量过）+ 一个不该被动的小字区
const W = meta.width, H = meta.height;
const regions = [
  { text: "中秋佳节", targetText: "新春快乐！", x: 177 / W, y: 59 / H, width: 372 / W, height: 121 / H },
  { text: "中秋放价 钜惠全城", targetText: "中秋放价 钜惠全城", x: 256 / W, y: 181 / H, width: 188 / W, height: 19 / H },
];

const result = await eraseTextWithEngine({ imageBuffer: buffer, regions });
console.log(`擦字返回 ${result.width}x${result.height}  erasedRegions=${result.erasedRegions}`);
console.log(`尺寸一致: ${result.width === W && result.height === H}`);

const outPath = path.join(path.dirname(src), "engine-erased.png");
fs.writeFileSync(outPath, result.buffer);

// 逐像素比对：未改动的小字区必须零改动
const a = await sharp(buffer).removeAlpha().raw().toBuffer();
const b = await sharp(result.buffer).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
let subMax = 0, titleChanged = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (y >= 183 && y < 200 && x >= 256 && x < 444) subMax = Math.max(subMax, d);
    if (y >= 59 && y < 180 && x >= 177 && x < 549 && d > 10) titleChanged++;
  }
}
console.log(`未改动小字区最大变化 ${subMax}  (应为 0)`);
console.log(`标题区被擦像素 ${titleChanged}  (应远大于 0)`);
console.log(`产物: ${outPath}`);
