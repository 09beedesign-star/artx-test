type ImageGenerateInput = {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
  images?: Array<{ src: string; title?: string }>;
};

type RemoveBackgroundInput = {
  imageSrc: string;
  model?: string;
  prompt?: string;
};

type EnhanceImageInput = {
  imageSrc: string;
  level?: "4k";
};

type RemoveWatermarkInput = {
  imageSrc: string;
};

type CreateBackgroundInput = {
  imageSrc: string;
  backgroundReferenceSrc?: string;
  backgroundReferenceName?: string;
  prompt?: string;
  style?: string;
  ratio?: string;
  resolution?: "2k" | "4k";
  count?: number;
  customWidth?: number;
  customHeight?: number;
};

type EditImageInput = {
  imageSrc: string;
  model?: string;
  prompt: string;
  targetWidth?: number;
  targetHeight?: number;
  images?: Array<{ src: string; title?: string }>;
};

type EraseImageInput = {
  imageSrc?: string;
  imageUrl?: string;
  image_url?: string;
  maskSrc?: string;
  maskUrl?: string;
  mask_url?: string;
  rectangles?: Array<{ x: number; y: number; width: number; height: number }> | string;
  sync?: 0 | 1 | boolean | string | number;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
  disableLocalFallback?: boolean;
  preserveUnmaskedPixels?: boolean;
};

type ExtractImageTextInput = {
  imageSrc: string;
  model?: string;
};

type GeneratedImage = {
  src: string;
  width: number;
  height: number;
};

type GeneratedImageResult = {
  images: GeneratedImage[];
  providerTaskId?: string;
  providerTaskIds?: string[];
};

function collectProviderTaskIds(...results: Array<Pick<GeneratedImageResult, "providerTaskId" | "providerTaskIds"> | undefined>) {
  const taskIds: string[] = [];
  for (const result of results) {
    if (!result) continue;
    if (result.providerTaskId) taskIds.push(result.providerTaskId);
    taskIds.push(...(result.providerTaskIds || []));
  }
  return Array.from(new Set(taskIds.filter(Boolean)));
}

function withProviderTaskIds(result: { images: GeneratedImage[] }, taskIds: string[]): GeneratedImageResult {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));
  return {
    ...result,
    providerTaskId: uniqueTaskIds[0],
    providerTaskIds: uniqueTaskIds.length > 0 ? uniqueTaskIds : undefined,
  };
}

type ImageGenerationResponse = {
  success?: boolean;
  task_id?: string;
  taskId?: string;
  status?: string;
  message?: string;
  b64_json?: string;
  url?: string;
  image?: string;
  image_url?: string | { url?: string };
  imageBase64?: string;
  imageUrl?: string;
  images?: Array<{ b64_json?: string; url?: string }>;
  data?: Array<{ b64_json?: string; url?: string }>;
  result?: ImageGenerationResponse;
  rawResult?: ImageGenerationResponse;
  output?: unknown;
  choices?: Array<{ message?: { content?: string | unknown[]; images?: Array<{ b64_json?: string; url?: string }> } }>;
  error?: { message?: string } | string;
};

type ImageTextResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
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
    images?: Array<{ b64_json?: string; url?: string }>;
    image?: string;
    image_url?: string | { url?: string };
    imageBase64?: string;
    imageUrl?: string;
    output?: unknown;
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

type PicWishSegmentationResponse = {
  status?: number;
  message?: string;
  data?: {
    task_id?: string;
    image?: string;
    image_obj?: string;
    mask?: string;
    mask_obj?: string;
    image_width?: number;
    image_height?: number;
    progress?: number;
    state?: number;
  };
};

type PicWishLogEvent = "request" | "created" | "poll" | "success" | "failure" | "download";

function logPicWishEvent(
  event: PicWishLogEvent,
  details: {
    taskType: PicWishVisualTaskType;
    endpoint?: string;
    taskId?: string;
    status?: number;
    state?: number;
    progress?: number;
    attempt?: number;
    durationMs?: number;
    width?: number;
    height?: number;
    error?: string;
    hasMask?: boolean;
  },
) {
  const log = {
    provider: "picwish",
    event,
    taskType: details.taskType,
    endpoint: details.endpoint,
    taskId: details.taskId,
    status: details.status,
    state: details.state,
    progress: details.progress,
    attempt: details.attempt,
    durationMs: details.durationMs,
    width: details.width,
    height: details.height,
    hasMask: details.hasMask,
    error: details.error,
  };
  if (event === "failure") {
    console.warn("[picwish]", JSON.stringify(log));
  } else {
    console.info("[picwish]", JSON.stringify(log));
  }
}

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
  const taskResult = task?.result || task?.rawResult
    ? {
        ...(task?.result || {}),
        rawResult: task?.rawResult,
        image: task?.imageBase64 || task?.image,
        imageBase64: task?.imageBase64,
        imageUrl: task?.imageUrl,
        image_url: task?.image_url,
        images: task?.images,
        output: task?.output,
      }
    : undefined;
  const directTaskResult = task && (task.images || task.image || task.image_url || task.imageBase64 || task.imageUrl || task.output)
    ? {
        images: task.images,
        image: task.imageBase64 || task.image,
        imageBase64: task.imageBase64,
        imageUrl: task.imageUrl,
        image_url: task.image_url,
        output: task.output,
      }
    : undefined;
  const directResult = data.result || data.rawResult;
  const topLevelResult = (data as unknown as ImageGenerationResponse).images || (data as unknown as ImageGenerationResponse).image || (data as unknown as ImageGenerationResponse).image_url || (data as unknown as ImageGenerationResponse).output
    ? data as unknown as ImageGenerationResponse
    : undefined;

  return {
    status: task?.status || data.status,
    error,
    result: taskResult || directTaskResult || directResult || topLevelResult,
  };
}

function resolveGeneratedImageSrc(src: string, baseUrl: string) {
  if (!src) return src;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  return toAbsoluteUrl(src, baseUrl);
}

