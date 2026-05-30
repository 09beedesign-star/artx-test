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
  task_id?: string;
  status?: string;
  message?: string;
  images?: Array<{ b64_json?: string; url?: string }>;
  data?: Array<{ b64_json?: string; url?: string }>;
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type AsyncImageTaskResponse = {
  data?: {
    status?: string;
    error?: string;
    result?: ImageGenerationResponse;
  };
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

function toAbsoluteUrl(url: string, baseUrl: string) {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;

  const normalized = baseUrl.replace(/\/+$/, "");
  if (url.startsWith("/")) {
    return normalized.endsWith("/v1") && url.startsWith("/v1/")
      ? `${normalized.slice(0, -3)}${url}`
      : `${normalized}${url}`;
  }
  return `${normalized}/${url.replace(/^\/+/, "")}`;
}

function extractChoiceImages(providerData: ImageGenerationResponse, baseUrl: string) {
  const content = providerData.choices?.[0]?.message?.content || "";
  const matches = [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  return matches.map((match) => ({
    src: toAbsoluteUrl(match[1], baseUrl),
  }));
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

async function pollAsyncImageTask(taskId: string, apiKey: string, baseUrl: string): Promise<ImageGenerationResponse> {
  const normalized = baseUrl.replace(/\/+$/, "");
  const endpoint = `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/async-images/${taskId}`;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as AsyncImageTaskResponse) : {};
    const task = data.data;
    const status = task?.status;

    if (!response.ok) {
      throw new Error(data.error?.message || `Image polling returned ${response.status}`);
    }

    if (status === "failed") {
      throw new Error(task?.error || "Image generation failed");
    }

    if ((status === "succeeded" || status === "completed_without_image") && task?.result) {
      return task.result;
    }

    if (status && status !== "queued" && status !== "processing") {
      throw new Error(`Unexpected image task status: ${status}`);
    }
  }

  throw new Error("Image generation timed out");
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

  if (providerData.task_id) {
    providerData = await pollAsyncImageTask(providerData.task_id, apiKey, baseUrl);
  }

  const items = providerData.data || providerData.images || [];
  const images = items
    .map((item) => {
      const src = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url;
      return src ? { src, width: ratio.width, height: ratio.height } : null;
    })
    .filter((item): item is GeneratedImage => Boolean(item));

  if (images.length === 0) {
    const choiceImages = extractChoiceImages(providerData, baseUrl).map((item) => ({
      ...item,
      width: ratio.width,
      height: ratio.height,
    }));
    images.push(...choiceImages);
  }

  if (images.length === 0) {
    throw new Error("Image provider returned no images");
  }

  return { images };
}
