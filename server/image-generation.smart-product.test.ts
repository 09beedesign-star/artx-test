import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { __testCompositeProtectedProductOnBackground } from "./image-generation";

describe("smart product generation prompt", () => {
  const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf-8");

  it("keeps the uploaded product outside every background model request", () => {
    expect(source).toContain("removeBackgroundPreservingForegroundPixels(input.imageSrc)");
    expect(source).toContain("Generate the empty ecommerce background plate only");
    expect(source).toContain("Do not include any product, person, packaging, logo, or foreground object.");
  });

  it("protects the PicWish cutout while routing background plates through Image2 then Gemini", () => {
    expect(source).toContain("const cutout = await removeBackgroundPreservingForegroundPixels(input.imageSrc)");
    expect(source).toContain("const protectedProduct = cutout.images[0]");
    expect(source).toContain("Generate the empty ecommerce background plate only");
    expect(source).toContain('model: "gpt-image-2"');
    expect(source).toContain("Image2 background plate failed; retrying with Gemini");
    expect(source).toContain('model: "gemini-3.1-flash-image"');
    expect(source).toContain("compositeProtectedProductOnBackground");
    expect(source).toContain("createProductContactShadow");
    expect(source).toContain("Image2 and Gemini background plates failed; using PicWish smart product background fallback");
    expect(source).toContain("export const __testCompositeProtectedProductOnBackground");
  });

  it("keeps protected product pixels in the composited image", async () => {
    const background = await sharp({
      create: { width: 120, height: 90, channels: 4, background: { r: 30, g: 90, b: 180, alpha: 1 } },
    }).png().toBuffer();
    const product = await sharp({
      create: { width: 40, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{
      input: { create: { width: 28, height: 44, channels: 4, background: { r: 230, g: 20, b: 20, alpha: 1 } } },
      left: 6,
      top: 8,
    }]).png().toBuffer();
    const result = await __testCompositeProtectedProductOnBackground(
      { src: `data:image/png;base64,${background.toString("base64")}`, width: 120, height: 90 },
      { src: `data:image/png;base64,${product.toString("base64")}`, width: 40, height: 60 },
      120,
      90,
    );
    const output = Buffer.from(result.src.split(",")[1] || "", "base64");
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    const pixel = (60 * info.width + 60) * info.channels;

    expect(info).toMatchObject({ width: 120, height: 90 });
    expect(data[pixel]).toBeGreaterThan(180);
    expect(data[pixel + 1]).toBeLessThan(60);
    expect(data[pixel + 2]).toBeLessThan(60);
  });
});
