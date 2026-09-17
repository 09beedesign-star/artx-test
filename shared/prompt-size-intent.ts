/**
 * 从提示词里解析「用户要多大的图」—— 唯一事实源。
 *
 * 【2026-09-17 新建】用户需求原文：
 *   「用户输入提示词中，一旦提到了关于分辨率(2k/4k/8k、高清、xx:xx、
 *     国际印刷尺寸等)，即使画幅比例 icon 没有选中 auto 模式，
 *     也必须优先按用户提示词所提到的语义输出对应尺寸和分辨率。
 *     若提示词没有相关文字，则按画幅 icon 下用户自主设定的参数生成。」
 *
 * ── 与既有模块的分工（⚠️ 别再写第四份比例正则）─────────────────
 *
 * shared/edit-aspect-lock.ts 已经有 parseExplicitRatioFromPrompt（解析 xx:xx），
 * 但它只服务于**局部重绘**：那条链路有「底图真实比例」可锁，
 * 优先级是 提示词 > 选择器 > 底图 > 1:1。
 *
 * 纯文生图没有底图，此前**完全不看提示词** —— 前端只传
 * `resolveImageRatio(assistantImageRatio)` 一个比例字符串，
 * 用户在提示词里写「4K 海报」毫无作用，且零报错。这就是本模块要填的缺口。
 *
 * 本模块 = 比例（复用 edit-aspect-lock 的正则）+ 分辨率档位 + 印刷尺寸。
 * ⚠️ 比例部分必须 import 复用，不许另写正则，否则「用户写 3:4」在两条
 *    链路上会有两套判定标准。
 *
 * ── ⚠️⚠️ 关键：为什么要输出「像素」而不只是「比例」────────────
 *
 * 上游图片 API 只接受固定档位（最大 1536 长边，见 image-generation.ts
 * 的 ratioToSize）。所以「4K」不可能靠传参让上游直接出 —— 它出 1536，
 * 然后服务端落库前用 sharp 等比放大到目标像素
 * （__testResolveHighDefinitionTargetSize + 归一化那一步）。
 * 📌 因此本模块必须给出**具体像素**，只给「4k」这个标签是没人能消费的。
 */

import { parseExplicitRatioFromPrompt, parseRatioToDimensions } from "./edit-aspect-lock";
import { SUPPORTED_IMAGE_RATIOS } from "./image-ratios";

/** 印刷换算用的标准分辨率（每英寸像素）。印刷品的行业惯例是 300。 */
export const PRINT_DPI = 300;

/** 一英寸 = 25.4 毫米，用于把 ISO 216 的毫米尺寸换算成像素。 */
const MM_PER_INCH = 25.4;

/**
 * 分辨率档位 → 长边像素。
 *
 * ⚠️ 这里用的是「长边」而不是宽度：用户说「4K 竖版海报」时，
 * 4K 指的是画面的长边（3840），而不是宽度 —— 竖版 4K 是 2160×3840。
 * 按宽度理解会让竖图只有 2160 长边，比用户要的小一圈。
 */
export const RESOLUTION_TIER_LONG_SIDE: Record<string, number> = {
  "1k": 1280,
  "2k": 2560,
  "4k": 3840,
  "6k": 6144,
  "8k": 7680,
};

/**
 * 「高清」这类模糊表述对应的长边。
 *
 * ⚠️ 刻意映射到 2K 而不是 4K：
 * 「高清」是相对表述，用户想表达的是「别给我糊的」，不是「我要极限分辨率」。
 * 映射到 4K 会让每张图的生成与存储成本显著上升，而用户并没有明确要求。
 * 📌 判据：模糊表述给保守值，精确数字才给激进值。
 */
export const VAGUE_HD_LONG_SIDE = 2560;

/**
 * ISO 216 / 北美常见印刷幅面（毫米），按 300 DPI 换算成像素。
 *
 * ⚠️ 全部按**纵向（portrait）**记录，横向由「横版」关键词或显式比例翻转。
 */
