type ChatRole = "system" | "user" | "assistant";

export type TextMessage = {
  role: ChatRole;
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type TextGenerateInput = {
  prompt?: string;
  messages?: TextMessage[];
  images?: Array<{ src: string; title?: string }>;
  model?: string;
  module?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  error?: { message?: string };
};

type ResponsesApiResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string; code?: string };
};

function safeParseJson<T>(raw: string): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/chat/completions`;
}

function getResponsesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/responses`;
}

function getProviderConfig() {
  const textApiKey = process.env.AI_TEXT_API_KEY_OVERRIDE || process.env.AI_TEXT_API_KEY;
  if (textApiKey) {
    return {
      apiKey: textApiKey,
      baseUrl: process.env.AI_TEXT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com",
      model: process.env.AI_TEXT_MODEL || "gpt-4o",
    };
  }

  const imageApiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  return {
    apiKey: imageApiKey,
    baseUrl: process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com",
    model: process.env.AI_IMAGE_MODEL || process.env.AI_TEXT_MODEL || "gpt-4o",
  };
}

const supportedTextModels = new Set([
  "gpt-4o",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
]);

function flattenMessageContent(content: TextMessage["content"]): string {
  if (typeof content === "string") return content;

  return content
    .map((item) => {
      if (item.type === "text") return item.text;
      if (item.type === "image_url") return `[image] ${item.image_url.url}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractResponsesText(data: ResponsesApiResponse) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

async function callResponsesApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: TextMessage[],
): Promise<string> {
  const input = messages.map((message) => ({
    role: message.role,
    content: flattenMessageContent(message.content),
  }));

  const response = await fetch(getResponsesEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
    }),
  });

  const text = await response.text();
  const data = safeParseJson<ResponsesApiResponse>(text) || {};

  if (!response.ok) {
    throw new Error(data.error?.message || `Responses provider returned ${response.status}`);
  }

  return extractResponsesText(data);
}

function buildMessages(input: TextGenerateInput): TextMessage[] {
  const userContent = input.images?.length
    ? [
        { type: "text" as const, text: input.prompt || "请理解这些图片并给出创作建议。" },
        ...input.images.map((image) => ({
          type: "image_url" as const,
          image_url: { url: image.src },
        })),
      ]
    : input.prompt || "";
  const messages = input.messages?.length
    ? input.messages
    : [{ role: "user" as const, content: userContent }];
  const imageContext: TextMessage[] = input.messages?.length && input.images?.length
    ? [{
        role: "user",
        content: [
          { type: "text", text: "以下是当前引用/选中的视觉素材，请结合它们理解用户意图。" },
          ...input.images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: image.src },
          })),
        ],
      }]
    : [];

  return [
    {
      role: "system",
      content: [
        "你是 artx 视觉创作工具内置的大语言模型助手。",
        "用简洁、可执行的中文回复。",
        "当用户要求生成视觉内容时，优先给出可直接用于生图或画布操作的提示词、步骤和结构化建议。",
      ].join("\n"),
    },
    {
      role: "system",
      content: `当前能力模块：${input.module || "general"}`,
    },
    ...imageContext,
    ...messages,
  ];
}

export async function generateText(input: TextGenerateInput): Promise<{ text: string; model: string }> {
  const messages = buildMessages(input);
  const hasContent = messages.some((message) => {
    if (typeof message.content === "string") return message.content.trim();
    return message.content.length > 0;
  });
  if (!hasContent) {
    throw new Error("Missing prompt");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_TEXT_API_KEY");
  }

  const selectedModel = input.model && supportedTextModels.has(input.model) ? input.model : model;
  const fallbackModels = ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"].filter((name, index, list) => {
    return name !== selectedModel && list.indexOf(name) === index;
  });
  const attempts = [selectedModel, ...fallbackModels];

  let lastError: Error | null = null;
  for (const candidateModel of attempts) {
    try {
      const response = await fetch(getChatEndpoint(baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: candidateModel,
          messages,
          temperature: 0.7,
        }),
      });

      const text = await response.text();
      const data = safeParseJson<ChatCompletionResponse>(text);

      if (!response.ok) {
        throw new Error(data?.error?.message || `Text provider returned ${response.status}`);
      }

      const output = data?.choices?.[0]?.message?.content || data?.output_text || "";
      if (output.trim()) {
        return { text: output, model: candidateModel };
      }

      const responsesText = await callResponsesApi(baseUrl, apiKey, candidateModel, messages);
      if (responsesText) {
        return { text: responsesText, model: candidateModel };
      }

      throw new Error("Text provider returned no content");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Text provider returned no content");
}
