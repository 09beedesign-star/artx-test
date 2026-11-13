import fs from "node:fs";

const files = {
  canvas: fs.readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8"),
  ai: fs.readFileSync("client/src/lib/ai.ts", "utf8"),
  server: fs.readFileSync("server/image-generation.ts", "utf8"),
  index: fs.readFileSync("server/index.ts", "utf8"),
};

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

/**
 * 【2026-11-12】画布里的「智能产品图」入口 / 弹窗 / 事件出图引擎已按用户要求整块移除。
 * 能力没有消失：电商画布页有自己的两条独立生图链路，下面同时锁住这两件事，
 * 避免「画布死代码复活」或「服务端能力被误删」任一侧悄悄发生。
 */
const ecommerce = fs.readFileSync("client/src/pages/EcommerceCanvasPage.tsx", "utf8");
assert(!files.canvas.includes('label: "智能产品图"'), "canvas no longer exposes the smart product toolbar entry");
assert(!files.canvas.includes("SmartCommerceProductDialog"), "canvas no longer mounts the smart product dialog");
assert(!files.canvas.includes('window.addEventListener("smart-commerce-product-create"'), "canvas no longer handles the smart product event");
assert(!files.canvas.includes("createProductBackground"), "canvas no longer calls createProductBackground");
assert(files.canvas.includes('label: "图层分离"'), "image toolbar uses layer separation label");
assert(ecommerce.includes("createProductBackground"), "ecommerce canvas still generates product images");
assert(ecommerce.includes("editImageWithPrompt"), "ecommerce canvas still generates post images");
assert(files.ai.includes("postProductBackground"), "client API has create-background POST wrapper");
assert(files.ai.includes("/api/images/create-background"), "client API points to create-background endpoint");
assert(files.index.includes('app.post("/api/images/create-background"'), "server exposes create-background route");
assert(files.index.includes('provider: "PicWish/佐糖 r-background"'), "server tracking reports pure PicWish r-background");
assert(files.index.includes('model: getRouteModel(req.body, "picwish-r-background")'), "server route tracks PicWish r-background model");
assert(files.server.includes('"r-background"'), "PicWish r-background task type is registered");
assert(files.server.includes('runPicWishImageTask("r-background"'), "smart background uses PicWish r-background task");
assert(files.server.includes("const productCutout = await removeBackgroundWithPicWish(buffer, mimeType)"), "smart product removes the uploaded background before r-background");
assert(files.server.includes("prepareProductCutoutForBackgroundGenerator"), "smart product places the cutout on a selected-ratio transparent canvas before r-background");
assert(files.server.includes("userPrompt || fallbackPrompt"), "smart product keeps the user's scene prompt at highest priority");
assert(files.server.includes("prompt: buildSmartProductVariationPrompt(prompt, index, count)"), "smart product adds per-image variation prompts");
assert(files.server.includes("count: 1"), "smart product requests one PicWish image per variation");
assert(!files.server.includes("width: output.width"), "smart product does not send unsupported r-background width field");
assert(!files.server.includes("height: output.height"), "smart product does not send unsupported r-background height field");
assert(files.server.includes("negative_prompt"), "smart product sends a negative prompt to protect product identity");
/**
 * 【2026-11-12】原断言是「r-background 调用后 260 字符内不得出现 scene_type」，
 * 但服务端早已改成互斥三元 `...(input.sceneType ? { scene_type } : { prompt })`：
 * 模板模式传 scene_type、提示词模式传 prompt，二者永不并列。
 * 按文本距离判定会把这个正确实现误判成「混用」，脚本因此长期恒红
 * （且本脚本没有任何 CI / package.json 引用，一直没人发现）。
 * 改为锁语义：两者只能出现在同一个条件表达式的两个分支，绝不并列。
 */
const backgroundFn =
  files.server.match(/async function createBackgroundWithPicWish[\s\S]*?\n}\n/)?.[0] || "";
assert(backgroundFn, "createBackgroundWithPicWish is present in server/image-generation.ts");
assert(
  /\.\.\.\(input\.sceneType \? \{ scene_type: input\.sceneType \} : \{ prompt \}\)/.test(backgroundFn),
  "r-background uses scene_type OR prompt via an exclusive ternary"
);
assert(
  !/scene_type:[^,}]*,\s*prompt\s*[,}]|prompt:[^,}]*,\s*scene_type/.test(backgroundFn),
  "scene_type and prompt must never be sent together"
);
assert(!files.server.includes("generateSmartProductBackgroundPlates"), "smart product no longer uses image-model background plates");
assert(!files.server.includes("Image2 and Gemini background plates failed"), "smart product has no Image2/Gemini fallback copy");
assert(files.server.includes("eraseWithPicWish") && files.server.includes("createPicWishInpaintTask"), "eraser remains on the dedicated PicWish inpaint path");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Smart background verification passed");
