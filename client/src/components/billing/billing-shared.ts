/**
 * 计费页 / 计费弹窗共用的常量、类型与网络层。
 *
 * ⚠️ 这个文件存在的唯一理由是「唯一事实源」。
 *
 * 画布里的充值弹窗和 /billing 页面展示的是同一批套餐、同一批充值档位、
 * 走的是同一套下单与轮询接口。如果两边各写一份，以后改价格、改文案、
 * 改接口路径就必然只改到一个出口 —— 这是本项目已经踩过九次的坑
 * （「同一份数据的多个出口」），表现为零报错但功能等于没做。
 *
 * 所以：**任何计费相关的数据与逻辑都只允许写在这里**，
 * BillingPage 与 BillingDialog 都只负责把它渲染出来。
 */
import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "@/lib/api-base-url";
import {
  FREE_PLAN_DISPLAY_NAME,
  quoteCreditRecharge,
  type MembershipPlanId,
} from "@shared/billing-config";

export type BillingTab = "subscription" | "recharge";
export type PaymentMethod = "wechat" | "alipay";

export const billingTabs: Array<{
  id: BillingTab;
  label: string;
  description: string;
}> = [
  { id: "subscription", label: "订阅服务", description: "整体创作服务订阅" },
  { id: "recharge", label: "积分充值", description: "额外购买可用创作额度" },
];

export const paymentMethods: Array<{
  id: PaymentMethod;
  label: string;
  hint: string;
}> = [
  { id: "wechat", label: "微信支付", hint: "使用微信扫码" },
  { id: "alipay", label: "支付宝", hint: "使用支付宝扫码" },
];

/**
 * ⚠️ 这里**不允许出现任何积分数字**。
 *
 * 历史问题：features 里曾硬编码「每月 8,000 / 28,000 / 80,000 创作积分」，
 * 与 MEMBERSHIP_PLANS[].monthlyCredits 各自一份，改了额度或切换计费周期
 * 后卡片文案不会跟着变，用户看到的月/季/年额度互相对不上（用户已反馈过）。
 * 现在额度那条由 buildCreditFeature() 从 getPlanQuote() 现算，
 * 这个数组只保留与额度无关的权益描述。`creditsNote` 是额度句的后半句尾巴。
 */
export const subscriptionPlans = [
  {
    id: "lite" as MembershipPlanId,
    audience: "灵感探索与个人创作",
    highlight: false,
    level: 1,
    creditsNote: "轻松开始",
    features: [
      { label: "标准 AI 生图、提示词优化与文案共创", included: true },
      { label: "图片上传、画布编辑与历史记录保存", included: true },
      { label: "高质量模型与商单高速队列", included: false },
      { label: "团队批量生产与高峰优先通道", included: false },
    ],
  },
  {
    id: "pro" as MembershipPlanId,
    audience: "高频创作与商单交付",
    highlight: true,
    level: 2,
    creditsNote: "覆盖稳定产出",
    features: [
      { label: "完整标准图片模型与商业图片工具", included: true },
      { label: "高质量模型关键交付权益", included: true },
      { label: "优先队列、智能产品图、HD 与局部编辑", included: true },
      { label: "团队级并发额度池", included: false },
    ],
  },
  {
    id: "studio" as MembershipPlanId,
    audience: "团队与批量商业项目",
    highlight: false,
    level: 3,
    creditsNote: "支持连续生产",
    features: [
      { label: "Pro 全部专业能力与商业工作流", included: true },
      { label: "高质量模型重点项目权益", included: true },
      { label: "更高优先级、批量生成与团队协作预留", included: true },
      { label: "用量报表与高峰期任务通道预留", included: true },
    ],
  },
];

