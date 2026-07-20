import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "./api-base-url";
import { DEFAULT_IMAGE_MODEL_ID } from "../../../shared/image-models";

type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

type OrchestrateResponse = ApiErrorResponse & {
  text?: string;
  model?: string;
  images?: GeneratedImageResult[];
  image_base64?: string;
  providerTaskId?: string;
  providerTaskIds?: string[];
};

export type BackgroundImageTask = {
  taskId: string;
  status: "pending" | "completed" | "failed";
  images?: GeneratedImageResult[];
  error?: string;
};

export type ImageGenerationTaskInput = Record<string, unknown> & {
  taskId: string;
  capability?: string;
  intent?: string;
  operation?: string;
};

const AUTH_STORAGE_KEY = "artx-auth-session";
const AI_REQUEST_TIMEOUT_MS = 300000;
const AI_TIMEOUT_ERROR_MESSAGE = "对不起，网络开了个小差，请稍后重试";
const ART_X_TEST_AI_API_BASE_URL = ART_X_TEST_API_BASE_URL;
let aiApiBaseOverride: string | null = null;

function normalizeAiErrorMessage(message: string, fallback: string) {
  if (/images api is not supported|not supported for this platform|unsupported.*images/i.test(message)) {
    return "当前图片模型不支持 Images API，系统已自动切换兼容生成链路；如果仍失败，请稍后重试";
  }
  return message || fallback;
}

export type GeneratedImageResult = {
  src: string;
  width: number;
  height: number;
};

export type GeneratedImagesResponse = {
  images: GeneratedImageResult[];
  providerTaskId?: string;
  providerTaskIds?: string[];
};

function getAiAssetBaseUrl() {
  const apiBaseUrl = getAiApiBaseUrl();
  return apiBaseUrl || ART_X_TEST_AI_API_BASE_URL;
}

function normalizeGeneratedImageSrc(src: string) {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) return trimmed;
  const uploadPath = trimmed
    .replace(/^\/api(?=\/uploads\/)/, "")
    .replace(/^uploads\//, "/uploads/");
  if (uploadPath.startsWith("/uploads/")) return `${getAiAssetBaseUrl()}${uploadPath}`;
  return trimmed;
}

function normalizeGeneratedImage(image: GeneratedImageResult): GeneratedImageResult {
  return {
    ...image,
    src: normalizeGeneratedImageSrc(image.src),
  };
}

function toGeneratedImagesResponse(result: Partial<GeneratedImagesResponse>): GeneratedImagesResponse {
  const providerTaskIds = result.providerTaskIds?.length
    ? result.providerTaskIds
    : result.providerTaskId
      ? [result.providerTaskId]
      : undefined;
  return {
    images: (result.images || []).map(normalizeGeneratedImage),
    providerTaskId: result.providerTaskId || providerTaskIds?.[0],
    providerTaskIds,
  };
}

function normalizeBackgroundImageTask(task: BackgroundImageTask): BackgroundImageTask {
  return {
    ...task,
    images: task.images?.map(normalizeGeneratedImage),
  };
}

export type ReferenceImageResult = {
  id: string;
  title: string;
  src: string;
  width: number;
  height: number;
  source: string;
};

export type AiModelCatalogOption = {
  id: string;
  label: string;
  color: string;
  description?: string;
  icon?: string;
};

export type AiModelCatalogResponse = ApiErrorResponse & {
  image?: AiModelCatalogOption[];
  source?: "provider" | "fallback";
};

export type AiModelEntitlement = {
  model: string;
  status: "standard" | "available" | "unavailable" | "exhausted";
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  creditsPerImage?: number;
  message?: string;
};

export type AiModelEntitlementsResponse = ApiErrorResponse & {
  planId: string;
  planName: string;
  imageModels: AiModelEntitlement[];
};