function extractGeneratedImages(providerData: ImageGenerationResponse, baseUrl: string, width: number, height: number) {
  const choiceImageItems = providerData.choices?.flatMap(choice => choice.message?.images || []) || [];
  const directItems: Array<{ b64_json?: string; url?: string }> = [];
  if (providerData.b64_json) directItems.push({ b64_json: providerData.b64_json });
  if (providerData.url) directItems.push({ url: providerData.url });
  if (typeof providerData.image === "string") directItems.push({ url: providerData.image });
  if (typeof providerData.imageBase64 === "string") directItems.push({ b64_json: providerData.imageBase64 });
  if (typeof providerData.imageUrl === "string") directItems.push({ url: providerData.imageUrl });
  if (typeof providerData.image_url === "string") directItems.push({ url: providerData.image_url });
  if (providerData.image_url && typeof providerData.image_url === "object" && providerData.image_url.url) {
    directItems.push({ url: providerData.image_url.url });
  }
  const items = [
    ...directItems,
    ...(providerData.data || []),
    ...(providerData.images || []),
    ...choiceImageItems,
  ];
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

function getPicWishConfig() {
  return {
    apiKey: process.env.PICWISH_API_KEY || process.env.AOS_API_KEY || "",
    baseUrl: (process.env.PICWISH_BASE_URL || "https://techsz.aoscdn.com").replace(/\/+$/, ""),
  };
}

const supportedImageModels = new Set([
  "gpt-image-2",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
]);

const chatCompatibleImageModels = new Set<string>([
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
  const imageUrls: { src: string }[] = [];

  const addSrc = (src?: string) => {
    if (!src) return;
    const trimmed = src.trim();
    if (!trimmed) return;
    const isImage = trimmed.startsWith("data:image/") || /^https?:\/\//i.test(trimmed) || /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(trimmed);
    if (!isImage) return;
    const absolute = toAbsoluteUrl(trimmed, baseUrl);
    if (!imageUrls.some(item => item.src === absolute)) {
      imageUrls.push({ src: absolute });
    }
  };

  const walk = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;
      let match = imagePattern.exec(value);
      while (match) {
        addSrc(match[1]);
        match = imagePattern.exec(value);
      }

      const dataUrlPattern = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
      let dataUrlMatch = dataUrlPattern.exec(value);
      while (dataUrlMatch) {
        addSrc(dataUrlMatch[1]);
        dataUrlMatch = dataUrlPattern.exec(value);
      }

      const urlPattern = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp)(?:\?[^\s"'<>]*)?)/gi;
      let urlMatch = urlPattern.exec(value);
      while (urlMatch) {
        addSrc(urlMatch[1]);
        urlMatch = urlPattern.exec(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.b64_json === "string") addSrc(`data:image/png;base64,${record.b64_json}`);
    if (typeof record.url === "string") addSrc(record.url);
    if (typeof record.image_url === "string") addSrc(record.image_url);
    if (record.image_url && typeof record.image_url === "object") walk(record.image_url);
    if (typeof record.image === "string") addSrc(record.image);
    Object.values(record).forEach(walk);
  };

  walk(providerData.choices?.map(choice => choice.message?.content || "").flat());
  walk(providerData.output);
  walk(providerData.result);
  walk(providerData.rawResult);
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

class ImageProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ImageProviderRequestError";
  }
}

const imageProviderRetryDelayMs = 1800;

function getProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0] || "上游服务";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHtmlResponse(raw: string) {
  return /^\s*<!doctype html/i.test(raw) || /^\s*<html[\s>]/i.test(raw);
}

function isCloudflare524(raw: string, status?: number) {
  return status === 524 || /error code 524|524:\s*a timeout occurred|a timeout occurred/i.test(raw);
}

function normalizeProviderErrorText(message: string) {
  let current = message.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    const parsed = safeParseJson<{ error?: string | { message?: string; type?: string; code?: string }; message?: string }>(current);
    if (!parsed) break;
    const nested = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message || parsed.message || "";
    if (!nested || nested === current) break;
    current = nested.trim();
  }

  if (/openai_error|bad_response_status_code|bad response status/i.test(current)) {
    return "图片生成服务暂时没有返回可用结果，系统已自动使用当前可用生成链路处理，请稍后重试。";
  }
  return current;
}

function getProviderErrorMessage(
  data: ImageGenerationResponse | null,
  fallback: string,
  options?: { status?: number; baseUrl?: string; raw?: string },
) {
  const raw = options?.raw || fallback;
  const host = options?.baseUrl ? getProviderHost(options.baseUrl) : "上游服务";
  if (isCloudflare524(raw, options?.status)) {
    return `图片模型服务超时，请稍后重试。当前上游 ${host} 返回 524。`;
  }
  if (isHtmlResponse(raw)) {
    return `图片模型服务返回了非 JSON 页面（HTTP ${options?.status || "unknown"}），请稍后重试。`;
  }
  const message = !data?.error
    ? data?.message || fallback
    : typeof data.error === "string"
      ? data.error
      : data.error.message || fallback;
  return normalizeProviderErrorText(message);
}

function isRetryableProviderError(status: number | undefined, raw: string) {
  return isCloudflare524(raw, status) || status === 408 || status === 429 || Boolean(status && status >= 500);
}

async function readImageProviderResponse(
  response: Response,
  baseUrl: string,
  context: string,
): Promise<ImageGenerationResponse> {
  const text = await response.text();
  const data = safeParseJson<ImageGenerationResponse>(text) || {};

  if (!response.ok) {
    throw new ImageProviderRequestError(
      getProviderErrorMessage(data, text || `${context} returned ${response.status}`, {
        status: response.status,
        baseUrl,
        raw: text,
      }),
      response.status,
      isRetryableProviderError(response.status, text),
    );
  }

  return data;
}

async function withImageProviderRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    const shouldRetry = error instanceof ImageProviderRequestError
      ? error.retryable
      : error instanceof TypeError;
    if (!shouldRetry) throw error;
    await delay(imageProviderRetryDelayMs);
    return operation();
  }
}

function isUnsupportedImagesApiError(message: string) {
  return /images api is not supported|not supported for this platform|unsupported.*images/i.test(message);
}

function isChatCompatibleImageModel(model?: string) {
  return Boolean(model && chatCompatibleImageModels.has(model));
}

function shouldUseReferenceImageChatPath(model?: string, images?: Array<{ src?: string }>) {
  return isChatCompatibleImageModel(model) || Boolean(images?.length);
}

function isMissingReferenceImagesError(message: string) {
  return /no reference images found|reference images?.*not found|missing reference images/i.test(message);
}

