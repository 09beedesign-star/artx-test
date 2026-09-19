/**
 * 面向终端用户的「积分规则」数据层。
 *
 * 订阅/充值页的积分板块、/credits-guide 规则页都从这里取数，
 * 保证「同一句话在任何出口都是同一个数字」。
 *
 * ⚠️ 本文件**不许出现硬编码的积分或价格数字**（文案里的说明性文字除外）。
 * 真实的定价散落在三处真相源：
 *   - ai-credit-policy.ts  按模型、按分辨率的具体单价
 *   - billing-config.ts    套餐月度额度、充值兑换比例、首充/邀请赠送策略
 * 这里只做「换算 + 组装」。一旦在这里写死 70 / 350 / 170，
 * 定价调整后用户看到的仍是旧数字 —— 与 CREDIT_EXPIRY_RULES 那次
 * 「承诺与实现长期不一致」是同一类合规问题。
 */
import {
  AI_IMAGE_RESOLUTION_POLICIES,
  getAiImageModelCreditPolicy,
  quoteAiUsage,
  type AiBillingCapability,
  type AiImageResolutionTier,
} from "./ai-credit-policy";
import {
  CREDIT_EXPIRY_RULES,
  CREDIT_RECHARGE_TIERS,
  FIRST_RECHARGE_BONUS,
  INVITE_REWARD_CONFIG,
  MEMBERSHIP_PLANS,
  SIGNUP_INITIAL_CREDITS,
  SUBSCRIPTION_PLAN_IDS,
  quoteCreditRecharge,
} from "./billing-config";

/**
 * 全站默认出图档。
 *
 * 所有「一张图多少钱」「350 积分能出几张」的换算都以它为基准 ——
 * 它是 AI_IMAGE_MODEL_CREDIT_POLICIES 里的 medium 档，也是 InfiniteCanvas
 * 不选模型时的实际扣费档。用 low 会虚报得很便宜，用 high 会把用户吓跑，
 * 只有默认档是「用户什么都不改就会遇到的价格」。
 */
export const REFERENCE_IMAGE_MODEL_ID = "vod-og25-sunburst-medium";

/** 默认档一张 1K 图的积分单价。由 quoteAiUsage 现算。 */
export const REFERENCE_IMAGE_CREDITS = quoteAiUsage({
  capability: "text_to_image",
  model: REFERENCE_IMAGE_MODEL_ID,
}).chargedCredits;

export type UnitCreditRow = {
  id: string;
  label: string;
  hint: string;
  credits: number;
  /** 计费单位的人话说法：按张还是按次。 */
  unit: string;
};

/**
 * 单位消耗表的能力清单。
 *
 * 这里只有**文案**与取数口径，没有任何数字 —— 价格全由 quoteAiUsage 现算。
 *
 * ⚠️ text_to_image 必须带上 REFERENCE_IMAGE_MODEL_ID 才能拿到真实单价：
 * AI_CREDIT_POLICIES 里它的 baseCredits 是兜底价，实际扣费走模型策略表，
 * 两者不一致。不带 model 会向用户报出一个他永远不会遇到的价格。
 */
const UNIT_CAPABILITY_ORDER: Array<{
  capability: AiBillingCapability;
  label: string;
  hint: string;
  model?: string;
}> = [
  {
    capability: "text_to_image",
    label: "标准 AI 出图",
    hint: "默认档 · 1K 分辨率",
    model: REFERENCE_IMAGE_MODEL_ID,
  },
  { capability: "image_edit", label: "局部重绘 / 编辑改图", hint: "只改一处，不再整张重出" },
  { capability: "background_removal", label: "智能抠图 / 去背景", hint: "电商主图刚需" },
  { capability: "image_expansion", label: "扩图 / 智能补边", hint: "改横版竖版不重画" },
  { capability: "watermark_removal", label: "去水印", hint: "素材二次处理" },
  { capability: "image_erase", label: "杂物擦除", hint: "抹掉画面里的多余元素" },
  { capability: "image_enhance", label: "画质增强 / 高清重绘", hint: "把草图抬到可交付画质" },
  { capability: "image_ocr", label: "图片文字识别", hint: "图上文案一键提取" },
  { capability: "text_generation", label: "提示词优化 / AI 文案", hint: "最便宜的起点" },
  { capability: "smart_background", label: "商品图 / 海报一键合成", hint: "一次成片的最高阶玩法" },
];

export function buildUnitCreditRows(): UnitCreditRow[] {
  return UNIT_CAPABILITY_ORDER.map(({ capability, label, hint, model }) => {
    const quote = quoteAiUsage({ capability, model });
    return {
      id: capability,
      label,
      hint,
      credits: quote.chargedCredits,
      unit: quote.policy.billingUnit === "per_image" ? "张" : "次",
    };
  });
}

