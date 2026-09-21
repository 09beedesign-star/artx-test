/**
 * Text Replacement Client (Improved)
 * 
 * Frontend functions for OCR-based text extraction and replacement
 * with enhanced prompt engineering and error handling
 */

import { DEFAULT_IMAGE_MODEL_ID } from "../../../shared/image-models";
import { editImageWithPrompt, extractImageText } from "./ai";

export interface ImageTextRegion {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  direction?: "horizontal" | "vertical";
}

export interface ExtractedText {
  text: string;
  regions: ImageTextRegion[];
  provider: string;
}

export interface TextReplacement {
  originalText: string;
  newText: string;
  regionIndex: number;
}

const normalizeRegionText = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[\s.,!?;:，。！？；：、'"“”‘’（）()[\]{}<>《》…—\-_/\\]/g, "");

/** 计算两段文本的字符重合度（0~1），用于 OCR 断行/错字时的模糊匹配 */
function charOverlapRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let shared = 0;
  for (const ch of b) {
    const left = counts.get(ch) ?? 0;
    if (left > 0) {
      counts.set(ch, left - 1);
      shared += 1;
    }
  }
  return shared / Math.max(a.length, b.length);
}

/** 用 LCS 行级 diff 找出「被改动」的原文行下标 */
export function findChangedLineIndexes(originalText: string, editedText: string): Set<number> {
  const originalValues = originalText.split("\n").map(field => field.trim());
  const editedValues = editedText.split("\n").map(field => field.trim());
  const lcs = Array.from({ length: originalValues.length + 1 }, () =>
    Array<number>(editedValues.length + 1).fill(0),
  );
  for (let i = originalValues.length - 1; i >= 0; i -= 1) {
    for (let j = editedValues.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        originalValues[i] && originalValues[i] === editedValues[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const unchanged = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < originalValues.length && j < editedValues.length) {
    if (originalValues[i] && originalValues[i] === editedValues[j]) {
      unchanged.add(i);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  const changed = new Set<number>();
  for (let index = 0; index < originalValues.length; index += 1) {
    if (originalValues[index] && !unchanged.has(index)) changed.add(index);
  }
  return changed;
}

export type RegionSelectionStrategy = "exact" | "fuzzy" | "positional" | "all";

export interface RegionSelectionResult<T> {
  regions: T[];
  strategy: RegionSelectionStrategy;
}

/**
 * 从 OCR 区域中挑出「真正被改动」的那几个。
 *
 * 分四级逐步降级，尽量避免"只改一行却擦整页"：
 *   1. exact      —— 归一化后精确/包含匹配（最可靠）
 *   2. fuzzy      —— 字符重合度 ≥ 0.6，容忍 OCR 少字、错字、断行
 *   3. positional —— 区域数与原文行数一致时，按行序下标直接对应
 *   4. all        —— 前三级都失败才退化为全部区域（原有兜底行为）
 *
 * 抽成纯函数是为了可单测：蒙版画布逻辑依赖 DOM，匹配逻辑不该被绑死在组件里。
 */
export function selectEditedTextRegions<T extends { text?: string }>(
  regions: T[],
  originalText: string,
  editedText: string,
): RegionSelectionResult<T> {
  if (regions.length === 0) return { regions: [], strategy: "all" };

  const originalFields = originalText.split("\n").map(field => field.trim());
  const editedFields = editedText.split("\n").map(field => field.trim());
  const changedIndexes = findChangedLineIndexes(originalText, editedText);
  const changedFields = originalFields.filter((field, index) => field && changedIndexes.has(index));
  if (changedFields.length === 0) {
    // 没有任何原文行被「改写」，但用户可能是「纯新增行」：原有文案一行没动，只是加了新文案。
    // 这种场景仍然需要蒙版（新文字得有地方落），否则整条改字流程会直接报错中断。
    const originalSet = new Set(originalFields.filter(Boolean));
    const hasAddition = editedFields.some(field => field && !originalSet.has(field));
    return hasAddition ? { regions, strategy: "all" } : { regions: [], strategy: "exact" };
  }

  const normalizedChanged = changedFields.map(normalizeRegionText).filter(Boolean);
  const normalizedRegions = regions.map(r => normalizeRegionText(r.text || ""));

  // 1~2) 打分式 1 对 1 匹配。
  //
  // 这里必须是「每个改动行挑一个最佳区域」，而不是「每个区域看是否命中任一改动行」。
  // 后者在子串场景下会误伤：改动行 "标题文字" 会同时命中区域 "标题文字" 和 "副标题文字"
  // （因为 "副标题文字".includes("标题文字")），导致只改一行却擦掉两行。
  const scoreOf = (field: string, regionText: string): number => {
    if (!field || !regionText) return 0;
    if (field === regionText) return 1;
    if (field.includes(regionText) || regionText.includes(field)) {
      // 长度越接近，越可能是同一行；差距大时降权，避免短行错配到长行
      return 0.9 * (Math.min(field.length, regionText.length) / Math.max(field.length, regionText.length));
    }
    return charOverlapRatio(field, regionText);
  };

  const matchWithThreshold = (threshold: number) => {
    const taken = new Set<number>();
    for (const field of normalizedChanged) {
      let bestIndex = -1;
      let bestScore = 0;
      for (let i = 0; i < normalizedRegions.length; i += 1) {
        if (taken.has(i)) continue;
        const score = scoreOf(field, normalizedRegions[i]);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      if (bestIndex >= 0 && bestScore >= threshold) taken.add(bestIndex);
    }
    return Array.from(taken)
      .sort((a, b) => a - b)
      .map(i => regions[i]);
  };

  // 高阈值：精确相等或长度接近的包含关系
  const exact = matchWithThreshold(0.85);
  if (exact.length > 0) return { regions: exact, strategy: "exact" };

  // 低阈值：容忍 OCR 少字/错字/断行
  const fuzzy = matchWithThreshold(0.6);
  if (fuzzy.length > 0) return { regions: fuzzy, strategy: "fuzzy" };

  // 3) 位置对应：区域数与原文非空行数一致时，行序即区域序
  const nonEmptyIndexes = originalFields
    .map((field, index) => (field ? index : -1))
    .filter(index => index >= 0);
  if (nonEmptyIndexes.length === regions.length) {
    const positional = nonEmptyIndexes
      .map((originalIndex, order) => (changedIndexes.has(originalIndex) ? regions[order] : null))
      .filter((region): region is T => region !== null);
    if (positional.length > 0) return { regions: positional, strategy: "positional" };
  }

  // 4) 实在匹配不上，才退化为全部区域
  return { regions, strategy: "all" };
}

export interface ReplaceTextInput {
  imageSrc: string;
  replacements: TextReplacement[];
  model?: string;
  ocrModel?: string;
}

/**
 * Build a comprehensive text replacement prompt with detailed instructions
 */
function buildComprehensiveReplacementPrompt(
  replacements: Array<{ originalText: string; newText: string; index: number }>
): string {
  const replacementList = replacements
    .map((r, i) => `${i + 1}. "${r.originalText}" → "${r.newText}"`)
    .join("\n");

  return `=== PROFESSIONAL TEXT REPLACEMENT TASK ===

OBJECTIVE:
Replace specific text in the image while maintaining perfect visual consistency.

TEXT REPLACEMENTS TO PERFORM:
${replacementList}

CRITICAL INSTRUCTIONS:

1. BACKGROUND PREPARATION:
   - Identify all text regions that need to be replaced
   - Use intelligent inpainting/content-aware fill to remove original text
   - Preserve background color, texture, patterns, and lighting
   - Ensure seamless blending with surrounding areas
   - Do NOT leave any traces of original text
   - Handle complex backgrounds with care

2. TEXT GENERATION:
   - Generate new text with exact specifications
   - Match original font family, weight, and style
   - Match original text color precisely
   - Match original font size
   - Position text at exact original locations
   - Maintain original text alignment (left/center/right)
   - Ensure text is readable and clear

3. QUALITY ASSURANCE:
   - Verify all text is completely replaced
   - Check background repair quality
   - Ensure no artifacts, distortions, or blurriness
   - Verify text readability and clarity
   - Maintain image composition and layout
   - Ensure no color shifts or lighting changes

4. PRESERVATION:
   - Do NOT modify any non-text elements
   - Keep all images, logos, decorations, and icons intact
   - Preserve original colors and lighting
   - Maintain image resolution and quality
   - Do NOT change image dimensions
   - Preserve all visual effects and shadows

5. SPECIAL CASES:
   - If text is on a complex background, use advanced inpainting
   - If text has shadows or effects, preserve them
   - If text is overlaid on images, handle carefully
   - If text has transparency, maintain it
   - If text is in different languages, handle appropriately

FINAL OUTPUT:
Return a single high-quality image with all replacements completed successfully.
The image should look natural and professional, as if the new text was original.`;
}

/**
 * Extract text from image using OCR
 */
export async function extractTextFromImage(imageSrc: string): Promise<ExtractedText> {
  try {
    const result = await extractImageText({ imageSrc });

    // Validate and filter regions
    const regions = (result.regions || []).filter((region: any) => {
      return (
        region.text &&
        typeof region.x === "number" &&
        typeof region.y === "number" &&
        typeof region.width === "number" &&
        typeof region.height === "number"
      );
    });

    if (regions.length === 0) {
      throw new Error("No text regions detected in image");
    }

    return {
      text: result.text || "",
      regions: regions as ImageTextRegion[],
      provider: result.provider || "vision-ocr",
    };
  } catch (error) {
    console.error("OCR extraction failed:", error);
    throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Replace text in image with comprehensive prompt engineering
 */
export async function replaceTextInImage(input: ReplaceTextInput) {
  try {
    if (!input.replacements || input.replacements.length === 0) {
      throw new Error("No replacements specified");
    }

    // Build comprehensive replacement prompt
    const replacementList = input.replacements.map((r, i) => ({
      originalText: r.originalText,
      newText: r.newText,
      index: i,
    }));

    const prompt = buildComprehensiveReplacementPrompt(replacementList);

    // Call image edit with enhanced prompt
    const result = await editImageWithPrompt({
      imageSrc: input.imageSrc,
      prompt,
      operation: "text_edit",
      model: input.model || DEFAULT_IMAGE_MODEL_ID,
      preserveSource: true,
    });

    if (!result.images || result.images.length === 0) {
      throw new Error("Image replacement failed - no output generated");
    }

    return {
      images: result.images || [],
    };
  } catch (error) {
    console.error("Text replacement failed:", error);
    throw new Error(`Failed to replace text: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Combined function: Extract text and prepare for editing
 */
export async function prepareTextReplacementUI(imageSrc: string) {
  try {
    const extracted = await extractTextFromImage(imageSrc);

    // Validate extraction results
    if (!extracted.regions || extracted.regions.length === 0) {
      return {
        success: false,
        error: "No text found in image. Please try another image.",
      };
    }

    return {
      success: true,
      text: extracted.text,
      regions: extracted.regions,
      provider: extracted.provider,
      editableItems: extracted.regions.map((region, index) => ({
        id: `text-${index}`,
        originalText: region.text,
        newText: region.text,
        regionIndex: index,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        confidence: region.confidence,
        direction: region.direction,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred during text extraction",
    };
  }
}

/**
 * Execute text replacement with validation
 */
export async function executeTextReplacement(
  imageSrc: string,
  editableItems: Array<{
    id: string;
    originalText: string;
    newText: string;
    regionIndex: number;
  }>,
  model?: string
) {
  try {
    // Filter only items that have been changed
    const replacements = editableItems
      .filter((item) => item.newText !== item.originalText)
      .map((item) => ({
        originalText: item.originalText,
        newText: item.newText,
        regionIndex: item.regionIndex,
      }));

    if (replacements.length === 0) {
      return {
        success: false,
        error: "No text changes detected. Please modify at least one text.",
      };
    }

    // Validate replacements
    for (const replacement of replacements) {
      if (!replacement.newText || replacement.newText.trim().length === 0) {
        return {
          success: false,
          error: `Cannot replace "${replacement.originalText}" with empty text`,
        };
      }
    }

    const result = await replaceTextInImage({
      imageSrc,
      replacements,
      model,
    });

    return {
      success: true,
      images: result.images,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during replacement",
    };
  }
}
