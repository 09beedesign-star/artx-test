export type MembershipPlanId = "lite" | "creator" | "pro" | "studio" | "business";
export type BillingCycleId = "monthly" | "quarterly" | "annual";

export interface MembershipPlan {
  id: MembershipPlanId;
  name: string;
  shortName: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  monthlyCredits: number;
  audience: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
}

export interface BillingCycle {
  id: BillingCycleId;
  label: string;
  months: number;
  multiplier: number;
  badge: string;
  bonusRate: number;
  creditRule: string;
  recommended?: boolean;
}

export interface PlanQuote {
  plan: MembershipPlan;
  cycle: BillingCycle;
  price: number;
  monthlyEquivalent: number;
  baseCredits: number;
  bonusCredits: number;
  totalCredits: number;
  creditsPerYuan: number;
  unitPrice: number;
}

export const MEMBERSHIP_CREDITS_PER_HKD = 170;

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "lite",
    name: "Lite 入门版",
    shortName: "Lite",
    monthlyPrice: 29,
    quarterlyPrice: 78,
    annualPrice: 266,
    monthlyCredits: 5000,
    audience: "灵感探索、个人创作、轻量商用",
    tagline: "用一杯咖啡的预算，把日常灵感快速变成可用图片、文案和视觉草稿。",
    features: ["每月 5,000 创作积分", "标准 AI 生图与智能编辑", "提示词优化与 AI 文案", "个人画布与历史记录"],
  },
  {
    id: "creator",
    name: "Creator 创作者版",
    shortName: "Creator",
    monthlyPrice: 179,
    quarterlyPrice: 483,
    annualPrice: 1643,
    monthlyCredits: 32000,
    audience: "图文、电商图、社媒内容",
    tagline: "给内容创作者和小商家更稳的月度额度。",
    features: ["高清图片生成", "商品图编辑", "社媒封面模板", "基础批量任务"],
  },
  {
    id: "pro",
    name: "Pro 专业版",
    shortName: "Pro",
    monthlyPrice: 99,
    quarterlyPrice: 267,
    annualPrice: 908,
    monthlyCredits: 18000,
    audience: "高频创作、电商内容、商单交付",
    tagline: "主推专业档，用更低成本覆盖商品图、海报、社媒视觉和日常商单产出。",
    features: ["每月 18,000 创作积分", "完整标准图片模型", "高质量模型关键交付权益", "优先队列与商业创作工具"],
    recommended: true,
  },
  {
    id: "studio",
    name: "Studio 工作室版",
    shortName: "Studio",
    monthlyPrice: 249,
    quarterlyPrice: 672,
    annualPrice: 2285,
    monthlyCredits: 42000,
    audience: "小团队、工作室、批量商业生产",
    tagline: "为连续交付准备的高额度套餐，让团队稳定生产商品图、广告图和多平台素材。",
    features: ["每月 42,000 创作积分", "Pro 全部专业能力", "高质量模型重点项目权益", "更高优先级与批量生产能力"],
  },
  {
    id: "business",
    name: "Business 团队版",
    shortName: "Business",
    monthlyPrice: 1599,
    quarterlyPrice: 4317,
    annualPrice: 14679,
    monthlyCredits: 280000,
    audience: "机构、视频/批量内容生产",
    tagline: "面向机构和高成本模型用户，额度更足且单价最低。",
    features: ["机构级额度", "高级视频模型", "最高优先级", "对账与风险提示"],
  },
];

export const BILLING_CYCLES: BillingCycle[] = [
  {
    id: "monthly",
    label: "月付",
    months: 1,
    multiplier: 1,
    badge: "低门槛",
    bonusRate: 0,
    creditRule: "会员积分按周期发放，未使用积分到期不结转；套餐积分已按高感知展示口径定额发放",
  },
  {
    id: "quarterly",
    label: "季度",
    months: 3,
    multiplier: 3,
    badge: "季付优惠",
    bonusRate: 0,
    creditRule: "会员积分按周期发放，未使用积分到期不结转；套餐积分已按高感知展示口径定额发放",
  },
  {
    id: "annual",
    label: "全年",
    months: 12,
    multiplier: 12,
    badge: "年付优惠",
    bonusRate: 0,
    creditRule: "会员积分按周期发放，未使用积分到期不结转；套餐积分已按高感知展示口径定额发放",
    recommended: true,
  },
];

export const CREDIT_COST_RULES = [
  { task: "提示词优化 / 文案生成", credits: "20 积分 / 次" },
  { task: "普通图片生成", credits: "按模型计费：80-1,200 积分 / 张" },
  { task: "高清图片生成", credits: "180 积分 / 次" },
  { task: "图片编辑、扩图、抠图、去水印", credits: "120-220 积分 / 次" },
  { task: "商品图 / 海报一键生成", credits: "240 积分 / 次" },
  { task: "普通短视频", credits: "1,200-3,000 积分 / 条" },
  { task: "高级视频模型", credits: "3,500-9,000 积分 / 条" },
];

export function getPlanQuote(plan: MembershipPlan, cycle: BillingCycle): PlanQuote {
  const cyclePrices: Record<BillingCycleId, number> = {
    monthly: plan.monthlyPrice,
    quarterly: plan.quarterlyPrice,
    annual: plan.annualPrice,
  };
  const price = cyclePrices[cycle.id];
  const totalCredits = plan.monthlyCredits * cycle.months;
  const baseCredits = totalCredits;
  const bonusCredits = 0;
  const creditsPerYuan = totalCredits / price;
  const unitPrice = price / totalCredits;

  return {
    plan,
    cycle,
    price,
    monthlyEquivalent: Math.round(price / cycle.months),
    baseCredits,
    bonusCredits,
    totalCredits,
    creditsPerYuan,
    unitPrice,
  };
}

export function formatCurrency(value: number) {
  return `HKD ${value.toLocaleString("zh-HK")}`;
}

export function formatCredits(value: number) {
  return value.toLocaleString("zh-CN");
}

export const CREDIT_RECHARGE_RATE = 100;

export function quoteCreditRecharge(amount: number) {
  const normalizedAmount = Math.max(0, Math.round(amount));
  return {
    amount: normalizedAmount,
    credits: normalizedAmount * CREDIT_RECHARGE_RATE,
  };
}
