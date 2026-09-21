/**
 * 订阅套餐面板。页面与弹窗共用。
 *
 * ⚠️ 这里的定价、额度、周期全部来自 @shared/billing-config 现算，
 * 不允许出现任何硬编码的价格或积分数字。
 */
import { Check, X } from "lucide-react";
import {
  BILLING_CYCLES,
  MEMBERSHIP_PLANS,
  formatCurrency,
  getPlanQuote,
} from "@shared/billing-config";
import PaymentMethodLogo from "./PaymentMethodLogo";
import {
  buildCreditFeature,
  getSubscriptionPlanLevel,
  subscriptionPlans,
} from "./billing-shared";
import type { BillingTheme } from "./billing-theme";
import type { BillingCenterController } from "./use-billing-center";

export default function SubscriptionPanel({
  controller,
  theme,
  compact = false,
}: {
  controller: BillingCenterController;
  theme: BillingTheme;
  /** 弹窗里空间更紧，卡片不锁 480 最小高，改为自适应。 */
  compact?: boolean;
}) {
  const {
    activeCycle,
    setActiveCycle,
    activeCycleConfig,
    cycleLabel,
    selectedPlanId,
    setSelectedPlanId,
    hoveredPlanId,
    setHoveredPlanId,
    subscribedPlanId,
    payingPlanId,
    selectedPaymentMethod,
    activePaymentMethod,
    startSubscriptionPayment,
  } = controller;
  const { isDark, panel, panelStrong, border, text, sub, faint, green } = theme;

  return (
    <section
      className="rounded-[var(--radius-xl-design)] border p-4 backdrop-blur-xl"
      style={{
        background: panel,
        borderColor: border,
        minHeight: compact ? undefined : 480,
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
            style={{ color: sub, letterSpacing: 0, textTransform: "none" }}
          >
            按整体创作服务收费，周期支持月付、季付与年付。
          </p>
          {/*
            ⚠️ 这行随所选周期变化，直接取 BILLING_CYCLES[].creditRule，
            不要在这里另写一句静态文案 —— 月/季/年的发放与结转口径不同，
            写死会导致切到年付后说明还停留在月付口径（信息对不上）。
          */}
          <p
            className="mt-1.5 type-caption"
            style={{ color: faint, letterSpacing: 0, textTransform: "none" }}
          >
            {activeCycleConfig.creditRule}
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
            MEMBERSHIP_PLANS.find(item => item.id === planConfig.id) ||
            MEMBERSHIP_PLANS[0];
          const quote = getPlanQuote(plan, activeCycleConfig);
          const activePlanId = hoveredPlanId || selectedPlanId;
          const isFocused = activePlanId === plan.id;
          const isSelected = selectedPlanId === plan.id;
          const isCurrentSubscribedPlan = subscribedPlanId === plan.id;
          const currentPlanLevel = getSubscriptionPlanLevel(subscribedPlanId);
          const isDowngradePlan =
            currentPlanLevel > 0 && planConfig.level < currentPlanLevel;
          const isSubscriptionDisabled =
            isCurrentSubscribedPlan ||
            isDowngradePlan ||
            payingPlanId === plan.id;
          /*
            徽标只表达「与账户状态有关的既成事实」，不表达鼠标点选。

            原先这里还有一支 isSelected → "已选择"：用户每点一张卡，
            徽标就凭空出现/消失一次，而它和标题在同一行抢宽度 ——
            「已选择」三个字会把自己挤成两行（「已选」/「择」），
            连带把 "Studio 工作室版" 也压成两行，整张卡头部高度翻倍，
            点哪张哪张跳（用户已反馈「UI 布局不稳定」）。

            选中态并没有因此失去反馈：卡片边框会高亮、底部按钮变绿
            （见下方 isSelected 的两处用法），比一个徽标更明显。
          */
          const planBadge = isCurrentSubscribedPlan
            ? "当前套餐"
            : isDowngradePlan
              ? "不可降级"
              : planConfig.highlight
                ? "推荐"
                : "";
          const originalPrice = Math.ceil((quote.price * 1.42) / 10) * 10 + 9;
          return (
            <article
              key={planConfig.id}
              onMouseEnter={() => setHoveredPlanId(plan.id)}
              onMouseLeave={() => setHoveredPlanId(null)}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`flex flex-col rounded-[var(--radius-xl-design)] border p-4 ${compact ? "" : "min-h-[480px]"}`}
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
                {/* min-w-0：flex 子项默认 min-width:auto，不加这个
                    文本块不肯收缩，挤压会全部转嫁给右侧徽标。 */}
                <div className="min-w-0">
                  <p
                    className="type-caption"
                    style={{ color: isFocused ? green : sub }}
                  >
                    {planConfig.audience}
                  </p>
                  <h3
                    className="mt-1"
                    style={{ color: text, fontSize: 22, fontWeight: 720 }}
                  >
                    {plan.name}
                  </h3>
                </div>
                {/*
                  whitespace-nowrap + shrink-0：剩下的「当前套餐」「不可降级」
                  都是四个字，一旦被 flex 压缩就会折成两行，把标题一起顶开。
                  徽标宁可占满自己的宽度，也不许换行。
                */}
                <span
                  className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 type-caption"
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
                  background: isDark ? "#222222" : "oklch(0 0 0 / 3%)",
                }}
              >
                <div className="type-caption" style={{ color: faint }}>
                  ArtX 标准价
                </div>
                <div className="mt-1 flex flex-wrap items-end gap-2">
                  <span style={{ color: text, fontSize: 24, fontWeight: 760 }}>
                    {formatCurrency(quote.price)}
                  </span>
                  <span className="pb-1 type-caption" style={{ color: sub }}>
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
                  {/*
                    ⚠️ 这里必须展示「每月到账」而不是 quote.totalCredits。
                    自会员积分改为按月发放后，年卡的 336,000 是分 12 期发的，
                    直接显示总额会让用户以为付款后立刻全额到账。
                  */}
                  每月到账 {quote.creditsPerPeriod.toLocaleString("zh-HK")} 创作积分
                  {quote.periods > 1 && (
                    <>
                      ，共 {quote.periods} 期（累计{" "}
                      {quote.totalCredits.toLocaleString("zh-HK")}）
                    </>
                  )}
                </div>
              </div>

              {/*
                额度条目现算后置于权益列表首位，和上方价格区共用
                同一个 quote —— 两处数字来自同一来源，天然不会打架。
              */}
              <ul className="mt-4 flex-1 space-y-2.5">
                {[
                  buildCreditFeature(
                    quote.creditsPerPeriod,
                    quote.periods,
                    quote.totalCredits,
                    cycleLabel,
                    planConfig.creditsNote
                  ),
                  ...planConfig.features,
                ].map(feature => (
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
                        style={{ color: green, flex: "0 0 auto", marginTop: 2 }}
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
                    <PaymentMethodLogo
                      method={selectedPaymentMethod}
                      compact
                    />
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
  );
}
