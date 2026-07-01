import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AI_CREDIT_POLICIES, AI_PLAN_DISCOUNTS, type AiBillingCapability, type AiBillingPolicy, type AiPlanDiscountPolicy } from "../shared/ai-credit-policy";
import { BILLING_CYCLES, MEMBERSHIP_PLANS, getPlanQuote, quoteCreditRecharge } from "../shared/billing-config";
import { getAdminSessionFromAuthorization, listAuthUsers, type PublicAuthUser, updateAuthUserAdmin } from "./auth-store";

type AdminStatus = "normal" | "watch" | "blocked";
type OrderStatus = "paid" | "pending" | "failed" | "refunded";
type FeedbackStatus = "new" | "processing" | "waiting_user" | "resolved" | "closed";
type AlertSeverity = "critical" | "warning" | "info";
type AlertCategory = "支付" | "报错" | "接口" | "额度" | "风控";
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
  linkedOrderId?: string;
  linkedTaskId?: string;
  createdAt: string;
  updatedAt: string;
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
};

type RiskEvent = {
  id: string;
  title: string;
  detail: string;
  status: RiskStatus;
  severity: "high" | "medium" | "low";
  target: string;
  createdAt: string;
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

function createAdminDataRepository(): AdminDataRepository {
  if (ADMIN_DATA_BACKEND !== "json") {
    throw new Error(`Unsupported ARTX_ADMIN_DATA_BACKEND=${ADMIN_DATA_BACKEND}. Use json until the Postgres adapter is implemented.`);
  }
  return new JsonAdminDataRepository(DATA_DIR, DATA_FILE);
}

const adminDataRepository = createAdminDataRepository();

function nowIso() {
  return new Date().toISOString();
}

function formatRelativeTime(input: string) {
  const timestamp = Date.parse(input);
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
    timeZone: "Asia/Shanghai",
  });
  return formatter.format(date).replace(/\//g, "-");
}

function envStatus(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key])) ? "configured" : "missing";
}

function mapRoleToPlan(role?: string) {
  if (role === "super_admin" || role === "admin") return "Business";
  if (role === "finance" || role === "support") return "Creator";
  return "Starter";
}

function getPlanIdFromUserPlan(planName?: string) {
  const normalized = String(planName || "").toLowerCase();
  const matched = MEMBERSHIP_PLANS.find((plan) => (
    normalized.includes(plan.id.toLowerCase())
    || normalized.includes(plan.shortName.toLowerCase())
    || normalized.includes(plan.name.toLowerCase())
  ));
  return matched?.id || "creator";
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

async function buildUserAccounts(seedUsers: AdminUserAccount[]) {
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
      email: authUser.username.includes("@") ? authUser.username : `${authUser.username}@example.com`,
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
    { id: "cap_plans", domain: "套餐与价格配置", status: "ready", summary: "已复用测试环境真实套餐/周期/积分配置作为后台展示来源", source: "shared/billing-config.ts + /api/admin/plans" },
    { id: "cap_ai", domain: "AI 任务与供应商", status: "ready", summary: "已具备 generationId / backendTaskId / providerTaskId 追踪和供应商配置状态展示", source: "server/ai-orchestrator.ts + server/image-generation.ts + /api/admin/ai-tasks" },
    { id: "cap_alerts", domain: "告警与消息提醒", status: "ready", summary: "后台可读写敏捷处理消息，并支持已读与审计", source: "/api/admin/alerts*" },
    { id: "cap_feedback", domain: "反馈与工单", status: "ready", summary: "已支持反馈列表与状态流转，且能写审计日志", source: "/api/admin/feedback*" },
    { id: "cap_audit", domain: "审计日志", status: "ready", summary: "后台写操作已统一写入 audit log", source: "/api/admin/audit-logs" },
    { id: "cap_orders", domain: "支付订单", status: "ready", summary: "已通过威富通接入微信/支付宝下单、回调验签、主动查询、异常告警和后台订单对账", source: "server/wallyt-payment.ts + /api/billing/* + /api/admin/orders" },
    { id: "cap_credits", domain: "积分与额度", status: "partial", summary: "后台已与服务端积分余额、流水、人工调整统一，但 AI 消耗账本仍未完全接入", source: "/api/billing/* + /api/admin/credits" },
    { id: "cap_risk", domain: "风控事件", status: "partial", summary: "后台已有风险事件、告警和大额调整预警，但缺真实风控规则引擎输入", source: "/api/admin/risk-events + alerts" },
  ];
}

