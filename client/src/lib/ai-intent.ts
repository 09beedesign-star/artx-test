import { callLLM, generateImages, type GeneratedImageResult } from "@/lib/ai";
import { DEFAULT_IMAGE_MODEL_ID } from "../../../shared/image-models";
import { DEFAULT_TEXT_MODEL } from "../../../shared/text-models";

export type CreativeIntentMode = "text" | "image" | "reference_search";

export type CreativeIntentDecision = {
  mode: CreativeIntentMode;
  reply?: string;
  imagePrompt?: string;
  searchQuery?: string;
  followUp?: string;
  reason?: string;
  confidence?: "high" | "medium" | "low";
  /**
   * 多图融合时，哪一张引用图应当作为「被改造的底图」，从 1 开始计数。
   *
   * 为什么必须由大模型来定：调用方原先写死取**最后一张**当画布
   * （`assistantImages[length - 1]`）。可用户的心智是按语义分的，不是按顺序分的——
   * 「让[脚]穿上[红鞋]」里脚是底图、鞋是素材，但脚恰好排在第一张，
   * 于是鞋被当成了画布，产出一双凭空捏造的鞋，脚反而被降级成参考素材。
   *
   * 只有真正看过画面、也读过文案的模型才分得清谁是主体、谁是要贴上去的东西，
   * 所以这里让它顺带把结论带回来。缺省/越界时调用方回退到原来的「最后一张」。
   */
  targetImageIndex?: number;
};

/**
 * 一条可带图的对话历史。
 *
 * `contextImages` 是这轮真正涉及的画面（生成结果 / 选中的参考图），
 * `contextImagePrompt` 是生图实际用的完整提示词（可能被大模型改写过，
 * 与用户原话不同）—— 后续轮次要在上一版基础上追改，必须知道上一版画了什么。
 */
export type AssistantHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  contextImages?: Array<{ src: string; title?: string }>;
  contextImagePrompt?: string;
};

/**
 * 历史里最多回传几张图。
 *
 * 取 3 是个折中：既能支撑「这张再暗一点」「换回上一张的构图」这类追改，
 * 又不至于每轮都把八轮的图全塞进请求，拖慢响应并推高费用。
 * 超出的图不是丢掉，而是降级成文字描述（见 buildAssistantContext）。
 */
export const MAX_CONTEXT_IMAGES = 3;

/** 历史最多回溯几条消息。 */
export const MAX_CONTEXT_MESSAGES = 8;

/**
 * 把画布助手的消息列表转换成「带图的对话上下文」。
 *
 * 【为什么需要它】
 * 用户反馈：「每个循环问答只有一问一答，我需要关联上下文」。
 * 根因有三处，缺一不可：
 *   1. 出图成功后只写回一句「已根据你的请求生成图片：xxx」，**图没进历史**；
 *   2. 联网搜到的参考图只存在 `referenceOptions` 字段里，**从不进上下文**；
 *   3. `LLMMessage.content` 原本只能是纯字符串，历史**根本装不下图**。
 *
 * 于是模型每轮只能看见几句干巴巴的文字，
 * 用户说「这张再暗一点」它完全不知道指谁。
 *
 * 返回的消息按时间正序，最近的图优先保留。
 */
