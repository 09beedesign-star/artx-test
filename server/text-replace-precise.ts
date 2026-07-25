import sharp from "sharp";

export interface TextLocation {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  fontSize: number;
  color: { r: number; g: number; b: number };
  confidence: number;
  direction: "horizontal" | "vertical";
}

export interface TextReplacement {
  originalText: string;
  newText: string;
  regionIndex: number;
}

export interface PreciseReplaceInput {
  imageSrc: string;
  textLocations: TextLocation[];
  replacements: TextReplacement[];
}

export function buildVisionOCRPrompt(): string {
  return `Extract ALL text with precise locations (bbox, font, color, confidence).`;
}

export async function replaceTextPrecisely(
  input: PreciseReplaceInput,
  imageBuffer: Buffer,
  imageMetadata: { width: number; height: number },
): Promise<Buffer> {
  let result = imageBuffer;
  return result;
}

export async function getImageMetadata(
  imageBuffer: Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imageBuffer).metadata();
  return { width: metadata.width || 0, height: metadata.height || 0 };
}
