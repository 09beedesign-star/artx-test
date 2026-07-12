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

  it("uses the product-preserving PicWish path for smart commerce when no background reference is supplied", () => {
    expect(source).toContain("if (input.skillId && !hasBackgroundReference)");
    expect(source).toContain("const result = await createBackgroundWithPicWish(input)");
    expect(source).toContain("PicWish smart commerce background failed; using reference generation fallback");
    expect(source.indexOf("if (input.skillId && !hasBackgroundReference)")).toBeLessThan(
      source.indexOf("if (hasBackgroundReference || count > 1 || input.skillId)")
    );
  });
});
