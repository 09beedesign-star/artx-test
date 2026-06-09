type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const AUTH_STORAGE_KEY = "artx-auth-session";

export type GeneratedImageResult = {
  src: string;
  width: number;
  height: number;
};

export type ReferenceImageResult = {
  id: string;
  title: string;
  src: string;
  width: number;
  height: number;
  source: string;
};

function getAiApiBaseUrl() {
  const configured = (
    import.meta.env.VITE_AI_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://artx-test.onrender.com";
  }
  return "";
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
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/llm`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, messages, images, model, module }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { text?: string; model?: string }>(response, "AI 请求失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 请求失败");
  }

  return result as { text: string; model: string };
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
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: ReferenceImageResult[] }>(response, "参考图抓取失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "参考图抓取失败");
  }

  return { images: result.images || [] };
}

export async function generateImages({
  prompt,
  model = "gpt-image-2",
  ratio = "1:1",
  count = 1,
  style,
  referencesEnabled = false,
}: {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
  referencesEnabled?: boolean;
}) {
  requireAiAuth();
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/generate`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, ratio, count, style, referencesEnabled }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "图像生成失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "图像生成失败");
  }

  return { images: result.images || [] };
}

export async function removeImageBackground({
  imageSrc,
  model = "gpt-image-2",
  prompt,
}: {
  imageSrc: string;
  model?: string;
  prompt?: string;
}) {
  requireAiAuth();
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/remove-background`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageSrc, model, prompt }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "去背景失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "去背景失败");
  }

  return { images: result.images || [] };
}

export async function editImageWithPrompt({
  imageSrc,
  model = "gpt-image-2",
  prompt,
  targetWidth,
  targetHeight,
}: {
  imageSrc: string;
  model?: string;
  prompt: string;
  targetWidth?: number;
  targetHeight?: number;
}) {
  requireAiAuth();
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/edit`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageSrc, model, prompt, targetWidth, targetHeight }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "AI 图片编辑失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 图片编辑失败");
  }

  return { images: result.images || [] };
}

export async function eraseImageObjects({
  imageSrc,
  maskSrc,
  model = "gpt-image-2",
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
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/erase`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageSrc, maskSrc, model, prompt, targetWidth, targetHeight }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "AI 擦除失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 擦除失败");
  }

  return { images: result.images || [] };
}

export async function expandImageWithMask({
  imageSrc,
  maskSrc,
  model = "gpt-image-2",
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
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/erase`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageSrc,
      maskSrc,
      model,
      targetWidth,
      targetHeight,
      prompt: prompt || "Extend the image naturally only inside the masked blank area. Preserve all unmasked pixels exactly and never generate beyond the requested boundary.",
    }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "AI 扩展失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 扩展失败");
  }

  return { images: result.images || [] };
}
