/**
 * 从提示词里解析「用户要几张图」—— 唯一事实源。
 *
 * 【2026-11-15 新建】用户需求原文：
 *   「当用户在全站的所有提示词输入窗口中提到关于生成图片的数量（几张几张）、
 *     某某尺寸、某某分辨率的时候，优先按照用户提示词提到的具体张数、分辨率、
 *     尺寸为第一响应去调起图片大模型；若用户没有提到，则按照分辨率选项和
 *     图片张数的选项去生成图片。」
 *
 * 尺寸 / 分辨率的那一半早就有了（shared/prompt-size-intent.ts），本模块只补「张数」。
 * 裁决口径与尺寸完全一致：**提示词 > 张数选择器**。
 *
 * ⚠️⚠️ 误判比漏判危险：张数直接乘积分。把「把这两张图融合」读成 2 张
 * = 用户多付一倍钱，还拿到两张他没要的图。所以规则是**宁可不认**：
 *   - 必须是「动词 + N张」或「N张 + 图类名词」才算出图张数；
 *   - 数字前面是 这/那/把/将/用/参考/上传/基于/根据/融合/合并 → 指的是输入图，不算；
 *   - 「几张」「多少张」是在提问，不算。
 */

/** 张数选择器的上限（InfiniteCanvas 的 ImageCountSelector 只有 1–4）。 */
export const MAX_PROMPT_IMAGE_COUNT = 4;

const CHINESE_DIGITS: Record<string, number> = {
  一: 1,
  壹: 1,
  两: 2,
  俩: 2,
  二: 2,
  贰: 2,
  三: 3,
  叁: 3,
  四: 4,
  肆: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const NUMBER = "(\\d{1,2}|[一壹两俩二贰三叁四肆五六七八九十])";
const UNIT = "(?:张|幅|款|版|个版本|个方案|种方案|套)";
const IMAGE_NOUN =
  "(?:图|图片|图像|照片|海报|插画|插图|效果图|主图|封面|壁纸|头像|方案|设计|变体|版本|候选|样图|配图|渲染图|作品)";
const VERB =
  "(?:生成|出|画|绘制|做|制作|设计|来|给我|帮我出|帮我生成|帮我画|帮我做|要|产出|输出|渲染|创作)";
/** 数字前紧跟这些 = 在说「已有的那几张图」，不是要出几张。 */
const INPUT_REFERENCE_PREFIX =
  // 「的」也排除：「上传的两张照片」「刚才的三张图」都是在指代已有图片。
  // 代价是「要清晰的两张海报」会漏判 → 回落选择器，符合「宁可不认」。
  "(?<!这|那|把|将|用|参考|上传|基于|根据|融合|合并|结合|拼接|对比|这些|那些|以上|上面|下面|前|后|的)";

const VERB_COUNT_PATTERN = new RegExp(
  `${VERB}\\s*(?:个|出)?\\s*${INPUT_REFERENCE_PREFIX}${NUMBER}\\s*${UNIT}`
);
const COUNT_NOUN_PATTERN = new RegExp(
  `${INPUT_REFERENCE_PREFIX}${NUMBER}\\s*${UNIT}\\s*(?:不同的?|风格各异的?|[^\\s，。,.!！?？]{0,6}?的)?\\s*${IMAGE_NOUN}`
);
const TOTAL_COUNT_PATTERN = new RegExp(`(?:共|一共|总共)\\s*${NUMBER}\\s*${UNIT}`);
/** 英文：4 images / 3 pictures / x4 variations / generate 2 posters */
const ENGLISH_COUNT_PATTERN =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:different\s+|unique\s+)?(?:images?|pictures?|photos?|variations?|versions?|posters?|illustrations?|options?|renders?)\b/i;
const ENGLISH_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function toNumber(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) return Number(raw);
  const lower = raw.toLowerCase();
  if (lower in ENGLISH_WORDS) return ENGLISH_WORDS[lower];
  return CHINESE_DIGITS[raw];
}

export type PromptImageCountIntent = {
  /** 用户原话里的张数（未钳制）。 */
  requested: number;
  /** 钳制到 [1, MAX_PROMPT_IMAGE_COUNT] 后实际下发的张数。 */
  count: number;
  /** 命中的原文片段，便于排查与提示。 */
  matched: string;
};

/**
 * 解析提示词里的出图张数。没有明确张数（或只是在提问「几张」）→ null。
 */
export function parsePromptImageCount(
  prompt?: string | null,
  max: number = MAX_PROMPT_IMAGE_COUNT
): PromptImageCountIntent | null {
  if (!prompt) return null;
  const text = prompt.trim();
  if (!text) return null;

  const patterns = [VERB_COUNT_PATTERN, TOTAL_COUNT_PATTERN, COUNT_NOUN_PATTERN, ENGLISH_COUNT_PATTERN];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = toNumber(match[1]);
    if (!value || value < 1) continue;
    return {
      requested: value,
      count: Math.max(1, Math.min(value, max)),
      matched: match[0],
    };
  }
  return null;
}

/**
 * 张数裁决：提示词明确写了张数 → 用提示词；否则 → 用张数选择器。
 *
 * 这是唯一应该被调用方使用的入口（与 resolveOutputSizeFromPromptAndSelector 对称）。
 */
export function resolveImageCountFromPromptAndSelector(input: {
  prompt?: string | null;
  selectorCount?: number | null;
  max?: number;
}): {
  count: number;
  source: "prompt" | "selector";
  requested?: number;
  matched?: string;
} {
  const max = input.max ?? MAX_PROMPT_IMAGE_COUNT;
  const intent = parsePromptImageCount(input.prompt, max);
  if (intent) {
    return {
      count: intent.count,
      source: "prompt",
      requested: intent.requested,
      matched: intent.matched,
    };
  }
  const selector = Number(input.selectorCount);
  return {
    count: Number.isFinite(selector) && selector >= 1 ? Math.min(Math.round(selector), max) : 1,
    source: "selector",
  };
}
