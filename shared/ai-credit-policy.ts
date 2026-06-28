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

export const AI_CREDIT_POLICIES: AiBillingPolicy[] = [
  {
    capability: "text_generation",
    label: "提示词优化 / 文案生成",
    billingUnit: "per_request",
    baseCredits: 2,
    estimatedCostPerUnit: 0.05,
    providerDefault: "OpenAI",
  },
  {
    capability: "text_to_image",
    label: "普通图片生成",
    billingUnit: "per_image",
    baseCredits: 10,
    perOutputCredits: 0,
    estimatedCostPerUnit: 0.4,
    providerDefault: "OpenAI",
  },
  {
    capability: "background_removal",
    label: "抠图 / 去背景",
    billingUnit: "per_request",
    baseCredits: 12,
    estimatedCostPerUnit: 0.2,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_enhance",
    label: "高清图片生成",
    billingUnit: "per_request",
    baseCredits: 15,
    estimatedCostPerUnit: 0.3,
    providerDefault: "OpenAI",
  },
  {
    capability: "watermark_removal",
    label: "去水印",
    billingUnit: "per_request",
    baseCredits: 12,
    estimatedCostPerUnit: 0.22,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "smart_background",
    label: "商品图 / 海报一键生成",
    billingUnit: "per_request",
    baseCredits: 18,
    estimatedCostPerUnit: 0.42,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_edit",
    label: "图片编辑",
    billingUnit: "per_request",
    baseCredits: 15,
    estimatedCostPerUnit: 0.35,
    providerDefault: "OpenAI",
  },
  {
    capability: "image_erase",
    label: "图片擦除",
    billingUnit: "per_request",
    baseCredits: 12,
    estimatedCostPerUnit: 0.28,
    providerDefault: "PicWish/佐糖",
  },
  {
    capability: "image_expansion",
    label: "扩图 / 外延生成",
    billingUnit: "per_request",
    baseCredits: 16,
    estimatedCostPerUnit: 0.32,
    providerDefault: "OpenAI",
  },
  {
    capability: "image_ocr",
    label: "图片 OCR / 文案提取",
    billingUnit: "per_request",
    baseCredits: 4,
    estimatedCostPerUnit: 0.08,
    providerDefault: "PicWish/佐糖",
  },
];

export const AI_PLAN_DISCOUNTS: AiPlanDiscountPolicy[] = [
  { planId: "lite", multiplier: 1.08, label: "入门加价" },
  { planId: "creator", multiplier: 1, label: "标准" },
  { planId: "pro", multiplier: 0.95, label: "Pro 95 折" },
  { planId: "studio", multiplier: 0.85, label: "Studio 85 折" },
  { planId: "business", multiplier: 0.82, label: "Business 82 折" },
];

export function getAiBillingPolicy(capability: AiBillingCapability) {
  return AI_CREDIT_POLICIES.find((item) => item.capability === capability) || AI_CREDIT_POLICIES[0];
}

export function getAiPlanDiscount(planId?: string) {
  return AI_PLAN_DISCOUNTS.find((item) => item.planId === planId) || AI_PLAN_DISCOUNTS[1];
}

export function quoteAiUsage(input: {
  capability: AiBillingCapability;
  outputCount?: number;
  planId?: string;
}) {
  const policy = getAiBillingPolicy(input.capability);
  const discount = getAiPlanDiscount(input.planId);
  const outputCount = Math.max(1, Math.round(input.outputCount || 1));
  const rawCredits = policy.billingUnit === "per_image"
    ? policy.baseCredits * outputCount + (policy.perOutputCredits || 0) * Math.max(0, outputCount - 1)
    : policy.baseCredits;
  const chargedCredits = Math.max(1, Math.round(rawCredits * discount.multiplier));
  const estimatedCost = Number((policy.estimatedCostPerUnit * (policy.billingUnit === "per_image" ? outputCount : 1)).toFixed(2));

  return {
    policy,
    discount,
    chargedCredits,
    estimatedCost,
  };
}
