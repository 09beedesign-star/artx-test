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
  const { isDark, panel, border, text, faint } = theme;
  /**
   * 选中 = 实心黑底白字；未选中 = 白底 + 灰色线框 + 深色字。
   *
   * 【2026-11-12】未选中原本是「黑底 + opacity 0.72」洗出来的深灰，
   * 与选中态区分度差，且 opacity 作用于整棵子树，连品牌彩色 logo 一起洗淡。
   * 现改为独立的浅色态，不再靠透明度区分。
   * ⚠️ 文字色必须跟着 active 一起翻，否则白底上白字不可见。
   */
  const surfaceActive = isDark ? "#F2F2F2" : "#161616";
  const surfaceIdle = isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF";
  const borderActive = isDark ? "rgba(255,255,255,0.30)" : "#161616";
  const borderIdle = isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.18)";
  const titleActive = isDark ? "#161616" : "#FFFFFF";
  const titleIdle = isDark ? "#F2F2F2" : "#161616";
  const hintActive = isDark ? "rgba(22,22,22,0.55)" : "rgba(255,255,255,0.65)";
  const hintIdle = isDark ? "rgba(255,255,255,0.58)" : "rgba(22,22,22,0.52)";

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
                  background: active ? surfaceActive : surfaceIdle,
                  borderColor: active ? borderActive : borderIdle,
                  color: active ? titleActive : titleIdle,
                }}
              >
                <PaymentMethodLogo method={method.id} />
                <span className="min-w-0">
                  <span
                    className="block type-caption"
                    style={{ color: active ? titleActive : titleIdle, fontWeight: 720 }}
                  >
                    {method.label}
                  </span>
                  <span
                    className="mt-0.5 block type-caption"
                    style={{
                      color: active ? hintActive : hintIdle,
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
