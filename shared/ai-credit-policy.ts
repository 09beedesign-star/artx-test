import { normalizeImageModelId } from "./image-models";

export type AiBillingCapability =
  | "text_generation"
  | "text_to_image"
  | "background_removal"
  | "image_enhance"
  | "watermark_removal"
  | "smart_background"
  | "image_edit"
  | "image_erase"
  | "image_expansion"
  | "image_ocr";

export type AiBillingPolicy = {
  capability: AiBillingCapability;
  label: string;
  billingUnit: "per_request" | "per_image";
  baseCredits: number;
  perOutputCredits?: number;
  estimatedCostPerUnit: number;
  providerDefault: string;
};

export type AiPlanDiscountPolicy = {
  planId: "lite" | "creator" | "pro" | "studio" | "business";
  multiplier: number;
  label: string;
};

export type AiImageModelCreditPolicy = {
  model: string;
  creditsPerImage: number;
  estimatedCostPerImage: number;
  qualityTier?: "standard" | "high";
  applyPlanDiscount?: boolean;
};

export const AI_CREDIT_POLICIES: AiBillingPolicy[] = [
  {
    capability: "text_generation",
    label: "提示词优化 / 文案生成",
    billingUnit: "per_request",
    baseCredits: 20,
    estimatedCostPerUnit: 0.05,
    providerDefault: "OpenAI",
  },
  {
    capability: "text_to_image",
    label: "普通图片生成",
    billingUnit: "per_image",
    baseCredits: 300,
    perOutputCredits: 0,
    estimatedCostPerUnit: 0.4,
    providerDefault: "OpenAI",
  },
  {
    capability: "background_removal",
    label: "抠图 / 去背景",
    billingUnit: "per_request",
    baseCredits: 60,
    estimatedCostPerUnit: 0.03,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_enhance",
    label: "高清图片生成",
    billingUnit: "per_request",
    baseCredits: 160,
    estimatedCostPerUnit: 0.15,
    providerDefault: "OpenAI",
  },
  {
    capability: "watermark_removal",
    label: "去水印",
    billingUnit: "per_request",
    baseCredits: 120,
    estimatedCostPerUnit: 0.1,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "smart_background",
    label: "商品图 / 海报一键生成",
    billingUnit: "per_request",
    baseCredits: 480,
    estimatedCostPerUnit: 0.15,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_edit",
    label: "图片编辑",
    billingUnit: "per_request",
    baseCredits: 180,
    estimatedCostPerUnit: 0.13,
    providerDefault: "OpenAI",
  },
  {
    capability: "image_erase",
    label: "图片擦除",
    billingUnit: "per_request",
    baseCredits: 90,
    estimatedCostPerUnit: 0.05,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_expansion",
    label: "扩图 / 外延生成",
    billingUnit: "per_request",
    baseCredits: 200,
    estimatedCostPerUnit: 0.118,
    providerDefault: "OpenAI",
  },
  {
    capability: "image_ocr",
    label: "图片 OCR / 文案提取",
    billingUnit: "per_request",
    baseCredits: 40,
    estimatedCostPerUnit: 0.022,
    providerDefault: "PicWish/佐糖",
  },
];

export const AI_PLAN_DISCOUNTS: AiPlanDiscountPolicy[] = [
  { planId: "lite", multiplier: 1.0, label: "标准" },
  { planId: "creator", multiplier: 1.0, label: "标准" },
  { planId: "pro", multiplier: 1.0, label: "标准" },
  { planId: "studio", multiplier: 1.0, label: "标准" },
  { planId: "business", multiplier: 1.0, label: "标准" },
];

