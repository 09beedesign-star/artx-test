import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectEditedTextRegions } from "../../lib/text-replace";

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

  it("keeps smart annotation edits on the restored source-image edit route", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const annotationEditBlock = source.match(
      /const handleAnnotationAiEdit = useCallback[\s\S]*?const cloneNodesForHistory/
    )?.[0];

    expect(annotationEditBlock).toBeTruthy();
    expect(annotationEditBlock).toContain("editImageWithPrompt({");
    expect(source).toContain('import { DEFAULT_IMAGE_MODEL_ID } from "../../../../shared/image-models";');
    expect(annotationEditBlock).toContain("const selectedImageEditModel = getStoredCanvasAssistantImageEditModel();");
    expect(annotationEditBlock).toContain("selectedImageEditModel === \"auto\" || selectedImageEditModel === \"gpt-image-2\"");
    expect(annotationEditBlock).toContain("model: annotationImageEditModel");
    expect(annotationEditBlock).toContain("createAnnotationEditMask");
    expect(annotationEditBlock).toContain("runAnnotationEdit(annotationMask.maskSrc");
    expect(annotationEditBlock).toContain('operation: "annotation_edit"');
    expect(annotationEditBlock).toContain("preserveSource: true");
    expect(annotationEditBlock).toContain("isSmartAnnotationNoVisibleChangeError");
    expect(annotationEditBlock).toContain("{ expanded: true }");
    expect(annotationEditBlock).toContain("你正在执行图片局部编辑，不是重新生成一张新图。");
    expect(annotationEditBlock).toContain("原图中的所有人物、角色、文字、海报构图、背景、镜头、比例、光影、颜色、风格和未提及内容必须保持不变。");
  });

  it("keeps all assistant controls and the send button visible when the panel is narrow", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("const [compactAssistantControls, setCompactAssistantControls]");
    expect(source).toContain("const assistantControlsTextModeMinPanelWidth = 400;");
    expect(source).toContain("window.innerWidth < 430 ||");
    expect(source).toContain("panelWidth < assistantControlsTextModeMinPanelWidth");
    expect(source).toContain("compact={compactAssistantControls}");
    expect(source).toContain("width: compact ? 32 : 74");
    expect(source).toContain('className="flex min-w-0 flex-1 items-center"');
    expect(source).toContain('className="flex shrink-0 items-center"');
  });

  it("uses Figma default and pressed colors for compact assistant controls and selected image chips", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('const compactDefaultBg = isDark ? "#525252" : bg;');
    expect(source).toContain('const compactSelectedBg = isDark ? "#2b2b2b"');
    // 引用标签配色曾挂在选中态上（isSelectedImageToken → 画布点选时紫/黑跳变），
    // 现已按需求固化为单一黑色，统一由 getComposerRefTokenColors 提供，
    // isSelectedImageToken / isCanvasContextReference 随之成为死代码并删除。
    // 这里改为反向断言，防止选中态配色被重新引入；
    // 「两类标签同色同尺寸」的正向断言在 InfiniteCanvas.composer-token-style.test.ts。
    expect(source).not.toContain("background: isSelectedImageToken");
    expect(source).not.toContain("const isSelectedImageToken =");
    expect(source).toContain('"#121110"');
    expect(source).toContain('className="mb-2 min-h-[117px]');
  });

  it("keeps each image in a multi-image generation batch exactly 20px apart", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("const imageGenerationGap = 20;");
    expect(source).toContain("Boolean(detail.placement) || requestedCount > 1");
    expect(source).toContain("index * (size.w + imageGenerationGap)");
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

  it("adds a selected image to the conversation from the right-side toolbar", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const assetTools = source.match(
      /const assetTools: FloatingToolItem\[\] = \[[\s\S]*?const frameTools/
    )?.[0];
    const actionHandler = source.match(
      /const handleSingleImageToolbarAction = useCallback\([\s\S]*?const handleSocialMediaSizeGenerate/
    )?.[0];

    expect(assetTools).toContain('label: "引入对话"');
    expect(assetTools).toContain('action: "introduce-to-chat"');
    expect(assetTools).toContain("IntroduceToChatIcon");
    expect(actionHandler).toContain('if (action === "introduce-to-chat")');
    expect(actionHandler).toContain("await addReferencedAsset({");
    expect(actionHandler).toContain("setIsAssistantCollapsed(false)");
  });

  it("reverse engineers a selected image into a copyable prompt without using image generation", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const assetTools = source.match(
      /const assetTools: FloatingToolItem\[\] = \[[\s\S]*?const frameTools/
    )?.[0];
    const actionHandler = source.match(
      /const handleSingleImageToolbarAction = useCallback\([\s\S]*?const handleSocialMediaSizeGenerate/
    )?.[0];
    const frameTools = source.match(/const frameTools: FloatingToolItem\[\] = \[[\s\S]*?\n  \];/)?.[0];

    expect(assetTools).toContain('label: "提示词反推"');
    expect(assetTools).toContain('action: "reverse-prompt"');
    expect(assetTools).toContain("ScanSearch");
    expect(frameTools).not.toContain("提示词反推");
    expect(actionHandler).toContain('if (action === "reverse-prompt")');
    expect(actionHandler).toContain('module: "image-prompt-reverse-engineering"');
    expect(actionHandler).toContain("images: [{ src: imageSrc, title }]");
    expect(actionHandler).toContain("只输出一段完整的中文生图提示词");
    expect(actionHandler).not.toContain('generateAiImages({');
    expect(source).toContain("reversePromptPanelOpen");
    expect(source).toContain("复制反推提示词");
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

  it("opens the verified inspiration picker from the assistant action and injects copied prompts into chat", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('label: "灵感推荐"');
    expect(source).toContain("InspirationPromptDialog");
    expect(source).toContain('setInspirationDialogOpen(true)');
    expect(source).toContain('用户已引用「${item.title}」');
    expect(source).toContain("setComposerSegments([createAssistantTextSegment(item.prompt)])");
  });

  it("keeps the image generator on the Figma panel surface and smart commerce on #171717", () => {
    const canvasSource = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const commerceSource = readFileSync(resolve(__dirname, "SmartCommerceProductDialog.tsx"), "utf-8");
    const imageGeneratorBlock = canvasSource.match(
      /function ImageGeneratorPopover\([\s\S]*?type FontDesignPurpose/
    )?.[0];

    expect(imageGeneratorBlock).toBeTruthy();
    expect(imageGeneratorBlock).toContain('const bg = isDark ? "#1e1e20"');
    expect(imageGeneratorBlock).toContain('const popoverWidth = 680');
    expect(imageGeneratorBlock).toContain('lg:grid-cols-[272px_minmax(0,1fr)]');
    expect(imageGeneratorBlock).toContain('width: "min(680px, calc(100vw - 24px))"');
    expect(imageGeneratorBlock).toContain("overflow-hidden");
    expect(imageGeneratorBlock).toContain("grid grid-cols-5 gap-1.5 w-full");
    expect(commerceSource).toContain('panel: isDark ? "#171717"');
  });

  it("uses the Figma image-generator panel geometry without changing generation controls", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const imageGeneratorBlock = source.match(
      /function ImageGeneratorPopover\([\s\S]*?type FontDesignPurpose/
    )?.[0];

    expect(imageGeneratorBlock).toBeTruthy();
    expect(imageGeneratorBlock).toContain('const popoverWidth = 680');
    expect(imageGeneratorBlock).toContain('height: "min(439px, calc(100dvh - 24px))"');
    expect(imageGeneratorBlock).toContain('const bg = isDark ? "#1e1e20"');
    expect(imageGeneratorBlock).toContain('const border = isDark ? "#2e2e33"');
    expect(imageGeneratorBlock).toContain('borderRadius: 16');
    expect(imageGeneratorBlock).toContain('padding: 24');
    expect(imageGeneratorBlock).toContain('gridTemplateColumns: "272px minmax(0, 1fr)"');
  });

  it("keeps Toggle Switch geometry shared while allowing each caller to provide its existing colors", () => {
    const switchSource = readFileSync(resolve(__dirname, "../ui/switch.tsx"), "utf-8");
    const canvasSource = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(switchSource).toContain("h-[18px] w-[34px]");
    expect(switchSource).toContain("p-[2px]");
    expect(switchSource).toContain("size-[14px]");
    expect(switchSource).toContain("data-[state=checked]:translate-x-4");
    expect(switchSource).toContain("thumbStyle");
    expect(canvasSource).toContain('import { Switch } from "@/components/ui/switch";');
    expect(canvasSource).toContain('aria-label="参考当前画布"');
    expect(canvasSource).toContain('aria-label="透明底"');
    expect(canvasSource).toContain("<Switch");
  });

  it("matches the selected-image vertical toolbar colors in the top canvas palette", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const palette = source.match(
      /function CanvasTopToolPalette\([\s\S]*?function SaveProjectConfirmDialog/
    )?.[0];

    expect(palette).toBeTruthy();
    expect(palette).toContain('const bg = isDark ? "rgba(22,22,30,0.88)"');
    expect(palette).toContain('const hoverBg = isDark ? "rgba(255,255,255,0.08)"');
    expect(palette).toContain('const activeBg = hoverBg;');
    expect(palette).toContain('const activeColor = textColor;');
    expect(palette).toContain("hoveredId === tool.id");
    expect(palette).toContain("active === tool.id || hoveredId === tool.id");
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

  it("activates camera-view from the image toolbar with a draggable 3D cube controller", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const toolbarBlock = source.match(
      /const assetTools: FloatingToolItem\[\] = \[[\s\S]*?const frameTools/
    )?.[0];
    const nodeBlock = source.match(
      /function AssetNodeComponent[\s\S]*?function FreehandNodeComponent/
    )?.[0];
    const generationBlock = source.match(
      /const runCameraViewGeneration = useCallback[\s\S]*?const createGeneratedImageNode/
    )?.[0];

    expect(toolbarBlock).toBeTruthy();
    expect(toolbarBlock).toContain("CameraViewCubeAiIcon");
    expect(toolbarBlock).toContain('label: "视角"');
    expect(toolbarBlock).toContain('action: "camera-view"');
    expect(source).not.toContain('["mockup", "adjust", "vector", "camera-view"]');
    expect(nodeBlock).toBeTruthy();
    expect(nodeBlock).toContain("isCameraViewAdjusting");
    expect(nodeBlock).toContain("assetCameraView");
    expect(nodeBlock).toContain("handleCameraCubePointerDown");
    expect(nodeBlock).toContain("handleCameraCubePointerMove");
    expect(nodeBlock).toContain("handleCameraViewPanelPointerDown");
    expect(nodeBlock).toContain('event.target as HTMLElement).closest("button, input, select, textarea, a")');
    expect(nodeBlock).toContain("cameraViewPanelOffset");
    expect(nodeBlock).toContain('background: "#111214"');
    expect(nodeBlock).toContain('stroke="rgba(255,255,255,0.96)"');
    expect(nodeBlock).toContain('transformStyle: "preserve-3d"');
    expect(nodeBlock).toContain('aria-label="可互动的视角立方体"');
    expect(nodeBlock).toContain('aria-label="当前原始视角"');
    expect(nodeBlock).toContain('aria-label="恢复默认视角"');
    expect(nodeBlock).toContain("requestAnimationFrame");
    expect(nodeBlock).not.toContain("skewY(");
    expect(nodeBlock).not.toContain("拖动此处移动");
    expect(nodeBlock).toContain('调整视角');
    expect(source).toContain('x: -45');
    expect(nodeBlock).toContain('四视图');
    expect(nodeBlock).toContain('onClick={cancelCameraViewAdjuster}');
    expect(nodeBlock).toContain("handleCameraViewZChange");
    expect(nodeBlock).toContain("asset-camera-view-apply");
    expect(nodeBlock).toContain("rotateX(${-assetCameraView.y}deg) rotateY(${assetCameraView.x}deg)");
    expect(nodeBlock).toContain('aria-label="Z 镜头距离"');
    expect(generationBlock).toBeTruthy();
    expect(generationBlock).toContain('operation: "camera_view"');
    expect(generationBlock).toContain('capability: "image_edit"');
    expect(generationBlock).toContain("buildCameraViewPrompt(cameraView)");
    expect(source).toContain("画面内容必须尽可能锁定");
    expect(source).toContain("不要替换场景、增删道具");
    expect(generationBlock).toContain("cameraView,");
    expect(source).toContain('asset-camera-view-four-apply');
    expect(source).toContain("runCameraViewFourGeneration");
    expect(source).toContain("const views = [");
    const cubePointerEndBlock = nodeBlock.match(
      /const handleCameraCubePointerEnd = useCallback[\s\S]*?const handleCameraViewZChange/
    )?.[0];
    const cameraZChangeBlock = nodeBlock.match(
      /const handleCameraViewZChange = useCallback[\s\S]*?useEffect\(\(\) =>/
    )?.[0];
    expect(cubePointerEndBlock).toBeTruthy();
    expect(cubePointerEndBlock).not.toContain("updateCameraViewNode(nextView, true)");
    expect(cameraZChangeBlock).toBeTruthy();
    expect(cameraZChangeBlock).not.toContain("commit = false");
    expect(nodeBlock).toContain('onClick={() => updateCameraViewNode(assetCameraView, true)}');
    expect(nodeBlock).toContain('onClick={() => window.dispatchEvent(new CustomEvent("asset-camera-view-four-apply"');
    expect(generationBlock).toContain("{ x: 0, y: 0 }");
    expect(generationBlock).toContain("{ x: 90, y: 0 }");
    expect(generationBlock).toContain("{ x: -90, y: 0 }");
    expect(generationBlock).toContain("{ x: 180, y: 0 }");
    expect(generationBlock).toContain("await Promise.all(");
    expect(generationBlock).not.toContain('operation: "annotation_edit"');
  });

  it("does not duplicate live background-task polling while the foreground request owns the task", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("const activeForegroundImageTaskIdsRef = useRef<Set<string>>(new Set());");
    expect(source).toContain("if (activeForegroundImageTaskIdsRef.current.has(generationId)) return;");
    expect(source).toContain("activeForegroundImageTaskIdsRef.current.add(generationId);");
    expect(source).toContain("activeForegroundImageTaskIdsRef.current.delete(generationId);");
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
    expect(source).toContain("handleReferenceOptionDragStart");
    expect(source).toContain('event.dataTransfer.setData("text/uri-list", item.src);');
    expect(source).toContain("handleReferenceOptionDoubleClick");
    expect(source).toContain("detail: { images: [item] }");
    expect(intentSource).toContain("EXPLICIT_REFERENCE_SEARCH_PATTERN.test(trimmedPrompt)");
    expect(intentSource).toContain('mode: "reference_search"');
  });

  it("keeps annotation bubbles below the right assistant panel", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("const GLOBAL_ANNOTATION_LAYER_Z_INDEX = 118;");
    expect(source).toContain("zIndex: GLOBAL_ANNOTATION_LAYER_Z_INDEX");
    expect(source).toContain("右侧对话区下方");
    expect(source).toContain("zIndex: 120");
  });

  it("renders smart copy editing as scrollable structured non-empty sub fields", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const extractedTextStateBlock = source.match(
      /const extractedTextFields = useMemo[\s\S]*?const extractedTextPanelRef/
    )?.[0];
    const extractedTextPanelBlock = source.match(
      /<span className="type-caption" style=\{\{ fontWeight: 700 \}\}>[\s\S]*?<div\s+className="flex flex-col gap-2">[\s\S]*?<\/label>\s*\)\)\}/
    )?.[0];

    /**
     * 2026-09-12：「智能文案编辑」工具栏入口按需求屏蔽。
     *
     * 原断言是 `toContain('label: "智能文案编辑"')`，即要求入口条目存在。
     * 入口被注释后该写法仍会「通过」—— 因为注释文本里也含这个字符串，
     * 属于假阳性。所以这里改为断言**未注释的入口条目不存在**：
     * 用行首缩进 + 无 `//` 前缀来区分「真实代码」与「被注释的代码」。
     */
    expect(source).not.toMatch(/^\s{6}label: "智能文案编辑",$/m);
    expect(source).toMatch(/^\s*\/\/\s*label: "智能文案编辑",$/m);
    /**
     * 实现必须原样保留（只屏蔽入口，不删功能），
     * 这样恢复时只需还原那段注释。
     */
    expect(source).toContain('"edit-text": "智能文案编辑"');
    expect(source).toContain('if (action === "edit-text")');
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
    expect(source).toContain("handleExtractedTextPanelDragStart");
    expect(source).toContain("handleExtractedTextPanelDragMove");
    expect(source).toContain("handleExtractedTextPanelDragEnd");
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
    expect(applyTextEditBlock).toContain('model: "auto"');
    expect(applyTextEditBlock).toContain('toast("正在应用文案"');
    expect(applyTextEditBlock).toContain("原图中所有非文字像素必须原封不动保留");
    expect(applyTextEditBlock).toContain("禁止重绘或改变人物、产品、背景");
    expect(applyTextEditBlock).not.toContain("image-text-relayout");
    expect(applyTextEditBlock).not.toContain("callLLM({");
    expect(serverSource).toContain('const isTextEditOperation = input.operation === "text_edit";');
    expect(serverSource).toContain("This is a local text replacement edit");
    expect(serverSource).toContain("Use the source image as the only target canvas");
    expect(serverSource).toContain("__testCompositeSourcePreservingImageEdit");
  });

  it("keeps smart annotation prompts constrained to a local source-image change", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const annotationEditBlock = source.match(
      /const handleAnnotationAiEdit = useCallback\([\s\S]*?\n  const cloneNodesForHistory/
    )?.[0];

    expect(annotationEditBlock).toBeTruthy();
    expect(annotationEditBlock).toContain("必须把原图作为唯一基础画布，只在用户标注区域附近做最小必要修改。");
    expect(annotationEditBlock).toContain("禁止把画面改成新的场景、替换主体、重画成另一张不相关图片。");
    expect(annotationEditBlock).toContain("输出完整新图，但视觉上应像原图只发生了这一次局部修改。");
    expect(annotationEditBlock).toContain("用户修改建议");
    expect(annotationEditBlock).toContain("createAnnotationEditMask");
    expect(annotationEditBlock).toContain("reference.text");
    expect(annotationEditBlock).toContain("preserveSource: true");
    expect(source).toContain("function isSmartAnnotationHeadAccessoryPrompt");
    expect(source).toContain("帽子|帽\\b|头盔|皇冠");
    expect(source).toContain("function isSmartAnnotationFaceAccessoryPrompt");
    expect(source).toContain("眼镜|墨镜|太阳镜");
    expect(annotationEditBlock).toContain("头顶或头发上方");
    expect(annotationEditBlock).toContain("眼部位置");
    expect(source).toContain("const faceAccessoryCenterY");
    expect(source).toContain("const useForeheadPinOffset");
    expect(source).toContain('ctx.globalCompositeOperation = "destination-out";');
    expect(source).toContain('ctx.globalCompositeOperation = "source-over";');
    expect(source).toContain("ctx.ellipse(centerX, accessoryCenterY");
    expect(annotationEditBlock).toContain("第二次局部编辑尝试");
  });

  it("masks only the smart-copy fields that the user actually changed", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const maskBuilder = source.match(
      /function createSmartCopyEditMask[\s\S]*?return canvas\.toDataURL\("image\/png"\);/
    )?.[0];

    expect(maskBuilder).toBeTruthy();
    // 匹配逻辑已抽到 lib/text-replace 的纯函数 selectEditedTextRegions，
    // 行为由 text-replace.region-selection.test.ts 覆盖；这里只守护蒙版只画选中区域。
    expect(maskBuilder).toContain("selectEditedTextRegions(regions, originalText, editedText)");
    expect(maskBuilder).toContain("regionsToMask");
    expect(maskBuilder).toContain("for (const region of regionsToMask)");
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
    expect(handlerBlock).toContain("if (event.nativeEvent.isComposing) return;");
    expect(handlerBlock).toContain('if (event.key === "Enter" && !event.shiftKey)');
    expect(handlerBlock).toContain("void handleSubmit();");
    expect(handlerBlock).toContain("handleSubmit,");
    expect(handlerBlock).toContain('if (event.key === "Delete")');
    expect(handlerBlock).toContain("event.stopPropagation();");
    expect(handlerBlock).toContain("restoreEmptyComposerField();");
    expect(handlerBlock).not.toContain("previous?.type");
    expect(handlerBlock).not.toContain("prev.filter(segment => segment.id !== previous.id)");
    expect(handlerBlock).not.toContain("prev.filter(segment => segment.id !== segmentId)");
  });

  it("does not start a mouse box selection from the assistant prompt input shell", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const composerShellBlock = source.match(
      /ref={composerShellRef}[\s\S]*?onDragOver={handleComposerShellDragOver}/
    )?.[0];

    expect(composerShellBlock).toBeTruthy();
    expect(composerShellBlock).toContain("event.preventDefault();");
    expect(composerShellBlock).toContain("event.stopPropagation();");
    expect(composerShellBlock).toContain("setComposerBoxSelection(null);");
    expect(source).not.toContain('border: "1px solid rgba(197,237,71,0.55)"');
  });

  it("maps vertical camera-cube dragging in the same direction as the pointer", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const cameraDragBlock = source.match(
      /const handleCameraCubePointerMove = useCallback[\s\S]*?const handleCameraCubePointerEnd/
    )?.[0];
    const cameraDragEndBlock = source.match(
      /const handleCameraCubePointerEnd = useCallback[\s\S]*?const handleCameraViewZChange/
    )?.[0];

    expect(cameraDragBlock).toBeTruthy();
    expect(cameraDragEndBlock).toBeTruthy();
    expect(cameraDragBlock).toContain(
      "drag.startY + (event.clientY - drag.startClientY) * 0.55"
    );
    expect(cameraDragEndBlock).toContain(
      "drag.startY + (event.clientY - drag.startClientY) * 0.55"
    );
  });

  it("does not abort mask generation when user only adds new lines without modifying existing text", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const maskBuilder = source.match(
      /function createSmartCopyEditMask[\s\S]*?return canvas\.toDataURL\("image\/png"\);/
    )?.[0];

    expect(maskBuilder).toBeTruthy();
    // 只有「没有 OCR 区域」才允许提前返回；纯新增行属于合法用法，不能被判为无改动而中断。
    expect(maskBuilder).toMatch(/if\s*\(\s*regions\.length\s*===\s*0\s*\)\s*return\s+undefined/);

    // 行为断言：只新增行、原有行一字未改时，仍必须选出可用区域。
    const regions = [{ text: "原有标题" }, { text: "原有副标题" }];
    const selection = selectEditedTextRegions(
      regions,
      "原有标题\n原有副标题",
      "原有标题\n原有副标题\n全新加的一行",
    );
    expect(selection.regions.length).toBeGreaterThan(0);
  });
});
