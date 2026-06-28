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

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "lite",
    name: "Lite 入门版",
    shortName: "Lite",
    monthlyPrice: 19,
    quarterlyPrice: 51,
    annualPrice: 174,
    monthlyCredits: 247,
    audience: "轻度体验、学生、低门槛转化",
    tagline: "适合刚开始用 AI 做图和文案的个人用户。",
    features: ["基础图片生成", "提示词优化", "标准队列", "每日登录奖励"],
  },
  {
    id: "creator",
    name: "Creator 创作者版",
    shortName: "Creator",
    monthlyPrice: 179,
    quarterlyPrice: 529,
    annualPrice: 1779,
    monthlyCredits: 3500,
    audience: "图文、电商图、社媒内容",
    tagline: "给内容创作者和小商家更稳的月度额度。",
    features: ["高清图片生成", "商品图编辑", "社媒封面模板", "基础批量任务"],
  },
  {
    id: "pro",
    name: "Pro 专业版",
    shortName: "Pro",
    monthlyPrice: 89,
    quarterlyPrice: 240,
    annualPrice: 817,
    monthlyCredits: 1157,
    audience: "高频设计、商单、核心推荐",
    tagline: "新平台主推档，覆盖高频创作同时保留毛利。",
    features: ["高级图片模型", "优先队列", "批量生成折扣", "商单工作流"],
    recommended: true,
  },
  {
    id: "studio",
    name: "Studio 工作室版",
    shortName: "Studio",
    monthlyPrice: 139,
    quarterlyPrice: 375,
    annualPrice: 1276,
    monthlyCredits: 1807,
    audience: "小团队、批量生成",
    tagline: "适合小团队批量产出海报、商品图和素材变体。",
    features: ["团队共享额度", "更高并发", "批量内容生产", "高级编辑工具"],
  },
  {
    id: "business",
    name: "Business 团队版",
    shortName: "Business",
    monthlyPrice: 1599,
    quarterlyPrice: 4799,
    annualPrice: 16799,
    monthlyCredits: 50000,
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
    creditRule: "每月一次性到账，当月有效，额外宽限 7 天",
  },
  {
    id: "quarterly",
    label: "季度",
    months: 3,
    multiplier: 2.7,
    badge: "9 折",
    bonusRate: 0,
    creditRule: "按月付总价 9 折结算，积分按实付金额统一增加 30% 算力点",
  },
  {
    id: "annual",
    label: "全年",
    months: 12,
    multiplier: 9.18,
    badge: "季度价再 85 折",
    bonusRate: 0,
    creditRule: "在季度优惠基础上再享 85 折，积分按实付金额统一增加 30% 算力点",
    recommended: true,
  },
];

export const CREDIT_COST_RULES = [
  { task: "提示词优化 / 文案生成", credits: "2 积分 / 次" },
  { task: "普通图片生成", credits: "10 积分 / 张" },
  { task: "高清图片生成", credits: "15 积分 / 次" },
  { task: "图片编辑、扩图、抠图、去水印", credits: "12-15 积分 / 次" },
  { task: "商品图 / 海报一键生成", credits: "18 积分 / 次" },
  { task: "普通短视频", credits: "120-300 积分 / 条" },
  { task: "高级视频模型", credits: "350-900 积分 / 条" },
];

export function getPlanQuote(plan: MembershipPlan, cycle: BillingCycle): PlanQuote {
  const price = Math.round(plan.monthlyPrice * cycle.multiplier);
  const totalCredits = Math.round(price * CREDIT_RECHARGE_RATE * 1.3);
  const baseCredits = Math.round(price * CREDIT_RECHARGE_RATE);
  const bonusCredits = totalCredits - baseCredits;
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

export const CREDIT_RECHARGE_RATE = 10;

export function quoteCreditRecharge(amount: number) {
  const normalizedAmount = Math.max(0, Math.round(amount));
  return {
    amount: normalizedAmount,
    credits: normalizedAmount * CREDIT_RECHARGE_RATE,
  };
}
