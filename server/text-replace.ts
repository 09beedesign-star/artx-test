/**
 * Text Replacement Module
 * 
 * Handles OCR-based text extraction and replacement in images.
 * Flow:
 * 1. Extract text regions from image using OCR
 * 2. Generate mask for text areas to be replaced
 * 3. Use image edit to replace text while preserving source
 */

// Define ImageTextRegion locally to avoid circular dependency
export interface ImageTextRegion {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  direction?: "horizontal" | "vertical";
}

export interface TextReplacement {
  originalText: string;
  newText: string;
  regionIndex: number;
}

export interface ReplaceImageTextInput {
  imageSrc: string;
  replacements: TextReplacement[];
  model?: string;
}

export interface ReplaceImageTextOutput {
  images: Array<{
    src: string;
    width: number;
    height: number;
  }>;
}

/**
 * Generate a mask image that marks all text regions to be replaced
 * The mask uses white (255) for areas to be edited, black (0) for areas to preserve
 */
export async function generateTextReplacementMask(
  regions: ImageTextRegion[],
  imageWidth: number,
  imageHeight: number,
  replacementIndices: Set<number>,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  
  // Create a white canvas (all editable)
  const maskBuffer = Buffer.alloc(imageWidth * imageHeight * 4);
  const view = new Uint32Array(maskBuffer.buffer);
  
  // Fill with white (0xFFFFFFFF = white with full alpha)
  for (let i = 0; i < view.length; i++) {
    view[i] = 0xFFFFFFFF;
  }
  
  // For each region to be replaced, ensure it's marked white
  // For regions NOT to be replaced, mark them black (0x000000FF = black with full alpha)
  const pixelData = new Uint8Array(maskBuffer);
  
  for (let regionIdx = 0; regionIdx < regions.length; regionIdx++) {
    const region = regions[regionIdx];
    const shouldReplace = replacementIndices.has(regionIdx);
    
    // Convert normalized coordinates to pixel coordinates
    const x1 = Math.round(region.x * imageWidth);
    const y1 = Math.round(region.y * imageHeight);
    const x2 = Math.round((region.x + region.width) * imageWidth);
    const y2 = Math.round((region.y + region.height) * imageHeight);
    
    // Fill the region
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const pixelIndex = (y * imageWidth + x) * 4;
        if (shouldReplace) {
          // White for editable areas
          pixelData[pixelIndex] = 255;
          pixelData[pixelIndex + 1] = 255;
          pixelData[pixelIndex + 2] = 255;
          pixelData[pixelIndex + 3] = 255;
        } else {
          // Black for areas to preserve
          pixelData[pixelIndex] = 0;
          pixelData[pixelIndex + 1] = 0;
          pixelData[pixelIndex + 2] = 0;
          pixelData[pixelIndex + 3] = 255;
        }
      }
    }
  }
  
  // Convert raw pixel data to PNG
  const pngBuffer = await sharp(pixelData, {
    raw: {
      width: imageWidth,
      height: imageHeight,
      channels: 4,
    },
    limitInputPixels: false,
  }).png().toBuffer();
  
  return pngBuffer;
}

/**
 * Build a replacement prompt that instructs the image editor to replace specific text
 */
export function buildTextReplacementPrompt(
  regions: ImageTextRegion[],
  replacements: TextReplacement[],
): string {
  const replacementMap = new Map(
    replacements.map(r => [r.regionIndex, r.newText])
  );
  
  const instructions: string[] = [
    "This is a text replacement task. Replace the following text regions in the image:",
    "",
  ];
  
  for (const replacement of replacements) {
    const region = regions[replacement.regionIndex];
    if (region) {
      instructions.push(
        `- Replace "${region.text}" with "${replacement.newText}"`
      );
    }
  }
  
  instructions.push("");
  instructions.push(
    "Requirements:",
    "- Keep the same font style, size, and color as the original text",
    "- Maintain the same alignment and positioning",
    "- Preserve all non-text elements (background, images, decorations)",
    "- Ensure the replaced text blends naturally with the surrounding area",
    "- Do not change the image composition or other visual elements"
  );
  
  return instructions.join("\n");
}

/**
 * Main function: Replace text in image
 */
export async function replaceImageText(
  input: ReplaceImageTextInput,
  ocrResult: { text: string; regions: ImageTextRegion[] },
  editImageWithPrompt: (editInput: any) => Promise<{ images: any[] }>,
): Promise<ReplaceImageTextOutput> {
  if (!ocrResult.regions || ocrResult.regions.length === 0) {
    throw new Error("No text regions found in image");
  }
  
  if (!input.replacements || input.replacements.length === 0) {
    throw new Error("No replacements specified");
  }
  
  // Validate replacement indices
  const replacementIndices = new Set<number>();
  for (const replacement of input.replacements) {
    if (replacement.regionIndex < 0 || replacement.regionIndex >= ocrResult.regions.length) {
      throw new Error(`Invalid region index: ${replacement.regionIndex}`);
    }
    replacementIndices.add(replacement.regionIndex);
  }
  
  // Get image dimensions
  const sharp = (await import("sharp")).default;
  const { imageSrc } = input;
  
  // For now, we'll assume the image is provided as a data URL or URL
  // In production, you'd extract dimensions from the actual image
  // For this implementation, we'll use a reasonable default and let the edit function handle it
  
  // Build the replacement prompt
  const prompt = buildTextReplacementPrompt(ocrResult.regions, input.replacements);
  
  // Call the existing image edit function with text_edit operation
  const result = await editImageWithPrompt({
    imageSrc,
    prompt,
    operation: "text_edit",
    model: input.model || "auto",
    preserveSource: true,
  });
  
  return {
    images: result.images || [],
  };
}
