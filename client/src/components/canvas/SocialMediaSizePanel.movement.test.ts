import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("multi-platform cover image movement", () => {
  it("supports drag and directional nudges with per-preset transforms", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const block = source.match(
      /function SocialMediaSizePanel[\s\S]*?(?=\nfunction AssetMoreCommandPanel)/
    )?.[0];

    expect(block).toBeTruthy();
    expect(block).toContain("updatePresetTransform");
    expect(block).toContain("handleCropPointerDown");
    expect(block).toContain("handleCropPointerMove");
    expect(block).toContain("nudgePreview(0, -0.04)");
    expect(block).toContain("nudgePreview(0, 0.04)");
    expect(block).toContain("nudgePreview(-0.04, 0)");
    expect(block).toContain("nudgePreview(0.04, 0)");
    expect(block).toContain("transforms: coverTransforms");
  });
});
