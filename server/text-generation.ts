import {
  FALLBACK_TEXT_MODEL,
  getTextModelDisplayName,
  resolveTextModelFallbackChain,
} from "../shared/text-models";

type ChatRole = "system" | "user" | "assistant";

export type TextMessage = {
  role: ChatRole;
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
  /**
   * 本条历史消息自带的图片。
   *
   * 与顶层 images 的区别：顶层那批是当前轮引用的素材，
   * 会统一放在历史之前；这里的图属于特定某一轮，必须就地展开，
   * 模型才分得清「第一轮生成的图」和「第三轮生成的图」。
   */
  images?: Array<{ src: string; title?: string }>;
};

type TextGenerateInput = {
  prompt?: string;
  messages?: TextMessage[];
  images?: Array<{ src: string; title?: string }>;
  /** 仅搭配 modelSelection: "manual" 时，合法当前文本型号才优先执行。 */
  model?: string;
  modelSelection?: "manual";
  module?: string;
  /** 服务端业务调用方验证最终正文；不合格时尝试下一候选，不降级成功标准。 */
  validateOutput?: (text: string) => boolean;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
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

function getProviderConfig() {
  const textApiKey =
    process.env.AI_TEXT_API_KEY_OVERRIDE || process.env.AI_TEXT_API_KEY;
  return {
    // Claude Opus 5.5 与 Luna 都复用原 Opus / Claude 的中转凭据（同一把 key）；
    // 不再借用图片 / OpenAI key，避免凭据错配时静默跑通。
    apiKey: textApiKey,
    // 三级候选严格共用原 Opus 文本地址；绝不把独立密钥送到图片或 OpenAI 配置的地址。
    baseUrl: process.env.AI_TEXT_BASE_URL || "https://token.bkeel.com/v1",
  };
}

function redactFailure(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const secrets = Object.entries(process.env)
    .filter(
      ([name, value]) =>
        /(?:KEY|TOKEN|SECRET|PASSWORD)(?:_OVERRIDE)?$/i.test(name) && value
    )
    .flatMap(([, value]) => [
      value!,
      JSON.stringify(value!).slice(1, -1),
      encodeURIComponent(value!),
    ])
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets)
    message = message.split(secret).join("[REDACTED]");
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 400);
}

async function withTextRequestTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const configured = Number(process.env.AI_TEXT_CANDIDATE_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configured) && configured > 0
      ? Math.min(120_000, Math.max(1, Math.round(configured)))
      : 30_000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`文本请求超时（${timeoutMs}ms）`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    // 同一预算覆盖请求发出与响应体读取。
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function tokenUsage(input?: {
  prompt_tokens?: number;
  completion_tokens?: number;
}): ProviderTokenUsage | undefined {
  const promptTokens = input?.prompt_tokens;
  const completionTokens = input?.completion_tokens;
  if (!Number.isFinite(promptTokens) && !Number.isFinite(completionTokens))
    return undefined;
  return {
    ...(Number.isFinite(promptTokens)
      ? { promptTokens: Math.max(0, Math.round(promptTokens!)) }
      : {}),
    ...(Number.isFinite(completionTokens)
      ? { completionTokens: Math.max(0, Math.round(completionTokens!)) }
      : {}),
  };
}

function latestUserText(input: TextGenerateInput): string {
  if (input.messages?.length) {
    const latest = [...input.messages].reverse().find(message => message.role === "user");
    if (!latest) return "";
    return typeof latest.content === "string"
      ? latest.content
      : latest.content.filter(part => part.type === "text").map(part => part.text).join("\n");
  }
  return input.prompt || "";
}

/** 只收口直接身份问句，不把引用、翻译、写人物简介等业务请求截成模型名。 */
function isDirectIdentityQuestion(input: TextGenerateInput): boolean {
  if (input.validateOutput) return false;
  const module = input.module || "general";
  if (!/^(?:general|chat|.*-chat|chat-node|workspace-chat-generation|帮助与反馈|帮助弹窗)$/.test(module)) return false;
  const text = latestUserText(input).trim().toLowerCase()
    .replace(/[\s，,。.!！?？、:：]/g, "");
  return /^(?:你好|您好|hi|hello)?(?:请|请问|麻烦)?(?:你能|你可以|能不能)?(?:你是谁|你到底是谁|你是什么(?:模型|大模型|大语言模型|语言模型|ai|智能体|助手)|你(?:叫|的名字是)什么|你的(?:模型名称|模型|名字|名称)(?:是什么|是啥)|你(?:用的|使用的)?是(?:什么|哪个|哪种)(?:模型|大模型|大语言模型)|你是(?:kiro|hero|claude|gpt|deepseek)(?:吗|么)|介绍(?:一下)?(?:你自己|自己)|自我介绍(?:一下)?|做(?:个|一个)?自我介绍|介绍一下你自己|whoareyou|whatisyourname|whatmodelareyou|introduceyourself)(?:一下|可以吗|好吗|吗|呢|呀|啊)?$/.test(text);
}