export const AI_IMAGE_MODEL_CREDIT_POLICIES: AiImageModelCreditPolicy[] = [
  /**
   * OG image2.5（腾讯 VOD 直连）—— 2026-09-11 起 sunburst medium 为全站默认。
   *
   * 【2026-09-12 定价重制】estimatedCostPerImage 口径从 4K 改为 **1K**。
   *
   * 原因：站点实际出图请求绝大多数落在 1K 档（短边 ≤1088px），
   * 此前存 4K 价（low 0.100 / medium 0.227 / high 0.890）导致
   * 后台 grossMargin 统计系统性失真约 3 倍，看起来像是在亏钱。
   * image2.5 官方 1K 价：low 0.036 / medium 0.078 / high 0.316。
   *
   * creditsPerImage 按 55% 毛利红线反推后取整十：
   * low 40 / medium 70 / high 300，对应毛利率 69.0% / 61.6% / 63.7%。
   * medium 为全站默认档，70 积分/张是所有套餐额度换算的基准。
   * sunburst 与 flare 两系官方价格完全相同，因此计费完全一致。
   */
  { model: "vod-og25-sunburst-low", creditsPerImage: 40, estimatedCostPerImage: 0.036 },
  { model: "vod-og25-flare-low", creditsPerImage: 40, estimatedCostPerImage: 0.036 },
  { model: "vod-og25-sunburst-medium", creditsPerImage: 70, estimatedCostPerImage: 0.078 },
  { model: "vod-og25-flare-medium", creditsPerImage: 70, estimatedCostPerImage: 0.078 },
  { model: "vod-og25-sunburst-high", creditsPerImage: 300, estimatedCostPerImage: 0.316, qualityTier: "high" },
  { model: "vod-og25-flare-high", creditsPerImage: 300, estimatedCostPerImage: 0.316, qualityTier: "high" },
  /**
   * 2026-09-12 中转站图片模型下线，已移除
   * og-image2-low/medium/high、jimeng-4.0、mj-v7、mj-v8.1 六条。
   *
   * 它们的等价 VOD 模型（vod-og25-* / vod-jimeng / vod-mj）由
   * getAiImageModelCreditPolicy 内的归一化自动命中，历史订单不受影响。
   *
   * 下面保留的非 vod- 条目是**固定后端能力**（不在选择器里，内部流程调用），
   * 不属于中转站图片模型，不能一起删。
   */
  { model: "gpt-image-2", creditsPerImage: 300, estimatedCostPerImage: 1.335 },
  { model: "gem-3.1-lite", creditsPerImage: 150, estimatedCostPerImage: 0.42 },
  { model: "gem-3.1", creditsPerImage: 300, estimatedCostPerImage: 1.3 },
  { model: "gemini-3.1-flash-image-preview", creditsPerImage: 150, estimatedCostPerImage: 0.42 },
  { model: "gemini-3.1-flash-image", creditsPerImage: 300, estimatedCostPerImage: 1.3 },
  { model: "kling-2.1", creditsPerImage: 200, estimatedCostPerImage: 0.56 },
  /**
   * 其余 VOD 直连模型。此前**整组缺失**，导致 vod-gem / vod-mj / vod-kling /
   * vod-si / vod-qwen / vod-jimeng / vod-og 落不到任何条目，
   * quoteAiUsage 会回落到 policy.baseCredits（通用价），与真实成本脱钩。
   *
   * 单价口径与本表其余条目一致（4K 档），数值取自
   * 《腾讯VOD-AIGC生图定价对照》。gem 族腾讯尚未给出公开报价，
   * 此处按同档位的 GG 3.1 / 3.1-lite 价格暂代，待商务确认后修正。
   */
  { model: "vod-og", creditsPerImage: 300, estimatedCostPerImage: 1.335 },
  { model: "vod-gem", creditsPerImage: 300, estimatedCostPerImage: 1.3 },
  { model: "vod-gem-lite", creditsPerImage: 150, estimatedCostPerImage: 0.42 },
  { model: "vod-jimeng", creditsPerImage: 120, estimatedCostPerImage: 0.22 },
  { model: "vod-mj", creditsPerImage: 180, estimatedCostPerImage: 0.46 },
  { model: "vod-kling", creditsPerImage: 200, estimatedCostPerImage: 0.56 },
  { model: "vod-si", creditsPerImage: 200, estimatedCostPerImage: 0.56 },
  { model: "vod-qwen", creditsPerImage: 180, estimatedCostPerImage: 0.46 },
];

export function getAiBillingPolicy(capability: AiBillingCapability) {
  return AI_CREDIT_POLICIES.find((item) => item.capability === capability) || AI_CREDIT_POLICIES[0];
}

export function getAiPlanDiscount(planId?: string) {
  return AI_PLAN_DISCOUNTS.find((item) => item.planId === planId) || AI_PLAN_DISCOUNTS[1];
}

export function getAiImageModelCreditPolicy(model?: string) {
  const normalized = (model || "").trim();
  if (!normalized || normalized === "auto") return null;
  const exact = AI_IMAGE_MODEL_CREDIT_POLICIES.find((item) => item.model === normalized);
  if (exact) return exact;
  /**
   * 精确匹配失败时，再按图片模型归一化规则重试一次。
   *
   * 这一步是为**已下线的中转站图片模型**准备的：历史订单、重新生成、
   * 管理后台的用量报表里仍然存着 `og-image2-medium` 这类旧 id，
   * 而计费表已经不再收录它们。若不重试，这些记录会拿到 null，
   * quoteAiUsage 就会回落到通用 baseCredits —— 相当于**按错误的价格计费**。
   *
   * normalizeImageModelId 会把旧 id 迁移到等价的 VOD 模型，
   * 从而命中新表里对应的条目，保证新旧数据的计费口径一致。
   */
  const migrated = normalizeImageModelId(normalized);
  if (!migrated || migrated === normalized) return null;
  return AI_IMAGE_MODEL_CREDIT_POLICIES.find((item) => item.model === migrated) || null;
}

export function isHighQualityImageModel(model?: string) {
  return getAiImageModelCreditPolicy(model)?.qualityTier === "high";
}

export function quoteAiUsage(input: {
  capability: AiBillingCapability;
  outputCount?: number;
  planId?: string;
  model?: string;
}) {
  const policy = getAiBillingPolicy(input.capability);
  const discount = getAiPlanDiscount(input.planId);
  const outputCount = Math.max(1, Math.round(input.outputCount || 1));
  const modelPolicy = input.capability === "text_to_image"
    ? getAiImageModelCreditPolicy(input.model)
    : null;
  const rawCredits = modelPolicy
    ? modelPolicy.creditsPerImage * outputCount
    : policy.billingUnit === "per_image"
      ? policy.baseCredits * outputCount + (policy.perOutputCredits || 0) * Math.max(0, outputCount - 1)
      : policy.baseCredits;
  const discountMultiplier = modelPolicy?.applyPlanDiscount === false ? 1 : discount.multiplier;
  const chargedCredits = Math.max(1, Math.round(rawCredits * discountMultiplier));
  const estimatedCost = Number(((modelPolicy?.estimatedCostPerImage || policy.estimatedCostPerUnit) * (policy.billingUnit === "per_image" ? outputCount : 1)).toFixed(2));

  return {
    policy,
    discount,
    chargedCredits,
    estimatedCost,
  };
}
