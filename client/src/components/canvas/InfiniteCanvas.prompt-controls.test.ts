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

  it("mounts the smart commerce workflow without replacing the existing canvas generation owner", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("SmartCommerceProductDialog");
    expect(source).toContain('label: "智能电商产品"');
    expect(source).toContain('"smart-commerce-product-create"');
    expect(source).toContain("CustomEvent<SmartCommerceProductCreateDetail>");
    expect(source).toContain("Math.min(Number(detail.count) || 1, 9)");
    expect(source).toContain('tags: ["智能电商产品", detail.style]');
    expect(source).toContain('style: "智能电商产品结果"');
    expect(source).toContain("maxResultCount = 4");
    expect(source).toContain("Math.min(Number(resultCount) || 1, maxResultCount)");
    expect(source).toContain("maxResultCount: 9");
    expect(source).toContain("commerceContext: {");
    expect(source).toContain("commerceContext: detail.commerceContext");
    expect(source).toContain('new CustomEvent("canvas-assistant-external-message"');
    expect(source).toContain('content: detail.userPrompt || "未填写"');
    expect(source).not.toContain("智能电商产品生成提示词");
    expect(source).not.toContain("User creative addition:");
    expect(source).not.toContain("输出规格：${smartProductOutputSpec}");
  });

  it("shows multi-platform cover directly above download in the selected-image toolbar", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const assetTools = source.match(
      /const assetTools: FloatingToolItem\[\] = \[[\s\S]*?const frameTools/
    )?.[0];
    const moreItems = source.match(/const moreItems = \[[\s\S]*?\n  \];/)?.[0];
    const assetToolbar = source.match(
      /function AssetFloatingToolbar[\s\S]*?\/\/ ── Multi Image Selection Floating Toolbar/
    )?.[0];

    expect(assetTools).toBeTruthy();
    expect(moreItems).toBeTruthy();
    expect(assetToolbar).toBeTruthy();
    expect(assetTools).toContain('label: "多平台封面", action: "mockup"');
    expect(assetTools!.indexOf('label: "多平台封面"')).toBeLessThan(
      assetTools!.indexOf('label: "下载"')
    );
    expect(moreItems).not.toContain('label: "多平台封面"');
    expect(assetToolbar).toContain("zIndex: 110");
  });

  it("keeps explicit replace and delete controls in the product background upload slots", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const dialogBlock = source.match(
      /function ProductBackgroundDialog[\s\S]*?\/\/ ── Canvas Top Tool Palette/
    )?.[0];

    expect(dialogBlock).toBeTruthy();
    expect(dialogBlock).toContain("const clearUploadSlot = useCallback");
    expect(dialogBlock).toContain("setImageSrc(\"\")");
    expect(dialogBlock).toContain("setBackgroundReferenceSrc(\"\")");
    expect(dialogBlock).toContain("替换");
    expect(dialogBlock).toContain("删除");
  });

  it("routes Mac touchpad pinch gestures to canvas zoom instead of browser zoom", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain(
      "const shouldZoomCanvas = event.ctrlKey || (isMacPlatform && event.metaKey);"
    );
    expect(source).toContain(
      'root.addEventListener("wheel", handleCanvasWheel, { capture: true, passive: false });'
    );
    expect(source).toContain(
      'root.addEventListener("gesturechange", handleGestureChange, { capture: true, passive: false });'
    );
    expect(source).toContain("zoomCanvasAtClientPoint");
  });

  it("keeps canvas image references explicit so normal clicks do not auto-fill prompt chips", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('if (additive) {');
    expect(source).toContain('new CustomEvent("asset-reference"');
    expect(source).toContain('window.addEventListener("asset-reference", handler)');
    expect(source).not.toContain("Sync selected image nodes → referencedAssets chips");
  });

  it("persists derived canvas AI tasks with backend task input so reloads do not restart them as text-to-image", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("backgroundTaskInput?: ImageGenerationTaskInput");
    expect(source).toContain("runImageGenerationTask({");
    expect(source).toContain('capability: "smart_background"');
    expect(source).toContain('operation: "create-background"');
    expect(source).toContain('capability: "image_erase"');
    expect(source).toContain('capability: "image_expansion"');
    expect(source).toContain('capability: "image_edit"');
    expect(source).toContain('capability: "background_removal"');
    expect(source).toContain('capability: "image_enhance"');
    expect(source).toContain('capability: "watermark_removal"');
    expect(source).toContain("task.editMode || task.sourceImageSrc");
  });

  it("shows a generated-image cloud retention reminder under the image once per day", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('const CLOUD_RETENTION_TOAST_STORAGE_KEY = "artx:cloud-retention-toast-date"');
    expect(source).toContain("const showCloudRetentionToast = shouldShowCloudRetentionToast()");
    expect(source).toContain("markCloudRetentionToastShown()");
    expect(source).toContain("showCloudRetentionToast: showCloudRetentionToast && index === 0");
    expect(source).toContain("图片会在云服务器当中存储一周时间，请尽快下载到本地，以免图片丢失哟。");
    expect(source).toContain("top: `calc(100% + ${4 * stableUiScale}px)`");
  });

  it("uses the dynamic image model catalog in the bottom assistant selector", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const assistantBlock = source.match(
      /function CanvasAssistantPanel[\s\S]*?const activeSkillContext/
    )?.[0];

    expect(assistantBlock).toBeTruthy();
    expect(assistantBlock).toContain("const imageModelOptions = useImageModelOptions()");
    expect(assistantBlock).toContain("const assistantImageModelOptions = useMemo");
    expect(assistantBlock).toContain("assistantImageModelOptions.find(model => model.id === assistantImageModelId)");
    expect(assistantBlock).toContain('assistantModelTab === "image" ? assistantImageModelOptions : TEXT_AI_MODELS');
    expect(assistantBlock).not.toContain("IMAGE_AI_MODELS.find(model => model.id === assistantImageModelId)");
    expect(assistantBlock).not.toContain('assistantModelTab === "image" ? IMAGE_AI_MODELS : TEXT_AI_MODELS');
  });

  it("renders model brand icons aligned to the title row", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('from "./model-brand-icons"');
    expect(source).toContain("const iconKind = getModelBrandIconKind(modelId, icon)");
    expect(source).toContain("<ModelBrandIconMask kind={iconKind} size={14} />");
    expect(source).toContain('data-model-brand-icon={iconKind}');
    expect(source).toContain("marginTop: 2");
    expect(source).toContain('className="flex min-w-0 items-start gap-2.5"');
  });
});
