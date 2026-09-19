import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectEditedTextRegions } from "../../lib/text-replace";

// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

/**
 * 剥掉 // 与 块注释，再做源码扫描断言。
 *
 * 【2026-09-13】踩过的坑：`toContain` 扫源码时**注释也算**。
 * 改了实现之后，被删掉的旧写法只要还留在注释里，断言就会继续绿，
 * 完全掩盖住「实现已经换了」这个事实。
 *
 * 【2026-09-17】第二个坑，比上面那个更隐蔽：
 * 这里原本自己抄了一份贪心的块注释正则，它会把
 * SmartCommerceProductDialog.tsx 里 `"image/*"` 的 /* 当成注释开头，
 * 一口吞掉 5.0% 的源码 —— 被吞掉的部分对断言而言不存在，
 * 于是扫到那一段的 not.toContain **恒绿**。
 * 📌 判据：一个恒绿的检测器等于没有检测器，而它和「没问题」长得一样。
 * 现已统一走 shared/strip-source-comments.ts。
 */
function stripComments(source: string): string {
  return stripSourceComments(source);
}

describe("InfiniteCanvas prompt controls", () => {
  it("strips comments before scanning source (self-check)", () => {
    // 自证用例：确保 stripComments 真的在工作，而不是原样返回。
    const sample = 'const a = 1; // ratio === "auto"\n/* ratio === "auto" */\nconst b = 2;';
    const stripped = stripComments(sample);
    expect(stripped).not.toContain('ratio === "auto"');
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
  });

  /**
   * ⚠️⚠️ 守检测器自己：本文件扫的源文件里有含 `"image/*"` 的，
   * 剥离函数一旦退化成贪心正则就会误吃代码，让反向断言集体恒绿。
   */
  it("never lets comment stripping eat the scanned sources", () => {
    for (const relative of [
      "InfiniteCanvas.tsx",
      "SmartCommerceProductDialog.tsx",
      "ModelSelector.tsx",
    ]) {
      const raw = readFileSync(resolve(__dirname, relative), "utf-8");
      expect(raw.length).toBeGreaterThan(1000);
      expect(() => assertStripKeptSource(raw, stripSourceComments(raw))).not.toThrow();
    }

    // 反向：旧的贪心实现必须被拦下，否则上面那圈检查只是走过场。
    const dialog = readFileSync(resolve(__dirname, "SmartCommerceProductDialog.tsx"), "utf-8");
    const legacy = dialog.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(legacy.length).toBeLessThan(stripSourceComments(dialog).length);
  });

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

  /**
   * 回归防线：点击生成图片节点后的「节点提示词输入框」必须接入与主助手
   * 面板同一套控制能力 —— 模型 / Skill / 生成张数 / 画幅（外加既有的上传
   * 参考图），并在提交链路真正消费这些参数（画幅、张数、Skill 上下文、
   * 用户所选模型），而不是只摆 UI。
   *
   * 2026-09-19 之前节点框只有「上传 + 模型下拉」两个按钮，且提交时
   * model 被写死、count 恒为 1、skillId 恒为 undefined。
   */
  it("wires the asset edit prompt bar to the full assistant control set and consumes its payload", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const barBlock = source.match(
      /function AssetEditPromptBar\([\s\S]*?\/\/ ── Zoom Control Bar/
    )?.[0];
    const quickEditBlock = source.match(
      /const handleAssetEditSubmit = useCallback[\s\S]*?const handleSingleImageToolbarAction/
    )?.[0];

    expect(barBlock).toBeTruthy();
    expect(quickEditBlock).toBeTruthy();

    // 四组控制件都渲染进节点框，且张数/画幅绑定组件自身 state。
    expect(barBlock).toContain("<SkillPointSelector");
    expect(barBlock).toContain("onChange={handleSkillChange}");
    expect(barBlock).toContain("<ImageCountSelector");
    expect(barBlock).toContain("value={imageCount}");
    expect(barBlock).toContain("<ImageRatioSelector");
    expect(barBlock).toContain("value={imageRatio}");
    // 上传与模型继续保留。
    expect(barBlock).toContain('aria-label="上传参考图片"');
    expect(barBlock).toContain("<ModelSelector");

    // 提交 payload 带齐全部参数。
    expect(barBlock).toContain("ratio: imageRatio");
    expect(barBlock).toContain("count: imageCount");
    expect(barBlock).toContain("skill: activeSkill");

    // Skill 加载后联动首选画幅（与主助手面板行为一致）。
    expect(barBlock).toContain("getSkillPreferredRatio(skill, \"\")");

    // 提交链路真正消费 payload：画幅 / 张数 / Skill 上下文 / 用户所选模型。
    expect(quickEditBlock).toContain("ratio: selectedRatio");
    expect(quickEditBlock).toContain("count: requestedCount");
    expect(quickEditBlock).toContain("resultCount: requestedCount");
    expect(quickEditBlock).toContain("buildSkillPromptContext(skill)");
    expect(quickEditBlock).toContain("skillId: skill?.id");
    expect(quickEditBlock).toContain(
      "model: payload.model || DEFAULT_IMAGE_AI_MODEL_ID"
    );
  });

  it("wires the draft image node composer to the full assistant control set", () => {
    const raw = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const source = stripComments(raw);
    const draftBlock = source.match(
      /function DraftImageNodeComponent\([\s\S]*?\n\}\n/
    )?.[0];

    expect(draftBlock).toBeTruthy();

    // 控制件齐全，且绑定组件自身 state（而不是渲染出来摆样子）。
    expect(draftBlock).toContain("<ModelSelector");
    expect(draftBlock).toContain("<SkillPointSelector");
    expect(draftBlock).toContain("<ImageCountSelector");
    expect(draftBlock).toContain("value={imageCount}");
    expect(draftBlock).toContain("<ImageRatioSelector");
    expect(draftBlock).toContain("value={imageRatio}");
    expect(draftBlock).toContain('aria-label="上传参考图片"');

    // 提交 payload 全部来自控件，不再写死默认值。
    expect(draftBlock).toContain("model,\n        ratio,\n        count: imageCount,");
    expect(draftBlock).toContain("skillId: activeSkill?.id");
    expect(draftBlock).toContain("referencedAssets: uploadedRefs.map");
    expect(draftBlock).toContain("buildSkillPromptContext(activeSkill)");
    expect(draftBlock).toContain("getSkillPreferredRatio(skill, \"\")");

    // 旧写法：写死 auto / 1:1 / 1 张，选了也白选。
    expect(draftBlock).not.toContain('model: "auto"');
    expect(draftBlock).not.toContain('ratio: "1:1"');
    expect(draftBlock).not.toContain('referencesEnabled: false');
  });

  it("keeps smart annotation edits on the restored source-image edit route", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const annotationEditBlock = source.match(
      /const handleAnnotationAiEdit = useCallback[\s\S]*?const cloneNodesForHistory/
    )?.[0];

    expect(annotationEditBlock).toBeTruthy();
    expect(annotationEditBlock).toContain("editImageWithPrompt({");
    // 2026-09-19：import 已从单行改为多行块（同块还有 normalizeImageModelId），
    // 断言改为「确实从 shared/image-models 引入了 DEFAULT_IMAGE_MODEL_ID」。
    expect(source).toContain('from "../../../../shared/image-models"');
    expect(source).toMatch(/import \{[\s\S]*?DEFAULT_IMAGE_MODEL_ID,[\s\S]*?\} from "\.\.\/\.\.\/\.\.\/\.\.\/shared\/image-models"/);
    expect(annotationEditBlock).toContain("const selectedImageEditModel = getStoredCanvasAssistantImageEditModel();");
    expect(annotationEditBlock).toContain("selectedImageEditModel === \"auto\" || selectedImageEditModel === \"gpt-image-2\"");
    expect(annotationEditBlock).toContain("model: annotationImageEditModel");
    expect(annotationEditBlock).toContain("createAnnotationEditMask");
    // 2026-09-19：调用入口改名为 runAnnotationEditFlow（内部先跑无可见修改
    // 的扩大重试，再落到 runAnnotationEdit），断言跟着对齐。
    expect(annotationEditBlock).toContain("runAnnotationEditFlow(maskSrc)");
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
    /*
     * 【2026-09-17 修正】原断言是字面量 `width: compact ? 32 : 74`。
     * 需求 1 给四个可展开 icon 加了展开箭头，紧凑态要容得下「图标 + 箭头」，
     * 宽度从 32 提到 44 并抽成常量 COMPACT_DISCLOSURE_BUTTON_WIDTH。
     * 📌 约束本身没变：紧凑态是固定窄宽、展开态仍是 74。变的是数值来源。
     * 所以断言改为锁「用常量 + 展开态 74」，并反向禁掉写死数字（防止各处又各写各的）。
     */
    expect(source).toContain(
      "width: compact ? COMPACT_DISCLOSURE_BUTTON_WIDTH : 74"
    );
    expect(source).not.toContain("width: compact ? 32 : 74");
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
    // 2026-09-16：配色实现已搬到 composer-ref-token.ts（智能产品图的参考图
    // 标签也要用同一套外观）。约束没变 —— 底色仍是那个固定黑 —— 只是定义
    // 位置换了，所以锚点跟着挪到共享模块，并额外确认画布是 import 而非副本。
    const tokenModule = readFileSync(
      resolve(__dirname, "composer-ref-token.ts"),
      "utf-8"
    );
    expect(tokenModule).toContain('"#121110"');
    expect(source).toContain('from "@/components/canvas/composer-ref-token"');
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
    /*
     * 张数初值不再写死 1，改由模型决定（MJ v8.2 默认 4 张）。
     * 必须是惰性初始化：先写 1 再用 effect 纠正会闪一下，
     * 而且用户有可能在纠正生效前就点了生成。
     */
    expect(source).toContain(
      "const [assistantImageCount, setAssistantImageCount] = useState(() =>"
    );
    expect(source).toContain(
      "getImageModelDefaultOutputCount(assistantImageModelId)"
    );
    expect(source).toContain("<ImageCountSelector");
    // 必须走包装函数而非裸 setter —— 包装函数负责打「用户已手动选过」的标记。
    expect(source).toContain("onChange={handleAssistantImageCountChange}");
    expect(source).not.toContain("onChange={setAssistantImageCount}");
    expect(source).toContain("function ImageRatioSelector");
    expect(source).toContain("const CANVAS_ASSISTANT_IMAGE_RATIOS = [");
    expect(source).toContain('"16:9"');
    expect(source).toContain('"9:16"');
    expect(source).toContain('useState<CanvasAssistantImageRatio>("auto")');
    expect(source).toContain("<ImageRatioSelector");
    expect(source).toContain("onChange={setAssistantImageRatio}");
    /*
     * 【2026-09-13 修正假通过】原断言是 `assistantImageRatio === "auto"`。
     * auto 回落值改成 9:16 后实现已换成 isAutoRatio()/resolveImageRatio()，
     * 该字符串在源码里只剩一行**注释**，测试却依旧绿 —— 典型的注释污染。
     * 现在改为在剥掉注释后的源码上断言，并显式禁掉裸比较。
     */
    const code = stripComments(source);
    expect(code).not.toContain('assistantImageRatio === "auto"');
    expect(code).toContain("resolveImageRatio(assistantImageRatio)");
    expect(code).toContain("isAutoRatio(assistantImageRatio)");
    /*
     * 【2026-09-13 再次修正】原断言是 `toContain("ratio: skillRatio")`。
     * 它的保护意图是「技能声明的画幅确实被传给了生成接口」，这个意图依然有效，
     * 但断言的**字面形式**已经过期：局部重绘不能再无条件用 skillRatio，
     * 否则会把引用图强行拉成技能声明的画幅（就是本次要修的变形 bug）。
     * 现在实现是三元 —— 重绘走画幅锁，纯生成仍走 skillRatio。两条都要断言到，
     * 只断言一条就会让另一条被悄悄改掉而测试不报错。
     */
    /*
     * 【2026-09-17 第三次修正】纯生成那一支不再直接写 skillRatio。
     * 需求 2 之后，提示词里提到分辨率/幅面时必须盖过画幅 icon，
     * 于是纯生成走 promptSizeDecision.ratio —— 而 promptSizeDecision 本身
     * 就是用 resolveImageRatio(skillRatio) 作为「没提到尺寸时的兜底」算出来的，
     * 所以「技能画幅确实被传下去」这个保护意图仍然成立，只是多绕了一层裁决。
     * 📌 判据是「约束是否还成立」，不是「文本是否还一样」。
     * 因此这里断言两件事：重绘仍走画幅锁；纯生成走的裁决结果确实喂了 skillRatio。
     */
    expect(code).toMatch(
      /ratio:\s*shouldEditTargetReference[\s\S]{0,80}?skillEditAspectLock\.ratio[\s\S]{0,60}?:\s*promptSizeDecision\.ratio/
    );
    const skillPromptSizeDecisionBlock = code.match(
      /const promptSizeDecision = resolveOutputSizeFromPromptAndSelector\(\{[\s\S]{1,400}?\}\);/
    )?.[0];
    expect(skillPromptSizeDecisionBlock).toBeTruthy();
    // 自检：块被截断（比如正则收尾错位）时长度会异常小，恒绿就无从谈起。
    expect((skillPromptSizeDecisionBlock as string).length).toBeGreaterThan(80);
    expect(skillPromptSizeDecisionBlock).toContain("skillRatio");
    expect(skillPromptSizeDecisionBlock).toContain(
      "rawSubmittedComposerPrompt"
    );
    // 反向断言：不许退回「无条件 skillRatio」的老写法（那样提示词尺寸会被无视）。
    expect(code).not.toMatch(/ratio:\s*skillRatio\s*,/);
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

  /*
   * 回归防线：反推出来的提示词必须带上图里的字。
   *
   * 历史 bug：反推提示词里写着「不得臆造图片中没有出现的品牌、文字…」。
   * 视觉模型在「写一段生图提示词」这个目标下，本来只会描述版式
   * （「画面上方有一行标题」），再叠加这条禁字约束，
   * 结果就是把文案整段略掉 —— 用户拿它重新生图，字就没了。
   *
   * 修法不是删掉禁字约束（那会放开编造），而是：
   *   1. 先 OCR 专职逐字转录；
   *   2. 把原文作为「必须原样引用」的事实喂进反推；
   *   3. 末尾再比对一次，漏行就补。
   * 下面每一条断言对应其中一环，缺任何一环都会退化成老 bug。
   */
  it("reverse engineers the on-image copy verbatim instead of dropping it", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const actionHandler = source.match(
      /const handleSingleImageToolbarAction = useCallback\([\s\S]*?const handleSocialMediaSizeGenerate/
    )?.[0];

    // 1. 反推前先跑 OCR
    expect(actionHandler).toContain("await extractImageText({ imageSrc })");
    expect(source).toContain("REVERSE_PROMPT_WITH_OCR");
    // 2. 明确要求原样保留文案，而不是笼统禁字
    expect(actionHandler).toContain("图中文案必须原样保留");
    expect(actionHandler).toContain("不得改写、翻译、缩写、合并或概括这些文案");
    // 老 bug 的原文：把「文字」也一并列入禁造清单
    expect(actionHandler).not.toContain("不得臆造图片中没有出现的品牌、文字");
    // 3. 模型漏行时兜底补写
    expect(actionHandler).toContain("missedLines");
    // 4. 文案单独落库 + 单独可复制，模型写漏了用户也拿得到
    expect(source).toContain("reversePromptCopies");
    expect(source).toContain("复制图中文案");
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

  /*
    2026-09-15 需求反转。

    这条用例原名 "keeps canvas image references explicit so normal clicks do not
    auto-fill prompt chips"，断言的是 `if (additive) {` —— 也就是「必须按住
    Ctrl/Cmd 才引用」。用户现在明确要求「直接鼠标点击图片即可触发引用图片，
    不需要点击 ctrl 或者 command 键」，所以旧断言锁的是**已被推翻的需求**，
    整条改写成守护新行为，而不是删掉了事。
  */
  it("单击图片即引用，不再需要 Ctrl/Cmd", () => {
    /*
      ⚠️ 必须先 stripComments 再断言。

      上面那几条解释「守卫为什么被删」的注释里，原样写着
      `if (!detail.ctrlKey) return;` 和 `ctrlKey: true`。
      不剥注释的话，反向断言会命中我自己写的说明文字而误报 —— 这就是
      本文件顶部记的那个「注释污染」坑，这次又踩了一遍。
    */
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    // 守卫必须已经消失：它是「非 Ctrl 不引用」的总开关。
    expect(source).not.toContain("if (!detail.ctrlKey) return;");
    // 也不许有人再靠硬编码 ctrlKey: true 去绕过它。
    expect(source).not.toContain("ctrlKey: true,");

    expect(source).toContain('new CustomEvent("asset-reference"');
    expect(source).toContain('window.addEventListener("asset-reference", handler)');
  });

  /*
    ⚠️⚠️ 这条是新增的，守的是一个**零报错**的回归。

    删掉 Ctrl 守卫之后，拖动图片也会触发 onClick（浏览器只要 mousedown/mouseup
    落在同一元素就派发 click），于是用户每挪动一张图就白白多出一个引用标签。
    以前有守卫挡着看不出来，现在必须靠位移阈值自己判断。
    这个 bug 不会报错、只会让引用列表莫名其妙变长，最难被发现。
  */
  it("拖拽图片不会被误判成点击而多出引用", () => {
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    expect(source).toContain("const ASSET_CLICK_SLOP_PX =");
    expect(source).toContain("assetPointerDownRef");
    // 必须真的用位移做判断并提前 return，而不只是把坐标记下来。
    expect(source).toContain("ASSET_CLICK_SLOP_PX");
    expect(source).toContain("if (movedLikeDrag) return;");
  });

  /*
    框选/多选批量引用。

    框选能力（selectionOnDrag）本来就开着，但选中结果只写 selectedNodeIds，
    从没接到 referencedAssets 上 —— 这是用户说的「支持多选和框选图片，
    等同于引用多张对应的图片」缺的那一截。
  */
  it("框选多张图片等同于批量引用", () => {
    // 同样先剥注释：块内注释里出现 setReferencedAssets 会让反向断言误报。
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    const start = source.indexOf("const handleSelectionEnd = useCallback");
    expect(start, "没找到框选结束处理").toBeGreaterThan(0);
    const block = source.slice(start, start + 900);

    // 必须复用唯一写入口，而不是自己拼数组塞 setReferencedAssets。
    expect(block).toContain("addReferencedAsset(");
    expect(block).not.toContain("setReferencedAssets(");
    // 只收图片节点：框选很容易连带框到画框和对话节点。
    expect(block).toContain('node?.type === "asset"');
  });

  /*
    2026-09-15 用户：「提示词每次生图之后不需要出现一堆过程推理的提示词，
    就展示状态描述等基本信息即可，否则会导致对话框非常冗长。」

    那段冗长文案不是思维链，而是**大模型改写后的完整提示词被整段回显**
    （ai-intent.ts 要求模型把需求摊平成一段连贯画面描述，动辄数百字）。

    ⚠️⚠️ 这条测试必须同时守住两件**方向相反**的事：
      · 展示用的 content 里不许再拼 imagePrompt（否则对话框还是长）
      · 上下文用的 contextImagePrompt 必须原样保留（否则多轮追改废掉）
    只守前一件，很容易被人「顺手清理」时把后一件也删了，而那个损坏
    要等用户说「这张再暗一点」时才暴露。
  */
  it("生图后只展示状态描述，但完整提示词仍进上下文", () => {
    // 剥注释：旧文案原样写在解释性注释里，不剥会让反向断言误报。
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    // 不展示：两处写入点都不许把提示词拼进气泡文案。
    expect(source).not.toContain("已根据你的请求生成图片：${imagePrompt}");
    expect(source).not.toContain("已根据你的首页提示词生成图片：${imagePrompt}");

    // 文案只有一份，两处共用。
    expect(source).toContain("function formatImageGeneratedStatus(");
    expect(
      source.split("formatImageGeneratedStatus(").length - 1,
      "状态文案应当是一处定义、两处调用",
    ).toBeGreaterThanOrEqual(3);

    // 仍然记录：追改能力依赖它。
    expect(source).toContain("contextImagePrompt: imagePrompt,");
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
    // 旧断言锁的是「画面内容必须尽可能锁定」「不要替换场景、增删道具」这类措辞，
    // 它们会被模型读成「背景像素别动」，正是背景不跟着转的根因，已改写。
    // 现在锁新措辞：锁的是「有哪些东西」，不是「从哪个角度看」。
    expect(source).toContain("它不定义「从哪个角度看」");
    expect(source).toContain("把同一个环境按新机位重新画出来是必须做的");
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

  it("sends expansion ratios from the original image instead of an enlarged source canvas", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    // 比例语义在两家上游是一致的：都等于「扩出的像素 ÷ 原图对应边长」，
    // 所以 2026-09-13 从佐糖切到 VOD Kling 时 toExpansionRatio 一行未动。
    // 上游 id 统一走 shared 常量，禁止再出现字面量。
    expect(source).toContain("model: VOD_IMAGE_EXPANSION_MODEL");
    expect(source).not.toContain('"picwish-advanced-image-expand"');
    expect(source).toContain("toExpansionRatio(expandTop, sourceH)");
    expect(source).toContain("toExpansionRatio(expandLeft, sourceW)");
    expect(source).not.toContain("imageSrc: expandedCanvas.toDataURL");
  });

  it("shows a blocking cloud-retention dialog every 15 days until opted out", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    // 留存时长与提示间隔是产品定的数字，改动必须是有意识的。
    expect(source).toContain("const CLOUD_RETENTION_INTERVAL_DAYS = 15");
    expect(source).toContain("const CLOUD_RETENTION_STORAGE_DAYS = 10");
    expect(source).toContain("云服务器保存 ${CLOUD_RETENTION_STORAGE_DAYS} 天");

    // 「不再提醒」必须是终态：读取侧先查 opt-out 再谈间隔。
    expect(source).toContain('const CLOUD_RETENTION_OPT_OUT_KEY = "artx:cloud-retention-opt-out"');
    expect(source).toContain("function markCloudRetentionOptOut()");
    const gate = source.match(/function shouldShowCloudRetentionToast\(\)[\s\S]*?\n}/)?.[0] ?? "";
    expect(gate).toContain("CLOUD_RETENTION_OPT_OUT_KEY");
    // opt-out 判断必须排在间隔判断之前，否则「不再提醒」会被间隔逻辑绕过。
    expect(gate.indexOf("CLOUD_RETENTION_OPT_OUT_KEY")).toBeLessThan(
      gate.indexOf("CLOUD_RETENTION_INTERVAL_DAYS")
    );
    // 旧版存的是 YYYY-MM-DD，Number() 得 NaN；没有兜底会导致老用户永远不提示。
    expect(gate).toContain("Number.isFinite(lastTime)");

    // 阻断式的核心约束：有两个按钮、不自动消失。
    // ⚠️ 别用 /\n}/ 收尾：解构参数列表自己的 `\n}` 会先命中，
    //    截出来只有函数签名，后面的断言必然全挂（2026-09-16 踩过）。
    //    用函数体结尾的 portal 调用作为明确锚点。
    const dialog =
      source.match(/function CloudRetentionDialog\(\{[\s\S]*?document\.body\s*\);/)?.[0] ?? "";
    expect(dialog).toBeTruthy();
    expect(dialog).toContain("我知道了");
    expect(dialog).toContain("不再提醒");
    expect(dialog).toContain('aria-modal="true"');
    // ⚠️ 遮罩绝不能点击穿透，也不能有自动关闭定时器 —— 否则就不是阻断式。
    expect(dialog).not.toContain("pointerEvents: \"none\"");
    expect(dialog).not.toContain("setTimeout");

    // 旧的「图片下方小气泡 + 每天一次」实现必须已被移除，避免两套并存。
    expect(source).not.toContain("cloudRetentionToastVisible");
    expect(source).not.toContain("artx:cloud-retention-toast-date");
    expect(source).not.toContain("图片会在云服务器当中存储一周时间");
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
    /**
     * ⚠️ 2026-09-15：AssistantModelIcon 与 ModelSelector 迁到了 ModelSelector.tsx，
     * 图标渲染和标题行对齐的实现都跟着走了。锚点必须跟着搬到新文件 ——
     * 这条断言守的是「图标与标题行对齐」的视觉细节（marginTop: 2 + items-start），
     * 留在旧文件上只会恒挂，删掉则等于放弃这个视觉约束。
     */
    const modelSelector = readFileSync(resolve(__dirname, "ModelSelector.tsx"), "utf-8");

    expect(modelSelector).toContain('from "./model-brand-icons"');
    expect(modelSelector).toContain("const iconKind = getModelBrandIconKind(modelId, icon)");
    /*
      ⚠️ 2026-09-16 同 model-brand-icons.si-qwen.test.ts：
         AssistantModelIcon 开了 color 参数后（首页要让图标跟随按钮文字色），
         这里多了 style={{ backgroundColor: color }}，自闭合的 `/>` 不再紧跟
         size={14}，字面量断言失锚。锚点跟着语义走，保留真正的两条约束。
    */
    expect(modelSelector).toMatch(/<ModelBrandIconMask\s+kind=\{iconKind\}\s+size=\{14\}/);
    expect(modelSelector).toContain('data-model-brand-icon={iconKind}');
    expect(modelSelector).toContain("marginTop: 2");

    /**
     * ⚠️ 对齐方式要分别锁两个渲染面，不能只锁一处。
     *
     * 原断言写的是精确 className `flex min-w-0 items-start gap-2.5` ——
     * 那是 InfiniteCanvas.tsx:22852（画布节点里的模型行）的写法，
     * 而 ModelSelector.tsx:295 用的是 `flex items-start gap-2`（间距本就不同）。
     * 迁移后只把路径一换，这条必挂，因为它找的是**另一个面**的 className。
     *
     * 真正要守的约束是「图标与标题行**顶部**对齐」（items-start，
     * 配合 marginTop: 2 做视觉微调）—— 若退回 items-center，
     * 两行文案的模型会让图标浮到中间去。gap 是多少不属于这条断言的职责。
     */
    expect(modelSelector, "选择器下拉行必须顶部对齐").toMatch(
      /className="flex items-start gap-2 /
    );

    const infiniteCanvas = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    expect(infiniteCanvas, "画布节点里的模型行必须顶部对齐").toContain(
      'className="flex min-w-0 items-start gap-2.5"'
    );
  });

  it("keeps generated image processing overlays and extracted-text actions responsive", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    /**
     * 尺寸公式本体已抽到 lib/ai-processing-overlay.ts ——
     * 那里能对全部节点尺寸跑不变量（尤其「留给文字的高度不能小于两行所需」，
     * 否则 flex 会把两行压扁），在组件里只能靠正则，守不住这类关系。
     * 这里退一步只确认：组件确实调用它，没有就地另算一套。
     */
    expect(source).toContain("computeAiProcessingOverlayMetrics(dispW, dispH)");
    expect(source, "不许在组件里就地再算一套遮罩尺寸").not.toContain("const processingBlockSize");
    const overlayMetrics = readFileSync(
      resolve(__dirname, "../../lib/ai-processing-overlay.ts"),
      "utf-8"
    );
    expect(overlayMetrics).toContain("Math.min(140, Math.min(safeW, safeH) * 0.2)");
    expect(overlayMetrics).toContain("Math.max(16, blockSize * 0.58)");
    expect(overlayMetrics).toContain("Math.max(6, blockSize * 0.13)");
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
    /*
     * 2026-09-19 面板结构两处漂移，锚点同步更新：
     *   1. 面板头部不再有 `type-caption` + `fontWeight: 700` 的标题 span，
     *      改从滚动容器（ref={extractedTextScrollRef}）起截；
     *   2. 字段渲染从 `.map(... => (...))` 改为 `return (...)`，
     *      结尾锚点由 `</label>))}` 变为 `</label>);})}`。
     * 断言覆盖面不变：滚动容器样式 + 字段结构都在截取范围内。
     */
    const extractedTextPanelBlock = source.match(
      /<div\s+ref=\{extractedTextScrollRef\}[\s\S]*?<\/label>\s*\);\s*\}\)\}/
    )?.[0];

    /**
     * 「智能文案编辑」工具栏入口必须处于**启用态**。
     *
     * 断言方式沿用 2026-09-12 那次的思路，只是方向反过来（那次是入口被屏蔽）。
     * 用行首缩进 + 无 `//` 前缀区分「真实代码」与「被注释的代码」——
     * 单纯 `toContain('label: "智能文案编辑"')` 是假阳性写法，
     * 注释文本里同样含这个字符串，入口被注释掉也照样通过。
     *
     * 2026-09-12 屏蔽 → 2026-09-13 恢复开放（改走即梦做 AI 叠字评估）。
     */
    expect(source).toMatch(/^\s{6}label: "智能文案编辑",$/m);
    expect(source).not.toMatch(/^\s*\/\/\s*label: "智能文案编辑",$/m);
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
    /**
     * 模型必须绑定具体常量，不得用 `"auto"`。
     *
     * auto 表达的是**全局出图优先级**，会随其他需求调整；而智能文案编辑依赖的
     * 是「某个模型在保真局部编辑 + 文字渲染上的具体表现」，不应跟着全局链漂移。
     *
     * 2026-09-12 绑 DEFAULT_IMAGE_AI_MODEL_ID（image2.5）；
     * 2026-09-13 改为绑 SMART_TEXT_EDIT_AI_MODEL_ID（vod-jimeng 即梦 4.0），
     * 并以即梦为**优先通道**。
     * 以后换模型只应改这一个常量。
     */
    expect(applyTextEditBlock).toContain("model: SMART_TEXT_EDIT_AI_MODEL_ID");
    expect(applyTextEditBlock).not.toContain('model: "auto"');
    /**
     * 2026-09-13：智能文案编辑**优先走即梦**，必须显式传 textApplyMode: "ai"。
     *
     * 不传时服务端走默认的 "local" 本地确定性绘制 —— 阶段 B 直接 return，
     * 即梦根本不会被调用（表现为「改了配置但模型没参与」，且日志里毫无痕迹）。
     *
     * 两条请求路径必须同时带上：backgroundTaskInput（后台任务，优先级更高）
     * 与 run（前台执行）。只改一处时另一条会静默沿用旧行为。
     *
     * 代价备忘：AI 叠字逐字命中率 3/7、4/7 且出现过错字，本地绘制 7/7；
     * 改回本地只需删掉这两处参数。
     */
    expect(applyTextEditBlock).toContain('textApplyMode: "ai"');
    expect(
      (applyTextEditBlock.match(/textApplyMode: "ai"/g) || []).length
    ).toBeGreaterThanOrEqual(2);
    expect(applyTextEditBlock).toContain('toast("正在应用文案"');
    expect(applyTextEditBlock).toContain("原图中所有非文字像素必须原封不动保留");
    expect(applyTextEditBlock).toContain("禁止重绘或改变人物、产品、背景");
    expect(applyTextEditBlock).not.toContain("image-text-relayout");
    expect(applyTextEditBlock).not.toContain("callLLM({");
    expect(serverSource).toContain('const isTextEditOperation = input.operation === "text_edit";');
    expect(serverSource).toContain("This is a local text replacement edit");
    expect(serverSource).toContain("Use the source image as the only target canvas");
    expect(serverSource).toContain("__testCompositeSourcePreservingImageEdit");
    /**
     * 服务端必须真正把 VOD 精确蒙版交给模型，并关闭服务端 prompt 增强。
     *
     * 这两条是 2026-09-13 评估即梦时踩出来的坑，缺任一条评估结论都会被污染：
     * - 蒙版：generateImages 是按参考图的 title 识别蒙版的，title 不叫
     *   "annotation mask" 就不会被当作 mask 下发（日志里 hasMask: false），
     *   模型只能靠橙色引导图去猜可改范围。
     * - 增强：提示词里带着「必须逐字渲染这段文案」的精确指令，
     *   服务端增强会把它整体改写，表现就是漏字、错字、自行改写文案。
     */
    expect(serverSource).toContain('title: "annotation mask"');
    expect(serverSource).toContain("textEditVodMaskDataUrl");
    expect(serverSource).toContain(
      "enhancePrompt: isCameraViewOperation || isTextEditOperation ? false : undefined"
    );
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

  /*
    下面三条守的是同一个 bug：文字提取成功、面板里明明有字，
    点「应用到新图」却报「未从图片中识别出文字区域」。

    根因是「提取成功」被当成了一个条件，实际是两个：
    有文字（能看能复制）和有坐标（能擦能改）。OCR 只回文字不回坐标时，
    面板表现与完全成功一模一样，错误一直推迟到最后一步才炸出来。

    ⚠️ 必须 stripComments 后再断言：本文件顶部记过这个坑，
    上一轮改引用交互时又踩了一次——解释性注释里会原样写出被删掉的旧代码，
    反向断言会命中注释而误报。
  */
  it("缺文字坐标时，应用按钮直接不可点而不是点了才报错", () => {
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    // 判据必须是「有没有坐标」，不能是「有没有文字」：
    // 擦字靠 regions 的坐标框定位，只有文字是改不了的。
    expect(source).toContain(
      "const canApplyExtractedText = extractedTextRegions.length > 0;",
    );

    // 按钮必须真的被这个条件禁用，而不只是变个样子。
    const applyButton = source.match(
      /onClick=\{\(\) => \{\s*void applyExtractedTextToNewImage\(\);[\s\S]*?<\/button>/,
    )?.[0];
    expect(applyButton).toBeTruthy();
    expect(applyButton).toContain("!canApplyExtractedText");
    expect(applyButton).toContain("无法定位文字位置");
  });

  it("提取到文字但没坐标时，当场告知而不是等用户白编辑一轮", () => {
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    // 提取环节必须按「缺不缺坐标」分开报，不能一律「编辑完成」。
    expect(source).toContain(
      'if (ocrRegions.length === 0 && text !== "未识别到可读文案") {',
    );
    expect(source).toContain("文案已提取，但无法定位文字位置");

    // 成功分支要原样保留，别为了修这个 bug 把正常提示也一起砍了。
    expect(source).toContain('toast("智能文案编辑完成"');
  });

  it("无坐标的报错文案要说缺坐标，不能说没识别到文字", () => {
    const source = stripComments(
      readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8"),
    );

    /*
      旧文案「未从图片中识别出文字区域」与用户眼前的事实直接打架：
      面板里正显示着提取出来的文字，却被告知没识别到文字。
      缺的是坐标不是文字，必须照实说。
    */
    expect(source).not.toContain("未从图片中识别出文字区域，请更换图片或重新提取后再试");
    expect(source).toContain("但没有取到文字在图片中的坐标");

    // 另一条分支（有坐标但匹配不上改动行）语义不同，必须保留区分。
    expect(source).toContain("未能定位被修改的原图文字区域");
  });
});
