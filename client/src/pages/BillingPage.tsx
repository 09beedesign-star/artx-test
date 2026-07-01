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
import { BG_GLOW } from "@/lib/workspace-data";
import { BILLING_CYCLES, MEMBERSHIP_PLANS, formatCurrency, getPlanQuote, quoteCreditRecharge, type BillingCycleId, type MembershipPlanId } from "@shared/billing-config";

type BillingTab = "subscription" | "recharge";

const billingTabs: Array<{ id: BillingTab; label: string; description: string }> = [
  { id: "subscription", label: "订阅服务", description: "整体创作服务订阅" },
  { id: "recharge", label: "积分充值", description: "额外购买可用创作额度" },
];

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
      { label: "AI 创作消耗 85 折", included: true },
      { label: "最高图片生成并发占位", included: true },
      { label: "专属高峰期任务通道", included: true },
    ],
  },
];

type BillingOrderResponse = {
  order?: {
    id: string;
    amount: number;
    planName: string;
    cycleLabel: string;
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
  orders?: Array<{ id: string; status: string; amount: number; credits: number }>;
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

const rechargePacks = [
  {
    id: "pack-small",
    name: "轻量补充",
    credits: "小额积分包",
    minAmount: 20,
    placeholder: "最低 20",
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
    minAmount: 120,
    placeholder: "最低 120",
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
    minAmount: 300,
    placeholder: "最低 300",
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
  const configured = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://artx-test.onrender.com";
  }
  return "";
}

function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

async function billingFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "请求失败，请稍后重试");
  }
  return data as T;
}