function getAiApiBaseUrl() {
  if (aiApiBaseOverride) return aiApiBaseOverride;
  const configured = (
    import.meta.env.VITE_AI_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  );
  const normalized = normalizeApiBaseUrl(configured);
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isGithubPages = hostname.endsWith("github.io");
    const isRelativeConfigured = normalized.startsWith("/") || normalized.startsWith(".");
    const configuredHost = (() => {
      try {
        return normalized ? new URL(normalized, window.location.href).hostname : "";
      } catch {
        return "";
      }
    })();
    if (isGithubPages && (!normalized || isRelativeConfigured || configuredHost.endsWith("github.io"))) {
      return ART_X_TEST_AI_API_BASE_URL;
    }
  }
  if (normalized) return normalized;
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return "";
  }
  return ART_X_TEST_AI_API_BASE_URL;
}

function getLocalAiFallbackEndpoint(endpoint: string) {
  if (typeof window === "undefined") return "";
  try {
    const current = new URL(endpoint, window.location.href);
    const isLoopback = current.hostname === "localhost"
      || current.hostname === "127.0.0.1"
      || current.hostname === "::1";
    if (!isLoopback) return "";
    const fallback = new URL(current.pathname + current.search, ART_X_TEST_AI_API_BASE_URL);
    return fallback.toString();
  } catch {
    return "";
  }
}

function isAiBackendConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /AI 后端地址未正确连接|网页内容|non-JSON response|Failed to fetch|NetworkError|后台图像生成启动失败|后台图像生成查询失败/i.test(message);
}

function isTransientBackgroundTaskPollingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /429|Too Many Requests|AI 后端地址未正确连接|网页内容|non-JSON response|Failed to fetch|NetworkError|后台图像生成查询失败/i.test(message);
}

function isTransientBackgroundTaskStartError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /429|Too Many Requests|AI 后端地址未正确连接|网页内容|non-JSON response|Failed to fetch|NetworkError|后台图像生成启动失败/i.test(message);
}

export function hasActiveAuthSession() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { token?: string; user?: { id?: string; username?: string } };
    return Boolean(parsed.token && parsed.user?.id && parsed.user?.username);
  } catch {
    return false;
  }
}

function getAiAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

function getAiAuthHeaders(): Record<string, string> {
  const token = getAiAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function requestAiAuth() {
  if (hasActiveAuthSession()) return true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("artx:login-required", { detail: { reason: "ai" } }));
  }
  return false;
}

function requireAiAuth() {
  if (requestAiAuth()) return;
  throw new Error("请先登录后使用 AI 能力");
}