export type ImageQualityRung = {
  id: string;
  label: string;
  hint: string;
  credits: number;
  /** 一份注册礼包够出几张。 */
  welcomeImages: number;
};

/** 出图三档。model 必须是策略表里真实存在的 id，否则单价不会变。 */
const IMAGE_QUALITY_RUNGS: Array<{
  id: string;
  model: string;
  label: string;
  hint: string;
}> = [
  {
    id: "low",
    model: "vod-og25-sunburst-low",
    label: "草稿快出",
    hint: "批量试构图、筛创意阶段用",
  },
  {
    id: "medium",
    model: REFERENCE_IMAGE_MODEL_ID,
    label: "标准出图",
    hint: "全站默认档，日常主力",
  },
  {
    id: "high",
    model: "vod-og25-sunburst-high",
    label: "高保真交付",
    hint: "商单、主视觉、印刷级细节",
  },
];

export function buildImageQualityLadder(): ImageQualityRung[] {
  return IMAGE_QUALITY_RUNGS.map(({ id, model, label, hint }) => {
    const perImage =
      getAiImageModelCreditPolicy(model)?.creditsPerImage || REFERENCE_IMAGE_CREDITS;
    return {
      id,
      label,
      hint,
      credits: perImage,
      welcomeImages: imagesFromCredits(SIGNUP_INITIAL_CREDITS.credits, perImage),
    };
  });
}

export type ResolutionRung = {
  id: AiImageResolutionTier;
  label: string;
  credits: number;
  /**
   * 相对 1K 的**积分**倍率（保留两位）。
   *
   * ⚠️ 刻意低于成本倍率：2K 上游成本 ×2.33 只收 ×2.14，
   * 这部分是平台替用户承担的，文案里要如实说清楚。
   */
  creditsMultiplier: number;
  /** 相对 1K 的**成本**倍率。 */
  costMultiplier: number;
  /** 是否真的向上游下发该分辨率。false = 4K 出图后本地放大。 */
  nativeUpstream: boolean;
  /**
   * 该档是否由平台补贴 —— 积分倍率低于成本倍率。
   *
   * ⚠️ 8K 这个字段为 false：它与 4K 用同一份上游成本，但因为走了本地
   * 算力放大（且相比 4K 没有真实画质增益），积分倍率反而更高。
   * 面向用户的文案**不许**把 8K 也说成「平台补贴」。
   */
  isSubsidized: boolean;
};

export function buildResolutionLadder(): ResolutionRung[] {
  return AI_IMAGE_RESOLUTION_POLICIES.map(policy => {
    const quote = quoteAiUsage({
      capability: "text_to_image",
      model: REFERENCE_IMAGE_MODEL_ID,
      resolutionTier: policy.tier,
    });
    return {
      id: policy.tier,
      label: policy.label,
      credits: quote.chargedCredits,
      creditsMultiplier: policy.creditsMultiplier,
      costMultiplier: policy.costMultiplier,
      nativeUpstream: policy.nativeUpstream,
      isSubsidized: policy.creditsMultiplier < policy.costMultiplier,
    };
  });
}

export type PlanValueRow = {
  id: string;
  name: string;
  monthlyCredits: number;
  monthlyPrice: number;
  /** 每 1 HKD 能换到多少会员积分 —— 订阅真正的「汇率」。 */
  creditsPerHkd: number;
  /** 每月额度换算成默认档出图张数。 */
  imagesPerMonth: number;
};

/**
 * 只在售套餐的价值表。
 *
 * ⚠️ 必须走 SUBSCRIPTION_PLAN_IDS 而不是 MEMBERSHIP_PLANS：
 * 后者是定价表，含 Creator / Business 这两个**订阅页不售卖**的历史档位
 * （见 billing-config.ts 顶部注释）。对着不可买的套餐做对比会误导用户。
 */
export function buildPlanValueRows(): PlanValueRow[] {
  return SUBSCRIPTION_PLAN_IDS.flatMap<PlanValueRow>(id => {
    const plan = MEMBERSHIP_PLANS.find(item => item.id === id);
    // 货架上的 id 在定价表里一定存在；缺失时跳过而不是补默认值，
    // 免得把「找不到」渲染成一张价格全是 0 的卡。
    if (!plan) return [];
    return [
      {
        id: plan.id,
        name: plan.shortName,
        monthlyCredits: plan.monthlyCredits,
        monthlyPrice: plan.monthlyPrice,
        creditsPerHkd: Math.round(plan.monthlyCredits / plan.monthlyPrice),
        imagesPerMonth: imagesFromCredits(plan.monthlyCredits, REFERENCE_IMAGE_CREDITS),
      },
    ];
  });
}

export type RechargeRow = {
  minAmount: number;
  creditsPerHkd: number;
  label: string;
  /** 按门槛金额充值能拿到的总积分。 */
  exampleCredits: number;
  /** 相对最低档多拿的百分比。 */
  boostPercent: number;
};

