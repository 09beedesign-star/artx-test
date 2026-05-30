type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

export type GeneratedImageResult = {
  src: string;
  width: number;
  height: number;
};

function getAiApiBaseUrl() {
  return import.meta.env.VITE_AI_API_BASE_URL?.replace(/\/+$/, "") || "";
}

async function readJsonResponse<T extends ApiErrorResponse>(response: Response, fallbackError: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const isJson = contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[");

  if (!isJson) {
    const snippet = text.trim().slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`${fallbackError}: received non-JSON response from ${response.url || "API"}${snippet ? ` (${snippet})` : ""}`);
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

export async function eraseImageObjects({
  imageSrc,
  maskSrc,
  model = "gpt-image-2",
  prompt,
}: {
  imageSrc: string;
  maskSrc: string;
  model?: string;
  prompt?: string;
}) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/erase`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageSrc, maskSrc, model, prompt }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "AI 擦除失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 擦除失败");
  }

  return { images: result.images || [] };
}
