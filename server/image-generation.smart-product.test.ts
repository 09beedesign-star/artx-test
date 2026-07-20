import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("smart product PicWish r-background route", () => {
  const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf-8");

  it("uses PicWish r-background directly without Image2 or Gemini background fallback", () => {
    const createBackgroundSource =
      source.match(/async function createBackgroundWithPicWish[\s\S]*?\n}/)?.[0] || "";
    const createProductBackgroundSource =
      source.match(/export async function createProductBackground[\s\S]*?return withProviderTaskIds/)?.[0] || "";

    expect(createBackgroundSource).toContain('runPicWishImageTask("r-background"');
    expect(createBackgroundSource).not.toContain("scene_type");
    expect(createBackgroundSource).toContain("width: output.width");
    expect(createBackgroundSource).toContain("height: output.height");
    expect(source).toContain("async function prepareProductCutoutForBackgroundGenerator");
    expect(createProductBackgroundSource).toContain("const preparedProductImage = await prepareProductCutoutForBackgroundGenerator");
    expect(createProductBackgroundSource).toContain("imageSrc: preparedProductImage.imageSrc");
    expect(createProductBackgroundSource).toContain("prompt: buildSmartProductVariationPrompt(prompt, index, count)");
    expect(createProductBackgroundSource).toContain("count: 1");
    expect(createProductBackgroundSource).toContain("customWidth: output.width");
    expect(createProductBackgroundSource).toContain("customHeight: output.height");
    expect(createProductBackgroundSource).toContain("createBackgroundWithPicWish({");
    expect(createProductBackgroundSource).not.toContain("generateImages(");
    expect(createProductBackgroundSource).not.toContain("getImageModelFallbackAttempts(");
    expect(createProductBackgroundSource).not.toContain("Image2");
    expect(createProductBackgroundSource).not.toContain("Gemini");
  });

  it("keeps every smart product ratio on the selected-ratio transparent canvas path", () => {
    const ratioBlock = source.match(/const ratioToSize[\s\S]*?\n};/)?.[0] || "";
    const createProductBackgroundSource =
      source.match(/export async function createProductBackground[\s\S]*?return withProviderTaskIds/)?.[0] || "";

    ["1:1", "4:5", "5:4", "3:4", "4:3", "16:9", "9:16", "21:9"].forEach((ratio) => {
      expect(ratioBlock).toContain(`"${ratio}"`);
    });
    expect(createProductBackgroundSource).toContain("const output = getBackgroundOutputSize(input, sourceDimensions.width, sourceDimensions.height)");
    expect(createProductBackgroundSource).toContain("prepareProductCutoutForBackgroundGenerator(");
    expect(createProductBackgroundSource).toContain("output.width");
    expect(createProductBackgroundSource).toContain("output.height");
    expect(createProductBackgroundSource).not.toContain('if (input.ratio === "16:9")');
  });

  it("removes the old model-generated plate and local composite implementation", () => {
    expect(source).not.toContain("generateSmartProductBackgroundPlates");
    expect(source).not.toContain("Generate the empty ecommerce background plate only");
    expect(source).not.toContain("Smart product background plate failed; retrying next model");
    expect(source).not.toContain("Image2 and Gemini background plates failed");
    expect(source).not.toContain("compositeProtectedProductOnBackground");
    expect(source).not.toContain("createProductGroundedShadow");
  });
});
