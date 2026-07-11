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
import {
  buildAdminNotifications,
  type AdminNotificationGroups,
  type AdminNotificationItem,
  type AdminNotificationTab,
} from "./admin-notifications";
import { getDashboardRiskTarget } from "./admin-dashboard-risk";
import { resolveAdminUploadUrl } from "./admin-upload-url";

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

type AccountDetail = {
  user: AdminUser;
  orders: Order[];
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

function AdminPrototypePage() {
  const { user, changePassword, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [adminData, setAdminData] = useState<AdminState>(() => normalizeAdminPayload({}));
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [creditDelta, setCreditDelta] = useState(500);
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

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Artx-adminn";
    return () => {
      document.title = previousTitle;
    };
  }, []);

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
      if (accountDrawerOpen && selectedUserId) {
        await fetchAccountDetail(selectedUserId);
      }
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
  const urgentAlerts = notificationItems.filter((item) => item.severity === "critical").length;

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
    adminPost("/api/admin/credits/adjust", {
      userId: selectedUser.id,
      delta,
      reason: "后台人工积分调整",
      confirmHighRisk: Math.abs(delta) >= 10000,
    }, `${selectedUser.name} 的积分调整已提交：${creditAmount(delta)} 积分，审计日志已生成。`);
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

  function handleMarkAlertRead(id: string) {
    adminPost(`/api/admin/alerts/${id}/read`, {}, "消息已标记处理，并保留在通知中心供追踪。");
  }

  function handleMarkAllAlertsRead() {
    adminPost("/api/admin/alerts/read-all", {}, "所有敏捷处理消息已标记为已读，操作已进入审计日志。");
  }

  function handleNotificationJump(item: AdminNotificationItem) {
    setAlertsOpen(false);
    if (item.targetSection === "orders" && item.targetId) {
      handleSelectOrder(item.targetId);
      setActiveSection("orders");
      return;
    }
    setActiveSection(item.targetSection);
  }

  function handleMarkNotificationRead(item: AdminNotificationItem) {
    if (!item.id.startsWith("alert:")) return;
    handleMarkAlertRead(item.id.replace(/^alert:/, ""));
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
    <div className="min-h-screen overflow-x-hidden bg-[#0b1020] text-slate-100 lg:h-screen lg:overflow-hidden">
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
                  onToggle={() => setAlertsOpen((value) => !value)}
                  onMarkRead={handleMarkNotificationRead}
                  onMarkAllRead={handleMarkAllAlertsRead}
                  onJumpTo={handleNotificationJump}
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
        onSelectOrder={setSelectedOrderId}
        onNoteChange={setOrderNote}
        onAddNote={handleAddOrderNote}
        onReissue={handleReissueOrder}
        onRefund={handleRefundOrder}
        onAdjust={handleCreditAdjustment}
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
          />
          <Table className="min-w-[780px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>用户</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>后台角色</TableHead>
                <TableHead>积分余额</TableHead>
                <TableHead>累计支付金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近活跃</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length ? (
                filteredUsers.map((user) => (
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
                    <TableCell>{formatCredits(user.credits)}</TableCell>
                    <TableCell>{formatCurrency(user.spent)}</TableCell>
                    <TableCell>
                      <Badge className={cn("w-fit shrink-0", statusClass(user.status))}>{statusLabel(user.status)}</Badge>
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
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    暂无真实用户数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (activeSection === "orders") {
      const paymentCheck = productionCheckById(adminData.productionChecks, "payment_reconciliation");
      return (
        <div className="min-w-0 space-y-5">
          {paymentCheck && <ProductionCheckPanel check={paymentCheck} title="支付对账状态" />}
          <div className="min-w-0 overflow-x-auto rounded-md border border-white/10 bg-white/[0.03]">
            <OrdersTable
              orders={adminData.orders}
              users={adminData.users}
              selectedOrderId={selectedOrder?.id || ""}
              onSelect={handleSelectOrder}
            />
          </div>

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
          description="先覆盖支付金额和积分异常，再扩展到设备、IP、频率限制。"
          rows={[
            ...adminData.riskEvents.map((event) => ({
              title: event.title,
              meta: `${event.detail} · ${event.target}`,
              value: event.status,
              icon: event.severity === "high" ? AlertTriangle : ShieldCheck,
            })),
          ]}
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
  onToggle,
  onMarkRead,
  onMarkAllRead,
  onJumpTo,
}: {
  groups: AdminNotificationGroups;
  open: boolean;
  unreadCount: number;
  urgentCount: number;
  onToggle: () => void;
  onMarkRead: (item: AdminNotificationItem) => void;
  onMarkAllRead: () => void;
  onJumpTo: (item: AdminNotificationItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminNotificationTab>("order");
  const activeItems = groups[activeTab] || [];
  const totalCount = notificationTabs.reduce((sum, tab) => sum + (groups[tab.id]?.length || 0), 0);

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
              <Badge className={urgentCount > 0 ? statusClass("P0") : statusClass("normal")}>
                {urgentCount} 个紧急
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{totalCount} 条消息 · {unreadCount} 条待处理</span>
              <button
                className="text-xs font-medium text-cyan-200 hover:text-cyan-100"
                onClick={onMarkAllRead}
              >
                告警已读
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {notificationTabs.map((tab) => {
                const Icon = tab.icon;
                const count = groups[tab.id]?.length || 0;
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition",
                      isActive
                        ? "border-cyan-300 bg-cyan-300 text-slate-950"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    )}
                    onClick={() => setActiveTab(tab.id)}
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
                        <span className="text-xs text-slate-500">{item.time}</span>
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
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-sm text-slate-500">
                {notificationTabs.find((tab) => tab.id === activeTab)?.empty || "暂无消息"}
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
                <div className="text-slate-200">{order.paidAt ? `支付：${order.paidAt}` : "支付：待支付"}</div>
                <div className="mt-1">下单：{order.createdAt}</div>
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
  onReissue,
  onRefund,
  onAdjust,
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
  onReissue: () => void;
  onRefund: () => void;
  onAdjust: (direction: "plus" | "minus") => void;
}) {
  const user = detail?.user || fallbackUser;
  const selectedOrder = detail?.orders.find((order) => order.id === selectedOrderId) || detail?.orders[0];
  const selectedOrderNotes = selectedOrder
    ? (detail?.notes || []).filter((item) => item.orderId === selectedOrder.id).slice(0, 3)
    : [];

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
            <div className="space-y-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <InfoCell label="套餐" value={user.plan} />
                <InfoCell label="状态" value={statusLabel(user.status)} />
                <InfoCell label="积分余额" value={formatCredits(user.credits)} />
                <InfoCell label="累计支付金额" value={formatCurrency(user.spent)} />
              </div>

              <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">人工积分调整</h3>
                    <p className="mt-1 text-xs text-slate-500">调整会进入账户积分流水和审计日志。</p>
                  </div>
                  <Badge className={statusClass(user.risk)}>{user.risk}</Badge>
                </div>
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
              </div>

              <MiniSection
                title="账户订单"
                rows={(detail?.orders || []).map((order) => ({
                  title: `${order.packageName || "订单"} · ${statusLabel(order.status)}`,
                  meta: `${order.id} · ${order.channel} · 下单：${order.createdAt} · 支付：${order.paidAt || "待支付"}`,
                  value: formatCurrency(order.amount),
                }))}
                empty="该账户暂无订单"
              />

              {selectedOrder ? (
                <div className="rounded-md border border-cyan-300/20 bg-cyan-300/[0.045] p-4">
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-cyan-100/70">{selectedOrder.id}</div>
                      <h3 className="mt-1 text-sm font-semibold text-cyan-50">当前处理订单 · {selectedOrder.packageName || "订单详情"}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge className={statusClass(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
                        <Badge className={statusClass(selectedOrder.reconciliation || "matched")}>
                          {selectedOrder.reconciliation === "mismatch" ? "对账异常" : selectedOrder.reconciliation === "pending" ? "待对账" : "对账一致"}
                        </Badge>
                      </div>
                    </div>
                    <select
                      value={selectedOrder.id}
                      onChange={(event) => onSelectOrder(event.target.value)}
                      className="h-9 rounded-md border border-white/12 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none"
                    >
                      {(detail?.orders || []).map((order) => (
                        <option key={order.id} value={order.id}>{order.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 text-xs sm:grid-cols-2">
                    <InfoLine label="支付渠道" value={selectedOrder.channel} />
                    <InfoLine label="下单时间" value={selectedOrder.createdAt} mono />
                    <InfoLine label="支付时间" value={selectedOrder.paidAt || "待支付"} mono />
                    <InfoLine label="第三方交易号" value={selectedOrder.providerTransactionId || "待回调/待查询"} mono />
                    <InfoLine label="实发积分" value={formatCredits(selectedOrder.issuedCredits || 0)} />
                    <InfoLine label="退款/扣回" value={`${formatCurrency(selectedOrder.refundAmount || 0)} / ${formatCredits(selectedOrder.refundedCredits || 0)} 积分`} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Button variant="outline" className="border-white/15 bg-white/5" onClick={onAddNote} disabled={!note.trim()}>
                      保存备注
                    </Button>
                    <Button variant="outline" className="border-amber-300/30 bg-amber-300/10 text-amber-100" onClick={onReissue} disabled={selectedOrder.status === "paid"}>
                      人工补单
                    </Button>
                    <Button variant="outline" className="border-rose-300/30 bg-rose-300/10 text-rose-100" onClick={onRefund} disabled={selectedOrder.status !== "paid"}>
                      标记退款
                    </Button>
                  </div>
                  <Input
                    value={note}
                    onChange={(event) => onNoteChange(event.target.value)}
                    placeholder="记录处理备注"
                    className="mt-3 border-white/12 bg-slate-950/40"
                  />
                  <div className="mt-3 border-t border-cyan-300/15 pt-3">
                    <div className="text-xs font-medium text-cyan-100">本订单已保存备注</div>
                    {selectedOrderNotes.length ? (
                      <div className="mt-2 space-y-2">
                        {selectedOrderNotes.map((item) => (
                          <div key={item.id} className="rounded-md border border-white/8 bg-slate-950/30 px-3 py-2 text-xs">
                            <div className="break-words text-slate-200">{item.content}</div>
                            <div className="mt-1 text-slate-500">{item.actorName} · {item.createdAt}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">当前订单尚无已保存备注。</div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyPanel title="暂无可处理订单" body="该账户还没有支付订单，无法执行备注、补单或退款操作。" />
              )}

              <MiniSection
                title="支付事件"
                rows={(detail?.paymentEvents || []).map((item) => ({
                  title: `${item.orderId} · ${item.type} · ${item.status}`,
                  meta: `${item.message} · ${item.createdAt}`,
                  value: item.providerTransactionId || "N/A",
                }))}
                empty="该账户暂无第三方支付事件"
              />
              <MiniSection
                title="积分流水"
                rows={(detail?.creditEntries || []).map((item) => ({
                  title: `${item.type} · ${item.delta > 0 ? "+" : ""}${item.delta}`,
                  meta: `${item.source} · ${item.reason} · ${item.createdAt}`,
                  value: item.operator,
                }))}
                empty="该账户暂无积分流水"
              />
              <MiniSection
                title="处理备注"
                rows={(detail?.notes || []).map((item) => ({
                  title: `${item.orderId} · ${item.actorName}`,
                  meta: item.content,
                  value: item.createdAt,
                }))}
                empty="该账户暂无处理备注"
              />
              <MiniSection
                title="对账时间线"
                rows={(detail?.timeline || []).slice(0, 16).map((item) => ({
                  title: `${item.orderId || "账户"} · ${item.type}`,
                  meta: item.message,
                  value: item.createdAt,
                }))}
                empty="该账户暂无对账时间线"
              />
            </div>
          ) : (
            <EmptyPanel title="正在加载账户详情" body="账户聚合数据会从 /api/admin/users/:id/detail 读取。" />
          )}
        </div>
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
    <div className="min-w-0 rounded-md border border-white/8 bg-slate-950/25 p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {rows.length ? (
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
      )}
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