export const rechargePacks = [
  {
    id: "pack-small",
    name: "轻量补充",
    credits: "HKD 10 起 · 130 积分/HKD",
    placeholder: "例如 50",
    usage: "临时补充生成额度",
    perks: [
      { label: "标准图片生成额度", included: true },
      { label: "基础智能编辑消耗抵扣", included: true },
      { label: "高峰期优先排队", included: false },
      { label: "批量商品图专属通道", included: false },
    ],
  },
  {
    id: "pack-growth",
    name: "增长补充",
    credits: "HKD 150 起 · 150 积分/HKD",
    placeholder: "例如 150",
    usage: "适合连续作业",
    perks: [
      { label: "高清图片生成额度", included: true },
      { label: "智能产品图与去背景抵扣", included: true },
      { label: "高峰期优先排队", included: true },
      { label: "团队级并发加速", included: false },
    ],
  },
  {
    id: "pack-scale",
    name: "规模补充",
    credits: "HKD 500 起 · 170 积分/HKD",
    placeholder: "例如 500",
    usage: "适合批量生成与团队项目",
    perks: [
      { label: "批量商业图生成额度", included: true },
      { label: "智能产品图高频消耗抵扣", included: true },
      { label: "高峰期优先排队", included: true },
      { label: "大批量任务专属通道", included: true },
    ],
  },
];

export type BillingOrderResponse = {
  order?: {
    id: string;
    amount: number;
    planName: string;
    cycleLabel: string;
    credits?: number;
    status: string;
  };
  error?: string;
};

export type BillingPayResponse = {
  payment?: {
    provider: "wallyt";
    payUrl: string;
    payUrlType: "qr" | "redirect";
    channelType: string;
  };
  error?: string;
};

export type BillingSummaryResponse = {
  balance?: number;
  plan?: string;
  orders?: Array<{
    id: string;
    status: string;
    amount: number;
    credits: number;
  }>;
  error?: string;
};

export type BillingStatusResponse = {
  order?: {
    id: string;
    status: "paid" | "pending" | "failed" | "refunded";
    amount: number;
    expectedCredits?: number;
  };
  error?: string;
};

export class BillingAuthExpiredError extends Error {
  constructor(message = "登录已失效，请重新登录") {
    super(message);
    this.name = "BillingAuthExpiredError";
  }
}

/**
 * 生成套餐卡片里的额度条目。
 *
 * ⚠️ 必须同时体现「每月到账」和「共几期」：会员积分是按月发放的，
 * 年卡 336,000 分 12 期给，只写总额会让用户以为付完立刻全额到账；
 * 只写每月又会让年卡和月卡的卡片看起来完全一样。
 * 另外必须带上结转口径，否则用户会以为每月额度可以无限累积。
 */
export function buildCreditFeature(
  creditsPerPeriod: number,
  periods: number,
  totalCredits: number,
  cycleLabel: string,
  note: string,
) {
  const monthly = creditsPerPeriod.toLocaleString("zh-HK");
  if (periods > 1) {
    return {
      label: `每月到账 ${monthly} 创作积分，${cycleLabel}共 ${periods} 期（累计 ${totalCredits.toLocaleString("zh-HK")}），${note}`,
      included: true,
    };
  }
  return { label: `每月到账 ${monthly} 创作积分，${note}`, included: true };
}

export function readInitialTab(): BillingTab {
  if (typeof window === "undefined") return "subscription";
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "recharge" ? value : "subscription";
}

export function getBillingApiBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    ""
  );

  if (configured) return configured;
  return ART_X_TEST_API_BASE_URL;
}

export function isQrImagePayUrl(payUrl: string) {
  return (
    /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(payUrl) ||
    /pay\.wepayez\.com\/pay\/qrcode/i.test(payUrl)
  );
}

export function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

/**
 * 支付成功后广播余额，TopBar 侧监听这个事件刷新右上角积分。
 *
 * ⚠️ 弹窗形态下这条尤其关键：用户在画布里充完值不会再跳到 /billing，
 * 页面根本不会重新挂载，右上角的数字**只能**靠这个事件更新。
 */
export function notifyCreditsUpdated(balance: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("artx:credits-updated", {
      detail: { balance },
    })
  );
}

