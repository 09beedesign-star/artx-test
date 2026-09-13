import { resolveImageRatio } from "../shared/image-ratios";

export type NanoBananaGenerateInput = {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
};

type ProviderImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  images?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string } | string;
};

function getEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/generations`;
}

function getErrorMessage(data: ProviderImageResponse, fallback: string) {
  if (!data.error) return fallback;
  return typeof data.error === "string" ? data.error : data.error.message || fallback;
}

/**
 * 把比例映射成上游 size 字符串。
 *
 * 【2026-09-13 修复】原先直接写 `input.ratio === "9:16" ? ... : input.ratio === "16:9" ? ... : "1024x1024"`，
 * "auto" 会掉进最后那个 else 分支被静默变成方图 —— 这是 auto 的第 8 个出口，
 * 且全程零报错。必须先经 resolveImageRatio 收口。
 */
function resolveNanoBananaSize(ratio?: string) {
  const resolved = resolveImageRatio(ratio);
  if (resolved === "9:16") return "1024x1536";
  if (resolved === "16:9") return "1536x1024";
  return "1024x1024";
}

export class NanoBananaClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: { apiKey?: string; baseUrl?: string; model?: string } = {}) {
    this.apiKey = options.apiKey || process.env.NB_API_KEY || process.env.AI_IMAGE_API_KEY || "";
    this.baseUrl = options.baseUrl || process.env.NB_BASE_URL || process.env.AI_IMAGE_BASE_URL || "https://token.bkeel.com/v1";
    this.defaultModel = options.model || process.env.NB_MODEL || "gemini-3.1-flash-image";
  }

  async generate(input: NanoBananaGenerateInput) {
    if (!this.apiKey) throw new Error("Missing NB_API_KEY");

    const response = await fetch(getEndpoint(this.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model || this.defaultModel,
        prompt: input.prompt,
        n: input.count || 1,
        size: resolveNanoBananaSize(input.ratio),
      }),
    });

    const text = await response.text();
    let data: ProviderImageResponse = {};
    try {
      data = JSON.parse(text) as ProviderImageResponse;
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(getErrorMessage(data, text || `Nano Banana provider returned ${response.status}`));
    }

    return data;
  }
}