async function readJsonResponse<T extends ApiErrorResponse>(response: Response, fallbackError: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const isJson = contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[");

  if (!isJson) {
    const snippet = text.trim().slice(0, 180).replace(/\s+/g, " ");
    const looksLikeHtml = snippet.startsWith("<!DOCTYPE") || snippet.startsWith("<html") || snippet.startsWith("<");
    throw new Error(looksLikeHtml
      ? `${fallbackError}: AI 后端地址未正确连接，当前请求返回了网页内容，请稍后刷新后重试`
      : `${fallbackError}: received non-JSON response from ${response.url || "API"}${snippet ? ` (${snippet})` : ""}`);
  }

  return JSON.parse(text) as T;
}

async function fetchAiJson<T extends ApiErrorResponse>(
  endpoint: string,
  body: Record<string, unknown>,
  fallbackError: string,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  allowLocalFallback = true,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAiAuthHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const result = await readJsonResponse<T>(response, fallbackError);
    if (!response.ok) {
      throw new Error(result.error || result.message || fallbackError);
    }
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(AI_TIMEOUT_ERROR_MESSAGE);
    }
    const fallbackEndpoint = allowLocalFallback ? getLocalAiFallbackEndpoint(endpoint) : "";
    if (fallbackEndpoint && fallbackEndpoint !== endpoint && isAiBackendConnectionError(error)) {
      aiApiBaseOverride = ART_X_TEST_AI_API_BASE_URL;
      return fetchAiJson<T>(fallbackEndpoint, body, fallbackError, timeoutMs, false);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAiJsonGet<T extends ApiErrorResponse>(
  endpoint: string,
  fallbackError: string,
  allowLocalFallback = true,
): Promise<T> {
  try {
    const response = await fetch(endpoint, { method: "GET", headers: getAiAuthHeaders() });
    const result = await readJsonResponse<T>(response, fallbackError);
    if (!response.ok) {
      throw new Error(result.error || result.message || fallbackError);
    }
    return result;
  } catch (error) {
    const fallbackEndpoint = allowLocalFallback ? getLocalAiFallbackEndpoint(endpoint) : "";
    if (fallbackEndpoint && fallbackEndpoint !== endpoint && isAiBackendConnectionError(error)) {
      aiApiBaseOverride = ART_X_TEST_AI_API_BASE_URL;
      return fetchAiJsonGet<T>(fallbackEndpoint, fallbackError, false);
    }
    throw error;
  }
}

export async function listAiModelCatalog() {
  const endpoint = `${getAiApiBaseUrl()}/api/ai/models`;
  return fetchAiJsonGet<AiModelCatalogResponse>(endpoint, "AI 模型列表加载失败");
}

export async function getAiModelEntitlements() {
  const endpoint = `${getAiApiBaseUrl()}/api/ai/model-entitlements`;
  return fetchAiJsonGet<AiModelEntitlementsResponse>(endpoint, "AI 模型权益加载失败");
}

async function postAiOrchestrate(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/ai/orchestrate`;
  return fetchAiJson<OrchestrateResponse>(endpoint, body, fallbackError);
}

async function postImageExpand(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/expand`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postImageEnhance(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/enhance`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postImageBackgroundRemoval(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/remove-background`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postImageWatermarkRemoval(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/remove-watermark`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postProductBackground(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/create-background`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postImageErase(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/erase`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postImageOcr(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/ocr`;
  return fetchAiJson<ApiErrorResponse & { text?: string; provider?: string }>(endpoint, body, fallbackError);
}

export async function callLLM({
  prompt,
  messages,
  images,
  model,
  module,
}: {
  prompt?: string;
  messages?: LLMMessage[];
  images?: Array<{ src: string; title?: string }>;
  model?: string;
  module: string;
}) {
  requireAiAuth();
  const result = await postAiOrchestrate({
    capability: "chat",
    intent: module,
    operation: module,
    prompt,
    messages,
    images,
    model,
  }, "AI 请求失败");

  return {
    text: result.text || "",
    model: result.model || model || "auto",
  };
}

export async function searchReferenceImages({
  query,
  limit = 10,
}: {
  query: string;
  limit?: number;
}) {
  requireAiAuth();
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/references/search`;
  const result = await fetchAiJson<ApiErrorResponse & { images?: ReferenceImageResult[] }>(endpoint, { query, limit }, "参考图抓取失败");

  return { images: result.images || [] };
}

export async function generateImages({
  prompt,
  model = DEFAULT_IMAGE_MODEL_ID,
  ratio = "1:1",
  count = 1,
  style,
  referencesEnabled = false,
  referencedAssets = [],
  skillId,
  generationId,
}: {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
  referencesEnabled?: boolean;
  referencedAssets?: Array<{ src: string; title?: string }>;
  skillId?: string;
  generationId?: string;
}) {
  requireAiAuth();
  const promptWithContext = [
    style ? `风格：${style}` : "",
    referencesEnabled ? "参考当前画布和已引用素材进行生成。" : "",
    prompt,
  ].filter(Boolean).join("\n");
  if (generationId) {
    try {
      await startBackgroundImageGeneration({
        taskId: generationId,
        prompt,
        model,
        ratio,
        count,
        style,
        referencesEnabled,
        referencedAssets,
        skillId,
      });
      return await waitForImageGenerationTask(generationId);
    } catch (error) {
      if (!isAiBackendConnectionError(error)) throw error;
    }
  }
  const result = await postAiOrchestrate({
    capability: "text_to_image",
    intent: "text_to_image",
    operation: "generate",
    prompt: promptWithContext,
    model,
    ratio,
    count,
    style,
    images: referencedAssets,
    skillId,
  }, "图像生成失败");

  return toGeneratedImagesResponse(result);
}

export async function startImageGenerationTask(
  input: ImageGenerationTaskInput,
) {
  requireAiAuth();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await fetchAiJson<BackgroundImageTask>(
        `${getAiApiBaseUrl()}/api/images/tasks`,
        input,
        "后台图像生成启动失败",
        20000
      );
      return normalizeBackgroundImageTask(result);
    } catch (error) {
      if (!isTransientBackgroundTaskStartError(error)) throw error;
      lastError = error;
      console.warn("Background image generation start temporarily failed", error);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("后台图像生成启动失败");
}

export async function waitForImageGenerationTask(taskId: string): Promise<GeneratedImagesResponse> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const task = await getBackgroundImageGenerationTask(taskId);
      if (task.status === "completed") return { images: task.images || [] };
      if (task.status === "failed") throw new Error(task.error || "图像生成失败");
    } catch (error) {
      if (!isTransientBackgroundTaskPollingError(error)) throw error;
      console.warn("Background image generation polling temporarily failed", error);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(AI_TIMEOUT_ERROR_MESSAGE);
}

export async function runImageGenerationTask(input: ImageGenerationTaskInput): Promise<GeneratedImagesResponse> {
  await startImageGenerationTask(input);
  return waitForImageGenerationTask(input.taskId);
}

export async function startBackgroundImageGeneration({
  taskId,
  prompt,
  model = DEFAULT_IMAGE_MODEL_ID,
  ratio = "1:1",
  count = 1,
  style,
  referencesEnabled = false,
  referencedAssets = [],
  skillId,
}: {
  taskId: string;
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
  referencesEnabled?: boolean;
  referencedAssets?: Array<{ src: string; title?: string }>;
  skillId?: string;
}) {
  requireAiAuth();
  const promptWithContext = [
    style ? `风格：${style}` : "",
    referencesEnabled ? "参考当前画布和已引用素材进行生成。" : "",
    prompt,
  ].filter(Boolean).join("\n");
  return startImageGenerationTask({
    taskId,
    capability: "text_to_image",
    intent: "text_to_image",
    operation: "generate",
    prompt: promptWithContext,
    model,
    ratio,
    count,
    style,
    images: referencedAssets,
    skillId,
  });
}

export async function getBackgroundImageGenerationTask(taskId: string) {
  requireAiAuth();
  const endpoint = `${getAiApiBaseUrl()}/api/images/tasks/${encodeURIComponent(taskId)}`;
  const task = await fetchAiJsonGet<BackgroundImageTask>(endpoint, "后台图像生成查询失败");
  return normalizeBackgroundImageTask(task);
}

export async function removeImageBackground({
  imageSrc,
  model = DEFAULT_IMAGE_MODEL_ID,
  prompt,
}: {
  imageSrc: string;
  model?: string;
  prompt?: string;
}) {
  requireAiAuth();
  const result = await postImageBackgroundRemoval({
    imageSrc,
    model,
    prompt,
  }, "去背景失败");

  return toGeneratedImagesResponse(result);
}

export async function enhanceImageToHd({
  imageSrc,
  level = "4k",
}: {
  imageSrc: string;
  level?: "4k";
}) {
  requireAiAuth();
  const result = await postImageEnhance({
    imageSrc,
    level,
  }, "图片高清化失败");

  return { images: result.images || [] };
}

export async function removeImageWatermark({
  imageSrc,
}: {
  imageSrc: string;
}) {
  requireAiAuth();
  const result = await postImageWatermarkRemoval({ imageSrc }, "去水印失败");
  return toGeneratedImagesResponse(result);
}

export async function createProductBackground({
  imageSrc,
  backgroundReferenceSrc,
  backgroundReferenceName,
  prompt,
  style,
  ratio = "1:1",
  resolution = "2k",
  count = 1,
  customWidth,
  customHeight,
  skillId,
  model = DEFAULT_IMAGE_MODEL_ID,
}: {
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
  skillId?: string;
  model?: string;
}) {
  requireAiAuth();
  const result = await postProductBackground({
    imageSrc,
    backgroundReferenceSrc,
    backgroundReferenceName,
    prompt,
    style,
    ratio,
    resolution,
    count,
    customWidth,
    customHeight,
    skillId,
    model,
  }, "智能电商产品生成失败");

  return toGeneratedImagesResponse(result);
}

export async function extractImageText({
  imageSrc,
}: {
  imageSrc: string;
}) {
  requireAiAuth();
  const result = await postImageOcr({ imageSrc }, "智能文案 OCR 失败");
  return {
    text: result.text || "",
    provider: result.provider || "picwish-smart-ocr",
  };
}

export async function editImageWithPrompt({
  imageSrc,
  model = DEFAULT_IMAGE_MODEL_ID,
  prompt,
  maskSrc,
  operation,
  targetWidth,
  targetHeight,
  referencedAssets = [],
  skillId,
  generationId,
}: {
  imageSrc: string;
  model?: string;
  prompt: string;
  maskSrc?: string;
  operation?: string;
  targetWidth?: number;
  targetHeight?: number;
  referencedAssets?: Array<{ src: string; title?: string }>;
  skillId?: string;
  generationId?: string;
}) {
  requireAiAuth();
  if (generationId) {
    return runImageGenerationTask({
      taskId: generationId,
      capability: "image_edit",
      intent: "image_edit",
      operation: operation || "edit",
      imageSrc,
      maskSrc,
      model,
      prompt,
      targetWidth,
      targetHeight,
      images: referencedAssets,
      skillId,
    });
  }
  const result = await postAiOrchestrate({
    capability: "image_edit",
    intent: "image_edit",
    operation: operation || "edit",
    imageSrc,
    maskSrc,
    model,
    prompt,
    targetWidth,
    targetHeight,
    images: referencedAssets,
    skillId,
  }, "AI 图片编辑失败");

  return { images: result.images || [] };
}

export async function eraseImageObjects({
  imageSrc,
  maskSrc,
  model = DEFAULT_IMAGE_MODEL_ID,
  prompt,
  targetWidth,
  targetHeight,
}: {
  imageSrc: string;
  maskSrc: string;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
}) {
  requireAiAuth();
  const result = await postImageErase({
    imageSrc,
    maskSrc,
    model,
    prompt,
    targetWidth,
    targetHeight,
  }, "AI 擦除失败");

  const normalized = toGeneratedImagesResponse(result);
  if (!normalized.providerTaskId && !(normalized.providerTaskIds && normalized.providerTaskIds.length > 0)) {
    throw new Error("AI 擦除失败: PicWish taskId 缺失，结果已拒绝写入");
  }
  return normalized;
}

export async function expandImageWithMask({
  imageSrc,
  maskSrc,
  model = "picwish-advanced-image-expand",
  prompt,
  targetWidth,
  targetHeight,
  top,
  bottom,
  left,
  right,
}: {
  imageSrc: string;
  maskSrc?: string;
  model?: string;
  prompt?: string;
  targetWidth?: number;
  targetHeight?: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}) {
  requireAiAuth();
  const result = await postImageExpand({
    imageSrc,
    maskSrc,
    model,
    targetWidth,
    targetHeight,
    top,
    bottom,
    left,
    right,
    prompt: prompt || "Extend the image naturally only inside the masked blank area. Preserve all unmasked pixels exactly and never generate beyond the requested boundary.",
  }, "AI 扩展失败");

  const normalized = toGeneratedImagesResponse(result);
  if (!normalized.providerTaskId && !(normalized.providerTaskIds && normalized.providerTaskIds.length > 0)) {
    throw new Error("AI 扩展失败: providerTaskId 缺失，结果已拒绝写入");
  }
  return normalized;
}