export function buildAssistantContext(
  messages: AssistantHistoryMessage[],
  options: { maxMessages?: number; maxImages?: number } = {}
): Array<{
  role: "user" | "assistant";
  content: string;
  images?: Array<{ src: string; title?: string }>;
}> {
  const maxMessages = options.maxMessages ?? MAX_CONTEXT_MESSAGES;
  const maxImages = options.maxImages ?? MAX_CONTEXT_IMAGES;
  const recent = messages.slice(-maxMessages);

  /**
   * 先从**最近**的消息往回数，决定哪些图有配额。
   *
   * 必须倒着数：正着数会把配额花在最老的图上，
   * 而用户说「这张」时指的几乎总是最近那张。
   */
  const imageQuota = new Map<number, number>();
  let remaining = maxImages;
  for (let i = recent.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const count = recent[i].contextImages?.length || 0;
    if (count === 0) continue;
    const granted = Math.min(count, remaining);
    imageQuota.set(i, granted);
    remaining -= granted;
  }

  return recent.map((message, index) => {
    const allImages = message.contextImages || [];
    const granted = imageQuota.get(index) || 0;
    // 配额从每条消息的**末尾**取：同一轮里生成多张时，靠后的通常是最终选择。
    const kept = granted > 0 ? allImages.slice(-granted) : [];
    const dropped = allImages.length - kept.length;

    const notes: string[] = [];
    if (message.contextImagePrompt) {
      notes.push(`（该图使用的提示词：${message.contextImagePrompt}）`);
    }
    // 超额的图降级成文字，让模型至少"知道存在过"，而不是凭空消失。
    if (dropped > 0) {
      notes.push(`（此轮另有 ${dropped} 张图未随上下文回传）`);
    }

    const content = [message.content, ...notes].filter(Boolean).join("\n");
    return kept.length > 0
      ? { role: message.role, content, images: kept }
      : { role: message.role, content };
  });
}

type RouteCreativeIntentInput = {
  module: string;
  prompt: string;
  model?: string;
  referencedAssets?: Array<{ title?: string; src: string }>;
  recentMessages?: Array<{
    role: "user" | "assistant";
    content: string;
    images?: Array<{ src: string; title?: string }>;
  }>;
  preferImageWhenReferences?: boolean;
  allowReferenceSearch?: boolean;
  /**
   * 强制交给大模型判断，跳过所有正则短路。
   *
   * 背景：图文混排提示词（引用图标签 + 文案按前后顺序穿插）光靠正则判不准。
   * 默认链路里 `preferImageWhenReferences` 会在「有引用图」时直接 early return
   * mode:"image"，**根本不调用 LLM** —— 这样图和文字之间的关系
   * （到底是「照着这张图画一张新的」还是「分析这张图里的问题」）完全没被理解过。
   *
   * 打开这个开关后，正则只用来做提示，最终由 claude-opus-5 读图 + 读文案后裁决，
   * 并顺带把整段图文混排改写成图片模型能吃的 imagePrompt。
   */
  forceModelDecision?: boolean;
};

/**
 * 明确的「生图」表达。
 *
 * 【2026-09-11 重写】原来这条正则匹配的是**名词**（海报|图片|图像|视觉|logo|banner…），
 * 于是任何**谈论**视觉话题的句子都被判成要出图。实测 12 句普通提问有 10 句被误判：
 *   「这张图片是什么意思」→ 命中「图片」→ 出图（用户只是提问）
 *   「什么是 logo 设计的基本原则」→ 命中「logo」→ 出图
 *   「banner 一般用什么尺寸」→ 命中「banner」→ 出图
 *   「图片模型怎么收费」→ 命中「图片」→ 出图
 *
 * 现在只匹配**动词 + 宾语**的祈使结构，即「用户要求产出一个图形物料」。
 * 光出现名词不再触发，必须有明确的创作动词。
 */
const DIRECT_IMAGE_PATTERN = new RegExp(
  [
    // 创作动词 +（量词）+（修饰语）+ 视觉名词：画一张海报 / 生成产品图 / 做个 banner
    "(?:画|绘制|生成|制作|做|出|渲染|设计|来|帮我画|帮我生成|帮我做)" +
      "\\s*(?:一)?[张个幅份组套页]?\\s*[^，,。.!！?？]{0,12}?" +
      "(?:海报|图片|图像|封面|主图|插画|产品图|详情页|KV|banner|logo|主视觉|宣传图|广告图|样机|排版图|配图|头像|壁纸|图标|icon|贴纸|表情包|名片|传单|易拉宝|展架|长图)",
    // 视觉名词 + 生成动词后缀：海报生成 / 封面设计一下 / 主视觉画出来
    "(?:海报|封面|主图|插画|产品图|详情页|KV|banner|logo|主视觉|宣传图|广告图|样机|排版图|头像|壁纸|图标|贴纸|表情包)" +
      "\\s*[^，,。.!！?？]{0,6}?(?:生成|制作|设计一[下张个]|画出来|做出来)",
    // 图像操作类动词：这些词本身只用于操作图片，无歧义
    "扩图|抠图|去背景|换背景|重绘|局部重绘|图生图|文生图|放大重绘",
    // 改图祈使句：「把这张图的背景换成海边」「把图片调成暖色调」
    // 必须同时具备「把」+「图」+「换/改成」三要素，纯提问不会长成这样。
    "把(?:这|那)?[一张幅]{0,2}(?:图|图片|照片)[^，,。.!！?？]{0,10}?(?:换成|改成|替换成|变成|调成|换为|改为)",
    // 创作动词 + 量词且后面没有宾语：「帮我重新画一张」「再生成一张。」
    // 动词后直接收尾，不存在「在谈论」的可能，只可能是要图。
    "(?:重新|再|另|又)?(?:画|绘制|生成|制作|渲染)\\s*一[张个幅份组套页]\\s*(?:$|[，,。.!！?？])",
    // 「帮我画」「帮我绘制」本身就是无歧义的创作祈使
    "帮我(?:画|绘制)|画出来|画一下|绘制一下",
    // 「延展 / 出图 / 渲染」独立成词时仍视为生图诉求
    "(?:^|[^\\w])(?:延展|出图|渲染)(?:$|[^\\w])",
  ].join("|"),
  "i"
);

