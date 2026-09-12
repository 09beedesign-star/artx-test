import { useMemo } from "react";
import { Link } from "wouter";
import { CalendarClock, Coins, Gift, Info, RefreshCw, Sparkles, Wallet } from "lucide-react";
import TopBar from "@/components/workspace/TopBar";
import { useTheme } from "@/contexts/ThemeContext";
import { BG_GLOW } from "@/lib/workspace-data";
import {
  CREDIT_COST_RULES,
  CREDIT_EXPIRY_RULES,
  CREDIT_RECHARGE_TIERS,
  MEMBERSHIP_PLANS,
  formatCredits,
} from "@shared/billing-config";

/**
 * 面向终端用户的积分规则说明页。
 *
 * ⚠️ 本页所有数字**必须**从 @shared/billing-config 渲染，禁止硬编码。
 * 这是「对用户的正式承诺」，一旦和 server/admin-store.ts 的实际扣费行为
 * 对不上就是合规问题。历史教训：BILLING_CYCLES 的 creditRule 长期写着
 * 「未使用积分到期不结转」，代码却是余额保留，两边不一致很久没人发现。
 *
 * 样式刻意不用 shadcn 的 Card/Button —— 本项目用户侧页面（HelpPage /
 * BillingPage / SettingsPage）全是手写 div + Tailwind + inline style，
 * 用组件库反而会和站内其他页面割裂。
 */
