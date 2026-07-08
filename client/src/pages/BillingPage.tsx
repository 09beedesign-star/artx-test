import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Crown,
  Rocket,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import TopBar from "@/components/workspace/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "@/lib/api-base-url";
import { BG_GLOW } from "@/lib/workspace-data";
import {
  BILLING_CYCLES,
  MEMBERSHIP_PLANS,
  formatCurrency,
  getPlanQuote,
  quoteCreditRecharge,
  type BillingCycleId,
  type MembershipPlanId,
} from "@shared/billing-config";

type BillingTab = "subscription" | "recharge";
type PaymentMethod = "wechat" | "alipay";

const billingTabs: Array<{
  id: BillingTab;
  label: string;
  description: string;
}> = [
  { id: "subscription", label: "订阅服务", description: "整体创作服务订阅" },
  { id: "recharge", label: "积分充值", description: "额外购买可用创作额度" },
];

const paymentMethods: Array<{
  id: PaymentMethod;
  label: string;
  hint: string;
}> = [
  { id: "wechat", label: "微信支付", hint: "使用微信扫码" },
  { id: "alipay", label: "支付宝", hint: "使用支付宝扫码" },
];
const ALIPAY_LOGO_SOURCE_URL = "https://huaban.com/pins/5786389200";
const WECHAT_PAY_LOGO_SOURCE_URL = "https://huaban.com/pins/3526742319";

const subscriptionPlans = [
  {
    id: "lite" as MembershipPlanId,
    audience: "个人创作者",
    highlight: false,
    level: 1,
    features: [
      { label: "AI 对话与提示词共创", included: true },
      { label: "基础图片生成与智能编辑", included: true },
      { label: "智能背景基础队列", included: true },
      { label: "4K 高清优先导出", included: false },
      { label: "批量商业图高速队列", included: false },
    ],
  },
  {
    id: "pro" as MembershipPlanId,
    audience: "高频创作与电商内容",
    highlight: true,
    level: 2,
    features: [
      { label: "GPT + Image Two + Nano Banana 能力池", included: true },
      { label: "批量图片生成", included: true },
      { label: "高清导出与 HD 提升", included: true },
      { label: "商品图优先排队", included: true },
      { label: "团队并发额度池", included: false },
    ],
  },
  {
    id: "studio" as MembershipPlanId,
    audience: "团队与商业项目",
    highlight: false,
    level: 3,
    features: [
      { label: "多人项目协作预留", included: true },
      { label: "商业画板与素材管理", included: true },
      { label: "最高图片生成并发占位", included: true },
      { label: "专属高峰期任务通道", included: true },
      { label: "发票与用量报表预留", included: true },
    ],
  },
];

type BillingOrderResponse = {
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

type BillingPayResponse = {
  payment?: {
    provider: "wallyt";
    payUrl: string;
    payUrlType: "qr" | "redirect";
    channelType: string;
  };
  error?: string;
};

type BillingSummaryResponse = {
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

type BillingStatusResponse = {
  order?: {
    id: string;
    status: "paid" | "pending" | "failed" | "refunded";
    amount: number;
    expectedCredits?: number;
  };
  error?: string;
};

class BillingAuthExpiredError extends Error {
  constructor(message = "登录已失效，请重新登录") {
    super(message);
    this.name = "BillingAuthExpiredError";
  }
}

const rechargePacks = [
  {
    id: "pack-small",
    name: "轻量补充",
    credits: "小额积分包",
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
    credits: "中额积分包",
    placeholder: "例如 150",
    usage: "适合连续作业",
    perks: [
      { label: "高清图片生成额度", included: true },
      { label: "智能背景与去背景抵扣", included: true },
      { label: "高峰期优先排队", included: true },
      { label: "团队级并发加速", included: false },
    ],
  },
  {
    id: "pack-scale",
    name: "规模补充",
    credits: "大额积分包",
    placeholder: "例如 500",
    usage: "适合批量生成与团队项目",
    perks: [
      { label: "批量商业图生成额度", included: true },
      { label: "智能背景高频消耗抵扣", included: true },
      { label: "高峰期优先排队", included: true },
      { label: "大批量任务专属通道", included: true },
    ],
  },
];

function readInitialTab(): BillingTab {
  if (typeof window === "undefined") return "subscription";
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "recharge" ? value : "subscription";
}

function getBillingApiBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    ""
  );

  if (configured) return configured;
  return ART_X_TEST_API_BASE_URL;
}

function isQrImagePayUrl(payUrl: string) {
  return (
    /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(payUrl) ||
    /pay\.wepayez\.com\/pay\/qrcode/i.test(payUrl)
  );
}

function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

function notifyCreditsUpdated(balance: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("artx:credits-updated", {
      detail: { balance },
    })
  );
}

function clearExpiredAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("artx-auth-session");
  window.dispatchEvent(
    new CustomEvent("artx:login-required", {
      detail: { reason: "billing-auth-expired" },
    })
  );
}