/**
 * 明确的「文字回复」表达。
 *
 * 【2026-09-11 扩充】原表只有「分析|解释|优化…」这类动词，
 * 而「是什么」「有几个」「多少钱」这种最典型的提问反倒不在列，
 * 只能靠 LLM 兜底 —— 可 LLM 又被前面的生图正则抢先了，于是必然误判。
 */
const DIRECT_TEXT_PATTERN = new RegExp(
  [
    // 原有的讨论型动词
    "分析|解释|优化|建议|拆解|怎么做|为什么|回答|文案|改写|总结|思路|策略|方案|提炼|翻译|校对|润色",
    // 疑问词：中文提问的最强信号
    "是什么|什么是|是啥|怎么样|如何|怎样|为何|哪些|哪个|哪一|多少|几个|几天|几种|几张|多大|多高|多长|多久|多重|好不好|对不对|行不行|能不能|可不可以|是否|有没有|要不要",
    // 讨论 / 咨询型名词
    "区别|差异|对比|比较|优缺点|利弊|原理|含义|意思|定义|概念|教程|步骤|流程|注意事项|怎么用|怎么办|怎么写|怎么算|收费|价格|多少钱|报价",
    // 句末问号：最直接的提问信号
    "[?？]\\s*$",
  ].join("|"),
  "i"
);

/**
 * 极简的「要一个具体物体的图」表达，如「画一只戴帽子的橘猫」。
 *
 * 【2026-09-11 收紧】原来是 `^…一(?:个|只|张|…).{1,24}$`，尾部完全不设限，
 * 于是「一个星期有几天」「一张 A4 纸有多大」「一个人如何提高审美」全被判成生图。
 *
 * 现在要求：必须带创作动词，且内容里不得出现谓语/疑问字
 * （有|是|能|会|要|该|吗|呢|？），因为「一X + 谓语」几乎必然是陈述句或疑问句，
 * 而不是画面描述。长度上限也从 24 收到 20。
 */
const SIMPLE_IMAGE_OBJECT_PATTERN =
  /^(?:请)?(?:帮我)?(?:输入|生成|画|做|来)\s*一(?:个|只|张|幅|位|件|款|辆|朵|棵|条|匹)[^有是能会要该吗呢？?]{1,20}$/i;

/**
 * 纯名词短语式的生图（无动词，如「一只戴礼帽的橘猫」）。
 *
 * 单独拆出来是因为它比带动词的情况危险得多 ——
 * 没有动词就没有「用户要我做事」的信号，全靠名词短语的形态来赌。
 * 所以这里卡得最死：不得含任何谓语动词、疑问字、标点。
 */
const NOUN_PHRASE_IMAGE_PATTERN =
  /^一(?:个|只|张|幅|位|件|款|辆|朵|棵|条|匹)[^，,。.!！?？有是能会要该吗呢几多少如何怎]{2,20}$/i;

