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
    expect(createBackgroundSource).toContain("scene_type: 105");
    expect(createBackgroundSource).toContain("width: output.width");
    expect(createBackgroundSource).toContain("height: output.height");
    expect(createProductBackgroundSource).toContain("createBackgroundWithPicWish({");
    expect(createProductBackgroundSource).not.toContain("generateImages(");
    expect(createProductBackgroundSource).not.toContain("getImageModelFallbackAttempts(");
    expect(createProductBackgroundSource).not.toContain("Image2");
    expect(createProductBackgroundSource).not.toContain("Gemini");
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
