import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { __testNormalizeGeneratedImageSrc, __testNormalizeGeneratedImagesToTargetAspect, __testPreparePicWishEraseSourceImage, __testResolveHighDefinitionTargetSize } from "./image-generation";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("generated image source normalization", () => {
  it("converts provider bare base64 payloads into data URLs", () => {
    expect(__testNormalizeGeneratedImageSrc(ONE_PIXEL_PNG_BASE64, "https://token.bkeel.com/v1"))
      .toBe(`data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`);
  });

  it("keeps relative provider paths as absolute URLs", () => {
    expect(__testNormalizeGeneratedImageSrc("/files/generated.png", "https://token.bkeel.com/v1"))
      .toBe("https://token.bkeel.com/v1/files/generated.png");
  });

  it("normalizes generated bitmap pixels to the requested aspect size", async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();

    const [image] = await __testNormalizeGeneratedImagesToTargetAspect(
      [{ src: `data:image/png;base64,${input.toString("base64")}`, width: 120, height: 120 }],
      864,
      1536,
    );
    const output = Buffer.from(image.src.split(";base64,")[1] || "", "base64");
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(864);
    expect(metadata.height).toBe(1536);
    expect(image.width).toBe(864);
    expect(image.height).toBe(1536);
  });

  it("keeps AI output dimensions at least as large as the source bitmap", () => {
    expect(__testResolveHighDefinitionTargetSize(420, 560, 1080, 1440))
      .toEqual({ width: 1152, height: 1536 });
  });

  it("raises small AI output dimensions to a high-definition long side", () => {
    expect(__testResolveHighDefinitionTargetSize(512, 512, 512, 512))
      .toEqual({ width: 1536, height: 1536 });
  });

  it("prepares PicWish eraser source images at the high-definition target size", async () => {
    const input = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: "#111111",
      },
    }).png().toBuffer();

    const output = await __testPreparePicWishEraseSourceImage(input, 1536, 1152);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(1152);
    expect(metadata.format).toBe("png");
  });
});
