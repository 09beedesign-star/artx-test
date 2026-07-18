import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getModelBrandIconKind, MODEL_BRAND_ICON_URLS } from "./model-brand-icons";

describe("canvas model brand icons", () => {
  it("maps image model brands to the uploaded SVG assets", () => {
    expect(getModelBrandIconKind("gemini-3.5-flash-preview")).toBe("banana");
    expect(getModelBrandIconKind("gemini-3.1-flash-image")).toBe("banana");
    expect(getModelBrandIconKind("nano-banana")).toBe("banana");
    expect(getModelBrandIconKind("jimeng-4.0")).toBe("jimeng");
    expect(getModelBrandIconKind("mj-v7")).toBe("midjourney");
    expect(getModelBrandIconKind("og-image2-high")).toBe("openai");
    expect(getModelBrandIconKind("kling-2.1")).toBe("kling");

    expect(MODEL_BRAND_ICON_URLS).toMatchObject({
      banana: expect.stringContaining("banana.svg"),
      jimeng: expect.stringContaining("jimeng.svg"),
      midjourney: expect.stringContaining("midjourney.svg"),
      openai: expect.stringContaining("chatgpt.svg"),
      kling: expect.stringContaining("kling.svg"),
    });
  });

  it("uses the shared uploaded icon renderer in both model selector surfaces", () => {
    const infiniteCanvasSource = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
    const canvasNodesSource = readFileSync("client/src/components/canvas/CanvasNodes.tsx", "utf8");

    expect(infiniteCanvasSource).toContain('from "./model-brand-icons"');
    expect(canvasNodesSource).toContain('from "./model-brand-icons"');
    expect(infiniteCanvasSource).toContain("<ModelBrandIconMask");
    expect(canvasNodesSource).toContain("<ModelBrandIconMask");
    expect(infiniteCanvasSource).not.toContain("function GeminiBrandIcon");
    expect(canvasNodesSource).not.toContain("function GeminiModelIcon");
  });
});