function buildMessages(input: TextGenerateInput, model: string): TextMessage[] {
  const userContent = input.images?.length
    ? [
        {
          type: "text" as const,
          text: input.prompt || "请理解这些图片并给出创作建议。",
        },
        ...input.images.map(image => ({
          type: "image_url" as const,
          image_url: { url: image.src },
        })),
      ]
    : input.prompt || "";

  const expandHistoryImages = (messageList: TextMessage[]): TextMessage[] =>
    messageList.map(message => {
      if (!message.images?.length) return message;
      const baseContent =
        typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content;
      return {
        role: message.role,
        content: [
          ...baseContent,
          ...message.images.map(image => ({
            type: "image_url" as const,
            image_url: { url: image.src },
          })),
        ],
      };
    });

  const messages = input.messages?.length
    ? expandHistoryImages(input.messages)
    : [{ role: "user" as const, content: userContent }];
  const imageContext: TextMessage[] =
    input.messages?.length && input.images?.length
      ? [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "以下是当前引用/选中的视觉素材，请结合它们理解用户意图。",
              },
              ...input.images.map(image => ({
                type: "image_url" as const,
                image_url: { url: image.src },
              })),
            ],
          },
        ]
      : [];

  return [
    {
      role: "system",
      content: [
        "你在 artx 视觉创作工具中提供大语言模型能力。",
        `本次实际执行的模型名称是：${getTextModelDisplayName(model)}。身份以此名称为准，不沿用上游服务或历史消息中的其他助手、智能体身份。`,
        `当用户询问你是谁、模型名称或要求你自我介绍时，只回复“${getTextModelDisplayName(model)}”这一个名称，不加“我是”、能力说明、问候、厂商说明或其他文字。`,
        "普通任务直接回答任务，不主动自我介绍；引用、翻译、OCR、人物介绍或结构化业务任务仍按其任务要求完成。",
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

/**
 * 全站唯一的语言 / 多模态理解出口。
 *
 * 默认降级链：Claude Opus 5.5 → GPT Luna → DeepSeek V4 Flash。
 * 显式 manual + 当前合法文本型号仅调整本次请求首选，其余候选保持默认顺序。
 * Claude 与 Luna 共用文本 baseURL 和文本 key；DeepSeek 用独立 key、同 baseURL。
 * 当前及历史图片完整复用同一份 messages，不把视觉请求降成纯文本。
 * 单独 input.model / AI_TEXT_MODEL 不改序；每候选预算独立且最多三次请求。
 * 返回本次实际成功的型号，不记忆跨请求的选择或降级结果。
 */
export async function generateText(
  input: TextGenerateInput
): Promise<{ text: string; model: string; usage?: ProviderTokenUsage }> {
  const hasInputContent = Boolean(
    input.prompt?.trim() || input.messages?.length || input.images?.length
  );
  if (!hasInputContent) {
    throw new Error("Missing prompt");
  }

  const identityQuestion = isDirectIdentityQuestion(input);
  const { apiKey, baseUrl } = getProviderConfig();
  // Claude 与 Luna 共用文本 key；DeepSeek 用独立 key。
  const keyForModel = (model: string) =>
    model === FALLBACK_TEXT_MODEL
      ? { apiKey: process.env.AI_DEEPSEEK_API_KEY, keyName: "AI_DEEPSEEK_API_KEY" }
      : { apiKey, keyName: "AI_TEXT_API_KEY" };
  const candidates = resolveTextModelFallbackChain(input.model, input.modelSelection).map(model => ({
    model,
    ...keyForModel(model),
  }));
  const failures: string[] = [];

  for (const candidate of candidates) {
    const { model, apiKey } = candidate;
    if (!apiKey) {
      // 缺凭据也记录对应候选的失败，手动改序后仍可完整诊断；不借用其他通道凭据。
      failures.push(`${model}: Missing ${candidate.keyName}`);
      continue;
    }
    try {
      return await withTextRequestTimeout(async signal => {
        const response = await fetch(getChatEndpoint(baseUrl), {
          signal,
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: buildMessages(input, model),
            temperature: 0.7,
          }),
        });
        signal.throwIfAborted();
        const text = await response.text();
        signal.throwIfAborted();
        const data = safeParseJson<ChatCompletionResponse>(text);

        if (!response.ok) {
          const detail =
            typeof data?.error?.message === "string"
              ? `: ${redactFailure(data.error.message)}`
              : "";
          throw new Error(`Chat HTTP ${response.status}${detail}`);
        }

        const output =
          data?.choices?.[0]?.message?.content || data?.output_text || "";
        if (typeof output !== "string" || !output.trim()) {
          throw new Error("文本模型未返回正文");
        }
        if (input.validateOutput && !input.validateOutput(output)) {
          throw new Error("文本模型返回内容未通过业务结构校验");
        }
        return {
          text: identityQuestion ? getTextModelDisplayName(model) : output,
          model,
          usage: tokenUsage(data?.usage),
        };
      });
    } catch (error) {
      failures.push(`${model}: ${redactFailure(error)}`);
    }
  }
  throw new Error(`文本请求失败：${failures.join("；")}`);
}
