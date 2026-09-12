import {
  DEFAULT_TEXT_MODEL,
  SUPPORTED_TEXT_MODEL_IDS,
  TEXT_MODEL_FALLBACK_IDS,
  isClaudeTextModelId,
} from "../shared/text-models";

type ChatRole = "system" | "user" | "assistant";

export type TextMessage = {
  role: ChatRole;
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  /**
   * 【2026-09-11 新增】本条历史消息自带的图片。
   *
   * 与顶层 `images` 的区别：顶层那批是**当前轮**引用的素材，
   * 会被统一放在历史之前；而这里的图属于**特定某一轮**，
   * 必须就地展开在该条消息里，模型才分得清
   * 「第一轮生成的图」和「第三轮生成的图」。
   */
  images?: Array<{ src: string; title?: string }>;
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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string };
};

type ProviderTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
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
      model: process.env.AI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    };
  }

  const imageApiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  return {
    apiKey: imageApiKey,
    baseUrl: process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com",
    // 注意：这里刻意不再回落到 AI_IMAGE_MODEL。
    // AI_IMAGE_MODEL 是图片生成模型（og-image2-medium / gpt-image-2 等），
    // 把它当文本模型发给 /chat/completions 会直接 400。
    model: process.env.AI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
  };
}

const supportedTextModels = new Set<string>(SUPPORTED_TEXT_MODEL_IDS);

/**
 * 是否允许给该模型下发 temperature。
 *
 * 中转站的 claude 系列会对 temperature 直接返回 400：
 *   {"error":{"message":"`temperature` is deprecated for this model."}}
 *
 * 这个失败极其隐蔽：generateText 的降级链会静默吞掉 400，
 * 一路退到 gpt-5.5 并正常返回文案。表面上「功能没坏」，
 * 实际上首选模型 100% 失效，全站文本能力仍然跑在 GPT 上，
 * 而且每次请求都要多付两次无效往返（实测 +4s）。
 * 2026-09-10 首次切换 claude-opus-5 时就是这样被瞒过去的。
 */
function supportsTemperature(model: string) {
  return !isClaudeTextModelId(model);
}

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

function tokenUsage(input?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number }): ProviderTokenUsage | undefined {
  const promptTokens = input?.prompt_tokens ?? input?.input_tokens;
  const completionTokens = input?.completion_tokens ?? input?.output_tokens;
  if (!Number.isFinite(promptTokens) && !Number.isFinite(completionTokens)) return undefined;
  return {
    ...(Number.isFinite(promptTokens) ? { promptTokens: Math.max(0, Math.round(promptTokens!)) } : {}),
    ...(Number.isFinite(completionTokens) ? { completionTokens: Math.max(0, Math.round(completionTokens!)) } : {}),
  };
}

async function callResponsesApi(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: TextMessage[],
): Promise<{ text: string; usage?: ProviderTokenUsage }> {
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

  return { text: extractResponsesText(data), usage: tokenUsage(data.usage) };
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
  /**
   * 历史消息里自带的图要**就地展开**成多模态 content。
   *
   * 不这么做的话，`message.images` 会被整个忽略，
   * 「上一轮那张图」永远传不到模型面前。
   * 注意保留原 content 文本在最前面，图片跟在后面 ——
   * 顺序反了模型会把图当成新指令的主体。
   */
  const expandHistoryImages = (messageList: TextMessage[]): TextMessage[] =>
    messageList.map((message) => {
      if (!message.images?.length) return message;
      const baseText =
        typeof message.content === "string"
          ? message.content
          : message.content
              .map((part) => (part.type === "text" ? part.text : ""))
              .filter(Boolean)
              .join("\n");
      return {
        role: message.role,
        content: [
          { type: "text" as const, text: baseText },
          ...message.images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: image.src },
          })),
        ],
      };
    });

  const messages = input.messages?.length
    ? expandHistoryImages(input.messages)
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

export async function generateText(input: TextGenerateInput): Promise<{ text: string; model: string; usage?: ProviderTokenUsage }> {
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
  // 降级链只保留网关上确实存活的型号。
  // 历史写法是 ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]，而前两个已被网关下线，
  // 首选失败后要白白空转两次超时（实测总耗时 134s）才轮到能用的型号。
  const fallbackModels = (TEXT_MODEL_FALLBACK_IDS as readonly string[]).filter((name, index, list) => {
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
          // claude 系列不接受 temperature（见 supportsTemperature 注释），
          // 带上就是 400 + 静默降级回 GPT。
          ...(supportsTemperature(candidateModel) ? { temperature: 0.7 } : {}),
        }),
      });

      const text = await response.text();
      const data = safeParseJson<ChatCompletionResponse>(text);

      if (!response.ok) {
        throw new Error(data?.error?.message || `Text provider returned ${response.status}`);
      }

      const output = data?.choices?.[0]?.message?.content || data?.output_text || "";
      if (output.trim()) {
        return { text: output, model: candidateModel, usage: tokenUsage(data?.usage) };
      }

      const responsesResult = await callResponsesApi(baseUrl, apiKey, candidateModel, messages);
      if (responsesResult.text) {
        return { text: responsesResult.text, model: candidateModel, usage: responsesResult.usage };
      }

      throw new Error("Text provider returned no content");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Text provider returned no content");
}
