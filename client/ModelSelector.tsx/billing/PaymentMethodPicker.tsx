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
  const { panel, panelStrong, border, text, faint } = theme;

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
                  <span
                    className="block type-caption"
                    style={{ color: text, fontWeight: 720 }}
                  >
                    {method.label}
                  </span>
                  <span
                    className="mt-0.5 block type-caption"
                    style={{
                      color: faint,
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
