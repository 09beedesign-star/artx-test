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
