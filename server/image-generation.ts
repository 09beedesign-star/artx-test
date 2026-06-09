type ImageGenerateInput = {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
};

type RemoveBackgroundInput = {
  imageSrc: string;
  model?: string;
  prompt?: string;
};

type EditImageInput = {
  imageSrc: string;
  model?: string;
  prompt: string;
  targetWidth?: number;
  targetHeight?: number;
};

type EraseImageInput = {
  imageSrc: string;
  maskSrc: string;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
};

type GeneratedImage = {
  src: string;
  width: number;
  height: number;
};

type ImageGenerationResponse = {
  task_id?: string;
  status?: string;
  message?: string;
  images?: Array<{ b64_json?: string; url?: string }>;
  data?: Array<{ b64_json?: string; url?: string }>;
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string } | string;
};

type AsyncImageTaskResponse = {
  success?: boolean;
  data?: {
    taskId?: string;
    status?: string;
    error?: string;
    result?: ImageGenerationResponse;
    rawResult?: ImageGenerationResponse;
    upstreamStatus?: number;
    requestPath?: string;
    resolvedRequestPath?: string;
    prompt?: string;
    model?: string;
  };
  result?: ImageGenerationResponse;
  rawResult?: ImageGenerationResponse;
  status?: string;
  error?: { message?: string } | string;
};

function normalizeAsyncTaskResult(data: AsyncImageTaskResponse): {
  status?: string;
  error?: string;
  result?: ImageGenerationResponse;
} {
  const task = data.data;
  const error =
    typeof data.error === "string"
      ? data.error
      : data.error?.message || task?.error;

  return {
    status: task?.status || data.status,
    error,
    result: task?.result || task?.rawResult || data.result || data.rawResult,
  };
}

function resolveGeneratedImageSrc(src: string, baseUrl: string) {
  if (!src) return src;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  return toAbsoluteUrl(src, baseUrl);
}

function extractGeneratedImages(providerData: ImageGenerationResponse, baseUrl: string, width: number, height: number) {
  const items = providerData.data || providerData.images || [];
  const images = items
    .map((item) => {
      const src = item.b64_json
        ? `data:image/png;base64,${item.b64_json}`
        : item.url
          ? resolveGeneratedImageSrc(item.url, baseUrl)
          : undefined;
      return src ? { src, width, height } : null;
    })
    .filter((item): item is GeneratedImage => Boolean(item));

  if (images.length > 0) return images;

  const choiceImages = extractChoiceImages(providerData, baseUrl).map((item) => ({
    ...item,
    src: resolveGeneratedImageSrc(item.src, baseUrl),
    width,
    height,
  }));

  return choiceImages;
}

const ratioToSize: Record<string, { size: string; width: number; height: number }> = {
  "1:1": { size: "1024x1024", width: 1024, height: 1024 },
  "4:5": { size: "1024x1536", width: 1024, height: 1280 },
  "5:4": { size: "1536x1024", width: 1280, height: 1024 },
  "3:4": { size: "1024x1536", width: 1024, height: 1365 },
  "4:3": { size: "1536x1024", width: 1365, height: 1024 },
  "16:9": { size: "1536x1024", width: 1536, height: 864 },
  "9:16": { size: "1024x1536", width: 864, height: 1536 },
  "21:9": { size: "1536x1024", width: 1536, height: 658 },
};

function getImagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/generations`;
}

function getImageEditsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/edits`;
}

function getChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/chat/completions`;
}

function getProviderConfig() {
  const apiKey = process.env.AI_IMAGE_API_KEY_OVERRIDE || process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.AI_IMAGE_MODEL || "gpt-image-2";

  return { apiKey, baseUrl, model };
}

const supportedImageModels = new Set([
  "gpt-image-2",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
]);

function buildPrompt(input: ImageGenerateInput) {
  const stylePrefix = input.style ? `风格：${input.style}\n` : "";
  return `${stylePrefix}${input.prompt.trim()}`;
}

function toAbsoluteUrl(url: string, baseUrl: string) {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;

  const normalized = baseUrl.replace(/\/+$/, "");
  if (url.startsWith("/")) {
    return normalized.endsWith("/v1") && url.startsWith("/v1/")
      ? `${normalized.slice(0, -3)}${url}`
      : `${normalized}${url}`;
  }
  return `${normalized}/${url.replace(/^\/+/, "")}`;
}

function extractChoiceImages(providerData: ImageGenerationResponse, baseUrl: string) {
  const content = providerData.choices?.[0]?.message?.content || "";
  const imageUrls: { src: string }[] = [];
  const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match = imagePattern.exec(content);
  while (match) {
    imageUrls.push({ src: toAbsoluteUrl(match[1], baseUrl) });
    match = imagePattern.exec(content);
  }
  return imageUrls;
}

function safeParseJson<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getProviderErrorMessage(data: ImageGenerationResponse | null, fallback: string) {
  if (!data?.error) return data?.message || fallback;
  return typeof data.error === "string" ? data.error : data.error.message || fallback;
}

function isUnsupportedImagesApiError(message: string) {
  return /images api is not supported|not supported for this platform|unsupported.*images/i.test(message);
}

async function callImageProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  const response = await fetch(getImagesEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data = safeParseJson<ImageGenerationResponse>(text) || {};

  if (!response.ok) {
    throw new Error(getProviderErrorMessage(data, text || `Image provider returned ${response.status}`));
  }

  return data;
}

async function callImageChatProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  const response = await fetch(getChatEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: body.model,
      messages: [{
        role: "user",
        content: [
          "请根据下面的提示生成图片，并在回复中返回图片 URL 或 markdown 图片链接。",
          String(body.prompt || ""),
          `目标尺寸：${body.size || "1024x1024"}。`,
        ].join("\n"),
      }],
    }),
  });

  const text = await response.text();
  const data = safeParseJson<ImageGenerationResponse>(text) || {};

  if (!response.ok) {
    throw new Error(getProviderErrorMessage(data, text || `Image chat provider returned ${response.status}`));
  }

  return data;
}

async function callImageEditProvider(
  body: FormData,
  apiKey: string,
  baseUrl: string,
): Promise<ImageGenerationResponse> {
  const response = await fetch(getImageEditsEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const text = await response.text();
  const data = safeParseJson<ImageGenerationResponse>(text) || {};

  if (!response.ok) {
    throw new Error(getProviderErrorMessage(data, text || `Image edit provider returned ${response.status}`));
  }

  return data;
}

function getImageFileName(mimeType: string) {
  if (mimeType.includes("svg")) return "source.svg";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "source.jpg";
  if (mimeType.includes("webp")) return "source.webp";
  return "source.png";
}

async function imageSrcToBuffer(src: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mimeType = match[1] || "image/png";
    const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    return { buffer, mimeType };
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }
  const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0];
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

function bufferToImageFile(buffer: Buffer, mimeType: string) {
  return new File([buffer], getImageFileName(mimeType), { type: mimeType });
}

async function getImageBufferDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  return {
    width: metadata.width || 1024,
    height: metadata.height || 1024,
  };
}

function getEditSizeForAspect(width: number, height: number) {
  const aspect = width / Math.max(1, height);
  if (aspect > 1.2) return "1536x1024";
  if (aspect < 0.85) return "1024x1536";
  return "1024x1024";
}

function coerceTargetDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

async function normalizeGeneratedImagesToTargetAspect(
  images: GeneratedImage[],
  targetWidth: number,
  targetHeight: number,
): Promise<GeneratedImage[]> {
  const sharp = (await import("sharp")).default;

  return Promise.all(images.map(async (image) => {
    const { buffer } = await imageSrcToBuffer(image.src);
    const png = await sharp(buffer, { limitInputPixels: false })
      .rotate()
      .resize(targetWidth, targetHeight, {
        fit: "cover",
        position: "centre",
      })
      .png()
      .toBuffer();

    return {
      src: `data:image/png;base64,${png.toString("base64")}`,
      width: targetWidth,
      height: targetHeight,
    };
  }));
}

function pixelDistance(data: Buffer, index: number, color: [number, number, number]) {
  const dr = data[index] - color[0];
  const dg = data[index + 1] - color[1];
  const db = data[index + 2] - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function detectDominantEdgeColor(data: Buffer, width: number, height: number): [number, number, number] {
  const histogram = new Map<string, { count: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 8) return;
    const key = `${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4}`;
    const item = histogram.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    item.count += 1;
    item.r += data[index];
    item.g += data[index + 1];
    item.b += data[index + 2];
    histogram.set(key, item);
  };

  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y);
    add(width - 1, y);
  }

  let dominant: { count: number; r: number; g: number; b: number } | undefined;
  for (const item of Array.from(histogram.values())) {
    if (!dominant || item.count > dominant.count) dominant = item;
  }
  if (!dominant || dominant.count === 0) return [255, 255, 255];
  return [
    Math.round(dominant.r / dominant.count),
    Math.round(dominant.g / dominant.count),
    Math.round(dominant.b / dominant.count),
  ];
}

function createConnectedEdgeBackgroundMask(data: Buffer, width: number, height: number, threshold = 42) {
  const backgroundColor = detectDominantEdgeColor(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    const index = pixel * 4;
    if (data[index + 3] < 8 || pixelDistance(data, index, backgroundColor) <= threshold) {
      visited[pixel] = 1;
      queue.push(pixel);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return visited;
}

function createConnectedMaskFromEdgeCandidates(candidates: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel] || !candidates[pixel]) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return visited;
}

function dilateBinaryMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const output = new Uint8Array(mask);
  const radiusSquared = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;

      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let nextY = minY; nextY <= maxY; nextY += 1) {
        for (let nextX = minX; nextX <= maxX; nextX += 1) {
          const dx = nextX - x;
          const dy = nextY - y;
          if (dx * dx + dy * dy <= radiusSquared) output[nextY * width + nextX] = 1;
        }
      }
    }
  }

  return output;
}

function erodeBinaryMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const output = new Uint8Array(mask);
  const radiusSquared = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      let keep = true;
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let nextY = minY; nextY <= maxY && keep; nextY += 1) {
        for (let nextX = minX; nextX <= maxX; nextX += 1) {
          const dx = nextX - x;
          const dy = nextY - y;
          if (dx * dx + dy * dy > radiusSquared) continue;
          if (!mask[nextY * width + nextX]) {
            keep = false;
            break;
          }
        }
      }
      if (!keep) output[pixel] = 0;
    }
  }

  return output;
}

function clearNearTransparentPixels(data: Buffer, alphaThreshold = 20) {
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] > alphaThreshold) continue;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
  }
}

async function returnOriginalImageAsTransparentPng(buffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;

  const png = await sharp(data, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function removeBackgroundByConservativeEdgeColor(buffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const output = Buffer.from(data);
  const backgroundMask = createConnectedEdgeBackgroundMask(output, width, height, 30);

  let transparentPixels = 0;
  for (let pixel = 0; pixel < backgroundMask.length; pixel += 1) {
    if (!backgroundMask[pixel]) continue;
    output[pixel * 4 + 3] = 0;
    transparentPixels += 1;
  }
  clearNearTransparentPixels(output);

  if (transparentPixels / (width * height) < 0.01) {
    throw new Error("Edge-color fallback did not find removable background");
  }

  const png = await sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function applyConservativeAlphaMaskToOriginalImage(originalBuffer: Buffer, maskPngBuffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data: originalData, info: originalInfo } = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: maskData } = await sharp(maskPngBuffer, { limitInputPixels: false })
    .rotate()
    .resize(originalInfo.width, originalInfo.height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = originalInfo.width;
  const height = originalInfo.height;
  const totalPixels = width * height;
  const output = Buffer.from(originalData);
  const backgroundCandidates = new Uint8Array(totalPixels);
  for (let index = 0; index < maskData.length; index += 4) {
    const pixel = index / 4;
    if (maskData[index + 3] <= 180) backgroundCandidates[pixel] = 1;
  }
  const connectedBackground = createConnectedMaskFromEdgeCandidates(backgroundCandidates, width, height);
  const hardBackground = erodeBinaryMask(connectedBackground, width, height, 1);
  const featherBackground = dilateBinaryMask(hardBackground, width, height, 1);
  let transparentPixels = 0;
  for (let index = 0; index < output.length; index += 4) {
    const pixel = index / 4;
    if (hardBackground[pixel]) {
      output[index + 3] = 0;
      transparentPixels += 1;
    } else if (featherBackground[pixel] && maskData[index + 3] < 240) {
      output[index + 3] = Math.min(originalData[index + 3], Math.max(64, maskData[index + 3]));
    } else {
      output[index + 3] = originalData[index + 3];
    }
  }
  clearNearTransparentPixels(output);

  if (transparentPixels / totalPixels < 0.03) {
    console.warn("Background removal produced little transparent area; using edge-color fallback");
    return removeBackgroundByConservativeEdgeColor(originalBuffer);
  }

  const png = await sharp(output, {
    raw: { width: originalInfo.width, height: originalInfo.height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width: originalInfo.width,
      height: originalInfo.height,
    }],
  };
}

async function normalizeTransparentPng(buffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const png = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width: info.width,
      height: info.height,
    }],
  };
}

async function applyRawAlphaMaskToOriginalImage(originalBuffer: Buffer, alphaMaskBuffer: Buffer): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data: originalData, info: originalInfo } = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = originalInfo.width * originalInfo.height;
  if (alphaMaskBuffer.length !== totalPixels) {
    throw new Error(`Unexpected alpha mask size: ${alphaMaskBuffer.length}`);
  }

  const width = originalInfo.width;
  const height = originalInfo.height;
  const output = Buffer.from(originalData);
  const backgroundCandidates = new Uint8Array(totalPixels);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (alphaMaskBuffer[pixel] <= 180) backgroundCandidates[pixel] = 1;
  }
  const connectedBackground = createConnectedMaskFromEdgeCandidates(backgroundCandidates, width, height);
  const hardBackground = erodeBinaryMask(connectedBackground, width, height, 1);
  const featherBackground = dilateBinaryMask(hardBackground, width, height, 1);

  let transparentPixels = 0;
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const index = pixel * 4;
    if (hardBackground[pixel]) {
      output[index + 3] = 0;
      transparentPixels += 1;
    } else if (featherBackground[pixel] && alphaMaskBuffer[pixel] < 240) {
      output[index + 3] = Math.min(originalData[index + 3], Math.max(64, alphaMaskBuffer[pixel]));
    } else {
      output[index + 3] = originalData[index + 3];
    }
  }
  clearNearTransparentPixels(output);

  if (transparentPixels / totalPixels < 0.03) {
    console.warn("Raw alpha mask did not remove enough background; using edge-color fallback");
    return removeBackgroundByConservativeEdgeColor(originalBuffer);
  }

  const png = await sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();

  return {
    images: [{
      src: `data:image/png;base64,${png.toString("base64")}`,
      width,
      height,
    }],
  };
}

async function removeBackgroundPreservingForegroundPixels(src: string): Promise<{ images: GeneratedImage[] }> {
  const { buffer } = await imageSrcToBuffer(src);

  try {
    const { removeBackground: removeBackgroundWithSegmentation, segmentForeground } = await import("@imgly/background-removal-node");
    try {
      const alphaBlob = await segmentForeground(buffer, {
        model: "medium",
        output: {
          format: "image/x-alpha8",
          quality: 1,
        },
      });
      const alpha = Buffer.from(await alphaBlob.arrayBuffer());
      return applyRawAlphaMaskToOriginalImage(buffer, alpha);
    } catch (alphaError) {
      console.warn("Raw alpha background removal failed, falling back to PNG segmentation", alphaError);
    }

    const blob = await removeBackgroundWithSegmentation(buffer, {
      model: "medium",
      output: {
        format: "image/png",
        quality: 1,
      },
    });
    const png = Buffer.from(await blob.arrayBuffer());
    return applyConservativeAlphaMaskToOriginalImage(buffer, png);
  } catch (error) {
    console.warn("Segmentation background removal failed, using edge-color fallback", error);
    try {
      return await removeBackgroundByConservativeEdgeColor(buffer);
    } catch (fallbackError) {
      console.warn("Edge-color background removal failed, preserving original image", fallbackError);
      return returnOriginalImageAsTransparentPng(buffer);
    }
  }
}

function escapeSvgAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function createEraseFallbackComposite(imageSrc: string, maskSrc: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <filter id="invert-alpha" x="0" y="0" width="1024" height="1024" color-interpolation-filters="sRGB">
          <feComponentTransfer>
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
        </filter>
        <mask id="erase-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <image href="${escapeSvgAttr(maskSrc)}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none" filter="url(#invert-alpha)" />
        </mask>
      </defs>
      <image href="${escapeSvgAttr(imageSrc)}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none" />
      <rect x="0" y="0" width="1024" height="1024" fill="#8B5CF6" opacity="0.82" mask="url(#erase-mask)" />
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function didEraseChangeMaskedArea(sourceBuffer: Buffer, resultSrc: string, maskSrc: string, width: number, height: number) {
  const sharp = (await import("sharp")).default;
  const { buffer: resultBuffer } = await imageSrcToBuffer(resultSrc);
  const { data: sourceData } = await sharp(sourceBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: resultData } = await sharp(resultBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { buffer: maskBuffer } = await imageSrcToBuffer(maskSrc);
  const { data: maskData } = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let maskedPixels = 0;
  let totalDelta = 0;
  for (let index = 0; index < maskData.length; index += 4) {
    if (maskData[index + 3] > 64) continue;
    maskedPixels += 1;
    totalDelta += Math.abs(sourceData[index] - resultData[index]);
    totalDelta += Math.abs(sourceData[index + 1] - resultData[index + 1]);
    totalDelta += Math.abs(sourceData[index + 2] - resultData[index + 2]);
    totalDelta += Math.abs(sourceData[index + 3] - resultData[index + 3]);
  }

  if (maskedPixels < Math.max(16, width * height * 0.0002)) return true;
  return totalDelta / maskedPixels >= 18;
}

async function imageSrcToFile(src: string): Promise<File> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return bufferToImageFile(buffer, mimeType);
}

async function pollAsyncImageTask(taskId: string, apiKey: string, baseUrl: string): Promise<ImageGenerationResponse> {
  const normalized = baseUrl.replace(/\/+$/, "");
  const endpoint = `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/async-images/${taskId}`;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as AsyncImageTaskResponse) : {};
    const normalizedTask = normalizeAsyncTaskResult(data);
    const status = normalizedTask.status;

    if (!response.ok) {
      throw new Error(normalizedTask.error || `Image polling returned ${response.status}`);
    }

    if (status === "failed") {
      throw new Error(normalizedTask.error || "Image generation failed");
    }

    if ((status === "succeeded" || status === "completed_without_image") && normalizedTask.result) {
      return normalizedTask.result;
    }

    if (status && status !== "queued" && status !== "processing") {
      throw new Error(`Unexpected image task status: ${status}`);
    }
  }

  throw new Error("Image generation timed out");
}

export async function generateImages(input: ImageGenerateInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.prompt?.trim()) {
    throw new Error("Missing prompt");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  const ratio = ratioToSize[input.ratio || "1:1"] || ratioToSize["1:1"];
  const count = Math.max(1, Math.min(Number(input.count) || 1, 4));
  const requestBody = {
    model: input.model && supportedImageModels.has(input.model) ? input.model : model,
    prompt: buildPrompt(input),
    n: count,
    size: ratio.size,
    response_format: "b64_json",
  };

  let providerData: ImageGenerationResponse;
  try {
    providerData = await callImageProvider(requestBody, apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isUnsupportedImagesApiError(message)) {
      providerData = await callImageChatProvider(requestBody, apiKey, baseUrl);
    } else if (message.toLowerCase().includes("response_format")) {
      const { response_format: _responseFormat, ...fallbackBody } = requestBody;
      providerData = await callImageProvider(fallbackBody, apiKey, baseUrl);
    } else {
      throw new Error(`图片生成接口暂不可用：${message}`);
    }
  }

  if (providerData.task_id) {
    providerData = await pollAsyncImageTask(providerData.task_id, apiKey, baseUrl);
  }

  const images = extractGeneratedImages(providerData, baseUrl, ratio.width, ratio.height);

  if (images.length === 0) {
    throw new Error("图片模型未返回可用图片，请切换 GPT Image 2 或 Nano Banana 图片模型后重试");
  }

  return { images };
}

export async function removeImageBackground(input: RemoveBackgroundInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return removeBackgroundPreservingForegroundPixels(input.imageSrc);
}

export async function editImageWithPrompt(input: EditImageInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }
  if (!input.prompt?.trim()) {
    throw new Error("Missing prompt");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  const sourceImageData = await imageSrcToBuffer(input.imageSrc);
  const sourceImageDimensions = await getImageBufferDimensions(sourceImageData.buffer);
  const targetWidth = coerceTargetDimension(input.targetWidth) || sourceImageDimensions.width;
  const targetHeight = coerceTargetDimension(input.targetHeight) || sourceImageDimensions.height;
  const sourceImage = bufferToImageFile(sourceImageData.buffer, sourceImageData.mimeType);
  const selectedModel = input.model && supportedImageModels.has(input.model) ? input.model : model;
  const editSize = getEditSizeForAspect(targetWidth, targetHeight);
  const aspectInstruction = `Keep the final image canvas aspect ratio exactly ${targetWidth}:${targetHeight}. Do not return a square image unless the source is square.`;

  const createBody = (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", sourceImage);
    body.append("prompt", `${input.prompt}\n\n${aspectInstruction}`);
    body.append("n", "1");
    body.append("size", editSize);
    if (withResponseFormat) body.append("response_format", "b64_json");
    return body;
  };

  let providerData: ImageGenerationResponse;
  try {
    providerData = await callImageEditProvider(createBody(true), apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("response_format")) throw error;
    providerData = await callImageEditProvider(createBody(false), apiKey, baseUrl);
  }

  if (providerData.task_id) {
    providerData = await pollAsyncImageTask(providerData.task_id, apiKey, baseUrl);
  }

  const images = await normalizeGeneratedImagesToTargetAspect(
    extractGeneratedImages(providerData, baseUrl, targetWidth, targetHeight),
    targetWidth,
    targetHeight,
  );

  if (images.length === 0) {
    throw new Error("Image edit provider returned no images");
  }

  return { images };
}

export async function eraseImageObjects(input: EraseImageInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }
  if (!input.maskSrc?.trim()) {
    throw new Error("Missing maskSrc");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  const sourceImageData = await imageSrcToBuffer(input.imageSrc);
  const sourceImageDimensions = await getImageBufferDimensions(sourceImageData.buffer);
  const targetWidth = coerceTargetDimension(input.targetWidth) || sourceImageDimensions.width;
  const targetHeight = coerceTargetDimension(input.targetHeight) || sourceImageDimensions.height;
  const sourceImage = bufferToImageFile(sourceImageData.buffer, sourceImageData.mimeType);
  const maskImage = await imageSrcToFile(input.maskSrc);
  const selectedModel = input.model && supportedImageModels.has(input.model) ? input.model : model;
  const prompt = input.prompt || "Remove only the objects or scene elements covered by the mask. Reconstruct the background naturally, preserve the rest of the image exactly, and leave no visible artifacts.";
  const editSize = getEditSizeForAspect(targetWidth, targetHeight);
  const fallbackErase = () => {
    const compositeSrc = createEraseFallbackComposite(input.imageSrc, input.maskSrc);
    return editImageWithPrompt({
      imageSrc: compositeSrc,
      model: selectedModel,
      targetWidth,
      targetHeight,
      prompt: [
        "The semi-transparent purple overlay marks the exact area to remove.",
        "Remove every visible object, shape, text, or scene element under the purple overlay.",
        "Fill that area with natural surrounding background so the marked content disappears seamlessly.",
        "Keep all unmarked regions unchanged. Do not keep the purple overlay. Leave no visible retouch artifacts.",
      ].join(" "),
    });
  };

  const createBody = (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", sourceImage);
    body.append("mask", maskImage);
    body.append("prompt", prompt);
    body.append("n", "1");
    body.append("size", editSize);
    if (withResponseFormat) body.append("response_format", "b64_json");
    return body;
  };

  let providerData: ImageGenerationResponse;
  try {
    try {
      providerData = await callImageEditProvider(createBody(true), apiKey, baseUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("response_format")) throw error;
      providerData = await callImageEditProvider(createBody(false), apiKey, baseUrl);
    }
  } catch (error) {
    return fallbackErase();
  }

  if (providerData.task_id) {
    providerData = await pollAsyncImageTask(providerData.task_id, apiKey, baseUrl);
  }

  const images = await normalizeGeneratedImagesToTargetAspect(
    extractGeneratedImages(providerData, baseUrl, targetWidth, targetHeight),
    targetWidth,
    targetHeight,
  );

  if (images.length === 0) {
    throw new Error("Image erase provider returned no images");
  }

  try {
    const changed = await didEraseChangeMaskedArea(sourceImageData.buffer, images[0].src, input.maskSrc, targetWidth, targetHeight);
    if (!changed) return fallbackErase();
  } catch (error) {
    console.warn("Erase result validation failed; keeping provider result", error);
  }

  return { images };
}
