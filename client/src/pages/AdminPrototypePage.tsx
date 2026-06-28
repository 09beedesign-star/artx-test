import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  Gift,
  History,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type AdminSection =
  | "overview"
  | "users"
  | "orders"
  | "credits"
  | "feedback"
  | "integrations"
  | "risk"
  | "audit";

type Status = "normal" | "watch" | "blocked";
type OrderStatus = "paid" | "pending" | "failed" | "refunded";
type FeedbackStatus = "new" | "processing" | "waiting_user" | "resolved" | "closed";
type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "支付" | "报错" | "接口" | "额度" | "风控";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  credits: number;
  spent: number;
  totalRecharge?: number;
  frozenCredits?: number;
  organization?: string;
  status: Status;
  lastSeen: string;
  risk: string;
};

type Order = {
  id: string;
  user: string;
  userId?: string;
  packageName?: string;
  channel: string;
  amount: number;
  credits: number;
  expectedCredits?: number;
  issuedCredits?: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  event?: string;
  reconciliation?: "matched" | "pending" | "mismatch";
  providerTransactionId?: string;
  refundAmount?: number;
  refundedCredits?: number;
};

type OrderDetail = {
  order: Order;
  user?: AdminUser;
  creditEntries: Array<{ id: string; user: string; type: string; delta: number; operator: string; source: string; reason: string; createdAt: string }>;
  auditEntries: Array<{ id: string; actorName: string; action: string; target: string; createdAt: string; reason?: string }>;
  feedbackEntries: Feedback[];
  notes: Array<{ id: string; actorName: string; content: string; createdAt: string }>;
  paymentEvents: Array<{ id: string; type: string; status: string; providerTransactionId?: string; amount?: number; signatureValid?: boolean; message: string; createdAt: string }>;
  refundEvents: Array<{
    id: string;
    amount: number;
    creditsDeducted: number;
    reason: string;
    status: string;
    providerRefundId?: string;
    currentStep: string;
    actorName: string;
    createdAt: string;
    flow?: Array<{ id: string; label: string; status: "done" | "current" | "pending" | "failed"; detail: string; createdAt?: string }>;
  }>;
  timeline: Array<{ id: string; type: string; status: string; message: string; createdAt: string }>;
};

type Feedback = {
  id: string;
  user: string;
  title: string;
  module: string;
  status: FeedbackStatus;
  priority: "P0" | "P1" | "P2";
  createdAt: string;
};

type OpsAlert = {
  id: string;
  category: AlertCategory;
  title: string;
  detail: string;
  severity: AlertSeverity;
  time: string;
  owner: string;
  unread: boolean;
  linkedSection?: AdminSection;
};

type CreditEvent = {
  id: string;
  user: string;
  type: string;
  amount: string;
  actor: string;
  note: string;
};

type Integration = {
  id?: string;
  name: string;
  category: string;
  state: string;
  latency: string;
  owner: string;
  configLocation?: string;
  credentialStatus?: string;
};

type AuditRow = {
  actor: string;
  action: string;
  target: string;
  time: string;
  reason?: string;
};

type AiTask = {
  id: string;
  generationId: string;
  backendTaskId: string;
  providerTaskId: string;
  user: string;
  capability: string;
  provider: string;
  model: string;
  status: string;
  latencyMs: number;
  failureReason: string;
  estimatedCost: number;
  chargedCredits: number;
  grossMargin: number;
  createdAt: string;
};

type RiskEvent = {
  id: string;
  title: string;
  detail: string;
  status: string;
  severity: "high" | "medium" | "low";
  target: string;
  createdAt: string;
};

type PricingPlan = {
  id: string;
  name: string;
  price: number;
  credits: number;
  channel: string;
  status: string;
};

type OverviewData = {
  metrics: {
    todayRevenue: number;
    paymentExceptions: number;
    issuedCredits: number;
    consumedCredits: number;
    remainingCredits: number;
    aiSuccessRate: number;
    pendingFeedback: number;
    highRiskEvents: number;
  };
  operationsQueue: Array<{ title: string; body: string; priority: string; section?: AdminSection }>;
  maturity: Array<{ label: string; value: number }>;
  aiCostSummary?: {
    totalEstimatedCost: number;
    totalChargedCredits: number;
    successCount: number;
    failedCount: number;
    avgGrossMargin: number;
  };
  aiBillingPolicies?: Array<{
    capability: string;
    capabilityKey?: string;
    unit: string;
    baseCredits: number;
    estimatedCostPerUnit: number;
    provider: string;
  }>;
  planDiscounts?: Array<{
    planId: string;
    multiplier: number;
    label: string;
  }>;
  capabilityStatus?: Array<{ id: string; domain: string; status: "ready" | "partial" | "missing"; summary: string; source: string }>;
  aiCostBreakdownByProvider?: Array<{
    key: string;
    label: string;
    estimatedCost: number;
    chargedCredits: number;
    successCount: number;
    failedCount: number;
    avgGrossMargin: number;
  }>;
  aiCostBreakdownByModel?: Array<{
    key: string;
    label: string;
    estimatedCost: number;
    chargedCredits: number;
    successCount: number;
    failedCount: number;
    avgGrossMargin: number;
  }>;
};

type AdminPayload = {
  overview?: OverviewData;
  users?: Array<AdminUser & { totalRecharge?: number; frozenCredits?: number; organization?: string }>;
  orders?: Array<Order & { issuedCredits?: number; expectedCredits?: number }>;
  credits?: Array<{ id: string; user: string; type: string; delta: number; operator: string; source: string; reason: string }>;
  aiTasks?: AiTask[];
  providers?: Array<Integration & { latencyMs?: number }>;
  feedback?: Feedback[];
  alerts?: OpsAlert[];
  riskEvents?: RiskEvent[];
  auditLogs?: Array<{ actorName?: string; action: string; target: string; createdAt: string; reason?: string }>;
  plans?: PricingPlan[];
  capabilityStatus?: Array<{ id: string; domain: string; status: "ready" | "partial" | "missing"; summary: string; source: string }>;
};

const sections: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  { id: "overview", label: "总览", description: "收入、算力、风险", icon: BarChart3 },
  { id: "users", label: "账户管理", description: "用户、状态、权限", icon: Users },
  { id: "orders", label: "支付订单", description: "支付、退款、对账", icon: CreditCard },
  { id: "credits", label: "额度管理", description: "积分、流水、调整", icon: WalletCards },
  { id: "feedback", label: "用户反馈", description: "意见、工单、回复", icon: MessageSquareText },
  { id: "integrations", label: "第三方接口", description: "支付、模型、密钥", icon: KeyRound },
  { id: "risk", label: "风控安全", description: "异常、限流、黑名单", icon: ShieldCheck },
  { id: "audit", label: "操作审计", description: "管理员动作追踪", icon: History },
];

