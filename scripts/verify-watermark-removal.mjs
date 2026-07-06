import fs from "node:fs";

const files = {
  canvas: fs.readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8"),
  ai: fs.readFileSync("client/src/lib/ai.ts", "utf8"),
  server: fs.readFileSync("server/image-generation.ts", "utf8"),
  index: fs.readFileSync("server/index.ts", "utf8"),
  docs: fs.readFileSync("docs/test-deployment.md", "utf8"),
};

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

assert(files.canvas.includes('label: "去水印"'), "image toolbar includes watermark removal command");
assert(files.canvas.includes('action: "remove-watermark"'), "toolbar action is remove-watermark");
assert(files.canvas.includes('removeImageWatermark({ imageSrc })'), "canvas calls removeImageWatermark client API");
assert(files.canvas.includes('"remove-watermark"') && files.canvas.includes("aiToolbarActions"), "watermark removal is gated as an AI action");
assert(files.ai.includes("postImageWatermarkRemoval"), "client API has watermark removal POST wrapper");
assert(files.ai.includes("/api/images/remove-watermark"), "client points to remove-watermark endpoint");
assert(files.index.includes('app.post("/api/images/remove-watermark"'), "server exposes remove-watermark route");
assert(files.index.includes("removeImageWatermark"), "server route imports removeImageWatermark");
assert(files.server.includes("removeWatermarkWithPicWish"), "server has PicWish watermark wrapper");
assert(files.server.includes("getPicWishWatermarkRemovalEndpoint"), "watermark removal has dedicated PicWish endpoint helper");
assert(files.server.includes("/api/tasks/visual/external/watermark-remove"), "watermark removal uses PicWish external watermark-remove API");
assert(files.server.includes('body.append("file"'), "watermark removal sends the source image as file");
assert(files.server.includes("pollPicWishWatermarkRemovalTask"), "watermark removal polls the external watermark-remove task");
const eraseMatch = files.server.match(/async function eraseWithPicWish[\s\S]*?\n}/);
assert(Boolean(eraseMatch), "server has eraseWithPicWish wrapper");
assert(!eraseMatch?.[0].includes('runPicWishImageTask("watermark"'), "eraser must not call watermark task");
const watermarkMatch = files.server.match(/async function removeWatermarkWithPicWish[\s\S]*?\n}/);
assert(Boolean(watermarkMatch), "server has removeWatermarkWithPicWish wrapper");
assert(!watermarkMatch?.[0].includes('runPicWishImageTask("watermark"'), "watermark removal must not use masked object-removal task");
assert(files.docs.includes("去水印能力"), "test deployment docs mention watermark removal capability");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Watermark removal verification passed");
