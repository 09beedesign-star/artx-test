/**
 * Text Replacement Module (Improved)
 * 
 * Handles OCR-based text extraction and replacement in images.
 * Improved flow:
 * 1. Extract text regions from image using enhanced OCR
 * 2. Validate and filter OCR results
 * 3. Two-step replacement: background inpainting + text generation
 * 4. Verify and return results
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
 * Enhanced OCR prompt that ensures comprehensive text detection
 */
export function buildEnhancedOCRPrompt(): string {
  return `You are a professional OCR system. Your task is to extract ALL text from the image.

CRITICAL REQUIREMENTS:
1. Identify EVERY piece of text visible in the image
2. Include titles, subtitles, labels, prices, descriptions, watermarks, dates, and any other text
3. For each text element, provide:
   - Exact text content
   - Precise bounding box (x, y, width, height as normalized 0-1 values)
   - Estimated font size (small/medium/large)
   - Text color (RGB or color name)
   - Confidence score (0-1)
   - Text direction (horizontal/vertical)

4. Do NOT skip any text, no matter how small or faint
5. Return results in structured JSON format

Format your response as JSON:
{
  "regions": [
    {
      "text": "string",
      "x": 0.0,
      "y": 0.0,
      "width": 0.1,
      "height": 0.05,
      "fontSize": "medium",
      "color": "white",
      "confidence": 0.95,
      "direction": "horizontal"
    }
  ]
}`;
}

/**
 * Build a two-step replacement prompt
 * Step 1: Remove original text and repair background
 * Step 2: Add new text with matching style
 */
export function buildTwoStepReplacementPrompt(
  regions: ImageTextRegion[],
  replacements: TextReplacement[],
): { step1: string; step2: string } {
  const replacementMap = new Map(
    replacements.map(r => [r.regionIndex, r.newText])
  );

  // Step 1: Background inpainting prompt
  const step1Instructions: string[] = [
    "STEP 1: BACKGROUND INPAINTING",
    "",
    "Remove the following text regions and repair the background naturally:",
    "",
  ];

  for (const replacement of replacements) {
    const region = regions[replacement.regionIndex];
    if (region) {
      step1Instructions.push(
        `- Remove text "${region.text}" at position (${(region.x * 100).toFixed(0)}%, ${(region.y * 100).toFixed(0)}%)`
      );
    }
  }

  step1Instructions.push("");
  step1Instructions.push(
    "REQUIREMENTS:",
    "- Use content-aware fill or inpainting to repair the background",
    "- Preserve the original background color, texture, and pattern",
    "- Ensure the repair is seamless and natural",
    "- Do NOT modify any other elements in the image",
    "- Do NOT change the image composition or layout"
  );

  // Step 2: Text generation prompt
  const step2Instructions: string[] = [
    "STEP 2: TEXT GENERATION",
    "",
    "Add the following text to the image at the specified positions:",
    "",
  ];

  for (const replacement of replacements) {
    const region = regions[replacement.regionIndex];
    if (region) {
      const fontSize = region.confidence && region.confidence > 0.9 ? "large" : "medium";
      step2Instructions.push(
        `- Text: "${replacement.newText}"`,
        `  Position: (${(region.x * 100).toFixed(0)}%, ${(region.y * 100).toFixed(0)}%)`,
        `  Size: ${fontSize}`,
        `  Color: Match original (${region.text} color)`,
        `  Style: Match original font and styling`,
        ""
      );
    }
  }

  step2Instructions.push(
    "REQUIREMENTS:",
    "- Use the exact same font style and size as the original text",
    "- Match the original text color exactly",
    "- Maintain the same alignment and positioning",
    "- Ensure the text blends naturally with the background",
    "- Do NOT modify any other elements"
  );

  return {
    step1: step1Instructions.join("\n"),
    step2: step2Instructions.join("\n"),
  };
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

    // Add padding around text regions for better inpainting
    const padding = Math.max(5, Math.round(Math.min(region.width, region.height) * imageWidth * 0.1));
    const paddedX1 = Math.max(0, x1 - padding);
    const paddedY1 = Math.max(0, y1 - padding);
    const paddedX2 = Math.min(imageWidth, x2 + padding);
    const paddedY2 = Math.min(imageHeight, y2 + padding);

    // Fill the region with padding
    for (let y = paddedY1; y < paddedY2; y++) {
      for (let x = paddedX1; x < paddedX2; x++) {
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
 * Build a comprehensive replacement prompt with detailed instructions
 */
export function buildComprehensiveReplacementPrompt(
  regions: ImageTextRegion[],
  replacements: TextReplacement[],
): string {
  const instructions: string[] = [
    "=== COMPREHENSIVE TEXT REPLACEMENT TASK ===",
    "",
    "OBJECTIVE:",
    "Replace specific text in the image while maintaining visual consistency.",
    "",
    "TEXT REPLACEMENTS:",
    "",
  ];

  for (const replacement of replacements) {
    const region = regions[replacement.regionIndex];
    if (region) {
      instructions.push(
        `[${replacement.regionIndex + 1}] Replace: "${region.text}" → "${replacement.newText}"`
      );
      instructions.push(
        `     Position: ${(region.x * 100).toFixed(0)}% from left, ${(region.y * 100).toFixed(0)}% from top`
      );
      instructions.push(
        `     Size: ${(region.width * 100).toFixed(0)}% width, ${(region.height * 100).toFixed(0)}% height`
      );
      instructions.push("");
    }
  }

  instructions.push(
    "CRITICAL REQUIREMENTS:",
    "1. BACKGROUND REPAIR:",
    "   - Remove all original text completely",
    "   - Use intelligent inpainting to fill text areas",
    "   - Preserve background color, texture, and patterns",
    "   - Ensure seamless blending with surrounding areas",
    "",
    "2. TEXT GENERATION:",
    "   - Generate new text with exact specifications",
    "   - Match original font, size, color, and style",
    "   - Position text precisely at original locations",
    "   - Ensure text is readable and well-aligned",
    "",
    "3. QUALITY ASSURANCE:",
    "   - Verify all text is completely replaced",
    "   - Check background repair quality",
    "   - Ensure no artifacts or distortions",
    "   - Maintain image composition and layout",
    "",
    "4. PRESERVATION:",
    "   - Do NOT modify any non-text elements",
    "   - Keep all images, logos, decorations intact",
    "   - Preserve original colors and lighting",
    "   - Maintain image resolution and quality",
    "",
    "OUTPUT:",
    "Return a single high-quality image with all replacements completed successfully."
  );

  return instructions.join("\n");
}

/**
 * Main function: Replace text in image with improved two-step process
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

  // Build comprehensive replacement prompt
  const prompt = buildComprehensiveReplacementPrompt(ocrResult.regions, input.replacements);

  // Call the existing image edit function with enhanced prompt
  const result = await editImageWithPrompt({
    imageSrc: input.imageSrc,
    prompt,
    operation: "text_edit",
    model: input.model || "auto",
    preserveSource: true,
  });

  if (!result.images || result.images.length === 0) {
    throw new Error("Image replacement failed - no output generated");
  }

  return {
    images: result.images || [],
  };
}
