import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { __testHasPicWishExpansionMargins, __testNormalizeGeneratedImageSrc, __testNormalizeGeneratedImagesToTargetAspect, __testNormalizePicWishExpansionRatio, __testPreparePicWishEraseSourceImage, __testResolveHighDefinitionTargetSize, __testResolveReferenceImageRoute, editImageWithPrompt, extractImageText } from "./image-generation";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generated image source normalization", () => {
  it("prefers image2 medium for smart product references before Gemini fallback", () => {
    expect(__testResolveReferenceImageRoute("og-image2-medium", true, true)).toEqual({
      usesChatPath: false,
      fallbackModel: "gemini-3.5-flash-preview",
    });
    expect(__testResolveReferenceImageRoute("gemini-3.5-flash-preview", true, true)).toEqual({
      usesChatPath: true,
      fallbackModel: "gemini-3.5-flash-preview",
    });
    expect(__testResolveReferenceImageRoute("og-image2-medium", true, false)).toEqual({
      usesChatPath: true,
      fallbackModel: "og-image2-medium",
    });
  });

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

  it("uses explicit PicWish expansion margins when any side extends", () => {
    expect(__testHasPicWishExpansionMargins({ top: 24, bottom: 0, left: 0, right: 0 })).toBe(true);
    expect(__testHasPicWishExpansionMargins({ top: 0, bottom: 0, left: 0, right: 0 })).toBe(false);
    expect(__testHasPicWishExpansionMargins({})).toBe(false);
  });

  it("normalizes PicWish image expansion margins as provider ratios", () => {
    expect(__testNormalizePicWishExpansionRatio(0.25)).toBe(0.25);
    expect(__testNormalizePicWishExpansionRatio(3)).toBe(1);
    expect(__testNormalizePicWishExpansionRatio(0)).toBeUndefined();
    expect(__testNormalizePicWishExpansionRatio("bad")).toBeUndefined();
  });

  it("falls back to reference-image generation when the image edit endpoint is unavailable", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "og-image2-medium");

    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();
    const edited = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: "#00ff00",
      },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/images/edits")) {
        return new Response(JSON.stringify({ error: { message: "Not Found" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (endpoint.endsWith("/chat/completions")) {
        return Response.json({
          choices: [{
            message: {
              images: [{ url: `data:image/png;base64,${edited.toString("base64")}` }],
            },
          }],
        });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await editImageWithPrompt({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
      prompt: "Add a green marker",
      targetWidth: 96,
      targetHeight: 64,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].width).toBe(1536);
    expect(result.images[0].height).toBe(1024);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/images/edits"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/chat/completions"))).toBe(true);
  });

  it("falls back to multimodal text extraction when image OCR returns empty text", async () => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-image-key");
    vi.stubEnv("AI_IMAGE_BASE_URL", "https://image.example/v1");
    vi.stubEnv("AI_IMAGE_MODEL", "og-image2-medium");
    vi.stubEnv("AI_TEXT_API_KEY", "test-text-key");
    vi.stubEnv("AI_TEXT_BASE_URL", "https://text.example/v1");
    vi.stubEnv("AI_TEXT_MODEL", "gpt-5.4-mini");

    const source = await sharp({
      create: {
        width: 160,
        height: 90,
        channels: 3,
        background: "#ffffff",
      },
    }).png().toBuffer();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const endpoint = String(url);
      if (endpoint.startsWith("https://image.example")) {
        return Response.json({ choices: [{ message: { content: "" } }] });
      }
      if (endpoint.startsWith("https://text.example")) {
        return Response.json({ choices: [{ message: { content: "SALE 2026\nARTX TEST" } }] });
      }
      throw new Error(`Unexpected fetch ${endpoint}`);
    });

    const result = await extractImageText({
      imageSrc: `data:image/png;base64,${source.toString("base64")}`,
    });

    expect(result.text).toBe("SALE 2026\nARTX TEST");
    expect(result.provider).toBe("vision-chat-ocr+text-fallback");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://image.example"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://text.example"))).toBe(true);
  });
});
