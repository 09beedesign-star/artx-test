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

export type ReferenceImageResult = {
  id: string;
  title: string;
  src: string;
  width: number;
  height: number;
  source: string;
};

function escapeSvgAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function createEraseFallbackComposite(imageSrc: string, maskSrc: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <mask id="erase-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <rect x="0" y="0" width="1024" height="1024" fill="black" />
          <image href="${escapeSvgAttr(maskSrc)}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none" />
        </mask>
      </defs>
      <image href="${escapeSvgAttr(imageSrc)}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none" />
      <rect x="0" y="0" width="1024" height="1024" fill="#8B5CF6" opacity="0.82" mask="url(#erase-mask)" />
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

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

export async function searchReferenceImages({
  query,
  limit = 10,
}: {
  query: string;
  limit?: number;
}) {
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Cannot POST \/api\/images\/remove-background|received non-JSON response|Bad gateway|502/i.test(message)) {
      throw error;
    }
  }

  const fallbackPrompt = prompt || "Remove the background from this image. Keep the foreground subject intact, preserve the original subject appearance, clean up edges naturally, and return a PNG with the background fully transparent and alpha set to 0.";
  return editImageWithPrompt({
    imageSrc,
    model,
    prompt: fallbackPrompt,
  });
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
}: {
  imageSrc: string;
  maskSrc: string;
  model?: string;
  prompt?: string;
}) {
  const baseUrl = getAiApiBaseUrl();
  const endpoint = `${baseUrl}/api/images/erase`;
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Cannot POST \/api\/images\/erase|received non-JSON response|Bad gateway|502/i.test(message)) {
      throw error;
    }
  }

  const fallbackComposite = createEraseFallbackComposite(imageSrc, maskSrc);
  return editImageWithPrompt({
    imageSrc: fallbackComposite,
    model,
    prompt: prompt || "The semi-transparent purple overlay marks the exact area to remove. Remove only the content under the purple overlay, reconstruct the background naturally, keep all unmarked regions unchanged, and leave no visible artifacts.",
  });
}

export async function expandImageWithMask({
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
    body: JSON.stringify({
      imageSrc,
      maskSrc,
      model,
      prompt: prompt || "Extend the image naturally only inside the masked blank area. Preserve all unmasked pixels exactly and never generate beyond the requested boundary.",
    }),
  });

  const result = await readJsonResponse<ApiErrorResponse & { images?: GeneratedImageResult[] }>(response, "AI 扩展失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 扩展失败");
  }

  return { images: result.images || [] };
}
