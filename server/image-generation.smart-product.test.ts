import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("smart product generation prompt", () => {
  const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf-8");

  it("locks smart commerce output to the uploaded product reference", () => {
    expect(source).toContain("const SMART_PRODUCT_SUBJECT_LOCK_PROMPT");
    expect(source).toContain("reference image 1 is the only product subject");
    expect(source).toContain("Do not replace the uploaded product");
    expect(source).toContain("templates, platform rules, and background references only for scene layout");
    expect(source).toContain("Return complete product commercial images. Do not crop, distort, redraw, replace, or reinterpret the product.");
  });

  it("uses the reference-image generation path for smart commerce even without a background reference", () => {
    expect(source).not.toContain("if (input.skillId && !hasBackgroundReference)");
    expect(source).toContain("if (hasBackgroundReference || count > 1 || input.skillId)");
    expect(source.indexOf("if (hasBackgroundReference || count > 1 || input.skillId)")).toBeLessThan(
      source.indexOf("return await createBackgroundWithPicWish(input)")
    );
  });
});
