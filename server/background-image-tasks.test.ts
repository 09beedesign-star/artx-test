import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("background image task routing", () => {
  it("routes non-text AI image capabilities through the shared /api/images/tasks worker", () => {
    const source = readFileSync(resolve(__dirname, "index.ts"), "utf-8");

    expect(source).toContain("async function runBackgroundImageTask");
    expect(source).toContain("reserveTestAccountAiUsage");
    expect(source).toContain("releaseTestAccountAiUsage");
    expect(source).toContain('case "smart_background":');
    expect(source).toMatch(/createProductBackground\([^)]*input/);
    expect(source).toContain('provider: "PicWish/佐糖 r-background"');
    expect(source).toContain('model: getRouteModel(input, "picwish-r-background")');
    expect(source).toContain('case "image_edit":');
    expect(source).toMatch(/editImageWithPrompt\([^)]*input/);
    expect(source).toContain('case "background_removal":');
    expect(source).toMatch(/removeImageBackground\([^)]*input/);
    expect(source).toContain('case "image_enhance":');
    expect(source).toMatch(/enhanceImage\([^)]*input/);
    expect(source).toContain('case "watermark_removal":');
    expect(source).toMatch(/removeImageWatermark\([^)]*input/);
    expect(source).toContain('case "image_erase":');
    expect(source).toMatch(/eraseImageObjects\([^)]*input/);
    expect(source).toContain('case "element_background":');
    expect(source).toMatch(/createElementBackgroundLayer\([^)]*input/);
    expect(source).toContain('case "image_expansion":');
    expect(source).toContain("expandImageWithPicWish");
    expect(source).not.toContain('process.env.AI_IMAGE_MODEL || "gpt-image-2"');
  });

  it("keeps PicWish task preflight independent from selectable image models", () => {
    const source = readFileSync(resolve(__dirname, "index.ts"), "utf-8");

    expect(source).toContain("function getBackgroundImageTaskPreflightTracking");
    expect(source).toContain("const preflightTracking = getBackgroundImageTaskPreflightTracking(req.body || {}, taskCapability);");

    expect(source).toContain('capabilityKey: "smart_background"');
    expect(source).toContain('model: getRouteModel(input, "picwish-r-background")');
    expect(source).toContain('capabilityKey: "background_removal"');
    expect(source).toContain('model: getRouteModel(input, "picwish-segmentation")');
    expect(source).toContain('capabilityKey: "image_enhance"');
    expect(source).toContain('model: getRouteModel(input, "picwish-scale")');
    expect(source).toContain('capabilityKey: "watermark_removal"');
    expect(source).toContain('model: getRouteModel(input, "picwish-watermark")');
    expect(source).toContain('capabilityKey: "image_erase"');
    expect(source).toContain('model: getRouteModel(input, "picwish-remove-unwanted-object")');
    expect(source).toContain('capability: "编辑元素背景层"');
    expect(source).toContain('model: getRouteModel(input, "picwish-inpaint")');
    expect(source).toContain('capabilityKey: "image_expansion"');
    expect(source).toContain('model: getRouteModel(input, "picwish-advanced-image-expand")');

    expect(source).toContain('capabilityKey: "image_edit"');
    expect(source).toContain('provider: "AI_IMAGE"');
    expect(source).toContain("model: getDefaultRouteImageModel(input)");
  });

  it("keeps the public background-removal command on pure PicWish segmentation", () => {
    const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf-8");
    const removeImageBackgroundSource =
      source.match(/export async function removeImageBackground[\s\S]*?\n}/)?.[0] || "";
    const purePicWishSource =
      source.match(/async function removeBackgroundWithPurePicWish[\s\S]*?\n}/)?.[0] || "";

    expect(removeImageBackgroundSource).toContain("removeBackgroundWithPurePicWish(input.imageSrc)");
    expect(removeImageBackgroundSource).not.toContain("removeBackgroundPreservingForegroundPixels");
    expect(purePicWishSource).toContain("removeBackgroundWithPicWish(buffer, mimeType)");
    expect(purePicWishSource).not.toContain("removeFaceWithPicWish");
    expect(purePicWishSource).not.toContain("removeBackgroundByConservativeEdgeColor");
    expect(source).toContain('return_type: 1');
    expect(source).toContain('output_type: 2');
    expect(source).toContain('crop: 0');
    expect(source).toContain('format: "png"');
    expect(source).toContain('if (taskType === "segmentation")');
    expect(source).toContain("data.data?.image_obj || data.data?.image");
  });

  it("keeps smart product images on the PicWish r-background endpoint", () => {
    const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf-8");
    const createBackgroundSource =
      source.match(/async function createBackgroundWithPicWish[\s\S]*?\n}/)?.[0] || "";
    const createProductBackgroundSource =
      source.match(/export async function createProductBackground[\s\S]*?return withProviderTaskIds/)?.[0] || "";

    expect(createBackgroundSource).toContain('runPicWishImageTask("r-background"');
    expect(createBackgroundSource).toContain("batch_size: batchSize");
    expect(createBackgroundSource).not.toContain("scene_type");
    expect(createBackgroundSource).toContain("width: output.width");
    expect(createBackgroundSource).toContain("height: output.height");
    expect(createProductBackgroundSource).toContain("const productCutout = await removeBackgroundWithPicWish(buffer, mimeType)");
    expect(createProductBackgroundSource).toContain("imageSrc: productImageSrc");
    expect(createProductBackgroundSource).toContain("createBackgroundWithPicWish({");
    expect(createProductBackgroundSource).not.toContain("generateImages(");
    expect(createProductBackgroundSource).not.toContain("generateSmartProductBackgroundPlates(");
  });
});
