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

assert(files.canvas.includes('label: "智能创建背景"'), "top toolbar includes smart background command");
assert(files.canvas.indexOf('label: "智能注释"') < files.canvas.indexOf('label: "智能创建背景"'), "smart background is placed after annotation");
assert(files.canvas.indexOf('label: "智能创建背景"') < files.canvas.indexOf('label: "移动"'), "AI commands remain on the left side of the divider");
assert(files.canvas.includes("ProductBackgroundDialogDetail"), "smart background dialog emits structured details");
assert(files.canvas.includes('window.addEventListener("product-background-create"'), "canvas handles smart background generation event");
assert(files.canvas.includes("createProductBackground({"), "canvas calls createProductBackground client API");
assert(files.canvas.includes("getSmartBackgroundOutputSize"), "canvas computes explicit smart background output dimensions");
assert(files.canvas.includes("product-bg-reference-"), "canvas creates a node for uploaded background reference images");
assert(files.canvas.includes("backgroundReferenceNode"), "canvas tracks background reference node placement");
assert(files.canvas.includes("customWidth: outputSize.width"), "smart background request passes explicit output width");
assert(files.canvas.includes("customHeight: outputSize.height"), "smart background request passes explicit output height");
assert(files.ai.includes("postProductBackground"), "client API has create-background POST wrapper");
assert(files.ai.includes("/api/images/create-background"), "client API points to create-background endpoint");
assert(files.index.includes('app.post("/api/images/create-background"'), "server exposes create-background route");
assert(files.server.includes('"r-background"'), "PicWish r-background task type is registered");
assert(files.server.includes('runPicWishImageTask("r-background"'), "smart background uses PicWish r-background task");
assert(files.server.includes("normalizeProductBackgroundResultToOutput"), "smart background normalizes generated bitmap dimensions before returning");
assert(files.server.includes("Final bitmap size must be exactly"), "smart background prompt includes exact target bitmap instruction");
assert(files.server.includes("Do not leave black bars, empty areas, transparent gutters, blurred borders, or letterboxing."), "smart background explicitly rejects black bars and empty areas");
assert(files.server.includes("return normalizeProductBackgroundResultToOutput(generated, output);"), "reference-background generation path is normalized to selected output size");
assert(files.server.includes("await normalizeProductBackgroundResultToOutput(await createBackgroundWithPicWish(input), output)"), "PicWish r-background path is normalized to selected output size");
assert(files.server.includes("createPicWishMaskedRemovalTask"), "eraser remains on the isolated PicWish masked removal path");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Smart background verification passed");
