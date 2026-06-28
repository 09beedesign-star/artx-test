import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Crown,
  Layers3,
  Rocket,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import TopBar from "@/components/workspace/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { BG_GLOW } from "@/lib/workspace-data";
import { BILLING_CYCLES, MEMBERSHIP_PLANS, formatCurrency, getPlanQuote, type BillingCycleId, type MembershipPlanId } from "@shared/billing-config";

type BillingTab = "subscription" | "recharge" | "upgrade";

const billingTabs: Array<{ id: BillingTab; label: string; description: string }> = [
  { id: "subscription", label: "订阅服务", description: "整体创作服务订阅" },
  { id: "recharge", label: "积分充值", description: "额外购买可用创作额度" },
  { id: "upgrade", label: "升级方案", description: "当前方案与高阶方案对比" },
];

const subscriptionPlans = [
  {
    id: "lite" as MembershipPlanId,
    audience: "个人创作者",
    highlight: false,
    features: ["AI 对话与提示词共创", "图片生成与智能编辑", "智能背景基础队列", "标准清晰度导出"],
  },
  {
    id: "pro" as MembershipPlanId,
    audience: "高频创作与电商内容",
    highlight: true,
    features: ["GPT + Image Two + Nano Banana 能力池", "批量图片生成", "高清导出与 HD 提升", "更高任务队列优先级"],
  },
  {
    id: "studio" as MembershipPlanId,
    audience: "团队与商业项目",
    highlight: false,
    features: ["多人项目协作预留", "商业画板与素材管理", "更高并发任务占位", "发票与用量报表预留"],
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

const rechargePacks = [
  { id: "pack-small", name: "轻量补充", credits: "小额积分包", bonus: "赠送比例待定", usage: "临时补充生成额度" },
  { id: "pack-growth", name: "增长补充", credits: "中额积分包", bonus: "赠送比例待定", usage: "适合连续作业" },
  { id: "pack-scale", name: "规模补充", credits: "大额积分包", bonus: "赠送比例待定", usage: "适合批量生成与团队项目" },
];

const upgradeRows = [
  { label: "整体服务", current: "基础能力", target: "完整创作能力池" },
  { label: "生成额度", current: "基础额度", target: "更高月度额度" },
  { label: "任务队列", current: "标准队列", target: "优先队列" },
  { label: "导出能力", current: "标准导出", target: "高清与商业导出" },
];

function readInitialTab(): BillingTab {
  if (typeof window === "undefined") return "subscription";
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "recharge" || value === "upgrade" ? value : "subscription";
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
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);

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

  const switchTab = (tab: BillingTab) => {
    setActiveTab(tab);
    navigate(`/billing?tab=${tab}`, { replace: true });
  };

  const startSubscriptionPayment = async (planId: string, label: string) => {
    if (!isAuthenticated) {
      openLoginModal();
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

      toast("威富通支付已创建", {
        description: `${label} 订单已生成，请在打开的页面扫码或继续支付。`,
      });
      window.open(payResult.payment.payUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast("支付暂时不可用", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setPayingPlanId(null);
    }
  };

  const showPendingToast = (label: string) => {
    toast("功能待配置", {
      description: `${label} 的具体金额和支付动作还未启用。`,
    });
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
        <TopBar credits={75} />
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
                <p className="mt-2 max-w-[760px] type-body-sm leading-6" style={{ color: sub }}>
                  GPT 大语言模型、Image Two 与 Nano Banana 作为统一创作能力池提供服务。当前先开放订阅、充值与升级框架，正式套餐价格和权益会在配置完成后生效。
                </p>
              </div>

              <div className="grid min-w-[min(100%,520px)] grid-cols-3 gap-2">
                {[
                  { label: "当前计划", value: "Free", icon: Crown },
                  { label: "积分余额", value: "75", icon: WalletCards },
                  { label: "订阅状态", value: "待升级", icon: Rocket },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-[var(--radius-lg-design)] border p-3" style={{ background: panelStrong, borderColor: border }}>
                      <div className="mb-2 flex items-center gap-1.5 type-caption" style={{ color: faint }}>
                        <Icon size={13} />
                        {item.label}
                      </div>
                      <div style={{ color: text, fontSize: 18, fontWeight: 680 }}>{item.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
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
                      <p className="mt-1 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>按整体创作服务收费，周期支持月付、季付与年付。</p>
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

                  <div className="grid gap-3 xl:grid-cols-3">
                    {subscriptionPlans.map(planConfig => {
                      const plan = MEMBERSHIP_PLANS.find(item => item.id === planConfig.id) || MEMBERSHIP_PLANS[0];
                      const quote = getPlanQuote(plan, activeCycleConfig);
                      return (
                        <article
                        key={planConfig.id}
                        className="flex min-h-[360px] flex-col rounded-[var(--radius-xl-design)] border p-4"
                        style={{
                          background: planConfig.highlight ? "linear-gradient(180deg, oklch(0.18 0.04 292 / 0.92), oklch(0.12 0.014 270 / 0.92))" : panelStrong,
                          borderColor: planConfig.highlight ? "oklch(0.68 0.20 292 / 0.55)" : border,
                          boxShadow: planConfig.highlight ? "0 20px 56px oklch(0.58 0.22 290 / 0.18)" : "none",
                        }}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="type-caption" style={{ color: planConfig.highlight ? green : sub }}>{planConfig.audience}</p>
                            <h3 className="mt-1" style={{ color: text, fontSize: 22, fontWeight: 720 }}>{plan.name}</h3>
                          </div>
                          {planConfig.highlight && (
                            <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: "oklch(0.78 0.18 110 / 0.16)", color: green }}>
                              推荐
                            </span>
                          )}
                        </div>

                        <div className="rounded-[var(--radius-lg-design)] border p-3" style={{ borderColor: border, background: isDark ? "oklch(0.09 0.012 270 / 0.56)" : "oklch(0 0 0 / 3%)" }}>
                          <div className="type-caption" style={{ color: faint }}>ArtX 标准价</div>
                          <div className="mt-1 flex items-end gap-2">
                            <span style={{ color: text, fontSize: 24, fontWeight: 760 }}>{formatCurrency(quote.price)}</span>
                            <span className="pb-1 type-caption" style={{ color: sub }}>/ {cycleLabel}</span>
                          </div>
                          <div className="mt-1 type-caption" style={{ color: faint, letterSpacing: 0, textTransform: "none" }}>{quote.totalCredits.toLocaleString("zh-HK")} 创作积分</div>
                        </div>

                        <ul className="mt-4 flex-1 space-y-2.5">
                          {planConfig.features.map(feature => (
                            <li key={feature} className="flex items-start gap-2 type-caption leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                              <Check size={13} style={{ color: green, flex: "0 0 auto", marginTop: 2 }} />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          onClick={() => startSubscriptionPayment(plan.id, `${plan.name} ${cycleLabel}`)}
                          disabled={payingPlanId === plan.id}
                          className="mt-5 h-10 rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ background: planConfig.highlight ? green : "oklch(0.68 0.20 292 / 0.18)", color: planConfig.highlight ? "#10130A" : text, border: `1px solid ${planConfig.highlight ? "transparent" : "oklch(0.68 0.20 292 / 0.32)"}`, fontWeight: 700 }}
                        >
                          {payingPlanId === plan.id ? "创建支付中" : "选择订阅"}
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
                      <p className="mt-1 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>积分只代表可用创作额度，不绑定某一个模型。</p>
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
                        <div className="mt-4 rounded-[var(--radius-lg-design)] border px-3 py-2 type-caption" style={{ borderColor: border, color: faint }}>
                          {pack.bonus}
                        </div>
                        <p className="mt-4 min-h-[40px] type-caption leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>{pack.usage}</p>
                        <button
                          type="button"
                          onClick={() => showPendingToast(pack.name)}
                          className="mt-5 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ background: green, color: "#10130A", fontWeight: 720 }}
                        >
                          充值
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "upgrade" && (
                <section className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl" style={{ background: panel, borderColor: border }}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="type-title-sm" style={{ color: text, fontSize: 20, fontWeight: 680 }}>升级方案</h2>
                      <p className="mt-1 type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>先搭建 Free 到 Pro/Studio 的权益对比框架。</p>
                    </div>
                    <Zap size={20} style={{ color: purple }} />
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[1fr_1.4fr]">
                    <div className="rounded-[var(--radius-xl-design)] border p-4" style={{ background: panelStrong, borderColor: border }}>
                      <div className="mb-3 flex items-center gap-2 type-caption" style={{ color: green }}>
                        <Layers3 size={14} />
                        当前方案
                      </div>
                      <h3 style={{ color: text, fontSize: 24, fontWeight: 740 }}>Free</h3>
                      <p className="mt-2 type-caption leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                        用于体验基础画布与 AI 创作流程。升级后会获得更高额度、更多任务能力和优先队列。
                      </p>
                      <button
                        type="button"
                        onClick={() => showPendingToast("升级方案")}
                        className="mt-6 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{ background: green, color: "#10130A", fontWeight: 720 }}
                      >
                        升级到 Pro
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-[var(--radius-xl-design)] border" style={{ borderColor: border, background: panelStrong }}>
                      {upgradeRows.map((row, index) => (
                        <div
                          key={row.label}
                          className="grid grid-cols-[120px_1fr_1fr] gap-3 px-4 py-3 type-caption"
                          style={{ borderTop: index === 0 ? "none" : `1px solid ${border}`, color: sub, letterSpacing: 0, textTransform: "none" }}
                        >
                          <span style={{ color: text, fontWeight: 650 }}>{row.label}</span>
                          <span>{row.current}</span>
                          <span style={{ color: green }}>{row.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
