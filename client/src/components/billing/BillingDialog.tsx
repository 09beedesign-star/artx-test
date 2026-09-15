/**
 * 计费弹窗：订阅与充值的浮层形态。
 *
 * ⚠️ 存在的理由：用户在画布里点右上角积分/升级，原先是 navigate("/billing")
 * 整页跳走 —— 画布组件被卸载，用户充完值回来还得重新找回工作现场。
 * 现在改成浮层，画布原样留在背后。
 *
 * ⚠️ 这里**不重新实现任何计费逻辑**：套餐卡、充值卡、支付方式、二维码弹窗
 * 全部直接复用 BillingPage 同款组件，逻辑走同一个 useBillingCenter()。
 * 两边各写一套 = 改价只改到一边，本项目已踩过九次，不许再来第十次。
 */
import { useEffect } from "react";
import { Crown, Rocket, WalletCards, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import PaymentDialogs from "./PaymentDialogs";
import PaymentMethodPicker from "./PaymentMethodPicker";
import RechargePanel from "./RechargePanel";
import SubscriptionPanel from "./SubscriptionPanel";
import { billingTabs, type BillingTab } from "./billing-shared";
import { getBillingTheme } from "./billing-theme";
import { useBillingCenter } from "./use-billing-center";

export default function BillingDialog({
  open,
  initialTab = "recharge",
  onClose,
}: {
  open: boolean;
  initialTab?: BillingTab;
  onClose: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const theme = getBillingTheme(resolvedTheme === "dark");
  const controller = useBillingCenter(initialTab);
  const {
    activeTab,
    setActiveTab,
    balance,
    currentPlan,
    subscriptionStatus,
    balanceFlash,
    paymentDialog,
    successDialog,
  } = controller;
  const { panel, panelStrong, border, text, sub, faint, purple } = theme;

  /*
    每次「重新打开」都要回到调用方指定的 tab。

    点积分按钮开的是充值、点升级开的是订阅，但组件一直挂在 TopBar 里不卸载，
    useState 的初始值只在首次挂载时生效 —— 不同步这一下，
    用户先点升级再点积分，看到的还是订阅页（零报错，纯粹不听话）。
  */
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  /*
    ⚠️ Esc 只关最上层：二维码或成功弹窗开着时，Esc 应该先关它们，
    不能一脚把整个计费弹窗踹掉 —— 用户正在扫码，页面突然消失会以为支付失败。
  */
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (paymentDialog?.open || successDialog?.open) return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, paymentDialog?.open, successDialog?.open]);

  /*
    弹窗开着时锁掉 body 滚动。

    画布页 body 本身不滚，但工作台、资产页这些长页面会：不锁的话
    在弹窗里滚到底，滚动会穿透到背后的页面，关掉弹窗发现页面跑飞了。
  */
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-6"
      style={{
        background: "rgba(23,23,23,0.72)",
        backdropFilter: "blur(10px)",
      }}
      onClick={event => {
        // 只有点在遮罩本身才关闭，点内容区不关。
        if (event.target === event.currentTarget) onClose();
      }}
      data-artx-billing-dialog
    >
      <div
        data-artx-dialog-surface
        className="my-auto w-full max-w-[1180px] overflow-hidden rounded-[var(--radius-xl-design)] border"
        style={{
          background: theme.bg,
          borderColor: border,
          boxShadow: "0 32px 100px oklch(0 0 0 / 0.46)",
        }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b p-5"
          style={{ borderColor: border, background: panel }}
        >
          <div className="min-w-0">
            <div
              className="mb-2 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1 type-caption"
              style={{
                background: "oklch(0.68 0.20 292 / 0.14)",
                color: purple,
              }}
            >
              <Crown size={13} />
              ArtXstudio会员中心
            </div>
            <h2
              className="type-title-sm"
              style={{
                color: text,
                fontSize: 22,
                fontWeight: 680,
                letterSpacing: 0,
              }}
            >
              订阅、充值与升级
            </h2>
            <p
              className="mt-1 type-caption"
              style={{ color: sub, letterSpacing: 0, textTransform: "none" }}
            >
              支付完成后余额会自动刷新，画布内容保持不变。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭计费弹窗"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-80"
            style={{
              color: sub,
              background: theme.isDark
                ? "oklch(1 0 0 / 6%)"
                : "oklch(0 0 0 / 5%)",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-2 sm:grid-cols-3">
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

          <PaymentMethodPicker controller={controller} theme={theme} />

          <div
            className="inline-grid grid-cols-2 gap-1 rounded-[var(--radius-lg-design)] border p-1"
            style={{ borderColor: border, background: panelStrong }}
          >
            {billingTabs.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="h-9 rounded-[var(--radius-md-design)] px-4 type-caption transition-all"
                  style={{
                    background: active
                      ? "oklch(0.68 0.20 292 / 0.16)"
                      : "transparent",
                    color: active ? text : sub,
                    border: `1px solid ${active ? "oklch(0.68 0.20 292 / 0.34)" : "transparent"}`,
                    fontWeight: active ? 680 : 500,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "subscription" && (
            <SubscriptionPanel controller={controller} theme={theme} compact />
          )}
          {activeTab === "recharge" && (
            <RechargePanel controller={controller} theme={theme} compact />
          )}
        </div>
      </div>

      <PaymentDialogs controller={controller} theme={theme} />
    </div>
  );
}