const users: AdminUser[] = [
  {
    id: "usr_1028",
    name: "林澈",
    email: "lin@example.com",
    plan: "Pro 20K",
    credits: 18420,
    spent: 1299,
    status: "normal",
    lastSeen: "3 分钟前",
    risk: "低",
  },
  {
    id: "usr_1071",
    name: "Mira Studio",
    email: "ops@mira.ai",
    plan: "Team 100K",
    credits: 76310,
    spent: 5980,
    status: "watch",
    lastSeen: "18 分钟前",
    risk: "中",
  },
  {
    id: "usr_1189",
    name: "陈一鸣",
    email: "chen@example.com",
    plan: "Starter",
    credits: 920,
    spent: 99,
    status: "normal",
    lastSeen: "1 小时前",
    risk: "低",
  },
  {
    id: "usr_1220",
    name: "北辰增长",
    email: "finance@beichen.co",
    plan: "Enterprise",
    credits: 241900,
    spent: 32000,
    status: "blocked",
    lastSeen: "昨天",
    risk: "高",
  },
];

const orders: Order[] = [
  {
    id: "ord_90341",
    user: "林澈",
    channel: "Stripe",
    amount: 1299,
    credits: 20000,
    status: "paid",
    createdAt: "今天 11:24",
  },
  {
    id: "ord_90337",
    user: "Mira Studio",
    channel: "支付宝",
    amount: 5980,
    credits: 100000,
    status: "paid",
    createdAt: "今天 09:18",
  },
  {
    id: "ord_90310",
    user: "陈一鸣",
    channel: "微信支付",
    amount: 99,
    credits: 1200,
    status: "pending",
    createdAt: "昨天 21:06",
  },
  {
    id: "ord_90288",
    user: "北辰增长",
    channel: "PayPal",
    amount: 32000,
    credits: 500000,
    status: "failed",
    createdAt: "昨天 16:40",
  },
];

const feedbackSeed: Feedback[] = [
  {
    id: "fb_238",
    user: "Mira Studio",
    title: "批量生成时希望看到每个任务的积分预估",
    module: "额度消耗",
    status: "new",
    priority: "P1",
    createdAt: "今天 10:20",
  },
  {
    id: "fb_231",
    user: "林澈",
    title: "支付成功后积分到账慢了 2 分钟",
    module: "支付",
    status: "processing",
    priority: "P0",
    createdAt: "昨天 22:12",
  },
  {
    id: "fb_218",
    user: "陈一鸣",
    title: "希望支持导出积分流水",
    module: "报表",
    status: "resolved",
    priority: "P2",
    createdAt: "6 月 18 日",
  },
];

const alertSeed: OpsAlert[] = [
  {
    id: "al_901",
    category: "支付",
    title: "微信支付回调待确认",
    detail: "ord_90310 已扣款但积分未入账，建议 15 分钟内补偿或重放回调。",
    severity: "critical",
    time: "2 分钟前",
    owner: "Finance",
    unread: true,
  },
  {
    id: "al_898",
    category: "报错",
    title: "模型任务队列出现 5xx",
    detail: "Model Gateway 最近 10 分钟失败率 7.4%，影响高额度用户批量生成。",
    severity: "critical",
    time: "8 分钟前",
    owner: "AI Ops",
    unread: true,
  },
  {
    id: "al_892",
    category: "接口",
    title: "Render API 延迟升高",
    detail: "任务状态同步平均 812ms，超过观察阈值，可能导致用户误以为任务卡住。",
    severity: "warning",
    time: "19 分钟前",
    owner: "Infra",
    unread: true,
  },
  {
    id: "al_886",
    category: "额度",
    title: "北辰增长触发异常消耗",
    detail: "10 分钟内消耗 80K 积分，已冻结部分额度，等待人工复核。",
    severity: "warning",
    time: "昨天 16:51",
    owner: "Risk",
    unread: false,
  },
];

const creditEvents: CreditEvent[] = [
  { id: "cr_771", user: "林澈", type: "购买入账", amount: "+20,000", actor: "Stripe 回调", note: "ord_90341" },
  { id: "cr_769", user: "Mira Studio", type: "任务消耗", amount: "-3,420", actor: "系统", note: "视频生成 x 12" },
  { id: "cr_762", user: "陈一鸣", type: "人工补偿", amount: "+500", actor: "Admin Eric", note: "支付延迟补偿" },
  { id: "cr_758", user: "北辰增长", type: "冻结额度", amount: "-80,000", actor: "风控规则", note: "异常调用峰值" },
];

const integrations: Integration[] = [
  { name: "Stripe", category: "国际卡支付", state: "在线", latency: "286ms", owner: "Finance" },
  { name: "支付宝", category: "国内支付", state: "在线", latency: "194ms", owner: "Finance" },
  { name: "Render API", category: "后端部署", state: "观察", latency: "812ms", owner: "Infra" },
  { name: "Model Gateway", category: "模型供应商", state: "在线", latency: "438ms", owner: "AI Ops" },
];

const auditRows: AuditRow[] = [
  { actor: "Admin Eric", action: "给陈一鸣补偿 500 积分", target: "usr_1189", time: "今天 12:06" },
  { actor: "Stripe Webhook", action: "订单支付成功并入账", target: "ord_90341", time: "今天 11:24" },
  { actor: "Risk Rule #07", action: "冻结北辰增长部分额度", target: "usr_1220", time: "昨天 16:51" },
  { actor: "客服 Ava", action: "将反馈标记为处理中", target: "fb_231", time: "昨天 22:20" },
];

function statusLabel(status: Status | OrderStatus | FeedbackStatus) {
  const map: Record<string, string> = {
    normal: "正常",
    watch: "观察",
    blocked: "冻结",
    paid: "已支付",
    pending: "待确认",
    failed: "失败",
    refunded: "已退款",
    new: "新反馈",
    processing: "处理中",
    waiting_user: "等待用户",
    resolved: "已解决",
    closed: "已关闭",
  };

  return map[status] ?? status;
}

function statusClass(status: Status | OrderStatus | FeedbackStatus | string) {
  if (["normal", "paid", "resolved", "closed", "在线", "启用", "success", "mitigated"].includes(status)) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }

  if (["watch", "pending", "processing", "waiting_user", "观察", "草稿", "reviewing"].includes(status)) {
    return "border-amber-400/35 bg-amber-400/10 text-amber-100";
  }

  if (["blocked", "failed", "P0", "异常", "未配置", "open", "timeout"].includes(status)) {
    return "border-rose-400/35 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-white/7 text-white/70";
}