export function buildRechargeRows(): RechargeRow[] {
  const lowestRate = Math.min(...CREDIT_RECHARGE_TIERS.map(tier => tier.creditsPerHkd));
  return CREDIT_RECHARGE_TIERS.map(tier => ({
    minAmount: tier.minAmount,
    creditsPerHkd: tier.creditsPerHkd,
    label: tier.label,
    exampleCredits: quoteCreditRecharge(tier.minAmount).credits,
    boostPercent: Math.round((tier.creditsPerHkd / lowestRate - 1) * 100),
  }));
}

export type FreeCreditChannel = {
  id: "signup" | "first-recharge" | "invite";
  title: string;
  credits: number;
  /** 该通道单人累计可得上限。 */
  maxCredits: number;
  condition: string;
  validDays: number;
  /** 「能拿几次」的人话说法。 */
  repeatLabel: string;
};

/**
 * 三条「不用额外付费也能拿到」的积分通道。
 *
 * ⚠️ 有效期必须从把关处的同一份常量取：
 *   - 注册礼包走 SIGNUP_INITIAL_CREDITS.expiryDays（比通用赠送短得多）
 *   - 首充与邀请奖励都是 kind:"gift"，走 CREDIT_EXPIRY_RULES.gift.days
 * 写成统一口径会让用户以为注册礼包也能放 30 天。
 */
export function buildFreeCreditChannels(): FreeCreditChannel[] {
  const invitePerFriend =
    INVITE_REWARD_CONFIG.inviterCredits + INVITE_REWARD_CONFIG.inviteeCredits;
  return [
    {
      id: "signup",
      title: "注册即到账",
      credits: SIGNUP_INITIAL_CREDITS.credits,
      maxCredits: SIGNUP_INITIAL_CREDITS.credits,
      condition: "完成注册自动发放，无需绑卡、无需邀请码",
      validDays: SIGNUP_INITIAL_CREDITS.expiryDays,
      repeatLabel: "每人一次",
    },
    {
      id: "first-recharge",
      title: "首充立赠",
      credits: FIRST_RECHARGE_BONUS.credits,
      maxCredits: FIRST_RECHARGE_BONUS.credits,
      condition: `单笔充值满 HKD ${FIRST_RECHARGE_BONUS.minAmount} 即触发，在充值额度之外额外到账`,
      validDays: CREDIT_EXPIRY_RULES.gift.days,
      repeatLabel: "每账号一次",
    },
    {
      id: "invite",
      title: "邀请好友",
      credits: invitePerFriend,
      maxCredits: invitePerFriend * INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser,
      condition: `好友注册并完成首次付费（满 HKD ${INVITE_REWARD_CONFIG.minPaidAmountHkd}）后，你 ${INVITE_REWARD_CONFIG.inviterCredits} / 好友 ${INVITE_REWARD_CONFIG.inviteeCredits} 同时到账`,
      validDays: CREDIT_EXPIRY_RULES.gift.days,
      repeatLabel: `最多 ${INVITE_REWARD_CONFIG.maxRewardedInvitesPerUser} 人`,
    },
  ];
}

export type WelcomePackage = {
  enabled: boolean;
  credits: number;
  expiryDays: number;
  /** 换算基准：默认档一张图的单价。 */
  imageCredits: number;
  /** 礼包够出几张。 */
  freeImages: number;
  /** 活动截止日。undefined = 长期有效。 */
  activeUntil?: string;
};

export function getWelcomePackage(): WelcomePackage {
  return {
    enabled: SIGNUP_INITIAL_CREDITS.enabled,
    credits: SIGNUP_INITIAL_CREDITS.credits,
    expiryDays: SIGNUP_INITIAL_CREDITS.expiryDays,
    imageCredits: REFERENCE_IMAGE_CREDITS,
    freeImages: imagesFromCredits(
      SIGNUP_INITIAL_CREDITS.credits,
      REFERENCE_IMAGE_CREDITS,
    ),
    activeUntil: SIGNUP_INITIAL_CREDITS.activeUntil,
  };
}

/** 三条通道全部吃满时的累计积分。 */
export function buildFreeCreditTotal(): number {
  return buildFreeCreditChannels().reduce((sum, channel) => sum + channel.maxCredits, 0);
}

/**
 * 积分能换多少张默认档出图。
 *
 * ⚠️ 向下取整而不是四舍五入：向上取整会出现「350 积分能出 6 张」
 * 而实际第 6 张会被 402 拦下来的落差（用户对"我明明还有分"零容忍）。
 */
export function imagesFromCredits(credits: number, perImage: number): number {
  if (!Number.isFinite(credits) || !Number.isFinite(perImage) || perImage <= 0) return 0;
  return Math.max(0, Math.floor(credits / perImage));
}
