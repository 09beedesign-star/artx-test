import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  Gift,
  History,
  KeyRound,
  LogOut,
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { IMAGE_AI_MODELS, TEXT_AI_MODELS } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import {
  buildAdminNotifications,
  type AdminNotificationGroups,
  type AdminNotificationItem,
  type AdminNotificationTab,
} from "./admin-notifications";
import { getDashboardRiskTarget } from "./admin-dashboard-risk";
import { formatExactOrderTime } from "./admin-order-time";
import { filterAdminOrders, filterAdminUsers } from "./admin-list-filters";
import { classifyHighRiskType } from "./admin-risk";
import { resolveAdminUploadUrl } from "./admin-upload-url";

type AdminSection =
  | "overview"
  | "users"
  | "orders"
  | "credits"
  | "feedback"
  | "integrations"
  | "external_agents"
  | "risk"
  | "audit";

type Status = "normal" | "watch" | "blocked" | "cancelled";
type AdminRole = "viewer" | "support" | "finance" | "admin" | "super_admin";
type OrderStatus = "paid" | "pending" | "failed" | "refunded";
type FeedbackStatus = "new" | "processing" | "waiting_user" | "resolved" | "closed";
type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "支付" | "报错" | "接口" | "积分" | "风控";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: AdminRole;
  plan: string;
  credits: number;
  spent: number;
  totalRecharge?: number;
  frozenCredits?: number;
  organization?: string;
  status: Status;
  registeredAt?: string;
  lastSeen: string;
  risk: string;
  accountType?: "regular" | "test";
  testProfile?: {
    issuedAt: string;
    expiresAt: string;
    initialCredits: number;
    dailyCreditLimit: number;
    usageDate: string;
    reservedCredits: number;
    cancelledAt?: string;
  };
  allowedAiModels?: string[];
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
  notificationReadAt?: string;
  notificationDismissedAt?: string;
};

type AccountDetail = {
  user: AdminUser;
  orders: Order[];
  aiTasks: AiTask[];
  creditEntries: Array<{ id: string; user: string; type: string; delta: number; operator: string; source: string; reason: string; createdAt: string }>;
  auditEntries: Array<{ id: string; actorName: string; action: string; target: string; createdAt: string; reason?: string }>;
  feedbackEntries: Feedback[];
  notes: Array<{ id: string; actorName: string; content: string; createdAt: string; orderId: string; orderLabel?: string }>;
  paymentEvents: Array<{ id: string; orderId: string; orderLabel?: string; type: string; status: string; providerTransactionId?: string; amount?: number; signatureValid?: boolean; message: string; createdAt: string }>;
  refundEvents: Array<{ id: string; orderId: string; orderLabel?: string; amount: number; creditsDeducted: number; reason: string; actorName: string; createdAt: string }>;
  timeline: Array<{ id: string; type: string; status: string; message: string; createdAt: string; orderId?: string; orderLabel?: string }>;
};

type Feedback = {
  id: string;
  user: string;
  title: string;
  content?: string;
  module: string;
  status: FeedbackStatus;
  priority: "P0" | "P1" | "P2";
  createdAt: string;
  linkedOrderId?: string;
  attachments?: Array<{ name: string; src: string; width?: number; height?: number; mimeType?: string; size?: number }>;
  notificationReadAt?: string;
  notificationDismissedAt?: string;
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
  notificationDismissedAt?: string;
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
  usage?: { usageKind: "tokens" | "images" | "credits"; promptTokens?: number; completionTokens?: number; imageCount?: number };
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
  notificationReadAt?: string;
  notificationDismissedAt?: string;
  handledBy?: string;
  handledAt?: string;
  resolution?: string;
};

type PricingPlan = {
  id: string;
  name: string;
  price: number;
  credits: number;
  channel: string;
  status: string;
};

type ProductionCheck = {
  id: string;
  title: string;
  status: "ready" | "watch" | "partial" | "blocked";
  summary: string;
  metrics: Record<string, number>;
  metricLabels?: Record<string, string>;
  evidence: string[];
  actionTarget: AdminSection;
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
  productionReadiness?: Array<{ id: string; domain: string; status: "ready" | "partial" | "missing"; summary: string; requiredKeys: string[]; configuredKeys: string[]; missingKeys: string[]; action: string }>;
  productionChecks?: ProductionCheck[];
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
  aiCostBreakdownByCapability?: Array<{
    key: string; label: string; estimatedCost: number; chargedCredits: number;
    successCount: number; failedCount: number; avgGrossMargin: number;
  }>;
};

type AdminPayload = {
  overview?: OverviewData;
  users?: Array<AdminUser & { role?: AdminRole; totalRecharge?: number; frozenCredits?: number; organization?: string }>;
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
  productionChecks?: ProductionCheck[];
};

type CapabilityMarginAggregate = {
  key: string;
  label: string;
  taskCount: number;
  successCount: number;
  failedCount: number;
  chargedCredits: number;
  estimatedCost: number;
  grossProfitCredits: number;
  avgGrossMargin: number;
};

type CapabilityMarginData = {
  tasks: Array<{
    id: string;
    user: string;
    userAccount: string;
    capability: string;
    model: string;
    status: string;
    chargedCredits: number;
    estimatedCost: number;
    grossMargin: number;
    createdAt: string;
  }>;
  kpis: Omit<CapabilityMarginAggregate, "key" | "label">;
  capabilities: CapabilityMarginAggregate[];
  models: CapabilityMarginAggregate[];
};

type CapabilityMarginFilters = {
  time: "1d" | "3d" | "7d" | "15d" | "30d" | "90d" | "180d";
  grossMarginBand: "" | "negative" | "0-30" | "30-60" | ">=60";
  minGrossMargin: string;
  maxGrossMargin: string;
  model: string;
  account: string;
  minChargedCredits: string;
  maxChargedCredits: string;
};

