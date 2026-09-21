/**
 * 支付二维码弹窗 + 支付成功弹窗。页面与弹窗共用。
 *
 * ⚠️ z-index 分层：二维码 z-[80] < 成功 z-[90]，
 * 而计费弹窗本体是 z-[70] —— 它们必须叠在计费弹窗之上，
 * 否则在画布里点充值会看到二维码被计费弹窗盖住。
 */
import { WalletCards } from "lucide-react";
import PaymentMethodLogo from "./PaymentMethodLogo";
import { isQrImagePayUrl } from "./billing-shared";
import type { BillingTheme } from "./billing-theme";
import type { BillingCenterController } from "./use-billing-center";

export default function PaymentDialogs({
  controller,
  theme,
}: {
  controller: BillingCenterController;
  theme: BillingTheme;
}) {
  const {
    paymentDialog,
    setPaymentDialog,
    successDialog,
    setSuccessDialog,
    checkPaymentStatus,
  } = controller;
  const { isDark, panelStrong, border, text, sub, faint, green } = theme;

  return (
    <>
      {paymentDialog?.open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{
            background: "rgba(34,34,34,0.72)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            data-artx-dialog-surface
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
                    <span>
                      {paymentDialog.paymentMethod === "wechat"
                        ? "微信扫码支付"
                        : "支付宝扫码支付"}
                    </span>
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
            data-artx-dialog-surface
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
    </>
  );
}
