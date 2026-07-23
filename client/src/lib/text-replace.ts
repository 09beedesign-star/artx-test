/**
 * Text Replacement Client
 * 
 * Frontend functions for OCR-based text extraction and replacement
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
 * Extract text from image using OCR
 */
export async function extractTextFromImage(imageSrc: string): Promise<ExtractedText> {
  const result = await extractImageText({ imageSrc });

  return {
    text: result.text || "",
    regions: result.regions || [],
    provider: result.provider || "vision-ocr",
  };
}

/**
 * Replace text in image
 */
export async function replaceTextInImage(input: ReplaceTextInput) {
  // Build replacement prompt from the replacements array
  const replacementInstructions = input.replacements
    .map(r => `Replace "${r.originalText}" with "${r.newText}"`)
    .join("; ");
  
  const prompt = `This is a text replacement task. ${replacementInstructions}. Keep the same font style, size, and color as the original text. Maintain alignment and positioning. Preserve all non-text elements.`;
  
  const result = await editImageWithPrompt({
    imageSrc: input.imageSrc,
    prompt,
    operation: "text_edit",
    model: input.model || DEFAULT_IMAGE_MODEL_ID,
    preserveSource: true,
  });

  return {
    images: result.images || [],
  };
}

/**
 * Combined function: Extract text and prepare for editing
 */
export async function prepareTextReplacementUI(imageSrc: string) {
  try {
    const extracted = await extractTextFromImage(imageSrc);
    
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute text replacement
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
  // Filter only items that have been changed
  const replacements = editableItems
    .filter(item => item.newText !== item.originalText)
    .map(item => ({
      originalText: item.originalText,
      newText: item.newText,
      regionIndex: item.regionIndex,
    }));

  if (replacements.length === 0) {
    return {
      success: false,
      error: "没有修改任何文字",
    };
  }

  try {
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