function stripReferenceContextFromPrompt(prompt: string) {
  return prompt
    .split("\n")
    .filter((line) => !/参考当前画布|引用素材|上下文：当前画布|reference image/i.test(line))
    .join("\n")
    .replace(/用户请求：/g, "")
    .trim() || prompt.trim();
}

function getImageProviderJsonHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "Hermes-Agent/0.16.0",
  };
}

function getImageProviderHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "Hermes-Agent/0.16.0",
  };
}

async function callImageProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  return withImageProviderRetry(async () => {
    const response = await fetch(getImagesEndpoint(baseUrl), {
      method: "POST",
      headers: getImageProviderJsonHeaders(apiKey),
      body: JSON.stringify(body),
    });

    return readImageProviderResponse(response, baseUrl, "Image provider");
  });
}

async function callImageChatProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  const referenceImages = Array.isArray(body.images)
    ? (body.images as Array<{ src?: string; title?: string }>).filter(image => typeof image.src === "string" && image.src.trim())
    : [];
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{
    type: "text",
    text: [
      "请根据下面的提示生成图片，并在回复中返回图片 URL、markdown 图片链接或 base64 图片。",
      "如果提供了引用图，必须严格理解每张引用图的用途：例如提取某张图里的物件、把另一张图作为主体/背景/姿态参考。",
      "不要凭空生成无关人物、场景或道具；输出必须和用户指定的引用关系一致。",
      String(body.prompt || ""),
      `目标尺寸：${body.size || "1024x1024"}。`,
      referenceImages.length
        ? [
            "引用图说明：",
            ...referenceImages.map((image, index) => `引用图 ${index + 1}：${image.title || "未命名图片"}`),
          ].join("\n")
        : "",
    ].filter(Boolean).join("\n"),
  }];
  referenceImages.slice(0, 8).forEach(image => {
    content.push({ type: "image_url", image_url: { url: image.src! } });
  });

  return withImageProviderRetry(async () => {
    const response = await fetch(getChatEndpoint(baseUrl), {
      method: "POST",
      headers: getImageProviderJsonHeaders(apiKey),
      body: JSON.stringify({
        model: body.model,
        messages: [{ role: "user", content }],
      }),
    });

    return readImageProviderResponse(response, baseUrl, "Image chat provider");
  });
}

async function callImageEditProvider(
  body: FormData,
  apiKey: string,
  baseUrl: string,
): Promise<ImageGenerationResponse> {
  return withImageProviderRetry(async () => {
    const response = await fetch(getImageEditsEndpoint(baseUrl), {
      method: "POST",
      headers: getImageProviderHeaders(apiKey),
      body,
    });

    return readImageProviderResponse(response, baseUrl, "Image edit provider");
  });
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

type PicWishVisualTaskType = "segmentation" | "scale" | "self-face-cutout" | "watermark" | "inpaint" | "r-background";

function getPicWishTaskEndpoint(baseUrl: string, taskType: PicWishVisualTaskType) {
  return `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/${taskType}`;
}

function getPicWishResultImageUrl(data: PicWishSegmentationResponse, taskType?: PicWishVisualTaskType) {
  if (taskType === "segmentation") {
    return data.data?.image_obj || data.data?.image || "";
  }
  return data.data?.image || data.data?.image_obj || "";
}

function getPicWishTaskId(data: PicWishSegmentationResponse) {
  return data.data?.task_id || "";
}

function getPicWishErrorMessage(data: PicWishSegmentationResponse | null, fallback: string) {
  return data?.message || fallback || "PicWish background removal failed";
}

async function readPicWishJson(response: Response, context: string): Promise<PicWishSegmentationResponse> {
  const text = await response.text();
  const data = safeParseJson<PicWishSegmentationResponse>(text);
  if (!response.ok || !data) {
    throw new Error(getPicWishErrorMessage(data, `${context} returned ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`));
  }
  if (typeof data.status === "number" && data.status !== 200) {
    throw new Error(getPicWishErrorMessage(data, `${context} returned status ${data.status}`));
  }
  return data;
}

async function downloadUrlToBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PicWish result: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadPicWishImageAsTransparentPng(url: string, fallbackSize?: { width?: number; height?: number }): Promise<{ images: GeneratedImage[] }> {
  const buffer = await downloadUrlToBuffer(url);
  const normalized = await normalizeTransparentPng(buffer);
  const image = normalized.images[0];
  if (!image) return normalized;
  return {
    images: [{
      ...image,
      width: fallbackSize?.width || image.width,
      height: fallbackSize?.height || image.height,
    }],
  };
}

async function pollPicWishTask(taskType: PicWishVisualTaskType, taskId: string, apiKey: string, baseUrl: string): Promise<PicWishSegmentationResponse> {
  const endpoint = `${getPicWishTaskEndpoint(baseUrl, taskType)}/${encodeURIComponent(taskId)}`;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(1000);
    let data: PicWishSegmentationResponse;
    try {
      data = await readPicWishJson(await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
        },
      }), `PicWish ${taskType} polling`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPicWishEvent("failure", { taskType, endpoint, taskId, attempt: attempt + 1, durationMs: Date.now() - startedAt, error: message });
      throw error;
    }
    logPicWishEvent("poll", {
      taskType,
      endpoint,
      taskId,
      status: data.status,
      state: data.data?.state,
      progress: data.data?.progress,
      attempt: attempt + 1,
      durationMs: Date.now() - startedAt,
    });
    if (getPicWishResultImageUrl(data, taskType)) {
      logPicWishEvent("success", {
        taskType,
        endpoint,
        taskId,
        status: data.status,
        state: data.data?.state,
        progress: data.data?.progress,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      return data;
    }
    if (data.data?.state && data.data.state < 0) {
      const message = getPicWishErrorMessage(data, `PicWish ${taskType} task failed`);
      logPicWishEvent("failure", { taskType, endpoint, taskId, status: data.status, state: data.data.state, progress: data.data.progress, durationMs: Date.now() - startedAt, error: message });
      throw new Error(message);
    }
  }
  logPicWishEvent("failure", { taskType, endpoint, taskId, durationMs: Date.now() - startedAt, error: `PicWish ${taskType} timed out` });
  throw new Error(`PicWish ${taskType} timed out`);
}

