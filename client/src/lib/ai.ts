import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "./api-base-url";
import { DEFAULT_IMAGE_MODEL_ID } from "../../../shared/image-models";
import {
  DEFAULT_IMAGE_EXPANSION_PROMPT,
  VOD_EXPANSION_PROMPT_MAX_LENGTH,
  VOD_IMAGE_EXPANSION_MODEL,
} from "../../../shared/image-expansion";
import { AUTO_RATIO_VALUE, resolveImageRatio } from "../../../shared/image-ratios";
import type { AiBillingErrorCode } from "./ai-credit-gate";
import { emitInsufficientCredits } from "./ai-credit-gate";
import { compressAiRequestBody } from "./ai-payload-image";

type LLMRole = "system" | "user" | "assistant";

/**
 * 历史消息里的图片附件。
 *
 * 【2026-09-11 新增】此前 `content` 只能是纯字符串，
 * 于是「上一轮生成的图」根本进不了对话历史 ——
 * 顶层的 `images` 参数会被服务端当作**当前**素材统一放在历史之前，
 * 模型无从分辨哪张图属于哪一轮，
 * 用户说「这张再暗一点」时它完全不知道指谁。
 */
export type LLMMessageImage = {
  src: string;
  title?: string;
};

export type LLMMessage = {
  role: LLMRole;
  content: string;
  /** 本条消息自带的图片。仅 user / assistant 有意义。 */
  images?: LLMMessageImage[];
};

/** 402 响应体 / 事件契约见 ./ai-credit-gate —— 与 ai-client.ts 共用同一份。 */
type ApiErrorResponse = {
  error?: string;
  message?: string;
  /**
   * 仅服务端 402 计费拦截时才有。
   *
   * ⚠️ 这两个字段必须在 `fetchAiJson` 里被读出来并派发出去 —— 它在下面
   * 只取了 error/message 拼进 Error，其余字段会在这里静默消失，
   * 前端就再也拿不到「是没订阅还是额度不够」的信息。
   */
  code?: AiBillingErrorCode;
  requiredCredits?: number;
  availableCredits?: number;
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

/**
 * 用户主动中止的专用错误标记。
 *
 * 【2026-09-15】此前「停止」只是把 isSubmitting 置回 false，
 * 轮询 promise 仍在后台跑。服务端的 backgroundImageTasks 是内存 Map 且会被
 * pruneBackgroundImageTasks 清理，任务一旦被清掉，下一次轮询就拿到 404
 * "Image task not found" —— 它不在 isTransientBackgroundTaskPollingError
 * 的放行名单里，于是被当成致命错误抛出，最终冒泡到 catch 弹出
 * 「AI 助手请求失败 / task not found」。
 *
 * 📌 用户点的是「停止」，看到的却是「失败」—— 这是**误报**，不是真故障。
 * 解法：中止要能真正掐断轮询，并且中止导致的错误**不得进 toast**。
 */
export const AI_ABORTED_ERROR_MESSAGE = "__ARTX_ABORTED__";

export function createAiAbortError() {
  const error = new Error(AI_ABORTED_ERROR_MESSAGE);
  error.name = "AbortError";
  return error;
}

/**
 * 判断一个错误是否源于用户主动中止。
 *
 * ⚠️ 三种来源都要认：我们自己抛的哨兵、fetch 的原生 AbortError、
 * 以及 DOMException(name="AbortError")。少认一种，就会漏一条误报路径。
 */
export function isAiAbortError(error: unknown) {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (error.message === AI_ABORTED_ERROR_MESSAGE) return true;
  }
  return String(error) === AI_ABORTED_ERROR_MESSAGE;
}
const ART_X_TEST_AI_API_BASE_URL = ART_X_TEST_API_BASE_URL;
let aiApiBaseOverride: string | null = null;

