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
  // dev 服务器复刻了一份 capability 分发（runDevBackgroundImageTask），
  // 切换上游时漏改过一次：生产走 Kling、本地仍走佐糖，本地怎么试都试不出线上行为。
  // 这里把它纳入校验，否则第 4 个出口可以静默退回佐糖而全部断言照样绿。
  vite: fs.readFileSync("vite.config.ts", "utf8"),
  // 供应商标签与后台面板条目名之间有隐式前缀耦合，见下方 providerLabel 断言。
  adminStore: fs.readFileSync("server/admin-store.ts", "utf8"),
};

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const expandRoute = files.index.match(/app\.post\("\/api\/images\/expand"[\s\S]*?\n  \}\);/)?.[0] || "";
// 后台任务分发里的扩图分支。两个文件同构：`case "image_expansion":` 起，
// 到下一个 `case "text_to_image":` 止。必须切区块再断言 —— 整文件 toContain
// 在 server/index.ts 这种上万行的文件上几乎锁不住任何东西。
//
// ⚠️ 两个细节，少一个断言就会假绿：
// 1. server/index.ts 里有**两个** `case "image_expansion"`（:620 是 preflight
//    tracking，只填 provider/model 不调函数；:1063 才是真正执行的那个）。
//    非贪婪匹配只会取到第一个，于是「必须调 Kling」恒假。这里取全部块。
// 2. 必须先剥注释再断言。本次改动就在注释里写了 `expandImageWithPicWish`
//    和 `clampImageExpansionPrompt` 来解释历史，未剥注释时三条断言直接误判。
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sliceExpansionCases = (source) =>
  [...stripComments(source).matchAll(/case "image_expansion":[\s\S]*?(?=case "text_to_image":)/g)].map((m) => m[0]);
const indexTaskBranches = sliceExpansionCases(files.index);
const viteTaskBranches = sliceExpansionCases(files.vite);
const indexTaskBranch = indexTaskBranches.join("\n");
const viteTaskBranch = viteTaskBranches.join("\n");
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

// 供应商标签与后台统计的隐式耦合：admin-store 的 matchProviderId 只认
// 「全等」或「`${条目名} ` 前缀」，VOD 条目名是 "腾讯云 VOD"。扩图标签
// 必须正好是 "腾讯云 VOD " 开头，否则调用记录会**静默**掉出后台供应商
// 面板和成本归集 —— 不报错、不告警，只是面板上再也看不到扩图。
// 光靠注释挡不住（注释会被顺手删掉），所以在这里落一条断言。
// 两边都从源码里读真值再比对，不要在这里硬编码任何一边 —— 硬编码的话
// 改名时断言会跟着一起改，等于没锁。
const providerLabel = files.shared.match(/VOD_IMAGE_EXPANSION_PROVIDER\s*=\s*"([^"]+)"/)?.[1] || "";
const vodPanelName = files.adminStore.match(/id: "ai_tencent_vod", name: "([^"]+)"/)?.[1] || "";
assert(providerLabel, "VOD_IMAGE_EXPANSION_PROVIDER must be a string literal so it can be checked here");
assert(vodPanelName, 'admin-store must define the ai_tencent_vod provider panel entry with a literal name');
assert(
  providerLabel === vodPanelName || providerLabel.startsWith(`${vodPanelName} `),
  `provider label ${JSON.stringify(providerLabel)} must equal ${JSON.stringify(vodPanelName)} or start with ` +
    `${JSON.stringify(vodPanelName + " ")} — admin-store matchProviderId only accepts exact match or that space-suffixed ` +
    "prefix, so any other spelling silently drops expansion tasks out of the provider panel and cost attribution",
);
// 上面的前缀规则本身也要在，否则改了 matchProviderId 这条断言就失去意义。
assert(
  /return task\.startsWith\(`\$\{name\} `\)/.test(files.adminStore),
  "matchProviderId must keep the space-suffixed prefix rule that the expansion provider label depends on",
);
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

// 出口 3：生产后台任务（server/index.ts runBackgroundImageTask）。
// 画布的扩图默认走后台任务而不是同步路由，漏掉这条等于主路径没锁。
assert(indexTaskBranches.length > 0, "server/index.ts must handle the image_expansion background task capability");
assert(indexTaskBranch.includes("expandImageWithVodKling"), "background image task must call VOD Kling expansion");
assert(!indexTaskBranch.includes("expandImageWithPicWish"), "background image task must no longer call PicWish");

// 出口 4：dev 服务器复刻的分发（vite.config.ts runDevBackgroundImageTask）。
// 这是 2026-09-13 切换时实际漏掉的那个出口。
assert(viteTaskBranches.length > 0, "vite.config.ts must handle the image_expansion dev background task capability");
assert(
  viteTaskBranch.includes("expandImageWithVodKling"),
  "dev background image task must call VOD Kling expansion (it was left on PicWish once — local runs then could not reproduce production)",
);
assert(
  !viteTaskBranch.includes("expandImageWithPicWish"),
  "dev background image task must no longer call PicWish",
);
// 默认提示词按 Kling 的 2500 上限重写后有 700+ 字符；若这里回退到佐糖，
// 必须同时改回 clampImageExpansionPrompt，否则每次请求都是 400。
assert(
  !viteTaskBranch.includes("clampImageExpansionPrompt"),
  "dev expansion must not clamp the prompt to the PicWish 200-char limit while running on Kling",
);

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