const EXPLICIT_REFERENCE_SEARCH_PATTERN =
  /(找|搜|搜索|抓|抓取|收集|参考|素材|灵感|案例|样例|范例).{0,12}(参考图|参考图片|素材|灵感|案例|样例|范例)|(?:参考图|参考图片|素材|灵感|案例|样例|范例).{0,12}(找|搜|搜索|抓|抓取|收集|给我|帮我)/i;

const MODEL_SWITCH_REPLY_PATTERN =
  /切换.*模型|模型.*切换|选择.*模型|请选择.*模型|换.*模型|自主切换|手动.*切换|切到.*(生图|对话|图片)|改用.*模型/i;

function buildReferenceSearchQuery(prompt: string) {
  const cleaned = prompt
    .replace(/^(?:请|麻烦)?(?:帮我|给我|为我)?(?:找|搜|搜索|抓|抓取|收集)(?:一些|几张|一组|一下)?/i, "")
    .replace(/^(?:参考图|参考图片|素材|灵感|案例|样例|范例)\s*(?:关于|有关|围绕|针对)?\s*/i, "")
    .replace(/^(?:关于|有关|围绕|针对|参考)\s*/i, "")
    .replace(/[，,。.!！?？]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return prompt.trim();
  return /(参考图|参考图片|素材|灵感|案例|样例|范例)/i.test(cleaned)
    ? cleaned
    : `${cleaned} 参考图`;
}

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

/**
 * 清洗大模型回传的 targetImageIndex。
 *
 * 模型可能回 "2"（字符串）、2.0、0、-1 甚至 null。这里只接受 >=1 的整数，
 * 其余一律丢弃返回 undefined，让调用方走自己的兜底逻辑。
 * 上界不在这里校验：本函数看不到到底有几张引用图，越界判定交给调用方。
 */
function normalizeTargetImageIndex(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return undefined;
  const rounded = Math.round(parsed);
  return rounded >= 1 ? rounded : undefined;
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
      targetImageIndex: normalizeTargetImageIndex(parsed.targetImageIndex),
    };
  }
  if (parsed?.mode === "text") {
    const reply = parsed.reply?.trim() || raw.trim();
    if (MODEL_SWITCH_REPLY_PATTERN.test(reply)) {
      return {
        mode: DIRECT_IMAGE_PATTERN.test(fallbackPrompt) ? "image" : "text",
        reply: DIRECT_IMAGE_PATTERN.test(fallbackPrompt) ? undefined : fallbackPrompt,
        imagePrompt: DIRECT_IMAGE_PATTERN.test(fallbackPrompt) ? fallbackPrompt : undefined,
        reason: "拦截模型切换提示，继续自动路由",
        confidence: "medium",
      };
    }
    return {
      mode: "text",
      reply,
      reason: parsed.reason,
      confidence: parsed.confidence,
    };
  }
  if (MODEL_SWITCH_REPLY_PATTERN.test(raw)) {
    return {
      mode: DIRECT_IMAGE_PATTERN.test(fallbackPrompt) ? "image" : "text",
      reply: DIRECT_IMAGE_PATTERN.test(fallbackPrompt) ? undefined : fallbackPrompt,
      imagePrompt: DIRECT_IMAGE_PATTERN.test(fallbackPrompt) ? fallbackPrompt : undefined,
      reason: "拦截模型切换提示，继续自动路由",
      confidence: "medium",
    };
  }
  return { mode: "text", reply: raw.trim() };
}

