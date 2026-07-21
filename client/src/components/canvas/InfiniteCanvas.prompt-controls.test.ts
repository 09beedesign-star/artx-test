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

  it("uses the selected canvas image model for annotation edits while auto keeps the local-edit default", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const annotationEditBlock = source.match(
      /const handleAnnotationAiEdit = useCallback[\s\S]*?const cloneNodesForHistory/
    )?.[0];

    expect(annotationEditBlock).toBeTruthy();
    expect(source).toContain("function getStoredCanvasAssistantImageEditModel()");
    expect(source).toContain('if (autoMode) return "gpt-image-2"');
    expect(annotationEditBlock).toContain(
      "const selectedImageEditModel = getStoredCanvasAssistantImageEditModel();"
    );
    expect(annotationEditBlock).toContain("maskSrc: annotationMask.maskSrc");
    expect(annotationEditBlock).toContain("model: selectedImageEditModel");
  });

  it("mounts the smart commerce workflow without replacing the existing canvas generation owner", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("SmartCommerceProductDialog");
    expect(source).toContain('label: "智能产品图"');
    expect(source).toContain('<AiProductIcon size={17} cutoutBg={bg} />');
    expect(source).toContain('"smart-commerce-product-create"');
    expect(source).toContain("CustomEvent<SmartCommerceProductCreateDetail>");
    expect(source).toContain("Math.min(Number(detail.count) || 1, 9)");
    expect(source).toContain('tags: ["智能产品图", detail.style]');
    expect(source).toContain('style: "智能产品图结果"');
    expect(source).toContain("maxResultCount = 4");
    expect(source).toContain("Math.min(Number(resultCount) || 1, maxResultCount)");
    expect(source).toContain("maxResultCount: 9");
    expect(source).toContain('new CustomEvent("canvas-assistant-external-message"');
    expect(source).toContain('content: detail.userPrompt || "未填写"');
    expect(source).not.toContain("commerceContext: {");
    expect(source).not.toContain("commerceContext: detail.commerceContext");
    expect(source).not.toContain("detail.platformLabel");
    expect(source).not.toContain("detail.marketLabel");
    expect(source).not.toContain("detail.placementLabel");
    expect(source).not.toContain("智能电商产品生成提示词");
    expect(source).not.toContain("User creative addition:");
    expect(source).not.toContain("输出规格：${smartProductOutputSpec}");
  });

  it("places count and common ratio selectors beside Skill and keeps each result as a canvas node", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    expect(source).toContain("function ImageCountSelector");
    expect(source).toContain("[1, 2, 3, 4].map(count =>");
    expect(source).toContain("const [assistantImageCount, setAssistantImageCount] = useState(1);");
    expect(source).toContain("<ImageCountSelector");
    expect(source).toContain("onChange={setAssistantImageCount}");
    expect(source).toContain("function ImageRatioSelector");
    expect(source).toContain("const CANVAS_ASSISTANT_IMAGE_RATIOS = [");
    expect(source).toContain('"16:9"');
    expect(source).toContain('"9:16"');
    expect(source).toContain('useState<CanvasAssistantImageRatio>("auto")');
    expect(source).toContain("<ImageRatioSelector");
    expect(source).toContain("onChange={setAssistantImageRatio}");
    expect(source).toContain('assistantImageRatio === "auto"');
    expect(source).toContain("ratio: skillRatio");
    expect(source.match(/count: requestedImageCount/g)).toHaveLength(2);
    expect(
      source.match(
        /getValidGeneratedImages\(\s*result\.images,\s*requestedImageCount/g
      )
    ).toHaveLength(2);
    expect(source).toContain("{ length: requestedCount }");
    expect(source).toContain("generationIndex: index");
  });

  it("passes the bottom prompt count and selected ratio to image generation", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const bottomPromptBlock = source.match(
      /function BottomPromptBar\([\s\S]*?function AssetEditPromptBar\(/
    )?.[0];

    expect(bottomPromptBlock).toBeTruthy();
    expect(bottomPromptBlock).toContain("const [count, setCount] = useState(1);");
    expect(bottomPromptBlock).toContain("<ImageCountSelector");
    expect(bottomPromptBlock).toContain("onChange={setCount}");
    expect(bottomPromptBlock).toContain("ratio,");
    expect(bottomPromptBlock).toContain("count,");
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

  it("keeps explicit replace and delete controls in the smart commerce product upload slot", () => {
    const dialogSource = readFileSync(
      resolve(__dirname, "SmartCommerceProductDialog.tsx"),
      "utf-8"
    );

    expect(dialogSource).toContain("setImageSrc(\"\")");
    expect(dialogSource).toContain("setFileName(\"\")");
    expect(dialogSource).toContain("替换");
    expect(dialogSource).toContain("删除");
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

  it("keeps recovered assistant message images compact inside the right conversation panel", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const backupImageBlock = source.match(
      /src=\{getCanvasRenderableImageSrc\(backup\.src\)\}[\s\S]*?cursor: "zoom-in"/
    )?.[0];

    expect(backupImageBlock).toBeTruthy();
    expect(backupImageBlock).toContain('width: "25%"');
    expect(backupImageBlock).not.toContain('className="w-full');
  });

  it("persists derived canvas AI tasks with backend task input so reloads do not restart them as text-to-image", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("backgroundTaskInput?: ImageGenerationTaskInput");
    expect(source).toContain("runImageGenerationTask({");
    expect(source).toContain('capability: "smart_background"');
    expect(source).toContain('operation: "create-background"');
    expect(source).toContain('capability: "image_erase"');
    expect(source).toContain('capability: "element_background"');
    expect(source).toContain('foregroundLayerSrc: foregroundImage.src');
    expect(source).not.toContain("createEraseMaskFromTransparentLayer");
    expect(source).toContain('capability: "image_expansion"');
    expect(source).toContain('capability: "image_edit"');
    expect(source).toContain('capability: "background_removal"');
    expect(source).toContain('capability: "image_enhance"');
    expect(source).toContain('capability: "watermark_removal"');
    expect(source).toContain("task.editMode || task.sourceImageSrc");
  });

  it("sends PicWish expansion ratios from the original image instead of an enlarged source canvas", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('model: "picwish-advanced-image-expand"');
    expect(source).toContain("toExpansionRatio(expandTop, sourceH)");
    expect(source).toContain("toExpansionRatio(expandLeft, sourceW)");
    expect(source).not.toContain("imageSrc: expandedCanvas.toDataURL");
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
    expect(assistantBlock).toContain("filterAllowedAiModelOptions(assistantImageModelOptions, allowedAiModels)");
    expect(assistantBlock).toContain("availableAssistantImageModels.find(model => model.id === assistantImageModelId)");
    expect(assistantBlock).toContain('assistantModelTab === "image" ? availableAssistantImageModels : availableAssistantTextModels');
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

  it("keeps generated image processing overlays and extracted-text actions responsive", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("const processingBlockSize = Math.max");
    expect(source).toContain("Math.min(dispW, dispH) * 0.2");
    expect(source).toContain("const processingIconSize = Math.max");
    expect(source).toContain("const processingTextSize = Math.max");
    expect(source).toContain("width: processingIconSize");
    expect(source).toContain("height: processingIconSize");
    expect(source).toContain("fontSize: processingTextSize");
    expect(source).toContain("lineHeight: processingLineHeight");

    expect(source).toContain('resize: "both"');
    expect(source).toContain('resize: "none"');
    expect(source).toContain('gridTemplateColumns: "1fr 1fr"');
    expect(source).toContain('marginTop: "auto"');
    expect(source).toContain("height: 42");
  });

  it("routes bottom auto prompts to reference search and inserts the returned images on the canvas", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const intentSource = readFileSync(resolve(__dirname, "../../lib/ai-intent.ts"), "utf-8");

    expect(source).toContain('const isAutoMode = selectedGenerationModel === "auto";');
    expect(source).toContain("allowReferenceSearch: true");
    expect(source).toContain('decision.mode === "reference_search"');
    expect(source).toContain('new CustomEvent("canvas-reference-search-results"');
    expect(source).toContain('window.addEventListener("canvas-reference-search-results", handler)');
    expect(source).toContain("void addDroppedImageSources(sources, origin);");
    expect(intentSource).toContain("EXPLICIT_REFERENCE_SEARCH_PATTERN.test(trimmedPrompt)");
    expect(intentSource).toContain('mode: "reference_search"');
  });

  it("renders smart copy editing as scrollable structured non-empty sub fields", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const extractedTextStateBlock = source.match(
      /const extractedTextFields = useMemo[\s\S]*?const extractedTextPanelRef/
    )?.[0];
    const extractedTextPanelBlock = source.match(
      /<span className="type-caption" style=\{\{ fontWeight: 700 \}\}>[\s\S]*?<div\s+className="flex flex-col gap-2">[\s\S]*?<\/label>\s*\)\)\}/
    )?.[0];

    expect(source).toContain('label: "智能文案编辑"');
    expect(source).toContain('"edit-text": "智能文案编辑"');
    expect(extractedTextStateBlock).toBeTruthy();
    expect(extractedTextStateBlock).toContain(".map(item => item.trim())");
    expect(extractedTextStateBlock).toContain('return fields.length ? fields : ["未识别到可编辑文案"];');
    expect(extractedTextStateBlock).toContain("updateExtractedTextField");
    expect(extractedTextStateBlock).toContain('while (nextFields.length <= index) nextFields.push("");');
    expect(extractedTextStateBlock).not.toContain(".filter(Boolean)");
    expect(extractedTextPanelBlock).toBeTruthy();
    expect(extractedTextPanelBlock).toContain("文案段落");
    expect(extractedTextPanelBlock).toContain('aria-label={`编辑提取文案 ${index + 1}`}');
    expect(extractedTextPanelBlock).toContain('minHeight: 0');
    expect(extractedTextPanelBlock).toContain('paddingBottom: 12');
    expect(extractedTextPanelBlock).toContain('className="smart-copy-editor-scroll nodrag nopan"');
    expect(extractedTextPanelBlock).toContain('scrollbarWidth: "none"');
    expect(source).toContain('aria-label="拖动查看全部文案段落"');
    expect(source).toContain('onPointerDown={handleExtractedTextScrollThumbPointerDown}');
    expect(source).not.toContain('label: "智能文案"');
    expect(source).not.toContain('label: "文案提取"');
  });

  it("keeps smart copy text edits on strict source-image editing instead of free prompt regeneration", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const serverSource = readFileSync(
      resolve(__dirname, "../../../../server/image-generation.ts"),
      "utf-8"
    );
    const applyTextEditBlock = source.match(
      /const applyHandler = async \(e: Event\) => \{[\s\S]*?window\.addEventListener\("asset-text-edit-apply"/
    )?.[0];

    expect(applyTextEditBlock).toBeTruthy();
    expect(applyTextEditBlock).toContain('operation: "text_edit"');
    expect(applyTextEditBlock).toContain("createSmartCopyEditMask");
    expect(applyTextEditBlock).toContain("detail.originalText,");
    expect(applyTextEditBlock).toContain("detail.editedText,");
    expect(applyTextEditBlock).toContain("maskSrc");
    expect(applyTextEditBlock).toContain("原图中所有非文字像素必须原封不动保留");
    expect(applyTextEditBlock).toContain("禁止重绘或改变人物、产品、背景");
    expect(applyTextEditBlock).not.toContain("image-text-relayout");
    expect(applyTextEditBlock).not.toContain("callLLM({");
    expect(serverSource).toContain('const isTextEditOperation = input.operation === "text_edit";');
    expect(serverSource).toContain("This is a local text replacement edit");
    expect(serverSource).toContain("Use the source image as the only target canvas");
    expect(serverSource).toContain("__testCompositeSourcePreservingImageEdit");
  });

  it("masks only the smart-copy fields that the user actually changed", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const maskBuilder = source.match(
      /function createSmartCopyEditMask[\s\S]*?return canvas\.toDataURL\("image\/png"\);/
    )?.[0];

    expect(maskBuilder).toBeTruthy();
    expect(maskBuilder).toContain("changedOriginalFields");
    expect(maskBuilder).toContain("const editedRegions = regions.filter");
    expect(maskBuilder).toContain("for (const region of editedRegions)");
    expect(maskBuilder).not.toContain("for (const region of regions)");
  });

  it("closes smart copy editing after applying a new image without changing copy behavior", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const applyBlock = source.match(
      /const applyExtractedTextToNewImage = useCallback[\s\S]*?new CustomEvent\("asset-text-edit-apply"/
    )?.[0];
    const copyBlock = source.match(/navigator\.clipboard\?\.writeText\(extractedTextDraft\)[\s\S]*?复制文案/)?.[0];

    expect(applyBlock).toBeTruthy();
    expect(applyBlock).toContain("extractedTextPanelOpen: false");
    expect(copyBlock).toBeTruthy();
    expect(copyBlock).not.toContain("extractedTextPanelOpen: false");
  });

  it("keeps the smart copy editor separate from the image node context menu", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const panelBlock = source.match(
      /\{extractedTextPanelOpen && \([\s\S]*?<AssetInlineNote/
    )?.[0];

    expect(panelBlock).toBeTruthy();
    expect(panelBlock).toContain("onContextMenu={event => {");
    expect(panelBlock).toContain("event.preventDefault();");
    expect(panelBlock).toContain("event.stopPropagation();");
  });

  it("keeps assistant composer text fields alive when backspacing around chips", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const handlerBlock = source.match(
      /const handleComposerTextKeyDown = useCallback[\s\S]*?const composerText = getAssistantComposerText/
    )?.[0];

    expect(handlerBlock).toBeTruthy();
    expect(handlerBlock).toContain('if (event.key === "Delete")');
    expect(handlerBlock).toContain("event.stopPropagation();");
    expect(handlerBlock).toContain("restoreEmptyComposerField();");
    expect(handlerBlock).not.toContain("previous?.type");
    expect(handlerBlock).not.toContain("prev.filter(segment => segment.id !== previous.id)");
    expect(handlerBlock).not.toContain("prev.filter(segment => segment.id !== segmentId)");
  });
});
