import fs from "node:fs";

const files = {
  server: fs.readFileSync("server/image-generation.ts", "utf8"),
  orchestrator: fs.readFileSync("server/ai-orchestrator.ts", "utf8"),
  index: fs.readFileSync("server/index.ts", "utf8"),
  ai: fs.readFileSync("client/src/lib/ai.ts", "utf8"),
  canvas: fs.readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8"),
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

assert(files.ai.includes("/api/images/expand"), "frontend still calls the image expansion endpoint");
assert(files.canvas.includes('action: "expand"'), "vertical image toolbar still exposes the expand command");
assert(files.canvas.includes("imageSrc,"), "frontend expansion must send the original image source, not the enlarged transparent canvas");
assert(!files.canvas.includes("imageSrc: expandedCanvas.toDataURL"), "frontend expansion must not send the enlarged transparent canvas as the source image");
assert(!files.canvas.includes("getRenderedImageSource"), "frontend expansion must not downsample the source image to canvas display size");
assert(files.canvas.includes("const imagePayload = await getRenderedImagePayload();"), "frontend expansion must use the high-resolution rendered image payload");
assert(files.canvas.includes("imageSrc: imagePayload.src"), "frontend expansion must submit the high-resolution payload source");
assert(files.canvas.includes("toExpansionRatio(expandTop, sourceH)") && files.canvas.includes("toExpansionRatio(expandLeft, sourceW)"), "frontend expansion must convert edge pixels to PicWish ratio values");
assert(files.canvas.includes('model: "picwish-advanced-image-expand"'), "frontend expansion metadata must use the PicWish expansion model label");
assert(files.server.includes("advanced-image-expand"), "server must call PicWish advanced-image-expand API");
assert(files.server.includes("getPicWishImageExpansionEndpoint"), "server must define a dedicated PicWish expansion endpoint helper");
assert(files.server.includes("createPicWishImageExpansionTask"), "server must create a dedicated PicWish expansion task");
assert(files.server.includes("pollPicWishImageExpansionTask"), "server must poll the dedicated PicWish expansion task");
assert(files.server.includes("expandImageWithPicWish"), "server must expose a dedicated PicWish expansion function");
assert(files.server.includes('body.append("mask_file"'), "PicWish expansion must support canvas-mode mask_file");
assert(files.server.includes('body.append("mask_url"'), "PicWish expansion must support canvas-mode mask_url");
assert(files.server.includes("const hasExpansionMargins"), "PicWish expansion must prefer explicit edge margins when provided");
assert(files.server.includes("!hasExpansionMargins && input.maskUrl"), "PicWish expansion must not send mask_url together with explicit edge margins");
assert(files.server.includes("!hasExpansionMargins && input.maskBuffer"), "PicWish expansion must not send mask_file together with explicit edge margins");
assert(files.server.includes("__testNormalizePicWishExpansionRatio"), "server must normalize PicWish edge margins as 0-1 ratios");
assert(!files.server.includes("Math.round(top * scaleY)") && !files.server.includes("Math.round(left * scaleX)"), "server must not treat PicWish edge margins as pixels");
assert(files.server.includes('body.append("return_type", "1")'), "PicWish expansion should request URL results");
assert(files.server.includes('body.append("prompt"'), "PicWish expansion should forward prompt guidance");
assert(files.server.includes("state === 1"), "PicWish expansion polling must require completed state");
assert(files.server.includes("image1") && files.server.includes("image_1"), "PicWish expansion must read all documented result image fields");
assert(files.server.includes("data.data?.task_id || data.data?.taskId || data.task_id || data.taskId"), "PicWish expansion must accept nested and top-level task id fields");

assert(expandRoute.includes('provider: "PicWish/佐糖"'), "expand route must be tracked as PicWish/佐糖 provider");
assert(expandRoute.includes('"picwish-advanced-image-expand"'), "expand route must use the PicWish expansion model label");
assert(expandRoute.includes("expandImageWithPicWish"), "expand route must call the dedicated PicWish expansion function directly");
assert(!expandRoute.includes("orchestrator.run"), "expand route must not route through the generic orchestrator");

assert(expansionBranch.includes("expandImageWithPicWish"), "orchestrator image_expansion must call dedicated PicWish expansion");
assert(!expansionBranch.includes("eraseImageObjects"), "orchestrator image_expansion must not reuse eraser/inpaint");
assert(erasureBranch.includes("eraseImageObjects"), "element erasure must keep using the existing eraser path");
assert(!erasureBranch.includes("expandImageWithPicWish"), "element erasure must not call expansion path");
assert(files.server.includes("/api/tasks/visual/inpaint"), "existing eraser inpaint implementation must remain present");
assert(files.server.includes("/api/tasks/visual/external/watermark-remove"), "watermark removal implementation must remain present");
assert(files.server.includes('runPicWishImageTask("r-background"'), "smart background implementation must remain present");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("PicWish image expansion route is isolated on advanced-image-expand and does not affect other AI paths.");
