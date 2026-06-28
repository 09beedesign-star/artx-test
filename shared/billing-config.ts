export type MembershipPlanId = "lite" | "creator" | "pro" | "studio" | "business";
export type BillingCycleId = "monthly" | "quarterly" | "semiannual" | "annual" | "triennial";

export interface MembershipPlan {
  id: MembershipPlanId;
  name: string;
  shortName: string;
  monthlyPrice: number;
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
    monthlyCredits: 500,
    audience: "轻度体验、学生、低门槛转化",
    tagline: "适合刚开始用 AI 做图和文案的个人用户。",
    features: ["基础图片生成", "提示词优化", "标准队列", "每日登录奖励"],
  },
  {
    id: "creator",
    name: "Creator 创作者版",
    shortName: "Creator",
    monthlyPrice: 49,
    monthlyCredits: 1500,
    audience: "图文、电商图、社媒内容",
    tagline: "给内容创作者和小商家更稳的月度额度。",
    features: ["高清图片生成", "商品图编辑", "社媒封面模板", "基础批量任务"],
  },
  {
    id: "pro",
    name: "Pro 专业版",
    shortName: "Pro",
    monthlyPrice: 129,
    monthlyCredits: 4500,
    audience: "高频设计、商单、核心推荐",
    tagline: "新平台主推档，覆盖高频创作同时保留毛利。",
    features: ["高级图片模型", "优先队列", "批量生成折扣", "商单工作流"],
    recommended: true,
  },
  {
    id: "studio",
    name: "Studio 工作室版",
    shortName: "Studio",
    monthlyPrice: 329,
    monthlyCredits: 13000,
    audience: "小团队、批量生成",
    tagline: "适合小团队批量产出海报、商品图和素材变体。",
    features: ["团队共享额度", "更高并发", "批量内容生产", "高级编辑工具"],
  },
  {
    id: "business",
    name: "Business 团队版",
    shortName: "Business",
    monthlyPrice: 799,
    monthlyCredits: 35000,
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
    badge: "约 9 折",
    bonusRate: 0.05,
    creditRule: "每月发放套餐积分，额外送 5% 奖励积分",
  },
  {
    id: "semiannual",
    label: "半年",
    months: 6,
    multiplier: 5.1,
    badge: "约 85 折",
    bonusRate: 0.1,
    creditRule: "每月发放套餐积分，额外送 10% 奖励积分",
  },
  {
    id: "annual",
    label: "全年",
    months: 12,
    multiplier: 9.6,
    badge: "最划算",
    bonusRate: 0.2,
    creditRule: "每月发放套餐积分，额外送 20% 奖励积分",
    recommended: true,
  },
  {
    id: "triennial",
    label: "3 年",
    months: 36,
    multiplier: 25.2,
    badge: "创始锁价",
    bonusRate: 0.35,
    creditRule: "每月发放套餐积分，额外送 35% 奖励积分，锁定当前价格",
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
  const baseCredits = plan.monthlyCredits * cycle.months;
  const bonusCredits = Math.round(baseCredits * cycle.bonusRate);
  const totalCredits = baseCredits + bonusCredits;
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
  return `¥${value.toLocaleString("zh-CN")}`;
}

export function formatCredits(value: number) {
  return value.toLocaleString("zh-CN");
}
