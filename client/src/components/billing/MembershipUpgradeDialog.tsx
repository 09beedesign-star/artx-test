import { useEffect, useMemo, useState } from "react";
import { Check, Crown, QrCode, ShieldCheck, Sparkles, WalletCards, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  BILLING_CYCLES,
  CREDIT_COST_RULES,
  formatCredits,
  formatCurrency,
  getPlanQuote,
  MEMBERSHIP_PLANS,
  type BillingCycleId,
  type MembershipPlan,
} from "@/lib/membership-plans";
import {
  createServerBillingOrder,
  getStoredCreditBalance,
  getStoredOrders,
  markServerBillingOrderPaid,
  OPEN_MEMBERSHIP_EVENT,
  syncBillingStateFromServer,
  type BillingOrder,
  type PaymentMethod,
} from "@/lib/billing-state";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  wechat: "微信扫码",
  alipay: "支付宝扫码",
};

export default function MembershipUpgradeDialog() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [open, setOpen] = useState(false);
  const [cycleId, setCycleId] = useState<BillingCycleId>("annual");
  const [selectedPlanId, setSelectedPlanId] = useState<MembershipPlan["id"]>("pro");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wechat");
  const [balance, setBalance] = useState(() => getStoredCreditBalance());
  const [orders, setOrders] = useState<BillingOrder[]>(() => getStoredOrders());
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_MEMBERSHIP_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_MEMBERSHIP_EVENT, handleOpen);
  }, []);

  const selectedCycle = BILLING_CYCLES.find(cycle => cycle.id === cycleId) ?? BILLING_CYCLES[3];
  const selectedPlan = MEMBERSHIP_PLANS.find(plan => plan.id === selectedPlanId) ?? MEMBERSHIP_PLANS[2];
  const selectedQuote = useMemo(
    () => getPlanQuote(selectedPlan, selectedCycle),
    [selectedCycle, selectedPlan]
  );
  const visibleOrders = orders.slice(0, 3);

  const refreshBillingState = () => {
    setBalance(getStoredCreditBalance());
    setOrders(getStoredOrders());
  };

  const refreshBillingStateAsync = async () => {
    await syncBillingStateFromServer();
    refreshBillingState();
  };

  const createOrder = async () => {
    if (!isAuthenticated) {
      openLoginModal();
      toast("请先登录", { description: "登录后即可扫码购买套餐积分。" });
      return;
    }

    try {
      const order = await createServerBillingOrder({
        planId: selectedPlan.id,
        cycleId: selectedCycle.id,
        paymentMethod,
      });
      setActiveOrderId(order.id);
      refreshBillingState();
      toast("订单已创建", { description: `请使用${METHOD_LABEL[paymentMethod]}完成支付。` });
    } catch (error) {
      toast.error("订单创建失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    }
  };

  const completeActiveOrder = async () => {
    if (!activeOrderId) return;
    try {
      const result = await markServerBillingOrderPaid(activeOrderId);
      setBalance(result.balance);
      setOrders(result.orders as BillingOrder[]);
      toast.success("积分已到账", {
        description: `${formatCredits((result.orders as BillingOrder[]).find((item) => item.id === activeOrderId)?.credits || 0)} 积分已加入余额。`,
      });
    } catch (error) {
      toast.error("支付确认失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    }
  };

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    void refreshBillingStateAsync();
  }, [open, isAuthenticated]);

  const activeOrder = orders.find(order => order.id === activeOrderId) ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[92vh] w-[min(1180px,calc(100vw-28px))] overflow-hidden rounded-[18px] border-0 bg-[#0b0d14] p-0 text-white shadow-2xl shadow-black/50 sm:max-w-[1180px]"
        showCloseButton
      >
        <div className="flex max-h-[92vh] flex-col overflow-hidden">
          <DialogHeader className="border-b border-white/10 px-5 py-4 text-left md:px-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-lime-300/25 bg-lime-300/10 px-2.5 py-1 text-xs text-lime-100">
                  <Sparkles size={13} />
                  新平台增长价 · 保留利润，不做亏本拉新
                </div>
                <DialogTitle className="text-xl font-semibold tracking-normal text-white md:text-2xl">
                  升级会员，购买创作积分
                </DialogTitle>
                <DialogDescription className="mt-2 max-w-[720px] text-sm leading-6 text-white/58">
                  套餐按 1 元约 25-44 积分设计；周期越长越划算。基础积分按月发放，奖励积分一次性到账并保留 12 个月。
                </DialogDescription>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.045] px-4 py-3 text-right">
                <div className="text-xs text-white/45">当前余额</div>
                <div className="mt-1 flex items-center justify-end gap-2 text-lg font-semibold text-white">
                  <WalletCards size={18} className="text-lime-200" />
                  {formatCredits(balance)} 积分
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto px-5 py-5 md:px-7">
            <section className="mb-5 flex flex-wrap gap-2">
              {BILLING_CYCLES.map(cycle => {
                const active = cycle.id === cycleId;
                return (
                  <button
                    key={cycle.id}
                    type="button"
                    onClick={() => setCycleId(cycle.id)}
                    className="relative min-h-11 rounded-md border px-4 py-2 text-left text-sm transition"
                    style={{
                      background: active ? "rgba(197,237,71,0.16)" : "rgba(255,255,255,0.045)",
                      borderColor: active ? "rgba(197,237,71,0.70)" : "rgba(255,255,255,0.10)",
                      color: active ? "#f7ffd0" : "rgba(255,255,255,0.70)",
                    }}
                  >
                    <span className="font-semibold">{cycle.label}</span>
                    <span className="ml-2 text-xs opacity-70">{cycle.badge}</span>
                    {cycle.recommended && (
                      <span className="ml-2 rounded bg-lime-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
                        默认推荐
                      </span>
                    )}
                  </button>
                );
              })}
            </section>

            <section className="grid gap-3 lg:grid-cols-5">
              {MEMBERSHIP_PLANS.map(plan => {
                const quote = getPlanQuote(plan, selectedCycle);
                const active = selectedPlanId === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className="group flex min-h-[330px] flex-col rounded-lg border p-4 text-left transition"
                    style={{
                      background: active ? "linear-gradient(180deg, rgba(197,237,71,0.16), rgba(255,255,255,0.045))" : "rgba(255,255,255,0.035)",
                      borderColor: active ? "rgba(197,237,71,0.72)" : "rgba(255,255,255,0.10)",
                      boxShadow: active ? "0 18px 60px rgba(197,237,71,0.12)" : "none",
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {plan.recommended ? <Crown size={17} className="text-lime-200" /> : <Zap size={16} className="text-white/45" />}
                        <h3 className="text-base font-semibold text-white">{plan.shortName}</h3>
                      </div>
                      {plan.recommended && (
                        <span className="rounded-full bg-lime-300 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                          推荐
                        </span>
                      )}
                    </div>

                    <div className="text-2xl font-semibold text-white">{formatCurrency(quote.price)}</div>
                    <div className="mt-1 text-xs text-white/45">
                      折合 {formatCurrency(quote.monthlyEquivalent)}/月 · {quote.creditsPerYuan.toFixed(1)} 积分/¥1
                    </div>

                    <div className="mt-4 rounded-md bg-black/25 p-3">
                      <div className="text-sm font-medium text-lime-100">{formatCredits(plan.monthlyCredits)} 积分/月</div>
                      <div className="mt-1 text-xs leading-5 text-white/48">
                        本周期共 {formatCredits(quote.totalCredits)} 积分
                        {quote.bonusCredits > 0 ? `，含赠送 ${formatCredits(quote.bonusCredits)}` : ""}
                      </div>
                    </div>

                    <p className="mt-3 min-h-[44px] text-xs leading-5 text-white/56">{plan.tagline}</p>
                    <ul className="mt-3 space-y-2 text-xs text-white/64">
                      {plan.features.map(feature => (
                        <li key={feature} className="flex gap-2">
                          <Check size={13} className="mt-0.5 shrink-0 text-lime-200" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-4 text-xs text-white/38">{plan.audience}</div>
                  </button>
                );
              })}
            </section>

            <section className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <ShieldCheck size={16} className="text-lime-200" />
                  积分发放和成本边界
                </div>
                <p className="text-sm leading-6 text-white/58">{selectedCycle.creditRule}。不同模型消耗不同积分，不承诺无限生成。</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {CREDIT_COST_RULES.map(rule => (
                    <div key={rule.task} className="flex items-center justify-between gap-3 rounded-md bg-black/24 px-3 py-2 text-xs">
                      <span className="text-white/56">{rule.task}</span>
                      <span className="shrink-0 font-medium text-lime-100">{rule.credits}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">扫码购买</div>
                    <div className="mt-1 text-xs text-white/45">当前为支付接口占位，可替换为聚合支付二维码。</div>
                  </div>
                  <QrCode size={22} className="text-lime-200" />
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  {(["wechat", "alipay"] as PaymentMethod[]).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className="rounded-md border px-3 py-2 text-sm transition"
                      style={{
                        background: paymentMethod === method ? "rgba(197,237,71,0.16)" : "rgba(255,255,255,0.045)",
                        borderColor: paymentMethod === method ? "rgba(197,237,71,0.68)" : "rgba(255,255,255,0.10)",
                        color: paymentMethod === method ? "#f7ffd0" : "rgba(255,255,255,0.68)",
                      }}
                    >
                      {METHOD_LABEL[method]}
                    </button>
                  ))}
                </div>

                <div className="rounded-md bg-black/28 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/56">{selectedPlan.shortName} · {selectedCycle.label}</span>
                    <span className="font-semibold text-white">{formatCurrency(selectedQuote.price)}</span>
                  </div>
                  <div className="mt-1 text-xs text-white/42">
                    支付后获得 {formatCredits(selectedQuote.totalCredits)} 积分
                  </div>
                </div>

                <button
                  type="button"
                  onClick={createOrder}
                  className="mt-3 h-10 w-full rounded-md bg-lime-300 text-sm font-semibold text-slate-950 transition hover:bg-lime-200"
                >
                  创建扫码订单
                </button>

                {activeOrder && (
                  <div className="mt-3 rounded-md border border-lime-300/24 bg-lime-300/8 p-3">
                    <div className="mx-auto grid size-28 grid-cols-5 gap-1 rounded bg-white p-2">
                      {Array.from({ length: 25 }).map((_, index) => (
                        <div
                          key={index}
                          className="rounded-[2px]"
                          style={{ background: (index + activeOrder.id.length) % 3 === 0 ? "#0f172a" : "#e5e7eb" }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 text-center text-xs text-white/50">
                      模拟二维码 · {activeOrder.status === "paid" ? "已支付" : "待支付"}
                    </div>
                    {activeOrder.status === "pending" && (
                      <button
                        type="button"
                        onClick={completeActiveOrder}
                        className="mt-3 h-9 w-full rounded-md border border-lime-300/40 text-sm text-lime-100 transition hover:bg-lime-300/10"
                      >
                        模拟支付成功并入账
                      </button>
                    )}
                  </div>
                )}

                {visibleOrders.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium text-white/45">最近订单</div>
                    {visibleOrders.map(order => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setActiveOrderId(order.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-md bg-black/22 px-3 py-2 text-left text-xs"
                      >
                        <span className="min-w-0 truncate text-white/58">{order.planName} · {order.cycleLabel}</span>
                        <span className={order.status === "paid" ? "text-lime-200" : "text-amber-200"}>
                          {order.status === "paid" ? "已入账" : "待支付"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
