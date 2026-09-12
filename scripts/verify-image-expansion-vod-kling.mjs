/**
 * 扩图链路校验（腾讯云 VOD Kling image_expand）
 *
 * 2026-09-13 扩图上游由佐糖 PicWish `advanced-image-expand` 切换为
 * 腾讯云 VOD Kling `SceneType: "image_expand"`。本脚本取代
 * `verify-image-expansion-picwish.mjs`，作用有两个：
 *   1. 锁死「扩图走 Kling」，防止后续改动把链路悄悄改回佐糖；
 *   2. 锁死切换过程中踩到的两个**文档没写**的约束，见下面 Kling 契约段。
 *
 * ⚠️ 佐糖实现（`expandImageWithPicWish` 及其配套 helper）**故意保留**在
 * `server/image-generation.ts` 里作为回退，所以本脚本只断言「扩图入口不再
 * 指向佐糖」，不断言「仓库里没有佐糖扩图代码」——后者会误伤回退实现。
 *
 * 用法：node scripts/verify-image-expansion-vod-kling.mjs
 */
import fs from "node:fs";

const files = {
  server: fs.readFileSync("server/image-generation.ts", "utf8"),
  vod: fs.readFileSync("server/tencent-vod-aigc.ts", "utf8"),
  orchestrator: fs.readFileSync("server/ai-orchestrator.ts", "utf8"),
  index: fs.readFileSync("server/index.ts", "utf8"),
  ai: fs.readFileSync("client/src/lib/ai.ts", "utf8"),
  canvas: fs.readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8"),
  shared: fs.readFileSync("shared/image-expansion.ts", "utf8"),
};

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const expandRoute = files.index.match(/app\.post\("\/api\/images\/expand"[\s\S]*?\n  \}\);/)?.[0] || "";
const expansionBranch = files.orchestrator.match(/if \(capability === "image_expansion"\)[\s\S]*?^\s{4}\}/m)?.[0] || "";
const erasureBranch = files.orchestrator.match(/if \(capability === "element_erasure"\)[\s\S]*?^\s{4}\}/m)?.[0] || "";
const createTaskSource = files.vod.match(/export async function createVodImageExpandTask[\s\S]*?\n}/)?.[0] || "";
const expandFnSource = files.server.match(/export async function expandImageWithVodKling[\s\S]*?\n}/)?.[0] || "";

assert(createTaskSource, "server/tencent-vod-aigc.ts must define createVodImageExpandTask");
assert(expandFnSource, "server/image-generation.ts must define expandImageWithVodKling");

/* ── Kling 接口契约（两条都是实测得出，文档未明说，改动前务必先读） ────── */

// 1. SceneType=image_expand 时 ModelVersion 必须是 "scene"。
//    写 "3.0" 会被拒：ModelVersion must be scene when SceneType is image_expand。
assert(createTaskSource.includes('ModelName: "Kling"'), "expand task must target the Kling model");
assert(createTaskSource.includes('SceneType: "image_expand"'), "expand task must use the image_expand scene");
assert(
  createTaskSource.includes('ModelVersion: "scene"'),
  'ModelVersion must be "scene" — Kling rejects image_expand with any other version',
);

