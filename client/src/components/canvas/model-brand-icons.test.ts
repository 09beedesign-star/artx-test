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
    /**
     * ⚠️ 2026-09-15：模型选择器的那个 surface 从 InfiniteCanvas.tsx 迁到了
     * ModelSelector.tsx（画布与首页共用一份）。这条断言锚的是
     * 「渲染品牌图标的那份源码」—— 代码搬家，锚点必须跟着搬。
     *
     * 用例名里的 "both surfaces" 指的始终是「模型选择器」和「画布节点」两个渲染面，
     * 而不是两个具体文件名。文件叫什么不重要，两个面都用共享渲染器才重要。
     */
    const modelSelectorSource = readFileSync("client/src/components/canvas/ModelSelector.tsx", "utf8");
    const canvasNodesSource = readFileSync("client/src/components/canvas/CanvasNodes.tsx", "utf8");

    expect(modelSelectorSource).toContain('from "./model-brand-icons"');
    expect(canvasNodesSource).toContain('from "./model-brand-icons"');
    expect(modelSelectorSource).toContain("<ModelBrandIconMask");
    expect(canvasNodesSource).toContain("<ModelBrandIconMask");
    expect(modelSelectorSource).not.toContain("function GeminiBrandIcon");
    expect(canvasNodesSource).not.toContain("function GeminiModelIcon");

    // 迁移后旧文件不得留副本（两份实现同时存在时 tsc 不报错、测试也能过，
    // 但后续改动只会落在其中一份 —— 又回到「同一份数据多个出口」）。
    const infiniteCanvasSource = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
    expect(infiniteCanvasSource).not.toContain("function GeminiBrandIcon");
    expect(infiniteCanvasSource).toContain('from "./ModelSelector"');
  });
});
