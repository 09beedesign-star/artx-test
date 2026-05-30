type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

function getAiApiBaseUrl() {
  return import.meta.env.VITE_AI_API_BASE_URL?.replace(/\/+$/, "") || "";
}

async function readJsonResponse(response: Response, fallbackError: string): Promise<ApiErrorResponse & { text?: string; model?: string }> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const isJson = contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[");

  if (!isJson) {
    const snippet = text.trim().slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`${fallbackError}: received non-JSON response from ${response.url || "API"}${snippet ? ` (${snippet})` : ""}`);
  }

  return JSON.parse(text) as ApiErrorResponse & { text?: string; model?: string };
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

  const result = await readJsonResponse(response, "AI 请求失败");
  if (!response.ok) {
    throw new Error(result.error || result.message || "AI 请求失败");
  }

  return result as { text: string; model: string };
}