export async function routeCreativeIntent({
  module,
  prompt,
  model = DEFAULT_TEXT_MODEL,
  referencedAssets = [],
  recentMessages = [],
  preferImageWhenReferences = true,
  allowReferenceSearch = false,
  forceModelDecision = false,
}: RouteCreativeIntentInput): Promise<CreativeIntentDecision> {
  const trimmedPrompt = prompt.trim();
  const hasReferences = referencedAssets.length > 0;
  const wantsReferenceSearch =
    allowReferenceSearch &&
    !hasReferences &&
    trimmedPrompt.length > 0 &&
    EXPLICIT_REFERENCE_SEARCH_PATTERN.test(trimmedPrompt);

  // forceModelDecision 下跳过全部正则短路，直接落到底部的 LLM 判断。
  // 注意 reference_search 不在跳过之列：它是「去网上找图」，
  // 和「理解图文混排后出图」是两件事，用户明确要找参考图时仍应优先满足。
  if (forceModelDecision && !wantsReferenceSearch) {
    return routeCreativeIntentWithModel({
      module,
      model,
      trimmedPrompt,
      referencedAssets,
      recentMessages,
      allowReferenceSearch,
    });
  }

  if (wantsReferenceSearch) {
    const searchQuery = buildReferenceSearchQuery(trimmedPrompt);
    return {
      mode: "reference_search",
      searchQuery,
      followUp: `我先帮你从网上抓取一组「${searchQuery}」参考图，你先选几张最接近你想法的方向，我再继续追问或直接帮你生成。`,
      reason: "命中明确参考图搜索表达",
      confidence: "high",
    };
  }

  /**
   * 【2026-09-11 调整判定顺序】文本信号必须最先检查。
   *
   * 原顺序是「简单对象生图 → 明确生图 → 明确文本」，生图排在文本前面。
   * 于是「帮我分析一下这张海报有什么问题」同时命中两边时，
   * 先撞上生图分支直接 return，`!DIRECT_IMAGE_PATTERN` 那道保护根本执行不到。
   *
   * 现在改成文本优先：命中提问/讨论信号就直接走文字，
   * 除非句子里有**明确的创作祈使**（下面的 hasExplicitImageVerb）。
   * 这样「分析这张海报」走文字，「分析完帮我重新画一张海报」仍能出图。
   */
  const hasTextSignal = Boolean(trimmedPrompt) && DIRECT_TEXT_PATTERN.test(trimmedPrompt);
  const hasImageSignal = Boolean(trimmedPrompt) && DIRECT_IMAGE_PATTERN.test(trimmedPrompt);

  // 两边都命中 = 语义混合，正则已经无法可靠裁决，交给大模型读全句。
  if (hasTextSignal && hasImageSignal) {
    return routeCreativeIntentWithModel({
      module,
      model,
      trimmedPrompt,
      referencedAssets,
      recentMessages,
      allowReferenceSearch,
    });
  }

  // 只有文本信号 → 文字回复。
  if (hasTextSignal) {
    return {
      mode: "text",
      reply: trimmedPrompt,
      reason: "命中明确文本诉求",
      confidence: "high",
    };
  }

  // 只有生图信号 → 出图。
  if (hasImageSignal) {
    return {
      mode: "image",
      imagePrompt: trimmedPrompt,
      reason: "命中明确生图表达",
      confidence: "high",
    };
  }

  // 「画一只橘猫」这类带动词的极简生图。
  if (trimmedPrompt && SIMPLE_IMAGE_OBJECT_PATTERN.test(trimmedPrompt)) {
    return {
      mode: "image",
      imagePrompt: trimmedPrompt,
      reason: "命中简单对象生图表达",
      confidence: "high",
    };
  }

  // 「一只戴礼帽的橘猫」这类纯名词短语。
  if (trimmedPrompt && NOUN_PHRASE_IMAGE_PATTERN.test(trimmedPrompt)) {
    return {
      mode: "image",
      imagePrompt: trimmedPrompt,
      reason: "命中名词短语生图表达",
      confidence: "medium",
    };
  }

  /**
   * 有引用图时的默认行为。
   *
   * 【2026-09-11 改为交给大模型】原来这里只要有引用图且没命中文本正则，
   * 就无条件 early return mode:"image"，**完全不调用 LLM**。
   * 结果是用户贴张图问「这是什么风格」也直接给他重画一张。
   *
   * 现在改成交给大模型读图 + 读文案后裁决 ——
   * 它既能分清「照着这张画一张新的」和「分析这张图」，
   * 也能在多图时顺带指认底图。正则在这个场景下本来就不够用。
   */
  if (hasReferences && preferImageWhenReferences) {
    return routeCreativeIntentWithModel({
      module,
      model,
      trimmedPrompt,
      referencedAssets,
      recentMessages,
      allowReferenceSearch,
    });
  }

  return routeCreativeIntentWithModel({
    module,
    model,
    trimmedPrompt,
    referencedAssets,
    recentMessages,
    allowReferenceSearch,
  });
}