async function seedAdminData(): Promise<AdminData> {
  const seedUsers: AdminUserAccount[] = [
    {
      id: "usr_1028",
      name: "林澈",
      email: "lin@example.com",
      account: "lin@example.com",
      registeredAt: "2026-06-05 09:16",
      loginMethod: "email",
      role: "viewer",
      status: "normal",
      plan: "Pro 20K",
      organization: "个人",
      credits: 18420,
      frozenCredits: 0,
      expiredCredits: 0,
      totalRecharge: 1299,
      totalConsumed: 1580,
      lastSeen: "3 分钟前",
      risk: "低",
    },
    {
      id: "usr_1071",
      name: "Mira Studio",
      email: "ops@mira.ai",
      account: "ops@mira.ai",
      registeredAt: "2026-06-01 14:22",
      loginMethod: "github",
      role: "viewer",
      status: "watch",
      plan: "Team 100K",
      organization: "Mira Studio",
      credits: 76310,
      frozenCredits: 0,
      expiredCredits: 1200,
      totalRecharge: 5980,
      totalConsumed: 23690,
      lastSeen: "18 分钟前",
      risk: "中",
    },
    {
      id: "usr_1189",
      name: "陈一鸣",
      email: "chen@example.com",
      account: "chen@example.com",
      registeredAt: "2026-06-12 18:03",
      loginMethod: "wechat",
      role: "viewer",
      status: "normal",
      plan: "Starter",
      organization: "个人",
      credits: 920,
      frozenCredits: 0,
      expiredCredits: 0,
      totalRecharge: 99,
      totalConsumed: 780,
      lastSeen: "1 小时前",
      risk: "低",
    },
    {
      id: "usr_1220",
      name: "北辰增长",
      email: "finance@beichen.co",
      account: "finance@beichen.co",
      registeredAt: "2026-05-28 11:45",
      loginMethod: "email",
      role: "viewer",
      status: "blocked",
      plan: "Enterprise",
      organization: "北辰增长",
      credits: 241900,
      frozenCredits: 80000,
      expiredCredits: 0,
      totalRecharge: 32000,
      totalConsumed: 178100,
      lastSeen: "昨天",
      risk: "高",
    },
  ];

  return {
    users: await buildUserAccounts(seedUsers),
    orders: [
      { id: "ord_90341", userId: "usr_1028", user: "林澈", packageName: "Pro 20K", channel: "支付宝", amount: 1299, expectedCredits: 20000, issuedCredits: 20000, status: "paid", createdAt: "今天 11:24", event: "支付成功并入账", reconciliation: "matched" },
      { id: "ord_90337", userId: "usr_1071", user: "Mira Studio", packageName: "Team 100K", channel: "支付宝", amount: 5980, expectedCredits: 100000, issuedCredits: 100000, status: "paid", createdAt: "今天 09:18", event: "支付成功并入账", reconciliation: "matched" },
      { id: "ord_90310", userId: "usr_1189", user: "陈一鸣", packageName: "Starter", channel: "微信支付", amount: 99, expectedCredits: 1200, issuedCredits: 0, status: "pending", createdAt: "昨天 21:06", event: "扣款成功，回调待确认", reconciliation: "pending" },
      { id: "ord_90288", userId: "usr_1220", user: "北辰增长", packageName: "Enterprise", channel: "Stripe", amount: 32000, expectedCredits: 500000, issuedCredits: 0, status: "failed", createdAt: "昨天 16:40", event: "渠道回调失败", reconciliation: "mismatch" },
    ],
    credits: [
      { id: "cr_771", userId: "usr_1028", user: "林澈", type: "购买入账", delta: 20000, reason: "订单支付成功", source: "ord_90341", operator: "支付宝回调", createdAt: "今天 11:24" },
      { id: "cr_769", userId: "usr_1071", user: "Mira Studio", type: "AI 消耗", delta: -3420, reason: "视频生成 x 12", source: "gen_8102", operator: "系统", createdAt: "今天 10:54" },
      { id: "cr_762", userId: "usr_1189", user: "陈一鸣", type: "人工补偿", delta: 500, reason: "支付延迟补偿", source: "ord_90310", operator: "Admin Eric", createdAt: "今天 12:06" },
      { id: "cr_758", userId: "usr_1220", user: "北辰增长", type: "风控冻结", delta: -80000, reason: "异常调用峰值", source: "risk_071", operator: "风控规则", createdAt: "昨天 16:51" },
    ],
    aiTasks: [
      { id: "task_8110", generationId: "gen_8110", backendTaskId: "image-task-8110", providerTaskId: "pw_4881", userId: "usr_1028", user: "林澈", capability: "商品背景生成", provider: "PicWish/佐糖", model: "visual-background", status: "success", latencyMs: 9200, failureReason: "", inputUnits: 1, outputUnits: 1, estimatedCost: 0.42, chargedCredits: 180, grossMargin: 0.61, createdAt: "今天 11:40" },
      { id: "task_8102", generationId: "gen_8102", backendTaskId: "image-task-8102", providerTaskId: "bkeel_task_771", userId: "usr_1071", user: "Mira Studio", capability: "批量图片生成", provider: "BKEEL", model: "gpt-image-2", status: "failed", latencyMs: 27800, failureReason: "供应商 5xx", inputUnits: 12, outputUnits: 0, estimatedCost: 1.64, chargedCredits: 0, grossMargin: 0, createdAt: "今天 10:51" },
      { id: "task_8099", generationId: "gen_8099", backendTaskId: "image-task-8099", providerTaskId: "gemini_2091", userId: "usr_1189", user: "陈一鸣", capability: "图片编辑", provider: "Gemini/Nano Banana", model: "gemini-image-edit", status: "success", latencyMs: 11400, failureReason: "", inputUnits: 1, outputUnits: 1, estimatedCost: 0.36, chargedCredits: 150, grossMargin: 0.58, createdAt: "昨天 22:16" },
      { id: "task_8088", generationId: "gen_8088", backendTaskId: "image-task-8088", providerTaskId: "openai_resp_492", userId: "usr_1220", user: "北辰增长", capability: "文案生成", provider: "OpenAI", model: "gpt-4.1-mini", status: "timeout", latencyMs: 30100, failureReason: "任务超时，可恢复", inputUnits: 6400, outputUnits: 1800, estimatedCost: 0.18, chargedCredits: 0, grossMargin: 0, createdAt: "昨天 16:49" },
    ],
    providers: [
      { id: "pay_wallyt", name: "威富通", category: "聚合支付", state: envStatus(["WALLYT_MCH_ID", "WALLYT_SIGNATURE_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 220, owner: "Finance", configLocation: "server env: WALLYT_*", credentialStatus: envStatus(["WALLYT_MCH_ID", "WALLYT_SIGNATURE_KEY"]), lastCheckedAt: "刚刚" },
      { id: "pay_wechat", name: "微信支付", category: "国内支付", state: envStatus(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_PRIVATE_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 226, owner: "Finance", configLocation: "server env: WECHAT_PAY_*", credentialStatus: envStatus(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_PRIVATE_KEY"]), lastCheckedAt: "刚刚" },
      { id: "pay_alipay", name: "支付宝", category: "国内支付", state: envStatus(["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 194, owner: "Finance", configLocation: "server env: ALIPAY_*", credentialStatus: envStatus(["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY"]), lastCheckedAt: "刚刚" },
      { id: "ai_openai", name: "OpenAI", category: "模型供应商", state: envStatus(["OPENAI_API_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 438, owner: "AI Ops", configLocation: "server env: OPENAI_*", credentialStatus: envStatus(["OPENAI_API_KEY"]), lastCheckedAt: "刚刚" },
      { id: "ai_bkeel", name: "BKEEL", category: "图片生成", state: envStatus(["BKEEL_API_KEY", "BKEEL_TOKEN"]) === "configured" ? "观察" : "未配置", latencyMs: 1240, owner: "AI Ops", configLocation: "server env: BKEEL_*", credentialStatus: envStatus(["BKEEL_API_KEY", "BKEEL_TOKEN"]), lastCheckedAt: "刚刚" },
      { id: "ai_picwish", name: "PicWish/佐糖", category: "图像处理", state: envStatus(["PICWISH_API_KEY"]) === "configured" ? "在线" : "未配置", latencyMs: 812, owner: "AI Ops", configLocation: "server env: PICWISH_*", credentialStatus: envStatus(["PICWISH_API_KEY"]), lastCheckedAt: "刚刚" },
      { id: "infra_render", name: "Render API", category: "部署与日志", state: "观察", latencyMs: 812, owner: "Infra", configLocation: "server env: RENDER_*", credentialStatus: envStatus(["RENDER_API_KEY"]), lastCheckedAt: "刚刚" },
    ],
    feedback: [
      { id: "fb_238", userId: "usr_1071", user: "Mira Studio", title: "批量生成时希望看到每个任务的积分预估", content: "希望提交批量任务前展示总积分消耗和失败退回规则。", module: "额度消耗", status: "new", priority: "P1", linkedTaskId: "task_8102", createdAt: "今天 10:20", updatedAt: "今天 10:20" },
      { id: "fb_231", userId: "usr_1028", user: "林澈", title: "支付成功后积分到账慢了 2 分钟", content: "支付完成页显示成功，但积分余额刷新延迟。", module: "支付", status: "processing", priority: "P0", linkedOrderId: "ord_90310", createdAt: "昨天 22:12", updatedAt: "昨天 22:20" },
      { id: "fb_218", userId: "usr_1189", user: "陈一鸣", title: "希望支持导出积分流水", content: "财务报销时需要导出 CSV。", module: "报表", status: "resolved", priority: "P2", createdAt: "6 月 18 日", updatedAt: "6 月 19 日" },
    ],
    alerts: [
      { id: "al_901", category: "支付", title: "微信支付回调待确认", detail: "ord_90310 已扣款但积分未入账，建议 15 分钟内补偿或重放回调。", severity: "critical", time: "2 分钟前", owner: "Finance", unread: true, linkedSection: "orders" },
      { id: "al_898", category: "报错", title: "模型任务队列出现 5xx", detail: "BKEEL 最近 10 分钟失败率 7.4%，影响高额度用户批量生成。", severity: "critical", time: "8 分钟前", owner: "AI Ops", unread: true, linkedSection: "integrations" },
      { id: "al_892", category: "接口", title: "Render API 延迟升高", detail: "任务状态同步平均 812ms，超过观察阈值，可能导致用户误以为任务卡住。", severity: "warning", time: "19 分钟前", owner: "Infra", unread: true, linkedSection: "integrations" },
      { id: "al_886", category: "额度", title: "北辰增长触发异常消耗", detail: "10 分钟内消耗 80K 积分，已冻结部分额度，等待人工复核。", severity: "warning", time: "昨天 16:51", owner: "Risk", unread: false, linkedSection: "risk" },
    ],
    riskEvents: [
      { id: "risk_071", title: "短时高消耗", detail: "北辰增长 10 分钟内消耗 80K 积分，超过套餐余额 35%。", status: "reviewing", severity: "high", target: "usr_1220", createdAt: "昨天 16:51" },
      { id: "risk_052", title: "人工大额赠送", detail: "超过 10,000 积分需要二次确认和原因记录。", status: "open", severity: "medium", target: "credits:manual-adjustment", createdAt: "今天 09:00" },
      { id: "risk_041", title: "多账号同设备", detail: "同设备注册 8 个账户，进入观察名单。", status: "mitigated", severity: "low", target: "device_82a", createdAt: "6 月 20 日" },
    ],
    auditLogs: [
      { id: "aud_001", actorId: "admin", actorName: "Admin Eric", action: "给陈一鸣补偿 500 积分", target: "usr_1189", reason: "支付延迟补偿", createdAt: "今天 12:06" },
      { id: "aud_002", actorId: "webhook", actorName: "支付宝 Webhook", action: "订单支付成功并入账", target: "ord_90341", createdAt: "今天 11:24" },
      { id: "aud_003", actorId: "risk-rule-07", actorName: "Risk Rule #07", action: "冻结北辰增长部分额度", target: "usr_1220", reason: "异常调用峰值", createdAt: "昨天 16:51" },
      { id: "aud_004", actorId: "support-ava", actorName: "客服 Ava", action: "将反馈标记为处理中", target: "fb_231", createdAt: "昨天 22:20" },
    ],
    plans: buildPricingPlans(),
    capabilityStatus: buildCapabilityStatus(),
  };
}

function normalizeData(value: Partial<AdminData>): AdminData {
  throw new Error("normalizeData is async-only");
}

async function normalizeDataAsync(value: Partial<AdminData>): Promise<AdminData> {
  const seed = await seedAdminData();
  return {
    users: Array.isArray(value.users) ? value.users : seed.users,
    orders: Array.isArray(value.orders) ? value.orders : seed.orders,
    credits: Array.isArray(value.credits) ? value.credits : seed.credits,
    aiTasks: Array.isArray(value.aiTasks) ? value.aiTasks : seed.aiTasks,
    providers: Array.isArray(value.providers) ? value.providers : seed.providers,
    feedback: Array.isArray(value.feedback) ? value.feedback : seed.feedback,
    alerts: Array.isArray(value.alerts) ? value.alerts : seed.alerts,
    riskEvents: Array.isArray(value.riskEvents) ? value.riskEvents : seed.riskEvents,
    auditLogs: Array.isArray(value.auditLogs) ? value.auditLogs : seed.auditLogs,
    plans: Array.isArray(value.plans) ? value.plans : seed.plans,
    capabilityStatus: Array.isArray(value.capabilityStatus) ? value.capabilityStatus : seed.capabilityStatus,
    aiBillingPolicies: Array.isArray(value.aiBillingPolicies) ? value.aiBillingPolicies : AI_CREDIT_POLICIES,
    aiPlanDiscounts: Array.isArray(value.aiPlanDiscounts) ? value.aiPlanDiscounts : AI_PLAN_DISCOUNTS,
  };
}

async function loadAdminData(): Promise<AdminData> {
  const stored = await adminDataRepository.load();
  if (stored) {
    const data = await normalizeDataAsync(stored);
    ensureBillingConsistency(data);
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
      { label: "额度流水", value: 92 },
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
  data.orders = data.orders.map((order) => ({
    ...order,
    createdAt: formatRelativeTime(order.createdAt),
    paidAt: order.paidAt,
  }));
  data.credits = data.credits.map((entry) => ({
    ...entry,
    createdAt: formatRelativeTime(entry.createdAt),
  }));
  data.auditLogs = data.auditLogs.map((log) => ({
    ...log,
    createdAt: formatRelativeTime(log.createdAt),
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
    capabilityStatus: data.capabilityStatus,
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
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
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
          type: "代收入账",
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
    const note: OrderNote = {
      id: `note_${Date.now().toString(36)}`,
      actorId: actor.id,
      actorName: actor.username,
      content,
      createdAt: nowIso(),
    };
    order.notes = [note, ...(order.notes || [])].slice(0, 50);
    appendAuditLog(data, actor, {
      action: "新增订单处理备注",
      target: order.id,
      reason: content,
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
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "后台人工额度调整";
    const user = data.users.find((item) => item.id === userId);
    if (!user) return jsonError(404, "用户不存在");
    if (!Number.isFinite(delta) || delta === 0) return jsonError(400, "调整额度必须是非零数字");
    if (Math.abs(delta) >= 10000 && body.confirmHighRisk !== true) {
      return jsonError(409, "大额额度调整需要二次确认");
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
    appendAuditLog(data, actor, {
      action: delta > 0 ? "人工增加积分" : "人工扣减积分",
      target: user.id,
      reason,
      before,
      after: { credits: user.credits, delta },
    });
    if (Math.abs(delta) >= 10000) {
      data.alerts = [{
        id: `al_${Date.now()}`,
        category: "额度",
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

  if (method === "POST" && route === "alerts/read-all") {
    data.alerts = data.alerts.map((alert) => ({ ...alert, unread: false }));
    appendAuditLog(data, actor, { action: "批量标记告警已读", target: "alerts" });
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
    plan: user.plan,
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
  let user = data.users.find((item) => item.id === params.userId);
  if (!user) {
    user = {
      id: params.userId,
      name: params.username.split("@")[0] || params.username,
      email: params.username.includes("@") ? params.username : `${params.username}@example.com`,
      account: params.username,
      registeredAt: formatDateTime(nowIso()),
      loginMethod: params.username.includes("@artx.social") ? "social" : "email",
      role: "viewer",
      status: "normal",
      plan: plan.shortName,
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

  const orderCreatedAt = nowIso();
  const order: PaymentOrder = {
    id: `ord_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    userId: user.id,
    user: user.name,
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
  let user = data.users.find((item) => item.id === params.userId);
  if (!user) {
    user = {
      id: params.userId,
      name: params.username.split("@")[0] || params.username,
      email: params.username.includes("@") ? params.username : `${params.username}@example.com`,
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
  }

  const orderCreatedAt = nowIso();
  const order: PaymentOrder = {
    id: `rch_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`,
    userId: user.id,
    user: user.name,
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
    user.plan = order.packageName;
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
      plan: "Starter",
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
  }

  await saveAdminData(data);
  return record;
}
