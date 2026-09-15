import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, Crown, Rocket, WalletCards } from "lucide-react";
import TopBar from "@/components/workspace/TopBar";
import { useTheme } from "@/contexts/ThemeContext";
import { BG_GLOW } from "@/lib/workspace-data";
/*
  ⚠️ 这一页和画布右上角的充值弹窗是同一套东西。

  套餐卡、充值卡、支付方式、二维码与成功弹窗、下单与轮询逻辑，
  全部来自 components/billing/ 下的共享组件与 useBillingCenter()。
  这里只负责「整页版式」：背景、TopBar、页头统计卡、左侧 tab 栏。

  绝对不要因为「页面上想微调一下」就在本文件里复制一份卡片或一段下单逻辑 ——
  本项目已经因为「同一份数据的多个出口」踩过九次，表现永远是零报错、
  改了一边另一边纹丝不动。要调就调共享组件，两边一起变。
*/
import PaymentDialogs from "@/components/billing/PaymentDialogs";
import PaymentMethodPicker from "@/components/billing/PaymentMethodPicker";
import RechargePanel from "@/components/billing/RechargePanel";
import SubscriptionPanel from "@/components/billing/SubscriptionPanel";
import {
  billingTabs,
  readInitialTab,
  type BillingTab,
} from "@/components/billing/billing-shared";
import { getBillingTheme } from "@/components/billing/billing-theme";
import { useBillingCenter } from "@/components/billing/use-billing-center";

export default function BillingPage() {
  const { resolvedTheme } = useTheme();
  const [location, navigate] = useLocation();
  const theme = getBillingTheme(resolvedTheme === "dark");
  const controller = useBillingCenter(readInitialTab());
  const {
    activeTab,
    setActiveTab,
    balance,
    currentPlan,
    subscriptionStatus,
    balanceFlash,
  } = controller;
  const { isDark, bg, panel, panelStrong, border, text, sub, faint, purple } =
    theme;

  /*
    URL 是这一页的事实源：左侧 tab 点击会 replace 掉 ?tab=，
    而 TopBar 的积分/升级按钮在本页也走 navigate 改 URL（不开弹窗）。
    这个 effect 负责把 URL 的变化同步回组件状态 —— 少了它，
    在 /billing 页面上点右上角「升级」会改了地址栏但内容不动。
  */
  useEffect(() => {
    const nextTab = readInitialTab();
    setActiveTab(nextTab);
  }, [location]);

  const switchTab = (tab: BillingTab) => {
    setActiveTab(tab);
    navigate(`/billing?tab=${tab}`, { replace: true });
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
        style={{
          position: "relative",
          zIndex: 1,
          background: isDark ? "#171717" : "var(--design-surface-soft)",
        }}
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
                  <Crown size={13} />
                  ArtXstudio会员中心
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
                  订阅或充值，享受更多高阶模型，尊享全部的优质创作AI服务。
                </p>
                {/*
                  2026-09-13 按要求移除页头的积分规则入口胶囊。
                  规则页本身没有下线，入口保留在「充值」标签的说明文案里
                  （见 RechargePanel 的「查看完整积分规则」），
                  /credits-guide 路由与页面均照常可访问。
                */}
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

          <PaymentMethodPicker controller={controller} theme={theme} />

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
                <SubscriptionPanel controller={controller} theme={theme} />
              )}
              {activeTab === "recharge" && (
                <RechargePanel controller={controller} theme={theme} />
              )}
            </div>
          </section>
        </div>
      </main>

      <PaymentDialogs controller={controller} theme={theme} />
    </div>
  );
}
