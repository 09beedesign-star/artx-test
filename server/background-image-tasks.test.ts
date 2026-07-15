import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("background image task routing", () => {
  it("routes non-text AI image capabilities through the shared /api/images/tasks worker", () => {
    const source = readFileSync(resolve(__dirname, "index.ts"), "utf-8");

    expect(source).toContain("async function runBackgroundImageTask");
    expect(source).toContain('case "smart_background":');
    expect(source).toMatch(/createProductBackground\([^)]*input/);
    expect(source).toContain('provider: "PicWish 主体保护 + Image2/Gemini 背景"');
    expect(source).toContain('model: "gpt-image-2 -> gemini-3.1-flash-image"');
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
    expect(source).toContain('case "image_expansion":');
    expect(source).toContain("expandImageWithPicWish");
  });
});