export function formatRechargePreview(amount: number) {
  const quote = quoteCreditRecharge(amount);
  const credits = quote.credits.toLocaleString("zh-HK");
  if (quote.amount <= 0) return `${credits} 积分`;
  return `${credits} 积分 · ${quote.creditsPerHkd} 积分/HKD`;
}

export function clearExpiredAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("artx-auth-session");
  window.dispatchEvent(
    new CustomEvent("artx:login-required", {
      detail: { reason: "billing-auth-expired" },
    })
  );
}

export function normalizePlanDisplayName(planName?: string | null) {
  const raw = String(planName || "").trim();
  if (!raw) return FREE_PLAN_DISPLAY_NAME;
  const normalized = raw.toLowerCase();
  // Free 系别名先判，避免被下面的 Lite 分支吞掉。
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "demo" ||
    normalized === FREE_PLAN_DISPLAY_NAME.toLowerCase() ||
    normalized.includes("免费")
  ) {
    return FREE_PLAN_DISPLAY_NAME;
  }
  if (
    normalized.includes("积分充值") ||
    normalized.includes("recharge")
  ) {
    return "Lite 入门版";
  }

  if (
    normalized.includes("studio") ||
    normalized.includes("business") ||
    normalized.includes("工作室") ||
    normalized.includes("团队")
  ) {
    return "Studio 工作室版";
  }
  if (normalized.includes("pro") || normalized.includes("专业")) {
    return "Pro 专业版";
  }
  if (
    normalized.includes("lite") ||
    normalized.includes("creator") ||
    normalized.includes("入门") ||
    normalized.includes("创作者") ||
    normalized.includes("基础")
  ) {
    return "Lite 入门版";
  }

  return FREE_PLAN_DISPLAY_NAME;
}

export function getSubscribedPlanId(planName?: string | null): MembershipPlanId | null {
  const raw = String(planName || "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "demo" ||
    normalized === FREE_PLAN_DISPLAY_NAME.toLowerCase() ||
    normalized.includes("免费") ||
    normalized.includes("积分充值") ||
    normalized.includes("recharge")
  ) {
    return null;
  }
  if (
    normalized.includes("studio") ||
    normalized.includes("business") ||
    normalized.includes("工作室") ||
    normalized.includes("团队")
  ) {
    return "studio";
  }
  if (normalized.includes("pro") || normalized.includes("专业")) {
    return "pro";
  }
  if (
    normalized.includes("lite") ||
    normalized.includes("creator") ||
    normalized.includes("入门") ||
    normalized.includes("创作者") ||
    normalized.includes("基础")
  ) {
    return "lite";
  }
  return null;
}

export function deriveSubscriptionDisplay(planName?: string | null) {
  const subscribedPlanId = getSubscribedPlanId(planName);
  const currentPlan = subscribedPlanId
    ? normalizePlanDisplayName(planName)
    : "未订阅";
  return {
    currentPlan,
    subscribedPlanId,
    subscriptionStatus: subscribedPlanId ? `已订阅 ${currentPlan}` : "未订阅",
  };
}

export function getSubscriptionPlanLevel(planId: MembershipPlanId | null) {
  if (!planId) return 0;
  return subscriptionPlans.find(plan => plan.id === planId)?.level || 0;
}

export function normalizeRechargeAmount(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 6);
}

export function validateRechargeAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 10)
    return "请输入不低于 HKD 10 的充值金额";
  if (amount % 5 !== 0) return "充值金额必须以 0 或 5 结尾";
  return "";
}

export async function billingFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  let response: Response;
  try {
    response = await fetch(`${getBillingApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("测试后端支付接口暂时不可访问，请稍后重试");
  }
  if (response.status === 429) {
    throw new Error("支付请求过于频繁，请稍等 1 分钟后再试。");
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("测试后端支付接口还未部署完成，请稍后再试");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new BillingAuthExpiredError(
      typeof data?.error === "string" ? data.error : undefined
    );
  }
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : "请求失败，请稍后重试"
    );
  }
  return data as T;
}