function normalizePlanDisplayName(planName?: string | null) {
  const raw = String(planName || "").trim();
  if (!raw) return "Lite 入门版";
  const normalized = raw.toLowerCase();
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "demo" ||
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

  return "Lite 入门版";
}

function getSubscribedPlanId(planName?: string | null): MembershipPlanId | null {
  const raw = String(planName || "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (
    normalized === "free" ||
    normalized === "starter" ||
    normalized === "demo" ||
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

function deriveSubscriptionDisplay(planName?: string | null) {
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

function getSubscriptionPlanLevel(planId: MembershipPlanId | null) {
  if (!planId) return 0;
  return subscriptionPlans.find(plan => plan.id === planId)?.level || 0;
}

async function billingFetch<T>(
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

function PaymentMethodLogo({
  method,
  compact = false,
}: {
  method: PaymentMethod;
  compact?: boolean;
}) {
  const size = compact ? 18 : 34;
  const proxiedLogoSrc = (sourceUrl: string) =>
    `${getBillingApiBaseUrl()}/api/images/proxy?url=${encodeURIComponent(sourceUrl)}`;
  if (method === "alipay") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md-design)]"
        style={{ width: size, height: size, background: "#1677FF" }}
        aria-label="支付宝 logo"
      >
        <img
          src={proxiedLogoSrc(ALIPAY_LOGO_SOURCE_URL)}
          alt="支付宝 logo"
          width={size}
          height={size}
          className="block h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md-design)]"
      style={{ width: size, height: size, background: "#FFFFFF" }}
      aria-label="微信支付 logo"
    >
      <img
        src={proxiedLogoSrc(WECHAT_PAY_LOGO_SOURCE_URL)}
        alt="微信支付 logo"
        width={size}
        height={size}
        className="block h-full w-full object-cover"
        loading="lazy"
      />
    </span>
  );
}

export default function BillingPage() {
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<BillingTab>(() =>
    readInitialTab()
  );
  const [activeCycle, setActiveCycle] = useState<BillingCycleId>("monthly");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>("wechat");
  const [selectedPlanId, setSelectedPlanId] = useState<MembershipPlanId>("pro");
  const [hoveredPlanId, setHoveredPlanId] = useState<MembershipPlanId | null>(
    null
  );
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [currentPlan, setCurrentPlan] = useState("未订阅");
  const [subscribedPlanId, setSubscribedPlanId] =
    useState<MembershipPlanId | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("未订阅");
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [rechargeAmounts, setRechargeAmounts] = useState<
    Record<string, string>
  >({
    "pack-small": "50",
    "pack-growth": "150",
    "pack-scale": "500",
  });
  const [payingRechargeId, setPayingRechargeId] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean;
    type: "subscription" | "recharge";
    orderId: string;
    payUrl: string;
    title: string;
    amount: number;
    credits: number;
    paymentMethod: PaymentMethod;
    cycleLabel?: string;
    status: "pending" | "success";
  } | null>(null);
  const [successDialog, setSuccessDialog] = useState<{
    open: boolean;
    type: "subscription" | "recharge";
    title: string;
    amount: number;
    credits: number;
    cycleLabel?: string;
  } | null>(null);

  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "#222222" : "var(--design-surface-soft)";
  const panel = isDark ? "#222222" : "oklch(1 0 0 / 0.82)";
  const panelStrong = isDark ? "#222222" : "oklch(1 0 0 / 0.94)";
  const border = isDark ? "oklch(1 0 0 / 9%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.88 0.01 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.71 0.010 270)" : "oklch(0.64 0.010 255)";
  const faint = isDark ? "oklch(0.61 0.010 270)" : "oklch(0.71 0.010 255)";
  const green = "#C5ED47";
  const purple = "oklch(0.68 0.20 292)";
  const activePaymentMethod =
    paymentMethods.find(item => item.id === selectedPaymentMethod) ||
    paymentMethods[0];

  const cycleLabel = useMemo(
    () => BILLING_CYCLES.find(item => item.id === activeCycle)?.label || "月付",
    [activeCycle]
  );
  const activeCycleConfig = useMemo(
    () =>
      BILLING_CYCLES.find(item => item.id === activeCycle) || BILLING_CYCLES[0],
    [activeCycle]
  );

  const refreshBillingSummary = async () => {
    if (!isAuthenticated) return;
    const result = await billingFetch<BillingSummaryResponse>(
      "/api/billing/summary"
    );
    if (typeof result.balance === "number") setBalance(result.balance);
    const display = deriveSubscriptionDisplay(result.plan);
    setCurrentPlan(display.currentPlan);
    setSubscribedPlanId(display.subscribedPlanId);
    setSubscriptionStatus(display.subscriptionStatus);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshBillingSummary().catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    )
      return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshBillingSummary().catch(() => {});
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isAuthenticated]);

  const showPaymentSuccess = async (
    dialog: NonNullable<typeof paymentDialog>
  ) => {
    const summary = await billingFetch<BillingSummaryResponse>(
      "/api/billing/summary"
    ).catch(() => null);
    if (summary && typeof summary.balance === "number") {
      setBalance(summary.balance);
      notifyCreditsUpdated(summary.balance);
      const display = deriveSubscriptionDisplay(summary.plan);
      setCurrentPlan(display.currentPlan);
      setSubscribedPlanId(display.subscribedPlanId);
      setSubscriptionStatus(display.subscriptionStatus);
      setBalanceFlash(true);
      window.setTimeout(() => setBalanceFlash(false), 900);
    }
    setPaymentDialog(null);
    setSuccessDialog({
      open: true,
      type: dialog.type,
      title: dialog.title,
      amount: dialog.amount,
      credits: dialog.credits,
      cycleLabel: dialog.cycleLabel,
    });
  };

  const checkPaymentStatus = async (showPendingToast = false) => {
    if (!paymentDialog?.open) return;
    try {
      const result = await billingFetch<BillingStatusResponse>(
        `/api/billing/orders/${paymentDialog.orderId}/status`
      );
      if (result.order?.status === "paid") {
        await showPaymentSuccess(paymentDialog);
        return;
      }
      if (showPendingToast) {
        toast("暂未确认到账", {
          description: "如果已经完成支付，请稍等几秒后再点一次。",
        });
      }
    } catch (error) {
      if (showPendingToast) {
        toast("支付状态查询失败", {
          description: error instanceof Error ? error.message : "请稍后重试",
        });
      }
    }
  };

  useEffect(() => {
    if (!paymentDialog?.open || paymentDialog.status === "success") return;
    const interval = window.setInterval(() => {
      void checkPaymentStatus(false);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [paymentDialog?.open, paymentDialog?.orderId, paymentDialog?.status]);

  const switchTab = (tab: BillingTab) => {
    setActiveTab(tab);
    navigate(`/billing?tab=${tab}`, { replace: true });
  };

  const handlePaymentError = (error: unknown) => {
    if (error instanceof BillingAuthExpiredError) {
      clearExpiredAuthSession();
      openLoginModal();
      toast("登录已失效", {
        description: "请重新登录后再继续订阅或充值。",
      });
      return;
    }

    toast("支付暂时不可用", {
      description: error instanceof Error ? error.message : "请稍后重试",
    });
  };

  const startSubscriptionPayment = async (planId: string, label: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setPayingPlanId(planId);
    try {
      const orderResult = await billingFetch<BillingOrderResponse>(
        "/api/billing/orders",
        {
          method: "POST",
          body: JSON.stringify({
            planId,
            cycleId: activeCycle,
            paymentMethod: selectedPaymentMethod,
          }),
        }
      );
      if (!orderResult.order) {
        throw new Error(orderResult.error || "订单创建失败");
      }

      const payResult = await billingFetch<BillingPayResponse>(
        `/api/billing/orders/${orderResult.order.id}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            paymentMethod: selectedPaymentMethod,
            mode: "native",
          }),
        }
      );
      if (!payResult.payment?.payUrl) {
        throw new Error(payResult.error || "威富通支付链接创建失败");
      }

      const selectedPlan = MEMBERSHIP_PLANS.find(item => item.id === planId);
      setPaymentDialog({
        open: true,
        type: "subscription",
        orderId: orderResult.order.id,
        payUrl: payResult.payment.payUrl,
        title: selectedPlan?.name || orderResult.order.planName || label,
        amount: orderResult.order.amount,
        credits: orderResult.order.credits || 0,
        paymentMethod: selectedPaymentMethod,
        cycleLabel: orderResult.order.cycleLabel || cycleLabel,
        status: "pending",
      });
    } catch (error) {
      handlePaymentError(error);
    } finally {
      setPayingPlanId(null);
    }
  };

  const normalizeRechargeAmount = (value: string) =>
    value.replace(/[^\d]/g, "").slice(0, 6);

  const validateRechargeAmount = (value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 10)
      return "请输入不低于 HKD 10 的充值金额";
    if (amount % 5 !== 0) return "充值金额必须以 0 或 5 结尾";
    return "";
  };

  const startRechargePayment = async (packId: string, packName: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const rawAmount = rechargeAmounts[packId] || "";
    const error = validateRechargeAmount(rawAmount);
    if (error) {
      toast("充值金额不可用", { description: error });
      return;
    }
    const amount = Number(rawAmount);
    const quote = quoteCreditRecharge(amount);

    setPayingRechargeId(packId);
    try {
      const orderResult = await billingFetch<BillingOrderResponse>(
        "/api/billing/orders",
        {
          method: "POST",
          body: JSON.stringify({
            type: "recharge",
            amount,
            paymentMethod: selectedPaymentMethod,
          }),
        }
      );
      if (!orderResult.order) {
        throw new Error(orderResult.error || "充值订单创建失败");
      }

      const payResult = await billingFetch<BillingPayResponse>(
        `/api/billing/orders/${orderResult.order.id}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            paymentMethod: selectedPaymentMethod,
            mode: "native",
          }),
        }
      );
      if (!payResult.payment?.payUrl) {
        throw new Error(payResult.error || "威富通支付链接创建失败");
      }

      setPaymentDialog({
        open: true,
        type: "recharge",
        orderId: orderResult.order.id,
        payUrl: payResult.payment.payUrl,
        title: packName,
        amount,
        credits: quote.credits,
        paymentMethod: selectedPaymentMethod,
        status: "pending",
      });
    } catch (error) {
      handlePaymentError(error);
    } finally {
      setPayingRechargeId(null);
    }
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: bg, position: "relative" }}
    >
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${BG_GLOW})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            opacity: 0,
            zIndex: 0,
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={balance} glass />
      </div>

      <main
        className="flex-1 overflow-auto"
        style={{ position: "relative", zIndex: 1, background: "#222222" }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-5 py-5 lg:px-8">
          <section
            className="rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl"
            style={{
              background: panel,
              borderColor: border,
              boxShadow: "var(--design-shadow-soft)",
            }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div
                  className="mb-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1 type-caption"
                  style={{
                    background: "oklch(0.68 0.20 292 / 0.14)",
                    color: purple,
                  }}
                >
                  <Sparkles size={13} />
                  ArtX 会员中心
                </div>
                <h1
                  className="type-title-sm"
                  style={{
                    color: text,
                    fontSize: 28,
                    fontWeight: 680,
                    letterSpacing: 0,
                  }}
                >
                  订阅、充值与升级
                </h1>
                <p
                  className="mt-2 max-w-[760px] type-body-sm leading-6"
                  style={{ color: sub }}
                >
                  GPT 大语言模型、Image Two 与 Nano Banana
                  作为统一创作能力池提供服务。
                </p>
              </div>

              <div className="grid min-w-[min(100%,520px)] grid-cols-3 gap-2">
                {[
                  { label: "当前计划", value: currentPlan, icon: Crown },
                  {
                    label: "积分余额",
                    value: balance.toLocaleString("zh-HK"),
                    icon: WalletCards,
                    rolling: true,
                  },
                  { label: "订阅状态", value: subscriptionStatus, icon: Rocket },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-[var(--radius-lg-design)] border p-3"
                      style={{ background: panelStrong, borderColor: border }}
                    >
                      <div
                        className="mb-2 flex items-center gap-1.5 type-caption"
                        style={{ color: faint }}
                      >
                        <Icon size={13} />
                        {item.label}
                      </div>
                      <div
                        style={{
                          color: text,
                          fontSize: 18,
                          fontWeight: 680,
                          transform:
                            item.rolling && balanceFlash
                              ? "translateY(-4px)"
                              : "translateY(0)",
                          transition: "transform 420ms ease, color 420ms ease",
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section
            className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl"
            style={{ background: panel, borderColor: border }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2
                  className="type-title-sm"
                  style={{ color: text, fontSize: 16, fontWeight: 680 }}
                >
                  支付方式
                </h2>
                <p
                  className="mt-1 type-caption"
                  style={{ color: faint, letterSpacing: 0, textTransform: "none" }}
                >
                  请先选择支付工具，系统会生成对应通道的专用二维码。
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {paymentMethods.map(method => {
                  const active = selectedPaymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPaymentMethod(method.id)}
                      className="flex min-h-[64px] min-w-[188px] items-center gap-3 rounded-[var(--radius-lg-design)] border px-3 py-2 text-left transition-all"
                      style={{
                        background: active
                          ? method.id === "wechat"
                            ? "rgba(7, 193, 96, 0.14)"
                            : "rgba(22, 119, 255, 0.14)"
                          : panelStrong,
                        borderColor: active
                          ? method.id === "wechat"
                            ? "rgba(7, 193, 96, 0.46)"
                            : "rgba(22, 119, 255, 0.46)"
                          : border,
                        color: text,
                      }}
                    >
                      <PaymentMethodLogo method={method.id} />
                      <span className="min-w-0">
                        <span className="block type-caption" style={{ color: text, fontWeight: 720 }}>
                          {method.label}
                        </span>
                        <span
                          className="mt-0.5 block type-caption"
                          style={{ color: faint, letterSpacing: 0, textTransform: "none" }}
                        >
                          {method.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid items-stretch gap-4 lg:grid-cols-[280px_1fr]">
            <aside
              className="rounded-[var(--radius-xl-design)] border p-2 backdrop-blur-xl"
              style={{ background: panel, borderColor: border, minHeight: 480 }}
            >
              {billingTabs.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchTab(tab.id)}
                    className="mb-1 flex w-full items-center justify-between rounded-[var(--radius-lg-design)] px-3 py-3 text-left transition-colors"
                    style={{
                      background: active
                        ? "oklch(0.68 0.20 292 / 0.16)"
                        : "transparent",
                      color: active ? text : sub,
                      border: `1px solid ${active ? "oklch(0.68 0.20 292 / 0.34)" : "transparent"}`,
                    }}
                  >
                    <span className="min-w-0">
                      <span
                        className="block type-caption"
                        style={{ color: active ? text : sub, fontWeight: 650 }}
                      >
                        {tab.label}
                      </span>
                      <span
                        className="mt-1 block truncate"
                        style={{ color: faint, fontSize: 11 }}
                      >
                        {tab.description}
                      </span>
                    </span>
                    <ArrowUpRight
                      size={13}
                      style={{ opacity: active ? 1 : 0.42 }}
                    />
                  </button>
                );
              })}
            </aside>

            <div className="min-w-0">
              {activeTab === "subscription" && (
                <section
                  className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl"
                  style={{
                    background: panel,
                    borderColor: border,
                    minHeight: 480,
                  }}
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2
                        className="type-title-sm"
                        style={{ color: text, fontSize: 20, fontWeight: 680 }}
                      >
                        订阅服务
                      </h2>
                      <p
                        className="mt-1 type-caption"
                        style={{
                          color: sub,
                          letterSpacing: 0,
                          textTransform: "none",
                        }}
                      >
                        按整体创作服务收费，周期支持月付、季付与年付。
                      </p>
                    </div>
                    <div
                      className="inline-grid grid-cols-3 gap-1 rounded-[var(--radius-lg-design)] border p-1"
                      style={{ borderColor: border, background: panelStrong }}
                    >
                      {BILLING_CYCLES.map(cycle => {
                        const active = activeCycle === cycle.id;
                        return (
                          <button
                            key={cycle.id}
                            type="button"
                            onClick={() => setActiveCycle(cycle.id)}
                            className="h-8 rounded-[var(--radius-md-design)] px-3 type-caption transition-all"
                            style={{
                              background: active ? green : "transparent",
                              color: active ? "#10130A" : sub,
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            {cycle.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    {subscriptionPlans.map(planConfig => {
                      const plan =
                        MEMBERSHIP_PLANS.find(
                          item => item.id === planConfig.id
                        ) || MEMBERSHIP_PLANS[0];
                      const quote = getPlanQuote(plan, activeCycleConfig);
                      const activePlanId = hoveredPlanId || selectedPlanId;
                      const isFocused = activePlanId === plan.id;
                      const isSelected = selectedPlanId === plan.id;
                      const isCurrentSubscribedPlan =
                        subscribedPlanId === plan.id;
                      const currentPlanLevel =
                        getSubscriptionPlanLevel(subscribedPlanId);
                      const isDowngradePlan =
                        currentPlanLevel > 0 &&
                        planConfig.level < currentPlanLevel;
                      const isSubscriptionDisabled =
                        isCurrentSubscribedPlan ||
                        isDowngradePlan ||
                        payingPlanId === plan.id;
                      const planBadge = isCurrentSubscribedPlan
                        ? "当前套餐"
                        : isDowngradePlan
                          ? "不可降级"
                        : isSelected
                          ? "已选择"
                          : planConfig.highlight
                            ? "推荐"
                            : "";
                      const originalPrice =
                        Math.ceil((quote.price * 1.42) / 10) * 10 + 9;
                      return (
                        <article
                          key={planConfig.id}
                          onMouseEnter={() => setHoveredPlanId(plan.id)}
                          onMouseLeave={() => setHoveredPlanId(null)}
                          onClick={() => setSelectedPlanId(plan.id)}
                          className="flex min-h-[480px] flex-col rounded-[var(--radius-xl-design)] border p-4"
                          style={{
                            background: isFocused
                              ? "linear-gradient(180deg, rgba(144,88,252,0.18), #222222)"
                              : panelStrong,
                            borderColor: isFocused
                              ? "oklch(0.68 0.20 292 / 0.55)"
                              : border,
                            boxShadow: isFocused
                              ? "0 20px 56px oklch(0.58 0.22 290 / 0.18)"
                              : "none",
                            cursor: "pointer",
                            transition:
                              "border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
                          }}
                        >
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <p
                                className="type-caption"
                                style={{ color: isFocused ? green : sub }}
                              >
                                {planConfig.audience}
                              </p>
                              <h3
                                className="mt-1"
                                style={{
                                  color: text,
                                  fontSize: 22,
                                  fontWeight: 720,
                                }}
                              >
                                {plan.name}
                              </h3>
                            </div>
                            <span
                              className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption"
                              style={{
                                background: "oklch(0.78 0.18 110 / 0.16)",
                                color: green,
                                visibility: planBadge ? "visible" : "hidden",
                              }}
                            >
                              {planBadge || "占位"}
                            </span>
                          </div>

                          <div
                            className="rounded-[var(--radius-lg-design)] border p-3"
                            style={{
                              borderColor: border,
                              background: isDark
                                ? "#222222"
                                : "oklch(0 0 0 / 3%)",
                            }}
                          >
                            <div
                              className="type-caption"
                              style={{ color: faint }}
                            >
                              ArtX 标准价
                            </div>
                            <div className="mt-1 flex flex-wrap items-end gap-2">
                              <span
                                style={{
                                  color: text,
                                  fontSize: 24,
                                  fontWeight: 760,
                                }}
                              >
                                {formatCurrency(quote.price)}
                              </span>
                              <span
                                className="pb-1 type-caption"
                                style={{ color: sub }}
                              >
                                / {cycleLabel}
                              </span>
                              <span
                                className="pb-1 type-caption"
                                style={{
                                  color: faint,
                                  textDecoration: "line-through",
                                  textDecorationThickness: 1,
                                }}
                              >
                                {formatCurrency(originalPrice)}
                              </span>
                            </div>
                            <div
                              className="mt-1 type-caption"
                              style={{
                                color: faint,
                                letterSpacing: 0,
                                textTransform: "none",
                              }}
                            >
                              {quote.totalCredits.toLocaleString("zh-HK")}{" "}
                              创作积分
                            </div>
                          </div>

                          <ul className="mt-4 flex-1 space-y-2.5">
                            {planConfig.features.map(feature => (
                              <li
                                key={feature.label}
                                className="flex items-start gap-2 type-caption leading-5"
                                style={{
                                  color: feature.included ? sub : faint,
                                  letterSpacing: 0,
                                  textTransform: "none",
                                }}
                              >
                                {feature.included ? (
                                  <Check
                                    size={13}
                                    style={{
                                      color: green,
                                      flex: "0 0 auto",
                                      marginTop: 2,
                                    }}
                                  />
                                ) : (
                                  <X
                                    size={13}
                                    style={{
                                      color: "oklch(0.58 0.03 270)",
                                      flex: "0 0 auto",
                                      marginTop: 2,
                                    }}
                                  />
                                )}
                                <span>{feature.label}</span>
                              </li>
                            ))}
                          </ul>

                          <button
                            type="button"
                            onClick={() =>
                              !isSubscriptionDisabled &&
                              startSubscriptionPayment(plan.id, plan.name)
                            }
                            disabled={isSubscriptionDisabled}
                            className="mt-5 h-10 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
                            style={{
                              background:
                                isCurrentSubscribedPlan || isDowngradePlan
                                ? "oklch(1 0 0 / 7%)"
                                : isSelected
                                ? green
                                : "oklch(0.68 0.20 292 / 0.18)",
                              color:
                                isCurrentSubscribedPlan || isDowngradePlan
                                ? faint
                                : isSelected
                                  ? "#10130A"
                                  : text,
                              border: `1px solid ${
                                isCurrentSubscribedPlan || isDowngradePlan
                                  ? border
                                  : isSelected
                                    ? "transparent"
                                    : "oklch(0.68 0.20 292 / 0.32)"
                              }`,
                              cursor:
                                isCurrentSubscribedPlan || isDowngradePlan
                                  ? "not-allowed"
                                  : payingPlanId === plan.id
                                    ? "wait"
                                    : "pointer",
                              fontWeight: 700,
                            }}
                          >
                            <span className="inline-flex items-center justify-center gap-2">
                              {!isCurrentSubscribedPlan && !isDowngradePlan && (
                                <PaymentMethodLogo method={selectedPaymentMethod} compact />
                              )}
                              <span>
                                {isCurrentSubscribedPlan
                                  ? "您已订阅该套餐。"
                                  : isDowngradePlan
                                    ? "当前套餐不支持降级"
                                  : payingPlanId === plan.id
                                  ? "创建支付中"
                                  : `用${activePaymentMethod.label}订阅`}
                              </span>
                            </span>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {activeTab === "recharge" && (
                <section
                  className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl"
                  style={{
                    background: panel,
                    borderColor: border,
                    minHeight: 480,
                  }}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2
                        className="type-title-sm"
                        style={{ color: text, fontSize: 20, fontWeight: 680 }}
                      >
                        积分充值
                      </h2>
                      <p
                        className="mt-1 type-caption"
                        style={{
                          color: sub,
                          letterSpacing: 0,
                          textTransform: "none",
                        }}
                      >
                        积分只代表可用创作额度，不绑定某一个模型。
                      </p>
                    </div>
                    <WalletCards size={20} style={{ color: green }} />
                  </div>
                  <div className="grid gap-3 xl:grid-cols-3">
                    {rechargePacks.map(pack => (
                      <article
                        key={pack.id}
                        className="min-h-[480px] rounded-[var(--radius-xl-design)] border p-4"
                        style={{ background: panelStrong, borderColor: border }}
                      >
                        <div
                          className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md-design)]"
                          style={{
                            background: "oklch(0.78 0.18 110 / 0.14)",
                            color: green,
                          }}
                        >
                          <CreditCard size={18} />
                        </div>
                        <h3
                          style={{ color: text, fontSize: 19, fontWeight: 700 }}
                        >
                          {pack.name}
                        </h3>
                        <p className="mt-2 type-caption" style={{ color: sub }}>
                          {pack.credits}
                        </p>
                        <label className="mt-4 block">
                          <span
                            className="mb-2 block type-caption"
                            style={{
                              color: faint,
                              letterSpacing: 0,
                              textTransform: "none",
                            }}
                          >
                            输入充值金额 HKD
                          </span>
                          <input
                            value={rechargeAmounts[pack.id] || ""}
                            onChange={event => {
                              const nextValue = normalizeRechargeAmount(
                                event.target.value
                              );
                              setRechargeAmounts(current => ({
                                ...current,
                                [pack.id]: nextValue,
                              }));
                            }}
                            inputMode="numeric"
                            placeholder={pack.placeholder}
                            className="h-10 w-full rounded-[var(--radius-lg-design)] border px-3 type-caption outline-none transition-colors"
                            style={{
                              borderColor: border,
                              background: isDark
                                ? "#222222"
                                : "oklch(1 0 0 / 0.72)",
                              color: text,
                            }}
                          />
                        </label>
                        <div
                          className="mt-3 type-caption"
                          style={{
                            color: faint,
                            letterSpacing: 0,
                            textTransform: "none",
                          }}
                        >
                          可兑换{" "}
                          {quoteCreditRecharge(
                            Number(rechargeAmounts[pack.id] || 0)
                          ).credits.toLocaleString("zh-HK")}{" "}
                          积分
                        </div>
                        <p
                          className="mt-4 type-caption leading-5"
                          style={{
                            color: sub,
                            letterSpacing: 0,
                            textTransform: "none",
                          }}
                        >
                          {pack.usage}
                        </p>
                        <ul className="mt-4 min-h-[92px] space-y-2">
                          {pack.perks.map(perk => (
                            <li
                              key={perk.label}
                              className="flex items-start gap-2 type-caption leading-5"
                              style={{
                                color: perk.included ? sub : faint,
                                letterSpacing: 0,
                                textTransform: "none",
                              }}
                            >
                              {perk.included ? (
                                <Check
                                  size={13}
                                  style={{
                                    color: green,
                                    flex: "0 0 auto",
                                    marginTop: 2,
                                  }}
                                />
                              ) : (
                                <X
                                  size={13}
                                  style={{
                                    color: "oklch(0.58 0.03 270)",
                                    flex: "0 0 auto",
                                    marginTop: 2,
                                  }}
                                />
                              )}
                              <span>{perk.label}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() =>
                            startRechargePayment(pack.id, pack.name)
                          }
                          disabled={payingRechargeId === pack.id}
                          className="mt-5 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
                          style={{
                            background: green,
                            color: "#10130A",
                            fontWeight: 720,
                          }}
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            <PaymentMethodLogo method={selectedPaymentMethod} compact />
                            <span>{payingRechargeId === pack.id ? "创建支付中" : `用${activePaymentMethod.label}充值`}</span>
                          </span>
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      </main>
      {paymentDialog?.open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{
            background: "rgba(34,34,34,0.72)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            className="w-full max-w-[420px] rounded-[var(--radius-xl-design)] border p-5"
            style={{
              background: panelStrong,
              borderColor: border,
              boxShadow: "0 24px 80px oklch(0 0 0 / 0.38)",
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 style={{ color: text, fontSize: 20, fontWeight: 720 }}>
                  <span className="inline-flex items-center gap-2">
                    <PaymentMethodLogo method={paymentDialog.paymentMethod} />
                    <span>{paymentDialog.paymentMethod === "wechat" ? "微信扫码支付" : "支付宝扫码支付"}</span>
                  </span>
                </h3>
                <p
                  className="mt-1 type-caption"
                  style={{
                    color: sub,
                    letterSpacing: 0,
                    textTransform: "none",
                  }}
                >
                  {paymentDialog.type === "subscription"
                    ? `${paymentDialog.title}${paymentDialog.cycleLabel ? ` · ${paymentDialog.cycleLabel}` : ""} · HKD ${paymentDialog.amount.toLocaleString("zh-HK")}`
                    : `${paymentDialog.title} · HKD ${paymentDialog.amount.toLocaleString("zh-HK")} · ${paymentDialog.credits.toLocaleString("zh-HK")} 积分`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentDialog(null)}
                className="h-8 w-8 rounded-[var(--radius-md-design)] type-caption"
                style={{
                  color: sub,
                  background: isDark
                    ? "oklch(1 0 0 / 6%)"
                    : "oklch(0 0 0 / 5%)",
                }}
              >
                ×
              </button>
	            </div>

	            <div
	              className="mb-4 rounded-[var(--radius-lg-design)] border p-3"
	              style={{
	                borderColor: "oklch(0.68 0.20 292 / 0.32)",
	                background: "oklch(0.68 0.20 292 / 0.12)",
	              }}
	            >
	              <div className="flex items-start justify-between gap-3">
	                <div className="min-w-0">
	                  <div
	                    className="type-caption"
	                    style={{
	                      color: faint,
	                      letterSpacing: 0,
	                      textTransform: "none",
	                    }}
	                  >
	                    {paymentDialog.type === "subscription"
	                      ? "套餐服务"
	                      : "充值项目"}
	                  </div>
	                  <div
	                    className="mt-1 truncate"
	                    style={{
	                      color: text,
	                      fontSize: 16,
	                      fontWeight: 720,
	                      letterSpacing: 0,
	                    }}
	                  >
	                    {paymentDialog.type === "subscription"
	                      ? `${paymentDialog.title}${paymentDialog.cycleLabel ? ` · ${paymentDialog.cycleLabel}` : ""}`
	                      : paymentDialog.title}
	                  </div>
	                  {paymentDialog.type === "recharge" && (
	                    <div
	                      className="mt-1 type-caption"
	                      style={{
	                        color: sub,
	                        letterSpacing: 0,
	                        textTransform: "none",
	                      }}
	                    >
	                      到账 {paymentDialog.credits.toLocaleString("zh-HK")} 积分
	                    </div>
	                  )}
	                </div>
	                <div className="shrink-0 text-right">
	                  <div
	                    className="type-caption"
	                    style={{
	                      color: faint,
	                      letterSpacing: 0,
	                      textTransform: "none",
	                    }}
	                  >
	                    支付金额
	                  </div>
	                  <div
	                    className="mt-1"
	                    style={{
	                      color: text,
	                      fontSize: 18,
	                      fontWeight: 760,
	                      letterSpacing: 0,
	                    }}
	                  >
	                    HKD {paymentDialog.amount.toLocaleString("zh-HK")}
	                  </div>
	                </div>
	              </div>
	            </div>

	            <div
	              className="rounded-[var(--radius-lg-design)] border p-3 text-center"
	              style={{
                borderColor: border,
                background: isDark ? "#222222" : "white",
              }}
            >
              {isQrImagePayUrl(paymentDialog.payUrl) ? (
                <img
                  src={paymentDialog.payUrl}
                  alt={`${paymentDialog.paymentMethod === "wechat" ? "微信支付" : "支付宝"}二维码`}
                  className="mx-auto h-[220px] w-[220px] rounded-[var(--radius-md-design)] object-contain"
                />
              ) : (
                <div className="flex h-[220px] flex-col items-center justify-center gap-3">
                  <WalletCards size={34} style={{ color: green }} />
                  <a
                    href={paymentDialog.payUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[var(--radius-md-design)] px-4 py-2 type-caption"
                    style={{
                      background: green,
                      color: "#10130A",
                      fontWeight: 720,
                    }}
                  >
                    打开支付页面
                  </a>
                </div>
              )}
            </div>
            <p
              className="mt-3 text-center type-caption"
              style={{ color: faint, letterSpacing: 0, textTransform: "none" }}
            >
              支付完成后会自动刷新余额，也可以点击下方按钮确认状态
            </p>
            <button
              type="button"
              onClick={() => void checkPaymentStatus(true)}
              className="mt-4 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
              style={{ background: green, color: "#10130A", fontWeight: 720 }}
            >
              我已支付
            </button>
          </div>
        </div>
      )}
      {successDialog?.open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          style={{
            background: "rgba(34,34,34,0.74)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            className="w-full max-w-[430px] overflow-hidden rounded-[var(--radius-xl-design)] border"
            style={{
              background: panelStrong,
              borderColor: border,
              boxShadow: "0 24px 80px oklch(0 0 0 / 0.42)",
            }}
          >
            <div className="h-2 w-full" style={{ background: green }} />
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 style={{ color: text, fontSize: 20, fontWeight: 760 }}>
                    {successDialog.type === "subscription"
                      ? "订阅成功"
                      : "充值成功"}
                  </h3>
                  <p
                    className="mt-1 type-caption"
                    style={{
                      color: sub,
                      letterSpacing: 0,
                      textTransform: "none",
                    }}
                  >
                    {successDialog.type === "subscription"
                      ? `您已成功订阅 ${successDialog.title}${successDialog.cycleLabel ? ` · ${successDialog.cycleLabel}` : ""}。`
                      : `您已成功支付 HKD ${successDialog.amount.toLocaleString("zh-HK")}。`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessDialog(null)}
                  className="h-8 w-8 rounded-[var(--radius-md-design)] type-caption"
                  style={{
                    color: sub,
                    background: isDark
                      ? "oklch(1 0 0 / 6%)"
                      : "oklch(0 0 0 / 5%)",
                  }}
                >
                  ×
                </button>
              </div>

              <div
                className="rounded-[var(--radius-lg-design)] border p-4 text-center"
                style={{
                  borderColor: "oklch(0.78 0.18 110 / 0.34)",
                  background: "oklch(0.78 0.18 110 / 0.10)",
                }}
              >
                <div style={{ color: green, fontSize: 26, fontWeight: 760 }}>
                  {successDialog.type === "subscription"
                    ? successDialog.title
                    : `+${successDialog.credits.toLocaleString("zh-HK")}`}
                </div>
                <p
                  className="mt-1 type-caption"
                  style={{
                    color: sub,
                    letterSpacing: 0,
                    textTransform: "none",
                  }}
                >
                  {successDialog.type === "subscription"
                    ? "套餐权益与积分余额已同步刷新"
                    : "积分已到账，感谢您的支持"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSuccessDialog(null)}
                className="mt-5 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
                style={{ background: green, color: "#10130A", fontWeight: 720 }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
