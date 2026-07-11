import crypto from "node:crypto";
import { accessSync, constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { AI_CREDIT_POLICIES, AI_PLAN_DISCOUNTS, type AiBillingCapability, type AiBillingPolicy, type AiPlanDiscountPolicy } from "../shared/ai-credit-policy";
import { BILLING_CYCLES, MEMBERSHIP_PLANS, getPlanQuote, quoteCreditRecharge } from "../shared/billing-config";
import { getAdminSessionFromAuthorization, listAuthUsers, type PublicAuthUser, updateAuthUserAdmin } from "./auth-store";
import { storeFeedbackImagesForUser, type FeedbackImageInput, type StoredFeedbackImage } from "./local-image-storage";
import { PostgresJsonDocumentStore } from "./postgres-json-store";

type AdminStatus = "normal" | "watch" | "blocked";
type OrderStatus = "paid" | "pending" | "failed" | "refunded";
type FeedbackStatus = "new" | "processing" | "waiting_user" | "resolved" | "closed";
type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "支付" | "报错" | "接口" | "积分" | "风控";
type AiTaskStatus = "queued" | "processing" | "success" | "failed" | "timeout" | "recoverable";
type RiskStatus = "open" | "reviewing" | "mitigated";

export type AdminActor = {
  id: string;
  username: string;
  role?: string;
};

type AdminUserAccount = {
  id: string;
  name: string;
  email: string;
  account: string;
  registeredAt: string;
  loginMethod: string;
  role: string;
  status: AdminStatus;
  plan: string;
  organization: string;
  credits: number;
  frozenCredits: number;
  expiredCredits: number;
  totalRecharge: number;
  totalConsumed: number;
  lastSeen: string;
  risk: string;
};

type PaymentOrder = {
  id: string;
  userId: string;
  user: string;
  userAccount?: string;
  userEmail?: string;
  paymentDisplayName?: string;
  packageName: string;
  channel: "微信支付" | "支付宝" | "Stripe" | "PayPal" | "第三方代收";
  amount: number;
  expectedCredits: number;
  issuedCredits: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  event: string;
  reconciliation: "matched" | "pending" | "mismatch";
  providerTransactionId?: string;
  refundAmount?: number;
  refundedCredits?: number;
  notes?: OrderNote[];
  paymentEvents?: PaymentEvent[];
  refundEvents?: RefundEvent[];
  notificationReadAt?: string;
  notificationDismissedAt?: string;
};

type PaymentEvent = {
  id: string;
  type: string;
  status: "success" | "failed" | "pending";
  providerTransactionId?: string;
  amount?: number;
  signatureValid?: boolean;
  message: string;
  createdAt: string;
};

type OrderNote = {
  id: string;
  actorId: string;
  actorName: string;
  content: string;
  createdAt: string;
};

type RefundEvent = {
  id: string;
  amount: number;
  creditsDeducted: number;
  reason: string;
  status: "requested" | "credits_deducted" | "submitted" | "processing" | "succeeded" | "failed";
  providerRefundId?: string;
  currentStep: string;
  flow: RefundFlowNode[];
  actorId: string;
  actorName: string;
  createdAt: string;
};

type RefundFlowNode = {
  id: string;
  label: string;
  status: "done" | "current" | "pending" | "failed";
  detail: string;
  createdAt?: string;
};

type CreditLedgerEntry = {
  id: string;
  userId: string;
  user: string;
  type: string;
  delta: number;
  reason: string;
  source: string;
  operator: string;
  createdAt: string;
};

type CreditGiftNotification = {
  id: string;
  userId: string;
  ledgerId: string;
  amount: number;
  balance: number;
  message: string;
  status: "unread" | "acknowledged";
  createdAt: string;
  acknowledgedAt?: string;
};

type AiTaskRecord = {
  id: string;
  generationId: string;
  backendTaskId: string;
  providerTaskId: string;
  userId: string;
  user: string;
  capability: string;
  provider: string;
  model: string;
  status: AiTaskStatus;
  latencyMs: number;
  failureReason: string;
  inputUnits: number;
  outputUnits: number;
  estimatedCost: number;
  chargedCredits: number;
  grossMargin: number;
  createdAt: string;
};

type AiUsageRecordInput = {
  userId: string;
  username: string;
  capability: string;
  capabilityKey?: AiBillingCapability;
  provider: string;
  model: string;
  generationId?: string;
  backendTaskId?: string;
  providerTaskId?: string;
  providerTaskIds?: string[];
  status: AiTaskStatus;
  latencyMs?: number;
  failureReason?: string;
  inputUnits?: number;
  outputUnits?: number;
  estimatedCost?: number;
  chargedCredits?: number;
};

type ProviderHealth = {
  id: string;
  name: string;
  category: string;
  state: "在线" | "观察" | "异常" | "未配置";
  latencyMs: number;
  owner: string;
  configLocation: string;
  credentialStatus: "configured" | "missing" | "not_required";
  lastCheckedAt: string;
};

type FeedbackTicket = {
  id: string;
  userId: string;
  user: string;
  title: string;
  content: string;
  module: string;
  status: FeedbackStatus;
  priority: "P0" | "P1" | "P2";
  attachments?: StoredFeedbackImage[];
  linkedOrderId?: string;
  linkedTaskId?: string;
  createdAt: string;
  updatedAt: string;
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
  linkedSection: "orders" | "credits" | "integrations" | "risk" | "feedback" | "audit";
  notificationDismissedAt?: string;
};

type RiskEvent = {
  id: string;
  title: string;
  detail: string;
  status: RiskStatus;
  severity: "high" | "medium" | "low";
  target: string;
  createdAt: string;
  notificationReadAt?: string;
  notificationDismissedAt?: string;
  handledBy?: string;
  handledAt?: string;
  resolution?: string;
};

type RiskEventInput = {
  title: string;
  detail: string;
  target: string;
  severity: "high" | "medium" | "low";
  actorName?: string;
  alert?: boolean;
  linkedSection?: OpsAlert["linkedSection"];
};

type AuditLog = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: string;
};

type PricingPlan = {
  id: string;
  name: string;
  price: number;
  credits: number;
  channel: string;
  status: "active" | "draft";
};

type AdminData = {
  users: AdminUserAccount[];
  orders: PaymentOrder[];
  credits: CreditLedgerEntry[];
  creditNotifications: CreditGiftNotification[];
  aiTasks: AiTaskRecord[];
  providers: ProviderHealth[];
  feedback: FeedbackTicket[];
  alerts: OpsAlert[];
  riskEvents: RiskEvent[];
  auditLogs: AuditLog[];
  plans: PricingPlan[];
  capabilityStatus: CapabilityStatusItem[];
  aiBillingPolicies?: AiBillingPolicy[];
  aiPlanDiscounts?: AiPlanDiscountPolicy[];
};

type CapabilityStatusItem = {
  id: string;
  domain: string;
  status: "ready" | "partial" | "missing";
  summary: string;
  source: string;
};

type ProductionReadinessItem = {
  id: string;
  domain: string;
  status: "ready" | "partial" | "missing";
  summary: string;
  requiredKeys: string[];
  configuredKeys: string[];
  missingKeys: string[];
  action: string;
};

type ProductionCheckStatus = "ready" | "watch" | "partial" | "blocked";

type ProductionCheckItem = {
  id: "payment_reconciliation" | "credit_liability" | "secret_governance" | "privileged_access";
  title: string;
  status: ProductionCheckStatus;
  summary: string;
  metrics: Record<string, number>;
  metricLabels: Record<string, string>;
  evidence: string[];
  actionTarget: "orders" | "credits" | "integrations" | "audit";
};

type AiCostSummary = {
  totalEstimatedCost: number;
  totalChargedCredits: number;
  successCount: number;
  failedCount: number;
  avgGrossMargin: number;
};

type AiCostBreakdownRow = {
  key: string;
  label: string;
  estimatedCost: number;
  chargedCredits: number;
  successCount: number;
  failedCount: number;
  avgGrossMargin: number;
};

export type AdminApiResult = {
  status: number;
  body: unknown;
};

const DEMO_USER_IDS = new Set(["usr_1028", "usr_1071", "usr_1189", "usr_1220"]);
const DEMO_USER_NAMES = new Set(["林澈", "Mira Studio", "陈一鸣", "北辰增长"]);
const DEMO_RECORD_PREFIXES = ["ord_90", "cr_7", "task_8", "fb_2", "al_8", "al_9", "risk_0", "aud_00"];

const DATA_DIR = process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data");
const DATA_FILE = path.join(DATA_DIR, "admin-data.json");
const ADMIN_DATA_BACKEND = process.env.ARTX_ADMIN_DATA_BACKEND || "json";

type AdminDataRepository = {
  load(): Promise<Partial<AdminData> | null>;
  save(data: AdminData): Promise<void>;
};

class JsonAdminDataRepository implements AdminDataRepository {
  constructor(private readonly dataDir: string, private readonly dataFile: string) {}

  async load() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.dataFile, "utf-8");
      return JSON.parse(raw) as Partial<AdminData>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(data: AdminData) {
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmpFile = `${this.dataFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpFile, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    await fs.rename(tmpFile, this.dataFile);
  }
}

class PostgresAdminDataRepository implements AdminDataRepository {
  private readonly store: PostgresJsonDocumentStore<AdminData>;

  constructor(databaseUrl: string) {
    this.store = new PostgresJsonDocumentStore<AdminData>(databaseUrl, "admin-data");
  }

  load() {
    return this.store.load();
  }

  save(data: AdminData) {
    return this.store.save(data);
  }
}

function createAdminDataRepository(): AdminDataRepository {
  if (ADMIN_DATA_BACKEND === "postgres") {
    return new PostgresAdminDataRepository(process.env.DATABASE_URL || "");
  }
  if (ADMIN_DATA_BACKEND !== "json") {
    throw new Error(`Unsupported ARTX_ADMIN_DATA_BACKEND=${ADMIN_DATA_BACKEND}. Use json or postgres.`);
  }
  return new JsonAdminDataRepository(DATA_DIR, DATA_FILE);
}

const adminDataRepository = createAdminDataRepository();

function nowIso() {
  return new Date().toISOString();
}

function formatGiftCredits(amount: number) {
  return amount.toLocaleString("zh-CN");
}

function buildCreditGiftMessage(amount: number) {
  return `您好，您已收到系统为您赠送的 ${formatGiftCredits(amount)} 积分作为感谢。`;
}

function createCreditGiftNotification(
  data: AdminData,
  user: AdminUserAccount,
  entry: CreditLedgerEntry,
  amount: number
) {
  if (amount <= 0) return;
  data.creditNotifications = [
    {
      id: `cgn_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
      userId: user.id,
      ledgerId: entry.id,
      amount,
      balance: user.credits,
      message: buildCreditGiftMessage(amount),
      status: "unread" as const,
      createdAt: entry.createdAt,
    },
    ...data.creditNotifications,
  ].slice(0, 500);
}

const adminTimeZone = "Asia/Shanghai";

function parseAdminTimestamp(input: string) {
  const absoluteMatch = input.match(/^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (absoluteMatch) {
    const [, year, month, day, hour, minute, second = "00"] = absoluteMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), Number(second));
  }
  return Date.parse(input);
}

function formatAbsoluteSecondTime(input?: string) {
  if (!input) return input;
  const timestamp = parseAdminTimestamp(input);
  if (!Number.isFinite(timestamp)) return input;

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: adminTimeZone,
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}/${value("month")}/${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

function resolveOrderCreatedAt(order: PaymentOrder) {
  if (Number.isFinite(parseAdminTimestamp(order.createdAt))) return order.createdAt;

  const qrCreatedAt = (order.paymentEvents || [])
    .filter((event) => event.type === "wallyt_payment_created")
    .map((event) => event.createdAt)
    .filter((createdAt) => Number.isFinite(parseAdminTimestamp(createdAt)))
    .sort((left, right) => parseAdminTimestamp(left) - parseAdminTimestamp(right))[0];

  return qrCreatedAt || order.createdAt;
}

function formatRelativeTime(input: string) {
  const timestamp = parseAdminTimestamp(input);
  if (!Number.isFinite(timestamp)) return input;

  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  if (diff < 2 * day) return "昨天";
  return `${Math.max(1, Math.floor(diff / day))} 天前`;
}

function formatDateTime(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: adminTimeZone,
  });
  return formatter.format(date).replace(/\//g, "-");
}

function envStatus(keys: string[], mode: "any" | "all" = "any") {
  const check = (key: string) => Boolean(process.env[key]);
  return (mode === "all" ? keys.every(check) : keys.some(check)) ? "configured" : "missing";
}