export default function BillingPage() {
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<BillingTab>(() => readInitialTab());
  const [activeCycle, setActiveCycle] = useState<BillingCycleId>("monthly");
  const [selectedPlanId, setSelectedPlanId] = useState<MembershipPlanId>("pro");
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [balance, setBalance] = useState(75);
  const [currentPlan, setCurrentPlan] = useState("Free");
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [rechargeAmounts, setRechargeAmounts] = useState<Record<string, string>>({
    "pack-small": "50",
    "pack-growth": "150",
    "pack-scale": "500",
  });
  const [payingRechargeId, setPayingRechargeId] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean;
    orderId: string;
    payUrl: string;
    payUrlType: "qr" | "redirect";
    title: string;
    amount: number;
    credits: number;
    kind: "subscription" | "recharge";
    status: "pending" | "success";
  } | null>(null);
  const [paymentResultDialog, setPaymentResultDialog] = useState<{
    open: boolean;
    amount: number;
    credits: number;
    kind: "subscription" | "recharge";
  } | null>(null);

  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const panel = isDark ? "oklch(0.12 0.014 270 / 0.82)" : "oklch(1 0 0 / 0.82)";
  const panelStrong = isDark ? "oklch(0.15 0.018 270 / 0.92)" : "oklch(1 0 0 / 0.94)";
  const border = isDark ? "oklch(1 0 0 / 9%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.88 0.01 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.58 0.01 270)" : "oklch(0.48 0.012 255)";
  const faint = isDark ? "oklch(0.44 0.01 270)" : "oklch(0.58 0.012 255)";
  const green = "#C5ED47";
  const purple = "oklch(0.68 0.20 292)";

  const cycleLabel = useMemo(
    () => BILLING_CYCLES.find(item => item.id === activeCycle)?.label || "月付",
    [activeCycle],
  );
  const activeCycleConfig = useMemo(
    () => BILLING_CYCLES.find(item => item.id === activeCycle) || BILLING_CYCLES[0],
    [activeCycle],
  );

  const refreshBillingSummary = async () => {
    const summary = await billingFetch<BillingSummaryResponse>("/api/billing/summary").catch(() => null);
    if (!summary) return null;
    if (typeof summary.balance === "number") {
      setBalance(summary.balance);
      setBalanceFlash(true);
      window.setTimeout(() => setBalanceFlash(false), 900);
    }
    if (typeof summary.plan === "string" && summary.plan.trim()) setCurrentPlan(summary.plan.trim());
    return summary;
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    billingFetch<BillingSummaryResponse>("/api/billing/summary")
      .then(result => {
        if (typeof result.balance === "number") setBalance(result.balance);
        if (typeof result.plan === "string" && result.plan.trim()) setCurrentPlan(result.plan.trim());
      })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!paymentDialog?.open || paymentDialog.status === "success") return;
    const interval = window.setInterval(async () => {
      try {
        const result = await billingFetch<BillingStatusResponse>(`/api/billing/orders/${paymentDialog.orderId}/status`);
        if (result.order?.status === "paid") {
          setPaymentDialog(current => current ? { ...current, status: "success" } : current);
          await refreshBillingSummary();
          toast("充值成功", {
            description: "感谢您的支持，积分余额已同步刷新。",
          });
          window.clearInterval(interval);
        }
      } catch {
        // Keep polling while the payment page is open.
      }
    }, 3500);
    return () => window.clearInterval(interval);
  }, [paymentDialog?.open, paymentDialog?.orderId, paymentDialog?.status]);

  const switchTab = (tab: BillingTab) => {
    setActiveTab(tab);
    navigate(`/billing?tab=${tab}`, { replace: true });
  };

  const confirmPaymentCompleted = async () => {
    if (!paymentDialog) return;

    try {
      const result = await billingFetch<BillingStatusResponse>(`/api/billing/orders/${paymentDialog.orderId}/status`);
      if (result.order?.status !== "paid" && paymentDialog.status !== "success") {
        toast("支付状态确认中", {
          description: "如果您已完成扫码支付，请稍后再点一次“我已支付”。",
        });
        return;
      }

      await refreshBillingSummary();
      const completedPayment = paymentDialog;
      setPaymentDialog(null);
      switchTab(completedPayment.kind === "recharge" ? "recharge" : "subscription");
      setPaymentResultDialog({
        open: true,
        amount: completedPayment.amount,
        credits: completedPayment.credits,
        kind: completedPayment.kind,
      });
    } catch (error) {
      toast("支付状态暂时不可确认", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    }
  };

  const getPlanLevel = (planName: string) => {
    const normalized = planName.toLowerCase();
    if (normalized.includes("studio") || normalized.includes("business")) return 3;
    if (normalized.includes("pro")) return 2;
    if (normalized.includes("lite") || normalized.includes("creator")) return 1;
    return 0;
  };

  const currentPlanLevel = getPlanLevel(currentPlan);

  const startSubscriptionPayment = async (planId: string, label: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const targetPlan = subscriptionPlans.find(item => item.id === planId);
    if (targetPlan && currentPlanLevel > targetPlan.level) {
      toast("当前方案不可降级", {
        description: "已订阅用户只能升级到更高方案。",
      });
      return;
    }

    setPayingPlanId(planId);
    try {
      const orderResult = await billingFetch<BillingOrderResponse>("/api/billing/orders", {
        method: "POST",
        body: JSON.stringify({
          planId,
          cycleId: activeCycle,
          paymentMethod: "wechat",
        }),
      });
      if (!orderResult.order) {
        throw new Error(orderResult.error || "订单创建失败");
      }

      const payResult = await billingFetch<BillingPayResponse>(`/api/billing/orders/${orderResult.order.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "wechat",
          mode: "native",
        }),
      });
      if (!payResult.payment?.payUrl) {
        throw new Error(payResult.error || "威富通支付链接创建失败");
      }

      const plan = MEMBERSHIP_PLANS.find(item => item.id === planId) || MEMBERSHIP_PLANS[0];
      const quote = getPlanQuote(plan, activeCycleConfig);
      setPaymentDialog({
        open: true,
        orderId: orderResult.order.id,
        payUrl: payResult.payment.payUrl,
        payUrlType: payResult.payment.payUrlType,
        title: label,
        amount: orderResult.order.amount || quote.price,
        credits: quote.totalCredits,
        kind: "subscription",
        status: "pending",
      });
    } catch (error) {
      toast("支付暂时不可用", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setPayingPlanId(null);
    }
  };

  const normalizeRechargeAmount = (value: string) => value.replace(/[^\d]/g, "").slice(0, 6);

  const validateRechargeAmount = (value: string, minAmount = 20) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < minAmount) return `请输入不低于 HKD ${minAmount} 的充值金额`;
    if (amount % 5 !== 0) return "充值金额必须以 0 或 5 结尾";
    return "";
  };

  const startRechargePayment = async (packId: string, packName: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const pack = rechargePacks.find(item => item.id === packId);
    const rawAmount = rechargeAmounts[packId] || "";
    const error = validateRechargeAmount(rawAmount, pack?.minAmount || 20);
    if (error) {
      toast("充值金额不可用", { description: error });
      return;
    }
    const amount = Number(rawAmount);
    const quote = quoteCreditRecharge(amount);

    setPayingRechargeId(packId);
    try {
      const orderResult = await billingFetch<BillingOrderResponse>("/api/billing/orders", {
        method: "POST",
        body: JSON.stringify({
          type: "recharge",
          amount,
          paymentMethod: "wechat",
        }),
      });
      if (!orderResult.order) {
        throw new Error(orderResult.error || "充值订单创建失败");
      }

      const payResult = await billingFetch<BillingPayResponse>(`/api/billing/orders/${orderResult.order.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "wechat",
          mode: "native",
        }),
      });
      if (!payResult.payment?.payUrl) {
        throw new Error(payResult.error || "威富通支付链接创建失败");
      }

      setPaymentDialog({
        open: true,
        orderId: orderResult.order.id,
        payUrl: payResult.payment.payUrl,
        payUrlType: payResult.payment.payUrlType,
        title: packName,
        amount,
        credits: quote.credits,
        kind: "recharge",
        status: "pending",
      });
    } catch (error) {
      toast("支付暂时不可用", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setPayingRechargeId(null);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative" }}>
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${BG_GLOW})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
            opacity: 0.12,
            zIndex: 0,
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={balance} />
      </div>

      <main className="flex-1 overflow-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-5 py-5 lg:px-8">
          <section
            className="rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl"
            style={{ background: panel, borderColor: border, boxShadow: "var(--design-shadow-soft)" }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1 type-caption" style={{ background: "oklch(0.68 0.20 292 / 0.14)", color: purple }}>
                  <Sparkles size={13} />
                  ArtX 会员中心
                </div>
                <h1 className="type-title-sm" style={{ color: text, fontSize: 28, fontWeight: 680, letterSpacing: 0 }}>
                  订阅、充值与升级
                </h1>
              </div>

              <div className="grid min-w-[min(100%,520px)] grid-cols-3 gap-2">
                {[
                  { label: "当前计划", value: currentPlan, icon: Crown },
                  { label: "积分余额", value: balance.toLocaleString("zh-HK"), icon: WalletCards, rolling: true },
                  { label: "订阅状态", value: "待升级", icon: Rocket },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-[var(--radius-lg-design)] border p-3" style={{ background: panelStrong, borderColor: border }}>
                      <div className="mb-2 flex items-center gap-1.5 type-caption" style={{ color: faint }}>
                        <Icon size={13} />
                        {item.label}
                      </div>
                      <div
                        style={{
                          color: text,
                          fontSize: 18,
                          fontWeight: 680,
                          transform: item.rolling && balanceFlash ? "translateY(-4px)" : "translateY(0)",
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

          <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="rounded-[var(--radius-xl-design)] border p-2 backdrop-blur-xl" style={{ background: panel, borderColor: border }}>
              {billingTabs.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchTab(tab.id)}
                    className="mb-1 flex w-full items-center justify-between rounded-[var(--radius-lg-design)] px-3 py-3 text-left transition-all active:scale-[0.99]"
                    style={{
                      background: active ? "oklch(0.68 0.20 292 / 0.16)" : "transparent",
                      color: active ? text : sub,
                      border: `1px solid ${active ? "oklch(0.68 0.20 292 / 0.34)" : "transparent"}`,
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block type-caption" style={{ color: active ? text : sub, fontWeight: 650 }}>{tab.label}</span>
                      <span className="mt-1 block truncate" style={{ color: faint, fontSize: 11 }}>{tab.description}</span>
                    </span>
                    <ArrowUpRight size={13} style={{ opacity: active ? 1 : 0.42 }} />
                  </button>
                );
              })}

            </aside>

            <div className="min-w-0">
              {activeTab === "subscription" && (
                <section className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl" style={{ background: panel, borderColor: border }}>
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="type-title-sm" style={{ color: text, fontSize: 20, fontWeight: 680 }}>订阅服务</h2>
                    </div>
                    <div className="inline-grid grid-cols-3 gap-1 rounded-[var(--radius-lg-design)] border p-1" style={{ borderColor: border, background: panelStrong }}>
                      {BILLING_CYCLES.map(cycle => {
                        const active = activeCycle === cycle.id;
                        return (
                          <button
                            key={cycle.id}
                            type="button"
                            onClick={() => setActiveCycle(cycle.id)}
                            className="h-8 rounded-[var(--radius-md-design)] px-3 type-caption transition-all"
                            style={{ background: active ? green : "transparent", color: active ? "#10130A" : sub, fontWeight: active ? 700 : 500 }}
                          >
                            {cycle.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid items-stretch gap-3 md:grid-cols-3">
                    {subscriptionPlans.map(planConfig => {
                      const plan = MEMBERSHIP_PLANS.find(item => item.id === planConfig.id) || MEMBERSHIP_PLANS[0];
                      const quote = getPlanQuote(plan, activeCycleConfig);
                      const disabledByPlan = currentPlanLevel > planConfig.level;
                      const originalPrice = Math.ceil(quote.price * 1.42 / 10) * 10 + 9;
                      const selected = selectedPlanId === plan.id;
                      return (
                        <article
                        key={planConfig.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        className="flex h-full min-h-[360px] min-w-0 cursor-pointer flex-col rounded-[var(--radius-xl-design)] border p-3 transition-all duration-150 hover:-translate-y-0.5 xl:p-4"
                        onClick={() => setSelectedPlanId(plan.id)}
                        onPointerDownCapture={() => setSelectedPlanId(plan.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedPlanId(plan.id);
                          }
                        }}
                        style={{
                          background: selected ? "linear-gradient(180deg, oklch(0.18 0.04 292 / 0.92), oklch(0.12 0.014 270 / 0.92))" : panelStrong,
                          borderColor: selected ? "oklch(0.68 0.20 292 / 0.62)" : border,
                          boxShadow: selected ? "0 20px 56px oklch(0.58 0.22 290 / 0.18)" : "none",
                        }}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="type-caption" style={{ color: planConfig.highlight ? green : sub }}>{planConfig.audience}</p>
                            <h3 className="mt-1" style={{ color: text, fontSize: 22, fontWeight: 720 }}>{plan.name}</h3>
                          </div>
                          {(selected || planConfig.highlight) && (
                            <span className="shrink-0 rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: selected ? "oklch(0.68 0.20 292 / 0.18)" : "oklch(0.78 0.18 110 / 0.16)", color: selected ? text : green }}>
                              {selected ? "已选择" : "推荐"}
                            </span>
                          )}
                        </div>

                        <div className="rounded-[var(--radius-lg-design)] border p-3" style={{ borderColor: border, background: isDark ? "oklch(0.09 0.012 270 / 0.56)" : "oklch(0 0 0 / 3%)" }}>
                          <div className="type-caption" style={{ color: faint }}>ArtX 标准价</div>
                          <div className="mt-1 flex flex-wrap items-end gap-2">
                            <span style={{ color: text, fontSize: 22, fontWeight: 760 }}>{formatCurrency(quote.price)}</span>
                            <span className="pb-1 type-caption" style={{ color: sub }}>/ {cycleLabel}</span>
                            <span className="pb-1 type-caption" style={{ color: faint, textDecoration: "line-through", textDecorationThickness: 1 }}>
                              {formatCurrency(originalPrice)}
                            </span>
                          </div>
                          <div className="mt-1 type-caption" style={{ color: faint, letterSpacing: 0, textTransform: "none" }}>{quote.totalCredits.toLocaleString("zh-HK")} 创作积分</div>
                        </div>

                        <ul className="mt-4 flex-1 space-y-2.5">
                          {planConfig.features.map(feature => (
                            <li key={feature.label} className="flex items-start gap-2 type-caption leading-5" style={{ color: feature.included ? sub : faint, letterSpacing: 0, textTransform: "none" }}>
                              {feature.included ? (
                                <Check size={13} style={{ color: green, flex: "0 0 auto", marginTop: 2 }} />
                              ) : (
                                <X size={13} style={{ color: "oklch(0.58 0.03 270)", flex: "0 0 auto", marginTop: 2 }} />
                              )}
                              <span>{feature.label}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPlanId(plan.id);
                            startSubscriptionPayment(plan.id, `${plan.name} ${cycleLabel}`);
                          }}
                          disabled={payingPlanId === plan.id || disabledByPlan}
                          className="mt-5 h-10 rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{
                            background: disabledByPlan ? "oklch(1 0 0 / 8%)" : selected ? green : "oklch(0.68 0.20 292 / 0.18)",
                            color: disabledByPlan ? faint : selected ? "#10130A" : text,
                            border: `1px solid ${disabledByPlan ? "oklch(1 0 0 / 10%)" : selected ? "transparent" : "oklch(0.68 0.20 292 / 0.32)"}`,
                            cursor: disabledByPlan ? "not-allowed" : "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {disabledByPlan ? "当前不可用" : payingPlanId === plan.id ? "创建支付中" : "选择订阅"}
                        </button>
                      </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {activeTab === "recharge" && (
                <section className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl" style={{ background: panel, borderColor: border }}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="type-title-sm" style={{ color: text, fontSize: 20, fontWeight: 680 }}>积分充值</h2>
                    </div>
                    <WalletCards size={20} style={{ color: green }} />
                  </div>
                  <div className="grid gap-3 xl:grid-cols-3">
                    {rechargePacks.map(pack => (
                      <article key={pack.id} className="rounded-[var(--radius-xl-design)] border p-4" style={{ background: panelStrong, borderColor: border }}>
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md-design)]" style={{ background: "oklch(0.78 0.18 110 / 0.14)", color: green }}>
                          <CreditCard size={18} />
                        </div>
                        <h3 style={{ color: text, fontSize: 19, fontWeight: 700 }}>{pack.name}</h3>
                        <p className="mt-2 type-caption" style={{ color: sub }}>{pack.credits}</p>
                        <label className="mt-4 block">
                          <span className="mb-2 block type-caption" style={{ color: faint, letterSpacing: 0, textTransform: "none" }}>输入充值金额 HKD</span>
                          <input
                            value={rechargeAmounts[pack.id] || ""}
                            onChange={event => {
                              const nextValue = normalizeRechargeAmount(event.target.value);
                              setRechargeAmounts(current => ({ ...current, [pack.id]: nextValue }));
                            }}
                            inputMode="numeric"
                            placeholder={pack.placeholder}
                            className="h-10 w-full rounded-[var(--radius-lg-design)] border px-3 type-caption outline-none transition-colors"
                            style={{
                              borderColor: border,
                              background: isDark ? "oklch(0.09 0.012 270 / 0.54)" : "oklch(1 0 0 / 0.72)",
                              color: text,
                            }}
                          />
                        </label>
                        <div className="mt-3 type-caption" style={{ color: faint, letterSpacing: 0, textTransform: "none" }}>
                          可兑换 {quoteCreditRecharge(Number(rechargeAmounts[pack.id] || 0)).credits.toLocaleString("zh-HK")} 积分
                        </div>
                        <p className="mt-4 type-caption leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>{pack.usage}</p>
                        <ul className="mt-4 min-h-[92px] space-y-2">
                          {pack.perks.map(perk => (
                            <li key={perk.label} className="flex items-start gap-2 type-caption leading-5" style={{ color: perk.included ? sub : faint, letterSpacing: 0, textTransform: "none" }}>
                              {perk.included ? (
                                <Check size={13} style={{ color: green, flex: "0 0 auto", marginTop: 2 }} />
                              ) : (
                                <X size={13} style={{ color: "oklch(0.58 0.03 270)", flex: "0 0 auto", marginTop: 2 }} />
                              )}
                              <span>{perk.label}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => startRechargePayment(pack.id, pack.name)}
                          disabled={payingRechargeId === pack.id}
                          className="mt-5 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ background: green, color: "#10130A", fontWeight: 720 }}
                        >
                          {payingRechargeId === pack.id ? "创建支付中" : "充值"}
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
          style={{ background: "oklch(0 0 0 / 0.62)", backdropFilter: "blur(12px)" }}
        >
          <div
            className="w-full max-w-[420px] rounded-[var(--radius-xl-design)] border p-5"
            style={{ background: panelStrong, borderColor: border, boxShadow: "0 24px 80px oklch(0 0 0 / 0.38)" }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 style={{ color: text, fontSize: 20, fontWeight: 720 }}>
                  {paymentDialog.status === "success"
                    ? paymentDialog.kind === "subscription" ? "订阅成功" : "充值成功"
                    : "扫码完成支付"}
                </h3>
                <p className="mt-1 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                  {paymentDialog.status === "success"
                    ? paymentDialog.kind === "subscription" ? "感谢您的支持，订阅状态已同步刷新。" : "感谢您的支持，积分余额已同步刷新。"
                    : `${paymentDialog.title} · HKD ${paymentDialog.amount.toLocaleString("zh-HK")} · ${paymentDialog.credits.toLocaleString("zh-HK")} 积分`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentDialog(null)}
                className="h-8 w-8 rounded-[var(--radius-md-design)] type-caption"
                style={{ color: sub, background: isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)" }}
              >
                ×
              </button>
            </div>

            {paymentDialog.status === "success" ? (
              <div className="rounded-[var(--radius-lg-design)] border p-4 text-center" style={{ borderColor: "oklch(0.78 0.18 110 / 0.34)", background: "oklch(0.78 0.18 110 / 0.10)" }}>
                <div style={{ color: green, fontSize: 26, fontWeight: 760 }}>+{paymentDialog.credits.toLocaleString("zh-HK")}</div>
                <p className="mt-1 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                  {paymentDialog.kind === "subscription" ? "订阅已生效" : "积分已到账"}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-[var(--radius-lg-design)] border px-3 py-4 text-center" style={{ borderColor: "oklch(0.78 0.18 110 / 0.24)", background: "oklch(0.78 0.18 110 / 0.08)" }}>
                    <div style={{ color: green, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>HKD {paymentDialog.amount.toLocaleString("zh-HK")}</div>
                    <div className="mt-2 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>支付金额</div>
                  </div>
                  <div className="rounded-[var(--radius-lg-design)] border px-3 py-4 text-center" style={{ borderColor: "oklch(0.68 0.20 292 / 0.22)", background: "oklch(0.68 0.20 292 / 0.08)" }}>
                    <div style={{ color: text, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{paymentDialog.credits.toLocaleString("zh-HK")}</div>
                    <div className="mt-2 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>算力积分</div>
                  </div>
                </div>
                <div className="text-center">
                  {paymentDialog.payUrlType === "qr" ? (
                    <img
                      src={paymentDialog.payUrl}
                      alt="支付二维码"
                      className="mx-auto h-[220px] w-[220px] object-contain"
                      onError={event => {
                        event.currentTarget.style.display = "none";
                        const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : (
                    <div />
                  )}
                  <div
                    className="flex h-[220px] flex-col items-center justify-center gap-3"
                    style={{ display: paymentDialog.payUrlType === "qr" ? "none" : "flex" }}
                  >
                    <WalletCards size={34} style={{ color: green }} />
                    <a
                      href={paymentDialog.payUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[var(--radius-md-design)] px-4 py-2 type-caption"
                      style={{ background: green, color: "#10130A", fontWeight: 720 }}
                    >
                      打开支付页面
                    </a>
                  </div>
                </div>
                <p className="mt-3 text-center type-caption" style={{ color: faint, letterSpacing: 0, textTransform: "none" }}>
                  支付完成后会自动刷新{paymentDialog.kind === "subscription" ? "订阅状态" : "积分余额"}
                </p>
                <button
                  type="button"
                  onClick={confirmPaymentCompleted}
                  className="mt-4 h-11 w-full rounded-[var(--radius-md-design)] type-body transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: green, color: "#10130A", fontWeight: 760 }}
                >
                  我已支付
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {paymentResultDialog?.open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          style={{ background: "oklch(0 0 0 / 0.58)", backdropFilter: "blur(12px)" }}
        >
          <div
            className="w-full max-w-[360px] rounded-[var(--radius-xl-design)] border p-5 text-center"
            style={{ background: panelStrong, borderColor: border, boxShadow: "0 24px 80px oklch(0 0 0 / 0.36)" }}
          >
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full" style={{ background: green, color: "#10130A" }}>
              <Check size={22} strokeWidth={2.4} />
            </div>
            <h3 className="mt-4" style={{ color: text, fontSize: 20, fontWeight: 760 }}>
              {paymentResultDialog.kind === "recharge"
                ? `您已成功支付 ${paymentResultDialog.amount.toLocaleString("zh-HK")} HKD`
                : "订阅支付已完成"}
            </h3>
            <p className="mt-2 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
              {paymentResultDialog.kind === "recharge"
                ? `${paymentResultDialog.credits.toLocaleString("zh-HK")} 积分已同步到您的账户。`
                : "订阅状态已同步刷新，感谢您的支持。"}
            </p>
            <button
              type="button"
              onClick={() => setPaymentResultDialog(null)}
              className="mt-5 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: green, color: "#10130A", fontWeight: 760 }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
