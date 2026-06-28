import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Crown,
  LockKeyhole,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
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
  syncBillingStateFromServer,
  type BillingOrder,
  type PaymentMethod,
} from "@/lib/billing-state";

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
};

const BUSINESS_POINTS = [
  "所有套餐按积分消耗，不做无限生成承诺",
  "基础积分按月发放，降低一次性算力负债",
  "高级视频和批量任务使用更高积分扣减兜住成本",
];

export default function UpgradePage() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [cycleId, setCycleId] = useState<BillingCycleId>("annual");
  const [selectedPlanId, setSelectedPlanId] = useState<MembershipPlan["id"]>("pro");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wechat");
  const [balance, setBalance] = useState(() => getStoredCreditBalance());
  const [orders, setOrders] = useState<BillingOrder[]>(() => getStoredOrders());
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const selectedCycle = BILLING_CYCLES.find(cycle => cycle.id === cycleId) ?? BILLING_CYCLES[3];
  const selectedPlan = MEMBERSHIP_PLANS.find(plan => plan.id === selectedPlanId) ?? MEMBERSHIP_PLANS[2];
  const selectedQuote = useMemo(
    () => getPlanQuote(selectedPlan, selectedCycle),
    [selectedCycle, selectedPlan]
  );
  const activeOrder = orders.find(order => order.id === activeOrderId) ?? null;
  const recentOrders = orders.slice(0, 5);

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
      toast("请先登录", { description: "登录后即可创建扫码订单并购买积分。" });
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
      toast("订单已创建", { description: `请使用${PAYMENT_METHOD_LABEL[paymentMethod]}扫码完成支付。` });
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
    void refreshBillingStateAsync();
  }, []);

  return (
    <div className="h-screen overflow-y-auto bg-[#090a10] text-white">
      <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-5 py-6 md:px-8">
        <section className="relative overflow-hidden rounded-lg border border-white/10 bg-[#10121a]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(197,237,71,0.16),transparent_32%),radial-gradient(circle_at_78%_10%,rgba(147,108,255,0.18),transparent_28%)]" />
          <div className="relative grid gap-5 p-5 lg:grid-cols-[1fr_360px] lg:p-7">
            <div className="min-w-0">
              <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-lime-300/25 bg-lime-300/10 px-3 py-1.5 text-xs font-medium text-lime-100">
                <Sparkles size={14} />
                ArtX 会员升级 · 创始增长价
              </div>
              <h1 className="max-w-[760px] text-[30px] font-semibold leading-tight tracking-normal text-white md:text-[42px]">
                充值积分，解锁更高频的 AI 创作能力
              </h1>
              <p className="mt-3 max-w-[760px] text-sm leading-6 text-white/58">
                参考成熟平台定价后下调约 10 个百分点做早期增长价，仍保留 40%-60% 综合毛利边界。不同模型按不同积分扣减，适合从轻度体验到团队批量生产。
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {BUSINESS_POINTS.map(point => (
                  <div key={point} className="rounded-md border border-white/10 bg-black/18 px-3 py-3 text-xs leading-5 text-white/58">
                    <Check size={14} className="mb-2 text-lime-200" />
                    {point}
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-white/10 bg-black/24 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-white/42">当前积分余额</div>
                  <div className="mt-1 flex items-center gap-2 text-2xl font-semibold text-white">
                    <WalletCards size={21} className="text-lime-200" />
                    {formatCredits(balance)}
                  </div>
                </div>
                <div className="rounded-md bg-lime-300 px-2.5 py-1 text-xs font-bold text-slate-950">可充值</div>
              </div>
              <div className="mt-4 rounded-md bg-white/[0.055] p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/56">当前选择</span>
                  <span className="font-semibold text-white">{selectedPlan.shortName} · {selectedCycle.label}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[28px] font-semibold text-lime-100">{formatCurrency(selectedQuote.price)}</div>
                    <div className="text-xs text-white/42">折合 {formatCurrency(selectedQuote.monthlyEquivalent)}/月</div>
                  </div>
                  <div className="text-right text-xs text-white/48">
                    <div>{selectedQuote.creditsPerYuan.toFixed(1)} 积分/¥1</div>
                    <div>到账 {formatCredits(selectedQuote.totalCredits)}</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">选择套餐和周期</h2>
                <p className="mt-1 text-sm text-white/45">全年默认推荐；3 年套餐用于创始会员锁价，不默认推高总价。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {BILLING_CYCLES.map(cycle => {
                  const active = cycle.id === cycleId;
                  return (
                    <button
                      key={cycle.id}
                      type="button"
                      onClick={() => setCycleId(cycle.id)}
                      className={cn(
                        "relative min-h-10 rounded-md border px-3 py-2 text-left text-sm transition",
                        active ? "border-lime-300/70 bg-lime-300/15 text-lime-50" : "border-white/10 bg-white/[0.045] text-white/62 hover:bg-white/[0.075]"
                      )}
                    >
                      <span className="font-semibold">{cycle.label}</span>
                      <span className="ml-2 text-xs opacity-70">{cycle.badge}</span>
                      {cycle.recommended && <span className="ml-2 rounded bg-lime-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">最划算</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              {MEMBERSHIP_PLANS.map(plan => {
                const quote = getPlanQuote(plan, selectedCycle);
                const active = selectedPlanId === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={cn(
                      "group flex min-h-[360px] flex-col rounded-lg border p-4 text-left transition",
                      active ? "border-lime-300/70 bg-lime-300/[0.12] shadow-[0_18px_60px_rgba(197,237,71,0.12)]" : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]"
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {plan.recommended ? <Crown size={17} className="text-lime-200" /> : <Zap size={16} className="text-white/40" />}
                          <h3 className="text-base font-semibold text-white">{plan.shortName}</h3>
                        </div>
                        <p className="mt-1 text-xs text-white/38">{plan.name}</p>
                      </div>
                      {plan.recommended && (
                        <span className="rounded-full bg-lime-300 px-2 py-0.5 text-[10px] font-bold text-slate-950">推荐</span>
                      )}
                    </div>

                    <div className="text-2xl font-semibold text-white">{formatCurrency(quote.price)}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatCurrency(quote.monthlyEquivalent)}/月 · {quote.creditsPerYuan.toFixed(1)} 积分/¥1
                    </div>

                    <div className="mt-4 rounded-md bg-black/25 p-3">
                      <div className="text-sm font-medium text-lime-100">{formatCredits(plan.monthlyCredits)} 积分/月</div>
                      <div className="mt-1 text-xs leading-5 text-white/48">
                        周期共 {formatCredits(quote.totalCredits)}
                        {quote.bonusCredits > 0 ? `，赠 ${formatCredits(quote.bonusCredits)}` : ""}
                      </div>
                    </div>

                    <p className="mt-3 min-h-[44px] text-xs leading-5 text-white/56">{plan.tagline}</p>
                    <ul className="mt-3 space-y-2 text-xs text-white/62">
                      {plan.features.map(feature => (
                        <li key={feature} className="flex gap-2">
                          <Check size={13} className="mt-0.5 shrink-0 text-lime-200" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-4 text-xs text-white/36">{plan.audience}</div>
                  </button>
                );
              })}
            </div>

            <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck size={16} className="text-lime-200" />
                积分发放和模型消耗
              </div>
              <p className="text-sm leading-6 text-white/56">{selectedCycle.creditRule}。奖励积分一次性到账，有效期 12 个月；高成本模型使用更高积分消耗。</p>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {CREDIT_COST_RULES.map(rule => (
                  <div key={rule.task} className="flex items-center justify-between gap-3 rounded-md bg-black/24 px-3 py-2 text-xs">
                    <span className="text-white/56">{rule.task}</span>
                    <span className="shrink-0 font-medium text-lime-100">{rule.credits}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-lg border border-white/10 bg-[#11131b] p-4 xl:sticky xl:top-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">确认订单</h2>
                <p className="mt-1 text-xs text-white/42">扫码支付接口接入位，当前用于前端流程验证。</p>
              </div>
              <QrCode size={22} className="text-lime-200" />
            </div>

            <div className="rounded-md bg-black/25 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">套餐</span>
                <span className="font-semibold text-white">{selectedPlan.name}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-white/50">周期</span>
                <span className="text-white">{selectedCycle.label}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-white/50">到账积分</span>
                <span className="text-lime-100">{formatCredits(selectedQuote.totalCredits)}</span>
              </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">应付金额</span>
                  <span className="text-2xl font-semibold text-white">{formatCurrency(selectedQuote.price)}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["wechat", "alipay"] as PaymentMethod[]).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition",
                    paymentMethod === method ? "border-lime-300/70 bg-lime-300/15 text-lime-50" : "border-white/10 bg-white/[0.045] text-white/62 hover:bg-white/[0.075]"
                  )}
                >
                  {PAYMENT_METHOD_LABEL[method]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={createOrder}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-slate-950 transition hover:bg-lime-200"
            >
              创建扫码订单
              <ArrowRight size={15} />
            </button>

            {activeOrder && (
              <div className="mt-3 rounded-md border border-lime-300/24 bg-lime-300/[0.08] p-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(`artx:${activeOrder.id}:${activeOrder.amount}`)}`}
                  alt="扫码支付二维码占位"
                  className="mx-auto h-36 w-36 rounded bg-white p-2"
                />
                <div className="mt-2 text-center text-xs text-white/50">
                  {PAYMENT_METHOD_LABEL[activeOrder.paymentMethod]} · {activeOrder.status === "paid" ? "已支付" : "待支付"}
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

            <div className="mt-4 grid gap-2 text-xs">
              <div className="flex items-center gap-2 rounded-md bg-white/[0.045] px-3 py-2 text-white/50">
                <LockKeyhole size={13} className="text-lime-200" />
                支付回调接入后自动刷新余额和会员状态
              </div>
              <div className="flex items-center gap-2 rounded-md bg-white/[0.045] px-3 py-2 text-white/50">
                <CircleDollarSign size={13} className="text-lime-200" />
                企业合同、发票、退款留给后台订单系统扩展
              </div>
            </div>

            {recentOrders.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/45">
                  <ReceiptText size={13} />
                  最近订单
                </div>
                <div className="space-y-2">
                  {recentOrders.map(order => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setActiveOrderId(order.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-md bg-black/24 px-3 py-2 text-left text-xs"
                    >
                      <span className="min-w-0 truncate text-white/58">{order.planName} · {order.cycleLabel}</span>
                      <span className={order.status === "paid" ? "text-lime-200" : "text-amber-200"}>
                        {order.status === "paid" ? "已入账" : "待支付"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>

        <section className="grid gap-3 pb-8 md:grid-cols-3">
          {[
            { icon: BadgeCheck, title: "主推 Pro", desc: "¥129/月是默认收入核心，全年折合约 ¥103/月。" },
            { icon: Crown, title: "Creator 承接增长", desc: "¥49/月降低新用户心理门槛，适合内容和电商用户。" },
            { icon: ShieldCheck, title: "利润边界", desc: "通过模型分级扣积分控制成本，不用低价无限生成。" },
          ].map(item => (
            <div key={item.title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <item.icon size={18} className="text-lime-200" />
              <div className="mt-3 text-sm font-semibold text-white">{item.title}</div>
              <p className="mt-1 text-xs leading-5 text-white/48">{item.desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