export default function CreditsGuidePage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.20 0.012 270)";
  const sub = isDark ? "oklch(0.71 0.010 270)" : "oklch(0.64 0.010 270)";
  const panel = isDark ? "oklch(0.12 0.016 270 / 0.86)" : "oklch(1 0 0 / 0.86)";
  const field = isDark ? "oklch(1 0 0 / 0.055)" : "oklch(0 0 0 / 0.035)";
  const border = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const accent = "#C5ED47";

  // 用主推档位举例，避免写死「Pro」——将来换主推档这里自动跟着变。
  const featuredPlan = useMemo(
    () => MEMBERSHIP_PLANS.find((plan) => plan.recommended) || MEMBERSHIP_PLANS[0],
    [],
  );
  const rolloverCap = featuredPlan.monthlyCredits * (CREDIT_EXPIRY_RULES.membership.rolloverMonths + 1);

  const expiryCards = [
    {
      key: "recharge",
      icon: Wallet,
      rule: CREDIT_EXPIRY_RULES.recharge,
      badge: `${CREDIT_EXPIRY_RULES.recharge.days} 天`,
    },
    {
      key: "membership",
      icon: RefreshCw,
      rule: CREDIT_EXPIRY_RULES.membership,
      badge: "每月发放",
    },
    {
      key: "gift",
      icon: Gift,
      rule: CREDIT_EXPIRY_RULES.gift,
      badge: `${CREDIT_EXPIRY_RULES.gift.days} 天`,
    },
  ] as const;

  const sectionStyle = {
    background: panel,
    borderColor: border,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative" }}>
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: 0 }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} />
      </div>

      <main className="flex-1 overflow-auto px-6 py-10" style={{ position: "relative", zIndex: 1 }}>
        <section className="mx-auto w-full max-w-3xl">
          <div className="mb-6">
            <h1 className="type-title-sm" style={{ color: text, fontSize: 24, fontWeight: 680 }}>
              积分规则说明
            </h1>
            <p className="mt-2 type-body-sm" style={{ color: sub }}>
              积分是站内统一的创作额度，不绑定具体模型。下面是积分怎么来、怎么用、什么时候过期的完整说明。
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <article className="rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl" style={sectionStyle}>
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock size={17} style={{ color: accent }} />
                <h2 className="type-body-sm font-medium" style={{ color: text, fontSize: 15 }}>
                  积分有效期
                </h2>
              </div>

              <div className="flex flex-col gap-3">
                {expiryCards.map(({ key, icon: Icon, rule, badge }) => (
                  <div
                    key={key}
                    className="rounded-[var(--radius-lg-design)] border p-4"
                    style={{ background: field, borderColor: border }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon size={15} style={{ color: sub }} />
                        <span className="type-body-sm font-medium" style={{ color: text }}>
                          {rule.label}
                        </span>
                      </div>
                      <span
                        className="rounded-[var(--radius-pill)] px-2.5 py-0.5 type-caption"
                        style={{ background: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.06)", color: sub }}
                      >
                        {badge}
                      </span>
                    </div>
                    <p className="mt-2 type-body-sm font-medium" style={{ color: text }}>
                      {rule.summary}
                    </p>
                    <p className="mt-1.5 type-caption" style={{ color: sub, lineHeight: 1.7 }}>
                      {rule.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="mt-4 flex gap-2.5 rounded-[var(--radius-lg-design)] border p-3.5"
                style={{ background: field, borderColor: border }}
              >
                <Info size={15} className="mt-0.5 shrink-0" style={{ color: sub }} />
                <p className="type-caption" style={{ color: sub, lineHeight: 1.7 }}>
                  账户里同时存在多种积分时，系统会
                  <span style={{ color: text, fontWeight: 500 }}>优先扣除最快过期的那一份</span>
                  ，尽量帮你减少浪费。积分过期后不折现、不补发，也不可转赠给其他账号。
                </p>
              </div>
            </article>

            <article className="rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl" style={sectionStyle}>
              <div className="mb-2 flex items-center gap-2">
                <RefreshCw size={17} style={{ color: accent }} />
                <h2 className="type-body-sm font-medium" style={{ color: text, fontSize: 15 }}>
                  会员积分怎么发放
                </h2>
              </div>
              <p className="type-caption" style={{ color: sub, lineHeight: 1.7 }}>
                以 {featuredPlan.name}（每月 {formatCredits(featuredPlan.monthlyCredits)} 积分）为例：
              </p>

              <ol className="mt-3 flex flex-col gap-2.5">
                {[
                  `订阅后每月发放 ${formatCredits(featuredPlan.monthlyCredits)} 积分。购买季卡或年卡同样按月发放，不是一次性全部到账。`,
                  `当月没用完的积分可以留到下个月继续用，不会一到月底就清零。`,
                  `账户内的会员积分余额上限为 ${formatCredits(rolloverCap)} 积分（相当于 ${CREDIT_EXPIRY_RULES.membership.rolloverMonths + 1} 个月额度），超出的部分会自动失效。`,
                  `订阅到期或退款后，不再继续发放后续月份的积分。`,
                ].map((line, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-pill)] type-caption"
                      style={{ background: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.06)", color: sub }}
                    >
                      {index + 1}
                    </span>
                    <span className="type-caption" style={{ color: sub, lineHeight: 1.7 }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ol>
            </article>

            <article className="rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl" style={sectionStyle}>
              <div className="mb-4 flex items-center gap-2">
                <Coins size={17} style={{ color: accent }} />
                <h2 className="type-body-sm font-medium" style={{ color: text, fontSize: 15 }}>
                  充值到账比例
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {CREDIT_RECHARGE_TIERS.map((tier) => (
                  <div
                    key={tier.minAmount}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg-design)] border px-4 py-3"
                    style={{ background: field, borderColor: border }}
                  >
                    <span className="type-body-sm" style={{ color: text }}>
                      单笔充值满 HKD {formatCredits(tier.minAmount)}
                    </span>
                    <span className="type-body-sm font-medium" style={{ color: text }}>
                      {tier.creditsPerHkd} 积分 / HKD
                      <span className="ml-2 type-caption" style={{ color: sub, fontWeight: 400 }}>
                        {tier.label}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 type-caption" style={{ color: sub, lineHeight: 1.7 }}>
                充值金额越高，每 HKD 兑换的积分越多。每笔充值的有效期从该笔付款日单独起算
                {CREDIT_EXPIRY_RULES.recharge.days} 天，多次充值不会互相延期。
              </p>
            </article>

            <article className="rounded-[var(--radius-xl-design)] border p-5 backdrop-blur-xl" style={sectionStyle}>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles size={17} style={{ color: accent }} />
                <h2 className="type-body-sm font-medium" style={{ color: text, fontSize: 15 }}>
                  积分消耗参考
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {CREDIT_COST_RULES.map((item) => (
                  <div
                    key={item.task}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg-design)] border px-4 py-3"
                    style={{ background: field, borderColor: border }}
                  >
                    <span className="type-body-sm" style={{ color: text }}>
                      {item.task}
                    </span>
                    <span className="type-caption" style={{ color: sub }}>
                      {item.credits}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 type-caption" style={{ color: sub, lineHeight: 1.7 }}>
                实际扣费以发起任务时页面提示的数值为准。生成失败且未产生上游调用时，积分会自动退回。
              </p>
            </article>

            <div className="flex flex-wrap items-center gap-3 pb-2">
              <Link
                href="/billing?tab=recharge"
                className="flex h-10 items-center gap-2 rounded-[var(--radius-md-design)] px-5 type-body-sm font-medium transition-transform hover:opacity-90 active:scale-[0.98]"
                style={{ background: accent, color: "#000", boxShadow: "0 14px 30px rgba(197,237,71,0.24)" }}
              >
                去充值
              </Link>
              <Link
                href="/billing?tab=subscription"
                className="flex h-10 items-center gap-2 rounded-[var(--radius-md-design)] border px-5 type-body-sm transition-colors hover:bg-white/10"
                style={{ borderColor: border, color: sub, background: "transparent" }}
              >
                查看订阅方案
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
