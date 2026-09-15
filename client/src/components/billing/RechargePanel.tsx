/**
 * 积分充值面板。页面与弹窗共用。
 *
 * ⚠️ 「可兑换 X 积分」这行走 formatRechargePreview() → quoteCreditRecharge()，
 * 是阶梯汇率现算的，不允许在这里写死任何换算比例。
 */
import { Check, CreditCard, WalletCards, X } from "lucide-react";
import { Link } from "wouter";
import PaymentMethodLogo from "./PaymentMethodLogo";
import {
  formatRechargePreview,
  normalizeRechargeAmount,
  rechargePacks,
} from "./billing-shared";
import type { BillingTheme } from "./billing-theme";
import type { BillingCenterController } from "./use-billing-center";

export default function RechargePanel({
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
    rechargeAmounts,
    setRechargeAmounts,
    payingRechargeId,
    selectedPaymentMethod,
    activePaymentMethod,
    startRechargePayment,
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
            style={{ color: sub, letterSpacing: 0, textTransform: "none" }}
          >
            积分只代表可用创作额度，不绑定某一个模型；充值按金额阶梯到账。
            <Link
              href="/credits-guide"
              className="ml-1.5 underline underline-offset-2 transition-opacity hover:opacity-80"
              style={{ color: green }}
            >
              查看完整积分规则
            </Link>
          </p>
        </div>
        <WalletCards size={20} style={{ color: green }} />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {rechargePacks.map(pack => (
          <article
            key={pack.id}
            className={`flex flex-col rounded-[var(--radius-xl-design)] border p-4 ${compact ? "" : "min-h-[480px]"}`}
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
            <h3 style={{ color: text, fontSize: 19, fontWeight: 700 }}>
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
                  background: isDark ? "#222222" : "oklch(1 0 0 / 0.72)",
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
              {formatRechargePreview(Number(rechargeAmounts[pack.id] || 0))}
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
            {/*
              flex-1 而不是 min-h-[92px]：充值按钮必须三张卡底部对齐。

              原先 article 是普通块级流、这里给固定最小高，按钮位置就完全
              跟着上方内容高度走 —— 「可兑换 X 积分 · Y 积分/HKD」这行
              在第一张卡是一行、后两张换行成两行，按钮于是高了一截（已反馈）。
              min-h-[480px] 只锁卡片外框总高，锁不住内部元素的垂直位置。

              订阅卡（SubscriptionPanel）早就是 flex flex-col + ul flex-1 的写法，
              这里保持一致：让权益列表吸收剩余空间，把按钮压到底部。
            */}
            <ul className="mt-4 flex-1 space-y-2">
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
                  <span>{perk.label}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => startRechargePayment(pack.id, pack.name)}
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
                <span>
                  {payingRechargeId === pack.id
                    ? "创建支付中"
                    : `用${activePaymentMethod.label}充值`}
                </span>
              </span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