function canWriteDirectory(directory: string) {
  try {
    accessSync(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function buildTencentCloudBackendHealth(): ProviderHealth {
  const host = process.env.HOST || "127.0.0.1";
  const port = process.env.PORT || "";
  const dataDir = process.env.ARTX_DATA_DIR || "";
  const uploadsDir = process.env.ARTX_UPLOADS_DIR || (dataDir ? path.join(dataDir, "uploads") : "");
  const publicUrl =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.SITE_URL ||
    process.env.OAUTH_PUBLIC_BASE_URL ||
    "";
  const dataDirWritable = Boolean(dataDir) && canWriteDirectory(dataDir);
  const uploadsDirWritable = Boolean(uploadsDir) && canWriteDirectory(uploadsDir);
  const runtimeConfigured = Boolean(port && dataDir && uploadsDir);
  const state: ProviderHealth["state"] = runtimeConfigured && dataDirWritable && uploadsDirWritable
    ? "在线"
    : runtimeConfigured
      ? "观察"
      : "未配置";
  const runtimeBits = [
    `HOST=${host}`,
    `PORT=${port || "unset"}`,
    `ARTX_DATA_DIR=${dataDir || "unset"}`,
    `ARTX_UPLOADS_DIR=${uploadsDir || "unset"}`,
    `PUBLIC_URL=${publicUrl || "unset"}`,
    `dataWritable=${dataDirWritable ? "yes" : "no"}`,
    `uploadsWritable=${uploadsDirWritable ? "yes" : "no"}`,
  ];

  return {
    id: "infra_tencent_cloud",
    name: "腾讯云后端",
    category: "部署与日志",
    state,
    latencyMs: 1,
    owner: "Infra",
    configLocation: `current runtime: ${runtimeBits.join(", ")}`,
    credentialStatus: "not_required",
    lastCheckedAt: "当前进程",
  };
}

function mapRoleToPlan(role?: string) {
  if (role === "super_admin" || role === "admin") return "Studio 工作室版";
  if (role === "finance" || role === "support") return "Pro 专业版";
  return "Lite 入门版";
}

function getPlanIdFromUserPlan(planName?: string) {
  const normalized = String(planName || "").trim().toLowerCase();
  if (!normalized || normalized === "free" || normalized === "starter" || normalized === "demo") {
    return "lite";
  }
  const matched = MEMBERSHIP_PLANS.find((plan) => (
    normalized.includes(plan.id.toLowerCase())
    || normalized.includes(plan.shortName.toLowerCase())
    || normalized.includes(plan.name.toLowerCase())
  ));
  return matched?.id || "creator";
}

function getMembershipPlanFromName(planName?: string) {
  const normalized = String(planName || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return MEMBERSHIP_PLANS.find((plan) => (
    normalized === plan.id.toLowerCase()
    || normalized === plan.shortName.toLowerCase()
    || normalized === plan.name.toLowerCase()
    || normalized.includes(plan.shortName.toLowerCase())
    || normalized.includes(plan.name.toLowerCase())
  ));
}

function normalizePlanDisplayName(planName?: string | null) {
  const raw = String(planName || "").trim();
  if (!raw) return "Lite 入门版";
  const normalized = raw.toLowerCase();
  if (
    normalized === "free"
    || normalized === "starter"
    || normalized === "demo"
    || normalized.includes("creator")
    || normalized.includes("创作者")
    || normalized.includes("积分充值")
    || normalized.includes("recharge")
  ) {
    return "Lite 入门版";
  }

  if (
    normalized.includes("studio")
    || normalized.includes("business")
    || normalized.includes("enterprise")
    || normalized.includes("工作室")
    || normalized.includes("团队")
    || normalized.includes("企业")
  ) {
    return "Studio 工作室版";
  }

  if (normalized.includes("pro") || normalized.includes("专业")) {
    return "Pro 专业版";
  }

  if (normalized.includes("lite") || normalized.includes("入门")) {
    return "Lite 入门版";
  }

  return "Lite 入门版";
}

function quoteAiUsageFromData(data: AdminData, input: {
  capability: AiBillingCapability;
  outputCount?: number;
  planId?: string;
}) {
  const policies = data.aiBillingPolicies?.length ? data.aiBillingPolicies : AI_CREDIT_POLICIES;
  const discounts = data.aiPlanDiscounts?.length ? data.aiPlanDiscounts : AI_PLAN_DISCOUNTS;
  const policy = policies.find((item) => item.capability === input.capability)
    || AI_CREDIT_POLICIES.find((item) => item.capability === input.capability)
    || AI_CREDIT_POLICIES[0];
  const discount = discounts.find((item) => item.planId === input.planId)
    || AI_PLAN_DISCOUNTS.find((item) => item.planId === input.planId)
    || AI_PLAN_DISCOUNTS[1];
  const outputCount = Math.max(1, Math.round(input.outputCount || 1));
  const rawCredits = policy.billingUnit === "per_image"
    ? policy.baseCredits * outputCount + (policy.perOutputCredits || 0) * Math.max(0, outputCount - 1)
    : policy.baseCredits;

  return {
    policy,
    discount,
    chargedCredits: Math.max(1, Math.round(rawCredits * discount.multiplier)),
    estimatedCost: Number((policy.estimatedCostPerUnit * (policy.billingUnit === "per_image" ? outputCount : 1)).toFixed(2)),
  };
}

function displayNameFromUsername(username: string) {
  return username.split("@")[0] || username;
}

function userEmailFromUsername(username: string) {
  return username.includes("@") ? username : `${username}@example.com`;
}

function ensureBillingUser(data: AdminData, params: {
  userId: string;
  username: string;
}) {
  let user = data.users.find((item) => item.id === params.userId);
  if (!user) {
    user = {
      id: params.userId,
      name: displayNameFromUsername(params.username),
      email: userEmailFromUsername(params.username),
      account: params.username,
      registeredAt: formatDateTime(nowIso()),
      loginMethod: params.username.includes("@artx.social") ? "social" : "email",
      role: "viewer",
      status: "normal",
      plan: "Free",
      organization: "个人",
      credits: 0,
      frozenCredits: 0,
      expiredCredits: 0,
      totalRecharge: 0,
      totalConsumed: 0,
      lastSeen: "刚刚",
      risk: "低",
    };
    data.users = [user, ...data.users];
    return user;
  }

  user.account = user.account || params.username;
  user.email = user.email || userEmailFromUsername(params.username);
  user.name = user.name || displayNameFromUsername(params.username);
  return user;
}

function getPaymentDisplayName(order: PaymentOrder) {
  return order.paymentDisplayName || `${order.packageName} · ${order.userAccount || order.user}`;
}

function getRegisteredNameForOrder(order: PaymentOrder, users: AdminUserAccount[]) {
  const linkedUser = users.find((user) => user.id === order.userId);
  return linkedUser?.account || linkedUser?.email || order.userAccount || order.user;
}

async function buildUserAccounts(seedUsers: AdminUserAccount[] = []) {
  const authUsers = await listAuthUsers();
  const merged = new Map<string, AdminUserAccount>();

  seedUsers.forEach((user) => {
    merged.set(user.email || user.account, user);
    merged.set(user.account, user);
    merged.set(user.id, user);
  });

  for (const authUser of authUsers) {
    const existing =
      merged.get(authUser.username) ||
      merged.get(`${authUser.username}@example.com`) ||
      seedUsers.find((item) => item.email === authUser.username || item.account === authUser.username);

    if (existing) {
      existing.role = authUser.role || existing.role;
      existing.account = authUser.username;
      existing.email = existing.email || authUser.username;
      continue;
    }

    const syntheticUser: AdminUserAccount = {
      id: authUser.id,
      name: authUser.username.split("@")[0],
      email: authUser.username,
      account: authUser.username,
      registeredAt: authUser.createdAt ? authUser.createdAt.slice(0, 16).replace("T", " ") : nowIso().slice(0, 16).replace("T", " "),
      loginMethod: authUser.username.includes("@artx.social") ? "social" : "email",
      role: authUser.role || "viewer",
      status: authUser.isAdmin ? "watch" : "normal",
      plan: mapRoleToPlan(authUser.role),
      organization: authUser.isAdmin ? "后台账号" : "个人",
      credits: 0,
      frozenCredits: 0,
      expiredCredits: 0,
      totalRecharge: 0,
      totalConsumed: 0,
      lastSeen: "刚刚",
      risk: authUser.isAdmin ? "低" : "低",
    };
    merged.set(syntheticUser.id, syntheticUser);
  }

  return Array.from(new Set(Array.from(merged.values())));
}

function buildPricingPlans(): PricingPlan[] {
  return MEMBERSHIP_PLANS.flatMap((plan) =>
    BILLING_CYCLES.filter((cycle) => cycle.id === "monthly" || cycle.id === "annual").map((cycle) => {
      const quote = getPlanQuote(plan, cycle);
      return {
        id: `${plan.id}_${cycle.id}`,
        name: `${plan.shortName} · ${cycle.label}`,
        price: quote.price,
        credits: quote.totalCredits,
        channel: "微信支付 / 支付宝",
        status: plan.recommended || cycle.recommended ? "active" : "draft",
      } satisfies PricingPlan;
    }),
  );
}

function buildCapabilityStatus(): CapabilityStatusItem[] {
  return [
    { id: "cap_admin_auth", domain: "管理员认证与权限", status: "ready", summary: "已具备管理员登录、session 校验、admin:access 权限拦截", source: "server/auth-store.ts + /api/auth/* + /api/admin/session" },
    { id: "cap_users", domain: "用户与账户", status: "ready", summary: "已接入现有 auth 用户库，并与后台账户视图合并展示", source: ".artx-data/auth-users.json + /api/admin/users" },
    { id: "cap_plans", domain: "套餐与金额配置", status: "ready", summary: "已复用测试环境真实套餐/周期/积分配置作为后台展示来源", source: "shared/billing-config.ts + /api/admin/plans" },
    { id: "cap_ai", domain: "AI 任务与供应商", status: "ready", summary: "已具备 generationId / backendTaskId / providerTaskId 追踪和供应商配置状态展示", source: "server/ai-orchestrator.ts + server/image-generation.ts + /api/admin/ai-tasks" },
    { id: "cap_alerts", domain: "告警与消息提醒", status: "ready", summary: "后台可读写敏捷处理消息，并支持已读与审计", source: "/api/admin/alerts*" },
    { id: "cap_feedback", domain: "反馈与工单", status: "ready", summary: "已支持反馈列表与状态流转，且能写审计日志", source: "/api/admin/feedback*" },
    { id: "cap_audit", domain: "审计日志", status: "ready", summary: "后台写操作已统一写入 audit log", source: "/api/admin/audit-logs" },
    { id: "cap_orders", domain: "支付订单", status: "ready", summary: "已通过威富通接入微信/支付宝下单、回调验签、主动查询、异常告警和后台订单对账", source: "server/wallyt-payment.ts + /api/billing/* + /api/admin/orders" },
    { id: "cap_credits", domain: "积分", status: "ready", summary: "支付入账、退款扣回、人工调整、AI 成功消耗和失败不扣款已统一进入积分余额与流水账本", source: "/api/billing/* + /api/admin/credits + recordAiUsage" },
    { id: "cap_risk", domain: "风控事件", status: "ready", summary: "已接入支付异常、AI 失败、登录/短信异常、大额积分调整等真实风控规则输入", source: "/api/admin/risk-events + server/admin-store.ts" },
  ];
}

function configuredKeys(keys: string[]) {
  return keys.filter((key) => Boolean(process.env[key]));
}

function readinessStatus(requiredKeys: string[]): "ready" | "partial" | "missing" {
  const configured = configuredKeys(requiredKeys);
  if (configured.length === requiredKeys.length) return "ready";
  if (configured.length > 0) return "partial";
  return "missing";
}

function readinessItem(input: {
  id: string;
  domain: string;
  requiredKeys: string[];
  summary: string;
  action: string;
}): ProductionReadinessItem {
  const configured = configuredKeys(input.requiredKeys);
  return {
    id: input.id,
    domain: input.domain,
    status: readinessStatus(input.requiredKeys),
    summary: input.summary,
    requiredKeys: input.requiredKeys,
    configuredKeys: configured,
    missingKeys: input.requiredKeys.filter((key) => !configured.includes(key)),
    action: input.action,
  };
}

function mailReadinessItem() {
  const resendKeys = ["RESEND_API_KEY", "RESEND_FROM"];
  const smtpKeys = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"];
  const resendConfigured = configuredKeys(resendKeys);
  const smtpConfigured = configuredKeys(smtpKeys);
  const requiredKeys = resendConfigured.length > 0 || smtpConfigured.length === 0 ? resendKeys : smtpKeys;
  const configured = configuredKeys(requiredKeys);
  return {
    id: "mail_sms",
    domain: "邮件/短信通知",
    status: configured.length === requiredKeys.length ? "ready" : configured.length > 0 ? "partial" : "missing",
    summary: "用于邮箱注册/登录验证、找回密码、支付异常、工单通知和管理员告警。",
    requiredKeys,
    configuredKeys: configured,
    missingKeys: requiredKeys.filter((key) => !configured.includes(key)),
    action: "已支持 Resend API 或 SMTP；生产环境优先使用 RESEND_API_KEY + RESEND_FROM。",
  } satisfies ProductionReadinessItem;
}

function buildProductionReadiness(): ProductionReadinessItem[] {
  return [
    readinessItem({ id: "payment_wallyt", domain: "威富通支付", requiredKeys: ["WALLYT_DOMAIN_URL", "WALLYT_MCH_ID", "WALLYT_SIGNATURE_KEY", "WALLYT_NOTIFY_URL"], summary: "用于创建支付单、接收支付回调、主动查询订单状态，并把订单/积分/审计串起来。", action: "保持凭据只在服务器环境变量中；上线前用真实小额支付验证 paid + 积分入账。" }),
    readinessItem({ id: "admin_auth", domain: "管理员认证", requiredKeys: ["ADMIN_SESSION_SECRET"], summary: "用于后台 session 安全、登录令牌签发和防止默认测试令牌长期暴露。", action: "配置强随机 ADMIN_SESSION_SECRET，并下线 URL admin_token 直通入口。" }),
    readinessItem({ id: "database", domain: "正式数据库", requiredKeys: ["DATABASE_URL"], summary: "用于替代 JSON 文件存储，承载用户、订单、积分流水、AI 任务和审计日志。", action: "准备 PostgreSQL/MySQL 连接串，执行正式迁移和备份策略。" }),
    readinessItem({ id: "object_storage", domain: "对象存储", requiredKeys: ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "PUBLIC_ASSET_BASE_URL"], summary: "用于保存用户生成图片、画板素材、下载文件和长期可访问资产。", action: "建议接腾讯云 COS 或 S3 兼容存储，并配置 CDN/私有读写策略。" }),
    readinessItem({ id: "ai_openai", domain: "OpenAI 能力", requiredKeys: ["OPENAI_API_KEY"], summary: "用于文本/图像模型能力和后台供应商健康判断。", action: "配置服务端 API Key，并跑一笔真实 AI 任务确认扣积分和成本记录。" }),
    readinessItem({ id: "ai_bkeel", domain: "BKEEL 图片生成", requiredKeys: ["AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL", "AI_IMAGE_MODEL"], summary: "用于第三方图片生成任务、providerTaskId 追踪和失败告警。", action: "配置 AI_IMAGE_* 接口凭据，验证异步 task_id 轮询、失败告警和成本入账。" }),
    readinessItem({ id: "ai_picwish", domain: "PicWish/佐糖图像处理", requiredKeys: ["PICWISH_API_KEY"], summary: "用于抠图、高清、去水印、橡皮擦等图像处理能力。", action: "配置接口凭据，验证 providerTaskId 进入后台 AI 任务明细。" }),
    mailReadinessItem(),
    readinessItem({ id: "sms_tencent", domain: "腾讯云短信验证码", requiredKeys: ["TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "TENCENT_SMS_SDK_APP_ID", "TENCENT_SMS_SIGN_NAME", "TENCENT_SMS_TEMPLATE_ID"], summary: "用于手机号验证码登录/注册，验证码只保存哈希并有过期、重发和次数限制。", action: "配置腾讯云短信应用、签名和模板；模板参数第 1 个必须是 6 位验证码。" }),
    readinessItem({ id: "ops_alerting", domain: "运行告警", requiredKeys: ["ALERT_WEBHOOK_URL"], summary: "用于把支付失败、AI 失败率升高、服务器异常等推送到飞书/钉钉/企业微信。", action: "配置告警 webhook，并把 P0/P1 告警接入右上角消息提醒。" }),
    readinessItem({ id: "backup", domain: "备份与恢复", requiredKeys: ["BACKUP_LOCAL_DIR", "BACKUP_RETENTION_DAYS", "BACKUP_CRON_SECRET"], summary: "用于数据库、订单流水、用户资产的定期备份和灾难恢复。", action: "当前启用服务器本地每日备份；接入对象存储后再补 BACKUP_REMOTE_BUCKET 做异地容灾。" }),
  ];
}

function productionCheckStatus(blockers: number, warnings = 0): ProductionCheckStatus {
  if (blockers > 0) return "blocked";
  if (warnings > 0) return "watch";
  return "ready";
}

function buildProductionChecks(data: AdminData): ProductionCheckItem[] {
  const totalOrders = data.orders.length;
  const pendingReconciliation = data.orders.filter((order) => order.reconciliation === "pending").length;
  const mismatchedOrders = data.orders.filter((order) => order.reconciliation === "mismatch" || order.status === "failed").length;
  const paidWithoutCredits = data.orders.filter((order) => order.status === "paid" && order.issuedCredits < order.expectedCredits).length;
  const wallytConfigured = envStatus(["WALLYT_MCH_ID", "WALLYT_SIGNATURE_KEY", "WALLYT_NOTIFY_URL"], "all") === "configured";

  const activeUserCredits = data.users.reduce((sum, user) => sum + Math.max(0, user.credits), 0);
  const frozenCredits = data.users.reduce((sum, user) => sum + Math.max(0, user.frozenCredits), 0);
  const expiredCredits = data.users.reduce((sum, user) => sum + Math.max(0, user.expiredCredits), 0);
  const paidIssuedCredits = data.orders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Math.max(0, order.issuedCredits), 0);
  const totalConsumedCredits = data.users.reduce((sum, user) => sum + Math.max(0, user.totalConsumed), 0);
  const paidUnconsumedCredits = Math.max(0, paidIssuedCredits - totalConsumedCredits);
  const creditLedgerEntries = data.credits.length;

  const criticalSecretGroups = [
    { label: "支付", keys: ["WALLYT_MCH_ID", "WALLYT_SIGNATURE_KEY", "WALLYT_NOTIFY_URL"] },
    { label: "后台会话", keys: ["ADMIN_SESSION_SECRET"] },
    { label: "AI 文本/图像", keys: ["OPENAI_API_KEY", "AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL", "AI_IMAGE_MODEL"] },
    { label: "PicWish 图像处理", keys: ["PICWISH_API_KEY"] },
    { label: "备份", keys: ["BACKUP_LOCAL_DIR", "BACKUP_RETENTION_DAYS", "BACKUP_CRON_SECRET"] },
    { label: "告警", keys: ["ALERT_WEBHOOK_URL"] },
  ];
  const configuredSecretGroups = criticalSecretGroups.filter((group) => configuredKeys(group.keys).length === group.keys.length).length;
  const partialSecretGroups = criticalSecretGroups.filter((group) => {
    const count = configuredKeys(group.keys).length;
    return count > 0 && count < group.keys.length;
  }).length;
  const missingSecretGroups = criticalSecretGroups.length - configuredSecretGroups - partialSecretGroups;

  const activeUsers = data.users.filter((user) => user.status !== "blocked");
  const superAdminCount = activeUsers.filter((user) => user.role === "super_admin").length;
  const adminCount = activeUsers.filter((user) => user.role === "admin" || user.role === "super_admin").length;
  const financeCount = activeUsers.filter((user) => user.role === "finance").length;
  const privilegedUserCount = activeUsers.filter((user) => ["support", "finance", "admin", "super_admin"].includes(user.role)).length;
  const highRiskOpenEvents = data.riskEvents.filter((event) => event.severity === "high" && event.status !== "mitigated").length;
  const recentPermissionAuditCount = data.auditLogs.filter((log) =>
    /role|权限|管理员|admin\.user\.update/i.test(`${log.action} ${log.reason || ""}`)
  ).length;

  return [
    {
      id: "payment_reconciliation",
      title: "支付对账",
      status: productionCheckStatus(mismatchedOrders + paidWithoutCredits, pendingReconciliation + (wallytConfigured ? 0 : 1)),
      summary: wallytConfigured
        ? "已接入第三方支付状态、金额一致性、入账积分一致性检查。"
        : "支付凭据未完整配置，无法满足正式对账要求。",
      metrics: {
        totalOrders,
        pendingReconciliation,
        mismatchedOrders,
        paidWithoutCredits,
      },
      metricLabels: {
        totalOrders: "订单总数",
        pendingReconciliation: "待对账订单",
        mismatchedOrders: "异常订单",
        paidWithoutCredits: "已支付未足额入账",
      },
      evidence: [
        `订单总数 ${totalOrders}`,
        `待对账 ${pendingReconciliation}`,
        `异常订单 ${mismatchedOrders}`,
        `已支付未足额入账 ${paidWithoutCredits}`,
        `威富通配置 ${wallytConfigured ? "完整" : "缺失"}`,
      ],
      actionTarget: "orders",
    },
    {
      id: "credit_liability",
      title: "积分负债",
      status: productionCheckStatus(0, activeUserCredits + frozenCredits > 0 && creditLedgerEntries === 0 ? 1 : 0),
      summary: "已按真实用户余额、冻结积分、过期积分和充值消耗差额计算平台未消耗积分。",
      metrics: {
        activeUserCredits,
        frozenCredits,
        expiredCredits,
        paidUnconsumedCredits,
        creditLedgerEntries,
      },
      metricLabels: {
        activeUserCredits: "用户可用积分",
        frozenCredits: "冻结积分",
        expiredCredits: "过期积分",
        paidUnconsumedCredits: "已发放未消耗积分",
        creditLedgerEntries: "积分流水记录",
      },
      evidence: [
        `用户可用积分 ${activeUserCredits.toLocaleString("zh-CN")}`,
        `冻结积分 ${frozenCredits.toLocaleString("zh-CN")}`,
        `过期积分 ${expiredCredits.toLocaleString("zh-CN")}`,
        `充值未消耗积分 ${paidUnconsumedCredits.toLocaleString("zh-CN")}`,
      ],
      actionTarget: "credits",
    },
    {
      id: "secret_governance",
      title: "密钥治理",
      status: missingSecretGroups > 0 ? "partial" as ProductionCheckStatus : partialSecretGroups > 0 ? "watch" : "ready",
      summary: "后台只返回配置状态、配置位置和缺失项，不返回任何密钥明文。",
      metrics: {
        requiredGroups: criticalSecretGroups.length,
        configuredGroups: configuredSecretGroups,
        partialGroups: partialSecretGroups,
        missingGroups: missingSecretGroups,
      },
      metricLabels: {
        requiredGroups: "需检查配置组",
        configuredGroups: "已完整配置",
        partialGroups: "部分配置",
        missingGroups: "缺失配置",
      },
      evidence: criticalSecretGroups.map((group) => {
        const configured = configuredKeys(group.keys).length;
        return `${group.label} ${configured}/${group.keys.length}`;
      }),
      actionTarget: "integrations",
    },
    {
      id: "privileged_access",
      title: "高危权限",
      status: productionCheckStatus(superAdminCount === 0 || highRiskOpenEvents > 0 ? 1 : 0, superAdminCount > 2 ? 1 : 0),
      summary: "已统计超级管理员、管理员、财务账号和开放高危事件，权限变更进入审计日志。",
      metrics: {
        superAdminCount,
        adminCount,
        financeCount,
        privilegedUserCount,
        highRiskOpenEvents,
        recentPermissionAuditCount,
      },
      metricLabels: {
        superAdminCount: "超级管理员",
        adminCount: "管理员",
        financeCount: "财务账号",
        privilegedUserCount: "高权限账号",
        highRiskOpenEvents: "未处理高危事件",
        recentPermissionAuditCount: "权限审计记录",
      },
      evidence: [
        `超级管理员 ${superAdminCount}`,
        `管理员 ${adminCount}`,
        `财务 ${financeCount}`,
        `未缓解高危事件 ${highRiskOpenEvents}`,
        `权限审计记录 ${recentPermissionAuditCount}`,
      ],
      actionTarget: "audit",
    },
  ];
}

function buildProviderHealth(): ProviderHealth[] {
  const wallytStatus = envStatus(["WALLYT_MCH_ID", "WALLYT_SIGNATURE_KEY", "WALLYT_NOTIFY_URL"], "all");
  const wallytConfigured = wallytStatus === "configured";
  const wechatDirectStatus = envStatus(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_PRIVATE_KEY"], "all");
  const alipayDirectStatus = envStatus(["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY"], "all");
  const aggregateStatus = wallytConfigured ? "configured" : "missing";
  const aggregateState = wallytConfigured ? "在线" : "未配置";

  return [
    { id: "pay_wallyt", name: "威富通", category: "聚合支付", state: wallytConfigured ? "在线" : "未配置", latencyMs: 220, owner: "Finance", configLocation: "server env: WALLYT_*", credentialStatus: wallytStatus, lastCheckedAt: "刚刚" },
    { id: "sms_tencent", name: "腾讯云短信", category: "通知验证", state: envStatus(["TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "TENCENT_SMS_SDK_APP_ID", "TENCENT_SMS_SIGN_NAME", "TENCENT_SMS_TEMPLATE_ID"], "all") === "configured" ? "在线" : "未配置", latencyMs: 260, owner: "Auth Ops", configLocation: "server env: TENCENT_SMS_*", credentialStatus: envStatus(["TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "TENCENT_SMS_SDK_APP_ID", "TENCENT_SMS_SIGN_NAME", "TENCENT_SMS_TEMPLATE_ID"], "all"), lastCheckedAt: "刚刚" },
    { id: "pay_wechat", name: "微信支付", category: "国内支付", state: wechatDirectStatus === "configured" ? "在线" : aggregateState, latencyMs: 226, owner: "Finance", configLocation: wechatDirectStatus === "configured" ? "server env: WECHAT_PAY_*" : "via Wallyt aggregate payment", credentialStatus: wechatDirectStatus === "configured" ? wechatDirectStatus : aggregateStatus, lastCheckedAt: "刚刚" },
    { id: "pay_alipay", name: "支付宝", category: "国内支付", state: alipayDirectStatus === "configured" ? "在线" : aggregateState, latencyMs: 194, owner: "Finance", configLocation: alipayDirectStatus === "configured" ? "server env: ALIPAY_*" : "via Wallyt aggregate payment", credentialStatus: alipayDirectStatus === "configured" ? alipayDirectStatus : aggregateStatus, lastCheckedAt: "刚刚" },
    { id: "ai_openai", name: "OpenAI", category: "模型供应商", state: envStatus(["OPENAI_API_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 438, owner: "AI Ops", configLocation: "server env: OPENAI_*", credentialStatus: envStatus(["OPENAI_API_KEY"]), lastCheckedAt: "刚刚" },
    { id: "ai_bkeel", name: "BKEEL", category: "图片生成", state: envStatus(["AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL", "AI_IMAGE_MODEL"], "all") === "configured" ? "观察" : "未配置", latencyMs: 1240, owner: "AI Ops", configLocation: "server env: AI_IMAGE_*", credentialStatus: envStatus(["AI_IMAGE_API_KEY", "AI_IMAGE_BASE_URL", "AI_IMAGE_MODEL"], "all"), lastCheckedAt: "刚刚" },
    { id: "ai_picwish", name: "PicWish/佐糖", category: "图像处理", state: envStatus(["PICWISH_API_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 812, owner: "AI Ops", configLocation: "server env: PICWISH_*", credentialStatus: envStatus(["PICWISH_API_KEY"]), lastCheckedAt: "刚刚" },
    buildTencentCloudBackendHealth(),
  ];
}

async function seedAdminData(): Promise<AdminData> {
  return {
    users: await buildUserAccounts([]),
    orders: [],
    credits: [],
    creditNotifications: [],
    aiTasks: [],
    providers: buildProviderHealth(),
    feedback: [],
    alerts: [],
    riskEvents: [],
    auditLogs: [],
    plans: [],
    capabilityStatus: buildCapabilityStatus(),
  };
}

function normalizeData(value: Partial<AdminData>): AdminData {
  throw new Error("normalizeData is async-only");
}

function isDemoRecord(record: { id?: string; userId?: string; user?: string; name?: string; email?: string; account?: string; actorName?: string; target?: string }) {
  const id = String(record.id || "");
  const userId = String(record.userId || "");
  const user = String(record.user || record.name || "");
  const account = String(record.email || record.account || "");
  const target = String(record.target || "");
  if (DEMO_USER_IDS.has(id) || DEMO_USER_IDS.has(userId) || DEMO_USER_IDS.has(target)) return true;
  if (DEMO_USER_NAMES.has(user)) return true;
  if (["lin@example.com", "ops@mira.ai", "chen@example.com", "finance@beichen.co"].includes(account)) return true;
  return DEMO_RECORD_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function removeDemoData(data: AdminData): AdminData {
  data.users = data.users.filter((item) => !isDemoRecord(item));
  data.orders = data.orders.filter((item) => !isDemoRecord(item));
  data.credits = data.credits.filter((item) => !isDemoRecord(item));
  data.creditNotifications = data.creditNotifications.filter((item) => !isDemoRecord(item));
  data.aiTasks = data.aiTasks.filter((item) => !isDemoRecord(item));
  data.feedback = data.feedback.filter((item) => !isDemoRecord(item));
  data.alerts = data.alerts.filter((item) => !isDemoRecord(item));
  data.riskEvents = data.riskEvents.filter((item) => !isDemoRecord(item));
  data.auditLogs = data.auditLogs.filter((item) => !isDemoRecord(item));
  return data;
}

function hasDemoData(data: Partial<AdminData>) {
  return [
    data.users,
    data.orders,
    data.credits,
    data.creditNotifications,
    data.aiTasks,
    data.feedback,
    data.alerts,
    data.riskEvents,
    data.auditLogs,
  ].some((items) => Array.isArray(items) && items.some((item) => isDemoRecord(item)));
}

async function normalizeDataAsync(value: Partial<AdminData>): Promise<AdminData> {
  const seed = await seedAdminData();
  return removeDemoData({
    users: await buildUserAccounts(Array.isArray(value.users) ? value.users : seed.users),
    orders: Array.isArray(value.orders) ? value.orders : seed.orders,
    credits: Array.isArray(value.credits) ? value.credits : seed.credits,
    creditNotifications: Array.isArray(value.creditNotifications) ? value.creditNotifications : seed.creditNotifications,
    aiTasks: Array.isArray(value.aiTasks) ? value.aiTasks : seed.aiTasks,
    providers: buildProviderHealth(),
    feedback: Array.isArray(value.feedback) ? value.feedback : seed.feedback,
    alerts: Array.isArray(value.alerts) ? value.alerts : seed.alerts,
    riskEvents: Array.isArray(value.riskEvents) ? value.riskEvents : seed.riskEvents,
    auditLogs: Array.isArray(value.auditLogs) ? value.auditLogs : seed.auditLogs,
    plans: Array.isArray(value.plans) ? value.plans : seed.plans,
    capabilityStatus: Array.isArray(value.capabilityStatus) ? value.capabilityStatus : seed.capabilityStatus,
    aiBillingPolicies: Array.isArray(value.aiBillingPolicies) ? value.aiBillingPolicies : AI_CREDIT_POLICIES,
    aiPlanDiscounts: Array.isArray(value.aiPlanDiscounts) ? value.aiPlanDiscounts : AI_PLAN_DISCOUNTS,
  });
}

async function loadAdminData(): Promise<AdminData> {
  const stored = await adminDataRepository.load();
  if (stored) {
    const shouldPersistCleanup = hasDemoData(stored);
    const data = await normalizeDataAsync(stored);
    const orderCreatedAtBeforeNormalization = new Map(data.orders.map((order) => [order.id, order.createdAt]));
    ensureBillingConsistency(data);
    const shouldPersistOrderTimestampRepair = data.orders.some((order) => orderCreatedAtBeforeNormalization.get(order.id) !== order.createdAt);
    if (shouldPersistCleanup || shouldPersistOrderTimestampRepair) {
      await saveAdminData(data);
    }
    return data;
  }
  const seeded = await seedAdminData();
  ensureBillingConsistency(seeded);
  await saveAdminData(seeded);
  return seeded;
}

async function saveAdminData(data: AdminData) {
  ensureBillingConsistency(data);
  await adminDataRepository.save(data);
}

function buildFeedbackTitle(content: string, attachmentCount: number) {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (firstLine) return firstLine.length > 40 ? `${firstLine.slice(0, 40)}...` : firstLine;
  return attachmentCount > 0 ? `用户上传了 ${attachmentCount} 张问题截图` : "用户反馈";
}

export async function submitUserFeedback(input: {
  user: { id: string; username: string };
  content?: string;
  module?: string;
  attachments?: FeedbackImageInput[];
}) {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const rawAttachments = (input.attachments || []).filter((item) => item && typeof item.src === "string" && item.src.trim());
  if (!content && rawAttachments.length === 0) {
    return jsonError(400, "请先填写反馈内容或上传问题截图");
  }
  if (rawAttachments.length > 4) {
    return jsonError(400, "最多只能上传 4 张反馈图片");
  }

  const data = await loadAdminData();
  const user =
    data.users.find((item) => item.id === input.user.id) ||
    data.users.find((item) => item.account === input.user.username || item.email === input.user.username);
  const username = user?.account || user?.email || input.user.username;
  const feedbackId = `fb_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
  let attachments: StoredFeedbackImage[] = [];
  if (rawAttachments.length > 0) {
    attachments = await storeFeedbackImagesForUser(rawAttachments, username, feedbackId);
  }

  const createdAt = nowIso();
  const feedback: FeedbackTicket = {
    id: feedbackId,
    userId: user?.id || input.user.id,
    user: username,
    title: buildFeedbackTitle(content, attachments.length),
    content,
    module: typeof input.module === "string" && input.module.trim() ? input.module.trim() : "帮助与反馈",
    status: "new",
    priority: "P1",
    attachments,
    createdAt,
    updatedAt: createdAt,
  };

  data.feedback = [feedback, ...data.feedback].slice(0, 500);
  appendAuditLog(data, {
    id: input.user.id,
    username,
    role: "viewer",
  }, {
    action: "提交用户反馈",
    target: feedback.id,
    reason: attachments.length > 0 ? `${content || "图片反馈"} · ${attachments.length} 张图片` : content,
    after: { status: feedback.status, attachmentCount: attachments.length },
  });
  await saveAdminData(data);
  return { status: 200 as const, body: { feedback } };
}

function appendAuditLog(
  data: AdminData,
  actor: AdminActor,
  log: Omit<AuditLog, "id" | "actorId" | "actorName" | "createdAt">
) {
  data.auditLogs = [
    {
      id: `aud_${crypto.randomUUID().slice(0, 8)}`,
      actorId: actor.id,
      actorName: actor.username,
      createdAt: nowIso(),
      ...log,
    },
    ...data.auditLogs,
  ].slice(0, 500);
}

function toActor(sessionBody: unknown): AdminActor {
  const user = (sessionBody as { user?: { id?: string; username?: string; role?: string } })?.user;
  return {
    id: user?.id || "unknown",
    username: user?.username || "admin",
    role: user?.role,
  };
}

function dashboard(data: AdminData) {
  const paidOrders = data.orders.filter((order) => order.status === "paid");
  const paymentExceptions = data.orders.filter((order) => order.status === "failed" || order.reconciliation !== "matched").length;
  const totalRevenue = paidOrders.reduce((sum, order) => sum + order.amount, 0);
  const issuedCredits = data.orders.reduce((sum, order) => sum + order.issuedCredits, 0);
  const consumedCredits = data.users.reduce((sum, user) => sum + user.totalConsumed, 0);
  const remainingCredits = data.users.reduce((sum, user) => sum + user.credits, 0);
  const successfulAiTasks = data.aiTasks.filter((task) => task.status === "success").length;
  const aiSuccessRate = data.aiTasks.length ? Math.round((successfulAiTasks / data.aiTasks.length) * 1000) / 10 : 0;
  const costSummary = summarizeAiCost(data);

  return {
    metrics: {
      todayRevenue: totalRevenue,
      paymentExceptions,
      issuedCredits,
      consumedCredits,
      remainingCredits,
      aiSuccessRate,
      pendingFeedback: data.feedback.filter((item) => item.status === "new" || item.status === "processing").length,
      highRiskEvents: data.riskEvents.filter((event) => event.severity === "high" && event.status !== "mitigated").length,
    },
    aiCostSummary: costSummary,
    operationsQueue: data.alerts.map((alert) => ({
      title: alert.title,
      body: alert.detail,
      priority: alert.severity === "critical" ? "P0" : "P1",
      section: alert.linkedSection,
    })),
    maturity: [
      { label: "账户管理", value: 88 },
      { label: "支付订单", value: 76 },
      { label: "积分流水", value: 92 },
      { label: "AI 任务追踪", value: 74 },
      { label: "风控审计", value: 66 },
    ],
    aiBillingPolicies: (data.aiBillingPolicies || AI_CREDIT_POLICIES).map((item) => ({
      capability: item.label,
      capabilityKey: item.capability,
      unit: item.billingUnit === "per_image" ? "按张" : "按次",
      baseCredits: item.baseCredits,
      estimatedCostPerUnit: item.estimatedCostPerUnit,
      provider: item.providerDefault,
    })),
    planDiscounts: data.aiPlanDiscounts || AI_PLAN_DISCOUNTS,
    aiCostBreakdownByProvider: summarizeAiCostBreakdown(data, "provider"),
    aiCostBreakdownByModel: summarizeAiCostBreakdown(data, "model"),
    productionReadiness: buildProductionReadiness(),
    productionChecks: buildProductionChecks(data),
  };
}

function summarizeAiCost(data: AdminData): AiCostSummary {
  const successTasks = data.aiTasks.filter((task) => task.status === "success");
  const failedTasks = data.aiTasks.filter((task) => task.status !== "success");
  const totalEstimatedCost = Number(successTasks.reduce((sum, task) => sum + task.estimatedCost, 0).toFixed(2));
  const totalChargedCredits = successTasks.reduce((sum, task) => sum + task.chargedCredits, 0);
  const avgGrossMargin = successTasks.length
    ? Number((successTasks.reduce((sum, task) => sum + task.grossMargin, 0) / successTasks.length).toFixed(2))
    : 0;
  return {
    totalEstimatedCost,
    totalChargedCredits,
    successCount: successTasks.length,
    failedCount: failedTasks.length,
    avgGrossMargin,
  };
}

function summarizeAiCostBreakdown(data: AdminData, groupBy: "provider" | "model"): AiCostBreakdownRow[] {
  const grouped = new Map<string, AiTaskRecord[]>();
  for (const task of data.aiTasks) {
    const key = groupBy === "provider" ? task.provider : task.model;
    grouped.set(key, [...(grouped.get(key) || []), task]);
  }

  return Array.from(grouped.entries()).map(([key, tasks]) => {
    const successTasks = tasks.filter((task) => task.status === "success");
    const failedTasks = tasks.filter((task) => task.status !== "success");
    const estimatedCost = Number(successTasks.reduce((sum, task) => sum + task.estimatedCost, 0).toFixed(2));
    const chargedCredits = successTasks.reduce((sum, task) => sum + task.chargedCredits, 0);
    const avgGrossMargin = successTasks.length
      ? Number((successTasks.reduce((sum, task) => sum + task.grossMargin, 0) / successTasks.length).toFixed(2))
      : 0;
    return {
      key,
      label: key,
      estimatedCost,
      chargedCredits,
      successCount: successTasks.length,
      failedCount: failedTasks.length,
      avgGrossMargin,
    };
  }).sort((left, right) => right.chargedCredits - left.chargedCredits);
}

function recalculateUserBilling(data: AdminData) {
  const totalRechargeMap = new Map<string, number>();
  const totalConsumedMap = new Map<string, number>();
  const frozenMap = new Map<string, number>();
  const expiredMap = new Map<string, number>();

  for (const order of data.orders) {
    if (order.status === "paid") {
      totalRechargeMap.set(order.userId, (totalRechargeMap.get(order.userId) || 0) + order.amount);
    }
  }

  for (const entry of data.credits) {
    if (entry.delta >= 0) continue;
    const amount = Math.abs(entry.delta);
    if (entry.type.includes("冻结")) {
      frozenMap.set(entry.userId, (frozenMap.get(entry.userId) || 0) + amount);
      continue;
    }
    if (entry.type.includes("过期")) {
      expiredMap.set(entry.userId, (expiredMap.get(entry.userId) || 0) + amount);
      continue;
    }
    totalConsumedMap.set(entry.userId, (totalConsumedMap.get(entry.userId) || 0) + amount);
  }

  data.users = data.users.map((user) => ({
    ...user,
    totalRecharge: totalRechargeMap.get(user.id) ?? user.totalRecharge,
    totalConsumed: totalConsumedMap.get(user.id) ?? user.totalConsumed,
    frozenCredits: frozenMap.get(user.id) ?? user.frozenCredits,
    expiredCredits: expiredMap.get(user.id) ?? user.expiredCredits,
  }));
}

function ensureBillingConsistency(data: AdminData) {
  data.users = data.users.map((user) => ({
    ...user,
    plan: normalizePlanDisplayName(user.plan),
  }));
  data.orders = data.orders.map((order) => ({
    ...order,
    user: getRegisteredNameForOrder(order, data.users),
    userAccount: order.userAccount || getRegisteredNameForOrder(order, data.users),
    createdAt: formatAbsoluteSecondTime(resolveOrderCreatedAt(order)) || order.createdAt,
    paidAt: formatAbsoluteSecondTime(order.paidAt),
    notes: order.notes?.map((note) => ({
      ...note,
      createdAt: formatAbsoluteSecondTime(note.createdAt) || note.createdAt,
    })),
    paymentEvents: order.paymentEvents?.map((event) => ({
      ...event,
      createdAt: formatAbsoluteSecondTime(event.createdAt) || event.createdAt,
    })),
    refundEvents: order.refundEvents?.map((event) => ({
      ...event,
      createdAt: formatAbsoluteSecondTime(event.createdAt) || event.createdAt,
      flow: event.flow.map((node) => ({
        ...node,
        createdAt: formatAbsoluteSecondTime(node.createdAt),
      })),
    })),
  }));
  data.credits = data.credits.map((entry) => ({
    ...entry,
    createdAt: formatRelativeTime(entry.createdAt),
  }));
  data.auditLogs = data.auditLogs.map((log) => ({
    ...log,
    createdAt: formatAbsoluteSecondTime(log.createdAt) || log.createdAt,
  }));
  recalculateUserBilling(data);
}

function fullPayload(data: AdminData) {
  return {
    overview: dashboard(data),
    users: data.users,
    orders: data.orders,
    credits: data.credits,
    aiTasks: data.aiTasks,
    providers: data.providers,
    feedback: data.feedback,
    alerts: data.alerts,
    riskEvents: data.riskEvents,
    auditLogs: data.auditLogs,
    plans: data.plans,
    capabilityStatus: buildCapabilityStatus(),
    productionReadiness: buildProductionReadiness(),
    productionChecks: buildProductionChecks(data),
  };
}

function parsePath(pathname: string) {
  return pathname.replace(/^\/api\/admin\/?/, "").replace(/^\/+/, "").split("?")[0] || "overview";
}

function jsonError(status: number, error: string): AdminApiResult {
  return { status, body: { error } };
}

function getProviderTaskId(input: Pick<AiUsageRecordInput, "providerTaskId" | "providerTaskIds">) {
  return input.providerTaskId || input.providerTaskIds?.[0] || "provider-task-missing";
}

function hasConfirmation(body: Record<string, unknown>, expected: string) {
  return typeof body.confirmation === "string" && body.confirmation.trim() === expected;
}

function buildPaymentTimeline(order: PaymentOrder, credits: CreditLedgerEntry[], auditLogs: AuditLog[]) {
  return [
    {
      id: `${order.id}:created`,
      type: "订单创建",
      status: "pending",
      message: order.event || "订单已创建",
      createdAt: order.createdAt,
    },
    ...(order.paymentEvents || []).map((event) => ({
      id: event.id,
      type: event.type,
      status: event.status,
      message: event.message,
      createdAt: event.createdAt,
    })),
    ...credits.map((entry) => ({
      id: entry.id,
      type: entry.type,
      status: entry.delta >= 0 ? "success" : "pending",
      message: `${entry.reason} · ${entry.delta > 0 ? "+" : ""}${entry.delta} 积分`,
      createdAt: entry.createdAt,
    })),
    ...(order.refundEvents || []).map((event) => ({
      id: event.id,
      type: "退款处理",
      status: event.status === "failed" ? "failed" : event.status === "succeeded" ? "success" : "pending",
      message: `${event.currentStep || "退款处理中"} · ${event.reason} · 退款 ${event.amount} · 扣回 ${event.creditsDeducted} 积分`,
      createdAt: event.createdAt,
    })),
    ...auditLogs.map((log) => ({
      id: log.id,
      type: "审计",
      status: "success",
      message: `${log.actorName} · ${log.action}`,
      createdAt: log.createdAt,
    })),
  ].sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
}

function buildOrderDetail(data: AdminData, orderId: string) {
  const order = data.orders.find((item) => item.id === orderId);
  if (!order) return null;
  const creditEntries = data.credits.filter((entry) => entry.source === order.id);
  const auditEntries = data.auditLogs.filter((entry) => entry.target === order.id);
  const feedbackEntries = data.feedback.filter((entry) => entry.linkedOrderId === order.id);
  const user = data.users.find((item) => item.id === order.userId);

  return {
    order,
    user,
    creditEntries,
    auditEntries,
    feedbackEntries,
    notes: order.notes || [],
    paymentEvents: order.paymentEvents || [],
    refundEvents: order.refundEvents || [],
    timeline: buildPaymentTimeline(order, creditEntries, auditEntries),
  };
}

function buildAccountDetail(data: AdminData, userId: string) {
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;

  const orders = data.orders
    .filter((order) => order.userId === user.id)
    .sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const orderIds = new Set(orders.map((order) => order.id));
  const creditEntries = data.credits
    .filter((entry) => entry.userId === user.id || orderIds.has(entry.source))
    .sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const auditEntries = data.auditLogs
    .filter((entry) => entry.target === user.id || orderIds.has(entry.target))
    .sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const feedbackEntries = data.feedback
    .filter((entry) => entry.userId === user.id || (entry.linkedOrderId ? orderIds.has(entry.linkedOrderId) : false))
    .sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const paymentEvents = orders.flatMap((order) => (order.paymentEvents || []).map((event) => ({
    ...event,
    orderId: order.id,
    orderLabel: order.packageName,
  }))).sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const refundEvents = orders.flatMap((order) => (order.refundEvents || []).map((event) => ({
    ...event,
    orderId: order.id,
    orderLabel: order.packageName,
  }))).sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const notes = orders.flatMap((order) => (order.notes || []).map((note) => ({
    ...note,
    orderId: order.id,
    orderLabel: order.packageName,
  }))).sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));
  const timeline = [
    ...orders.flatMap((order) => buildPaymentTimeline(
      order,
      creditEntries.filter((entry) => entry.source === order.id),
      auditEntries.filter((entry) => entry.target === order.id),
    ).map((item) => ({
      ...item,
      orderId: order.id,
      orderLabel: order.packageName,
    }))),
    ...creditEntries
      .filter((entry) => !orderIds.has(entry.source))
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        status: entry.delta >= 0 ? "success" : "pending",
        message: `${entry.reason} · ${entry.delta > 0 ? "+" : ""}${entry.delta} 积分`,
        createdAt: entry.createdAt,
      })),
    ...auditEntries
      .filter((entry) => entry.target === user.id)
      .map((entry) => ({
        id: entry.id,
        type: "审计",
        status: "success",
        message: `${entry.actorName} · ${entry.action}`,
        createdAt: entry.createdAt,
      })),
  ].sort((left, right) => parseAdminTimestamp(right.createdAt) - parseAdminTimestamp(left.createdAt));

  return {
    user: {
      ...user,
      spent: user.totalRecharge ?? 0,
    },
    orders,
    creditEntries,
    auditEntries,
    feedbackEntries,
    paymentEvents,
    refundEvents,
    notes,
    timeline,
  };
}

export async function handleAdminApiRequest(
  method: string,
  pathname: string,
  authorization: unknown,
  payload: unknown = {}
): Promise<AdminApiResult> {
  const session = await getAdminSessionFromAuthorization(authorization);
  if (session.status !== 200) return session;

  const actor = toActor(session.body);
  const data = await loadAdminData();
  const route = parsePath(pathname);
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  if (method === "GET" && route === "session") {
    return session;
  }
  if (method === "GET" && (route === "overview" || route === "dashboard")) {
    return { status: 200, body: fullPayload(data) };
  }
  if (method === "GET" && route === "users") return { status: 200, body: { users: data.users } };
  const userDetailMatch = route.match(/^users\/([^/]+)\/detail$/);
  if (method === "GET" && userDetailMatch) {
    const detail = buildAccountDetail(data, userDetailMatch[1]);
    if (!detail) return jsonError(404, "用户不存在");
    return { status: 200, body: detail };
  }
  if (method === "GET" && route === "orders") return { status: 200, body: { orders: data.orders } };
  if (method === "POST" && route === "orders/external-collection") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return jsonError(400, "收款金额必须大于 0");
    const expectedCredits = Math.max(0, Math.round(Number(body.expectedCredits || 0)));
    const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : data.users[0]?.id;
    const user = data.users.find((item) => item.id === userId) || data.users[0];
    if (!user) return jsonError(404, "未找到可关联的用户账户");
    const packageName = typeof body.packageName === "string" && body.packageName.trim() ? body.packageName.trim() : "接口方代收确认";
    const collector = typeof body.collector === "string" && body.collector.trim() ? body.collector.trim() : "AI 接口方商户";
    const merchantOrderId = typeof body.merchantOrderId === "string" ? body.merchantOrderId.trim() : "";
    const providerTransactionId = typeof body.providerTransactionId === "string" ? body.providerTransactionId.trim() : "";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : "接口方确认已收到款项";
    const issueCredits = body.issueCredits === true;
    const recordedAt = nowIso();
    const order: PaymentOrder = {
      id: merchantOrderId || `ext_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
      userId: user.id,
      user: user.name,
      packageName,
      channel: "第三方代收",
      amount,
      expectedCredits,
      issuedCredits: issueCredits ? expectedCredits : 0,
      status: "paid",
      createdAt: recordedAt,
      paidAt: recordedAt,
      event: issueCredits ? "接口方代收确认并入账" : "接口方代收确认，待发积分",
      reconciliation: providerTransactionId || merchantOrderId ? "matched" : "pending",
      providerTransactionId: providerTransactionId || undefined,
      paymentEvents: [
        {
          id: `payevt_${Date.now().toString(36)}`,
          type: "external_collection_confirmed",
          status: "success",
          providerTransactionId: providerTransactionId || undefined,
          amount,
          signatureValid: undefined,
          message: `${collector} 确认收款：${note}`,
          createdAt: recordedAt,
        },
      ],
      notes: [
        {
          id: `note_${Date.now().toString(36)}`,
          actorId: actor.id,
          actorName: actor.username,
          content: `代收方：${collector}；${note}`,
          createdAt: recordedAt,
        },
      ],
    };

    data.orders = [order, ...data.orders].slice(0, 200);
    if (issueCredits && expectedCredits > 0) {
      user.credits += expectedCredits;
      user.totalRecharge += amount;
      user.lastSeen = "刚刚";
      data.credits = [
        {
          id: `cr_${Date.now().toString(36)}`,
          userId: user.id,
          user: user.name,
          type: "代收积分入账",
          delta: expectedCredits,
          reason: "接口方代收确认",
          source: order.id,
          operator: actor.username,
          createdAt: recordedAt,
        },
        ...data.credits,
      ].slice(0, 500);
    }
    const alert: OpsAlert = {
      id: `al_${crypto.randomUUID().slice(0, 8)}`,
      category: "支付",
      title: "接口方代收记录已登记",
      detail: `${order.id} · ${collector} 确认收款 ${amount}，${issueCredits ? "已发积分" : "待发积分/对账"}`,
      severity: providerTransactionId || merchantOrderId ? "info" : "warning",
      time: formatRelativeTime(recordedAt),
      owner: "Finance",
      unread: true,
      linkedSection: "orders",
    };
    data.alerts = [
      alert,
      ...data.alerts,
    ].slice(0, 50);
    appendAuditLog(data, actor, {
      action: "登记接口方代收记录",
      target: order.id,
      reason: note,
      after: {
        amount,
        expectedCredits,
        issueCredits,
        collector,
        merchantOrderId,
        providerTransactionId,
      },
    });
    await saveAdminData(data);
    return { status: 200, body: buildOrderDetail(data, order.id) };
  }
  const orderDetailMatch = route.match(/^orders\/([^/]+)$/);
  if (method === "GET" && orderDetailMatch) {
    const detail = buildOrderDetail(data, orderDetailMatch[1]);
    if (!detail) return jsonError(404, "订单不存在");
    return { status: 200, body: detail };
  }
  if (method === "GET" && route === "credits") return { status: 200, body: { credits: data.credits, users: data.users } };
  if (method === "GET" && route === "ai-tasks") return { status: 200, body: { aiTasks: data.aiTasks, providers: data.providers } };
  if (method === "GET" && route === "providers") return { status: 200, body: { providers: data.providers } };
  if (method === "GET" && route === "production-readiness") return { status: 200, body: { productionReadiness: buildProductionReadiness() } };
  if (method === "GET" && route === "production-checks") return { status: 200, body: { productionChecks: buildProductionChecks(data) } };
  if (method === "GET" && route === "feedback") return { status: 200, body: { feedback: data.feedback } };
  if (method === "GET" && route === "alerts") return { status: 200, body: { alerts: data.alerts } };
  if (method === "GET" && route === "audit-logs") return { status: 200, body: { auditLogs: data.auditLogs } };
  if (method === "GET" && route === "risk-events") return { status: 200, body: { riskEvents: data.riskEvents } };
  if (method === "GET" && route === "plans") return { status: 200, body: { plans: data.plans } };
  if (method === "GET" && route === "ai-billing-policies") {
    return {
      status: 200,
      body: {
        policies: data.aiBillingPolicies || AI_CREDIT_POLICIES,
        planDiscounts: data.aiPlanDiscounts || AI_PLAN_DISCOUNTS,
      },
    };
  }

  const userRoleMatch = route.match(/^users\/([^/]+)\/role$/);
  if (method === "POST" && userRoleMatch) {
    const userId = userRoleMatch[1];
    const role = typeof body.role === "string" ? body.role : "";
    const result = await updateAuthUserAdmin({
      actorId: actor.id,
      actorName: actor.username,
      userId,
      role: role as "viewer" | "support" | "finance" | "admin" | "super_admin",
    });
    if (result.status !== 200) return result;
    const updatedUser = result.body.user;
    const localUser = data.users.find((item) => item.id === userId);
    if (localUser) {
      localUser.role = updatedUser.role;
      localUser.plan = mapRoleToPlan(updatedUser.role);
    }
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const userStatusMatch = route.match(/^users\/([^/]+)\/status$/);
  if (method === "POST" && userStatusMatch) {
    const userId = userStatusMatch[1];
    const status = typeof body.status === "string" ? body.status : "";
    const authStatus = status === "blocked" ? "disabled" : "active";
    const result = await updateAuthUserAdmin({
      actorId: actor.id,
      actorName: actor.username,
      userId,
      status: authStatus,
    });
    if (result.status !== 200) return result;
    const localUser = data.users.find((item) => item.id === userId);
    if (localUser) {
      localUser.status = status === "blocked" ? "blocked" : status === "watch" ? "watch" : "normal";
    }
    appendAuditLog(data, actor, {
      action: "更新用户状态",
      target: userId,
      after: { status: localUser?.status },
    });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const orderNoteMatch = route.match(/^orders\/([^/]+)\/notes$/);
  if (method === "POST" && orderNoteMatch) {
    const order = data.orders.find((item) => item.id === orderNoteMatch[1]);
    if (!order) return jsonError(404, "订单不存在");
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return jsonError(400, "处理备注不能为空");
    const existingNote = order.notes?.[0];
    const note: OrderNote = existingNote
      ? {
        ...existingNote,
        actorId: actor.id,
        actorName: actor.username,
        content,
        createdAt: nowIso(),
      }
      : {
        id: `note_${Date.now().toString(36)}`,
        actorId: actor.id,
        actorName: actor.username,
        content,
        createdAt: nowIso(),
      };
    order.notes = [note];
    appendAuditLog(data, actor, {
      action: existingNote ? "覆盖订单处理备注" : "新增订单处理备注",
      target: order.id,
      reason: content,
    });
    await saveAdminData(data);
    return { status: 200, body: buildOrderDetail(data, order.id) };
  }

  if (method === "DELETE" && orderNoteMatch) {
    const order = data.orders.find((item) => item.id === orderNoteMatch[1]);
    if (!order) return jsonError(404, "订单不存在");
    if (!order.notes?.length) return jsonError(404, "订单备注不存在");
    order.notes = [];
    appendAuditLog(data, actor, {
      action: "删除订单处理备注",
      target: order.id,
    });
    await saveAdminData(data);
    return { status: 200, body: buildOrderDetail(data, order.id) };
  }

  const orderReissueMatch = route.match(/^orders\/([^/]+)\/reissue$/);
  if (method === "POST" && orderReissueMatch) {
    const order = data.orders.find((item) => item.id === orderReissueMatch[1]);
    if (!order) return jsonError(404, "订单不存在");
    if (!hasConfirmation(body, "CONFIRM_REISSUE_ORDER")) return jsonError(409, "人工补单需要二次确认");
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "后台人工补单";
    const before = { status: order.status, issuedCredits: order.issuedCredits, reconciliation: order.reconciliation };
    const paid = await markBillingOrderPaid({ orderId: order.id, actorName: `${actor.username} / 人工补单` });
    if (paid.status !== 200) return paid;
    const refreshed = await loadAdminData();
    const updatedOrder = refreshed.orders.find((item) => item.id === order.id);
    if (updatedOrder) {
      const paymentEvent: PaymentEvent = {
        id: `payevt_${Date.now().toString(36)}`,
        type: "manual_reissue",
        status: "success",
        amount: updatedOrder.amount,
        message: reason,
        createdAt: nowIso(),
      };
      updatedOrder.paymentEvents = [
        paymentEvent,
        ...(updatedOrder.paymentEvents || []),
      ].slice(0, 50);
      updatedOrder.event = "后台人工补单并入账";
      appendAuditLog(refreshed, actor, {
        action: "人工补单并入账",
        target: updatedOrder.id,
        reason,
        before,
        after: { status: updatedOrder.status, issuedCredits: updatedOrder.issuedCredits, reconciliation: updatedOrder.reconciliation },
      });
      await saveAdminData(refreshed);
      return { status: 200, body: buildOrderDetail(refreshed, updatedOrder.id) };
    }
    return jsonError(404, "订单不存在");
  }

  const orderRefundMatch = route.match(/^orders\/([^/]+)\/refund$/);
  if (method === "POST" && orderRefundMatch) {
    const order = data.orders.find((item) => item.id === orderRefundMatch[1]);
    if (!order) return jsonError(404, "订单不存在");
    if (!hasConfirmation(body, "CONFIRM_REFUND_ORDER")) return jsonError(409, "退款处理需要二次确认");
    if (order.status !== "paid") return jsonError(409, "只有已支付订单可以标记退款");
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "后台人工退款";
    const user = data.users.find((item) => item.id === order.userId);
    if (!user) return jsonError(404, "订单关联用户不存在");
    const before = { status: order.status, credits: user.credits, issuedCredits: order.issuedCredits };
    const creditsToDeduct = Math.min(user.credits, order.issuedCredits);
    const refundedAt = nowIso();
    order.status = "refunded";
    order.reconciliation = "matched";
    order.event = "后台标记退款";
    order.refundAmount = (order.refundAmount || 0) + order.amount;
    order.refundedCredits = (order.refundedCredits || 0) + creditsToDeduct;
    const refundFlow: RefundFlowNode[] = [
      {
        id: "request",
        label: "后台发起退款",
        status: "done",
        detail: `${actor.username} 已确认退款原因：${reason}`,
        createdAt: refundedAt,
      },
      {
        id: "credit_clawback",
        label: "平台积分扣回",
        status: "done",
        detail: creditsToDeduct > 0 ? `已从用户余额扣回 ${creditsToDeduct} 积分` : "用户可用余额不足，未扣回积分，需人工复核",
        createdAt: refundedAt,
      },
      {
        id: "provider_submit",
        label: "提交支付渠道退款",
        status: "current",
        detail: "等待接入微信/支付宝/威富通真实退款接口后提交渠道退款",
        createdAt: refundedAt,
      },
      {
        id: "provider_processing",
        label: "渠道退款处理中",
        status: "pending",
        detail: "等待第三方支付渠道返回处理状态",
      },
      {
        id: "refund_completed",
        label: "用户资金到账",
        status: "pending",
        detail: "等待渠道确认退款成功并记录到账时间",
      },
    ];
    const refundEvent: RefundEvent = {
      id: `refund_${Date.now().toString(36)}`,
      amount: order.amount,
      creditsDeducted: creditsToDeduct,
      reason,
      status: "submitted",
      currentStep: "提交支付渠道退款",
      flow: refundFlow,
      actorId: actor.id,
      actorName: actor.username,
      createdAt: refundedAt,
    };
    order.refundEvents = [
      refundEvent,
      ...(order.refundEvents || []),
    ].slice(0, 50);
    if (creditsToDeduct > 0) {
      user.credits = Math.max(0, user.credits - creditsToDeduct);
      data.credits = [
        {
          id: `cr_${Date.now().toString(36)}`,
          userId: user.id,
          user: user.name,
          type: "退款扣回",
          delta: -creditsToDeduct,
          reason,
          source: order.id,
          operator: actor.username,
          createdAt: refundedAt,
        },
        ...data.credits,
      ].slice(0, 500);
    }
    appendAuditLog(data, actor, {
      action: "订单退款处理",
      target: order.id,
      reason,
      before,
      after: { status: order.status, credits: user.credits, refundAmount: order.refundAmount, refundedCredits: order.refundedCredits },
    });
    await saveAdminData(data);
    return { status: 200, body: buildOrderDetail(data, order.id) };
  }

  if (method === "POST" && route === "credits/adjust") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    const delta = Number(body.delta);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "后台人工积分调整";
    const user = data.users.find((item) => item.id === userId);
    if (!user) return jsonError(404, "用户不存在");
    if (!Number.isFinite(delta) || delta === 0) return jsonError(400, "调整积分必须是非零数字");
    if (Math.abs(delta) >= 10000 && body.confirmHighRisk !== true) {
      return jsonError(409, "大额积分调整需要二次确认");
    }

    const before = { credits: user.credits };
    user.credits = Math.max(0, user.credits + delta);
    const entry: CreditLedgerEntry = {
      id: `cr_${Date.now()}`,
      userId: user.id,
      user: user.name,
      type: delta > 0 ? "人工补偿" : "人工扣减",
      delta,
      reason,
      source: "admin/manual-adjustment",
      operator: actor.username,
      createdAt: nowIso(),
    };
    data.credits = [entry, ...data.credits].slice(0, 500);
    createCreditGiftNotification(data, user, entry, delta);
    appendAuditLog(data, actor, {
      action: delta > 0 ? "人工增加积分" : "人工扣减积分",
      target: user.id,
      reason,
      before,
      after: { credits: user.credits, delta },
    });
    if (Math.abs(delta) >= 10000) {
      const riskEvent: RiskEvent = {
        id: `risk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
        title: "管理员大额人工调整",
        detail: `${actor.username} 对 ${user.name} 调整 ${delta.toLocaleString("zh-CN")} 积分，需复核原因：${reason}`,
        status: "open",
        severity: Math.abs(delta) >= 50000 ? "high" : "medium",
        target: user.id,
        createdAt: nowIso(),
      };
      data.riskEvents = [riskEvent, ...data.riskEvents].slice(0, 500);
      data.alerts = [{
        id: `al_${Date.now()}`,
        category: "积分",
        title: "管理员大额人工调整",
        detail: `${actor.username} 对 ${user.name} 调整 ${delta.toLocaleString("zh-CN")} 积分，需复核原因：${reason}`,
        severity: "warning",
        time: "刚刚",
        owner: "Risk",
        unread: true,
        linkedSection: "audit",
      }, ...data.alerts];
    }
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const feedbackMatch = route.match(/^feedback\/([^/]+)\/status$/);
  if (method === "POST" && feedbackMatch) {
    const id = feedbackMatch[1];
    const nextStatus = body.status;
    if (!["new", "processing", "waiting_user", "resolved", "closed"].includes(String(nextStatus))) {
      return jsonError(400, "反馈状态不合法");
    }
    const item = data.feedback.find((feedback) => feedback.id === id);
    if (!item) return jsonError(404, "反馈不存在");
    const before = { status: item.status };
    item.status = nextStatus as FeedbackStatus;
    item.updatedAt = nowIso();
    appendAuditLog(data, actor, {
      action: "更新反馈工单状态",
      target: id,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      before,
      after: { status: item.status },
    });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const alertMatch = route.match(/^alerts\/([^/]+)\/read$/);
  if (method === "POST" && alertMatch) {
    const id = alertMatch[1];
    const item = data.alerts.find((alert) => alert.id === id);
    if (!item) return jsonError(404, "消息不存在");
    item.unread = false;
    appendAuditLog(data, actor, { action: "标记告警已处理", target: id });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const riskEventMatch = route.match(/^risk-events\/([^/]+)\/status$/);
  if (method === "POST" && riskEventMatch) {
    const item = data.riskEvents.find((riskEvent) => riskEvent.id === riskEventMatch[1]);
    if (!item) return jsonError(404, "风险事件不存在");
    const nextStatus = typeof body.status === "string" ? body.status : "";
    if (nextStatus !== "reviewing" && nextStatus !== "mitigated") {
      return jsonError(400, "风险状态仅支持处理中或已缓解");
    }
    const handledAt = nowIso();
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : nextStatus === "mitigated" ? "已缓解" : "正在处理";
    const before = { status: item.status, resolution: item.resolution };
    item.status = nextStatus;
    item.handledBy = actor.username;
    item.handledAt = handledAt;
    item.notificationReadAt = handledAt;
    item.resolution = reason;
    appendAuditLog(data, actor, {
      action: nextStatus === "reviewing" ? "开始处理风控事件" : "关闭风控事件",
      target: item.id,
      reason,
      before,
      after: { status: item.status, handledBy: item.handledBy, handledAt: item.handledAt, resolution: item.resolution },
    });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const notificationReadMatch = route.match(/^notifications\/(order|alert|feedback|risk)\/([^/]+)\/read$/);
  if (method === "POST" && notificationReadMatch) {
    const [, source, id] = notificationReadMatch;
    const readAt = nowIso();
    const item = source === "order"
      ? data.orders.find((order) => order.id === id)
      : source === "alert"
        ? data.alerts.find((alert) => alert.id === id)
        : source === "feedback"
          ? data.feedback.find((feedback) => feedback.id === id)
          : data.riskEvents.find((riskEvent) => riskEvent.id === id);
    if (!item) return jsonError(404, "消息不存在");
    if ("unread" in item) item.unread = false;
    if (source !== "alert") {
      (item as PaymentOrder | FeedbackTicket | RiskEvent).notificationReadAt = readAt;
    }
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  const notificationDismissMatch = route.match(/^notifications\/(order|alert|feedback|risk)\/([^/]+)\/dismiss$/);
  if (method === "POST" && notificationDismissMatch) {
    const [, source, id] = notificationDismissMatch;
    const dismissedAt = nowIso();
    const item = source === "order"
      ? data.orders.find((order) => order.id === id)
      : source === "alert"
        ? data.alerts.find((alert) => alert.id === id)
        : source === "feedback"
          ? data.feedback.find((feedback) => feedback.id === id)
          : data.riskEvents.find((riskEvent) => riskEvent.id === id);
    if (!item) return jsonError(404, "消息不存在");
    item.notificationDismissedAt = dismissedAt;
    if ("unread" in item) item.unread = false;
    if (source !== "alert") {
      (item as PaymentOrder | FeedbackTicket | RiskEvent).notificationReadAt = dismissedAt;
    }
    appendAuditLog(data, actor, { action: "解除紧急消息警报", target: `${source}:${id}` });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }
  if (method === "POST" && route === "alerts/read-all") {
    const readAt = nowIso();
    data.alerts = data.alerts.map((alert) => ({ ...alert, unread: false }));
    data.orders = data.orders.map((order) => ({ ...order, notificationReadAt: readAt }));
    data.feedback = data.feedback.map((feedback) => ({ ...feedback, notificationReadAt: readAt }));
    data.riskEvents = data.riskEvents.map((riskEvent) => ({ ...riskEvent, notificationReadAt: readAt }));
    appendAuditLog(data, actor, { action: "全部标记消息已读", target: "notifications" });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  if (method === "POST" && route === "ai-billing-policies/save") {
    if (!hasConfirmation(body, "CONFIRM_AI_BILLING_POLICY")) {
      return jsonError(409, "更新 AI 扣分策略需要二次确认");
    }
    const policies = Array.isArray(body.policies) ? body.policies : [];
    const planDiscounts = Array.isArray(body.planDiscounts) ? body.planDiscounts : [];
    data.aiBillingPolicies = policies.map((item) => ({
      capability: String(item.capability),
      label: String(item.label),
      billingUnit: item.billingUnit === "per_image" ? "per_image" : "per_request",
      baseCredits: Number(item.baseCredits) || 1,
      perOutputCredits: Number(item.perOutputCredits) || 0,
      estimatedCostPerUnit: Number(item.estimatedCostPerUnit) || 0,
      providerDefault: String(item.providerDefault || item.provider || "OpenAI"),
    })) as AiBillingPolicy[];
    data.aiPlanDiscounts = planDiscounts.map((item) => ({
      planId: String(item.planId),
      multiplier: Number(item.multiplier) || 1,
      label: String(item.label || `${item.planId}`),
    })) as AiPlanDiscountPolicy[];

    appendAuditLog(data, actor, {
      action: "更新 AI 扣分策略",
      target: "ai-billing-policies",
      after: {
        policyCount: data.aiBillingPolicies.length,
        discountCount: data.aiPlanDiscounts.length,
      },
    });
    await saveAdminData(data);
    return { status: 200, body: fullPayload(data) };
  }

  return jsonError(404, "Unknown admin API route");
}

export async function getBillingSnapshotForUser(userId: string) {
  const data = await loadAdminData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;

  return {
    balance: user.credits,
    frozenCredits: user.frozenCredits,
    expiredCredits: user.expiredCredits,
    plan: normalizePlanDisplayName(user.plan),
    orders: data.orders.filter((item) => item.userId === userId).slice(0, 20).map((order) => ({
      id: order.id,
      planName: order.packageName,
      cycleLabel: "",
      paymentMethod: order.channel === "微信支付" ? "wechat" : "alipay",
      amount: order.amount,
      credits: order.expectedCredits,
      bonusCredits: 0,
      status: order.status === "paid" ? "paid" : "pending",
      createdAt: order.createdAt,
      paidAt: order.paidAt,
    })),
    ledger: data.credits.filter((item) => item.userId === userId).slice(0, 50),
  };
}

export async function getCreditGiftNotificationsForUser(userId: string) {
  const data = await loadAdminData();
  const user = data.users.find((item) => item.id === userId);

  return {
    balance: user?.credits ?? 0,
    notifications: data.creditNotifications
      .filter((item) => item.userId === userId && item.status === "unread")
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((item) => ({
        id: item.id,
        amount: item.amount,
        balance: item.balance,
        message: item.message,
        createdAt: item.createdAt,
      })),
  };
}

export async function acknowledgeCreditGiftNotification(userId: string, notificationId: string) {
  const data = await loadAdminData();
  const notification = data.creditNotifications.find((item) => item.id === notificationId && item.userId === userId);
  const user = data.users.find((item) => item.id === userId);
  if (!notification) {
    return {
      status: 404,
      body: {
        error: "积分通知不存在或已处理",
        balance: user?.credits ?? 0,
      },
    };
  }

  notification.status = "acknowledged";
  notification.acknowledgedAt = nowIso();
  await saveAdminData(data);
  return {
    status: 200,
    body: {
      ok: true,
      balance: user?.credits ?? notification.balance,
    },
  };
}

export async function createBillingOrder(params: {
  userId: string;
  username: string;
  planId: string;
  cycleId: string;
  paymentMethod: "wechat" | "alipay";
}) {
  const plan = MEMBERSHIP_PLANS.find((item) => item.id === params.planId);
  const cycle = BILLING_CYCLES.find((item) => item.id === params.cycleId);
  if (!plan || !cycle) {
    return { status: 400, body: { error: "套餐或周期不存在" } };
  }

  const quote = getPlanQuote(plan, cycle);
  const data = await loadAdminData();
  const user = ensureBillingUser(data, params);

  const orderCreatedAt = nowIso();
  const order: PaymentOrder = {
    id: `ord_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    userId: user.id,
    user: user.account || params.username,
    userAccount: user.account || params.username,
    userEmail: user.email,
    paymentDisplayName: `${plan.shortName} · ${user.account || params.username}`,
    packageName: plan.shortName,
    channel: params.paymentMethod === "wechat" ? "微信支付" : "支付宝",
    amount: quote.price,
    expectedCredits: quote.totalCredits,
    issuedCredits: 0,
    status: "pending",
    createdAt: orderCreatedAt,
    event: "订单已创建，等待支付",
    reconciliation: "pending",
  };

  data.orders = [order, ...data.orders].slice(0, 200);
  await saveAdminData(data);

  return {
    status: 200,
    body: {
      order: {
        id: order.id,
        planId: params.planId,
        cycleId: params.cycleId,
        planName: plan.shortName,
        cycleLabel: cycle.label,
        paymentMethod: params.paymentMethod,
        amount: quote.price,
        credits: quote.totalCredits,
        bonusCredits: quote.bonusCredits,
        status: "pending",
        createdAt: orderCreatedAt,
      },
    },
  };
}

export async function createCreditRechargeOrder(params: {
  userId: string;
  username: string;
  amount: number;
  paymentMethod: "wechat" | "alipay";
}) {
  const amount = Math.round(Number(params.amount));
  if (!Number.isFinite(amount) || amount < 10) {
    return { status: 400, body: { error: "充值金额不能低于 HKD 10" } };
  }
  if (amount % 5 !== 0) {
    return { status: 400, body: { error: "充值金额必须以 0 或 5 结尾" } };
  }

  const quote = quoteCreditRecharge(amount);
  const data = await loadAdminData();
  const user = ensureBillingUser(data, params);

  const orderCreatedAt = nowIso();
  const order: PaymentOrder = {
    id: `rch_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    userId: user.id,
    user: user.account || params.username,
    userAccount: user.account || params.username,
    userEmail: user.email,
    paymentDisplayName: `积分充值 · ${user.account || params.username}`,
    packageName: "积分充值",
    channel: params.paymentMethod === "wechat" ? "微信支付" : "支付宝",
    amount: quote.amount,
    expectedCredits: quote.credits,
    issuedCredits: 0,
    status: "pending",
    createdAt: orderCreatedAt,
    event: "充值订单已创建，等待支付",
    reconciliation: "pending",
  };

  data.orders = [order, ...data.orders].slice(0, 200);
  await saveAdminData(data);

  return {
    status: 200,
    body: {
      order: {
        id: order.id,
        planName: order.packageName,
        paymentMethod: params.paymentMethod,
        amount: quote.amount,
        credits: quote.credits,
        bonusCredits: 0,
        status: "pending",
        createdAt: orderCreatedAt,
      },
    },
  };
}

export async function getBillingOrderForPayment(orderId: string) {
  const data = await loadAdminData();
  const order = data.orders.find((item) => item.id === orderId);
  if (!order) return null;

  return {
    id: order.id,
    userId: order.userId,
    user: order.user,
    userAccount: order.userAccount,
    userEmail: order.userEmail,
    paymentDisplayName: getPaymentDisplayName(order),
    packageName: order.packageName,
    channel: order.channel,
    amount: order.amount,
    amountCents: Math.max(1, Math.round(order.amount * 100)),
    expectedCredits: order.expectedCredits,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

export async function markBillingOrderPaid(params: {
  orderId: string;
  actorName: string;
  expectedAmountCents?: number;
  providerTransactionId?: string;
  eventType?: string;
}) {
  const data = await loadAdminData();
  const order = data.orders.find((item) => item.id === params.orderId);
  if (!order) {
    return { status: 404, body: { error: "订单不存在" } };
  }

  if (typeof params.expectedAmountCents === "number") {
    const actualAmountCents = Math.max(1, Math.round(order.amount * 100));
    if (actualAmountCents !== params.expectedAmountCents) {
      order.reconciliation = "mismatch";
      order.event = "支付金额与本地订单不一致";
      await saveAdminData(data);
      return { status: 409, body: { error: "支付金额与本地订单不一致" } };
    }
  }

  const user = data.users.find((item) => item.id === order.userId);
  if (!user) {
    return { status: 404, body: { error: "订单关联用户不存在" } };
  }

  if (order.status !== "paid") {
    const paidAt = nowIso();
    order.status = "paid";
    order.issuedCredits = order.expectedCredits;
    order.reconciliation = "matched";
    order.event = "支付成功并入账";
    order.paidAt = paidAt;
    order.providerTransactionId = params.providerTransactionId || order.providerTransactionId;
    const paymentEvent: PaymentEvent = {
      id: `payevt_${Date.now().toString(36)}`,
      type: params.eventType || "payment_success",
      status: "success",
      providerTransactionId: params.providerTransactionId,
      amount: order.amount,
      signatureValid: true,
      message: `${params.actorName} 确认支付成功`,
      createdAt: paidAt,
    };
    order.paymentEvents = [
      paymentEvent,
      ...(order.paymentEvents || []),
    ].slice(0, 50);

    user.credits += order.expectedCredits;
    const paidMembershipPlan = getMembershipPlanFromName(order.packageName);
    if (paidMembershipPlan) {
      user.plan = paidMembershipPlan.name;
    } else if (!user.plan || String(user.plan).trim() === "积分充值") {
      user.plan = "Free";
    }
    user.lastSeen = "刚刚";

    data.credits = [
      {
        id: `cr_${Date.now().toString(36)}`,
        userId: user.id,
        user: user.name,
        type: "购买入账",
        delta: order.expectedCredits,
        reason: "订单支付成功",
        source: order.id,
        operator: params.actorName,
        createdAt: paidAt,
      },
      ...data.credits,
    ].slice(0, 500);

    appendAuditLog(data, {
      id: "billing",
      username: params.actorName,
    }, {
      action: "订单支付成功并入账",
      target: order.id,
      after: {
        issuedCredits: order.issuedCredits,
        balance: user.credits,
      },
    });
  }

  await saveAdminData(data);
  return {
    status: 200,
    body: {
      orderId: order.id,
      balance: user.credits,
      credits: order.expectedCredits,
      paidAt: order.paidAt,
    },
  };
}

export async function recordBillingPaymentCreated(params: {
  orderId: string;
  actorName: string;
  providerTransactionId?: string;
  paymentMethod: "wechat" | "alipay";
  payUrlType: "qr" | "redirect";
  service: string;
  paymentDisplayName?: string;
}) {
  const data = await loadAdminData();
  const order = data.orders.find((item) => item.id === params.orderId);
  if (!order) {
    return { status: 404, body: { error: "订单不存在" } };
  }

  const occurredAt = nowIso();
  const paymentDisplayName = params.paymentDisplayName?.trim() || getPaymentDisplayName(order);
  const paymentEvent: PaymentEvent = {
    id: `payevt_${Date.now().toString(36)}`,
    type: "wallyt_payment_created",
    status: "pending",
    providerTransactionId: params.providerTransactionId,
    amount: order.amount,
    message: `${params.actorName} 已创建${params.paymentMethod === "wechat" ? "微信" : "支付宝"}支付链接（${params.payUrlType === "qr" ? "扫码" : "跳转"}）：${paymentDisplayName}`,
    createdAt: occurredAt,
  };

  order.event = "已创建威富通支付链接，等待用户支付";
  order.providerTransactionId = params.providerTransactionId || order.providerTransactionId;
  order.paymentDisplayName = paymentDisplayName;
  order.paymentEvents = [
    paymentEvent,
    ...(order.paymentEvents || []),
  ].slice(0, 50);

  appendAuditLog(data, {
    id: "billing",
    username: params.actorName,
  }, {
    action: "创建威富通支付链接",
    target: order.id,
    after: {
      service: params.service,
      payUrlType: params.payUrlType,
      paymentDisplayName,
      userId: order.userId,
      userAccount: order.userAccount,
    },
  });

  await saveAdminData(data);
  return { status: 200, body: { orderId: order.id } };
}

export async function recordRiskEvent(input: RiskEventInput) {
  const data = await loadAdminData();
  const createdAt = nowIso();
  const riskEvent: RiskEvent = {
    id: `risk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    title: input.title,
    detail: input.detail,
    status: "open",
    severity: input.severity,
    target: input.target,
    createdAt,
  };
  data.riskEvents = [riskEvent, ...data.riskEvents].slice(0, 500);

  if (input.alert !== false) {
    const alert: OpsAlert = {
      id: `al_${crypto.randomUUID().slice(0, 8)}`,
      category: "风控",
      title: input.title,
      detail: input.detail,
      severity: input.severity === "high" ? "critical" : "warning",
      time: formatRelativeTime(createdAt),
      owner: "Risk",
      unread: true,
      linkedSection: input.linkedSection || "risk",
    };
    data.alerts = [alert, ...data.alerts].slice(0, 50);
  }

  appendAuditLog(data, {
    id: "risk",
    username: input.actorName || "risk-engine",
  }, {
    action: "记录风控事件",
    target: input.target,
    reason: input.title,
    after: riskEvent,
  });

  await saveAdminData(data);
  return riskEvent;
}

export async function recordBillingPaymentFailure(params: {
  orderId?: string;
  actorName: string;
  message: string;
  expectedAmountCents?: number;
  providerTransactionId?: string;
  signatureValid?: boolean;
  eventType?: string;
}) {
  const data = await loadAdminData();
  const order = params.orderId ? data.orders.find((item) => item.id === params.orderId) : undefined;
  const occurredAt = nowIso();
  const paymentEvent: PaymentEvent = {
    id: `payevt_${Date.now().toString(36)}`,
    type: params.eventType || "payment_failed",
    status: "failed",
    providerTransactionId: params.providerTransactionId,
    amount: typeof params.expectedAmountCents === "number" ? params.expectedAmountCents / 100 : order?.amount,
    signatureValid: params.signatureValid,
    message: params.message,
    createdAt: occurredAt,
  };

  if (order) {
    if (order.status !== "paid" && order.status !== "refunded") {
      order.status = "failed";
    }
    order.reconciliation = "mismatch";
    order.event = params.message;
    order.providerTransactionId = params.providerTransactionId || order.providerTransactionId;
    order.notificationReadAt = undefined;
    order.paymentEvents = [
      paymentEvent,
      ...(order.paymentEvents || []),
    ].slice(0, 50);
  }

  const alert: OpsAlert = {
    id: `al_${crypto.randomUUID().slice(0, 8)}`,
    category: "支付",
    title: order ? "威富通支付异常" : "威富通未知支付回调",
    detail: order ? `${order.id}：${params.message}` : params.message,
    severity: "critical",
    time: formatRelativeTime(occurredAt),
    owner: "Finance",
    unread: true,
    linkedSection: "orders",
  };
  data.alerts = [
    alert,
    ...data.alerts,
  ].slice(0, 50);
  const paymentRiskEvent: RiskEvent = {
    id: `risk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    title: order ? "支付订单异常" : "未知支付回调异常",
    detail: order ? `${order.id}：${params.message}` : params.message,
    status: "open",
    severity: params.signatureValid === false || !order ? "high" : "medium",
    target: order?.id || params.orderId || "unknown-payment",
    createdAt: occurredAt,
  };
  data.riskEvents = [
    paymentRiskEvent,
    ...data.riskEvents,
  ].slice(0, 500);

  appendAuditLog(data, {
    id: "billing",
    username: params.actorName,
  }, {
    action: order ? "订单支付异常" : "未知支付回调异常",
    target: order?.id || params.orderId || "unknown",
    reason: params.message,
    after: {
      providerTransactionId: params.providerTransactionId,
      signatureValid: params.signatureValid,
      expectedAmountCents: params.expectedAmountCents,
    },
  });

  await saveAdminData(data);
  return { status: order ? 200 : 404, body: order ? { order, paymentEvent } : { paymentEvent } };
}

export async function quoteAdminAiUsage(input: {
  capability: AiBillingCapability;
  outputCount?: number;
  planId?: string;
}) {
  const data = await loadAdminData();
  return quoteAiUsageFromData(data, input);
}

export async function recordAiUsage(input: AiUsageRecordInput) {
  const data = await loadAdminData();
  let user = data.users.find((item) => item.id === input.userId);
  if (!user) {
    user = {
      id: input.userId,
      name: input.username.split("@")[0] || input.username,
      email: input.username.includes("@") ? input.username : `${input.username}@example.com`,
      account: input.username,
      registeredAt: formatDateTime(nowIso()),
      loginMethod: input.username.includes("@artx.social") ? "social" : "email",
      role: "viewer",
      status: "normal",
      plan: "Free",
      organization: "个人",
      credits: 0,
      frozenCredits: 0,
      expiredCredits: 0,
      totalRecharge: 0,
      totalConsumed: 0,
      lastSeen: "刚刚",
      risk: "低",
    };
    data.users = [user, ...data.users];
  }

  const createdAt = nowIso();
  const quote = input.capabilityKey
    ? quoteAiUsageFromData(data, {
      capability: input.capabilityKey,
      outputCount: input.outputUnits || 1,
      planId: getPlanIdFromUserPlan(user.plan),
    })
    : null;
  const chargedCredits = input.status === "success"
    ? quote?.chargedCredits || Math.max(1, Math.round(input.chargedCredits || 0))
    : 0;
  const estimatedCost = quote?.estimatedCost ?? input.estimatedCost ?? 0;
  const record: AiTaskRecord = {
    id: `task_${Date.now().toString(36)}`,
    generationId: input.generationId || `gen_${Date.now().toString(36)}`,
    backendTaskId: input.backendTaskId || `backend_${Date.now().toString(36)}`,
    providerTaskId: getProviderTaskId(input),
    userId: user.id,
    user: user.name,
    capability: input.capability,
    provider: input.provider,
    model: input.model,
    status: input.status,
    latencyMs: input.latencyMs || 0,
    failureReason: input.failureReason || "",
    inputUnits: input.inputUnits || 0,
    outputUnits: input.outputUnits || 0,
    estimatedCost,
    chargedCredits,
    grossMargin: input.status === "success" && chargedCredits
      ? Number(((chargedCredits - (estimatedCost * 100)) / Math.max(chargedCredits, 1)).toFixed(2))
      : 0,
    createdAt,
  };

  data.aiTasks = [record, ...data.aiTasks].slice(0, 500);

  if (record.status === "success" && record.chargedCredits > 0) {
    user.credits = Math.max(0, user.credits - record.chargedCredits);
    data.credits = [
      {
        id: `cr_${Date.now().toString(36)}`,
        userId: user.id,
        user: user.name,
        type: "AI 消耗",
        delta: -record.chargedCredits,
        reason: `${record.capability} 成功执行`,
        source: record.generationId,
        operator: "系统",
        createdAt,
      },
      ...data.credits,
    ].slice(0, 500);
  } else if (record.status !== "success") {
    const failureAlert: OpsAlert = {
        id: `al_${Date.now().toString(36)}`,
        category: "报错",
        title: `AI 任务失败 · ${record.capability}`,
        detail: `${record.user} 的 ${record.model} 任务失败：${record.failureReason || record.status}`,
        severity: "warning",
        time: createdAt,
        owner: "AI Ops",
        unread: true,
        linkedSection: "integrations",
      };
    data.alerts = [failureAlert, ...data.alerts].slice(0, 50);
    const aiFailureRiskEvent: RiskEvent = {
      id: `risk_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
      title: `AI 任务失败 · ${record.capability}`,
      detail: `${record.user} 的 ${record.model} 任务失败：${record.failureReason || record.status}`,
      status: "open",
      severity: /无权访问|signature|token|credential|not configured|未配置|overloaded|No available/i.test(record.failureReason)
        ? "high"
        : "medium",
      target: record.id,
      createdAt,
    };
    data.riskEvents = [
      aiFailureRiskEvent,
      ...data.riskEvents,
    ].slice(0, 500);
  }

  await saveAdminData(data);
  return record;
}
