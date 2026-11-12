/**
 * 支付方式选择区。页面与弹窗共用。
 */
import PaymentMethodLogo from "./PaymentMethodLogo";
import { paymentMethods } from "./billing-shared";
import type { BillingTheme } from "./billing-theme";
import type { BillingCenterController } from "./use-billing-center";

export default function PaymentMethodPicker({
  controller,
  theme,
}: {
  controller: BillingCenterController;
  theme: BillingTheme;
}) {
  const { selectedPaymentMethod, setSelectedPaymentMethod } = controller;
  const { isDark, panel, panelStrong, border, text, faint } = theme;
  /**
   * 未选中 = 白面；选中 = 一层浅色底 + 同色描边。
   *
   * 【2026-11-10】微信那一支原本是品牌绿 `rgba(7,193,96,...)`，
   * 随「所有绿色系改为黑白色系」一并改成中性灰。
   * ⚠️ 只改绿的那一支，支付宝的蓝不动 —— 用户要求的是「绿色系」，
   * 蓝色属于品牌色，不在这次范围内。
   */
  const activeSurface = (isWechat: boolean) =>
    isWechat
      ? isDark
        ? "rgba(255,255,255,0.10)"
        : "rgba(22,22,22,0.07)"
      : "rgba(22, 119, 255, 0.14)";
  const activeBorder = (isWechat: boolean) =>
    isWechat
      ? isDark
        ? "rgba(255,255,255,0.32)"
        : "rgba(22,22,22,0.34)"
      : "rgba(22, 119, 255, 0.46)";

  return (
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
                    ? (isDark ? "#F2F2F2" : "#161616")
                    : (isDark ? "rgba(255,255,255,0.08)" : "#161616"),
                  borderColor: active
                    ? (isDark ? "rgba(255,255,255,0.3)" : "#161616")
                    : (isDark ? "rgba(255,255,255,0.12)" : "#161616"),
                  color: isDark ? "#161616" : "#FFFFFF",
                  opacity: active ? 1 : 0.72,
                }}
              >
                <PaymentMethodLogo method={method.id} />
                <span className="min-w-0">
                  <span
                    className="block type-caption"
                    style={{ color: isDark ? "#161616" : "#FFFFFF", fontWeight: 720 }}
                  >
                    {method.label}
                  </span>
                  <span
                    className="mt-0.5 block type-caption"
                    style={{
                      color: isDark ? "rgba(22,22,22,0.55)" : "rgba(255,255,255,0.65)",
                      letterSpacing: 0,
                      textTransform: "none",
                    }}
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
  );
}
