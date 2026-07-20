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

assert(files.canvas.includes('label: "智能产品图"'), "toolbar includes smart product command");
assert(files.canvas.indexOf('label: "智能注释"') < files.canvas.indexOf('label: "智能产品图"'), "smart product is placed after annotation");
assert(files.canvas.indexOf('label: "智能产品图"') < files.canvas.indexOf('label: "移动"'), "AI commands remain on the left side of the divider");
assert(files.canvas.includes('label: "图层分离"'), "image toolbar uses layer separation label");
assert(files.canvas.includes("SmartCommerceProductDialog"), "canvas mounts the smart product dialog");
assert(files.canvas.includes('window.addEventListener("smart-commerce-product-create"'), "canvas handles smart product generation event");
assert(files.canvas.includes("createProductBackground({"), "canvas calls createProductBackground client API");
assert(files.ai.includes("postProductBackground"), "client API has create-background POST wrapper");
assert(files.ai.includes("/api/images/create-background"), "client API points to create-background endpoint");
assert(files.index.includes('app.post("/api/images/create-background"'), "server exposes create-background route");
assert(files.index.includes('provider: "PicWish/佐糖 r-background"'), "server tracking reports pure PicWish r-background");
assert(files.index.includes('model: getRouteModel(req.body, "picwish-r-background")'), "server route tracks PicWish r-background model");
assert(files.server.includes('"r-background"'), "PicWish r-background task type is registered");
assert(files.server.includes('runPicWishImageTask("r-background"'), "smart background uses PicWish r-background task");
assert(files.server.includes("const productCutout = await removeBackgroundWithPicWish(buffer, mimeType)"), "smart product removes the uploaded background before r-background");
assert(files.server.includes("imageSrc: productImageSrc"), "smart product sends the transparent product cutout to r-background");
assert(files.server.includes("batch_size: batchSize"), "smart product requests PicWish batch output for multi-image generation");
assert(!/runPicWishImageTask\("r-background"[\s\S]{0,260}scene_type/.test(files.server), "smart product must not mix fixed scene_type with user prompt");
assert(!files.server.includes("generateSmartProductBackgroundPlates"), "smart product no longer uses image-model background plates");
assert(!files.server.includes("Image2 and Gemini background plates failed"), "smart product has no Image2/Gemini fallback copy");
assert(files.server.includes("eraseWithPicWish") && files.server.includes("createPicWishInpaintTask"), "eraser remains on the dedicated PicWish inpaint path");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Smart background verification passed");
