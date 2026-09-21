/**
 * 计费中心的全部状态与支付流程。
 *
 * ⚠️ 页面（/billing）和弹窗（画布右上角点积分/升级）共用这一个 hook。
 * 下单、拉起二维码、轮询到账、刷新余额、广播 artx:credits-updated ——
 * 这些逻辑只有这一份。谁也别想再复制一遍。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  BILLING_CYCLES,
  MEMBERSHIP_PLANS,
  quoteCreditRecharge,
  type BillingCycleId,
  type MembershipPlanId,
} from "@shared/billing-config";
import {
  BillingAuthExpiredError,
  billingFetch,
  clearExpiredAuthSession,
  deriveSubscriptionDisplay,
  notifyCreditsUpdated,
  paymentMethods,
  validateRechargeAmount,
  type BillingOrderResponse,
  type BillingPayResponse,
  type BillingStatusResponse,
  type BillingSummaryResponse,
  type BillingTab,
  type PaymentMethod,
} from "./billing-shared";

export type PaymentDialogState = {
  open: boolean;
  type: "subscription" | "recharge";
  orderId: string;
  payUrl: string;
  title: string;
  amount: number;
  credits: number;
  paymentMethod: PaymentMethod;
  cycleLabel?: string;
  status: "pending" | "success";
};

export type SuccessDialogState = {
  open: boolean;
  type: "subscription" | "recharge";
  title: string;
  amount: number;
  credits: number;
  cycleLabel?: string;
};

export function useBillingCenter(initialTab: BillingTab) {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [activeTab, setActiveTab] = useState<BillingTab>(initialTab);
  const [activeCycle, setActiveCycle] = useState<BillingCycleId>("monthly");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>("wechat");
  const [selectedPlanId, setSelectedPlanId] = useState<MembershipPlanId>("pro");
  const [hoveredPlanId, setHoveredPlanId] = useState<MembershipPlanId | null>(
    null
  );
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [currentPlan, setCurrentPlan] = useState("未订阅");
  const [subscribedPlanId, setSubscribedPlanId] =
    useState<MembershipPlanId | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("未订阅");
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [rechargeAmounts, setRechargeAmounts] = useState<
    Record<string, string>
  >({
    "pack-small": "50",
    "pack-growth": "150",
    "pack-scale": "500",
  });
  const [payingRechargeId, setPayingRechargeId] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] =
    useState<PaymentDialogState | null>(null);
  const [successDialog, setSuccessDialog] =
    useState<SuccessDialogState | null>(null);

  const activePaymentMethod =
    paymentMethods.find(item => item.id === selectedPaymentMethod) ||
    paymentMethods[0];

  const cycleLabel = useMemo(
    () => BILLING_CYCLES.find(item => item.id === activeCycle)?.label || "月付",
    [activeCycle]
  );
  const activeCycleConfig = useMemo(
    () =>
      BILLING_CYCLES.find(item => item.id === activeCycle) || BILLING_CYCLES[0],
    [activeCycle]
  );

  const refreshBillingSummary = async () => {
    if (!isAuthenticated) return;
    const result = await billingFetch<BillingSummaryResponse>(
      "/api/billing/summary"
    );
    if (typeof result.balance === "number") setBalance(result.balance);
    const display = deriveSubscriptionDisplay(result.plan);
    setCurrentPlan(display.currentPlan);
    setSubscribedPlanId(display.subscribedPlanId);
    setSubscriptionStatus(display.subscriptionStatus);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshBillingSummary().catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    )
      return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshBillingSummary().catch(() => {});
      }
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isAuthenticated]);

  const showPaymentSuccess = async (dialog: PaymentDialogState) => {
    const summary = await billingFetch<BillingSummaryResponse>(
      "/api/billing/summary"
    ).catch(() => null);
    if (summary && typeof summary.balance === "number") {
      setBalance(summary.balance);
      notifyCreditsUpdated(summary.balance);
      const display = deriveSubscriptionDisplay(summary.plan);
      setCurrentPlan(display.currentPlan);
      setSubscribedPlanId(display.subscribedPlanId);
      setSubscriptionStatus(display.subscriptionStatus);
      setBalanceFlash(true);
      window.setTimeout(() => setBalanceFlash(false), 900);
    }
    setPaymentDialog(null);
    setSuccessDialog({
      open: true,
      type: dialog.type,
      title: dialog.title,
      amount: dialog.amount,
      credits: dialog.credits,
      cycleLabel: dialog.cycleLabel,
    });
  };

  /*
    ⚠️ 轮询回调必须从 ref 里取最新的 paymentDialog，不能吃闭包里的旧值。

    页面形态下 setInterval 的依赖数组能兜住，但弹窗形态下用户可能在轮询
    进行中关掉弹窗又立刻开另一笔单 —— 闭包里的 orderId 会指向上一笔，
    结果是「A 单已付」被判给 B 单。用 ref 读当前值，回调永远看的是现在。
  */
  const paymentDialogRef = useRef<PaymentDialogState | null>(null);
  paymentDialogRef.current = paymentDialog;

  const checkPaymentStatus = async (showPendingToast = false) => {
    const current = paymentDialogRef.current;
    if (!current?.open) return;
    try {
      const result = await billingFetch<BillingStatusResponse>(
        `/api/billing/orders/${current.orderId}/status`
      );
      if (result.order?.status === "paid") {
        // 再确认一次「用户还停在同一笔单上」，否则这次到账不该弹给他。
        if (paymentDialogRef.current?.orderId !== current.orderId) return;
        await showPaymentSuccess(current);
        return;
      }
      if (showPendingToast) {
        toast("暂未确认到账", {
          description: "如果已经完成支付，请稍等几秒后再点一次。",
        });
      }
    } catch (error) {
      if (showPendingToast) {
        toast("支付状态查询失败", {
          description: error instanceof Error ? error.message : "请稍后重试",
        });
      }
    }
  };

  useEffect(() => {
    if (!paymentDialog?.open || paymentDialog.status === "success") return;
    const interval = window.setInterval(() => {
      void checkPaymentStatus(false);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [paymentDialog?.open, paymentDialog?.orderId, paymentDialog?.status]);

  const handlePaymentError = (error: unknown) => {
    if (error instanceof BillingAuthExpiredError) {
      clearExpiredAuthSession();
      openLoginModal();
      toast("登录已失效", {
        description: "请重新登录后再继续订阅或充值。",
      });
      return;
    }

    toast("支付暂时不可用", {
      description: error instanceof Error ? error.message : "请稍后重试",
    });
  };

  const startSubscriptionPayment = async (planId: string, label: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setPayingPlanId(planId);
    try {
      const orderResult = await billingFetch<BillingOrderResponse>(
        "/api/billing/orders",
        {
          method: "POST",
          body: JSON.stringify({
            planId,
            cycleId: activeCycle,
            paymentMethod: selectedPaymentMethod,
          }),
        }
      );
      if (!orderResult.order) {
        throw new Error(orderResult.error || "订单创建失败");
      }

      const payResult = await billingFetch<BillingPayResponse>(
        `/api/billing/orders/${orderResult.order.id}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            paymentMethod: selectedPaymentMethod,
            mode: "native",
          }),
        }
      );
      if (!payResult.payment?.payUrl) {
        throw new Error(payResult.error || "威富通支付链接创建失败");
      }

      const selectedPlan = MEMBERSHIP_PLANS.find(item => item.id === planId);
      setPaymentDialog({
        open: true,
        type: "subscription",
        orderId: orderResult.order.id,
        payUrl: payResult.payment.payUrl,
        title: selectedPlan?.name || orderResult.order.planName || label,
        amount: orderResult.order.amount,
        credits: orderResult.order.credits || 0,
        paymentMethod: selectedPaymentMethod,
        cycleLabel: orderResult.order.cycleLabel || cycleLabel,
        status: "pending",
      });
    } catch (error) {
      handlePaymentError(error);
    } finally {
      setPayingPlanId(null);
    }
  };

  const startRechargePayment = async (packId: string, packName: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const rawAmount = rechargeAmounts[packId] || "";
    const error = validateRechargeAmount(rawAmount);
    if (error) {
      toast("充值金额不可用", { description: error });
      return;
    }
    const amount = Number(rawAmount);
    const quote = quoteCreditRecharge(amount);

    setPayingRechargeId(packId);
    try {
      const orderResult = await billingFetch<BillingOrderResponse>(
        "/api/billing/orders",
        {
          method: "POST",
          body: JSON.stringify({
            type: "recharge",
            amount,
            paymentMethod: selectedPaymentMethod,
          }),
        }
      );
      if (!orderResult.order) {
        throw new Error(orderResult.error || "充值订单创建失败");
      }

      const payResult = await billingFetch<BillingPayResponse>(
        `/api/billing/orders/${orderResult.order.id}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            paymentMethod: selectedPaymentMethod,
            mode: "native",
          }),
        }
      );
      if (!payResult.payment?.payUrl) {
        throw new Error(payResult.error || "威富通支付链接创建失败");
      }

      setPaymentDialog({
        open: true,
        type: "recharge",
        orderId: orderResult.order.id,
        payUrl: payResult.payment.payUrl,
        title: packName,
        amount,
        credits: quote.credits,
        paymentMethod: selectedPaymentMethod,
        status: "pending",
      });
    } catch (error) {
      handlePaymentError(error);
    } finally {
      setPayingRechargeId(null);
    }
  };

  return {
    activeTab,
    setActiveTab,
    activeCycle,
    setActiveCycle,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    selectedPlanId,
    setSelectedPlanId,
    hoveredPlanId,
    setHoveredPlanId,
    payingPlanId,
    balance,
    currentPlan,
    subscribedPlanId,
    subscriptionStatus,
    balanceFlash,
    rechargeAmounts,
    setRechargeAmounts,
    payingRechargeId,
    paymentDialog,
    setPaymentDialog,
    successDialog,
    setSuccessDialog,
    activePaymentMethod,
    cycleLabel,
    activeCycleConfig,
    checkPaymentStatus,
    startSubscriptionPayment,
    startRechargePayment,
  };
}

export type BillingCenterController = ReturnType<typeof useBillingCenter>;
