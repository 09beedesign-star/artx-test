type ApiErrorResponse = {
  error?: string;
  message?: string;
};

export type AiCapability =
  | "chat"
  | "text_to_image"
  | "image_edit"
  | "image_expansion"
  | "background_removal"
  | "element_erasure"
  | "brand_kit_parse";

export type AiImage = {
  src: string;
  width: number;
  height: number;
};

export type BrandKit = {
  id: string;
  name: string;
  colors: string[];
  typography?: string;
  tone?: string;
  logoPrompt?: string;
  constraints?: string[];
  createdAt: string;
  updatedAt: string;
};

export type OrchestrateRequest = {
  intent?: string;
  capability?: AiCapability;
  operation?: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  count?: number;
  imageSrc?: string;
  image_url?: string;
  image_base64?: string;
  images?: Array<{ src: string; title?: string }>;
  maskSrc?: string;
  mask_url?: string;
  mask_base64?: string;
  targetWidth?: number;
  targetHeight?: number;
  brandKitId?: string;
  skillId?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

export type OrchestrateResponse = {
  type: "text" | "image";
  capability: AiCapability;
  model: string;
  text?: string;
  images?: AiImage[];
  image_base64?: string;
  route: string;
  skill?: string;
};

function getBackendApiBaseUrl() {
  const configured = (
    import.meta.env.VITE_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://artx-test.onrender.com";
  }
  return "";
}

async function readJsonResponse<T extends ApiErrorResponse>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[");
  if (!isJson) {
    const snippet = text.trim().slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`${fallbackError}: received non-JSON response from ${response.url || "API"}${snippet ? ` (${snippet})` : ""}`);
  }
  return JSON.parse(text) as T;
}

async function postJson<T extends ApiErrorResponse>(path: string, body: unknown, fallbackError: string): Promise<T> {
  const endpoint = `${getBackendApiBaseUrl()}${path}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await readJsonResponse<T>(response, fallbackError);
  if (!response.ok) {
    throw new Error(result.error || result.message || fallbackError);
  }
  return result;
}

export async function orchestrateAi(input: OrchestrateRequest) {
  return postJson<OrchestrateResponse & ApiErrorResponse>("/api/ai/orchestrate", input, "AI 编排失败");
}

export async function expandImage(input: OrchestrateRequest) {
  return postJson<{ images: AiImage[]; image_base64?: string; model?: string } & ApiErrorResponse>(
    "/api/images/expand",
    input,
    "AI 扩图失败",
  );
}

export async function listBrandKits() {
  const response = await fetch(`${getBackendApiBaseUrl()}/api/brand-kits`);
  const result = await readJsonResponse<{ kits?: BrandKit[] } & ApiErrorResponse>(response, "品牌包读取失败");
  if (!response.ok) throw new Error(result.error || result.message || "品牌包读取失败");
  return { kits: result.kits || [] };
}

export async function saveBrandKit(input: Partial<BrandKit>) {
  return postJson<{ kit: BrandKit } & ApiErrorResponse>("/api/brand-kits", input, "品牌包保存失败");
}

export async function parseBrandKit(input: { imageSrc?: string; image_url?: string; image_base64?: string }) {
  return postJson<{ kit: BrandKit } & ApiErrorResponse>("/api/brand-kits/parse", input, "品牌包解析失败");
}