/**
 * 意图路由的大模型判断分支。
 *
 * 从 routeCreativeIntent 里抽出来，是为了让 forceModelDecision
 * 能跳过前面所有正则短路直接复用这段，而不是把同一段提示词抄两遍。
 */
async function routeCreativeIntentWithModel({
  module,
  model,
  trimmedPrompt,
  referencedAssets,
  recentMessages,
  allowReferenceSearch,
}: {
  module: string;
  model: string;
  trimmedPrompt: string;
  referencedAssets: Array<{ title?: string; src: string }>;
  recentMessages: Array<{
    role: "user" | "assistant";
    content: string;
    images?: Array<{ src: string; title?: string }>;
  }>;
  allowReferenceSearch: boolean;
}): Promise<CreativeIntentDecision> {
  const refLines = referencedAssets.map((asset, index) => `${index + 1}. ${asset.title || "未命名素材"}`);
  const historyWindow = recentMessages.slice(-6);
  const historyLines = historyWindow.map((item) => {
    const speaker = item.role === "user" ? "用户" : "助手";
    // 标注哪几轮**带图**，模型才知道「这张」有指代对象可循。
    const imageNote = item.images?.length ? `［附 ${item.images.length} 张图］` : "";
    return `${speaker}${imageNote}: ${item.content}`;
  });
  /**
   * 历史里的图也要送给模型。
   *
   * 【2026-09-11 修复】原先只把历史压成纯文本行，图全丢了，
   * 于是「把上一张再暗一点」这种指代必然失败 ——
   * 模型看得见「助手: 已根据你的请求生成图片：xxx」这句话，
   * 却看不见那张图长什么样。
   *
   * 当前引用的素材排在前面（用户正在操作的主体），历史图跟在后面。
   */
  const historyImages = historyWindow.flatMap((item) => item.images || []);
  const hasReferences = referencedAssets.length > 0;
  const result = await callLLM({
    module,
    model,
    images: [
      ...referencedAssets.map((asset) => ({ src: asset.src, title: asset.title })),
      ...historyImages,
    ],
    prompt: [
      "你是 artx 的统一意图路由器。",
      "你的目标是像成熟的创意画布产品一样，精准判断当前请求更适合文字回复还是直接生成图片。",
      "只返回 JSON，不要 Markdown，不要额外解释。",
      referencedAssets.length >= 2
        ? "JSON 格式：{\"mode\":\"text|image\",\"reply\":\"文字回复内容\",\"imagePrompt\":\"适合图片模型的提示词\",\"targetImageIndex\":1,\"reason\":\"一句话原因\",\"confidence\":\"high|medium|low\"}"
        : "JSON 格式：{\"mode\":\"text|image\",\"reply\":\"文字回复内容\",\"imagePrompt\":\"适合图片模型的提示词\",\"reason\":\"一句话原因\",\"confidence\":\"high|medium|low\"}",
      "禁止回复让用户切换模型、选择模型、改用图片模型或改用对话模型。当前处于 Auto 时，你必须自己判断并返回 text 或 image。",
      allowReferenceSearch
        ? "只有当用户明确要求找参考图、素材、灵感、案例或样例时，才返回 reference_search，并提供 searchQuery 与 followUp。reference_search 会联网搜索公开图片素材，不使用站内本地灵感库；不要把普通生图提示词误判为 reference_search。"
        : "",
      allowReferenceSearch
        ? "reference_search JSON 格式补充：{\"mode\":\"reference_search\",\"searchQuery\":\"用于抓参考图的关键词\",\"followUp\":\"让用户先选参考图再继续描述的引导语\"}"
        : "",
      // ↓↓↓ 2026-09-11 强化：此前 auto 模式下随便问一句都会出图，
      //     根因之一是这里的判定标准偏向 image，且没有「不确定时怎么办」的兜底规则。
      "【最重要的判定原则】只有当用户明确要求你『产出一张图』时才返回 image。",
      "判断依据是**用户的动作诉求**，不是句子里出现了什么名词。",
      "句子里出现『图片』『海报』『logo』『banner』『封面』等词，不代表用户要生成图片——",
      "他很可能只是在**谈论**这些东西。例如：",
      "  『这张图片是什么意思』→ text（在提问，不是要图）",
      "  『什么是 logo 设计的基本原则』→ text（在请教知识）",
      "  『banner 一般用什么尺寸』→ text（在咨询规格）",
      "  『图片模型怎么收费』→ text（在问价格）",
      "  『帮我分析这张海报的问题』→ text（要的是分析意见，不是新图）",
      "  『帮我画一张夏日促销海报』→ image（明确要求产出图片）",
      "  『把这张图的背景换成海边』→ image（明确要求改图）",
      "凡是疑问句、征求意见、请教知识、要求解释或分析的，一律返回 text。",
      "【不确定时的默认行为】如果你无法确信用户想要图片，请返回 text。",
      "错误地返回文字，用户再补一句『帮我画出来』即可；",
      "而错误地生成图片会浪费用户的时间与费用，代价高得多。",
      // 多轮追改的关键：让模型知道历史里的图是可以被指代的。
      historyImages.length > 0
        ? `对话历史里有 ${historyImages.length} 张此前生成或选用过的图，已一并附在本次请求中（排在当前引用素材之后）。当用户说「这张」「上一张」「刚才那个」「再暗一点」「换个角度」时，指的就是历史里的图。此时请在**上一版提示词的基础上做增量修改**，而不是重新凭空写一段，否则会丢掉用户此前已经认可的所有细节。`
        : "",
      "当用户想要解释、分析、建议、优化、拆解、问答、闲聊时，返回 text。",
      "如果有参考图片，且用户明确在继续创作、延展、做变体、改图，才返回 image；",
      "若用户只是针对这些图提问、要评价或要分析，仍然返回 text。",
      // 图文混排的顺序信息只有在这里讲清楚，模型才会用上。
      // 用户输入里的「引用图 N：标题」是按它在输入框中的真实位置插入的，
      // 图片也按同样顺序附在这次请求里，两者一一对应。
      hasReferences
        ? [
            "重要：用户输入是图文混排的，「引用图 N：标题」出现的位置，就是这张图在输入框里的真实位置。",
            "随本次请求附上的图片与这些编号一一对应，顺序一致。",
            "请结合每张图的画面内容，以及它前后紧邻的文字，理解用户真正想要什么：",
            "文字可能在描述这张图要怎么改、要保留什么、要和下一张图产生什么关系。",
            "选择 image 时，imagePrompt 必须把图文关系整合成一段完整、自洽、可直接交给图片生成模型执行的英文或中文描述，",
            "不要在 imagePrompt 里保留「引用图 1」这类占位编号，要把它替换成对该图画面内容的具体描述。",
          ].join("\n")
        : "",
      // 多图融合时必须指认底图。
      //
      // 下游会把某一张图当成「画布」原样保留，其余图只当素材。选错的代价极大：
      // 用户要「让脚穿上这双鞋」，若把鞋当画布，产出的就是一双鞋而不是穿着鞋的脚。
      // 顺序不能作为依据——用户既可能先放主体也可能先放素材。
      referencedAssets.length >= 2
        ? [
            "另外必须返回 targetImageIndex（从 1 开始的整数）：这些引用图里，哪一张是「要被改造、并且要原样保留其主体与场景」的底图。",
            "判断依据是语义而不是顺序：被添加、被穿戴、被替换、被贴上去的那个东西所在的图是素材；承载它、需要保持不变的那张才是底图。",
            "例如用户想让 A 图里的人穿上 B 图里的鞋，底图是 A（人），B 只是鞋子的外观素材，此时 targetImageIndex 就是 A 的编号。",
          ].join("\n")
        : "",
      refLines.length ? `引用素材：\n${refLines.join("\n")}` : "",
      historyLines.length ? `最近对话：\n${historyLines.join("\n")}` : "",
      `当前用户输入：${trimmedPrompt || "请基于当前上下文继续处理。"}`,
    ].filter(Boolean).join("\n"),
  });

  return inferCreativeIntentDecision(result.text, trimmedPrompt || "请基于当前上下文继续创作。");
}

export async function generateIntentImages({
  prompt,
  model = DEFAULT_IMAGE_MODEL_ID,
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
