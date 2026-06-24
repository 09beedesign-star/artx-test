import fs from "node:fs";

const source = fs.readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

const marker = "const handleAssetEditSubmit = useCallback";
const start = source.indexOf(marker);
const end = source.indexOf("const handleSingleImageToolbarAction", start);
assert(start >= 0 && end > start, "quick edit handler block can be located");

const block = start >= 0 && end > start ? source.slice(start, end) : "";
assert(block.includes("run: async () => editImageWithPrompt({"), "quick edit uses image edit API instead of text-to-image generation");
assert(block.includes("imageSrc: latestImageSrc"), "quick edit sends the selected/latest image as the target canvas");
assert(block.includes("referencedAssets: payload.references"), "quick edit keeps optional references as secondary references");
assert(block.includes("targetWidth: sourceSize.width") && block.includes("targetHeight: sourceSize.height"), "quick edit preserves selected image dimensions");
assert(!block.includes("run: async () => generateAiImages({"), "quick edit no longer calls pure image generation");
assert(block.includes("use the selected image as the target canvas"), "quick edit prompt explicitly prevents loose-reference regeneration");
assert(source.includes("run: async () => removeImageBackground({"), "background removal path remains present");
assert(source.includes("run: async () => expandImageWithMask({"), "image expansion path remains present");
assert(source.includes("run: async () => eraseImageObjects({"), "eraser path remains present");
assert(source.includes("run: async () => createProductBackground({"), "smart background path remains present");

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Quick edit image-edit verification passed");
