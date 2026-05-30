type ImageGenerateInput = {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
};

type GeneratedImage = {
  src: string;
  width: number;
  height: number;
};

type ImageGenerationResponse = {
  images?: Array<{ b64_json?: string; url?: string }>;
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

const ratioToSize: Record<string, { size: string; width: number; height: number }> = {
  "1:1": { size: "1024x1024", width: 1024, height: 1024 },
  "4:5": { size: "1024x1536", width: 1024, height: 1280 },
  "16:9": { size: "1536x1024", width: 1536, height: 864 },
};

function getImagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/images/generations`;
}

function getProviderConfig() {
  const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.AI_IMAGE_MODEL || "gpt-image-2";

  return { apiKey, baseUrl, model };
}

function buildPrompt(input: ImageGenerateInput) {
  const stylePrefix = input.style ? `风格：${input.style}\n` : "";
  return `${stylePrefix}${input.prompt.trim()}`;
}

async function callImageProvider(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  const response = await fetch(getImagesEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as ImageGenerationResponse) : {};

  if (!response.ok) {
    throw new Error(data.error?.message || `Image provider returned ${response.status}`);
  }

  return data;
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
  const requestBody = {
    model: input.model || model,
    prompt: buildPrompt(input),
    n: count,
    size: ratio.size,
    response_format: "b64_json",
  };

  let providerData: ImageGenerationResponse;
  try {
    providerData = await callImageProvider(requestBody, apiKey, baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("response_format")) throw error;
    const { response_format: _responseFormat, ...fallbackBody } = requestBody;
    providerData = await callImageProvider(fallbackBody, apiKey, baseUrl);
  }

  const items = providerData.data || providerData.images || [];
  const images = items
    .map((item) => {
      const src = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url;
      return src ? { src, width: ratio.width, height: ratio.height } : null;
    })
    .filter((item): item is GeneratedImage => Boolean(item));

  if (images.length === 0) {
    throw new Error("Image provider returned no images");
  }

  return { images };
}