export const PRINT_FORMATS_MM: Record<string, { width: number; height: number }> = {
  a0: { width: 841, height: 1189 },
  a1: { width: 594, height: 841 },
  a2: { width: 420, height: 594 },
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a6: { width: 105, height: 148 },
  b4: { width: 250, height: 353 },
  b5: { width: 176, height: 250 },
  letter: { width: 216, height: 279 },
  legal: { width: 216, height: 356 },
  tabloid: { width: 279, height: 432 },
};

/** 上限保护：再大的图 sharp 放大也只是插值，且内存与存储开销失控。 */
export const MAX_INTENT_LONG_SIDE = 8192;

export type PromptSizeIntent = {
  /** 最终比例字符串，形如 "16:9"。 */
  ratio: string;
  /** 目标宽（像素）。 */
  width: number;
  /** 目标高（像素）。 */
  height: number;
  /**
   * 命中了哪些语义，便于排查与断言。
   * 例："4k" / "a4" / "ratio:16:9" / "hd"
   */
  matched: string[];
};

/** 毫米 → 像素（300 DPI），四舍五入到整数。 */
export function mmToPixels(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/**
 * 从提示词里找分辨率档位（2k / 4k / 8k / 高清 / 4096px 等）。
 *
 * @returns 长边像素；没提到返回 undefined。
 */
function matchResolutionLongSide(
  text: string,
  matched: string[]
): number | undefined {
  /**
   * ⚠️⚠️ 必须要求 k 前面的数字紧邻且有词边界。
   * 不加边界时「把价格改成 4000k 元」这类文案会被误判成分辨率。
   * 同理排除后面紧跟字母的情况（避免 "4kg" 被当成 4K）。
   */
  const tierMatch = text.match(/(?<![a-z\d])([12468])\s*k(?![a-z\d])/);
  if (tierMatch) {
    const key = `${tierMatch[1]}k`;
    const longSide = RESOLUTION_TIER_LONG_SIDE[key];
    if (longSide) {
      matched.push(key);
      return longSide;
    }
  }

  // 显式像素：「长边 4096px」「4096 像素」
  const pixelMatch = text.match(/(?<![a-z\d])(\d{3,5})\s*(?:px|像素|pixels?)(?![a-z\d])/);
  if (pixelMatch) {
    const value = Number(pixelMatch[1]);
    if (Number.isFinite(value) && value >= 256) {
      matched.push(`${value}px`);
      return Math.min(value, MAX_INTENT_LONG_SIDE);
    }
  }

  /**
   * 模糊的清晰度表述。
   *
   * ⚠️ 「超清 / 超高清」也归到这里，同样给保守值 —— 它们仍然是形容词，
   * 不是一个可量的数字。用户真要 4K 会直接写 4K。
   */
  if (/高清|超清|超高清|hd|high[\s-]?resolution|高分辨率|印刷级|可印刷/.test(text)) {
    matched.push("hd");
    return VAGUE_HD_LONG_SIDE;
  }

  return undefined;
}

/**
 * 从提示词里找国际印刷幅面（A4 / A3 / letter …）。
 *
 * @returns 纵向的宽高（像素）；没提到返回 undefined。
 */
function matchPrintFormat(
  text: string,
  matched: string[]
): { width: number; height: number } | undefined {
  /**
   * ⚠️⚠️ A 系列必须要求词边界，否则会命中一大片无关文本：
   * 「A4」以外，"a4" 也可能出现在颜色码、型号、"Model A4X" 里。
   * 这里要求前后都不是字母数字。
   */
  const isoMatch = text.match(/(?<![a-z\d])([ab][0-6])(?![a-z\d])/);
  if (isoMatch) {
    const key = isoMatch[1];
    const format = PRINT_FORMATS_MM[key];
    if (format) {
      matched.push(key);
      return {
        width: mmToPixels(format.width),
        height: mmToPixels(format.height),
      };
    }
  }

  const namedMatch = text.match(/(?<![a-z])(letter|legal|tabloid)(?![a-z])/);
  if (namedMatch) {
    const format = PRINT_FORMATS_MM[namedMatch[1]];
    if (format) {
      matched.push(namedMatch[1]);
      return {
        width: mmToPixels(format.width),
        height: mmToPixels(format.height),
      };
    }
  }

  return undefined;
}

/**
 * 把任意宽高吸附到**白名单内**最接近的比例。
 *
 * ⚠️⚠️⚠️ 这一步是必须的，不是优化。
 *
 * 曾经这里用的是「最大公约数约简」，A4（2480×3508）算出 `620:877`。
 * 它数学上完全正确，但 620:877 不在 SUPPORTED_IMAGE_RATIOS 白名单里，
 * 于是 resolveImageRatio() 会把它**静默兜底成 9:16**
 * （实测：620:877 → 9:16、A3 横版 4961:3508 → 9:16，
 *  也就是「用户要 A3 横版，实际出竖图」，且全程零报错）。
 *
 * 📌 判据：凡是要交给白名单校验的比例字符串，就必须在生成时就落在白名单内。
 *    「算出一个合法数值」和「算出一个会被接受的数值」是两件事。
 *
 * ⚠️ 真实的印刷像素不受影响 —— 那个由 width/height 字段承载，
 *    ratio 只用于给上游选最接近的出图档位。
 */
function toSupportedRatio(width: number, height: number): string {
  const target = width / Math.max(1, height);
  let best = SUPPORTED_IMAGE_RATIOS[0] as string;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of SUPPORTED_IMAGE_RATIOS) {
    const dimensions = parseRatioToDimensions(candidate);
    if (!dimensions) continue;
    const delta = Math.abs(dimensions.width / dimensions.height - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

/** 等比缩放到指定长边。宽高必须乘同一个系数，否则就是在制造变形。 */
function scaleToLongSide(
  width: number,
  height: number,
  longSide: number
): { width: number; height: number } {
  const currentLong = Math.max(width, height);
  if (currentLong <= 0) return { width: longSide, height: longSide };
  const scale = Math.min(longSide, MAX_INTENT_LONG_SIDE) / currentLong;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 判断提示词有没有表达「横版 / 竖版」的朝向意图。
 *
 * 仅用于翻转印刷幅面（A4 默认纵向）。
 * ⚠️ 不用它去决定比例数值 —— 「竖版」不等于 9:16，用户只是要求别变横。
 */
function matchOrientation(text: string): "landscape" | "portrait" | undefined {
  if (/横版|横向|横构图|landscape/.test(text)) return "landscape";
  if (/竖版|竖向|竖构图|纵向|portrait/.test(text)) return "portrait";
  return undefined;
}

/**
 * 解析提示词里的尺寸/分辨率意图。
 *
 * 命中任意一类语义就返回结果；完全没提到则返回 null
 * —— 这时调用方必须回落到画幅选择器的设定（需求原文第二句）。
 *
 * 组合优先级（同时出现时的行为）：
 *   1. 印刷幅面 + 分辨率档位 → 用幅面定比例，用档位定长边
 *      （「A4 4K 海报」→ A4 的 210:297 比例放大到长边 3840）
 *   2. 显式比例 + 分辨率档位 → 用比例定形状，用档位定长边
 *   3. 只有印刷幅面 → 用 300 DPI 的真实印刷像素
 *   4. 只有显式比例 → 比例 + 默认长边（沿用高清档，避免出小图）
 *   5. 只有分辨率档位 → 只放大，形状交给调用方（返回 ratio 为空串由调用方填）
 *
 * ⚠️⚠️ 第 5 种情况最容易写错：用户只说「4K」没说形状，
 * 这时**不能**擅自给一个比例（那会覆盖他在画幅 icon 里选的值），
 * 必须让调用方把选择器的比例填进来。所以这里返回 ratio: ""
 * 作为「形状未指定」的显式信号，而不是偷偷塞一个默认值。
 */
export function parsePromptSizeIntent(
  prompt?: string | null
): PromptSizeIntent | null {
  if (!prompt) return null;
  const text = prompt.toLowerCase();
  const matched: string[] = [];

  const printFormat = matchPrintFormat(text, matched);
  const explicitRatio = parseExplicitRatioFromPrompt(prompt);
  if (explicitRatio) matched.push(`ratio:${explicitRatio}`);
  const longSide = matchResolutionLongSide(text, matched);
  const orientation = matchOrientation(text);

  if (!printFormat && !explicitRatio && longSide === undefined) {
    return null;
  }

  // ① / ③ 印刷幅面优先决定形状 —— 它同时给出了比例和真实印刷像素。
  if (printFormat) {
    let { width, height } = printFormat;
    // A 系列默认纵向；用户明确说横版才翻转。
    if (orientation === "landscape" && height > width) {
      [width, height] = [height, width];
    }
    const sized =
      longSide === undefined
        ? { width, height }
        : scaleToLongSide(width, height, longSide);
    return {
      ratio: toSupportedRatio(sized.width, sized.height),
      width: sized.width,
      height: sized.height,
      matched,
    };
  }

  // ② / ④ 显式比例决定形状。
  if (explicitRatio) {
    const dimensions = parseRatioToDimensions(explicitRatio);
    if (dimensions) {
      const target = longSide ?? VAGUE_HD_LONG_SIDE;
      const sized = scaleToLongSide(dimensions.width, dimensions.height, target);
      return {
        ratio: explicitRatio,
        width: sized.width,
        height: sized.height,
        matched,
      };
    }
  }

  // ⑤ 只有分辨率档位：形状未指定，交回调用方填。
  if (longSide !== undefined) {
    return {
      ratio: "",
      width: Math.min(longSide, MAX_INTENT_LONG_SIDE),
      height: Math.min(longSide, MAX_INTENT_LONG_SIDE),
      matched,
    };
  }

  return null;
}

/**
 * 把提示词意图与画幅选择器的设定合成为最终下发尺寸。
 *
 * 这是需求第二条的**裁决函数**，也是唯一应该被调用方使用的入口。
 *
 * 优先级（顺序不能调）：
 *   1. 提示词里提到的尺寸/分辨率 —— 即时意图最强，
 *      **即使画幅 icon 不是 auto 也要盖过它**（用户原文的硬要求）
 *   2. 画幅选择器的非 auto 值
 *   3. auto → 由 resolveImageRatio 决定（调用方传进来）
 *
 * @param prompt 用户提示词
 * @param selectorRatio 画幅选择器里的值（可能是 "auto"）
 * @param resolvedSelectorRatio 选择器经 resolveImageRatio 归一化后的比例，
 *        用于「提示词只说了分辨率没说形状」时补形状。
 */
export function resolveOutputSizeFromPromptAndSelector(input: {
  prompt?: string | null;
  selectorRatio?: string | null;
  resolvedSelectorRatio: string;
}): {
  ratio: string;
  width?: number;
  height?: number;
  source: "prompt" | "selector";
  matched: string[];
} {
  const intent = parsePromptSizeIntent(input.prompt);

  if (intent) {
    /**
     * 形状未指定（用户只说了「4K」）→ 用选择器的比例补形状，只吃分辨率。
     * ⚠️ 这里必须用 resolvedSelectorRatio（已把 auto 解析掉的值），
     *    否则 "auto" 会被 parseRatioToDimensions 判为非法而丢掉整个意图，
     *    结果用户说了 4K 却仍然出 1536 —— 静默失效。
     */
    if (!intent.ratio) {
      const dimensions = parseRatioToDimensions(input.resolvedSelectorRatio);
      const longSide = Math.max(intent.width, intent.height);
      if (dimensions) {
        const sized = scaleToLongSide(
          dimensions.width,
          dimensions.height,
          longSide
        );
        return {
          ratio: input.resolvedSelectorRatio,
          width: sized.width,
          height: sized.height,
          source: "prompt",
          matched: intent.matched,
        };
      }
      return {
        ratio: input.resolvedSelectorRatio,
        width: longSide,
        height: longSide,
        source: "prompt",
        matched: intent.matched,
      };
    }

    return {
      ratio: intent.ratio,
      width: intent.width,
      height: intent.height,
      source: "prompt",
      matched: intent.matched,
    };
  }

  // 提示词没提 → 完全按画幅 icon 下用户自主设定的参数（需求原文第二句）。
  return {
    ratio: input.resolvedSelectorRatio,
    source: "selector",
    matched: [],
  };
}
