import { callLLM, generateImages, type GeneratedImageResult } from "@/lib/ai";

export type CreativeIntentMode = "text" | "image" | "reference_search";

export type CreativeIntentDecision = {
  mode: CreativeIntentMode;
  reply?: string;
  imagePrompt?: string;
  searchQuery?: string;
  followUp?: string;
  reason?: string;
  confidence?: "high" | "medium" | "low";
};

type RouteCreativeIntentInput = {
  module: string;
  prompt: string;
  model?: string;
  referencedAssets?: Array<{ title?: string; src: string }>;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  preferImageWhenReferences?: boolean;
  allowReferenceSearch?: boolean;
};

const DIRECT_IMAGE_PATTERN =
  /海报|图片|图像|视觉|封面|主图|画一张|画个|生成一张|生成图片|做一张|做个|插画|产品图|详情页|KV|banner|logo|延展|扩图|出图|渲染|配图|主视觉|宣传图|广告图|样机|排版图/i;

const DIRECT_TEXT_PATTERN =
  /分析|解释|优化|建议|拆解|怎么做|为什么|回答|文案|改写|总结|思路|策略|方案|提炼|翻译|校对|润色/i;

function extractJsonObject(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Partial<CreativeIntentDecision>;
  } catch {
    return null;
  }
}

export function inferCreativeIntentDecision(raw: string, fallbackPrompt: string): CreativeIntentDecision {
  const parsed = extractJsonObject(raw);
  if (parsed?.mode === "reference_search") {
    return {
      mode: "reference_search",
      searchQuery: parsed.searchQuery?.trim() || fallbackPrompt,
      followUp: parsed.followUp?.trim(),
      reason: parsed.reason,
      confidence: parsed.confidence,
    };
  }
  if (parsed?.mode === "image") {
    return {
      mode: "image",
      imagePrompt: parsed.imagePrompt?.trim() || fallbackPrompt,
      reason: parsed.reason,
      confidence: parsed.confidence,
    };
  }
  if (parsed?.mode === "text") {
    return {
      mode: "text",
      reply: parsed.reply?.trim() || raw.trim(),
      reason: parsed.reason,
      confidence: parsed.confidence,
    };
  }
  return { mode: "text", reply: raw.trim() };
}

export async function routeCreativeIntent({
  module,
  prompt,
  model = "gpt-4o",
  referencedAssets = [],
  recentMessages = [],
  preferImageWhenReferences = true,
  allowReferenceSearch = false,
}: RouteCreativeIntentInput): Promise<CreativeIntentDecision> {
  const trimmedPrompt = prompt.trim();
  const hasReferences = referencedAssets.length > 0;
  const maybeBroadNoun =
    allowReferenceSearch &&
    !hasReferences &&
    trimmedPrompt.length > 0 &&
    trimmedPrompt.length <= 18 &&
    !/[，。！？,.!?]/.test(trimmedPrompt) &&
    !/怎么|如何|分析|解释|优化|生成|做|画|海报|图片|图像|视觉|封面|主图|logo|插画|配色|排版|文案/i.test(trimmedPrompt);

  if (maybeBroadNoun) {
    return {
      mode: "reference_search",
      searchQuery: trimmedPrompt,
      followUp: `我先帮你抓取一组「${trimmedPrompt}」参考图，你先选几张最接近你想法的方向，我再继续追问或直接帮你生成。`,
      reason: "命中宽泛名词参考搜索",
      confidence: "high",
    };
  }

  if (trimmedPrompt && DIRECT_IMAGE_PATTERN.test(trimmedPrompt)) {
    return {
      mode: "image",
      imagePrompt: trimmedPrompt,
      reason: "命中明确生图表达",
      confidence: "high",
    };
  }

  if (trimmedPrompt && DIRECT_TEXT_PATTERN.test(trimmedPrompt) && !DIRECT_IMAGE_PATTERN.test(trimmedPrompt)) {
    return {
      mode: "text",
      reply: trimmedPrompt,
      reason: "命中明确文本诉求",
      confidence: "high",
    };
  }

  if (hasReferences && preferImageWhenReferences && !DIRECT_TEXT_PATTERN.test(trimmedPrompt)) {
    return {
      mode: "image",
      imagePrompt: trimmedPrompt || "请基于引用素材生成新的视觉方案。",
      reason: "存在引用素材，优先进入视觉生成",
      confidence: "high",
    };
  }

  const refLines = referencedAssets.map((asset, index) => `${index + 1}. ${asset.title || "未命名素材"}`);
  const historyLines = recentMessages.slice(-6).map((item) => `${item.role === "user" ? "用户" : "助手"}: ${item.content}`);
  const result = await callLLM({
    module,
    model,
    images: referencedAssets.map((asset) => ({ src: asset.src, title: asset.title })),
    prompt: [
      "你是 artx 的统一意图路由器。",
      "你的目标是像成熟的创意画布产品一样，精准判断当前请求更适合文字回复还是直接生成图片。",
      "只返回 JSON，不要 Markdown，不要额外解释。",
      "JSON 格式：{\"mode\":\"text|image\",\"reply\":\"文字回复内容\",\"imagePrompt\":\"适合图片模型的提示词\",\"reason\":\"一句话原因\",\"confidence\":\"high|medium|low\"}",
      allowReferenceSearch
        ? "当用户只提到一个宽泛对象、名词、品类、角色、题材，而没有明确风格与构图时，优先返回 reference_search，并提供 searchQuery 与 followUp。"
        : "",
      allowReferenceSearch
        ? "reference_search JSON 格式补充：{\"mode\":\"reference_search\",\"searchQuery\":\"用于抓参考图的关键词\",\"followUp\":\"让用户先选参考图再继续描述的引导语\"}"
        : "",
      "当用户想要结果图、视觉物料、海报、封面、主视觉、扩图、参考图延展、品牌图、产品图时，优先选择 image。",
      "当用户想要解释、分析、建议、优化、拆解、问答时，优先选择 text。",
      "如果有参考图片，且用户在继续创作、继续做图、延展、变体、改图，优先选择 image。",
      refLines.length ? `引用素材：\n${refLines.join("\n")}` : "",
      historyLines.length ? `最近对话：\n${historyLines.join("\n")}` : "",
      `当前用户输入：${trimmedPrompt || "请基于当前上下文继续处理。"}`,
    ].filter(Boolean).join("\n"),
  });

  return inferCreativeIntentDecision(result.text, trimmedPrompt || "请基于当前上下文继续创作。");
}

export async function generateIntentImages({
  prompt,
  model = "auto",
  ratio = "1:1",
  count = 1,
  style = "智能路由",
  referencesEnabled = false,
}: {
  prompt: string;
  model?: string;
  ratio?: string;
  count?: number;
  style?: string;
  referencesEnabled?: boolean;
}): Promise<GeneratedImageResult[]> {
  const result = await generateImages({
    prompt,
    model,
    ratio,
    count,
    style,
    referencesEnabled,
  });
  return result.images;
}
