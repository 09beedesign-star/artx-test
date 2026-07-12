export type AdminNotificationSection =
  | "overview"
  | "users"
  | "orders"
  | "credits"
  | "feedback"
  | "integrations"
  | "risk"
  | "audit";
export type AdminNotificationTab = "order" | "security" | "voice";

type OrderStatus = "paid" | "pending" | "failed" | "refunded";
type FeedbackStatus = "new" | "processing" | "waiting_user" | "resolved" | "closed";
type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "支付" | "报错" | "接口" | "积分" | "风控";

export type AdminNotificationItem = {
  id: string;
  tab: AdminNotificationTab;
  label: string;
  title: string;
  detail: string;
  time: string;
  severity: AlertSeverity;
  unread: boolean;
  targetSection: AdminNotificationSection;
  targetId?: string;
  attachments?: Array<{
    name?: string;
    src: string;
    width?: number;
    height?: number;
    mimeType?: string;
    size?: number;
  }>;
};

type NotificationOrder = {
  id: string;
  user: string;
  channel: string;
  amount: number;
  credits: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  event?: string;
  reconciliation?: "matched" | "pending" | "mismatch";
  notificationReadAt?: string;
  notificationDismissedAt?: string;
};

type NotificationAlert = {
  id: string;
  category: AlertCategory;
  title: string;
  detail: string;
  severity: AlertSeverity;
  time: string;
  owner: string;
  unread: boolean;
  linkedSection?: AdminNotificationSection;
  notificationDismissedAt?: string;
};

type NotificationFeedback = {
  id: string;
  user: string;
  title: string;
  module: string;
  status: FeedbackStatus;
  priority: "P0" | "P1" | "P2";
  createdAt: string;
  linkedOrderId?: string;
  attachments?: Array<{
    name?: string;
    src: string;
    width?: number;
    height?: number;
    mimeType?: string;
    size?: number;
  }>;
  notificationReadAt?: string;
  notificationDismissedAt?: string;
};

type NotificationRiskEvent = {
  id: string;
  title: string;
  detail: string;
  status: string;
  severity: "high" | "medium" | "low";
  target: string;
  createdAt: string;
  notificationReadAt?: string;
  notificationDismissedAt?: string;
};

export type AdminNotificationInput = {
  orders: NotificationOrder[];
  alerts: NotificationAlert[];
  feedback: NotificationFeedback[];
  riskEvents: NotificationRiskEvent[];
};

export type AdminNotificationGroups = Record<AdminNotificationTab, AdminNotificationItem[]>;

const orderStatusLabels: Record<OrderStatus, string> = {
  paid: "已支付",
  pending: "待确认",
  failed: "失败",
  refunded: "已退款",
};

const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  new: "新反馈",
  processing: "处理中",
  waiting_user: "等待用户",
  resolved: "已解决",
  closed: "已关闭",
};

function parseNotificationTime(value: string) {
  const normalized = value.replace(/\//g, "-").replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByTimeDesc(items: AdminNotificationItem[]) {
  return [...items].sort((left, right) => parseNotificationTime(right.time) - parseNotificationTime(left.time));
}

function orderUnread(order: NotificationOrder) {
  return !order.notificationReadAt && (order.status !== "paid" || order.reconciliation === "pending" || order.reconciliation === "mismatch");
}

function orderSeverity(order: NotificationOrder): AlertSeverity {
  if (order.status === "failed" || order.reconciliation === "mismatch") return "critical";
  if (order.status === "pending" || order.reconciliation === "pending") return "warning";
  return "info";
}

function feedbackUnread(feedback: NotificationFeedback) {
  return !feedback.notificationReadAt && (feedback.status === "new" || feedback.status === "processing" || feedback.status === "waiting_user");
}

function feedbackSeverity(feedback: NotificationFeedback): AlertSeverity {
  if (feedback.priority === "P0") return "critical";
  if (feedback.priority === "P1") return "warning";
  return "info";
}

function riskSeverity(severity: NotificationRiskEvent["severity"]): AlertSeverity {
  return severity === "high" ? "critical" : severity === "medium" ? "warning" : "info";
}

export function buildAdminNotifications(input: AdminNotificationInput): AdminNotificationGroups {
  const order = input.orders
    .filter((item) => !item.notificationDismissedAt)
    .map((item): AdminNotificationItem => ({
      id: `order:${item.id}`,
      tab: "order",
      label: "订单类",
      title: `${item.user} · ${orderStatusLabels[item.status]}`,
      detail: `${item.channel} · 金额 ${item.amount.toLocaleString("zh-CN")} · 积分 ${item.credits.toLocaleString("zh-CN")}${item.event ? ` · ${item.event}` : ""}`,
      time: item.paidAt || item.createdAt,
      severity: orderSeverity(item),
      unread: orderUnread(item),
      targetSection: "orders",
      targetId: item.id,
    }));

  const alertMessages = input.alerts
    .filter((item) => !item.notificationDismissedAt)
    .map((item): AdminNotificationItem => ({
    id: `alert:${item.id}`,
    tab: "security",
    label: item.category === "支付" ? "订单类" : "安全类",
    title: item.title,
    detail: item.detail,
    time: item.time,
    severity: item.severity,
    unread: item.unread,
    targetSection: item.linkedSection || (item.category === "支付" ? "orders" : "risk"),
    }));

  for (const alert of alertMessages) {
    if (alert.label === "订单类") {
      order.push({ ...alert, tab: "order" });
    }
  }

  const security = [
    ...alertMessages.filter((item) => item.label !== "订单类").map((item) => ({ ...item, label: "安全类" })),
    ...input.riskEvents
      .filter((item) => item.status !== "mitigated" && !item.notificationDismissedAt)
      .map((item): AdminNotificationItem => ({
        id: `risk:${item.id}`,
        tab: "security",
        label: "安全类",
        title: item.title,
        detail: item.detail,
        time: item.createdAt,
        severity: riskSeverity(item.severity),
        unread: item.status !== "mitigated" && !item.notificationReadAt,
        targetSection: "risk",
        targetId: item.id,
      })),
  ];

  const voice = input.feedback
    .filter((item) => !item.notificationDismissedAt)
    .map((item): AdminNotificationItem => ({
      id: `feedback:${item.id}`,
      tab: "voice",
      label: "用户之声",
      title: `${item.user} · ${item.title}`,
      detail: `${item.module} · ${feedbackStatusLabels[item.status]} · ${item.priority}${item.attachments?.length ? ` · ${item.attachments.length} 张图片` : ""}`,
      time: item.createdAt,
      severity: feedbackSeverity(item),
      unread: feedbackUnread(item),
      targetSection: item.linkedOrderId ? "orders" : "feedback",
      targetId: item.linkedOrderId || item.id,
      attachments: item.attachments || [],
    }));

  return {
    order: sortByTimeDesc(order),
    security: sortByTimeDesc(security),
    voice: sortByTimeDesc(voice),
  };
}