function formatCurrency(value: number) {
  return `¥${value.toLocaleString("zh-CN")}`;
}

function formatCredits(value: number) {
  return value.toLocaleString("zh-CN");
}

function readAdminToken() {
  try {
    const raw = localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

function creditAmount(delta: number) {
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${formatCredits(delta)}`;
}

function normalizeAdminPayload(payload: AdminPayload) {
  const normalizedUsers = (payload.users || users).map((item) => ({
    ...item,
    spent: item.spent ?? item.totalRecharge ?? 0,
  }));
  const normalizedOrders = (payload.orders || orders).map((item) => ({
    ...item,
    credits: item.credits ?? item.issuedCredits ?? item.expectedCredits ?? 0,
  }));
  const normalizedCredits: CreditEvent[] = (payload.credits || []).map((item) => ({
    id: item.id,
    user: item.user,
    type: item.type,
    amount: creditAmount(item.delta),
    actor: item.operator,
    note: item.source || item.reason,
  }));
  const normalizedProviders = (payload.providers || integrations).map((item) => ({
    ...item,
    latency: item.latency || `${"latencyMs" in item ? item.latencyMs ?? 0 : 0}ms`,
  }));
  const normalizedAuditRows: AuditRow[] = (payload.auditLogs || []).map((item) => ({
    actor: item.actorName || "System",
    action: item.action,
    target: item.target,
    time: item.createdAt,
    reason: item.reason,
  }));

  return {
    overview: payload.overview ? { ...payload.overview, capabilityStatus: payload.capabilityStatus || payload.overview.capabilityStatus || [] } : payload.overview,
    users: normalizedUsers,
    orders: normalizedOrders,
    credits: normalizedCredits.length ? normalizedCredits : creditEvents,
    aiTasks: payload.aiTasks || [],
    providers: normalizedProviders,
    feedback: payload.feedback || feedbackSeed,
    alerts: payload.alerts || alertSeed,
    riskEvents: payload.riskEvents || [],
    auditRows: normalizedAuditRows.length ? normalizedAuditRows : auditRows,
    plans: payload.plans || [],
  };
}

type AdminState = ReturnType<typeof normalizeAdminPayload>;

function AdminPrototypePage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [adminData, setAdminData] = useState<AdminState>(() => normalizeAdminPayload({}));
  const [selectedUserId, setSelectedUserId] = useState(users[0].id);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [creditDelta, setCreditDelta] = useState(500);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("正在连接后台数据接口：/api/admin/overview。");
  const [policyDraft, setPolicyDraft] = useState<Array<{ capability: string; capabilityKey?: string; unit: string; baseCredits: number; estimatedCostPerUnit: number; provider: string }>>([]);
  const [discountDraft, setDiscountDraft] = useState<Array<{ planId: string; multiplier: number; label: string }>>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [orderNote, setOrderNote] = useState("");

  const fetchAdminData = useCallback(async (message?: string) => {
    const token = readAdminToken();
    if (!token) {
      setLoading(false);
      setNotice("未找到后台登录令牌，请先用具备 admin:access 的账号登录。");
      return;
    }

    try {
      const response = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "后台接口请求失败");
      }
      const nextData = normalizeAdminPayload(payload);
      setAdminData(nextData);
      setPolicyDraft(nextData.overview?.aiBillingPolicies || []);
      setDiscountDraft(nextData.overview?.planDiscounts || []);
      setSelectedUserId((current) => nextData.users.some((item) => item.id === current) ? current : nextData.users[0]?.id || "");
      setSelectedOrderId((current) => nextData.orders.some((item) => item.id === current) ? current : nextData.orders[0]?.id || "");
      setNotice(message || "后台数据已接入：支付、积分、AI 任务、供应商健康、反馈、告警和审计均来自 /api/admin/*。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "后台数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    const token = readAdminToken();
    if (!token || !orderId) return;
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "订单详情加载失败");
      setOrderDetail(payload as OrderDetail);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "订单详情加载失败");
    }
  }, []);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetail(selectedOrderId);
    }
  }, [fetchOrderDetail, selectedOrderId]);

  async function adminPost(path: string, payload: Record<string, unknown>, successMessage: string) {
    const token = readAdminToken();
    if (!token) {
      setNotice("未找到后台登录令牌，请重新登录后再操作。");
      return;
    }
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "后台写操作失败");
      setAdminData(normalizeAdminPayload(result));
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "后台写操作失败");
    }
  }

  async function adminPostOrder(path: string, payload: Record<string, unknown>, successMessage: string) {
    const token = readAdminToken();
    if (!token) {
      setNotice("未找到后台登录令牌，请重新登录后再操作。");
      return;
    }
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "订单操作失败");
      setOrderDetail(result as OrderDetail);
      await fetchAdminData(successMessage);
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "订单操作失败");
    }
  }

  const selectedUser = adminData.users.find((item) => item.id === selectedUserId) ?? adminData.users[0] ?? users[0];
  const selectedOrder = adminData.orders.find((item) => item.id === selectedOrderId) ?? adminData.orders[0];
  const metrics = adminData.overview?.metrics;
  const paidRevenue = metrics?.todayRevenue ?? adminData.orders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + order.amount, 0);
  const issuedCredits = metrics?.issuedCredits ?? adminData.orders.reduce((sum, order) => sum + order.credits, 0);
  const remainingCredits = metrics?.remainingCredits ?? adminData.users.reduce((sum, item) => sum + item.credits, 0);
  const unreadAlerts = adminData.alerts.filter((alert) => alert.unread).length;
  const urgentAlerts = adminData.alerts.filter((alert) => alert.severity === "critical").length;

  const filteredUsers = useMemo(() => {
    return adminData.users.filter((user) => {
      const matchesQuery = `${user.name} ${user.email} ${user.plan}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [adminData.users, query, statusFilter]);

  function handleResolveFeedback(id: string) {
    adminPost(`/api/admin/feedback/${id}/status`, { status: "resolved", reason: "后台标记解决" }, "反馈状态已写入后台，并生成操作审计。");
  }

  function handleUserRole(id: string, role: "support" | "finance" | "admin") {
    adminPost(`/api/admin/users/${id}/role`, { role }, `用户角色已更新为 ${role}。`);
  }

  function handleUserStatus(id: string, status: "normal" | "blocked") {
    adminPost(`/api/admin/users/${id}/status`, { status }, status === "blocked" ? "用户已停用并强制退出。" : "用户已恢复。");
  }

  function handleCreditAdjustment(direction: "plus" | "minus") {
    const delta = Math.abs(creditDelta) * (direction === "plus" ? 1 : -1);
    adminPost("/api/admin/credits/adjust", {
      userId: selectedUser.id,
      delta,
      reason: "后台人工额度调整",
      confirmHighRisk: Math.abs(delta) >= 10000,
    }, `${selectedUser.name} 的额度调整已提交：${creditAmount(delta)} 积分，审计日志已生成。`);
  }

  function handleMarkAlertRead(id: string) {
    adminPost(`/api/admin/alerts/${id}/read`, {}, "消息已标记处理，并保留在通知中心供追踪。");
  }

  function handleMarkAllAlertsRead() {
    adminPost("/api/admin/alerts/read-all", {}, "所有敏捷处理消息已标记为已读，操作已进入审计日志。");
  }

  function handlePolicyDraftChange(index: number, key: "baseCredits" | "estimatedCostPerUnit", value: string) {
    setPolicyDraft((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      [key]: Number(value) || 0,
    } : item));
  }

  function handleDiscountDraftChange(index: number, value: string) {
    setDiscountDraft((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      multiplier: Number(value) || 1,
    } : item));
  }

  function handleSaveAiPolicies() {
    adminPost("/api/admin/ai-billing-policies/save", {
      policies: policyDraft.map((item) => ({
        capability: item.capabilityKey || item.capability,
        label: item.capability,
        billingUnit: item.unit === "按张" ? "per_image" : "per_request",
        baseCredits: item.baseCredits,
        estimatedCostPerUnit: item.estimatedCostPerUnit,
        providerDefault: item.provider,
      })),
      planDiscounts: discountDraft,
      confirmation: "CONFIRM_AI_BILLING_POLICY",
    }, "AI 扣分策略和套餐折扣已保存。");
  }

  function handleSelectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setOrderNote("");
  }

  function handleAddOrderNote() {
    if (!selectedOrderId) return;
    adminPostOrder(`/api/admin/orders/${encodeURIComponent(selectedOrderId)}/notes`, {
      content: orderNote,
    }, "订单处理备注已保存，并写入审计日志。");
    setOrderNote("");
  }

  function handleReissueOrder() {
    if (!selectedOrderId) return;
    adminPostOrder(`/api/admin/orders/${encodeURIComponent(selectedOrderId)}/reissue`, {
      reason: "后台人工补单",
      confirmation: "CONFIRM_REISSUE_ORDER",
    }, "订单已人工补单，积分入账和支付事件已记录。");
  }

  function handleRefundOrder() {
    if (!selectedOrderId) return;
    adminPostOrder(`/api/admin/orders/${encodeURIComponent(selectedOrderId)}/refund`, {
      reason: "后台人工退款",
      confirmation: "CONFIRM_REFUND_ORDER",
    }, "订单已标记退款，已按可用余额扣回积分并记录审计。");
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-[#0f172a] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-cyan-300 text-slate-950">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-wide">ArtX Admin</div>
                  <div className="text-xs text-slate-400">Compute credit ops</div>
                </div>
              </div>
            </div>

            <nav className="grid gap-1 p-3">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;

                return (
                  <button
                    key={section.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-left transition",
                      isActive
                        ? "bg-cyan-300 text-slate-950"
                        : "text-slate-300 hover:bg-white/7 hover:text-white"
                    )}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <Icon className="size-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{section.label}</span>
                      <span
                        className={cn(
                          "block truncate text-xs",
                          isActive ? "text-slate-800" : "text-slate-500"
                        )}
                      >
                        {section.description}
                      </span>
                    </span>
                    <ChevronRight className="size-4 opacity-60" />
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-white/10 p-4">
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/8 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-100">
                  <Bell className="size-4" />
                  今日运营提醒
                </div>
                <p className="text-xs leading-5 text-slate-400">
                  1 笔支付回调延迟、1 个高风险账户、2 条待处理反馈需要跟进。
                </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1020]/90 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                  付费算力与积分运营后台
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  管理用户、支付、积分额度、反馈、第三方接口和高风险操作。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <NotificationCenter
                  alerts={adminData.alerts}
                  open={alertsOpen}
                  unreadCount={unreadAlerts}
                  urgentCount={urgentAlerts}
                  onToggle={() => setAlertsOpen((value) => !value)}
                  onMarkRead={handleMarkAlertRead}
                  onMarkAllRead={handleMarkAllAlertsRead}
                  onJumpTo={(section) => {
                    setActiveSection(section);
                    setAlertsOpen(false);
                  }}
                />
                <Button
                  variant="outline"
                  className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => fetchAdminData("已刷新第三方支付、模型供应商和告警状态。")}
                >
                  <Activity className="size-4" />
                  刷新接口状态
                </Button>
                <Button
                  className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  onClick={() => setActiveSection("audit")}
                >
                  <Plus className="size-4" />
                  新建套餐
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-4 md:p-6">
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-50">
              {loading ? "正在加载后台运营数据..." : notice}
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-emerald-300/20 bg-emerald-300/[0.055] px-4 py-3 text-sm text-emerald-50 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="font-medium">后台权限已启用</span>
                <span className="ml-2 text-emerald-100/75">
                  当前账号：{user?.username || "admin"} · 角色：{user?.role || "admin"}
                </span>
              </div>
              <span className="text-xs text-emerald-100/70">
                权限：{(user?.permissions || ["admin:access"]).slice(0, 4).join(" / ")}
              </span>
            </div>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={CircleDollarSign}
                label="已确认收入"
                value={formatCurrency(paidRevenue)}
                detail="仅统计已支付订单"
              />
              <MetricCard
                icon={Gauge}
                label="已发放积分"
                value={formatCredits(issuedCredits)}
                detail="购买入账 + 赠送额度"
              />
              <MetricCard
                icon={WalletCards}
                label="用户剩余额度"
                value={formatCredits(remainingCredits)}
                detail="需要纳入财务负债视角"
              />
              <MetricCard
                icon={AlertTriangle}
                label="待处理风险"
                value={formatCredits((metrics?.paymentExceptions ?? 0) + (metrics?.highRiskEvents ?? 0))}
                detail="支付异常 + 高风险事件"
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035]">
                <SectionTabs activeSection={activeSection} setActiveSection={setActiveSection} />
                <div className="p-4 md:p-5">{renderSection()}</div>
              </div>

              <aside className="space-y-5">
                <UserDetailPanel
                  user={selectedUser}
                  creditDelta={creditDelta}
                  setCreditDelta={setCreditDelta}
                  onAdjust={handleCreditAdjustment}
                />
                <RiskPanel riskEvents={adminData.riskEvents} plans={adminData.plans} />
              </aside>
            </section>
          </div>
        </main>
      </div>
    </div>
  );

  function renderSection() {
    if (activeSection === "overview") {
      return (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">今日运营队列</h2>
                <p className="text-sm text-slate-400">先处理影响收入和额度可信度的问题。</p>
              </div>
              <Badge tone="amber">{adminData.overview?.operationsQueue.length || adminData.alerts.length} 项待办</Badge>
            </div>
            <div className="space-y-3">
              {(adminData.overview?.operationsQueue || []).map(({ title, body, priority, section }) => (
                <div
                  key={title}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-white/8 bg-white/[0.03] p-3 transition hover:bg-white/[0.055]"
                  onClick={() => section && setActiveSection(section)}
                >
                  <div className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-white/7">
                    <AlertTriangle className="size-4 text-amber-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{title}</div>
                      <Badge tone={priority === "P0" ? "rose" : "amber"}>{priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-base font-semibold">后台模块成熟度</h2>
            <p className="mt-1 text-sm text-slate-400">用于判断 MVP 后台先做什么。</p>
            <div className="mt-5 space-y-4">
              {(adminData.overview?.maturity || []).map(({ label, value }) => (
                <div key={label}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="text-slate-400">{value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/8">
                    <div
                      className="h-2 rounded-full bg-cyan-300"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">能力接入状态</h2>
            <p className="mt-1 text-sm text-slate-400">这里会自动省略已完成项之外的重工判断，帮你看还差哪些真实接口。</p>
            <div className="mt-4 grid gap-3">
              {(adminData.overview?.capabilityStatus || []).map((item) => (
                <div key={item.id} className="rounded-md border border-white/8 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">{item.domain}</div>
                    <Badge className={statusClass(item.status === "ready" ? "normal" : item.status === "partial" ? "watch" : "blocked")}>
                      {item.status === "ready" ? "已接好" : item.status === "partial" ? "部分接好" : "未接"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{item.summary}</p>
                  <div className="mt-2 text-xs text-slate-500">{item.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "users") {
      return (
        <div className="space-y-4">
          <Toolbar
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
          <Table className="min-w-[780px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>用户</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>积分余额</TableHead>
                <TableHead>累计付费</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近活跃</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow
                  key={user.id}
                  className={cn(
                    "border-white/8 hover:bg-white/[0.04]",
                    selectedUserId === user.id && "bg-cyan-300/8"
                  )}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </TableCell>
                  <TableCell>{user.plan}</TableCell>
                  <TableCell>{formatCredits(user.credits)}</TableCell>
                  <TableCell>{formatCurrency(user.spent)}</TableCell>
                  <TableCell>
                    <Badge className={statusClass(user.status)}>{statusLabel(user.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-400">
                    <div>{user.lastSeen}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUserRole(user.id, "support");
                        }}
                      >
                        设为客服
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUserRole(user.id, "finance");
                        }}
                      >
                        设为财务
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUserStatus(user.id, user.status === "blocked" ? "normal" : "blocked");
                        }}
                      >
                        {user.status === "blocked" ? "恢复账号" : "停用账号"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeSection === "orders") {
      return (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-md border border-white/10 bg-white/[0.03]">
            <OrdersTable orders={adminData.orders} selectedOrderId={selectedOrder?.id || ""} onSelect={handleSelectOrder} />
          </div>
          <OrderDetailPanel
            detail={orderDetail}
            fallbackOrder={selectedOrder}
            note={orderNote}
            onNoteChange={setOrderNote}
            onAddNote={handleAddOrderNote}
            onReissue={handleReissueOrder}
            onRefund={handleRefundOrder}
          />
        </div>
      );
    }

    if (activeSection === "credits") {
      return (
        <DataList
          title="积分与额度流水"
          description="每一笔入账、消耗、冻结、人工调整都必须可追溯。"
          rows={adminData.credits.map((event) => ({
            title: `${event.user} · ${event.type}`,
            meta: `${event.actor} · ${event.note}`,
            value: event.amount,
            icon: event.amount.startsWith("+") ? Gift : LockKeyhole,
          }))}
        />
      );
    }

    if (activeSection === "feedback") {
      return (
        <div className="space-y-3">
          {adminData.feedback.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-white/10 bg-slate-950/35 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusClass(item.priority)}>{item.priority}</Badge>
                    <Badge className={statusClass(item.status)}>{statusLabel(item.status)}</Badge>
                    <span className="text-xs text-slate-500">{item.module}</span>
                  </div>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.user} · {item.createdAt}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => handleResolveFeedback(item.id)}
                >
                  <Check className="size-4" />
                  标记解决
                </Button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeSection === "integrations") {
      return (
        <div className="space-y-5">
          <DataList
            title="第三方接口健康度"
            description="支付、模型、部署和网关都要有状态、延迟、负责人。"
            rows={adminData.providers.map((item) => ({
              title: `${item.name} · ${item.category}`,
              meta: `${item.owner} · ${item.latency} · ${item.configLocation || "server env"}`,
              value: item.state,
              icon: item.state === "在线" ? BadgeCheck : AlertTriangle,
            }))}
          />
          <DataList
            title="AI 任务追踪"
            description="保留 generationId / backendTaskId / providerTaskId，便于排查用户投诉和供应商日志。"
            rows={adminData.aiTasks.map((task) => ({
              title: `${task.capability} · ${task.model}`,
              meta: `${task.user} · ${task.generationId} / ${task.backendTaskId} / ${task.providerTaskId} · 预估成本 ${formatCurrency(task.estimatedCost)}`,
              value: task.status === "success" ? `${task.chargedCredits} 积分 · 毛利 ${(task.grossMargin * 100).toFixed(0)}%` : task.failureReason || task.status,
              icon: task.status === "success" ? BadgeCheck : AlertTriangle,
            }))}
          />
          <DataList
            title="AI 扣分策略配置"
            description="所有 AI 能力按统一策略表结算，并叠加套餐档位折扣。"
            rows={[]}
          />
          <div className="rounded-md border border-white/10 bg-slate-950/35 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">AI 扣分策略配置区</h3>
                <p className="mt-1 text-xs text-slate-400">修改后会直接影响服务端真实扣分与后台毛利统计。</p>
              </div>
              <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={handleSaveAiPolicies}>
                保存策略
              </Button>
            </div>
            <div className="space-y-3">
              {policyDraft.map((policy, index) => (
                <div key={policy.capability} className="grid gap-3 rounded-md border border-white/8 bg-white/[0.03] p-3 md:grid-cols-[1.4fr_120px_120px_1fr]">
                  <div>
                    <div className="text-sm font-medium">{policy.capability}</div>
                    <div className="text-xs text-slate-500">{policy.unit} · {policy.provider}</div>
                  </div>
                  <Input
                    value={String(policy.baseCredits)}
                    onChange={(event) => handlePolicyDraftChange(index, "baseCredits", event.target.value)}
                    className="border-white/12 bg-white/5"
                  />
                  <Input
                    value={String(policy.estimatedCostPerUnit)}
                    onChange={(event) => handlePolicyDraftChange(index, "estimatedCostPerUnit", event.target.value)}
                    className="border-white/12 bg-white/5"
                  />
                  <div className="text-xs text-slate-400 flex items-center">
                    当前供应商：{policy.provider}
                  </div>
                </div>
              ))}
              <div className="grid gap-3 md:grid-cols-2">
                {discountDraft.map((discount, index) => (
                  <div key={discount.planId} className="rounded-md border border-white/8 bg-white/[0.03] p-3">
                    <div className="text-sm font-medium">{discount.planId} 套餐折扣</div>
                    <div className="mt-1 text-xs text-slate-500">{discount.label}</div>
                    <Input
                      value={String(discount.multiplier)}
                      onChange={(event) => handleDiscountDraftChange(index, event.target.value)}
                      className="mt-3 border-white/12 bg-white/5"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DataList
            title="预估成本与毛利报表"
            description="用来快速判断 AI 供应商成本、积分消耗和毛利健康度。"
            rows={[
              {
                title: "总预估成本",
                meta: "仅统计已成功任务",
                value: formatCurrency(adminData.overview?.aiCostSummary?.totalEstimatedCost || 0),
                icon: CircleDollarSign,
              },
              {
                title: "总积分消耗",
                meta: "折扣后真实扣减",
                value: `${formatCredits(adminData.overview?.aiCostSummary?.totalChargedCredits || 0)} 积分`,
                icon: WalletCards,
              },
              {
                title: "成功 / 失败任务",
                meta: "用于观察稳定性",
                value: `${adminData.overview?.aiCostSummary?.successCount || 0} / ${adminData.overview?.aiCostSummary?.failedCount || 0}`,
                icon: Activity,
              },
              {
                title: "平均毛利",
                meta: "按成功任务平均",
                value: `${Math.round((adminData.overview?.aiCostSummary?.avgGrossMargin || 0) * 100)}%`,
                icon: Gauge,
              },
            ]}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <DataList
              title="按供应商毛利明细"
              description="看哪家供应商最耗钱、最影响毛利。"
              rows={(adminData.overview?.aiCostBreakdownByProvider || []).map((item) => ({
                title: item.label,
                meta: `成功 ${item.successCount} / 失败 ${item.failedCount} · 成本 ${formatCurrency(item.estimatedCost)}`,
                value: `${formatCredits(item.chargedCredits)} 积分 · ${Math.round(item.avgGrossMargin * 100)}%`,
                icon: Gauge,
              }))}
            />
            <DataList
              title="按模型毛利明细"
              description="看不同模型的积分回收与成本表现。"
              rows={(adminData.overview?.aiCostBreakdownByModel || []).map((item) => ({
                title: item.label,
                meta: `成功 ${item.successCount} / 失败 ${item.failedCount} · 成本 ${formatCurrency(item.estimatedCost)}`,
                value: `${formatCredits(item.chargedCredits)} 积分 · ${Math.round(item.avgGrossMargin * 100)}%`,
                icon: Activity,
              }))}
            />
          </div>
        </div>
      );
    }

    if (activeSection === "risk") {
      return (
        <DataList
          title="风控规则"
          description="先覆盖资金和额度异常，再扩展到设备、IP、频率限制。"
          rows={[
            ...adminData.riskEvents.map((event) => ({
              title: event.title,
              meta: `${event.detail} · ${event.target}`,
              value: event.status,
              icon: event.severity === "high" ? AlertTriangle : ShieldCheck,
            })),
            { title: "支付失败重试", meta: "同卡 5 次失败后进入观察", value: "启用", icon: CreditCard },
            { title: "人工大额赠送", meta: "超过 10,000 积分需要二次确认", value: "启用", icon: ShieldCheck },
          ]}
        />
      );
    }

    return (
      <div className="space-y-5">
        <DataList
          title="管理员操作审计"
          description="钱和额度相关操作必须记录人、时间、目标和原因。"
          rows={adminData.auditRows.map((row) => ({
            title: row.action,
            meta: `${row.actor} · ${row.target}${row.reason ? ` · ${row.reason}` : ""}`,
            value: row.time,
            icon: History,
          }))}
        />
        <DataList
          title="套餐/价格配置"
          description="第一版以国内支付优先，微信支付和支付宝先接入，Stripe/PayPal 后续扩展。"
          rows={adminData.plans.map((plan) => ({
            title: `${plan.name} · ${formatCurrency(plan.price)}`,
            meta: `${formatCredits(plan.credits)} 积分 · ${plan.channel}`,
            value: plan.status === "active" ? "启用" : "草稿",
            icon: CircleDollarSign,
          }))}
        />
      </div>
    );
  }
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-md bg-white/7">
          <Icon className="size-4 text-cyan-200" />
        </div>
        <span className="text-xs text-emerald-200">实时</span>
      </div>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function NotificationCenter({
  alerts,
  open,
  unreadCount,
  urgentCount,
  onToggle,
  onMarkRead,
  onMarkAllRead,
  onJumpTo,
}: {
  alerts: OpsAlert[];
  open: boolean;
  unreadCount: number;
  urgentCount: number;
  onToggle: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onJumpTo: (section: AdminSection) => void;
}) {
  return (
    <div className="relative">
      <button
        className={cn(
          "relative inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition",
          open
            ? "border-cyan-300 bg-cyan-300 text-slate-950"
            : "border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
        )}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`消息提醒，${unreadCount} 条未读`}
      >
        <Bell className="size-4" />
        消息
        {unreadCount > 0 && (
          <span
            className={cn(
              "ml-1 rounded-md px-1.5 py-0.5 text-xs",
              open ? "bg-slate-950 text-cyan-200" : "bg-rose-400 text-white"
            )}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-[calc(100vw-32px)] max-w-[430px] overflow-hidden rounded-md border border-white/10 bg-[#0f172a] shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">敏捷处理消息</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  聚合支付异常、系统报错、接口延迟和额度风险。
                </p>
              </div>
              <Badge className={urgentCount > 0 ? statusClass("P0") : statusClass("normal")}>
                {urgentCount} 个紧急
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{unreadCount} 条未读</span>
              <button
                className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
                onClick={onMarkAllRead}
              >
                全部已读
              </button>
            </div>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "border-b border-white/8 p-4 last:border-b-0",
                  alert.unread ? "bg-cyan-300/[0.045]" : "bg-transparent"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                      alert.severity === "critical"
                        ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                        : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    )}
                  >
                    {alert.category === "支付" ? (
                      <CreditCard className="size-4" />
                    ) : alert.category === "报错" ? (
                      <AlertTriangle className="size-4" />
                    ) : alert.category === "接口" ? (
                      <Activity className="size-4" />
                    ) : (
                      <WalletCards className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          alert.severity === "critical"
                            ? statusClass("P0")
                            : statusClass("watch")
                        }
                      >
                        {alert.category}
                      </Badge>
                      <span className="text-xs text-slate-500">{alert.time}</span>
                      {alert.unread && <span className="size-2 rounded-full bg-cyan-300" />}
                    </div>
                    <div className="mt-2 text-sm font-medium">{alert.title}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{alert.detail}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">负责人：{alert.owner}</span>
                      <button
                        className="ml-auto rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/8"
                        onClick={() => onJumpTo(alertSection(alert.category))}
                      >
                        查看模块
                      </button>
                      <button
                        className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-950 hover:bg-cyan-100"
                        onClick={() => onMarkRead(alert.id)}
                      >
                        标记处理
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function alertSection(category: AlertCategory): AdminSection {
  const map: Record<AlertCategory, AdminSection> = {
    支付: "orders",
    报错: "integrations",
    接口: "integrations",
    额度: "risk",
    风控: "risk",
  };

  return map[category];
}

function SectionTabs({
  activeSection,
  setActiveSection,
}: {
  activeSection: AdminSection;
  setActiveSection: (section: AdminSection) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
      {sections.slice(0, 6).map((section) => (
        <button
          key={section.id}
          className={cn(
            "shrink-0 rounded-md px-3 py-2 text-sm transition",
            activeSection === section.id
              ? "bg-white text-slate-950"
              : "text-slate-400 hover:bg-white/7 hover:text-white"
          )}
          onClick={() => setActiveSection(section.id)}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}

function Toolbar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
}: {
  query: string;
  setQuery: (query: string) => void;
  statusFilter: "all" | Status;
  setStatusFilter: (status: "all" | Status) => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative md:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索用户、邮箱、套餐"
          className="border-white/10 bg-slate-950/40 pl-9 text-slate-100 placeholder:text-slate-500"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "全部"],
          ["normal", "正常"],
          ["watch", "观察"],
          ["blocked", "冻结"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={cn(
              "rounded-md border px-3 py-2 text-sm transition",
              statusFilter === value
                ? "border-cyan-300 bg-cyan-300 text-slate-950"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/8"
            )}
            onClick={() => setStatusFilter(value as "all" | Status)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrdersTable({
  orders,
  selectedOrderId,
  onSelect,
}: {
  orders: Order[];
  selectedOrderId: string;
  onSelect: (orderId: string) => void;
}) {
  return (
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead>订单</TableHead>
          <TableHead>用户</TableHead>
          <TableHead>渠道</TableHead>
          <TableHead>金额</TableHead>
          <TableHead>兑换积分</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>对账</TableHead>
          <TableHead>时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow
            key={order.id}
            className={cn("cursor-pointer border-white/8 hover:bg-white/[0.04]", selectedOrderId === order.id && "bg-cyan-300/10")}
            onClick={() => onSelect(order.id)}
          >
            <TableCell className="font-mono text-xs text-slate-400">{order.id}</TableCell>
            <TableCell>{order.user}</TableCell>
            <TableCell>{order.channel}</TableCell>
            <TableCell>{formatCurrency(order.amount)}</TableCell>
            <TableCell>{formatCredits(order.credits)}</TableCell>
            <TableCell>
              <Badge className={statusClass(order.status)}>{statusLabel(order.status)}</Badge>
            </TableCell>
            <TableCell>
              <Badge className={statusClass(order.reconciliation || "matched")}>
                {order.reconciliation === "mismatch" ? "异常" : order.reconciliation === "pending" ? "待对账" : "一致"}
              </Badge>
            </TableCell>
            <TableCell className="text-slate-400">{order.createdAt}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrderDetailPanel({
  detail,
  fallbackOrder,
  note,
  onNoteChange,
  onAddNote,
  onReissue,
  onRefund,
}: {
  detail: OrderDetail | null;
  fallbackOrder?: Order;
  note: string;
  onNoteChange: (value: string) => void;
  onAddNote: () => void;
  onReissue: () => void;
  onRefund: () => void;
}) {
  const order = detail?.order || fallbackOrder;
  if (!order) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
        选择一笔订单查看对账详情。
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-slate-500">{order.id}</div>
          <h3 className="mt-1 text-base font-semibold">{order.user} · {order.packageName || "订单详情"}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge className={statusClass(order.status)}>{statusLabel(order.status)}</Badge>
            <Badge className={statusClass(order.reconciliation || "matched")}>
              {order.reconciliation === "mismatch" ? "对账异常" : order.reconciliation === "pending" ? "待对账" : "对账一致"}
            </Badge>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">{formatCurrency(order.amount)}</div>
          <div className="text-xs text-slate-400">{formatCredits(order.expectedCredits || order.credits)} 应发积分</div>
        </div>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <InfoLine label="支付渠道" value={order.channel} />
        <InfoLine label="第三方交易号" value={order.providerTransactionId || "待回调/待查询"} mono />
        <InfoLine label="实发积分" value={formatCredits(order.issuedCredits || 0)} />
        <InfoLine label="退款/扣回" value={`${formatCurrency(order.refundAmount || 0)} / ${formatCredits(order.refundedCredits || 0)} 积分`} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="outline" className="border-white/15 bg-white/5" onClick={onAddNote} disabled={!note.trim()}>
          保存备注
        </Button>
        <Button variant="outline" className="border-amber-300/30 bg-amber-300/10 text-amber-100" onClick={onReissue} disabled={order.status === "paid"}>
          人工补单
        </Button>
        <Button variant="outline" className="border-rose-300/30 bg-rose-300/10 text-rose-100" onClick={onRefund} disabled={order.status !== "paid"}>
          标记退款
        </Button>
      </div>
      <Input
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="记录处理备注，例如：用户提供微信支付截图，待核对交易号"
        className="border-white/12 bg-white/5"
      />

      <MiniSection
        title="支付事件"
        rows={(detail?.paymentEvents || []).map((item) => ({
          title: `${item.type} · ${item.status}`,
          meta: `${item.message} · ${item.createdAt}`,
          value: item.providerTransactionId || "N/A",
        }))}
        empty="暂无第三方支付事件"
      />
      <MiniSection
        title="积分流水"
        rows={(detail?.creditEntries || []).map((item) => ({
          title: `${item.type} · ${item.delta > 0 ? "+" : ""}${item.delta}`,
          meta: `${item.reason} · ${item.createdAt}`,
          value: item.operator,
        }))}
        empty="暂无积分流水"
      />
      <RefundFlowSection refundEvents={detail?.refundEvents || []} />
      <MiniSection
        title="处理备注"
        rows={(detail?.notes || []).map((item) => ({
          title: item.actorName,
          meta: item.content,
          value: item.createdAt,
        }))}
        empty="暂无处理备注"
      />
      <MiniSection
        title="对账时间线"
        rows={(detail?.timeline || []).slice(0, 8).map((item) => ({
          title: item.type,
          meta: item.message,
          value: item.createdAt,
        }))}
        empty="暂无时间线"
      />
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-white/8 bg-slate-950/30 p-3">
      <div className="text-slate-500">{label}</div>
      <div className={cn("mt-1 break-all text-slate-100", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function RefundFlowSection({ refundEvents }: { refundEvents: OrderDetail["refundEvents"] }) {
  const latest = refundEvents[0];
  if (!latest) {
    return (
      <div className="rounded-md border border-white/8 bg-slate-950/25 p-3">
        <div className="mb-2 text-sm font-medium">退款钱款流向</div>
        <div className="text-xs text-slate-500">暂无退款流程</div>
      </div>
    );
  }

  const nodes = latest.flow || [];
  return (
    <div className="rounded-md border border-white/8 bg-slate-950/25 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">退款钱款流向</div>
          <div className="mt-1 text-xs text-slate-500">
            当前进程：{latest.currentStep || "退款处理中"} · {formatCurrency(latest.amount)}
          </div>
        </div>
        <Badge className={statusClass(latest.status === "failed" ? "failed" : latest.status === "succeeded" ? "resolved" : "pending")}>
          {latest.status}
        </Badge>
      </div>
      <div className="space-y-2">
        {nodes.map((node, index) => (
          <div key={node.id} className="grid grid-cols-[22px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                "mt-1 size-3 rounded-full border",
                node.status === "done" && "border-emerald-300 bg-emerald-300",
                node.status === "current" && "border-cyan-300 bg-cyan-300",
                node.status === "pending" && "border-slate-500 bg-transparent",
                node.status === "failed" && "border-rose-300 bg-rose-300",
              )} />
              {index < nodes.length - 1 && <div className="mt-1 h-full min-h-8 w-px bg-white/10" />}
            </div>
            <div className="rounded-md bg-white/[0.03] p-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-slate-200">{node.label}</div>
                <div className="text-slate-500">{node.createdAt || "待处理"}</div>
              </div>
              <div className="mt-1 text-slate-500">{node.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniSection({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ title: string; meta: string; value: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-slate-950/25 p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.title}-${index}`} className="grid gap-2 rounded-md bg-white/[0.03] p-2 text-xs sm:grid-cols-[1fr_auto]">
              <div>
                <div className="font-medium text-slate-200">{row.title}</div>
                <div className="mt-1 text-slate-500">{row.meta}</div>
              </div>
              <div className="font-mono text-slate-400">{row.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-500">{empty}</div>
      )}
    </div>
  );
}

function UserDetailPanel({
  user,
  creditDelta,
  setCreditDelta,
  onAdjust,
}: {
  user: AdminUser;
  creditDelta: number;
  setCreditDelta: (value: number) => void;
  onAdjust: (direction: "plus" | "minus") => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">账户详情</h2>
          <p className="text-sm text-slate-400">点击用户表格可切换对象。</p>
        </div>
        <Badge className={statusClass(user.status)}>{statusLabel(user.status)}</Badge>
      </div>

      <div className="rounded-md border border-white/8 bg-slate-950/35 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-white/8 text-sm font-semibold">
            {user.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <InfoCell label="套餐" value={user.plan} />
          <InfoCell label="风险" value={user.risk} />
          <InfoCell label="积分余额" value={formatCredits(user.credits)} />
          <InfoCell label="累计付费" value={formatCurrency(user.spent)} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="text-sm font-medium">人工额度调整</label>
        <Input
          type="number"
          value={creditDelta}
          onChange={(event) => setCreditDelta(Number(event.target.value))}
          className="border-white/10 bg-slate-950/40 text-slate-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"
            onClick={() => onAdjust("plus")}
          >
            <Plus className="size-4" />
            增加
          </Button>
          <Button
            variant="outline"
            className="border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
            onClick={() => onAdjust("minus")}
          >
            <X className="size-4" />
            扣减
          </Button>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          真实后台必须填写原因，并写入不可删除的审计日志。
        </p>
      </div>
    </div>
  );
}

function RiskPanel({ riskEvents, plans }: { riskEvents: RiskEvent[]; plans: PricingPlan[] }) {
  const highRiskCount = riskEvents.filter((event) => event.severity === "high" && event.status !== "mitigated").length;
  const activePlans = plans.filter((plan) => plan.status === "active").length;

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">上线前必补能力</h2>
        <SlidersHorizontal className="size-4 text-slate-500" />
      </div>
      <div className="space-y-3">
        {[
          ["支付对账", "第三方支付金额、订单、入账积分必须每日核对"],
          ["额度负债", `当前 ${activePlans} 个启用套餐，未消耗积分需要进入成本池`],
          ["密钥治理", "后台只展示状态和位置，不展示密钥值"],
          ["高危权限", `${highRiskCount} 个高风险事件需要二次确认或人工复核`],
        ].map(([title, body]) => (
          <div key={title} className="rounded-md border border-white/8 bg-slate-950/30 p-3">
            <div className="text-sm font-medium">{title}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataList({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{ title: string; meta: string; value: string; icon: typeof BarChart3 }>;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="divide-y divide-white/8 overflow-hidden rounded-md border border-white/10">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={`${row.title}-${row.meta}`}
              className="flex items-center gap-3 bg-slate-950/30 p-4"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-white/7">
                <Icon className="size-4 text-cyan-200" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{row.title}</div>
                <div className="truncate text-xs text-slate-500">{row.meta}</div>
              </div>
              <Badge className={statusClass(row.value)}>{row.value}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function Badge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: "amber" | "rose";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
        tone === "amber" && "border-amber-400/35 bg-amber-400/10 text-amber-100",
        tone === "rose" && "border-rose-400/35 bg-rose-400/10 text-rose-100",
        !tone && "border-white/10 bg-white/7 text-slate-300",
        className
      )}
    >
      {children}
    </span>
  );
}

export default AdminPrototypePage;
