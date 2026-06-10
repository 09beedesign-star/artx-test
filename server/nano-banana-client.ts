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
        size: input.ratio === "9:16" ? "1024x1536" : input.ratio === "16:9" ? "1536x1024" : "1024x1024",
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