// 2. 扩图比例走 ExtInfo，且是**双层 JSON 字符串**：
//    JSON.stringify({ AdditionalParameters: JSON.stringify({ ... }) })
//    少套一层上游读不到参数，会静默返回一张没扩的原图。
assert(
  /ExtInfo:\s*JSON\.stringify\(\{[\s\S]*?AdditionalParameters:\s*JSON\.stringify\(\{/.test(createTaskSource),
  "expansion ratios must be double-JSON-encoded inside ExtInfo.AdditionalParameters",
);
for (const key of ["up_expansion_ratio", "down_expansion_ratio", "left_expansion_ratio", "right_expansion_ratio"]) {
  assert(createTaskSource.includes(key), `expand task must send ${key}`);
}

/* ── 上游数值约束：单边 ≤ 2，总面积 ≤ 3 倍 ───────────────────────────── */

assert(files.vod.includes("VOD_EXPAND_RATIO_MAX"), "per-side ratio cap must be a named constant");
assert(files.vod.includes("VOD_EXPAND_AREA_MULTIPLIER_MAX"), "area multiplier cap must be a named constant");
assert(
  /VOD_EXPAND_RATIO_MAX\s*=\s*2\b/.test(files.vod),
  "Kling accepts per-side expansion ratios in [0, 2]",
);
assert(
  /VOD_EXPAND_AREA_MULTIPLIER_MAX\s*=\s*3\b/.test(files.vod),
  "Kling rejects requests whose expanded area exceeds 3x the original",
);
// 超限时按四向等比缩小回退，而不是抛错：扩图是用户点一下就触发的交互，
// 直接报错体验差，等比缩小能保留用户期望的方向与相对比例。
assert(
  files.vod.includes("__testClampExpansionToAreaLimit"),
  "area overflow must degrade by scaling ratios down, not by throwing",
);
assert(createTaskSource.includes("__testClampExpansionToAreaLimit(input)"), "task creation must apply the area clamp");
assert(
  /ratios\.up === 0 && ratios\.down === 0 && ratios\.left === 0 && ratios\.right === 0/.test(createTaskSource),
  "a request with zero expansion on all four sides must be rejected instead of billed",
);

/* ── Kling 不支持蒙版扩图 ─────────────────────────────────────────────── */

// 佐糖可以用 mask 驱动扩图，Kling 只认四向比例。只给 mask 不给方向时无法推断
// 扩展方向，必须报错——静默出一张没扩的图更糟。
assert(
  /mask/i.test(expandFnSource) && /throw new Error/.test(expandFnSource),
  "mask-only expansion input must be rejected explicitly (Kling cannot do mask-driven expansion)",
);

/* ── prompt 上限：Kling 2500，远宽于佐糖的 200 ────────────────────────── */

assert(
  /VOD_EXPANSION_PROMPT_MAX_LENGTH\s*=\s*2500\b/.test(files.shared),
  "Kling prompt limit is 2500 characters",
);
assert(
  files.ai.includes("VOD_EXPANSION_PROMPT_MAX_LENGTH"),
  "frontend must clamp to the Kling prompt limit, not the old 200-char PicWish limit",
);
assert(
  !files.ai.includes("clampImageExpansionPrompt(prompt"),
  "frontend must not still clamp expansion prompts to the PicWish 200-char limit",
);

/* ── 模型 / 供应商标识统一走 shared 常量 ──────────────────────────────── */

// 切换前这两个字符串在 7 处硬编码，换上游必然漏改，所以收敛到 shared 里。
assert(files.shared.includes('VOD_IMAGE_EXPANSION_MODEL = "vod-kling-image-expand"'), "model id must live in shared");
assert(files.shared.includes("VOD_IMAGE_EXPANSION_PROVIDER"), "provider label must live in shared");
assert(files.canvas.includes("model: VOD_IMAGE_EXPANSION_MODEL"), "canvas must use the shared model constant");
assert(!files.canvas.includes('"picwish-advanced-image-expand"'), "canvas must not keep the PicWish model literal");

/* ── 入口链路：三处调用点都必须指向 Kling ─────────────────────────────── */

assert(expandRoute, "server/index.ts must expose POST /api/images/expand");
assert(expandRoute.includes("expandImageWithVodKling"), "expand route must call the VOD Kling expansion function");
assert(!expandRoute.includes("expandImageWithPicWish"), "expand route must no longer call PicWish");
assert(expandRoute.includes("VOD_IMAGE_EXPANSION_PROVIDER"), "expand route must be tracked under the VOD Kling provider");
assert(expandRoute.includes("VOD_IMAGE_EXPANSION_MODEL"), "expand route must report the VOD Kling model id");
assert(!expandRoute.includes("orchestrator.run"), "expand route must not route through the generic orchestrator");

assert(expansionBranch.includes("expandImageWithVodKling"), "orchestrator image_expansion must call VOD Kling expansion");
assert(!expansionBranch.includes("expandImageWithPicWish"), "orchestrator image_expansion must no longer call PicWish");
assert(!expansionBranch.includes("eraseImageObjects"), "orchestrator image_expansion must not reuse eraser/inpaint");

/* ── 比例语义：前端不变，因为两家上游口径一致 ─────────────────────────── */

// 佐糖与 Kling 的比例都等于「扩出的像素 ÷ 原图对应边长」，所以
// toExpansionRatio 一行未动。前端上界 1 比 Kling 的 2 更严，安全。
assert(files.ai.includes("/api/images/expand"), "frontend still calls the image expansion endpoint");
assert(files.canvas.includes('action: "expand"'), "vertical image toolbar still exposes the expand command");
assert(
  files.canvas.includes("toExpansionRatio(expandTop, sourceH)") && files.canvas.includes("toExpansionRatio(expandLeft, sourceW)"),
  "frontend must convert edge pixels to ratios against the ORIGINAL edge length",
);
assert(
  !files.canvas.includes("imageSrc: expandedCanvas.toDataURL"),
  "frontend must send the original image, not the enlarged transparent canvas",
);
assert(files.canvas.includes("const imagePayload = await getRenderedImagePayload();"), "frontend must use the high-resolution payload");
assert(files.canvas.includes("imageSrc: imagePayload.src"), "frontend must submit the high-resolution payload source");

/* ── 其他能力不受影响（切换必须是隔离的） ─────────────────────────────── */

assert(erasureBranch.includes("eraseImageObjects"), "element erasure must keep using the existing eraser path");
assert(!erasureBranch.includes("expandImageWithVodKling"), "element erasure must not call the expansion path");
assert(files.server.includes("/api/tasks/visual/inpaint"), "PicWish eraser inpaint implementation must remain present");
assert(files.server.includes("/api/tasks/visual/external/watermark-remove"), "watermark removal must remain present");
assert(files.server.includes('runPicWishImageTask("r-background"'), "smart background must remain present");
assert(files.server.includes("expandImageWithPicWish"), "the PicWish expansion fallback must remain available in the codebase");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Image expansion runs on Tencent VOD Kling image_expand; PicWish remains only as an unreferenced fallback.");
