import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InfiniteCanvas prompt controls", () => {
  it("uses the minimap surface color for prompt model and Skill button defaults while keeping hover styling", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("getMinimapSurfaceBackground");
    expect(source).toContain("const bg = getMinimapSurfaceBackground(isDark)");
    expect(source).toContain("hoverButtonBg");
    expect(source).toContain("buttonHover");
  });

  it("keeps quick image edits on the source-image edit path instead of pure text-to-image generation", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const quickEditBlock = source.match(
      /const handleAssetEditSubmit = useCallback[\s\S]*?const handleSingleImageToolbarAction/
    )?.[0];

    expect(quickEditBlock).toBeTruthy();
    expect(quickEditBlock).toContain("editImageWithPrompt({");
    expect(quickEditBlock).toContain("imageSrc: latestImageSrc");
    expect(quickEditBlock).toContain("targetWidth: sourceSize.width");
    expect(quickEditBlock).toContain("targetHeight: sourceSize.height");
    expect(quickEditBlock).toContain("referencedAssets: payload.references");
    expect(quickEditBlock).not.toContain("generateAiImages({");
  });
});
