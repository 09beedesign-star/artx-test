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
    baseCredits: 120,
    estimatedCostPerUnit: 0.2,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_enhance",
    label: "高清图片生成",
    billingUnit: "per_request",
    baseCredits: 180,
    estimatedCostPerUnit: 0.3,
    providerDefault: "OpenAI",
  },
  {
    capability: "watermark_removal",
    label: "去水印",
    billingUnit: "per_request",
    baseCredits: 150,
    estimatedCostPerUnit: 0.22,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "smart_background",
    label: "商品图 / 海报一键生成",
    billingUnit: "per_request",
    baseCredits: 240,
    estimatedCostPerUnit: 0.42,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_edit",
    label: "图片编辑",
    billingUnit: "per_request",
    baseCredits: 180,
    estimatedCostPerUnit: 0.35,
    providerDefault: "OpenAI",
  },
  {
    capability: "image_erase",
    label: "图片擦除",
    billingUnit: "per_request",
    baseCredits: 150,
    estimatedCostPerUnit: 0.28,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_expansion",
    label: "扩图 / 外延生成",
    billingUnit: "per_request",
    baseCredits: 200,
    estimatedCostPerUnit: 0.32,
    providerDefault: "OpenAI",
  },
  {
    capability: "image_ocr",
    label: "图片 OCR / 文案提取",
    billingUnit: "per_request",
    baseCredits: 40,
    estimatedCostPerUnit: 0.08,
    providerDefault: "PicWish/佐糖",
  },
];

export const AI_PLAN_DISCOUNTS: AiPlanDiscountPolicy[] = [
  { planId: "lite", multiplier: 1.08, label: "入门加价" },
  { planId: "creator", multiplier: 1, label: "标准" },
  { planId: "pro", multiplier: 0.95, label: "Pro 95 折" },
  { planId: "studio", multiplier: 0.9, label: "Studio 9 折" },
  { planId: "business", multiplier: 0.82, label: "Business 82 折" },
];

export const AI_IMAGE_MODEL_CREDIT_POLICIES: AiImageModelCreditPolicy[] = [
  { model: "og-image2-low", creditsPerImage: 80, estimatedCostPerImage: 0.15 },
  { model: "og-image2-medium", creditsPerImage: 300, estimatedCostPerImage: 1.335 },
  { model: "og-image2-high", creditsPerImage: 1200, estimatedCostPerImage: 5.34, qualityTier: "high", applyPlanDiscount: false },
  { model: "gpt-image-2", creditsPerImage: 300, estimatedCostPerImage: 1.335 },
  { model: "gem-3.1-lite", creditsPerImage: 150, estimatedCostPerImage: 0.42 },
  { model: "gem-3.1", creditsPerImage: 300, estimatedCostPerImage: 1.3 },
  { model: "gemini-3.1-flash-image-preview", creditsPerImage: 150, estimatedCostPerImage: 0.42 },
  { model: "gemini-3.1-flash-image", creditsPerImage: 300, estimatedCostPerImage: 1.3 },
  { model: "jimeng-4.0", creditsPerImage: 120, estimatedCostPerImage: 0.22 },
  { model: "mj-v7", creditsPerImage: 180, estimatedCostPerImage: 0.46 },
  { model: "mj-v8.1", creditsPerImage: 180, estimatedCostPerImage: 0.46 },
  { model: "kling-2.1", creditsPerImage: 200, estimatedCostPerImage: 0.56 },
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
  return AI_IMAGE_MODEL_CREDIT_POLICIES.find((item) => item.model === normalized) || null;
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
