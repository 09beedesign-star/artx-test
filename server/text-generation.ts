type ChatRole = "system" | "user" | "assistant";

export type TextMessage = {
  role: ChatRole;
  content: string;
};

type TextGenerateInput = {
  prompt?: string;
  messages?: TextMessage[];
  model?: string;
  module?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  error?: { message?: string };
};

function getChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/v1") ? "" : "/v1"}/chat/completions`;
}

function getProviderConfig() {
  const apiKey = process.env.AI_TEXT_API_KEY || process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_TEXT_BASE_URL || process.env.AI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.AI_TEXT_MODEL || "gpt-4o";

  return { apiKey, baseUrl, model };
}

function buildMessages(input: TextGenerateInput): TextMessage[] {
  const messages = input.messages?.length
    ? input.messages
    : [{ role: "user" as const, content: input.prompt || "" }];

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
    ...messages,
  ];
}

export async function generateText(input: TextGenerateInput): Promise<{ text: string; model: string }> {
  const messages = buildMessages(input);
  const hasContent = messages.some((message) => message.content.trim());
  if (!hasContent) {
    throw new Error("Missing prompt");
  }

  const { apiKey, baseUrl, model } = getProviderConfig();
  if (!apiKey) {
    throw new Error("Missing AI_TEXT_API_KEY");
  }

  const imageOnlyModels = new Set(["gpt-image-2", "flux-pro", "midjourney-v6", "sora"]);
  const selectedModel = input.model && !imageOnlyModels.has(input.model) ? input.model : model;
  const response = await fetch(getChatEndpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      temperature: 0.7,
    }),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as ChatCompletionResponse) : {};

  if (!response.ok) {
    throw new Error(data.error?.message || `Text provider returned ${response.status}`);
  }

  const output = data.choices?.[0]?.message?.content || data.output_text || "";
  if (!output.trim()) {
    throw new Error("Text provider returned no content");
  }

  return { text: output, model: selectedModel };
}