const sections: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: typeof BarChart3;
}> = [
  { id: "overview", label: "总览", description: "金额、积分、风险", icon: BarChart3 },
  { id: "users", label: "账户管理", description: "用户、状态、权限", icon: Users },
  { id: "orders", label: "支付订单", description: "支付、退款、对账", icon: CreditCard },
  { id: "credits", label: "积分管理", description: "积分、流水、调整", icon: WalletCards },
  { id: "feedback", label: "用户反馈", description: "意见、工单、回复", icon: MessageSquareText },
  { id: "integrations", label: "第三方接口", description: "支付、模型、密钥", icon: KeyRound },
  { id: "external_agents", label: "第三方调用", description: "Agent、Key、成本", icon: Activity },
  { id: "risk", label: "风控安全", description: "异常、限流、黑名单", icon: ShieldCheck },
  { id: "audit", label: "操作审计", description: "管理员动作追踪", icon: History },
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

function roleLabel(role?: AdminRole) {
  const labels: Record<AdminRole, string> = {
    viewer: "普通用户",
    support: "客服",
    finance: "财务",
    admin: "管理员",
    super_admin: "超级管理员",
  };
  return labels[role || "viewer"];
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

function formatCurrency(value?: number | null) {
  const amount = Number.isFinite(value) ? value as number : 0;
  return `¥${amount.toLocaleString("zh-CN")}`;
}

function formatCredits(value?: number | null) {
  const amount = Number.isFinite(value) ? value as number : 0;
  return amount.toLocaleString("zh-CN");
}

function defaultTestAccountExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
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

function formatCreditAdjustmentSuccess(userName: string, delta: number) {
  const action = delta > 0 ? "增加" : "扣减";
  return `已成功给 ${userName} 账户${action} ${formatCredits(Math.abs(delta))} 积分。`;
}

function normalizeAdminPayload(payload: AdminPayload) {
  const normalizedUsers = (payload.users || []).map((item) => ({
    ...item,
    spent: item.spent ?? item.totalRecharge ?? 0,
  }));
  const normalizedOrders = (payload.orders || []).map((item) => ({
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
  const normalizedProviders = (payload.providers || []).map((item) => ({
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
    credits: normalizedCredits,
    aiTasks: payload.aiTasks || [],
    providers: normalizedProviders,
    feedback: payload.feedback || [],
    alerts: payload.alerts || [],
    riskEvents: payload.riskEvents || [],
    auditRows: normalizedAuditRows,
    plans: payload.plans || [],
    productionChecks: payload.productionChecks || payload.overview?.productionChecks || [],
  };
}

type AdminState = ReturnType<typeof normalizeAdminPayload>;
type CreditAdjustmentFeedback = { tone: "success" | "error"; message: string };

const PAGE_SIZE = 20;

function notificationTimestamp(value: string) {
  if (value === "刚刚") return Date.now();
  const minutesAgo = value.match(/^(\d+)\s*分钟前$/);
  if (minutesAgo) return Date.now() - Number(minutesAgo[1]) * 60 * 1000;
  const hoursAgo = value.match(/^(\d+)\s*小时前$/);
  if (hoursAgo) return Date.now() - Number(hoursAgo[1]) * 60 * 60 * 1000;
  const timestamp = Date.parse(value.replace(/\//g, "-").replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatNotificationTime(value: string) {
  const formatted = formatExactOrderTime(value, "");
  if (formatted !== "未提供精确时间") return formatted;

  const timestamp = notificationTimestamp(value);
  return timestamp ? formatExactOrderTime(new Date(timestamp).toISOString(), "未提供精确时间") : formatted;
}

function isUrgentRiskNotification(item: AdminNotificationItem) {
  return item.tab === "security" && item.severity === "critical";
}

function pageItems<T>(items: T[], page: number) {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

function matchesDrawerTimeFilter(value: string, range: string) {
  if (range === "all") return true;
  const timestamp = notificationTimestamp(value);
  if (!timestamp) return true;
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  return timestamp >= Date.now() - hours * 60 * 60 * 1000;
}

function AdminPrototypePage() {
  const { user, changePassword, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [adminData, setAdminData] = useState<AdminState>(() => normalizeAdminPayload({}));
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [accountTypeFilter, setAccountTypeFilter] = useState<"all" | "regular" | "test">("all");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [orderQuery, setOrderQuery] = useState("");
  const [paidFrom, setPaidFrom] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [urgentRiskAttentionAcknowledged, setUrgentRiskAttentionAcknowledged] = useState(false);
  const [riskView, setRiskView] = useState<"all" | "urgent">("all");
  const [creditDelta, setCreditDelta] = useState(500);
  const [creditAdjustmentFeedback, setCreditAdjustmentFeedback] = useState<CreditAdjustmentFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("正在连接后台数据接口：/api/admin/overview。");
  const [policyDraft, setPolicyDraft] = useState<Array<{ capability: string; capabilityKey?: string; unit: string; baseCredits: number; estimatedCostPerUnit: number; provider: string }>>([]);
  const [discountDraft, setDiscountDraft] = useState<Array<{ planId: string; multiplier: number; label: string }>>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [accountDetail, setAccountDetail] = useState<AccountDetail | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [externalCollection, setExternalCollection] = useState({
    amount: "20",
    expectedCredits: "0",
    packageName: "接口方代收确认",
    collector: "AI 接口方商户",
    merchantOrderId: "",
    providerTransactionId: "",
    note: "接口方确认已收到用户付款",
    issueCredits: false,
  });
  const [testAccountForm, setTestAccountForm] = useState(() => ({
    email: "",
    initialCredits: "200",
    dailyCreditLimit: "50",
    expiresAt: defaultTestAccountExpiry(),
  }));
  const [testAccountPanelOpen, setTestAccountPanelOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isIssuingTestAccount, setIsIssuingTestAccount] = useState(false);
  const [testAccountFeedback, setTestAccountFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [externalUsage, setExternalUsage] = useState<any>(null);
  const [capabilityMarginFilters, setCapabilityMarginFilters] = useState<CapabilityMarginFilters>({
    time: "30d",
    grossMarginBand: "",
    minGrossMargin: "",
    maxGrossMargin: "",
    model: "",
    account: "",
    minChargedCredits: "",
    maxChargedCredits: "",
  });
  const [capabilityMarginData, setCapabilityMarginData] = useState<CapabilityMarginData | null>(null);
  const [capabilityMarginLoading, setCapabilityMarginLoading] = useState(false);
  const [capabilityMarginError, setCapabilityMarginError] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Artx-adminn";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    setUserPage(1);
  }, [query, statusFilter, accountTypeFilter, registeredFrom, registeredTo]);

  useEffect(() => {
    setOrderPage(1);
  }, [orderQuery, paidFrom, paidTo, amountMin, amountMax]);

  useEffect(() => {
    setOrderPage((current) => Math.min(current, Math.max(1, Math.ceil(adminData.orders.length / PAGE_SIZE))));
  }, [adminData.orders.length]);

  useEffect(() => {
    const savedNote = accountDetail?.notes.find((item) => item.orderId === selectedOrderId);
    setOrderNote(savedNote?.content || "");
  }, [accountDetail, selectedOrderId]);

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

  const fetchAccountDetail = useCallback(async (userId: string) => {
    const token = readAdminToken();
    if (!token || !userId) return;
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "账户详情加载失败");
      setAccountDetail(payload as AccountDetail);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "账户详情加载失败");
    }
  }, []);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    if (accountDrawerOpen && selectedUserId) {
      fetchAccountDetail(selectedUserId);
    }
  }, [accountDrawerOpen, fetchAccountDetail, selectedUserId]);

  useEffect(() => {
    if (activeSection !== "external_agents") return;
    const token = readAdminToken();
    if (!token) return;
    fetch("/api/admin/external-agent-usage", { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.json())
      .then(setExternalUsage)
      .catch(() => setExternalUsage(null));
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "integrations") return;

    const token = readAdminToken();
    if (!token) {
      setCapabilityMarginData(null);
      setCapabilityMarginError("未找到后台登录令牌，请重新登录后查看毛利分析。");
      return;
    }

    const query = new URLSearchParams({ time: capabilityMarginFilters.time });
    for (const [key, value] of Object.entries(capabilityMarginFilters)) {
      if (key !== "time" && value) query.set(key, value);
    }
    const controller = new AbortController();
    const capabilityMarginPath = "/api/admin/capability-margin";
    setCapabilityMarginLoading(true);
    setCapabilityMarginError("");

    fetch(`${capabilityMarginPath}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "毛利分析加载失败");
        return payload as CapabilityMarginData;
      })
      .then((payload) => {
        setCapabilityMarginData(payload);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCapabilityMarginData(null);
        setCapabilityMarginError(error instanceof Error ? error.message : "毛利分析加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCapabilityMarginLoading(false);
      });

    return () => controller.abort();
  }, [activeSection, capabilityMarginFilters]);

  async function adminPost(
    path: string,
    payload: Record<string, unknown>,
    successMessage: string,
    onSuccess?: () => void,
    onFailure?: (message: string) => void,
  ) {
    const token = readAdminToken();
    if (!token) {
      const message = "未找到后台登录令牌，请重新登录后再操作。";
      setNotice(message);
      onFailure?.(message);
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
      if (accountDrawerOpen && selectedUserId) {
        await fetchAccountDetail(selectedUserId);
      }
      setNotice(successMessage);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "后台写操作失败";
      setNotice(message);
      onFailure?.(message);
    }
  }

  async function adminPostOrder(path: string, payload: Record<string, unknown>, successMessage: string, method: "POST" | "DELETE" = "POST") {
    const token = readAdminToken();
    if (!token) {
      setNotice("未找到后台登录令牌，请重新登录后再操作。");
      return;
    }
    try {
      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "订单操作失败");
      await fetchAdminData(successMessage);
      if (selectedUserId) {
        await fetchAccountDetail(selectedUserId);
      }
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "订单操作失败");
    }
  }

  const selectedUser = adminData.users.find((item) => item.id === selectedUserId) ?? adminData.users[0];
  const selectedOrder = adminData.orders.find((item) => item.id === selectedOrderId) ?? adminData.orders[0];
  const metrics = adminData.overview?.metrics;
  const dashboardRiskTarget = getDashboardRiskTarget({
    paymentExceptions: metrics?.paymentExceptions,
    highRiskEvents: metrics?.highRiskEvents,
  });

  useEffect(() => {
    if (activeSection !== "orders" || !selectedOrder) return;
    const orderUser = (selectedOrder.userId ? adminData.users.find((userItem) => userItem.id === selectedOrder.userId) : undefined)
      || adminData.users.find((userItem) => userItem.name === selectedOrder.user);
    if (orderUser && orderUser.id !== selectedUserId) {
      setSelectedUserId(orderUser.id);
    }
  }, [activeSection, adminData.users, selectedOrder, selectedUserId]);

  const paidRevenue = metrics?.todayRevenue ?? adminData.orders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + order.amount, 0);
  const issuedCredits = metrics?.issuedCredits ?? adminData.orders.reduce((sum, order) => sum + order.credits, 0);
  const notificationGroups = useMemo(() => buildAdminNotifications({
    orders: adminData.orders,
    alerts: adminData.alerts,
    feedback: adminData.feedback,
    riskEvents: adminData.riskEvents,
  }), [adminData.alerts, adminData.feedback, adminData.orders, adminData.riskEvents]);
  const notificationItems = Object.values(notificationGroups).flat();
  const unreadAlerts = notificationItems.filter((item) => item.unread).length;
  const urgentRiskNotifications = notificationItems.filter(isUrgentRiskNotification);
  const urgentAlerts = urgentRiskNotifications.filter((item) => item.unread).length;

  useEffect(() => {
    setUrgentRiskAttentionAcknowledged(false);
  }, [urgentRiskNotifications.length]);

  const filteredUsers = useMemo(() => {
    return filterAdminUsers(adminData.users, {
      query,
      accountType: accountTypeFilter,
      registeredFrom,
      registeredTo,
    }).filter((user) => {
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      return matchesStatus;
    });
  }, [accountTypeFilter, adminData.users, query, registeredFrom, registeredTo, statusFilter]);
  const filteredOrders = useMemo(() => filterAdminOrders(adminData.orders, {
    query: orderQuery,
    paidFrom,
    paidTo,
    amountMin,
    amountMax,
  }), [adminData.orders, amountMax, amountMin, orderQuery, paidFrom, paidTo]);
  const visibleUsers = pageItems(filteredUsers, userPage);
  const visibleOrders = pageItems(filteredOrders, orderPage);

  function handleResolveFeedback(id: string) {
    adminPost(`/api/admin/feedback/${id}/status`, { status: "resolved", reason: "后台标记解决" }, "反馈状态已写入后台，并生成操作审计。");
  }

  function handleUserRole(id: string, role: Exclude<AdminRole, "super_admin">) {
    adminPost(`/api/admin/users/${id}/role`, { role }, `用户角色已更新为 ${roleLabel(role)}。`);
  }

  function handleUserStatus(id: string, status: "normal" | "blocked") {
    adminPost(`/api/admin/users/${id}/status`, { status }, status === "blocked" ? "用户已停用并强制退出。" : "用户已恢复。");
  }

  function handleCreditAdjustment(direction: "plus" | "minus") {
    if (!selectedUser) {
      setNotice("请先选择一个真实用户账户。");
      return;
    }
    const delta = Math.abs(creditDelta) * (direction === "plus" ? 1 : -1);
    const successMessage = formatCreditAdjustmentSuccess(selectedUser.name, delta);
    adminPost("/api/admin/credits/adjust", {
      userId: selectedUser.id,
      delta,
      reason: "后台人工积分调整",
      confirmHighRisk: Math.abs(delta) >= 10000,
    }, successMessage, () => {
      setCreditAdjustmentFeedback({ tone: "success", message: successMessage });
    }, (message) => {
      setCreditAdjustmentFeedback({ tone: "error", message: `积分调整失败：${message}` });
    });
  }

  const canManageTestAccounts = user?.role === "super_admin";

  async function handleCreateTestAccount() {
    if (isIssuingTestAccount) return;
    const token = readAdminToken();
    if (!token) {
      const message = "未找到后台登录令牌，请重新登录后再操作。";
      setNotice(message);
      setTestAccountFeedback({ tone: "error", message: `测试账号发放失败：${message}` });
      return;
    }
    if (!testAccountForm.email.trim() || !testAccountForm.expiresAt) {
      const message = "请填写测试账号邮箱和有效期。";
      setNotice(message);
      setTestAccountFeedback({ tone: "error", message: `测试账号发放失败：${message}` });
      return;
    }
    setIsIssuingTestAccount(true);
    setTemporaryPassword("");
    setTestAccountFeedback(null);
    try {
      const response = await fetch("/api/admin/test-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: testAccountForm.email.trim(),
          initialCredits: Number(testAccountForm.initialCredits),
          dailyCreditLimit: Number(testAccountForm.dailyCreditLimit),
          expiresAt: testAccountForm.expiresAt,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "测试账号发放失败");

      setTemporaryPassword(typeof result.temporaryPassword === "string" ? result.temporaryPassword : "");
      const message = "测试账号已创建，临时密码仅在当前窗口显示一次。";
      setNotice(message);
      setTestAccountFeedback({ tone: "success", message });
      await fetchAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "测试账号发放失败";
      setNotice(message);
      setTestAccountFeedback({ tone: "error", message: `测试账号发放失败：${message}` });
    } finally {
      setIsIssuingTestAccount(false);
    }
  }

  function handleTestProfileUpdate(userId: string, payload: Record<string, unknown>) {
    adminPost(`/api/admin/users/${encodeURIComponent(userId)}/test-profile`, payload, "测试账号额度和有效期已更新。");
  }

  function handleTestAccountCancel(userId: string) {
    adminPost(`/api/admin/users/${encodeURIComponent(userId)}/test-account/cancel`, { confirm: true }, "测试账号已注销，登录和 AI 生成已永久禁用。", () => {
      setAccountDrawerOpen(false);
    });
  }

  function handleModelAccessUpdate(userId: string, allowedAiModels: string[]) {
    adminPost(
      `/api/admin/users/${encodeURIComponent(userId)}/model-access`,
      { allowedAiModels },
      "用户模型权限已保存。",
    );
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage("请填写当前密码、新密码和确认密码。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("两次输入的新密码不一致。");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage("新密码至少需要 8 位。");
      return;
    }
    setPasswordBusy(true);
    setPasswordMessage("");
    const result = await changePassword(currentPassword, newPassword);
    setPasswordBusy(false);
    if (!result.ok) {
      setPasswordMessage(result.error || "密码修改失败。");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordPanelOpen(false);
    setPasswordMessage("");
    setNotice("密码已更新，当前登录会话已自动换发。");
  }

  function handleMarkAllAlertsRead() {
    adminPost("/api/admin/alerts/read-all", {}, "所有消息已标记为已读，未读气泡已清除。");
  }

  function handleRiskStatus(id: string, status: "reviewing" | "mitigated", reason: string) {
    adminPost(`/api/admin/risk-events/${encodeURIComponent(id)}/status`, {
      status,
      reason,
    }, status === "reviewing" ? "风险事件已进入处理中。" : "风险事件已关闭并写入审计日志。");
  }

  function handleNotificationJump(item: AdminNotificationItem) {
    handleMarkNotificationRead(item);
    setAlertsOpen(false);
    if (item.targetSection === "orders" && item.targetId) {
      handleSelectOrder(item.targetId);
      setActiveSection("orders");
      return;
    }
    setActiveSection(item.targetSection);
  }

  function handleMarkNotificationRead(item: AdminNotificationItem) {
    if (!item.unread) return;
    const [kind, id] = item.id.split(":", 2);
    if (!id || !["order", "alert", "feedback", "risk"].includes(kind)) return;
    adminPost(`/api/admin/notifications/${kind}/${encodeURIComponent(id)}/read`, {}, "消息已标记为已读。");
  }

  function handleDismissNotification(item: AdminNotificationItem) {
    if (!isUrgentRiskNotification(item)) return;
    const [kind, id] = item.id.split(":", 2);
    if (!id || !["order", "alert", "feedback", "risk"].includes(kind)) return;
    adminPost(`/api/admin/notifications/${kind}/${encodeURIComponent(id)}/dismiss`, {}, "紧急消息警报已解除，原始业务记录仍保留在后台。 ");
  }

  function handleOpenUrgentRisk() {
    setUrgentRiskAttentionAcknowledged(true);
    setAlertsOpen(false);
    setRiskView("urgent");
    setActiveSection("risk");
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
    const order = adminData.orders.find((item) => item.id === orderId);
    const orderUser = order
      ? (order.userId ? adminData.users.find((userItem) => userItem.id === order.userId) : undefined)
        || adminData.users.find((userItem) => userItem.name === order.user)
      : undefined;
    setSelectedOrderId(orderId);
    if (orderUser) {
      if (orderUser.id !== selectedUserId) {
        setAccountDetail(null);
      }
      setSelectedUserId(orderUser.id);
      setAccountDrawerOpen(true);
    }
    setOrderNote("");
  }

  function handleSelectUser(userId: string) {
    if (userId !== selectedUserId) {
      setAccountDetail(null);
    }
    setSelectedUserId(userId);
    const userOrder = adminData.orders.find((order) => order.userId === userId);
    if (userOrder) {
      setSelectedOrderId(userOrder.id);
    }
    setOrderNote("");
    setAccountDrawerOpen(true);
  }

  function handleAddOrderNote() {
    if (!selectedOrderId) return;
    adminPostOrder(`/api/admin/orders/${encodeURIComponent(selectedOrderId)}/notes`, {
      content: orderNote,
    }, "订单处理备注已保存，并写入审计日志。");
    setOrderNote("");
  }

  function handleDeleteOrderNote() {
    if (!selectedOrderId) return;
    adminPostOrder(`/api/admin/orders/${encodeURIComponent(selectedOrderId)}/notes`, {}, "订单处理备注已删除，并写入审计日志。", "DELETE");
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

  function handleExternalCollectionChange(key: keyof typeof externalCollection, value: string | boolean) {
    setExternalCollection((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleRecordExternalCollection() {
    if (!selectedUser) {
      setNotice("请先选择一个真实用户账户。");
      return;
    }
    adminPostOrder("/api/admin/orders/external-collection", {
      userId: selectedUser.id,
      amount: Number(externalCollection.amount || 0),
      expectedCredits: Number(externalCollection.expectedCredits || 0),
      packageName: externalCollection.packageName,
      collector: externalCollection.collector,
      merchantOrderId: externalCollection.merchantOrderId,
      providerTransactionId: externalCollection.providerTransactionId,
      note: externalCollection.note,
      issueCredits: externalCollection.issueCredits,
    }, "接口方代收记录已登记到后台订单、支付事件和审计日志。");
  }

  return (
    <div className="admin-readable-copy min-h-screen overflow-x-hidden bg-[#0b1020] text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-[#0f172a] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-5">
              <div className="flex min-w-0 items-center gap-3">
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
              <button
                type="button"
                onClick={logout}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/12 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
                退出登录
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 lg:h-screen lg:overflow-y-auto">
          <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1020]/90 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                  金额与积分运营后台
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  管理用户、支付、积分、反馈、第三方接口和高风险操作。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <NotificationCenter
                  groups={notificationGroups}
                  open={alertsOpen}
                  unreadCount={unreadAlerts}
                  urgentCount={urgentAlerts}
                  urgentTagVisible={urgentRiskNotifications.length > 0 && !urgentRiskAttentionAcknowledged}
                  onToggle={() => setAlertsOpen((value) => !value)}
                  onMarkRead={handleMarkNotificationRead}
                  onMarkAllRead={handleMarkAllAlertsRead}
                  onJumpTo={handleNotificationJump}
                  onDismissNotification={handleDismissNotification}
                  onOpenUrgentRisk={handleOpenUrgentRisk}
                />
                <Button
                  variant="outline"
                  className="min-w-0 border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                  onClick={() => fetchAdminData("已刷新第三方支付、模型供应商和告警状态。")}
                >
                  <Activity className="size-4" />
                  刷新接口状态
                </Button>
                <Button
                  className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:w-auto"
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

            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/[0.055] px-4 py-3 text-sm text-emerald-50">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="font-medium">后台权限已启用</span>
                  <span className="ml-2 text-emerald-100/75">
                    当前账号：{user?.username || "admin"} · 角色：{user?.role || "admin"}
                  </span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span className="text-xs text-emerald-100/70">
                    权限：{(user?.permissions || ["admin:access"]).slice(0, 4).join(" / ")}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-emerald-300/30 bg-emerald-300/10 text-emerald-50 hover:bg-emerald-300/15 sm:w-auto"
                    onClick={() => {
                      setPasswordPanelOpen((value) => !value);
                      setPasswordMessage("");
                    }}
                  >
                    <LockKeyhole className="size-4" />
                    修改密码
                  </Button>
                </div>
              </div>
              {passwordPanelOpen && (
                <div className="mt-4 grid gap-3 border-t border-emerald-300/15 pt-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="当前密码"
                    autoComplete="current-password"
                    className="border-emerald-300/20 bg-slate-950/45 text-emerald-50 placeholder:text-emerald-100/35"
                  />
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="新密码，至少 8 位"
                    autoComplete="new-password"
                    className="border-emerald-300/20 bg-slate-950/45 text-emerald-50 placeholder:text-emerald-100/35"
                  />
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="确认新密码"
                    autoComplete="new-password"
                    className="border-emerald-300/20 bg-slate-950/45 text-emerald-50 placeholder:text-emerald-100/35"
                  />
                  <Button
                    type="button"
                    className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                    onClick={handleChangePassword}
                    disabled={passwordBusy}
                  >
                    {passwordBusy ? "提交中" : "保存"}
                  </Button>
                  {passwordMessage && (
                    <div className="text-xs text-amber-100 lg:col-span-4">{passwordMessage}</div>
                  )}
                </div>
              )}
            </div>

            <section className="grid gap-3 md:grid-cols-3">
              <MetricCard
                icon={CircleDollarSign}
                label="已确认金额"
                value={formatCurrency(paidRevenue)}
                detail="仅统计已支付订单金额"
              />
              <MetricCard
                icon={Gauge}
                label="已发放积分"
                value={formatCredits(issuedCredits)}
                detail="购买积分 + 赠送积分"
              />
              <MetricCard
                icon={AlertTriangle}
                label="待处理风险"
                value={formatCredits((metrics?.paymentExceptions ?? 0) + (metrics?.highRiskEvents ?? 0))}
                detail="支付异常 + 高风险事件"
                actionLabel="立即处理"
                onAction={() => setActiveSection(dashboardRiskTarget)}
              />
            </section>

            <section className="min-w-0">
              <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035]">
                <SectionTabs activeSection={activeSection} setActiveSection={setActiveSection} />
                <div className="p-4 md:p-5">{renderSection()}</div>
              </div>
            </section>
          </div>
        </main>
      </div>
      <AccountDetailDrawer
        open={accountDrawerOpen}
        detail={accountDetail}
        fallbackUser={selectedUser}
        selectedOrderId={selectedOrderId}
        note={orderNote}
        creditDelta={creditDelta}
        setCreditDelta={setCreditDelta}
        onClose={() => setAccountDrawerOpen(false)}
        onSelectOrder={handleSelectOrder}
        onNoteChange={setOrderNote}
        onAddNote={handleAddOrderNote}
        onDeleteNote={handleDeleteOrderNote}
        onReissue={handleReissueOrder}
        onRefund={handleRefundOrder}
        onAdjust={handleCreditAdjustment}
        creditAdjustmentFeedback={creditAdjustmentFeedback}
        onDismissCreditAdjustmentFeedback={() => setCreditAdjustmentFeedback(null)}
        canManageTestAccounts={canManageTestAccounts}
        onUpdateTestProfile={handleTestProfileUpdate}
        onCancelTestAccount={handleTestAccountCancel}
        onUpdateModelAccess={handleModelAccessUpdate}
      />
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
                <p className="text-sm text-slate-400">先处理影响支付金额和积分可信度的问题。</p>
              </div>
              <Badge tone="amber">{adminData.overview?.operationsQueue.length || adminData.alerts.length} 项待办</Badge>
            </div>
            <div className="space-y-3">
              {(adminData.overview?.operationsQueue || []).length ? (
                (adminData.overview?.operationsQueue || []).map(({ title, body, priority, section }) => (
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
                ))
              ) : (
                <EmptyPanel title="暂无运营待办" body="没有真实告警、反馈或风险事件时，这里保持为空。" />
              )}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4">
            <h2 className="text-base font-semibold">后台模块成熟度</h2>
            <p className="mt-1 text-sm text-slate-400">用于判断 MVP 后台先做什么。</p>
            <div className="mt-5 space-y-4">
              {(adminData.overview?.maturity || []).length ? (
                (adminData.overview?.maturity || []).map(({ label, value }) => (
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
                ))
              ) : (
                <EmptyPanel title="暂无成熟度数据" body="后台不会用演示评分填充模块成熟度。" />
              )}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-slate-950/40 p-4 xl:col-span-2">
            <h2 className="text-base font-semibold">正式上线依赖</h2>
            <p className="mt-1 text-sm text-slate-400">这里按服务器环境变量判断生产接口、存储、告警和备份是否具备上线条件。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(adminData.overview?.productionReadiness || []).map((item) => (
                <div key={item.id} className="rounded-md border border-white/8 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">{item.domain}</div>
                    <Badge className={statusClass(item.status === "ready" ? "normal" : item.status === "partial" ? "watch" : "blocked")}>
                      {item.status === "ready" ? "可上线" : item.status === "partial" ? "部分配置" : "缺配置"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{item.summary}</p>
                  {item.missingKeys.length > 0 && <div className="mt-2 text-xs text-amber-200">缺少：{item.missingKeys.join(" / ")}</div>}
                  <div className="mt-2 text-xs text-slate-500">{item.action}</div>
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
            accountTypeFilter={accountTypeFilter}
            setAccountTypeFilter={setAccountTypeFilter}
            registeredFrom={registeredFrom}
            setRegisteredFrom={setRegisteredFrom}
            registeredTo={registeredTo}
            setRegisteredTo={setRegisteredTo}
          />
          {canManageTestAccounts && (
            <div className="flex justify-end">
              <Button type="button" className="bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => {
                setTestAccountPanelOpen((current) => !current);
                setTemporaryPassword("");
                setTestAccountFeedback(null);
              }}>
                <Plus className="size-4" />
                发放测试账号
              </Button>
            </div>
          )}
          {testAccountPanelOpen && (
            <section className="rounded-md border border-cyan-300/25 bg-cyan-300/[0.045] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-cyan-50">发放测试账号</h2>
                  <p className="mt-1 text-xs text-slate-400">创建后仅显示一次临时密码；额度、日限额和有效期均由服务端验证。</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="border-white/12 bg-white/5" onClick={() => setTestAccountPanelOpen(false)}>关闭</Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-xs text-slate-400">测试账号邮箱<Input value={testAccountForm.email} onChange={(event) => setTestAccountForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" className="border-white/12 bg-slate-950/40" /></label>
                <label className="space-y-1 text-xs text-slate-400">初始额度<Input type="number" min="1" value={testAccountForm.initialCredits} onChange={(event) => setTestAccountForm((current) => ({ ...current, initialCredits: event.target.value }))} className="border-white/12 bg-slate-950/40" /></label>
                <label className="space-y-1 text-xs text-slate-400">每日 AI 限额<Input type="number" min="1" value={testAccountForm.dailyCreditLimit} onChange={(event) => setTestAccountForm((current) => ({ ...current, dailyCreditLimit: event.target.value }))} className="border-white/12 bg-slate-950/40" /></label>
                <label className="space-y-1 text-xs text-slate-400">有效期<Input type="datetime-local" value={testAccountForm.expiresAt} onChange={(event) => setTestAccountForm((current) => ({ ...current, expiresAt: event.target.value }))} className="border-white/12 bg-slate-950/40" /></label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" onClick={handleCreateTestAccount} disabled={isIssuingTestAccount || !testAccountForm.email || !testAccountForm.expiresAt} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">{isIssuingTestAccount ? "正在发放..." : "确认发放"}</Button>
                {temporaryPassword && <code className="break-all border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">临时密码：{temporaryPassword}</code>}
              </div>
              {testAccountFeedback && <p role="status" className={cn("mt-3 text-xs", testAccountFeedback.tone === "error" ? "text-rose-200" : "text-emerald-200")}>{testAccountFeedback.message}</p>}
            </section>
          )}
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>用户</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>后台角色</TableHead>
                <TableHead>账户类型</TableHead>
                <TableHead>积分余额</TableHead>
                <TableHead>累计支付金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead>最近活跃</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.length ? (
                visibleUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className={cn(
                      "border-white/8 hover:bg-white/[0.04]",
                      selectedUserId === user.id && "bg-cyan-300/8"
                    )}
                    onClick={() => handleSelectUser(user.id)}
                  >
                    <TableCell>
                      <div className="font-medium">{user.name}</div>
                      <div className="break-all text-xs text-slate-500">{user.email}</div>
                    </TableCell>
                    <TableCell>{user.plan}</TableCell>
                    <TableCell>
                      <Badge className={cn("w-fit shrink-0", user.role && user.role !== "viewer" ? statusClass("watch") : statusClass("normal"))}>
                        {roleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("w-fit shrink-0", user.accountType === "test" ? statusClass("watch") : statusClass("normal"))}>
                        {user.accountType === "test" ? "测试账号" : "普通账号"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCredits(user.credits)}</TableCell>
                    <TableCell>{formatCurrency(user.spent)}</TableCell>
                    <TableCell>
                      <Badge className={cn("w-fit shrink-0", statusClass(user.status))}>{statusLabel(user.status)}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-slate-400">
                      {formatExactOrderTime(user.registeredAt, "未提供精确时间")}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      <div>{user.lastSeen}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-0 border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleUserRole(user.id, user.role === "support" ? "viewer" : "support");
                          }}
                          disabled={user.role === "super_admin"}
                        >
                          {user.role === "support" ? "撤销客服" : "设为客服"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-0 border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleUserRole(user.id, user.role === "finance" ? "viewer" : "finance");
                          }}
                          disabled={user.role === "super_admin"}
                        >
                          {user.role === "finance" ? "撤销财务" : "设为财务"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-0 border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleUserRole(user.id, user.role === "admin" ? "viewer" : "admin");
                          }}
                          disabled={user.role === "super_admin"}
                        >
                          {user.role === "admin" ? "撤销管理员" : "设为管理员"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-w-0 border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
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
                ))
              ) : (
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">
                    暂无真实用户数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <PagePaginator items={filteredUsers} page={userPage} onPageChange={setUserPage} />
        </div>
      );
    }

    if (activeSection === "orders") {
      const paymentCheck = productionCheckById(adminData.productionChecks, "payment_reconciliation");
      return (
        <div className="min-w-0 space-y-5">
          {paymentCheck && <ProductionCheckPanel check={paymentCheck} title="支付对账状态" />}
          <OrderFilters
            query={orderQuery}
            setQuery={setOrderQuery}
            paidFrom={paidFrom}
            setPaidFrom={setPaidFrom}
            paidTo={paidTo}
            setPaidTo={setPaidTo}
            amountMin={amountMin}
            setAmountMin={setAmountMin}
            amountMax={amountMax}
            setAmountMax={setAmountMax}
          />
          <div className="min-w-0 overflow-x-auto rounded-md border border-white/10 bg-white/[0.03]">
            <OrdersTable
              orders={visibleOrders}
              users={adminData.users}
              selectedOrderId={selectedOrder?.id || ""}
              onSelect={handleSelectOrder}
            />
          </div>
          <PagePaginator items={filteredOrders} page={orderPage} onPageChange={setOrderPage} />

          <div className="min-w-0">
            {selectedUser ? (
              <ExternalCollectionPanel
                form={externalCollection}
                selectedUserName={selectedUser.name}
                onChange={handleExternalCollectionChange}
                onSubmit={handleRecordExternalCollection}
              />
            ) : (
              <EmptyPanel title="暂无可关联用户" body="需要先有真实用户账户，才能登记接口方代收记录。" />
            )}
          </div>
        </div>
      );
    }

    if (activeSection === "credits") {
      const creditCheck = productionCheckById(adminData.productionChecks, "credit_liability");
      return (
        <div className="min-w-0 space-y-5">
          {creditCheck && <ProductionCheckPanel check={creditCheck} title="积分负债状态" />}
          <DataList
            title="积分流水"
            description="每一笔入账、消耗、冻结、人工调整都必须可追溯。"
            rows={adminData.credits.map((event) => ({
              title: `${event.user} · ${event.type}`,
              meta: `${event.actor} · ${event.note}`,
              value: event.amount,
              icon: event.amount.startsWith("+") ? Gift : LockKeyhole,
            }))}
          />
        </div>
      );
    }

    if (activeSection === "feedback") {
      return (
        <div className="space-y-3">
          {adminData.feedback.length ? (
            adminData.feedback.map((item) => (
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
                    {item.content && (
                      <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">
                        {item.content}
                      </p>
                    )}
                    {item.attachments && item.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.attachments.map((attachment) => (
                          <a
                            key={attachment.src}
                            href={resolveAdminUploadUrl(attachment.src)}
                            target="_blank"
                            rel="noreferrer"
                            className="group block overflow-hidden rounded-md border border-white/10 bg-white/5"
                            title={attachment.name}
                          >
                            <img
                              src={resolveAdminUploadUrl(attachment.src)}
                              alt={attachment.name}
                              className="h-20 w-20 object-cover transition group-hover:opacity-85"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-0 border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
                    onClick={() => handleResolveFeedback(item.id)}
                  >
                    <Check className="size-4" />
                    标记解决
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyPanel title="暂无真实反馈" body="没有用户反馈时不会显示演示工单。" />
          )}
        </div>
      );
    }

    if (activeSection === "integrations") {
      const secretCheck = productionCheckById(adminData.productionChecks, "secret_governance");
      return (
        <div className="min-w-0 space-y-5">
          {secretCheck && <ProductionCheckPanel check={secretCheck} title="密钥治理状态" />}
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
              <Button className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:w-auto" onClick={handleSaveAiPolicies}>
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
              {!policyDraft.length && (
                <EmptyPanel title="暂无 AI 扣分策略" body="接口未返回策略前，不展示任何演示策略。" />
              )}
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
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
          <CapabilityMarginAnalysis
            filters={capabilityMarginFilters}
            onFiltersChange={setCapabilityMarginFilters}
            data={capabilityMarginData}
            loading={capabilityMarginLoading}
            error={capabilityMarginError}
            modelOptions={Array.from(new Set([
              ...(adminData.overview?.aiCostBreakdownByModel || []).map((item) => item.key),
              ...(capabilityMarginData?.models || []).map((item) => item.key),
            ])).sort()}
          />
          <div className="grid gap-4 xl:grid-cols-1">
            <DataList
              title="按供应商毛利明细"
              description="看哪家供应商最耗钱、最影响毛利。"
              rows={(adminData.overview?.aiCostBreakdownByProvider || []).map((item) => ({
                title: item.label,
                meta: `成功 ${item.successCount} / 失败 ${item.failedCount} · 预估成本 ${formatCurrency(item.estimatedCost)}`,
                value: `${formatCredits(item.chargedCredits)} 积分 · ${Math.round(item.avgGrossMargin * 100)}%`,
                icon: Gauge,
              }))}
            />
          </div>
        </div>
      );
    }

    if (activeSection === "external_agents") {
      const summary = externalUsage?.summary;
      return (
        <div className="space-y-4">
          <div><h2 className="text-lg font-semibold">第三方 Agent 调用监控</h2><p className="mt-1 text-sm text-slate-400">仅显示脱敏 API Key；港币金额为预估上游成本，不是供应商账单。</p></div>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard icon={Activity} label="调用次数" value={String(summary?.calls ?? 0)} detail={`成功 ${summary?.successfulCalls ?? 0} / 失败 ${summary?.failedCalls ?? 0}`} />
            <MetricCard icon={WalletCards} label="消耗积分" value={formatCredits(summary?.chargedCredits ?? 0)} detail="按外部 MCP 调用归集" />
            <MetricCard icon={BarChart3} label="输入 / 输出 Token" value={`${summary?.inputTokens ?? 0} / ${summary?.outputTokens ?? 0}`} detail="上游返回时记录" />
            <MetricCard icon={CircleDollarSign} label="预估 HK$ 成本" value={`HK$ ${(summary?.estimatedCostHkd ?? 0).toFixed(2)}`} detail={`1 USD = ${externalUsage?.usdToHkdRate ?? 7.8} HKD`} />
          </div>
          <Table><TableHeader><TableRow><TableHead>API Key / Agent</TableHead><TableHead>模型</TableHead><TableHead>调用</TableHead><TableHead>积分</TableHead><TableHead>预估 HK$</TableHead></TableRow></TableHeader><TableBody>{(externalUsage?.byKey || []).map((row: any) => <TableRow key={`${row.apiKeyId}-${row.model}`}><TableCell>{row.apiKey} · {row.agentSource}</TableCell><TableCell>{row.model}</TableCell><TableCell>{row.calls}</TableCell><TableCell>{row.chargedCredits}</TableCell><TableCell>HK$ {row.estimatedCostHkd.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
        </div>
      );
    }

    if (activeSection === "risk") {
      return (
        <RiskEventList
          events={riskView === "urgent" ? adminData.riskEvents.filter((event) => event.severity === "high" && event.status !== "mitigated") : adminData.riskEvents}
          onUpdateStatus={handleRiskStatus}
          urgentView={riskView === "urgent"}
        />
      );
    }

    return (
      <div className="min-w-0 space-y-5">
        {productionCheckById(adminData.productionChecks, "privileged_access") && (
          <ProductionCheckPanel
            check={productionCheckById(adminData.productionChecks, "privileged_access")!}
            title="高危权限状态"
          />
        )}
        <DataList
          title="管理员操作审计"
          description="金额和积分相关操作必须记录人、时间、目标和原因。"
          rows={adminData.auditRows.map((row) => ({
            title: row.action,
            meta: `${row.actor} · ${row.target}${row.reason ? ` · ${row.reason}` : ""}`,
            value: row.time,
            icon: History,
          }))}
        />
        <DataList
          title="套餐/金额配置"
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
  actionLabel,
  onAction,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-md bg-white/7">
          <Icon className="size-4 text-cyan-200" />
        </div>
        <span className="text-xs text-emerald-200">实时</span>
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="text-sm text-slate-400">{label}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            className="shrink-0 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/18"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

const notificationTabs: Array<{ id: AdminNotificationTab; label: string; empty: string; icon: typeof Bell }> = [
  { id: "order", label: "订单类", empty: "暂无购买订单消息", icon: CreditCard },
  { id: "security", label: "安全类", empty: "暂无安全告警消息", icon: ShieldCheck },
  { id: "voice", label: "用户之声", empty: "暂无用户反馈消息", icon: MessageSquareText },
];

function notificationSeverityClass(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return statusClass("P0");
  if (severity === "warning") return statusClass("watch");
  return statusClass("normal");
}

function NotificationCenter({
  groups,
  open,
  unreadCount,
  urgentCount,
  urgentTagVisible,
  onToggle,
  onMarkRead,
  onMarkAllRead,
  onJumpTo,
  onDismissNotification,
  onOpenUrgentRisk,
}: {
  groups: AdminNotificationGroups;
  open: boolean;
  unreadCount: number;
  urgentCount: number;
  urgentTagVisible: boolean;
  onToggle: () => void;
  onMarkRead: (item: AdminNotificationItem) => void;
  onMarkAllRead: () => void;
  onJumpTo: (item: AdminNotificationItem) => void;
  onDismissNotification: (item: AdminNotificationItem) => void;
  onOpenUrgentRisk: () => void;
}) {
  const [activeView, setActiveView] = useState<AdminNotificationTab | "all">("all");
  const allItems = Object.values(groups).flat()
    .sort((left, right) => notificationTimestamp(right.time) - notificationTimestamp(left.time));
  const activeItems = activeView === "all" ? allItems : groups[activeView] || [];
  const totalCount = unreadCount;

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
        <div className="absolute right-0 top-11 z-30 w-[calc(100vw-32px)] max-w-[520px] overflow-hidden rounded-md border border-white/10 bg-[#0f172a] shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">后台消息中心</div>
                <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                  聚合订单、网络安全告警和用户反馈，点击文字链进入对应详情。
                </p>
              </div>
              {urgentTagVisible && (
                <button
                  type="button"
                  className={cn("rounded-md border px-2 py-1 text-xs font-medium", statusClass("P0"))}
                  onClick={onOpenUrgentRisk}
                >
                  紧急类 {urgentCount}
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{totalCount} 条消息 · {unreadCount} 条待处理</span>
              <button
                className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
                onClick={onMarkAllRead}
              >
                全部已读
              </button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <button
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition",
                  activeView === "all"
                    ? "border-cyan-300 bg-cyan-300 text-slate-950"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                )}
                onClick={() => setActiveView("all")}
              >
                全部
                <span className={cn("rounded px-1", activeView === "all" ? "bg-slate-950/15" : "bg-white/8")}>{totalCount}</span>
              </button>
              {notificationTabs.map((tab) => {
                const Icon = tab.icon;
                const count = groups[tab.id]?.filter((item) => item.unread).length || 0;
                const isActive = activeView === tab.id;
                return (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition",
                      isActive
                        ? "border-cyan-300 bg-cyan-300 text-slate-950"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    )}
                    onClick={() => setActiveView(tab.id)}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                    <span className={cn("rounded px-1", isActive ? "bg-slate-950/15" : "bg-white/8")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {activeItems.length ? (
              activeItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "border-b border-white/8 p-4 last:border-b-0",
                    item.unread ? "bg-cyan-300/[0.045]" : "bg-transparent"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                        item.severity === "critical"
                          ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                          : item.severity === "warning"
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                            : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                      )}
                    >
                      {item.tab === "order" ? (
                        <CreditCard className="size-4" />
                      ) : item.tab === "security" ? (
                        <ShieldCheck className="size-4" />
                      ) : (
                        <MessageSquareText className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={notificationSeverityClass(item.severity)}>{item.label}</Badge>
                        <span className="text-xs text-slate-500">{formatNotificationTime(item.time)}</span>
                        {item.unread && <span className="size-2 rounded-full bg-cyan-300" />}
                      </div>
                      <div className="mt-2 text-sm font-medium">{item.title}</div>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-400">{item.detail}</p>
                      {item.attachments && item.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.attachments.map((attachment) => (
                            <a
                              key={attachment.src}
                              href={resolveAdminUploadUrl(attachment.src)}
                              target="_blank"
                              rel="noreferrer"
                              className="group block overflow-hidden rounded-md border border-white/10 bg-white/5"
                              title={attachment.name || "反馈截图"}
                            >
                              <img
                                src={resolveAdminUploadUrl(attachment.src)}
                                alt={attachment.name || "反馈截图"}
                                className="h-16 w-16 object-cover transition group-hover:opacity-85"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-cyan-100 hover:bg-white/8"
                          onClick={() => onJumpTo(item)}
                        >
                          查看详情
                        </button>
                        {item.id.startsWith("alert:") && (
                          <button
                            className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-950 hover:bg-cyan-100"
                            onClick={() => onMarkRead(item)}
                          >
                            标记处理
                          </button>
                        )}
                        {isUrgentRiskNotification(item) && (
                          <button
                            className="rounded-md border border-rose-300/35 bg-rose-300/10 px-2 py-1 text-xs font-medium text-rose-100 hover:bg-rose-300/20"
                            onClick={() => onDismissNotification(item)}
                          >
                            解除警报
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-sm text-slate-500">
                {activeView === "all" ? "暂无消息" : notificationTabs.find((tab) => tab.id === activeView)?.empty || "暂无消息"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  accountTypeFilter,
  setAccountTypeFilter,
  registeredFrom,
  setRegisteredFrom,
  registeredTo,
  setRegisteredTo,
}: {
  query: string;
  setQuery: (query: string) => void;
  statusFilter: "all" | Status;
  setStatusFilter: (status: "all" | Status) => void;
  accountTypeFilter: "all" | "regular" | "test";
  setAccountTypeFilter: (value: "all" | "regular" | "test") => void;
  registeredFrom: string;
  setRegisteredFrom: (value: string) => void;
  registeredTo: string;
  setRegisteredTo: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索账号名称或邮箱"
          className="border-white/10 bg-slate-950/40 pl-9 text-slate-100 placeholder:text-slate-500"
        />
      </div>
      <label className="grid gap-1 text-xs text-slate-400"><span>注册开始</span><Input type="date" value={registeredFrom} onChange={(event) => setRegisteredFrom(event.target.value)} aria-label="注册开始日期" className="border-white/10 bg-slate-950/40" /></label>
      <label className="grid gap-1 text-xs text-slate-400"><span>注册结束</span><Input type="date" value={registeredTo} onChange={(event) => setRegisteredTo(event.target.value)} aria-label="注册结束日期" className="border-white/10 bg-slate-950/40" /></label>
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
        {[
          ["all", "全部类型"],
          ["test", "测试账号"],
          ["regular", "普通账号"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              "rounded-md border px-3 py-2 text-sm transition",
              accountTypeFilter === value
                ? "border-cyan-300 bg-cyan-300 text-slate-950"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/8"
            )}
            onClick={() => setAccountTypeFilter(value as "all" | "regular" | "test")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrderFilters({
  query,
  setQuery,
  paidFrom,
  setPaidFrom,
  paidTo,
  setPaidTo,
  amountMin,
  setAmountMin,
  amountMax,
  setAmountMax,
}: {
  query: string;
  setQuery: (value: string) => void;
  paidFrom: string;
  setPaidFrom: (value: string) => void;
  paidTo: string;
  setPaidTo: (value: string) => void;
  amountMin: string;
  setAmountMin: (value: string) => void;
  amountMax: string;
  setAmountMax: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 md:grid-cols-2 xl:grid-cols-5">
      <div className="relative xl:col-span-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索订单号或账号名称" className="border-white/10 bg-slate-950/40 pl-9" />
      </div>
      <label className="grid gap-1 text-xs text-slate-400"><span>支付开始</span><Input type="date" value={paidFrom} onChange={(event) => setPaidFrom(event.target.value)} aria-label="支付开始日期" className="border-white/10 bg-slate-950/40" /></label>
      <label className="grid gap-1 text-xs text-slate-400"><span>支付结束</span><Input type="date" value={paidTo} onChange={(event) => setPaidTo(event.target.value)} aria-label="支付结束日期" className="border-white/10 bg-slate-950/40" /></label>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" min="0" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} placeholder="最低金额" className="border-white/10 bg-slate-950/40" />
        <Input type="number" min="0" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} placeholder="最高金额" className="border-white/10 bg-slate-950/40" />
      </div>
    </div>
  );
}

function PagePaginator<T>({
  items,
  page,
  onPageChange,
}: {
  items: T[];
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (items.length <= PAGE_SIZE) return null;

  return (
    <div className="flex justify-end gap-2 pt-3">
      <button
        type="button"
        className="rounded-md border border-white/12 px-2 py-1 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </button>
      <span className="flex items-center px-1 text-xs text-slate-500">{page} / {totalPages}</span>
      <button
        type="button"
        className="rounded-md border border-white/12 px-2 py-1 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}

function OrdersTable({
  orders,
  users,
  selectedOrderId,
  onSelect,
}: {
  orders: Order[];
  users: AdminUser[];
  selectedOrderId: string;
  onSelect: (orderId: string) => void;
}) {
  const userById = new Map(users.map((user) => [user.id, user]));
  const userByName = new Map(users.map((user) => [user.name, user]));
  const getRemainingCredits = (order: Order) => {
    const user = (order.userId ? userById.get(order.userId) : undefined) || userByName.get(order.user);
    return typeof user?.credits === "number" ? formatCredits(user.credits) : "未关联";
  };

  return (
    <Table className="min-w-[880px]">
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead>订单</TableHead>
          <TableHead>用户</TableHead>
          <TableHead>剩余积分</TableHead>
          <TableHead>渠道</TableHead>
          <TableHead>金额</TableHead>
          <TableHead>购买积分</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>对账</TableHead>
          <TableHead>支付时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length ? (
          orders.map((order) => (
            <TableRow
              key={order.id}
              className={cn("cursor-pointer border-white/8 hover:bg-white/[0.04]", selectedOrderId === order.id && "bg-cyan-300/10")}
              onClick={() => onSelect(order.id)}
            >
              <TableCell className="font-mono text-xs text-slate-400">{order.id}</TableCell>
              <TableCell>{order.user}</TableCell>
              <TableCell>{getRemainingCredits(order)}</TableCell>
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
              <TableCell className="min-w-[170px] text-xs text-slate-400">
                <div className="text-slate-200">支付：{formatExactOrderTime(order.paidAt)}</div>
                <div className="mt-1">下单：{formatExactOrderTime(order.createdAt, "未提供精确时间")}</div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow className="border-white/8 hover:bg-transparent">
            <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">
              暂无真实订单数据
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function ExternalCollectionPanel({
  form,
  selectedUserName,
  onChange,
  onSubmit,
}: {
  form: {
    amount: string;
    expectedCredits: string;
    packageName: string;
    collector: string;
    merchantOrderId: string;
    providerTransactionId: string;
    note: string;
    issueCredits: boolean;
  };
  selectedUserName: string;
  onChange: (key: keyof typeof form, value: string | boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="min-w-0 rounded-md border border-cyan-300/20 bg-cyan-300/[0.045] p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">登记接口方代收记录</h3>
          <p className="mt-1 break-words text-xs leading-5 text-slate-400">
            用于记录钱款进入第三方商户账户的事实，关联当前选中用户：{selectedUserName}。
          </p>
        </div>
        <Badge className="w-fit shrink-0 border-cyan-300/20 bg-cyan-300/10 text-cyan-100">留痕</Badge>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <Input value={form.amount} onChange={(event) => onChange("amount", event.target.value)} placeholder="收款金额，例如 20" className="border-white/12 bg-slate-950/40" />
        <Input value={form.expectedCredits} onChange={(event) => onChange("expectedCredits", event.target.value)} placeholder="应发积分，可先填 0" className="border-white/12 bg-slate-950/40" />
        <Input value={form.collector} onChange={(event) => onChange("collector", event.target.value)} placeholder="代收方，例如 AI 接口方商户" className="border-white/12 bg-slate-950/40" />
        <Input value={form.packageName} onChange={(event) => onChange("packageName", event.target.value)} placeholder="订单说明" className="border-white/12 bg-slate-950/40" />
        <Input value={form.merchantOrderId} onChange={(event) => onChange("merchantOrderId", event.target.value)} placeholder="商户订单号 out_trade_no，可后补" className="border-white/12 bg-slate-950/40" />
        <Input value={form.providerTransactionId} onChange={(event) => onChange("providerTransactionId", event.target.value)} placeholder="第三方交易号 transaction_id，可后补" className="border-white/12 bg-slate-950/40" />
      </div>
      <Input value={form.note} onChange={(event) => onChange("note", event.target.value)} placeholder="备注，例如：接口方确认收到 20 元测试付款" className="mt-3 border-white/12 bg-slate-950/40" />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={form.issueCredits}
            onChange={(event) => onChange("issueCredits", event.target.checked)}
            className="size-4 rounded border-white/20 bg-slate-950"
          />
          登记后立即发放积分
        </label>
        <Button type="button" onClick={onSubmit} className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 sm:w-auto">
          登记收款留痕
        </Button>
      </div>
    </div>
  );
}

function AccountDetailDrawer({
  open,
  detail,
  fallbackUser,
  selectedOrderId,
  note,
  creditDelta,
  setCreditDelta,
  onClose,
  onSelectOrder,
  onNoteChange,
  onAddNote,
  onDeleteNote,
  onReissue,
  onRefund,
  onAdjust,
  creditAdjustmentFeedback,
  onDismissCreditAdjustmentFeedback,
  canManageTestAccounts,
  onUpdateTestProfile,
  onCancelTestAccount,
  onUpdateModelAccess,
}: {
  open: boolean;
  detail: AccountDetail | null;
  fallbackUser?: AdminUser;
  selectedOrderId: string;
  note: string;
  creditDelta: number;
  setCreditDelta: (value: number) => void;
  onClose: () => void;
  onSelectOrder: (orderId: string) => void;
  onNoteChange: (value: string) => void;
  onAddNote: () => void;
  onDeleteNote: () => void;
  onReissue: () => void;
  onRefund: () => void;
  onAdjust: (direction: "plus" | "minus") => void;
  creditAdjustmentFeedback: CreditAdjustmentFeedback | null;
  onDismissCreditAdjustmentFeedback: () => void;
  canManageTestAccounts: boolean;
  onUpdateTestProfile: (userId: string, payload: Record<string, unknown>) => void;
  onCancelTestAccount: (userId: string) => void;
  onUpdateModelAccess: (userId: string, allowedAiModels: string[]) => void;
}) {
  const user = detail?.user || fallbackUser;
  const selectedOrder = detail?.orders.find((order) => order.id === selectedOrderId) || detail?.orders[0];
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [paymentEventsExpanded, setPaymentEventsExpanded] = useState(false);
  const [drawerSectionExpanded, setDrawerSectionExpanded] = useState({
    testProfile: false,
    modelAccess: false,
    aiUsage: false,
    creditAdjustment: true,
    orderNotes: true,
    currentOrder: true,
    creditLedger: false,
    processingNotes: false,
    timeline: false,
  });
  const [orderTimeFilter, setOrderTimeFilter] = useState("all");
  const [orderUserIdFilter, setOrderUserIdFilter] = useState("");
  const [paymentTimeFilter, setPaymentTimeFilter] = useState("all");
  const [paymentUserIdFilter, setPaymentUserIdFilter] = useState("");
  const [noteDetail, setNoteDetail] = useState<string | null>(null);
  const [testCreditDelta, setTestCreditDelta] = useState("0");
  const [testDailyLimit, setTestDailyLimit] = useState("");
  const [testExpiresAt, setTestExpiresAt] = useState("");
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [allowedAiModels, setAllowedAiModels] = useState<string[]>([]);
  const visibleAiModels = useMemo(() => [...IMAGE_AI_MODELS, ...TEXT_AI_MODELS], []);
  const allowedAiModelsKey = user?.allowedAiModels?.join("|");
  useEffect(() => {
    const allowed = user?.allowedAiModels;
    setAllowedAiModels(
      allowed === undefined
        ? visibleAiModels.map(model => model.id)
        : visibleAiModels.filter(model => allowed.includes(model.id)).map(model => model.id),
    );
  }, [allowedAiModelsKey, user?.id, visibleAiModels]);
  const selectedOrderNotes = selectedOrder
    ? (detail?.notes || []).filter((item) => item.orderId === selectedOrder.id).slice(0, 1)
    : [];
  const filteredAccountOrders = (detail?.orders || []).filter((order) => (
    matchesDrawerTimeFilter(order.createdAt, orderTimeFilter)
    && (!orderUserIdFilter || (order.userId || "").includes(orderUserIdFilter))
  ));
  const filteredPaymentEvents = (detail?.paymentEvents || []).filter((event) => (
    matchesDrawerTimeFilter(event.createdAt, paymentTimeFilter)
    && (!paymentUserIdFilter || (user?.id || "").includes(paymentUserIdFilter))
  ));

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 w-full max-w-[380px]">
      <aside className="pointer-events-auto flex h-full w-full flex-col border-l border-white/10 bg-[#0b1020] shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">账户详情</div>
            <h2 className="mt-1 truncate text-lg font-semibold">{user?.name || "加载中"}</h2>
            <p className="mt-1 break-all text-xs text-slate-500">{user?.email || "正在读取账户聚合数据..."}</p>
          </div>
          <Button variant="outline" size="sm" className="border-white/12 bg-white/5 text-slate-100" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {user ? (
            <div className="flex flex-col gap-5">
              <div className="order-0 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <InfoCell label="套餐" value={user.plan} />
                <InfoCell label="状态" value={statusLabel(user.status)} />
                <InfoCell label="积分余额" value={formatCredits(user.credits)} />
                <InfoCell label="累计支付金额" value={formatCurrency(user.spent)} />
              </div>

              {user.accountType === "test" && user.testProfile && (
                <CollapsibleDrawerSection
                  title="测试账号档案"
                  description={`今日已预约 ${formatCredits(user.testProfile.reservedCredits)} / 日限额 ${formatCredits(user.testProfile.dailyCreditLimit)}；到期后服务端将阻止所有 AI 请求。`}
                  expanded={drawerSectionExpanded.testProfile}
                  onToggle={() => setDrawerSectionExpanded(current => ({ ...current, testProfile: !current.testProfile }))}
                  className="order-40 border-amber-300/25 bg-amber-300/[0.045]"
                  trailing={<Badge className={statusClass(user.status)}>{user.status === "cancelled" ? "已注销" : "测试中"}</Badge>}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input type="number" value={testCreditDelta} onChange={(event) => setTestCreditDelta(event.target.value)} disabled={!canManageTestAccounts} placeholder="积分增减" className="border-white/12 bg-slate-950/40" />
                    <Input type="number" min="1" value={testDailyLimit || String(user.testProfile.dailyCreditLimit)} onChange={(event) => setTestDailyLimit(event.target.value)} disabled={!canManageTestAccounts} placeholder="每日 AI 积分上限" className="border-white/12 bg-slate-950/40" />
                    <Input type="datetime-local" value={testExpiresAt || user.testProfile.expiresAt.slice(0, 16)} onChange={(event) => setTestExpiresAt(event.target.value)} disabled={!canManageTestAccounts} className="border-white/12 bg-slate-950/40" />
                  </div>
                  {canManageTestAccounts && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button type="button" className="bg-amber-300 text-slate-950 hover:bg-amber-200" onClick={() => onUpdateTestProfile(user.id, {
                        creditDelta: Number(testCreditDelta || 0),
                        dailyCreditLimit: Number(testDailyLimit || user.testProfile!.dailyCreditLimit),
                        expiresAt: testExpiresAt ? new Date(testExpiresAt).toISOString() : user.testProfile!.expiresAt,
                      })}>保存测试额度</Button>
                      <label className="flex items-center gap-2 text-xs text-rose-100"><input type="checkbox" checked={cancelConfirmed} onChange={(event) => setCancelConfirmed(event.target.checked)} /> 我确认注销不可恢复</label>
                      <Button type="button" variant="outline" disabled={!cancelConfirmed} className="border-rose-300/35 bg-rose-300/10 text-rose-100 hover:bg-rose-300/20" onClick={() => onCancelTestAccount(user.id)}>注销测试账号</Button>
                    </div>
                  )}
                </CollapsibleDrawerSection>
              )}

              <CollapsibleDrawerSection
                title="模型权限"
                description="仅控制前端模型选择器中的模型，不影响 PicWish、BKEEL 等固定功能服务。"
                expanded={drawerSectionExpanded.modelAccess}
                onToggle={() => setDrawerSectionExpanded(current => ({ ...current, modelAccess: !current.modelAccess }))}
                className="order-50 border-violet-300/20 bg-violet-300/[0.045]"
                trailing={<Badge className="border-violet-300/30 bg-violet-300/10 text-violet-100">{allowedAiModels.length} / {visibleAiModels.length} 已启用</Badge>}
              >
                {(["图像模型", "对话模型"] as const).map((title, index) => {
                  const models = index === 0 ? IMAGE_AI_MODELS : TEXT_AI_MODELS;
                  return (
                    <div key={title} className="mt-3">
                      <div className="mb-2 text-xs font-medium text-slate-300">{title}</div>
                      <div className="space-y-2">
                        {models.map(model => {
                          const enabled = allowedAiModels.includes(model.id);
                          return (
                            <label key={model.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950/30 px-3 py-2">
                              <span className="min-w-0">
                                <span className="block text-sm text-slate-100">{model.label}</span>
                                <span className="block font-mono text-xs text-slate-500">{model.id}</span>
                              </span>
                              <Switch
                                checked={enabled}
                                disabled={!canManageTestAccounts}
                                onCheckedChange={(checked) => setAllowedAiModels(current => checked
                                  ? Array.from(new Set([...current, model.id]))
                                  : current.filter(id => id !== model.id))}
                                aria-label={`${model.label} 模型权限`}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {canManageTestAccounts && (
                  <div className="mt-3 flex justify-end">
                    <Button type="button" className="bg-violet-200 text-slate-950 hover:bg-violet-100" onClick={() => onUpdateModelAccess(user.id, allowedAiModels)}>保存模型权限</Button>
                  </div>
                )}
              </CollapsibleDrawerSection>

              {(detail?.aiTasks || []).length > 0 && (
                <MiniSection
                  title="AI 使用记录"
                  rows={(detail?.aiTasks || []).map((task) => ({
                    title: `${task.capability} · ${task.status === "success" ? "成功" : "失败"}`,
                    meta: `${task.model} · ${formatExactOrderTime(task.createdAt, "未提供精确时间")} · ${task.usage?.usageKind === "tokens"
                      ? `Token ${task.usage.promptTokens ?? "-"}/${task.usage.completionTokens ?? "-"}`
                      : task.usage?.usageKind === "images"
                        ? `图片 ${task.usage.imageCount ?? 0} 张`
                        : "上游未提供 Token"}`,
                    value: `${formatCredits(task.chargedCredits)} 积分 · ${task.providerTaskId || task.backendTaskId}`,
                  }))}
                empty="该账户暂无 AI 使用记录"
                expanded={drawerSectionExpanded.aiUsage}
                onToggle={() => setDrawerSectionExpanded(current => ({ ...current, aiUsage: !current.aiUsage }))}
                className="order-60"
              />
              )}

              <CollapsibleDrawerSection
                title="人工积分调整"
                description="调整会进入账户积分流水和审计日志。"
                expanded={drawerSectionExpanded.creditAdjustment}
                onToggle={() => setDrawerSectionExpanded(current => ({ ...current, creditAdjustment: !current.creditAdjustment }))}
                className="order-10 border-white/10 bg-white/[0.035]"
                trailing={<Badge className={statusClass(user.risk)}>{user.risk}</Badge>}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    type="number"
                    value={creditDelta}
                    onChange={(event) => setCreditDelta(Number(event.target.value))}
                    className="border-white/10 bg-slate-950/40 text-slate-100"
                  />
                  <Button className="bg-emerald-300 text-slate-950 hover:bg-emerald-200" onClick={() => onAdjust("plus")}>
                    <Plus className="size-4" />
                    增加
                  </Button>
                  <Button variant="outline" className="border-white/12 bg-white/5 text-slate-100" onClick={() => onAdjust("minus")}>
                    <X className="size-4" />
                    扣减
                  </Button>
                </div>
                {creditAdjustmentFeedback && (
                  <div className={cn(
                    "mt-1.5 flex items-start justify-between gap-3 border px-3 py-2 text-xs",
                    creditAdjustmentFeedback.tone === "success"
                      ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                      : "border-rose-300/35 bg-rose-300/10 text-rose-100",
                  )} role="status">
                    <div className="min-w-0">
                      <div className="font-medium">积分调整完成</div>
                      <div className="mt-1 break-words leading-5">{creditAdjustmentFeedback.message}</div>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="shrink-0 border-current/40 bg-transparent" onClick={onDismissCreditAdjustmentFeedback}>
                      确定
                    </Button>
                  </div>
                )}
              </CollapsibleDrawerSection>

              {selectedOrder && (
                <CollapsibleDrawerSection
                  title="订单备注"
                  description={`当前订单：${selectedOrder.id}`}
                  expanded={drawerSectionExpanded.orderNotes}
                  onToggle={() => setDrawerSectionExpanded(current => ({ ...current, orderNotes: !current.orderNotes }))}
                  className="order-20 border-cyan-300/20 bg-cyan-300/[0.045]"
                  trailing={<div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/20" onClick={onAddNote} disabled={!note.trim()}>
                        {selectedOrderNotes.length ? "覆盖保存备注" : "保存备注"}
                      </Button>
                      {selectedOrderNotes.length > 0 && (
                        <Button variant="outline" className="border-rose-300/30 bg-rose-300/10 text-rose-100 hover:bg-rose-300/20" onClick={onDeleteNote}>
                          删除备注
                        </Button>
                      )}
                    </div>}
                >
                  <Input
                    value={note}
                    onChange={(event) => onNoteChange(event.target.value)}
                    placeholder="为当前订单添加备注"
                    className="mt-3 border-white/12 bg-slate-950/40"
                  />
                  <div className="mt-3 border-t border-cyan-300/15 pt-3">
                    <div className="text-xs font-medium text-cyan-100">当前订单已保存备注</div>
                    {selectedOrderNotes.length ? (
                      <div className="mt-2 space-y-2">
                        {selectedOrderNotes.map((item) => (
                          <button key={item.id} type="button" className="w-full rounded-md border border-white/8 bg-slate-950/30 px-3 py-2 text-left text-xs" onDoubleClick={() => setNoteDetail(item.content)} title="双击查看完整备注">
                            <div className="max-h-10 overflow-hidden break-words text-slate-200">{item.content}</div>
                            <div className="mt-1 text-slate-500">{item.actorName} · {item.createdAt}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">当前订单尚无已保存备注。</div>
                    )}
                  </div>
                </CollapsibleDrawerSection>
              )}

              {selectedOrder ? (
                <CollapsibleDrawerSection
                  title={`当前处理订单 · ${selectedOrder.packageName || "订单详情"}`}
                  description={selectedOrder.id}
                  expanded={drawerSectionExpanded.currentOrder}
                  onToggle={() => setDrawerSectionExpanded(current => ({ ...current, currentOrder: !current.currentOrder }))}
                  className="order-30 border-cyan-300/20 bg-cyan-300/[0.045]"
                  trailing={<select
                    value={selectedOrder.id}
                    onChange={(event) => onSelectOrder(event.target.value)}
                    className="h-9 rounded-md border border-white/12 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none"
                  >
                    {(detail?.orders || []).map((order) => (
                      <option key={order.id} value={order.id}>{order.id}</option>
                    ))}
                  </select>}
                >
                  <div>
                    <div className="min-w-0">
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge className={statusClass(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
                        <Badge className={statusClass(selectedOrder.reconciliation || "matched")}>
                          {selectedOrder.reconciliation === "mismatch" ? "对账异常" : selectedOrder.reconciliation === "pending" ? "待对账" : "对账一致"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 text-xs sm:grid-cols-2">
                    <InfoLine label="支付渠道" value={selectedOrder.channel} />
                    <InfoLine label="下单时间" value={formatExactOrderTime(selectedOrder.createdAt, "未提供精确时间")} mono />
                    <InfoLine label="支付时间" value={formatExactOrderTime(selectedOrder.paidAt)} mono />
                    <InfoLine label="第三方交易号" value={selectedOrder.providerTransactionId || "待回调/待查询"} mono />
                    <InfoLine label="实发积分" value={formatCredits(selectedOrder.issuedCredits || 0)} />
                    <InfoLine label="退款/扣回" value={`${formatCurrency(selectedOrder.refundAmount || 0)} / ${formatCredits(selectedOrder.refundedCredits || 0)} 积分`} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" className="border-amber-300/30 bg-amber-300/10 text-amber-100" onClick={onReissue} disabled={selectedOrder.status === "paid"}>
                      人工补单
                    </Button>
                    <Button variant="outline" className="border-rose-300/30 bg-rose-300/10 text-rose-100" onClick={onRefund} disabled={selectedOrder.status !== "paid"}>
                      标记退款
                    </Button>
                  </div>
                </CollapsibleDrawerSection>
              ) : (
                <div className="order-30"><EmptyPanel title="暂无可处理订单" body="该账户还没有支付订单，无法执行备注、补单或退款操作。" /></div>
              )}

              <MiniSection
                title="账户订单"
                rows={filteredAccountOrders.map((order) => ({
                  title: `${order.packageName || "订单"} · ${statusLabel(order.status)}`,
                  meta: `${order.id} · ${order.channel} · 下单：${formatExactOrderTime(order.createdAt, "未提供精确时间")} · 支付：${formatExactOrderTime(order.paidAt)}`,
                  value: formatCurrency(order.amount),
                }))}
                empty="该账户暂无订单"
                expanded={ordersExpanded}
                onToggle={() => setOrdersExpanded((current) => !current)}
                collapseLabel="收起订单"
                expandLabel="展开订单"
                controls={<DrawerHistoryFilters label="账户订单时间" timeFilter={orderTimeFilter} onTimeFilterChange={setOrderTimeFilter} userIdFilter={orderUserIdFilter} onUserIdFilterChange={setOrderUserIdFilter} />}
                className="order-70"
              />

              <MiniSection
                title="支付事件"
                rows={filteredPaymentEvents.map((item) => ({
                  title: `${item.orderId} · ${item.type} · ${item.status}`,
                  meta: `${item.message} · ${item.createdAt}`,
                  value: item.providerTransactionId || "N/A",
                }))}
                empty="该账户暂无第三方支付事件"
                expanded={paymentEventsExpanded}
                onToggle={() => setPaymentEventsExpanded((current) => !current)}
                collapseLabel="收起支付流"
                expandLabel="展开支付流"
                controls={<DrawerHistoryFilters label="支付流时间" timeFilter={paymentTimeFilter} onTimeFilterChange={setPaymentTimeFilter} userIdFilter={paymentUserIdFilter} onUserIdFilterChange={setPaymentUserIdFilter} />}
                className="order-80"
              />
              <MiniSection
                title="积分流水"
                rows={(detail?.creditEntries || []).map((item) => ({
                  title: `${item.type} · ${item.delta > 0 ? "+" : ""}${item.delta}`,
                  meta: `${item.source} · ${item.reason} · ${item.createdAt}`,
                  value: item.operator,
                }))}
                empty="该账户暂无积分流水"
                expanded={drawerSectionExpanded.creditLedger}
                onToggle={() => setDrawerSectionExpanded(current => ({ ...current, creditLedger: !current.creditLedger }))}
                className="order-90"
              />
              <MiniSection
                title="处理备注"
                rows={(detail?.notes || []).map((item) => ({
                  title: `${item.orderId} · ${item.actorName}`,
                  meta: item.content,
                  value: item.createdAt,
                }))}
                empty="该账户暂无处理备注"
                expanded={drawerSectionExpanded.processingNotes}
                onToggle={() => setDrawerSectionExpanded(current => ({ ...current, processingNotes: !current.processingNotes }))}
                className="order-100"
              />
              <MiniSection
                title="对账时间线"
                rows={(detail?.timeline || []).slice(0, 16).map((item) => ({
                  title: `${item.orderId || "账户"} · ${item.type}`,
                  meta: item.message,
                  value: item.createdAt,
                }))}
                empty="该账户暂无对账时间线"
                expanded={drawerSectionExpanded.timeline}
                onToggle={() => setDrawerSectionExpanded(current => ({ ...current, timeline: !current.timeline }))}
                className="order-110"
              />
            </div>
          ) : (
            <EmptyPanel title="正在加载账户详情" body="账户聚合数据会从 /api/admin/users/:id/detail 读取。" />
          )}
        </div>
        {noteDetail && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label="完整订单备注">
            <div className="w-full max-w-sm rounded-md border border-cyan-300/25 bg-[#111a2e] p-4 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-cyan-100">完整订单备注</div>
                <Button type="button" size="sm" variant="outline" className="border-white/12 bg-white/5" onClick={() => setNoteDetail(null)}>
                  确定
                </Button>
              </div>
              <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{noteDetail}</div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-white/8 bg-slate-950/30 p-3">
      <div className="text-slate-500">{label}</div>
      <div className={cn("mt-1 break-all text-slate-100", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function CollapsibleDrawerSection({
  title,
  description,
  expanded,
  onToggle,
  children,
  trailing,
  className,
}: {
  title: string;
  description?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {description && <p className="mt-1 break-words text-xs text-slate-400">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {trailing}
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
            onClick={onToggle}
            aria-label={expanded ? `收起${title}` : `展开${title}`}
            title={expanded ? "收起" : "展开"}
          >
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      </div>
      {expanded && <div className="mt-3">{children}</div>}
    </section>
  );
}

function MiniSection({
  title,
  rows,
  empty,
  controls,
  expanded = true,
  onToggle,
  collapseLabel,
  expandLabel,
  className,
}: {
  title: string;
  rows: Array<{ title: string; meta: string; value: string }>;
  empty: string;
  controls?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  collapseLabel?: string;
  expandLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-md border border-white/8 bg-slate-950/25 p-3", className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {controls}
          {onToggle && (
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md border border-white/12 bg-white/5 text-cyan-100 hover:bg-white/10"
              onClick={onToggle}
              aria-label={expanded ? (collapseLabel || `收起${title}`) : (expandLabel || `展开${title}`)}
              title={expanded ? (collapseLabel || "收起") : (expandLabel || "展开")}
            >
              <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {expanded && (rows.length ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.title}-${index}`} className="grid min-w-0 gap-2 rounded-md bg-white/[0.03] p-2 text-xs lg:grid-cols-[minmax(0,1fr)_auto] 2xl:grid-cols-1 min-[1680px]:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="font-medium text-slate-200">{row.title}</div>
                <div className="mt-1 text-slate-500">{row.meta}</div>
              </div>
              <div className="break-all font-mono text-slate-400">{row.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-500">{empty}</div>
      ))}
    </div>
  );
}

function DrawerHistoryFilters({
  label,
  timeFilter,
  onTimeFilterChange,
  userIdFilter,
  onUserIdFilterChange,
}: {
  label: string;
  timeFilter: string;
  onTimeFilterChange: (value: string) => void;
  userIdFilter: string;
  onUserIdFilterChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-1 text-[11px] text-slate-500">
        {label}
        <select value={timeFilter} onChange={(event) => onTimeFilterChange(event.target.value)} className="h-7 rounded-md border border-white/12 bg-slate-950/70 px-1 text-[11px] text-slate-200">
          <option value="all">全部</option>
          <option value="24h">24 小时</option>
          <option value="7d">7 天</option>
          <option value="30d">30 天</option>
        </select>
      </label>
      <Input value={userIdFilter} onChange={(event) => onUserIdFilterChange(event.target.value)} placeholder="用户 ID" className="h-7 w-24 border-white/12 bg-slate-950/70 px-2 text-[11px]" />
    </div>
  );
}

function productionCheckById(productionChecks: ProductionCheck[], id: string) {
  return productionChecks.find((check) => check.id === id);
}

function ProductionCheckPanel({
  check,
  title,
}: {
  check: ProductionCheck;
  title: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{check.summary}</p>
        </div>
        <SlidersHorizontal className="size-4 text-slate-500" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">{check.title}</div>
        <Badge className={statusClass(check.status === "ready" ? "normal" : check.status === "blocked" ? "blocked" : "watch")}>
          {check.status === "ready" ? "正常" : check.status === "blocked" ? "需处理" : "观察"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(check.metrics).slice(0, 4).map(([key, value]) => (
          <div key={key} className="rounded-md border border-white/8 bg-slate-950/30 px-2 py-1.5">
            <div className="text-[10px] text-slate-500">{check.metricLabels?.[key] || key}</div>
            <div className="mt-0.5 text-xs font-medium text-slate-200">{formatCredits(value)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {check.evidence.slice(0, 3).join(" · ")}
      </div>
    </div>
  );
}

function CapabilityMarginAnalysis({
  filters,
  onFiltersChange,
  data,
  loading,
  error,
  modelOptions,
}: {
  filters: CapabilityMarginFilters;
  onFiltersChange: (filters: CapabilityMarginFilters) => void;
  data: CapabilityMarginData | null;
  loading: boolean;
  error: string;
  modelOptions: string[];
}) {
  const updateFilter = <Key extends keyof CapabilityMarginFilters>(key: Key, value: CapabilityMarginFilters[Key]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h2 className="text-base font-semibold">按能力统计毛利</h2>
        <p className="mt-1 text-sm text-slate-400">筛选条件直接在服务端计算任务明细、能力汇总、模型汇总和指标。</p>
      </div>
      <div className="grid gap-3 border-y border-white/10 py-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs text-slate-400">
          <span>时间范围</span>
          <select
            aria-label="时间范围"
            value={filters.time}
            onChange={(event) => updateFilter("time", event.target.value as CapabilityMarginFilters["time"])}
            className="h-9 rounded-md border border-white/10 bg-slate-950/40 px-2 text-sm text-slate-100 outline-none"
          >
            <option value="1d">最近一天</option>
            <option value="3d">近3天</option>
            <option value="7d">近7天</option>
            <option value="15d">近半个月</option>
            <option value="30d">近一个月</option>
            <option value="90d">近三个月</option>
            <option value="180d">近半年</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>毛利区间</span>
          <select
            aria-label="毛利区间"
            value={filters.grossMarginBand}
            onChange={(event) => updateFilter("grossMarginBand", event.target.value as CapabilityMarginFilters["grossMarginBand"])}
            className="h-9 rounded-md border border-white/10 bg-slate-950/40 px-2 text-sm text-slate-100 outline-none"
          >
            <option value="">全部毛利</option>
            <option value="negative">负毛利</option>
            <option value="0-30">0% - 30%</option>
            <option value="30-60">30% - 60%</option>
            <option value=">=60">60% 及以上</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>模型</span>
          <select
            aria-label="模型"
            value={filters.model}
            onChange={(event) => updateFilter("model", event.target.value)}
            className="h-9 rounded-md border border-white/10 bg-slate-950/40 px-2 text-sm text-slate-100 outline-none"
          >
            <option value="">全部模型</option>
            {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>账号</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              aria-label="搜索账号"
              value={filters.account}
              onChange={(event) => updateFilter("account", event.target.value)}
              placeholder="邮箱或用户名"
              className="border-white/10 bg-slate-950/40 pl-9"
            />
          </div>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>最低毛利 (%)</span>
          <Input
            aria-label="最低毛利"
            type="number"
            value={filters.minGrossMargin}
            onChange={(event) => updateFilter("minGrossMargin", event.target.value)}
            placeholder="不限"
            className="border-white/10 bg-slate-950/40"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>最高毛利 (%)</span>
          <Input
            aria-label="最高毛利"
            type="number"
            value={filters.maxGrossMargin}
            onChange={(event) => updateFilter("maxGrossMargin", event.target.value)}
            placeholder="不限"
            className="border-white/10 bg-slate-950/40"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>最低积分</span>
          <Input
            aria-label="最低积分"
            type="number"
            min="0"
            value={filters.minChargedCredits}
            onChange={(event) => updateFilter("minChargedCredits", event.target.value)}
            placeholder="不限"
            className="border-white/10 bg-slate-950/40"
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span>最高积分</span>
          <Input
            aria-label="最高积分"
            type="number"
            min="0"
            value={filters.maxChargedCredits}
            onChange={(event) => updateFilter("maxChargedCredits", event.target.value)}
            placeholder="不限"
            className="border-white/10 bg-slate-950/40"
          />
        </label>
      </div>

      {loading ? (
        <div role="status" className="py-8 text-center text-sm text-slate-400">正在加载筛选后的毛利数据...</div>
      ) : error ? (
        <div role="alert" className="border-y border-rose-400/30 py-4 text-sm text-rose-200">毛利分析加载失败：{error}</div>
      ) : !data ? (
        <EmptyPanel title="暂无毛利分析数据" body="筛选结果加载后会在这里展示服务端汇总和任务明细。" />
      ) : !data.tasks.length ? (
        <EmptyPanel title="没有匹配的任务" body="请放宽时间、毛利、模型、账号或积分条件后重试。" />
      ) : (
        <>
          <div className="grid gap-3 border-y border-white/10 py-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCell label="任务数" value={`${data.kpis.taskCount}（成功 ${data.kpis.successCount} / 失败 ${data.kpis.failedCount}）`} />
            <InfoCell label="预估成本" value={formatCurrency(data.kpis.estimatedCost)} />
            <InfoCell label="实收积分" value={`${formatCredits(data.kpis.chargedCredits)} 积分`} />
            <InfoCell label="平均毛利" value={`${Math.round(data.kpis.avgGrossMargin * 100)}%`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <DataList
              title="能力汇总"
              description="同一筛选条件下按能力聚合。"
              rows={data.capabilities.map((item) => ({
                title: item.label,
                meta: `任务 ${item.taskCount} · 成功 ${item.successCount} / 失败 ${item.failedCount} · 预估成本 ${formatCurrency(item.estimatedCost)}`,
                value: `${formatCredits(item.chargedCredits)} 积分 · 毛利 ${Math.round(item.avgGrossMargin * 100)}%`,
                icon: Gauge,
              }))}
            />
            <DataList
              title="模型汇总"
              description="同一筛选条件下按模型聚合。"
              rows={data.models.map((item) => ({
                title: item.label,
                meta: `任务 ${item.taskCount} · 成功 ${item.successCount} / 失败 ${item.failedCount} · 预估成本 ${formatCurrency(item.estimatedCost)}`,
                value: `${formatCredits(item.chargedCredits)} 积分 · 毛利 ${Math.round(item.avgGrossMargin * 100)}%`,
                icon: Activity,
              }))}
            />
          </div>
          <div className="min-w-0">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">筛选后的任务明细</h3>
              <p className="mt-1 text-xs text-slate-500">时间保留任务创建时的精确时间。</p>
            </div>
            <div className="overflow-x-auto border-y border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead>账号</TableHead>
                    <TableHead>能力 / 模型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">实收积分</TableHead>
                    <TableHead className="text-right">预估成本</TableHead>
                    <TableHead className="text-right">毛利</TableHead>
                    <TableHead>创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tasks.map((task) => (
                    <TableRow key={task.id} className="border-white/8 hover:bg-white/[0.025]">
                      <TableCell className="min-w-[180px]">
                        <div className="text-sm text-slate-100">{task.userAccount || task.user}</div>
                        <div className="mt-1 text-xs text-slate-500">{task.user}</div>
                        <div className="mt-1 break-all font-mono text-xs text-slate-500">任务 ID：{task.id}</div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="text-sm text-slate-100">{task.capability}</div>
                        <div className="mt-1 break-all font-mono text-xs text-slate-500">{task.model}</div>
                      </TableCell>
                      <TableCell><Badge className={statusClass(task.status)}>{task.status === "success" ? "成功" : "失败"}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-slate-200">{formatCredits(task.chargedCredits)}</TableCell>
                      <TableCell className="text-right font-mono text-slate-200">{formatCurrency(task.estimatedCost)}</TableCell>
                      <TableCell className="text-right font-mono text-slate-200">{Math.round(task.grossMargin * 100)}%</TableCell>
                      <TableCell className="min-w-[180px] font-mono text-xs text-slate-400">{formatExactOrderTime(task.createdAt, "未提供精确时间")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </section>
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

function RiskEventList({
  events,
  onUpdateStatus,
  urgentView = false,
}: {
  events: RiskEvent[];
  onUpdateStatus: (id: string, status: "reviewing" | "mitigated", reason: string) => void;
  urgentView?: boolean;
}) {
  if (!events.length) {
    return <EmptyPanel title="暂无高风险安全事件" body="支付、退款、系统安全和攻击类风险会在这里集中展示。" />;
  }

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{urgentView ? "紧急风险消息" : "高风险安全事件"}</h2>
        <p className="mt-1 text-sm text-slate-400">优先处理支付异常、退款异常、攻击告警和系统安全事件；普通记录不显示待处置标签。</p>
      </div>
      {events.map((event) => {
        const type = classifyHighRiskType(event);
        const typeClass = type === "金额异常"
          ? "border-amber-300/35 bg-amber-300/12 text-amber-100"
          : type === "攻击告警"
            ? "border-rose-300/35 bg-rose-300/12 text-rose-100"
            : type === "支付异常"
              ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100"
              : type === "退款异常"
                ? "border-pink-300/35 bg-pink-300/12 text-pink-100"
                : "border-slate-300/35 bg-slate-300/12 text-slate-100";
        const stateLabel = event.status === "reviewing" ? "处理中" : event.status === "mitigated" ? event.resolution === "已忽略" ? "已忽略" : "已处理" : "待处置";
        return (
          <article
            key={event.id}
            className={cn(
              "min-w-0 rounded-md border p-4",
              event.severity === "high" ? "border-rose-400/30 bg-rose-400/[0.055]" : "border-white/10 bg-white/[0.035]"
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className={typeClass}>{type}</Badge>
                  <Badge className={event.status === "mitigated" ? statusClass("mitigated") : event.status === "reviewing" ? statusClass("reviewing") : statusClass("P0")}>
                    {stateLabel}
                  </Badge>
                </div>
                <h3 className="break-words text-sm font-semibold text-slate-100">{event.title}</h3>
                <p className="mt-2 break-words text-sm leading-6 text-slate-400">{event.detail}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono break-all">目标：{event.target}</span>
                  <span>{event.createdAt}</span>
                  {event.handledBy && <span>处理人：{event.handledBy}</span>}
                </div>
                {event.status === "mitigated" && event.resolution && (
                  <div className="mt-3 text-xs text-emerald-200">处理结果：{event.resolution}{event.handledAt ? ` · ${event.handledAt}` : ""}</div>
                )}
              </div>
               {event.status !== "mitigated" && (
                 <div className="flex shrink-0 flex-wrap gap-2">
                   <Button variant="outline" size="sm" className="border-emerald-300/30 bg-emerald-300/10 text-emerald-100" onClick={() => onUpdateStatus(event.id, "mitigated", "已处理")}>
                     已处理
                   </Button>
                   <Button variant="outline" size="sm" className="border-white/12 bg-white/5 text-slate-200" onClick={() => onUpdateStatus(event.id, "mitigated", "已忽略")}>
                     忽略
                   </Button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-medium leading-5">{value}</div>
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