async function runPicWishImageTask(
  taskType: PicWishVisualTaskType,
  buffer: Buffer,
  mimeType: string,
  options?: { maskBuffer?: Buffer; maskMimeType?: string; fields?: Record<string, string | number | boolean | undefined> },
): Promise<GeneratedImageResult> {
  const { apiKey, baseUrl } = getPicWishConfig();
  if (!apiKey) {
    throw new Error("Missing PICWISH_API_KEY");
  }

  const body = new FormData();
  body.append("sync", "0");
  body.append("image_file", bufferToImageFile(buffer, mimeType));
  if (taskType === "segmentation") {
    // PicWish segmentation supports object-oriented output fields. Requesting
    // them helps keep the whole foreground group, not only a detected person.
    body.append("output_type", "1");
  }
  if (options?.maskBuffer) {
    body.append("mask_file", bufferToImageFile(options.maskBuffer, options.maskMimeType || "image/png"));
  }
  Object.entries(options?.fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.append(key, String(value));
  });

  const endpoint = getPicWishTaskEndpoint(baseUrl, taskType);
  const startedAt = Date.now();
  logPicWishEvent("request", { taskType, endpoint, hasMask: Boolean(options?.maskBuffer) });

  let created: PicWishSegmentationResponse;
  try {
    created = await readPicWishJson(await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
      },
      body,
    }), `PicWish ${taskType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPicWishEvent("failure", { taskType, endpoint, durationMs: Date.now() - startedAt, error: message, hasMask: Boolean(options?.maskBuffer) });
    throw error;
  }

  const immediateResult = getPicWishResultImageUrl(created, taskType);
  const taskId = getPicWishTaskId(created);
  logPicWishEvent("created", {
    taskType,
    endpoint,
    taskId,
    status: created.status,
    state: created.data?.state,
    progress: created.data?.progress,
    durationMs: Date.now() - startedAt,
    hasMask: Boolean(options?.maskBuffer),
  });
  const result = immediateResult
    ? created
    : taskId
      ? await pollPicWishTask(taskType, taskId, apiKey, baseUrl)
      : null;
  if (!result) {
    logPicWishEvent("failure", { taskType, endpoint, durationMs: Date.now() - startedAt, error: "PicWish did not return a task id", hasMask: Boolean(options?.maskBuffer) });
    throw new Error("PicWish did not return a task id");
  }
  const imageUrl = getPicWishResultImageUrl(result, taskType);
  if (!imageUrl) {
    logPicWishEvent("failure", { taskType, endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish did not return a result image", hasMask: Boolean(options?.maskBuffer) });
    throw new Error("PicWish did not return a result image");
  }
  logPicWishEvent("download", {
    taskType,
    endpoint: imageUrl,
    taskId: getPicWishTaskId(result) || taskId,
    durationMs: Date.now() - startedAt,
    width: result.data?.image_width,
    height: result.data?.image_height,
  });
  const resolvedTaskId = getPicWishTaskId(result) || taskId;
  const downloaded = await downloadPicWishImageAsTransparentPng(imageUrl, {
    width: result.data?.image_width,
    height: result.data?.image_height,
  });
  return withProviderTaskIds(downloaded, resolvedTaskId ? [resolvedTaskId] : []);
}

async function removeBackgroundWithPicWish(buffer: Buffer, mimeType: string): Promise<GeneratedImageResult> {
  return runPicWishImageTask("segmentation", buffer, mimeType);
}

async function removeFaceWithPicWish(buffer: Buffer, mimeType: string): Promise<GeneratedImageResult> {
  return runPicWishImageTask("self-face-cutout", buffer, mimeType);
}

async function createPicWishInpaintTask(
  input: {
    imageBuffer?: Buffer;
    imageMimeType?: string;
    imageUrl?: string;
    maskBuffer?: Buffer;
    maskMimeType?: string;
    maskUrl?: string;
    rectangles?: Array<{ x: number; y: number; width: number; height: number }> | string;
    sync?: boolean;
  },
): Promise<{ taskId: string; apiKey: string; baseUrl: string; created: PicWishSegmentationResponse; imageUrl?: string }> {
  const { apiKey, baseUrl } = getPicWishConfig();
  if (!apiKey) {
    throw new Error("Missing PICWISH_API_KEY");
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/inpaint`;
  const body = new FormData();
  body.append("sync", input.sync ? "1" : "0");
  if (input.imageUrl) {
    body.append("image_url", input.imageUrl);
  } else if (input.imageBuffer) {
    body.append("image_file", bufferToImageFile(input.imageBuffer, input.imageMimeType || "image/png"));
  } else {
    throw new Error("Missing image source for PicWish inpaint");
  }
  if (input.maskUrl) {
    body.append("mask_url", input.maskUrl);
  } else if (input.maskBuffer) {
    body.append("mask_file", bufferToImageFile(input.maskBuffer, input.maskMimeType || "image/png"));
  } else if (input.rectangles) {
    body.append("rectangles", typeof input.rectangles === "string" ? input.rectangles : JSON.stringify(input.rectangles));
  } else {
    throw new Error("Missing removal area for PicWish inpaint");
  }

  const startedAt = Date.now();
  logPicWishEvent("request", { taskType: "inpaint", endpoint, hasMask: Boolean(input.maskBuffer || input.maskUrl) });
  let created: PicWishSegmentationResponse;
  try {
    created = await readPicWishJson(await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
      },
      body,
    }), "PicWish inpaint");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPicWishEvent("failure", { taskType: "inpaint", endpoint, durationMs: Date.now() - startedAt, error: message, hasMask: Boolean(input.maskBuffer || input.maskUrl) });
    throw error;
  }

  const taskId = getPicWishTaskId(created);
  const imageUrl = getPicWishResultImageUrl(created, "inpaint");
  logPicWishEvent("created", {
    taskType: "inpaint",
    endpoint,
    taskId,
    status: created.status,
    state: created.data?.state,
    progress: created.data?.progress,
    durationMs: Date.now() - startedAt,
    hasMask: Boolean(input.maskBuffer || input.maskUrl),
  });
  if (!taskId) {
    logPicWishEvent("failure", {
      taskType: "inpaint",
      endpoint,
      status: created.status,
      durationMs: Date.now() - startedAt,
      error: imageUrl
        ? "PicWish inpaint returned an image but no task id"
        : "PicWish inpaint did not return a task id",
      hasMask: Boolean(input.maskBuffer || input.maskUrl),
    });
    throw new Error("PicWish inpaint did not return a task id");
  }
  return { taskId, apiKey, baseUrl, created, imageUrl };
}

