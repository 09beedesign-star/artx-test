/**
 * image2.6 专属交付物（SVG 矢量导出 / GIF 动图）的**唯一事实源**。
 *
 * 前端按钮、提示词关键词、服务端出图、服务端计费四个出口都必须调这里，
 * 否则会出现「按钮生成了 GIF 但按 PNG 扣费」或「提示词写了导出svg、出来一张 png」这类
 * 多出口不一致、零报错的问题。
 *
 * 规则：
 * 1. 只有 image2.6（vod-og26-*）才可能产出 svg / gif；其他模型一律返回 undefined。
 * 2. 显式字段（按钮）优先于提示词关键词。
 * 3. 关键词必须是「动作 + 格式」组合（导出svg / 生成gif / 转成矢量图 / 做成动图），
 *    单独出现 "svg"/"gif" 不算 —— 「画一个 GIF 风格的像素小人」不该被改成动图。
 */
import { isImage26ModelId } from "./image-models";

export type ImageDeliverable = "svg" | "gif";

export const IMAGE_DELIVERABLES: readonly ImageDeliverable[] = ["svg", "gif"] as const;

const ACTION = "(?:导出|输出|生成|转成|转为|转换成|转换为|变成|做成|制作|存为|保存为|保存成|出一张|出个|做个|做一张|来一张|export(?:\\s+as)?|generate|make|create|convert(?:\\s+(?:it|this))?\\s+to|output|save\\s+as)";

const SVG_PATTERNS: RegExp[] = [
  new RegExp(`${ACTION}\\s*(?:为|成|一个|一张|个|张|an?)?\\s*(?:\\.?svg|矢量图?|矢量格式|矢量文件|vector)`, "i"),
  /矢量化/,
  /\bvectori[sz]e\b/i,
];

const GIF_PATTERNS: RegExp[] = [
  new RegExp(`${ACTION}\\s*(?:为|成|一个|一张|个|张|an?)?\\s*(?:\\.?gif|动图|动态图|动画图)`, "i"),
  /让(?:这张图|图片|画面|它)?动起来/,
  /\banimated\s+gif\b/i,
];

/** 从提示词里识别交付物意图。不判断模型（判断模型请用 resolveImageDeliverable）。 */
export function detectImageDeliverableFromPrompt(prompt?: string): ImageDeliverable | undefined {
  const text = String(prompt || "");
  if (!text.trim()) return undefined;
  const svg = SVG_PATTERNS.some((pattern) => pattern.test(text));
  const gif = GIF_PATTERNS.some((pattern) => pattern.test(text));
  // 两个都命中时无法判断用户要哪个 —— 宁可按普通图出，也不猜。
  if (svg && gif) return undefined;
  if (svg) return "svg";
  if (gif) return "gif";
  return undefined;
}

export function coerceImageDeliverable(value: unknown): ImageDeliverable | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "svg" || normalized === "gif" ? normalized : undefined;
}

/**
 * 最终交付物裁决：模型不是 image2.6 → undefined；显式字段 > 提示词关键词。
 * 服务端出图（image-generation.ts）与计费（admin-store / ai-credit-policy）都用它。
 */
export function resolveImageDeliverable(input: {
  model?: string;
  deliverable?: unknown;
  prompt?: string;
}): ImageDeliverable | undefined {
  if (!isImage26ModelId(input.model)) return undefined;
  return coerceImageDeliverable(input.deliverable) ?? detectImageDeliverableFromPrompt(input.prompt);
}

/** 按钮触发时发给上游的默认提示词（基于节点原图）。 */
export const IMAGE_DELIVERABLE_DEFAULT_PROMPTS: Record<ImageDeliverable, string> = {
  svg: "将参考图转换为干净的矢量插画（SVG），保持原有构图、主体轮廓与配色，使用简洁的色块与路径",
  gif: "以参考图为画面，让主体自然地动起来，生成一段循环播放的 GIF 动图，保持原有构图与风格",
};

export function getImageDeliverableLabel(deliverable: ImageDeliverable): string {
  return deliverable === "svg" ? "SVG 矢量图" : "GIF 动图";
}
