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
};

type EraseImageInput = {
  imageSrc: string;
  maskSrc: string;
  model?: string;
  prompt?: string;
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
  error?: { message?: string };
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
  "16:9": { size: "1536x1024", width: 1536, height: 864 },
};

function getImagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/generations`;
}

function getImageEditsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/edits`;
}

function getProviderConfig() {
  const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.AI_IMAGE_MODEL || "gpt-image-2";

  return { apiKey, baseUrl, model };
}

const supportedImageModels = new Set(["gpt-image-2"]);

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
  const data = text ? (JSON.parse(text) as ImageGenerationResponse) : {};

  if (!response.ok) {
    throw new Error(data.error?.message || `Image provider returned ${response.status}`);
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
  const data = text ? (JSON.parse(text) as ImageGenerationResponse) : {};

  if (!response.ok) {
    throw new Error(data.error?.message || `Image edit provider returned ${response.status}`);
  }

  return data;
}

function getImageFileName(mimeType: string) {
  if (mimeType.includes("svg")) return "source.svg";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "source.jpg";
  if (mimeType.includes("webp")) return "source.webp";
  return "source.png";
}

async function saveDataUrlToFile(src: string, filePath: string) {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid data URL");
    const raw = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    await fs.writeFile(filePath, raw);
    return;
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
}

async function createEraseFallbackComposite(imageSrc: string, maskSrc: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "artx-erase-"));
  const sourcePath = path.join(tempDir, "source.png");
  const maskPath = path.join(tempDir, "mask.png");
  const compositePath = path.join(tempDir, "composite.png");

  try {
    await saveDataUrlToFile(imageSrc, sourcePath);
    await saveDataUrlToFile(maskSrc, maskPath);

    await execFileAsync("/Applications/Codex.app/Contents/Resources/ffmpeg", [
      "-y",
      "-i", sourcePath,
      "-i", maskPath,
      "-filter_complex",
      "[0:v]scale=1024:1024[base];color=c=#8B5CF6:s=1024x1024[clr];[1:v]scale=1024:1024,format=gray[mask];[clr][mask]alphamerge[ovr];[base][ovr]overlay=format=auto[out]",
      "-map", "[out]",
      "-frames:v", "1",
      compositePath,
    ]);

    const compositeBuffer = await fs.readFile(compositePath);
    return `data:image/png;base64,${compositeBuffer.toString("base64")}`;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function imageSrcToFile(src: string): Promise<File> {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mimeType = match[1] || "image/png";
    const raw = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
    return new File([raw], getImageFileName(mimeType), { type: mimeType });
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }
  const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0];
  const bytes = await response.arrayBuffer();
  return new File([bytes], getImageFileName(mimeType), { type: mimeType });
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
    if (!message.toLowerCase().includes("response_format")) throw error;
    const { response_format: _responseFormat, ...fallbackBody } = requestBody;
    providerData = await callImageProvider(fallbackBody, apiKey, baseUrl);
  }

  if (providerData.task_id) {
    providerData = await pollAsyncImageTask(providerData.task_id, apiKey, baseUrl);
  }

  const images = extractGeneratedImages(providerData, baseUrl, ratio.width, ratio.height);

  if (images.length === 0) {
    throw new Error("Image provider returned no images");
  }

  return { images };
}

export async function removeImageBackground(input: RemoveBackgroundInput): Promise<{ images: GeneratedImage[] }> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  const sourceImage = await imageSrcToFile(input.imageSrc);
  const selectedModel = input.model && supportedImageModels.has(input.model) ? input.model : model;
  const prompt = input.prompt || "Remove the background from this image. Keep the main subject intact and return a clean transparent PNG.";

  const createBody = (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", sourceImage);
    body.append("prompt", prompt);
    body.append("n", "1");
    body.append("size", "1024x1024");
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

  const images = extractGeneratedImages(providerData, baseUrl, 1024, 1024);

  if (images.length === 0) {
    throw new Error("Image edit provider returned no images");
  }

  return { images };
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

  const sourceImage = await imageSrcToFile(input.imageSrc);
  const selectedModel = input.model && supportedImageModels.has(input.model) ? input.model : model;

  const createBody = (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", sourceImage);
    body.append("prompt", input.prompt);
    body.append("n", "1");
    body.append("size", "1024x1024");
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

  const images = extractGeneratedImages(providerData, baseUrl, 1024, 1024);

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

  const sourceImage = await imageSrcToFile(input.imageSrc);
  const maskImage = await imageSrcToFile(input.maskSrc);
  const selectedModel = input.model && supportedImageModels.has(input.model) ? input.model : model;
  const prompt = input.prompt || "Remove only the objects or scene elements covered by the mask. Reconstruct the background naturally, preserve the rest of the image exactly, and leave no visible artifacts.";

  const createBody = (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", sourceImage);
    body.append("mask", maskImage);
    body.append("prompt", prompt);
    body.append("n", "1");
    body.append("size", "1024x1024");
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
    const compositeSrc = await createEraseFallbackComposite(input.imageSrc, input.maskSrc);
    return editImageWithPrompt({
      imageSrc: compositeSrc,
      model: selectedModel,
      prompt: [
        "The semi-transparent purple overlay marks the exact area to remove.",
        "Remove only the content under the purple overlay, reconstruct the background naturally, keep all unmarked regions unchanged, and leave no visible artifacts.",
      ].join(" "),
    });
  }

  if (providerData.task_id) {
    providerData = await pollAsyncImageTask(providerData.task_id, apiKey, baseUrl);
  }

  const images = extractGeneratedImages(providerData, baseUrl, 1024, 1024);

  if (images.length === 0) {
    throw new Error("Image erase provider returned no images");
  }

  return { images };
}
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