async function pollPicWishInpaintTask(taskId: string, apiKey: string, baseUrl: string): Promise<{ images: GeneratedImage[] }> {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/tasks/visual/inpaint/${encodeURIComponent(taskId)}`;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (attempt > 0) await delay(1000);
    let data: PicWishSegmentationResponse;
    try {
      data = await readPicWishJson(await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-API-KEY": apiKey,
        },
      }), "PicWish inpaint polling");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, attempt: attempt + 1, durationMs: Date.now() - startedAt, error: message });
      throw error;
    }
    const state = Number(data.data?.state || 0);
    logPicWishEvent("poll", {
      taskType: "inpaint",
      endpoint,
      taskId,
      status: data.status,
      state,
      progress: data.data?.progress,
      attempt: attempt + 1,
      durationMs: Date.now() - startedAt,
    });
    if (state > 0) {
      const imageUrl = data.data?.image || "";
      if (state !== 1 && !imageUrl) continue;
      if (!imageUrl) {
        logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, status: data.status, state, progress: data.data?.progress, durationMs: Date.now() - startedAt, error: "PicWish inpaint did not return a result image" });
        throw new Error("PicWish inpaint did not return a result image");
      }
      logPicWishEvent("success", {
        taskType: "inpaint",
        endpoint,
        taskId,
        status: data.status,
        state,
        progress: data.data?.progress,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      logPicWishEvent("download", {
        taskType: "inpaint",
        endpoint: imageUrl,
        taskId,
        durationMs: Date.now() - startedAt,
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
      return downloadPicWishImageAsTransparentPng(imageUrl, {
        width: data.data?.image_width,
        height: data.data?.image_height,
      });
    }
    if (state < 0) {
      const message = getPicWishErrorMessage(data, "PicWish inpaint task failed");
      logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, status: data.status, state, progress: data.data?.progress, durationMs: Date.now() - startedAt, error: message });
      throw new Error(message);
    }
  }
  logPicWishEvent("failure", { taskType: "inpaint", endpoint, taskId, durationMs: Date.now() - startedAt, error: "PicWish inpaint timed out" });
  throw new Error("PicWish inpaint timed out");
}

async function eraseWithPicWish(
  input: {
    imageBuffer?: Buffer;
    imageMimeType?: string;
    imageUrl?: string;
    maskBuffer?: Buffer;
    maskMimeType?: string;
    maskUrl?: string;
    rectangles?: Array<{ x: number; y: number; width: number; height: number }> | string;
    sync?: boolean;
  },
): Promise<GeneratedImageResult> {
  const { taskId, apiKey, baseUrl, created, imageUrl } = await createPicWishInpaintTask(input);
  if (imageUrl) {
    const result = await downloadPicWishImageAsTransparentPng(imageUrl, {
      width: created.data?.image_width,
      height: created.data?.image_height,
    });
    return withProviderTaskIds(result, [taskId]);
  }
  const result = await pollPicWishInpaintTask(taskId, apiKey, baseUrl);
  return withProviderTaskIds(result, [taskId]);
}

async function createPicWishEraseMask(maskBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(maskBuffer, { limitInputPixels: false })
    .rotate()
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const erasePixels = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 4) {
    // The canvas eraser stores painted strokes as transparent pixels.
    if (data[index + 3] < 250) erasePixels[index / 4] = 1;
  }

  const expandedErasePixels = new Uint8Array(erasePixels);
  const expansionRadius = Math.max(2, Math.min(10, Math.round(Math.max(width, height) * 0.006)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!erasePixels[pixel]) continue;
      for (let dy = -expansionRadius; dy <= expansionRadius; dy += 1) {
        for (let dx = -expansionRadius; dx <= expansionRadius; dx += 1) {
          if ((dx * dx) + (dy * dy) > expansionRadius * expansionRadius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          expandedErasePixels[ny * width + nx] = 1;
        }
      }
    }
  }

  const providerMask = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < expandedErasePixels.length; pixel += 1) {
    const index = pixel * 4;
    const shouldErase = expandedErasePixels[pixel] === 1;
    // PicWish inpaint follows the documented mask contract:
    // white = remove area, black = preserve area.
    providerMask[index] = shouldErase ? 255 : 0;
    providerMask[index + 1] = shouldErase ? 255 : 0;
    providerMask[index + 2] = shouldErase ? 255 : 0;
    providerMask[index + 3] = 255;
  }

  const providerMaskBuffer = await sharp(providerMask, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  }).png().toBuffer();
  return providerMaskBuffer;
}

async function enhanceImageWithPicWish(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return runPicWishImageTask("scale", buffer, mimeType);
}

async function removeWatermarkWithPicWish(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return runPicWishImageTask("watermark", buffer, mimeType);
}

function getBackgroundOutputSize(input: CreateBackgroundInput, fallbackWidth: number, fallbackHeight: number) {
  const customWidth = coerceTargetDimension(input.customWidth);
  const customHeight = coerceTargetDimension(input.customHeight);
  if (customWidth && customHeight) return { width: customWidth, height: customHeight };

  const baseLongSide = input.resolution === "4k" ? 3840 : 2048;
  const ratio = ratioToSize[input.ratio || "1:1"];
  if (ratio) {
    const aspect = ratio.width / Math.max(1, ratio.height);
    if (aspect >= 1) {
      return { width: baseLongSide, height: Math.max(1, Math.round(baseLongSide / aspect)) };
    }
    return { width: Math.max(1, Math.round(baseLongSide * aspect)), height: baseLongSide };
  }

  const aspect = fallbackWidth / Math.max(1, fallbackHeight);
  if (aspect >= 1) {
    return { width: baseLongSide, height: Math.max(1, Math.round(baseLongSide / aspect)) };
  }
  return { width: Math.max(1, Math.round(baseLongSide * aspect)), height: baseLongSide };
}

async function createBackgroundWithPicWish(input: CreateBackgroundInput): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(input.imageSrc);
  const sourceDimensions = await getImageBufferDimensions(buffer);
  const output = getBackgroundOutputSize(input, sourceDimensions.width, sourceDimensions.height);
  const prompt = [
    input.style ? `商业背景风格：${input.style}` : "",
    input.prompt || "为产品图生成干净、真实、商业化的背景，保持产品主体完整清晰。",
    "Keep the original product intact. Generate a new commercial background that matches lighting, perspective, shadows, and product scale.",
  ].filter(Boolean).join("\n");

  return runPicWishImageTask("r-background", buffer, mimeType, {
    fields: {
      prompt,
      scene_type: 105,
      width: output.width,
      height: output.height,
    },
  });
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

function createForegroundProtectionMaskFromAlpha(alphaAt: (pixel: number) => number, width: number, height: number) {
  const totalPixels = width * height;
  const foreground = new Uint8Array(totalPixels);
  const likelyForegroundThreshold = 72;

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (alphaAt(pixel) >= likelyForegroundThreshold) foreground[pixel] = 1;
  }

  const closeRadius = Math.max(2, Math.min(6, Math.round(Math.max(width, height) / 280)));
  const closed = erodeBinaryMask(dilateBinaryMask(foreground, width, height, closeRadius), width, height, Math.max(1, closeRadius - 1));
  const inverse = new Uint8Array(totalPixels);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    inverse[pixel] = closed[pixel] ? 0 : 1;
  }

  const edgeBackground = createConnectedMaskFromEdgeCandidates(inverse, width, height);
  const protectedForeground = new Uint8Array(totalPixels);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    protectedForeground[pixel] = edgeBackground[pixel] ? 0 : 1;
  }

  return dilateBinaryMask(protectedForeground, width, height, 1);
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
  const backgroundMask = createConnectedEdgeBackgroundMask(output, width, height, 58);

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
    if (maskData[index + 3] <= 112) backgroundCandidates[pixel] = 1;
  }
  const foregroundProtection = createForegroundProtectionMaskFromAlpha(
    (pixel) => maskData[pixel * 4 + 3],
    width,
    height,
  );
  const edgeBackground = createConnectedEdgeBackgroundMask(originalData, width, height, 58);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (!foregroundProtection[pixel] && edgeBackground[pixel]) backgroundCandidates[pixel] = 1;
    if (foregroundProtection[pixel]) backgroundCandidates[pixel] = 0;
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
    } else if (!foregroundProtection[pixel] && featherBackground[pixel] && maskData[index + 3] < 240) {
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

async function combineForegroundAlphaFromCutouts(originalBuffer: Buffer, cutoutBuffers: Buffer[]): Promise<{ images: GeneratedImage[] }> {
  const sharp = (await import("sharp")).default;
  const { data: originalData, info: originalInfo } = await sharp(originalBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = originalInfo.width;
  const height = originalInfo.height;
  const output = Buffer.from(originalData);
  const totalPixels = width * height;
  const combinedAlpha = new Uint8Array(totalPixels);

  for (const cutoutBuffer of cutoutBuffers) {
    const { data: cutoutData } = await sharp(cutoutBuffer, { limitInputPixels: false })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let pixel = 0; pixel < totalPixels; pixel += 1) {
      const alpha = cutoutData[pixel * 4 + 3];
      if (alpha > combinedAlpha[pixel]) combinedAlpha[pixel] = alpha;
    }
  }

  const foregroundProtection = createForegroundProtectionMaskFromAlpha(
    (pixel) => combinedAlpha[pixel],
    width,
    height,
  );
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const index = pixel * 4;
    const alpha = Math.max(combinedAlpha[pixel], foregroundProtection[pixel] ? Math.min(255, combinedAlpha[pixel] + 18) : 0);
    output[index + 3] = alpha < 12 ? 0 : alpha;
  }
  clearNearTransparentPixels(output, 12);

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

async function removeBackgroundWithQualityCutout(buffer: Buffer, mimeType: string): Promise<GeneratedImageResult> {
  const cutoutBuffers: Buffer[] = [];
  const segmentation = await removeBackgroundWithPicWish(buffer, mimeType);
  const providerTaskIds = collectProviderTaskIds(segmentation);
  const segmentationSrc = segmentation.images[0]?.src;
  if (segmentationSrc) {
    cutoutBuffers.push((await imageSrcToBuffer(segmentationSrc)).buffer);
  }

  try {
    const faceCutout = await removeFaceWithPicWish(buffer, mimeType);
    providerTaskIds.push(...collectProviderTaskIds(faceCutout));
    const faceSrc = faceCutout.images[0]?.src;
    if (faceSrc) cutoutBuffers.push((await imageSrcToBuffer(faceSrc)).buffer);
  } catch (faceError) {
    console.warn("PicWish face cutout enhancement failed; using segmentation cutout only", faceError);
  }

  if (cutoutBuffers.length === 0) return segmentation;
  const combined = await combineForegroundAlphaFromCutouts(buffer, cutoutBuffers);
  return withProviderTaskIds(combined, providerTaskIds);
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
    if (alphaMaskBuffer[pixel] <= 112) backgroundCandidates[pixel] = 1;
  }
  const foregroundProtection = createForegroundProtectionMaskFromAlpha(
    (pixel) => alphaMaskBuffer[pixel],
    width,
    height,
  );
  const edgeBackground = createConnectedEdgeBackgroundMask(originalData, width, height, 58);
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    if (!foregroundProtection[pixel] && edgeBackground[pixel]) backgroundCandidates[pixel] = 1;
    if (foregroundProtection[pixel]) backgroundCandidates[pixel] = 0;
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
    } else if (!foregroundProtection[pixel] && featherBackground[pixel] && alphaMaskBuffer[pixel] < 240) {
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

async function removeBackgroundPreservingForegroundPixels(src: string): Promise<GeneratedImageResult> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);

  try {
    return await removeBackgroundWithQualityCutout(buffer, mimeType);
  } catch (picWishError) {
    console.warn("PicWish quality background removal failed, using local segmentation fallback", picWishError);
  }

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

async function imageSrcToFile(src: string): Promise<File> {
  const { buffer, mimeType } = await imageSrcToBuffer(src);
  return bufferToImageFile(buffer, mimeType);
}

async function pollAsyncImageTask(taskId: string, apiKey: string, baseUrl: string): Promise<ImageGenerationResponse> {
  const normalized = baseUrl.replace(/\/+$/, "");
  const apiRoot = `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}`;
  const endpoints = [
    `${apiRoot}/async-images/${encodeURIComponent(taskId)}`,
    `${apiRoot}/images/generations/${encodeURIComponent(taskId)}`,
    `${apiRoot}/async/images/generations/${encodeURIComponent(taskId)}`,
  ];

  for (let attempt = 0; attempt < 150; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let lastError = "";
    let sawActiveTask = false;
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: getImageProviderJsonHeaders(apiKey),
      });

      const text = await response.text();
      const data = safeParseJson<AsyncImageTaskResponse>(text) || {};
      const normalizedTask = normalizeAsyncTaskResult(data);
      const status = (normalizedTask.status || "").toLowerCase();

      if (!response.ok) {
        lastError = normalizedTask.error || `Image polling returned ${response.status}`;
        if (response.status === 404) continue;
        throw new Error(lastError);
      }

      if (status === "failed" || status === "error") {
        throw new Error(normalizedTask.error || "Image generation failed");
      }

      if (normalizedTask.result) {
        const resultImages = extractGeneratedImages(normalizedTask.result, baseUrl, 1, 1);
        if (resultImages.length > 0 || status === "succeeded" || status === "completed" || status === "success") {
          return normalizedTask.result;
        }
      }

      if (status && status !== "queued" && status !== "processing" && status !== "pending" && status !== "running") {
        throw new Error(`Unexpected image task status: ${status}`);
      }

      if (status === "queued" || status === "processing" || status === "pending" || status === "running") {
        sawActiveTask = true;
        break;
      }
    }

    if (sawActiveTask) continue;

    if (lastError && attempt === 0 && !/404/.test(lastError)) {
      throw new Error(lastError);
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
  const referenceImages = input.images?.filter(image => image.src?.trim()) || [];
  const requestedModel = input.model && supportedImageModels.has(input.model) ? input.model : model;
  const routedModel = shouldUseReferenceImageChatPath(requestedModel, referenceImages)
    ? (isChatCompatibleImageModel(requestedModel) ? requestedModel : "gpt-image-2")
    : requestedModel;
  const requestBody = {
    model: routedModel,
    prompt: buildPrompt(input),
    n: count,
    size: ratio.size,
    response_format: "b64_json",
    images: referenceImages,
  };

  let providerData: ImageGenerationResponse;
  try {
    providerData = shouldUseReferenceImageChatPath(requestBody.model, referenceImages)
      ? await callImageChatProvider(requestBody, apiKey, baseUrl)
      : await callImageProvider(requestBody, apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isUnsupportedImagesApiError(message)) {
      providerData = await callImageChatProvider(requestBody, apiKey, baseUrl);
    } else if (isMissingReferenceImagesError(message) && !shouldUseReferenceImageChatPath(requestBody.model, referenceImages)) {
      providerData = await callImageProvider({
        ...requestBody,
        prompt: stripReferenceContextFromPrompt(String(requestBody.prompt || "")),
      }, apiKey, baseUrl);
    } else if (message.toLowerCase().includes("response_format") && !shouldUseReferenceImageChatPath(requestBody.model, referenceImages)) {
      const { response_format: _responseFormat, ...fallbackBody } = requestBody;
      providerData = await callImageProvider(fallbackBody, apiKey, baseUrl);
    } else {
      throw new Error(`图片生成接口暂不可用：${message}`);
    }
  }

  let asyncTaskId = providerData.task_id || providerData.taskId;
  if (asyncTaskId) {
    try {
      providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/timed out/i.test(message) || shouldUseReferenceImageChatPath(requestBody.model, referenceImages)) {
        throw error;
      }
      providerData = await callImageProvider(requestBody, apiKey, baseUrl);
      asyncTaskId = providerData.task_id || providerData.taskId;
      if (asyncTaskId) {
        providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
      }
    }
  }

  const images = extractGeneratedImages(providerData, baseUrl, ratio.width, ratio.height);

  if (images.length === 0) {
    throw new Error("图片模型未返回可用图片，系统已自动使用当前可用生成链路处理，请稍后重试");
  }

  return { images };
}

export async function removeImageBackground(input: RemoveBackgroundInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return removeBackgroundPreservingForegroundPixels(input.imageSrc);
}

export async function enhanceImage(input: EnhanceImageInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return enhanceImageWithPicWish(input.imageSrc);
}

export async function removeImageWatermark(input: RemoveWatermarkInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  return removeWatermarkWithPicWish(input.imageSrc);
}

export async function extractImageText(input: ExtractImageTextInput): Promise<{ text: string; provider: string }> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_IMAGE_API_KEY");
  }

  const response = await fetch(getChatEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model || model,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "请识别图片中所有可见文字，按阅读顺序输出原文。不要解释，不要翻译。如果没有可读文字，返回空字符串。",
          },
          { type: "image_url", image_url: { url: input.imageSrc } },
        ],
      }],
      temperature: 0,
    }),
  });
  const raw = await response.text();
  const data = safeParseJson<ImageTextResponse>(raw) || {};
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(message || `Image OCR provider returned ${response.status}`);
  }

  return {
    text: (data.choices?.[0]?.message?.content || data.output_text || "").trim(),
    provider: "vision-chat-ocr",
  };
}

export async function createProductBackground(input: CreateBackgroundInput): Promise<GeneratedImageResult> {
  if (!input.imageSrc?.trim()) {
    throw new Error("Missing imageSrc");
  }
  const count = Math.max(1, Math.min(Number(input.count) || 1, 4));
  const hasBackgroundReference = Boolean(input.backgroundReferenceSrc?.trim());
  const sourceImageData = await imageSrcToBuffer(input.imageSrc);
  const sourceDimensions = await getImageBufferDimensions(sourceImageData.buffer);
  const output = getBackgroundOutputSize(input, sourceDimensions.width, sourceDimensions.height);

  if (hasBackgroundReference || count > 1) {
    const references = [
      { src: input.imageSrc, title: "产品图" },
      ...(hasBackgroundReference
        ? [{ src: input.backgroundReferenceSrc!, title: input.backgroundReferenceName || "背景参考图" }]
        : []),
    ];
    return generateImages({
      prompt: [
        input.style ? `背景风格：${input.style}` : "",
        input.prompt || "创建商业化产品背景",
        "Use reference image 1 as the exact product subject. Preserve the product shape, material, colors, logo, text, proportions, and foreground identity.",
        hasBackgroundReference
          ? "Use reference image 2 only as the background style reference. Match its color mood, lighting, perspective, material texture, spatial depth, and commercial photography feel without copying protected or distinctive elements exactly."
          : "Create a realistic commercial background behind and around the product. Match lighting, shadows, perspective, and contact shadow naturally.",
        "Return complete product commercial images. Do not crop or distort the product.",
      ].filter(Boolean).join("\n"),
      ratio: input.ratio || "1:1",
      count,
      style: input.style,
      images: references,
    });
  }

  try {
    return await createBackgroundWithPicWish(input);
  } catch (picWishError) {
    console.warn("PicWish create background failed; using image edit provider fallback", picWishError);
    const fallbackResult = await editImageWithPrompt({
      imageSrc: input.imageSrc,
      targetWidth: output.width,
      targetHeight: output.height,
      prompt: [
        input.style ? `背景风格：${input.style}` : "",
        input.prompt || "创建商业化产品背景",
        "Use the uploaded product image as the exact foreground product. Preserve the product shape, material, colors, logo, text, and proportions.",
        "Only create a new realistic commercial background behind and around the product. Match lighting, shadows, perspective, and contact shadow naturally.",
      ].filter(Boolean).join("\n"),
    });
    return fallbackResult;
  }
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
  const referenceImages = input.images?.filter(image => image.src?.trim()) || [];
  const editSize = getEditSizeForAspect(targetWidth, targetHeight);
  const aspectInstruction = `Keep the final image canvas aspect ratio exactly ${targetWidth}:${targetHeight}. Do not return a square image unless the source is square.`;

  if (isChatCompatibleImageModel(selectedModel)) {
    const sourceDataUrl = `data:${sourceImageData.mimeType};base64,${sourceImageData.buffer.toString("base64")}`;
    return generateImages({
      prompt: [
        input.prompt,
        "Use reference image 1 as the target canvas. Preserve its subject identity, pose, composition, lighting, camera angle, and aspect ratio unless the user explicitly asks to change them.",
        "Use any later reference images only for the requested object, accessory, style, texture, or detail.",
        "Return one complete edited image, not a text explanation.",
        aspectInstruction,
      ].join("\n\n"),
      model: selectedModel,
      ratio: "1:1",
      count: 1,
      images: [
        { src: sourceDataUrl, title: "target image" },
        ...referenceImages,
      ],
    });
  }

  const createBody = async (withResponseFormat: boolean) => {
    const body = new FormData();
    body.append("model", selectedModel);
    body.append("image", sourceImage);
    for (const image of referenceImages.slice(0, 6)) {
      body.append("image", await imageSrcToFile(image.src));
    }
    body.append("prompt", [
      input.prompt,
      referenceImages.length
        ? [
            "Use the source image as the target canvas and preserve its subject identity, pose, composition, background, lighting, and aspect ratio.",
            "Use the additional reference images only as visual references for the specific objects, accessories, style, texture, or details requested by the user.",
            "Do not create a new unrelated person, scene, or background.",
            ...referenceImages.map((image, index) => `Reference image ${index + 1}: ${image.title || "untitled"}`),
          ].join("\n")
        : "",
      aspectInstruction,
    ].filter(Boolean).join("\n\n"));
    body.append("n", "1");
    body.append("size", editSize);
    if (withResponseFormat) body.append("response_format", "b64_json");
    return body;
  };

  let providerData: ImageGenerationResponse;
  try {
    providerData = await callImageEditProvider(await createBody(true), apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("response_format")) throw error;
    providerData = await callImageEditProvider(await createBody(false), apiKey, baseUrl);
  }

  const asyncTaskId = providerData.task_id || providerData.taskId;
  if (asyncTaskId) {
    providerData = await pollAsyncImageTask(asyncTaskId, apiKey, baseUrl);
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

export async function eraseImageObjects(input: EraseImageInput): Promise<GeneratedImageResult> {
  const sourceImageSrc = input.imageSrc?.trim();
  const sourceImageUrl = (input.imageUrl || input.image_url || "").trim();
  const maskSrc = input.maskSrc?.trim();
  const maskUrl = (input.maskUrl || input.mask_url || "").trim();
  if (!sourceImageSrc && !sourceImageUrl) {
    throw new Error("Missing imageSrc");
  }
  if (!maskSrc && !maskUrl && !input.rectangles) {
    throw new Error("Missing maskSrc");
  }

  const sourceImageData = sourceImageSrc ? await imageSrcToBuffer(sourceImageSrc) : null;
  const maskImageData = maskSrc ? await imageSrcToBuffer(maskSrc) : null;
  const sourceImageDimensions = sourceImageData
    ? await getImageBufferDimensions(sourceImageData.buffer)
    : { width: coerceTargetDimension(input.targetWidth) || 1024, height: coerceTargetDimension(input.targetHeight) || 1024 };
  const targetWidth = coerceTargetDimension(input.targetWidth) || sourceImageDimensions.width;
  const targetHeight = coerceTargetDimension(input.targetHeight) || sourceImageDimensions.height;
  const providerMaskBuffer = maskImageData
    ? await createPicWishEraseMask(maskImageData.buffer, targetWidth, targetHeight)
    : undefined;
  const sync = input.sync === true || input.sync === 1 || input.sync === "1";
  const picWishResult = await eraseWithPicWish({
    imageBuffer: sourceImageData?.buffer,
    imageMimeType: sourceImageData?.mimeType,
    imageUrl: sourceImageUrl || undefined,
    maskBuffer: providerMaskBuffer,
    maskMimeType: providerMaskBuffer ? "image/png" : undefined,
    maskUrl: maskUrl || undefined,
    rectangles: input.rectangles,
    sync,
  });
  const normalized = await normalizeGeneratedImagesToTargetAspect(picWishResult.images, targetWidth, targetHeight);
  if (normalized.length === 0) {
    throw new Error("AI 擦除未返回可用内容，请稍后重试");
  }
  return withProviderTaskIds({ images: normalized }, collectProviderTaskIds(picWishResult));
}