function normalizeAiErrorMessage(message: string, fallback: string) {
  if (/images api is not supported|not supported for this platform|unsupported.*images/i.test(message)) {
    return "当前图片模型不支持 Images API，系统已自动切换兼容生成链路；如果仍失败，请稍后重试";
  }
  if (/openai_error|bad_response_status_code|bad response status/i.test(message)) {
    return "图片模型暂不可用，请稍后重试";
  }
  if (/^\s*\{[\s\S]*"error"[\s\S]*\}\s*$/.test(message)) {
    return "图片模型暂不可用，请稍后重试";
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

export type ImageTextRegion = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 文字倾斜角度（度，正值顺时针），回填时以区域中心旋转 */
  rotate?: number;
  /** 文字主色（十六进制 #rrggbb），回填时作为默认字体颜色 */
  fontColor?: string;
  /** 回填字体（中文名或 CSS 字体名） */
  fontFamily?: string;
};

function getAiAssetBaseUrl() {
  const apiBaseUrl = getAiApiBaseUrl();
  if (apiBaseUrl) return apiBaseUrl;
  // getAiApiBaseUrl() 在 localhost 下会**刻意返回空串**表示「走同源」（见 :192）。
  // 这里若用 `apiBaseUrl || ART_X_TEST_AI_API_BASE_URL`，空串是 falsy，
  // 本地生成的图会被拼成 https://backstage.artxsd.com/uploads/... —— 远程没有
  // 这个文件，前端直接图裂。空串必须原样保留，让浏览器按同源解析。
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return "";
  }
  return ART_X_TEST_AI_API_BASE_URL;
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
  originalSrc?: string;
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

    /*
     * ⚠️⚠️ 413 必须**先于**「返回了网页内容」判断。
     *
     * 服务端 express.json({ limit: "25mb" }) 拒收超大请求体时，返回的是
     * Express 默认的 **HTML** 错误页（`<!DOCTYPE html>…<pre>Payload Too Large</pre>`）。
     * 原代码只看到「响应体是 HTML」，就统一报「AI 后端地址未正确连接」——
     * 2026-09-19 用户点提示词反推看到的就是这句，于是所有人（包括我）
     * 第一反应都是去查后端有没有挂、nginx 是不是转发错了。
     *
     * 📌 实测后端好得很：/api/ai/orchestrate 与 /api/images/ocr 都是 200。
     *    纯粹是一张 4K 图转成无损 PNG 后超过 25MB 被网关拒收。
     *
     * 📌 判据：**状态码是确定的事实，响应体长什么样是推测。**
     *    有 413 就直接说图太大，不要再从 HTML 去猜是不是连不上。
     */
    if (response.status === 413) {
      throw new Error(`${fallbackError}: 图片体积超出服务端上限，请先压缩或改用较小尺寸的图片后重试`);
    }

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
    /*
     * ⚠️⚠️ 发请求前统一压缩图片载荷 —— 这里是**唯一收口**。
     *
     * 为什么不在各个 API 函数里分别压：ai.ts 有 18 个导出函数会把图片
     * 发给后端，字段名还各不相同（imageSrc / maskSrc / images[].src /
     * referenceImages[] …）。挨个接必然漏，以后新增出口又会漏一次。
     * fetchAiJson 是所有 POST 真正发出去的地方，收在这里天然覆盖全部。
     *
     * 实测（2026-09-19，线上 OCR 接口，同一张图三档对照）：
     * 4K PNG 载荷 3.26MB / 12.0s，降采样 1600 宽 JPEG82 后 0.20MB / 7.6s，
     * **读出的文案完全一致**。压缩不是妥协，是更快更稳。
     */
    const payload = await compressAiRequestBody(body);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAiAuthHeaders() },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const result = await readJsonResponse<T>(response, fallbackError);
    if (!response.ok) {
      /**
       * 402 必须**先于**抛错派发。
       *
       * ⚠️ 不能挪到外层 catch：那里会先做本地 fallback 重试，
       * 一次 402 会被连发两遍（同一件事弹两次窗），
       * 而且 AbortError 分支会把错误重写成超时，事件就彻底丢了。
       */
      emitInsufficientCredits(result);
      throw new Error(normalizeAiErrorMessage(result.error || result.message || fallbackError, fallbackError));
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
      emitInsufficientCredits(result);
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

export type PicWishBackgroundTemplate = {
  id: number;
  name: string;
  category: string;
  previewUrl?: string;
};

export async function listPicWishBackgroundTemplates() {
  const endpoint = `${getAiApiBaseUrl()}/api/images/background-templates?language=en`;
  const result = await fetchAiJsonGet<{ templates?: PicWishBackgroundTemplate[]; error?: string }>(endpoint, "PicWish 背景模板加载失败");
  return result.templates || [];
}

async function postImageErase(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/erase`;
  return fetchAiJson<ApiErrorResponse & Partial<GeneratedImagesResponse>>(endpoint, body, fallbackError);
}

async function postImageOcr(body: Record<string, unknown>, fallbackError: string) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/ocr`;
  return fetchAiJson<ApiErrorResponse & { text?: string; regions?: ImageTextRegion[]; provider?: string }>(endpoint, body, fallbackError);
}

export async function callLLM({
  prompt,
  messages,
  images,
  model,
  module,
  skillId,
}: {
  prompt?: string;
  messages?: LLMMessage[];
  images?: Array<{ src: string; title?: string }>;
  model?: string;
  module: string;
  skillId?: string;
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
    skillId,
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

  return {
    images: (result.images || []).map(image => ({
      ...image,
      src: image.src.startsWith("/") ? new URL(image.src, baseUrl).toString() : image.src,
    })),
  };
}

export async function generateImages({
  prompt,
  model = DEFAULT_IMAGE_MODEL_ID,
  ratio = AUTO_RATIO_VALUE,
  count = 1,
  style,
  referencesEnabled = false,
  referencedAssets = [],
  skillId,
  generationId,
  targetWidth,
  targetHeight,
  signal,
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
  /**
   * 提示词尺寸意图解析出的目标像素（见 shared/prompt-size-intent.ts）。
   *
   * ⚠️⚠️ 本函数有**两条出口**（后台任务 startBackgroundImageGeneration、
   * 同步 postAiOrchestrate），两条都必须带上这两个字段。
   * 只接一条 = 用户在其中一条路径上写了「4K」却静默失效，且不报错。
   */
  targetWidth?: number;
  targetHeight?: number;
  /**
   * 用户主动中止的信号。
   *
   * ⚠️⚠️【2026-09-15】这条参数极易漏。修「停止后报 task not found」时，
   * 第一反应是给 runImageGenerationTask 加 signal —— 但 AI 助手面板走的是
   * generateImages 这条路，它内部另有一次 waitForImageGenerationTask 调用。
   * **只接一条出口 = 停止依然会弹错，而且零报错。**
   * 📌 凡是会发起轮询的函数，每一个都要能被同一个 signal 掐断。
   */
  signal?: AbortSignal;
}) {
  requireAiAuth();
  // ⚠️ 默认参数只在调用方「完全不传」时生效。调用方显式传 "auto" 时默认参数兜不住，
  // auto 会一路透传到后端被静默当成 1:1 方图。所以必须在函数体里再收口一次。
  const resolvedRatio = resolveImageRatio(ratio);
  const promptWithContext = [
    style ? `风格：${style}` : "",
    referencesEnabled ? "参考当前画布和已引用素材进行生成。" : "",
    prompt,
  ].filter(Boolean).join("\n");
  if (signal?.aborted) throw createAiAbortError();
  if (generationId) {
    try {
      await startBackgroundImageGeneration({
        taskId: generationId,
        prompt,
        model,
        ratio: resolvedRatio,
        count,
        style,
        referencesEnabled,
        referencedAssets,
        skillId,
        targetWidth,
        targetHeight,
      });
      return await waitForImageGenerationTask(generationId, signal);
    } catch (error) {
      // ⚠️ 中止必须先于「后端连接错误」判定返回，否则中止会被误当成
      // 连不上后端，进而回落到下面的同步 orchestrate 又跑一次生成。
      if (isAiAbortError(error)) throw error;
      if (!isAiBackendConnectionError(error)) throw error;
    }
  }
  if (signal?.aborted) throw createAiAbortError();
  const result = await postAiOrchestrate({
    capability: "text_to_image",
    intent: "text_to_image",
    operation: "generate",
    prompt: promptWithContext,
    model,
    ratio: resolvedRatio,
    count,
    style,
    images: referencedAssets,
    skillId,
    targetWidth,
    targetHeight,
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

/**
 * 轮询后台出图任务的最大次数（每次间隔 3s）。
 *
 * ⚠️ 2026-09-19 从 100（5 分钟）上调到 160（8 分钟）。
 * 智能文案编辑是两次串行即梦出图，5 分钟不够用（详见
 * server/index.ts 的 BACKGROUND_IMAGE_TASK_TIMEOUT_MS 注释）。
 *
 * 📌 必须 **短于** 服务端的 10 分钟判定阈值：让前端先放弃、服务端后判定。
 *    反过来（前端比服务端长）会让用户白等一段注定拿不到结果的时间。
 */
const IMAGE_TASK_POLL_MAX_ATTEMPTS = 160;

/**
 * 每次轮询之间的间隔。
 *
 * ⚠️ 提成常量是为了让「超时三出口顺序约束」那条测试能算出前端真实放弃
 *    时间（160 × 3s = 480s）。硬编码在 setTimeout 里的话测试只能靠猜，
 *    约束就形同虚设。改这里等于改前端放弃时间，务必重跑那条约束测试。
 */
const IMAGE_TASK_POLL_INTERVAL_MS = 3000;

export async function waitForImageGenerationTask(
  taskId: string,
  signal?: AbortSignal
): Promise<GeneratedImagesResponse> {
  for (let attempt = 0; attempt < IMAGE_TASK_POLL_MAX_ATTEMPTS; attempt += 1) {
    // ⚠️ 每轮开头先查中止：用户点「停止」后不应再发起下一次查询，
    // 否则任务可能已被服务端清理，查回 404 变成「task not found」误报。
    if (signal?.aborted) throw createAiAbortError();
    try {
      const task = await getBackgroundImageGenerationTask(taskId);
      if (task.status === "completed") return { images: task.images || [] };
      if (task.status === "failed") throw new Error(task.error || "图像生成失败");
    } catch (error) {
      // 中止优先于一切错误分类：中止期间拿到的任何错误都不该被报给用户。
      if (signal?.aborted) throw createAiAbortError();
      if (!isTransientBackgroundTaskPollingError(error)) throw error;
      console.warn("Background image generation polling temporarily failed", error);
    }
    // 等待期间也要能被打断，否则最长要卡 3 秒才响应「停止」。
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, IMAGE_TASK_POLL_INTERVAL_MS);
      const onAbort = () => {
        clearTimeout(timer);
        reject(createAiAbortError());
      };
      if (signal?.aborted) {
        clearTimeout(timer);
        reject(createAiAbortError());
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  throw new Error(AI_TIMEOUT_ERROR_MESSAGE);
}

export async function runImageGenerationTask(
  input: ImageGenerationTaskInput,
  signal?: AbortSignal
): Promise<GeneratedImagesResponse> {
  await startImageGenerationTask(input);
  return waitForImageGenerationTask(input.taskId, signal);
}

export async function startBackgroundImageGeneration({
  taskId,
  prompt,
  model = DEFAULT_IMAGE_MODEL_ID,
  ratio = AUTO_RATIO_VALUE,
  count = 1,
  style,
  referencesEnabled = false,
  referencedAssets = [],
  skillId,
  targetWidth,
  targetHeight,
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
  /** 提示词尺寸意图解析出的目标像素。见 shared/prompt-size-intent.ts。 */
  targetWidth?: number;
  targetHeight?: number;
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
    ratio: resolveImageRatio(ratio),
    count,
    style,
    images: referencedAssets,
    skillId,
    targetWidth,
    targetHeight,
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
  composition,
  sceneType,
  ratio = AUTO_RATIO_VALUE,
  // 【2026-09-18】默认值从 "2k" 降到 "1k"，与电商面板的默认选中档位保持一致。
  // 这一层不是摆设：调用方（含未来的脚本/自动化）漏传 resolution 时落的就是这里，
  // 两处默认值不一致会出现「面板显示 1K、实际按 2K 出图」这种零报错的错版。
  resolution = "1k",
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
  composition?: string;
  sceneType?: number;
  ratio?: string;
  resolution?: "1k" | "2k" | "4k";
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
    composition,
    sceneType,
    ratio: resolveImageRatio(ratio),
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
    regions: result.regions || [],
    provider: result.provider || "picwish-smart-ocr",
  };
}

export async function editImageWithPrompt({
  imageSrc,
  model = DEFAULT_IMAGE_MODEL_ID,
  prompt,
  maskSrc,
  operation,
  preserveSource,
  preserveSourceSize,
  regionSelectEdit,
  targetWidth,
  targetHeight,
  referencedAssets = [],
  cameraView,
  skillId,
  generationId,
  textRegions,
  editedText,
  textApplyMode,
}: {
  imageSrc: string;
  model?: string;
  prompt: string;
  maskSrc?: string;
  operation?: string;
  preserveSource?: boolean;
  /**
   * 输出尺寸与原图像素一致（auto 分辨率下的全站默认）。
   * 用户在提示词里写了尺寸、或选择器选了非 auto 时为 false。
   */
  preserveSourceSize?: boolean;
  /**
   * 画布框选式局部重绘（2026-09-23）。后端据此**强制**做蒙版贴回。
   *
   * ⚠️⚠️⚠️ 本函数是「显式解构逐字段转发」而非 spread —— 新字段只要漏写在
   * 这里的任一处（解构、类型、两个出口），就会被静默丢掉，后端收不到、
   * 贴回不生效、且全链路零报错。加字段时四处必须同时改。
   */
  regionSelectEdit?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  referencedAssets?: Array<{ src: string; title?: string }>;
  cameraView?: {
    x?: number;
    y?: number;
    z?: number;
    prompt?: string;
  };
  skillId?: string;
  generationId?: string;
  /** 智能文案编辑：原图 OCR 识别的文字区域（x/y/width/height/text/rotate/fontColor/fontFamily），用于确定性文字绘制 */
  textRegions?: ImageTextRegion[];
  /** 智能文案编辑：修改后的完整文案（多行用 \n 分隔），用于确定性文字绘制 */
  editedText?: string;
  /**
   * 智能文案编辑：新文案「贴回原图」的方式。
   * - "local"（默认）：本地字体确定性绘制，零模型成本、逐字准确，字体只能近似匹配
   * - "ai"：擦字后交给图片模型叠字（当前为 VOD 即梦 4.0），
   *   由模型还原字体/透视/光影，但会漏字/错字，必须人工核字
   */
  textApplyMode?: "ai" | "local";
}) {
  requireAiAuth();
  if (generationId) {
    return runImageGenerationTask({
      taskId: generationId,
      capability: "image_edit",
      intent: "image_edit",
      operation: operation || "edit",
      preserveSource,
      preserveSourceSize,
      regionSelectEdit,
      imageSrc,
      maskSrc,
      model,
      prompt,
      targetWidth,
      targetHeight,
      images: referencedAssets,
      cameraView,
      skillId,
      textRegions,
      editedText,
      textApplyMode,
    });
  }
  const result = await postAiOrchestrate({
    capability: "image_edit",
    intent: "image_edit",
    operation: operation || "edit",
    preserveSource,
    preserveSourceSize,
    regionSelectEdit,
    imageSrc,
    maskSrc,
    model,
    prompt,
    targetWidth,
    targetHeight,
    images: referencedAssets,
    cameraView,
    skillId,
    textRegions,
    editedText,
    textApplyMode,
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
  model = VOD_IMAGE_EXPANSION_MODEL,
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
    // 扩图已于 2026-09-13 切到腾讯云 VOD Kling，prompt 上限从佐糖的 200 放宽到 2500。
    // 这里只做上限兜底，不再按 200 截断——否则白白丢掉提示词表达力。
    // ⚠️ 若将来回退到佐糖，必须改回 clampImageExpansionPrompt，否则 201 字符即 400。
    prompt: (prompt || "").trim().slice(0, VOD_EXPANSION_PROMPT_MAX_LENGTH) || DEFAULT_IMAGE_EXPANSION_PROMPT,
  }, "AI 扩展失败");

  const normalized = toGeneratedImagesResponse(result);
  if (!normalized.providerTaskId && !(normalized.providerTaskIds && normalized.providerTaskIds.length > 0)) {
    throw new Error("AI 扩展失败: providerTaskId 缺失，结果已拒绝写入");
  }
  return normalized;
}
