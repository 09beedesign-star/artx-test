import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PostgresJsonDocumentStore } from "./postgres-json-store";
import { buildVerificationCodeEmailHtml, sendUserEmailNotification } from "./notifications";
import { normalizeMainlandPhone, sendSmsVerificationCode } from "./sms-service";
import { listSelectableModelIds, normalizeAllowedModels } from "./model-router";
import {
  buildInviteSummary,
  evaluateBindingEligibility,
  evaluateRewardEligibility,
  findUserByInviteCode,
  generateUniqueInviteCode,
  getActiveInviteRewardConfig,
  type InviteRewardRuntimeConfig,
} from "./invite-rewards";
import { SIGNUP_IP_RATE_LIMIT } from "../shared/billing-config";
import {
  PHONE_AUTH_MESSAGES,
  type PhoneCodePurpose,
  phoneAccountUsername,
  validatePhoneAuthPassword,
} from "../shared/phone-auth-rules";

type AuthAction = "register" | "login" | "me" | "logout" | "social" | "forgot-password" | "reset-password" | "change-password" | "sms-send-code" | "sms-login" | "email-send-code" | "email-login" | "phone-send-code" | "phone-register" | "phone-login" | "phone-reset-password";
type AdminRole = "viewer" | "support" | "finance" | "admin" | "super_admin";

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  viewer: [],
  support: ["admin:access", "feedback:read", "feedback:write", "users:read"],
  finance: ["admin:access", "orders:read", "orders:refund", "credits:read", "credits:write"],
  admin: [
    "admin:access",
    "users:read",
    "users:write",
    "orders:read",
    "credits:read",
    "credits:write",
    "feedback:read",
    "feedback:write",
    "integrations:read",
    "risk:read",
    "audit:read",
  ],
  super_admin: [
    "admin:access",
    "users:read",
    "users:write",
    "orders:read",
    "orders:refund",
    "credits:read",
    "credits:write",
    "feedback:read",
    "feedback:write",
    "integrations:read",
    "integrations:write",
    "risk:read",
    "risk:write",
    "audit:read",
    "admins:manage",
  ],
};

interface StoredUser {
  id: string;
  username: string;
  loginKey: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  role?: AdminRole;
  permissions?: string[];
  allowedAiModels?: string[];
  status?: "active" | "disabled";
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
  failedLoginCount?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  /** 反作弊身份键（见 identityKeyOf）。仅用于风控判定，绝不用于登录查询。 */
  identityKey?: string;
  /** 注册来源 IP。历史账号没有此字段，风控判定必须容忍 undefined。 */
  signupIp?: string;
  /** 注册来源 User-Agent（截断存储）。同样容忍 undefined。 */
  signupUserAgent?: string;
  /** 邀请关系：邀请人的用户 id。注册时绑定，付费时才据此发奖。 */
  invitedBy?: string;
  /** 邀请关系绑定时间，用于判定绑定是否已过期。 */
  invitedAt?: string;
  /** 本人的邀请码，注册时生成，全局唯一。 */
  inviteCode?: string;
  /**
   * 是否暂停接受新的邀请绑定（用户自助开关，默认 false）。
   * 只影响「新人能不能绑到我名下」，不影响已有关系与已发积分。
   */
  inviteAcceptDisabled?: boolean;
  /** 是否已完成首次付费（奖励发放的唯一触发条件）。 */
  hasPaid?: boolean;
}

export type PublicAuthUser = ReturnType<typeof publicUser>;

interface StoredSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface StoredApiKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
  status?: "active" | "revoked";
}

interface SmsChallenge {
  phone: string;
  /**
   * 验证码用途。缺省（历史数据 / sms-login）= "login"。
   * ⚠️ 必须按 phone + purpose 区分：注册码不能拿去重置密码，反之亦然。
   */
  purpose?: "login" | PhoneCodePurpose;
  codeHash: string;
  sentAt: string;
  expiresAt: string;
  resendAfterAt: string;
  attempts: number;
  dailyKey: string;
  dailyCount: number;
}

interface EmailChallenge {
  email: string;
  purpose?: "login" | "password_reset";
  codeHash: string;
  sentAt: string;
  expiresAt: string;
  resendAfterAt: string;
  attempts: number;
  dailyKey: string;
  dailyCount: number;
}

interface AuthDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
  apiKeys?: StoredApiKey[];
  smsChallenges?: SmsChallenge[];
  emailChallenges?: EmailChallenge[];
  auditLogs?: AdminAuditLog[];
}

const DATA_DIR = process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data");
const DATA_FILE = path.join(DATA_DIR, "auth-users.json");
const AUTH_DATA_BACKEND = process.env.ARTX_AUTH_DATA_BACKEND || process.env.ARTX_ADMIN_DATA_BACKEND || "json";
const DEFAULT_ADMIN_ROLE: AdminRole = "super_admin";
const SESSION_TTL_MS = Number(process.env.ARTX_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const LOGIN_LOCK_THRESHOLD = Number(process.env.ARTX_LOGIN_LOCK_THRESHOLD || 5);
const LOGIN_LOCK_MS = Number(process.env.ARTX_LOGIN_LOCK_MS || 1000 * 60 * 15);
const SMS_CODE_TTL_MS = Number(process.env.SMS_CODE_TTL_MS || 5 * 60 * 1000);
const SMS_CODE_RESEND_MS = Number(process.env.SMS_CODE_RESEND_MS || 60 * 1000);
const SMS_CODE_DAILY_LIMIT = Number(process.env.SMS_CODE_DAILY_LIMIT || 10);
const SMS_CODE_MAX_ATTEMPTS = Number(process.env.SMS_CODE_MAX_ATTEMPTS || 5);
const EMAIL_CODE_TTL_MS = Number(process.env.EMAIL_CODE_TTL_MS || 10 * 60 * 1000);
const EMAIL_CODE_RESEND_MS = Number(process.env.EMAIL_CODE_RESEND_MS || 60 * 1000);
const EMAIL_CODE_DAILY_LIMIT = Number(process.env.EMAIL_CODE_DAILY_LIMIT || 10);
const EMAIL_CODE_MAX_ATTEMPTS = Number(process.env.EMAIL_CODE_MAX_ATTEMPTS || 5);

/**
 * 本地测试免登录开关。
 *
 * 仅在显式设置 ARTX_DEV_AUTO_LOGIN=true 且 NODE_ENV !== "production" 时生效。
 * 生产构建即使误设该变量也会被 NODE_ENV 兜底关闭，登录流程保持完整。
 */
const DEV_AUTO_LOGIN_TOKEN = "artx-dev-auto-login-token";
const DEV_AUTO_LOGIN_USERNAME = process.env.ARTX_DEV_AUTO_LOGIN_USERNAME || "dev-tester";
const DEV_AUTO_LOGIN_ROLE: AdminRole = "super_admin";

function isDevAutoLoginEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  return String(process.env.ARTX_DEV_AUTO_LOGIN || "").trim().toLowerCase() === "true";
}

export function getDevAutoLoginToken() {
  return isDevAutoLoginEnabled() ? DEV_AUTO_LOGIN_TOKEN : "";
}

interface AdminAuditLog {
  id: string;
  actorId: string;
  action: string;
  target: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// 保留给将来真正接入 OAuth 时使用（见 action === "social" 分支的注释）。
// ⚠️ 注意：仅仅「provider 合法」不构成身份证明，还必须校验第三方凭据并取到唯一用户 id。
export function normalizeProvider(value: unknown) {
  return value === "google" || value === "wechat" || value === "apple" || value === "github" || value === "meta" ? value : "";
}

function loginKey(username: string) {
  return username.toLowerCase();
}

/**
 * 反作弊用的「真实身份键」。与 loginKey 是两个不同的东西，务必分清：
 *
 * - loginKey：登录时查账号用，**必须保持与注册时字面一致**，
 *   任何归一化都会让存量用户登录不上，所以它永远只做 toLowerCase。
 * - identityKey：判断「这两个账号背后是不是同一个人」用，只在风控场景读，
 *   永远不参与登录查询。
 *
 * 归一化两件事，都是邮件服务商真实存在的投递行为：
 *   1. 去掉 local part 的 `+xxx` 后缀 —— a+1@gmail.com 与 a@gmail.com 进同一个收件箱
 *   2. Gmail / Googlemail 去掉 local part 里的点 —— a.b@gmail.com 与 ab@gmail.com 同上
 * 不做这一步，一个人用一个真实邮箱就能派生出无限个「不同账号」。
 */
export function identityKeyOf(username: string) {
  const value = String(username || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) {
    // 非邮箱账号（纯用户名）没有派生空间，原样返回即可。
    return value;
  }
  let local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) {
    local = local.slice(0, plus);
  }
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split(".").join("");
  }
  if (!local) {
    // 形如 "+foo@gmail.com" 这类畸形地址，退回未剥离的原值，避免归一化成空串后
    // 让所有畸形账号互相撞成同一个身份。
    return value;
  }
  return `${local}@${domain}`;
}

function publicUser(user: StoredUser) {
  const role = normalizeRole(user.role);
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    role,
    status: user.status === "disabled" ? "disabled" : "active",
    permissions: getUserPermissions({ ...user, role }),
    allowedAiModels: effectiveAllowedAiModels(user),
    isAdmin: canAccessAdmin({ ...user, role }),
  };
}

function effectiveAllowedAiModels(user: StoredUser) {
  return user.allowedAiModels === undefined
    ? listSelectableModelIds()
    : normalizeAllowedModels(user.allowedAiModels);
}

function normalizeRole(role: unknown): AdminRole {
  return role === "support" ||
    role === "finance" ||
    role === "admin" ||
    role === "super_admin"
    ? role
    : "viewer";
}

function getUserPermissions(user: Pick<StoredUser, "role" | "permissions">) {
  return Array.from(new Set([
    ...ROLE_PERMISSIONS[normalizeRole(user.role)],
    ...(Array.isArray(user.permissions) ? user.permissions : []),
  ])).sort();
}

function canAccessAdmin(user: Pick<StoredUser, "role" | "permissions">) {
  return getUserPermissions(user).includes("admin:access");
}

function hashPassword(password: string, salt: string) {
  return crypto.pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

function hashToken(token: string) {
  const secret = (process.env.ADMIN_SESSION_SECRET || "").trim();
  if (secret) {
    return crypto.createHmac("sha256", secret).update(token).digest("hex");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

interface CreateUserContext {
  /** 注册来源 IP，由路由层从请求头提取后透传。 */
  ip?: string;
  /** 注册来源 User-Agent，由路由层透传。 */
  userAgent?: string;
}

function createUser(
  username: string,
  password: string,
  role: AdminRole = "viewer",
  context: CreateUserContext = {},
): StoredUser {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    username,
    loginKey: loginKey(username),
    identityKey: identityKeyOf(username),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
    role,
    permissions: [],
    status: "active",
    signupIp: context.ip ? String(context.ip).slice(0, 64) : undefined,
    signupUserAgent: context.userAgent ? String(context.userAgent).slice(0, 256) : undefined,
  };
}

/**
 * 把 IP 归约成「网段键」，用于注册限频。
 *
 * ⚠️ 为什么按网段而不是精确 IP：家宽与移动网络的出口 IP 在同一 /24 内
 * 频繁漂移，按精确 IP 限频等于没限 —— 攻击者重拨一次就换一个 IP。
 *
 * ⚠️ IPv6 取前 4 组（≈ /64），这是运营商分配给单个家庭/终端的最小前缀，
 * 再粗会把整个城市的用户归成一段（误伤），再细则同样能被漂移绕过。
 *
 * 取不到 IP 时返回空串，调用方须视作「无法判定」并放行 ——
 * 宁可漏过也不能因为缺少请求头就把正常用户全拦死。
 */
export function signupRateLimitKeyOf(ip?: string): string {
  const raw = (ip || "").trim();
  if (!raw) return "";
  // 兼容 "::ffff:1.2.3.4" 这类 IPv4-mapped 形式
  const normalized = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  if (normalized.includes(":")) {
    const groups = normalized.split(":").filter(Boolean);
    return `v6:${groups.slice(0, 4).join(":")}`;
  }
  const octets = normalized.split(".");
  if (octets.length !== 4) return "";
  return `v4:${octets.slice(0, 3).join(".")}`;
}

/** 精确 IP 归一化（只做 IPv4-mapped 展开），用于「同一台机器」判定。 */
function exactIpKeyOf(ip?: string): string {
  const raw = (ip || "").trim();
  if (!raw) return "";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

/**
 * 判断注册是否应被限频。**两层判定，任一超限即拦**：
 *   ① 精确 IP —— 超过 maxPerWindow（3）次
 *   ② /24 网段 —— 超过 maxPerSubnetWindow（30）次
 *
 * ⚠️ 为什么不能只用网段：一个 /24 有 254 个地址，可能是整栋写字楼。
 * 只按网段限 3 次会让「同事互相邀请注册」这种正常场景在第 4 个人就失败。
 * 精确 IP 才是刷号的强信号（脚本一般不换 IP），所以它收紧、网段放宽。
 *
 * 直接数 db.users 里的历史注册记录，不引入内存计数器 ——
 * 内存计数会在进程重启后清零，而重启是攻击者最容易触发的事情之一
 * （也可能只是一次部署）。数据库里的 createdAt + signupIp 是唯一可信来源。
 */
function isSignupRateLimited(db: AuthDatabase, ip?: string, now = new Date()): boolean {
  const subnetKey = signupRateLimitKeyOf(ip);
  // 拿不到 IP 就放行，见 signupRateLimitKeyOf 说明。
  if (!subnetKey) return false;
  const exactKey = exactIpKeyOf(ip);
  const windowStart = now.getTime() - SIGNUP_IP_RATE_LIMIT.windowHours * 60 * 60 * 1000;
  let exactCount = 0;
  let subnetCount = 0;
  for (const user of db.users) {
    const createdAt = new Date(user.createdAt || 0).getTime();
    if (!Number.isFinite(createdAt) || createdAt < windowStart) continue;
    if (signupRateLimitKeyOf(user.signupIp) !== subnetKey) continue;
    subnetCount += 1;
    if (exactKey && exactIpKeyOf(user.signupIp) === exactKey) {
      exactCount += 1;
    }
    if (exactCount >= SIGNUP_IP_RATE_LIMIT.maxPerWindow) return true;
    if (subnetCount >= SIGNUP_IP_RATE_LIMIT.maxPerSubnetWindow) return true;
  }
  return false;
}

function getBootstrapAdmin() {
  const username = normalizeUsername(process.env.ARTX_BOOTSTRAP_ADMIN_USERNAME);
  const password = typeof process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD === "string"
    ? process.env.ARTX_BOOTSTRAP_ADMIN_PASSWORD
    : "";

  if (!username && !password) return null;
  if (!username || password.trim().length < 12) {
    throw new Error("ARTX_BOOTSTRAP_ADMIN_USERNAME and a 12+ character ARTX_BOOTSTRAP_ADMIN_PASSWORD are required for admin bootstrap");
  }
  return { username, password };
}

const authPostgresStore = AUTH_DATA_BACKEND === "postgres"
  ? new PostgresJsonDocumentStore<AuthDatabase>(process.env.DATABASE_URL || "", "auth-users")
  : null;

/** 同一把 API key 的 lastUsedAt 最短落盘间隔。 */
const API_KEY_LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * ⚠️⚠️⚠️ auth-users 写锁（2026-10-24）。
 *
 * auth-users 是一整行 JSON（全站用户/会话/API key/审计日志），所有写入都是
 * 「读整份 → 改一处 → 写整份」。不加锁时两个请求并发，后写的整份抹掉先写的，
 * 双方都返回成功（线上实测：同账号并发建 10 把 key 只落库 7 把）。
 *
 * 规则：**任何会 saveDatabase 的路径都必须在 withAuthWriteLock 内完成「读 + 写」**。
 * - Postgres：事务 + pg_advisory_xact_lock，跨进程/多实例都有效；
 * - JSON（本地/测试）：进程内串行队列。
 * - 可重入：锁内再调 withAuthWriteLock / mutateDatabase 直接复用当前锁。
 * - ⚠️ 锁内禁止慢速外部 IO（发短信/邮件），否则整站登录排队。
 * - admin-store 改积分也必须走这里（updateAuthUserCreditsSnapshot），
 *   自己 new 一个 store 直接 save 等于绕过锁。
 */
type AuthTxContext = {
  active: boolean;
  tx: { load(): Promise<Partial<AuthDatabase> | null>; save(data: AuthDatabase): Promise<void> } | null;
};
const authTxStorage = new AsyncLocalStorage<AuthTxContext>();
let authJsonWriteChain: Promise<unknown> = Promise.resolve();

function currentAuthTx() {
  const ctx = authTxStorage.getStore();
  return ctx?.active ? ctx : undefined;
}

async function withAuthWriteLock<R>(fn: () => Promise<R>): Promise<R> {
  if (currentAuthTx()) return fn();

  const runInContext = async (tx: AuthTxContext["tx"]) => {
    const ctx: AuthTxContext = { active: true, tx };
    try {
      return await authTxStorage.run(ctx, fn);
    } finally {
      // 锁释放后，残留的异步回调不能再拿着已归还的连接读写。
      ctx.active = false;
    }
  };

  /**
   * 两层锁，顺序不能反：
   * 1. 进程内串行队列 —— 保证本进程同一时刻最多只有 1 个连接卡在 advisory lock 上。
   *    ⚠️ 不加这层的话：连接池 max=5，5 个并发写各占一个连接排队等锁，
   *    持锁者内部再要连接（读 admin-data 邀请配置）就拿不到 → 5 秒超时报错，
   *    且同池的全站其他查询一起饿死。
   * 2. Postgres 事务 + advisory lock —— 跨进程/多实例互斥。
   */
  const run = () => authPostgresStore
    ? authPostgresStore.transaction((tx) => runInContext(tx))
    : runInContext(null);
  const result = authJsonWriteChain.then(run, run);
  authJsonWriteChain = result.catch(() => undefined);
  return result;
}

/** 在写锁内读取最新数据、修改、写回。fn 只做内存修改，不要 save。 */
async function mutateDatabase<R>(fn: (db: AuthDatabase) => R | Promise<R>): Promise<R> {
  return withAuthWriteLock(async () => {
    const db = await loadDatabase();
    const result = await fn(db);
    await saveDatabase(db);
    return result;
  });
}

/**
 * admin-store 发积分后，把余额快照同步到 auth-users.users[].credits。
 * 必须走这里而不是在 admin-store 里自己 load/save —— 那样会绕过写锁，
 * 且历史上还因只写回 `{ users }` 抹掉过全站 API key 与会话（0d4453e）。
 */
export async function updateAuthUserCreditsSnapshot(userId: string, credits: number): Promise<boolean> {
  return mutateDatabase((db) => {
    const user = db.users.find((item) => item.id === userId) as (StoredUser & { credits?: number }) | undefined;
    if (!user) return false;
    user.credits = credits;
    return true;
  });
}

async function loadDatabase(): Promise<AuthDatabase> {
  /**
   * 读取时的自愈写入（JSON 损坏恢复 / 冷启动补管理员 / dev 免登会话）。
   * ⚠️ 这些写也是整份覆盖：不在锁内时绝不能直接 save，而是进锁重读重做一遍，
   * 否则会用这份旧快照抹掉别人刚写入的数据。
   */
  let dirty = false;
  let db: AuthDatabase = { users: [], sessions: [], smsChallenges: [], auditLogs: [] };

  if (authPostgresStore) {
    const tx = currentAuthTx()?.tx;
    const stored = tx ? await tx.load() : await authPostgresStore.load();
    if (stored) {
      db = normalizeDatabase(stored);
    }
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DATA_FILE, "utf-8");
      const parsed = parseAuthDatabase(raw);
      db = parsed.db;
      if (parsed.recovered) dirty = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }

  const hasActiveAdmin = db.users.some((user) => canAccessAdmin(user) && user.status !== "disabled");
  const bootstrapAdmin = getBootstrapAdmin();
  if (!hasActiveAdmin && bootstrapAdmin) {
    const existing = db.users.find((user) => user.loginKey === loginKey(bootstrapAdmin.username));
    const admin = existing || createUser(bootstrapAdmin.username, bootstrapAdmin.password, DEFAULT_ADMIN_ROLE);
    admin.role = DEFAULT_ADMIN_ROLE;
    admin.permissions = [];
    admin.status = "active";
    admin.failedLoginCount = 0;
    admin.lockedUntil = undefined;
    if (!existing) {
      db.users.push(admin);
    }
    appendAuditLog(db, {
      actorId: "system",
      action: "admin.bootstrap",
      target: admin.id,
      meta: { username: bootstrapAdmin.username, role: DEFAULT_ADMIN_ROLE },
    });
    dirty = true;
  }

  if (isDevAutoLoginEnabled() && ensureDevAutoLoginSession(db)) {
    dirty = true;
  }

  if (dirty) {
    if (!currentAuthTx()) return withAuthWriteLock(() => loadDatabase());
    await saveDatabase(db);
  }

  return db;
}

/**
 * 为本地测试播种一个固定的测试账号与长期会话。
 * 走的是真实的 users / sessions 结构，因此所有后端鉴权逻辑保持原样不变。
 */
/** 只改内存，返回是否有改动；落盘由 loadDatabase 在写锁内统一完成。 */
function ensureDevAutoLoginSession(db: AuthDatabase): boolean {
  let changed = false;

  let user = db.users.find((item) => item.loginKey === loginKey(DEV_AUTO_LOGIN_USERNAME));
  if (!user) {
    user = createUser(DEV_AUTO_LOGIN_USERNAME, crypto.randomBytes(24).toString("hex"), DEV_AUTO_LOGIN_ROLE);
    db.users.push(user);
    changed = true;
  }
  if (user.role !== DEV_AUTO_LOGIN_ROLE || user.status !== "active") {
    user.role = DEV_AUTO_LOGIN_ROLE;
    user.status = "active";
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    changed = true;
  }

  const tokenHash = hashToken(DEV_AUTO_LOGIN_TOKEN);
  const existingSession = db.sessions.find((item) => item.tokenHash === tokenHash);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  if (!existingSession) {
    db.sessions.push({
      tokenHash,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
    changed = true;
  } else {
    // 会话即将过期时自动续期，避免本地测试期间被踢出登录。
    if (existingSession.userId !== user.id) {
      existingSession.userId = user.id;
      changed = true;
    }
    if (Date.parse(existingSession.expiresAt) - Date.now() < SESSION_TTL_MS / 2) {
      existingSession.expiresAt = expiresAt;
      changed = true;
    }
  }

  return changed;
}

function normalizeDatabase(parsed: Partial<AuthDatabase>): AuthDatabase {
  const now = Date.now();
  return {
    users: Array.isArray(parsed.users)
      ? parsed.users.map((user) => ({
        ...user,
        role: normalizeRole(user.role),
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        allowedAiModels: Array.isArray(user.allowedAiModels)
          ? normalizeAllowedModels(user.allowedAiModels)
          : undefined,
        status: user.status === "disabled" ? "disabled" : "active",
        failedLoginCount: Number(user.failedLoginCount || 0),
      }))
      : [],
    sessions: Array.isArray(parsed.sessions)
      ? parsed.sessions.filter((session) => !session.expiresAt || Date.parse(session.expiresAt) > Date.now())
      : [],
    apiKeys: Array.isArray(parsed.apiKeys)
      ? parsed.apiKeys
        .filter((key) => key?.id && key?.userId && key?.keyHash && key?.prefix)
        .map((key) => ({
          ...key,
          status: key.status === "revoked" ? "revoked" : "active",
        }))
      : [],
    smsChallenges: Array.isArray(parsed.smsChallenges)
      ? parsed.smsChallenges.filter((challenge) =>
        challenge.phone &&
        challenge.expiresAt &&
        Date.parse(challenge.expiresAt) > now
      )
      : [],
    emailChallenges: Array.isArray(parsed.emailChallenges)
      ? parsed.emailChallenges.filter((challenge) =>
        challenge.email &&
        challenge.expiresAt &&
        Date.parse(challenge.expiresAt) > now
      )
      : [],
    auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
  };
}

function parseAuthDatabase(raw: string): { db: AuthDatabase; recovered: boolean } {
  try {
    return { db: normalizeDatabase(JSON.parse(raw) as Partial<AuthDatabase>), recovered: false };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }

  const candidates = extractTopLevelJsonObjects(raw);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return { db: normalizeDatabase(JSON.parse(candidates[index]) as Partial<AuthDatabase>), recovered: true };
    } catch {
      // Try the previous complete object.
    }
  }

  throw new SyntaxError("Auth database is corrupted and could not be recovered");
}

function extractTopLevelJsonObjects(raw: string) {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0) {
        objects.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

async function saveDatabase(db: AuthDatabase) {
  if (authPostgresStore) {
    const tx = currentAuthTx()?.tx;
    if (tx) {
      await tx.save(db);
      return;
    }
    // 走到这里说明有写入路径漏包 withAuthWriteLock（或是 loadDatabase 内的
    // 冷启动补齐）。留日志，便于发现新的漏网之鱼。
    console.warn("[auth-store] saveDatabase outside write lock", new Error().stack?.split("\n")[2]?.trim());
    await authPostgresStore.save(db);
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
  await fs.rename(tmpFile, DATA_FILE);
}

function generateResetToken() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateSmsCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function phoneUsername(phone: string) {
  return phoneAccountUsername(phone);
}

function smsChallengePurpose(challenge: SmsChallenge) {
  return challenge.purpose || "login";
}

function isSameSmsChallenge(challenge: SmsChallenge, phone: string, purpose: SmsChallenge["purpose"]) {
  return challenge.phone === phone && smsChallengePurpose(challenge) === (purpose || "login");
}

function findSmsChallenge(db: AuthDatabase, phone: string, purpose: SmsChallenge["purpose"]) {
  return (db.smsChallenges || []).find((item) => isSameSmsChallenge(item, phone, purpose));
}

function removeSmsChallenge(db: AuthDatabase, phone: string, purpose: SmsChallenge["purpose"]) {
  db.smsChallenges = (db.smsChallenges || []).filter((item) => !isSameSmsChallenge(item, phone, purpose));
}

/**
 * 校验短信验证码（命中则不删除，由调用方在业务成功后删除）。
 * 返回 null 表示通过；否则返回需要直接回给前端的结果（调用方负责 save）。
 */
function verifySmsChallenge(
  db: AuthDatabase,
  phone: string,
  purpose: PhoneCodePurpose,
  code: string,
): { status: number; body: { error: string } } | null {
  pruneSmsChallenges(db);
  const challenge = findSmsChallenge(db, phone, purpose);
  if (!challenge) {
    return { status: 400, body: { error: PHONE_AUTH_MESSAGES.codeInvalidOrExpired } };
  }
  if (challenge.attempts >= SMS_CODE_MAX_ATTEMPTS) {
    removeSmsChallenge(db, phone, purpose);
    return { status: 429, body: { error: PHONE_AUTH_MESSAGES.codeTooManyAttempts } };
  }
  if (challenge.codeHash !== hashToken(`${purpose}:${phone}:${code}`)) {
    challenge.attempts = Number(challenge.attempts || 0) + 1;
    return { status: 401, body: { error: PHONE_AUTH_MESSAGES.codeWrong } };
  }
  return null;
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function currentDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function pruneSmsChallenges(db: AuthDatabase) {
  const now = Date.now();
  db.smsChallenges = (db.smsChallenges || []).filter((challenge) =>
    challenge.expiresAt &&
    Date.parse(challenge.expiresAt) > now
  );
}

function pruneEmailChallenges(db: AuthDatabase) {
  const now = Date.now();
  db.emailChallenges = (db.emailChallenges || []).filter((challenge) =>
    challenge.expiresAt &&
    Date.parse(challenge.expiresAt) > now
  );
}

function emailChallengePurpose(challenge: EmailChallenge) {
  return challenge.purpose || "login";
}

function findEmailChallenge(db: AuthDatabase, email: string, purpose: "login" | "password_reset") {
  return (db.emailChallenges || []).find((item) => item.email === email && emailChallengePurpose(item) === purpose);
}

function removeEmailChallenge(db: AuthDatabase, email: string, purpose: "login" | "password_reset") {
  db.emailChallenges = (db.emailChallenges || []).filter((item) =>
    !(item.email === email && emailChallengePurpose(item) === purpose)
  );
}

function createSession(db: AuthDatabase, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = new Date();
  db.sessions.push({
    tokenHash: hashToken(token),
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

function appendAuditLog(
  db: AuthDatabase,
  log: Omit<AdminAuditLog, "id" | "createdAt">
) {
  db.auditLogs = [
    ...(db.auditLogs || []),
    {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...log,
    },
  ].slice(-500);
}

function getBearerToken(payload: Record<string, unknown>) {
  const token = payload.token;
  return typeof token === "string" ? token.trim() : "";
}

function getBearerTokenFromHeader(value: unknown) {
  if (typeof value !== "string") return "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function getUserByToken(token: string) {
  const db = await loadDatabase();
  const session = token ? db.sessions.find((item) => item.tokenHash === hashToken(token)) : undefined;
  if (session?.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
    // 锁内重读再删，避免拿旧快照写回抹掉别人的并发修改。
    const expiredHash = session.tokenHash;
    await mutateDatabase((fresh) => {
      fresh.sessions = fresh.sessions.filter((item) => item.tokenHash !== expiredHash);
    });
    return { db, session: undefined, user: undefined };
  }
  const user = session ? db.users.find((item) => item.id === session.userId) : undefined;
  return { db, session, user };
}

export async function getSessionUserFromAuthorization(authorization: unknown) {
  const token = getBearerTokenFromHeader(authorization);
  const { user } = await getUserByToken(token);

  if (!user) {
    return { status: 401 as const, body: { error: "登录已失效，请重新登录" } };
  }

  return { status: 200 as const, body: { user: publicUser(user) } };
}

function createApiKeyValue() {
  return `artx_sk_${crypto.randomBytes(32).toString("base64url")}`;
}

export async function listApiKeysForAuthorization(authorization: unknown) {
  const session = await getSessionUserFromAuthorization(authorization);
  if (session.status !== 200 || !("user" in session.body)) return session;
  const db = await loadDatabase();
  const keys = (db.apiKeys || [])
    .filter((key) => key.userId === session.body.user.id && key.status !== "revoked")
    .map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      status: key.status || "active",
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { status: 200 as const, body: { keys } };
}

async function createApiKeyForAuthorizationUnlocked(authorization: unknown, payload: unknown) {
  const session = await getSessionUserFromAuthorization(authorization);
  if (session.status !== 200 || !("user" in session.body)) return session;
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const db = await loadDatabase();
  const value = createApiKeyValue();
  const createdAt = new Date().toISOString();
  const key: StoredApiKey = {
    id: crypto.randomUUID(),
    userId: session.body.user.id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 48) : "ArtX API Key",
    prefix: value.slice(0, 16),
    keyHash: hashApiKey(value),
    createdAt,
    status: "active",
  };
  db.apiKeys = [...(db.apiKeys || []), key];
  appendAuditLog(db, {
    actorId: session.body.user.id,
    action: "developer.api_key.create",
    target: key.id,
    meta: { name: key.name, prefix: key.prefix },
  });
  await saveDatabase(db);
  return {
    status: 200 as const,
    body: {
      key: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        createdAt,
        value,
      },
    },
  };
}

export async function getApiKeyUserFromAuthorization(authorization: unknown) {
  const token = getBearerTokenFromHeader(authorization);
  if (!token || !token.startsWith("artx_sk_")) {
    return { status: 401 as const, body: { error: "请使用有效的 ArtX API key" } };
  }
  const db = await loadDatabase();
  const key = (db.apiKeys || []).find((item) => item.keyHash === hashApiKey(token) && item.status !== "revoked");
  const user = key ? db.users.find((item) => item.id === key.userId && item.status !== "disabled") : undefined;
  if (!key || !user) {
    return { status: 401 as const, body: { error: "API key 无效或已被停用" } };
  }
  /**
   * ⚠️ lastUsedAt 节流写：同一把 key 5 分钟内只落盘一次。
   * auth-users 是整文档读改写，每次 MCP/API 调用都 save 会让外部 agent 的
   * 调用频率直接放大成整站写竞争（与登录、发 key、发积分抢同一行）。
   * 「最后使用时间」精确到 5 分钟足够用，不值得为它每次重写 66KB 文档。
   */
  const nowMs = Date.now();
  const lastMs = key.lastUsedAt ? Date.parse(key.lastUsedAt) : NaN;
  if (!Number.isFinite(lastMs) || nowMs - lastMs >= API_KEY_LAST_USED_WRITE_INTERVAL_MS) {
    const keyId = key.id;
    await mutateDatabase((fresh) => {
      const target = (fresh.apiKeys || []).find((item) => item.id === keyId);
      if (target) target.lastUsedAt = new Date(nowMs).toISOString();
    });
  }
  return { status: 200 as const, body: { user: publicUser(user), apiKey: { id: key.id, prefix: key.prefix } } };
}

export async function listAuthUsers() {
  const db = await loadDatabase();
  return db.users.map((user) => publicUser(user));
}

/**
 * 为一个**刚创建的**账号绑定邀请关系。
 *
 * ⚠️⚠️ 为什么必须抽成函数，而不是在各分支里各写一份：
 * 本项目有三条会产生新账号的路径 —— 密码注册（register）、
 * 短信验证码登录（sms-login，新号自动建）、邮箱验证码登录（email-login，同上）。
 * 此前只有 register 一条做了绑定，另外两条**静默丢弃邀请码**，
 * 从邀请链接进来却选了验证码登录的用户，关系永远建不上且没有任何报错。
 * 这是典型的「同一份数据的多个出口只处理了一个」。抽成单一入口后，
 * 将来再加登录方式时，漏调用这个函数会在 review 里显形。
 *
 * ⚠️ 只对新账号生效：老用户重复登录时传邀请码会被 hasBoundBefore 挡掉，
 * 否则等于允许存量用户事后认爹，邀请奖励会被刷穿。
 *
 * ⚠️ 绝不发放任何积分，只写关系。发奖统一在被邀请人首次付费时
 * （见 server/invite-rewards.ts 顶部说明）。
 *
 * ⚠️ 不落盘：调用方所在分支后续都会 saveDatabase，这里重复存盘只会多一次 IO。
 */
async function bindInviteRelationIfEligible(params: {
  db: AuthDatabase;
  user: StoredUser;
  isNewUser: boolean;
  rawInviteCode: unknown;
  ip?: string;
}) {
  const { db, user, isNewUser } = params;
  const rawInviteCode = typeof params.rawInviteCode === "string" ? params.rawInviteCode : "";
  if (!rawInviteCode.trim()) return;
  // 老账号或已绑定过的账号一律忽略，静默返回即可 —— 这不是错误，
  // 只是「这次登录不产生新的邀请关系」。
  if (!isNewUser || user.invitedBy) return;

  const inviter = findUserByInviteCode(db.users, rawInviteCode);
  const verdict = evaluateBindingEligibility({
    inviter,
    inviteeIdentityKey: identityKeyOf(user.username),
    inviteeIp: params.ip,
    allUsers: db.users,
    config: await getActiveInviteRewardConfig(),
  });
  if (verdict.eligible) {
    // eligible 为真时 inviter 必然存在（找不到邀请人时 evaluateBindingEligibility
    // 一定返回不通过），这里的判空只是让类型收窄成立，不是业务分支。
    if (!inviter) return;
    user.invitedBy = inviter.id;
    user.invitedAt = new Date().toISOString();
    appendAuditLog(db, {
      actorId: user.id,
      action: "invite.bind",
      target: inviter.id,
      meta: { inviteCode: rawInviteCode.trim().toUpperCase() },
    });
    return;
  }
  // 绑定失败不阻断注册/登录 —— 用户注册这件事本身是合法的，
  // 只是拿不到邀请奖励。阻断会把风控误判直接变成拉新损失。
  appendAuditLog(db, {
    actorId: user.id,
    action: "invite.bind.rejected",
    target: inviter?.id || "unknown",
    meta: { reason: verdict.reason, detail: verdict.detail },
  });
}

/**
 * 结算一名用户的首次付费，并判断其邀请奖励是否成立。
 *
 * ⚠️ 为什么把「判定」和「标记 hasPaid」绑在同一个函数里：
 * 这两步之间任何间隙都会造成重复发奖 —— 判定通过后若 hasPaid 没有立刻落库，
 * 并发的第二次付款回调会再次判定通过。所以此处一次性读盘、判定、写标记、存盘。
 * 积分的实际入账仍由调用方走 grantCredits（带幂等键）完成，形成双保险。
 *
 * 返回 reward 为 null 表示「无需发奖」，调用方不应视为错误。
 */
async function settleFirstPaymentForInviteUnlocked(input: {
  userId: string;
  paidAmountHkd: number;
  now?: Date;
  /** 由 admin-store 传入后台生效配置；不传则走注册的提供者/代码默认值。 */
  config?: InviteRewardRuntimeConfig;
}): Promise<{
  reward: null | {
    inviterId: string;
    inviterName: string;
    inviteeId: string;
    inviteeName: string;
  };
  rejectedReason?: string;
}> {
  const db = await loadDatabase();
  const invitee = db.users.find((user) => user.id === input.userId);
  if (!invitee) {
    return { reward: null, rejectedReason: "用户不存在" };
  }

  // 没有邀请关系时也要把 hasPaid 落下 —— 它是「首次付费」的事实记录，
  // 与有没有邀请人无关。漏掉会导致这名用户日后被人补绑邀请码仍能触发奖励。
  const alreadyPaid = invitee.hasPaid === true;
  const inviter = invitee.invitedBy ? db.users.find((user) => user.id === invitee.invitedBy) : undefined;

  const verdict = evaluateRewardEligibility({
    invitee,
    inviter,
    allUsers: db.users,
    paidAmountHkd: input.paidAmountHkd,
    now: input.now,
    config: input.config || await getActiveInviteRewardConfig(),
  });

  if (!alreadyPaid) {
    invitee.hasPaid = true;
    await saveDatabase(db);
  }

  if (!verdict.eligible) {
    return { reward: null, rejectedReason: verdict.detail };
  }

  return {
    reward: {
      inviterId: inviter!.id,
      inviterName: inviter!.username,
      inviteeId: invitee.id,
      inviteeName: invitee.username,
    },
  };
}

/**
 * 退款后撤销某位被邀请人的「已付费」事实。
 *
 * ⚠️⚠️ 这一步是整条退款回收链里**最容易被漏掉、漏掉后果最严重**的一环。
 * 奖励的幂等键是 `rule/invite/<inviteeId>/<role>`（一生只发一次），
 * 若只扣回积分而不处理这里，表面上看是对的，但：
 *
 *   - `hasPaid` 仍为 true → 该用户再付一次费不会重复发奖（幂等键挡住了），
 *     看起来"安全"；但**幂等记录在 admin 库、hasPaid 在 auth 库**，
 *     任何一侧被清理/迁移，防线就只剩另一侧。
 *   - 更现实的问题是 `countRewardedInvites` 按 `invitedBy + hasPaid` 统计，
 *     退款后若不复位，这条已被撤销的邀请仍**永久占用邀请人的 10 个名额之一**，
 *     等于用一笔退掉的订单卡住邀请人的配额，对邀请人不公平。
 *
 * 所以复位 hasPaid：让配额释放、让统计口径回到真实状态。
 * 重复发奖由 admin 侧的幂等键继续兜底（双保险中的另一重）。
 *
 * 返回 false 表示用户不存在或本来就没标记过付费，调用方据此跳过后续处理。
 */
async function revokeFirstPaymentForInviteUnlocked(userId: string): Promise<{
  reverted: boolean;
  inviterId?: string;
}> {
  const db = await loadDatabase();
  const invitee = db.users.find((user) => user.id === userId);
  if (!invitee || invitee.hasPaid !== true) {
    return { reverted: false };
  }
  invitee.hasPaid = false;
  await saveDatabase(db);
  return { reverted: true, inviterId: invitee.invitedBy };
}

/** 读取某位用户的邀请面板数据（邀请码、已获奖人数、剩余配额等）。 */
export async function getInviteSummaryForUser(userId: string, options: { actualEarnedCredits?: number } = {}) {
  let db = await loadDatabase();
  let user = db.users.find((item) => item.id === userId);
  if (!user) {
    return null;
  }
  // 历史账号没有邀请码（功能上线前注册的），首次访问时补发并落库，
  // 否则老用户永远看不到自己的邀请码。
  // ⚠️ 只有需要补发时才进写锁，并在锁内重读最新数据（别人可能刚补过）。
  if (!user.inviteCode) {
    db = await withAuthWriteLock(async () => {
      const fresh = await loadDatabase();
      const target = fresh.users.find((item) => item.id === userId);
      if (target && !target.inviteCode) {
        target.inviteCode = generateUniqueInviteCode(fresh.users);
        await saveDatabase(fresh);
      }
      return fresh;
    });
    user = db.users.find((item) => item.id === userId);
    if (!user) return null;
  }
  return buildInviteSummary(user, db.users, new Date(), await getActiveInviteRewardConfig(), options.actualEarnedCredits);
}

/**
 * 切换「暂停接受新邀请」开关。
 *
 * 这是用户自助的安全阀：担心邀请码扩散到不该去的地方时，
 * 一键停掉新绑定，而不必换码作废所有已发出的链接。
 *
 * ⚠️ 只写 inviteAcceptDisabled 一个字段，**绝不碰 inviteCode**。
 * 一旦顺手把码重新生成，已发出的旧链接会全部失效，
 * 那就退化成了「换码」，与本功能的设计意图正好相反。
 */
async function setInviteAcceptDisabledUnlocked(userId: string, disabled: boolean) {
  const db = await loadDatabase();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    return null;
  }
  user.inviteAcceptDisabled = disabled === true;
  appendAuditLog(db, {
    actorId: user.id,
    action: disabled ? "invite.accept.paused" : "invite.accept.resumed",
    target: user.id,
    meta: { inviteCode: user.inviteCode || "" },
  });
  await saveDatabase(db);
  return buildInviteSummary(user, db.users, new Date(), await getActiveInviteRewardConfig());
}

/**
 * 后台「邀请管理」所需的邀请关系原始数据。
 *
 * ⚠️⚠️ 只返回**一层**关系（invitedBy = 直接邀请人），刻意不提供任何
 * 「下线的下线」查询。分成只能按直接邀请计算 —— 按多层下线计酬属于
 * 《禁止传销条例》定义的「团队计酬」，是本功能的法律红线。
 * 不给多层数据，就从源头上杜绝了有人在后台拼出多级分成。
 */
export async function listInviteRelationsForAdmin() {
  const db = await loadDatabase();
  return db.users.map((user) => ({
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    status: user.status,
    inviteCode: user.inviteCode || "",
    invitedBy: user.invitedBy || "",
    invitedAt: user.invitedAt || "",
    hasPaid: user.hasPaid === true,
    inviteAcceptDisabled: user.inviteAcceptDisabled === true,
  }));
}

async function createAuthUserForAdminUnlocked(input: {
  actorId: string;
  actorName: string;
  username: string;
}) {
  const username = normalizeUsername(input.username);
  if (!/^\S+@\S+\.\S+$/.test(username)) {
    return { status: 400 as const, body: { error: "请输入有效的测试账号邮箱" } };
  }

  const db = await loadDatabase();
  if (db.users.some((user) => user.loginKey === loginKey(username))) {
    return { status: 409 as const, body: { error: "该账号已存在" } };
  }

  const temporaryPassword = `ArtX-${crypto.randomBytes(18).toString("base64url")}`;
  const user = createUser(username, temporaryPassword, "viewer");
  db.users.push(user);
  appendAuditLog(db, {
    actorId: input.actorId,
    action: "admin.test_account.create",
    target: user.id,
    meta: { actorName: input.actorName, username: user.username },
  });
  await saveDatabase(db);

  return {
    status: 201 as const,
    body: { user: publicUser(user), temporaryPassword },
  };
}

async function updateAuthUserAdminUnlocked(input: {
  actorId: string;
  actorName: string;
  userId: string;
  role?: AdminRole;
  status?: "active" | "disabled";
  allowedAiModels?: string[];
}) {
  const db = await loadDatabase();
  const actor = db.users.find((item) => item.id === input.actorId);
  const user = db.users.find((item) => item.id === input.userId);
  if (!user) {
    return { status: 404 as const, body: { error: "用户不存在" } };
  }
  const actorRole = normalizeRole(actor?.role);
  const targetRole = normalizeRole(user.role);
  const isSelf = input.actorId === user.id;
  const activeSuperAdminCount = db.users.filter((item) =>
    normalizeRole(item.role) === "super_admin" && item.status !== "disabled"
  ).length;

  if (targetRole === "super_admin" && actorRole !== "super_admin") {
    return { status: 403 as const, body: { error: "只有 super_admin 可以修改超级管理员账号" } };
  }
  if (input.role && actorRole !== "super_admin") {
    return { status: 403 as const, body: { error: "只有 super_admin 可以分配或撤销管理员权限" } };
  }
  if (input.role && targetRole === "super_admin" && normalizeRole(input.role) !== "super_admin" && activeSuperAdminCount <= 1) {
    return { status: 409 as const, body: { error: "不能降级最后一个 super_admin" } };
  }
  if (input.status === "disabled" && targetRole === "super_admin" && activeSuperAdminCount <= 1) {
    return { status: 409 as const, body: { error: "不能停用最后一个 super_admin" } };
  }
  if (isSelf && input.status === "disabled") {
    return { status: 409 as const, body: { error: "不能停用当前登录的管理员账号" } };
  }

  if (input.role) {
    user.role = normalizeRole(input.role);
  }
  if (input.status) {
    user.status = input.status;
    if (input.status === "disabled") {
      db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    }
  }
  if (input.allowedAiModels !== undefined) {
    user.allowedAiModels = normalizeAllowedModels(input.allowedAiModels);
  }

  appendAuditLog(db, {
    actorId: input.actorId,
    action: "admin.user.update",
    target: user.id,
    meta: {
      role: user.role,
      status: user.status,
      allowedAiModels: effectiveAllowedAiModels(user),
      actorName: input.actorName,
    },
  });
  await saveDatabase(db);
  return { status: 200 as const, body: { user: publicUser(user) } };
}

export async function getAdminSessionFromAuthorization(authorization: unknown) {
  const token = getBearerTokenFromHeader(authorization);
  const { user } = await getUserByToken(token);

  if (!user) {
    return { status: 401, body: { error: "登录已失效，请重新登录" } };
  }

  if (!canAccessAdmin(user)) {
    return { status: 403, body: { error: "当前账号没有管理后台权限", user: publicUser(user) } };
  }

  return { status: 200, body: { user: publicUser(user) } };
}

/**
 * 返回本地测试用的免登录会话。开关关闭时返回 404，等同于该接口不存在。
 */
export async function getDevAutoLoginSession() {
  if (!isDevAutoLoginEnabled()) {
    return { status: 404 as const, body: { error: "Not found" } };
  }

  // loadDatabase 内部会确保测试账号与会话已存在。
  const db = await loadDatabase();
  const user = db.users.find((item) => item.loginKey === loginKey(DEV_AUTO_LOGIN_USERNAME));
  if (!user) {
    return { status: 500 as const, body: { error: "测试账号初始化失败" } };
  }

  return {
    status: 200 as const,
    body: { ok: true, token: DEV_AUTO_LOGIN_TOKEN, user: publicUser(user) },
  };
}

/**
 * 请求侧上下文。由路由层从 HTTP 头提取后透传，供注册链路留存风控信号。
 * 设为可选是为了不破坏既有调用点（测试与内部调用不传即可）。
 */
export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

/**
 * auth 动作入口。锁策略：
 * - `me`：只读、调用最频繁 → 不进锁；
 * - 三个发验证码分支：外发（短信/邮件）在锁外，落库在锁内重读后只写本次 challenge；
 *   ⚠️ 已知遗留：频控（60 秒间隔/每日上限）在锁外用快照判定，并发请求仍可能各发一条。
 *   与改造前行为一致，未变差；要根治需「锁内先占位 → 锁外发送 → 失败回滚」。
 * - 其余分支：整段在写锁内执行（读 → 改 → 写原子）。
 */
export async function handleAuthAction(
  action: AuthAction,
  payload: unknown,
  context: AuthRequestContext = {},
) {
  if (action === "me") {
    return handleAuthActionUnlocked(action, payload, context);
  }
  if (action === "email-send-code" || action === "sms-send-code" || action === "phone-send-code" || action === "forgot-password") {
    return handleAuthActionUnlocked(action, payload, context);
  }
  return withAuthWriteLock(() => handleAuthActionUnlocked(action, payload, context));
}

async function handleAuthActionUnlocked(
  action: AuthAction,
  payload: unknown,
  context: AuthRequestContext = {},
) {
  const db = await loadDatabase();
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  if (action === "email-send-code") {
    const email = normalizeEmail(body.email || body.username);
    if (!email) {
      return { status: 400, body: { error: "请输入有效的邮箱地址" } };
    }

    pruneEmailChallenges(db);
    const now = Date.now();
    const today = currentDayKey();
    const existing = findEmailChallenge(db, email, "login");
    if (existing?.resendAfterAt && Date.parse(existing.resendAfterAt) > now) {
      return {
        status: 429,
        body: {
          error: "验证码发送太频繁，请稍后再试",
          retryAfterSeconds: Math.ceil((Date.parse(existing.resendAfterAt) - now) / 1000),
        },
      };
    }
    const dailyCount = existing?.dailyKey === today ? Number(existing.dailyCount || 0) : 0;
    if (dailyCount >= EMAIL_CODE_DAILY_LIMIT) {
      return { status: 429, body: { error: "今日邮箱验证码发送次数已达上限" } };
    }

    const code = generateSmsCode();
    const sent: { sent: boolean; reason?: string; provider?: string } = process.env.EMAIL_DRY_RUN === "true"
      ? { sent: true, provider: "dry-run" }
      : await sendUserEmailNotification({
        to: email,
        subject: "ArtX 后台登录验证码",
        text: [
          "你正在登录或注册 ArtX 后台账号。",
          "",
          `验证码：${code}`,
          "验证码 10 分钟内有效。",
          "",
          "如果这不是你本人操作，请忽略此邮件。",
        ].join("\n"),
        html: buildVerificationCodeEmailHtml({
          title: "ArtX 后台登录验证码",
          intro: "你正在登录或注册 ArtX 后台账号。",
          code,
        }),
      });
    if (!sent.sent) {
      return { status: 503, body: { error: sent.reason || "邮箱服务暂未配置或发送失败" } };
    }

    const challenge: EmailChallenge = {
      email,
      purpose: "login",
      codeHash: hashToken(`${email}:${code}`),
      sentAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EMAIL_CODE_TTL_MS).toISOString(),
      resendAfterAt: new Date(now + EMAIL_CODE_RESEND_MS).toISOString(),
      attempts: 0,
      dailyKey: today,
      dailyCount: dailyCount + 1,
    };
    // 外发已在锁外完成；落库进锁、重读最新数据，只写本次的 challenge 与日志。
    await mutateDatabase((fresh) => {
      fresh.emailChallenges = [
        challenge,
        ...(fresh.emailChallenges || []).filter((item) => !(item.email === email && emailChallengePurpose(item) === "login")),
      ].slice(0, 1000);
      appendAuditLog(fresh, {
        actorId: "email",
        action: "auth.email.send",
        target: email,
        meta: { provider: sent.provider || "email" },
      });
    });

    return {
      status: 200,
      body: {
        ok: true,
        expiresAt: challenge.expiresAt,
        retryAfterSeconds: Math.ceil(EMAIL_CODE_RESEND_MS / 1000),
        ...(process.env.EMAIL_DRY_RUN === "true" ? { debugCode: code } : {}),
      },
    };
  }

  if (action === "email-login") {
    const email = normalizeEmail(body.email || body.username);
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (!email) {
      return { status: 400, body: { error: "请输入有效的邮箱地址" } };
    }
    if (!/^\d{6}$/.test(code)) {
      return { status: 400, body: { error: "请输入 6 位邮箱验证码" } };
    }

    pruneEmailChallenges(db);
    const challenge = findEmailChallenge(db, email, "login");
    if (!challenge) {
      return { status: 400, body: { error: "验证码无效或已过期，请重新获取" } };
    }
    if (challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      removeEmailChallenge(db, email, "login");
      await saveDatabase(db);
      return { status: 429, body: { error: "验证码错误次数过多，请重新获取" } };
    }
    if (challenge.codeHash !== hashToken(`${email}:${code}`)) {
      challenge.attempts = Number(challenge.attempts || 0) + 1;
      await saveDatabase(db);
      return { status: 401, body: { error: "验证码错误" } };
    }

    let user = db.users.find((item) => item.loginKey === loginKey(email));
    // 与 sms-login 同理：新邮箱在这里会自动建号，属于注册路径，必须收邀请码。
    const isNewUser = !user;
    if (!user) {
      user = createUser(email, crypto.randomBytes(18).toString("hex"), "viewer", {
        ip: context.ip,
        userAgent: context.userAgent,
      });
      user.inviteCode = generateUniqueInviteCode(db.users);
      db.users.push(user);
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
    await bindInviteRelationIfEligible({
      db,
      user,
      isNewUser,
      rawInviteCode: body.inviteCode,
      ip: context.ip,
    });
    removeEmailChallenge(db, email, "login");
    appendAuditLog(db, {
      actorId: user.id,
      action: "auth.email.login",
      target: user.id,
      meta: { username: email },
    });
    const token = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "sms-send-code") {
    const phone = normalizeMainlandPhone(body.phone);
    if (!phone) {
      return { status: 400, body: { error: "请输入有效的中国大陆手机号" } };
    }

    pruneSmsChallenges(db);
    const now = Date.now();
    const today = currentDayKey();
    const existing = findSmsChallenge(db, phone, "login");
    if (existing?.resendAfterAt && Date.parse(existing.resendAfterAt) > now) {
      return {
        status: 429,
        body: {
          error: "验证码发送太频繁，请稍后再试",
          retryAfterSeconds: Math.ceil((Date.parse(existing.resendAfterAt) - now) / 1000),
        },
      };
    }
    const dailyCount = existing?.dailyKey === today ? Number(existing.dailyCount || 0) : 0;
    if (dailyCount >= SMS_CODE_DAILY_LIMIT) {
      return { status: 429, body: { error: "今日验证码发送次数已达上限" } };
    }

    const code = generateSmsCode();
    const sent = await sendSmsVerificationCode(phone, code);
    if (!sent.sent) {
      return { status: 503, body: { error: sent.reason || "短信服务暂未配置或发送失败" } };
    }

    const challenge: SmsChallenge = {
      phone,
      codeHash: hashToken(`${phone}:${code}`),
      sentAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SMS_CODE_TTL_MS).toISOString(),
      resendAfterAt: new Date(now + SMS_CODE_RESEND_MS).toISOString(),
      attempts: 0,
      dailyKey: today,
      dailyCount: dailyCount + 1,
    };
    // 外发已在锁外完成；落库进锁、重读最新数据。
    await mutateDatabase((fresh) => {
      fresh.smsChallenges = [
        challenge,
        ...(fresh.smsChallenges || []).filter((item) => !isSameSmsChallenge(item, phone, "login")),
      ].slice(0, 1000);
      appendAuditLog(fresh, {
        actorId: "sms",
        action: "auth.sms.send",
        target: phoneUsername(phone),
        meta: { provider: sent.provider, requestId: sent.requestId },
      });
    });

    return {
      status: 200,
      body: {
        ok: true,
        expiresAt: challenge.expiresAt,
        retryAfterSeconds: Math.ceil(SMS_CODE_RESEND_MS / 1000),
        ...(process.env.SMS_DRY_RUN === "true" ? { debugCode: code } : {}),
      },
    };
  }

  if (action === "sms-login") {
    const phone = normalizeMainlandPhone(body.phone);
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (!phone) {
      return { status: 400, body: { error: "请输入有效的中国大陆手机号" } };
    }
    if (!/^\d{6}$/.test(code)) {
      return { status: 400, body: { error: "请输入 6 位短信验证码" } };
    }

    pruneSmsChallenges(db);
    const challenge = findSmsChallenge(db, phone, "login");
    if (!challenge) {
      return { status: 400, body: { error: "验证码无效或已过期，请重新获取" } };
    }
    if (challenge.attempts >= SMS_CODE_MAX_ATTEMPTS) {
      removeSmsChallenge(db, phone, "login");
      await saveDatabase(db);
      return { status: 429, body: { error: "验证码错误次数过多，请重新获取" } };
    }
    if (challenge.codeHash !== hashToken(`${phone}:${code}`)) {
      challenge.attempts = Number(challenge.attempts || 0) + 1;
      await saveDatabase(db);
      return { status: 401, body: { error: "验证码错误" } };
    }

    const username = phoneUsername(phone);
    let user = db.users.find((item) => item.loginKey === loginKey(username));
    // ⚠️ 这条路径对新手机号会**自动建号** —— 它同时是一条注册入口，
    // 因此必须和 register 一样处理邀请码，否则从邀请链接进来却选了
    // 手机号登录的用户，关系永远绑不上（此前的真实缺口）。
    const isNewUser = !user;
    if (!user) {
      user = createUser(username, crypto.randomBytes(18).toString("hex"), "viewer", {
        ip: context.ip,
        userAgent: context.userAgent,
      });
      user.inviteCode = generateUniqueInviteCode(db.users);
      db.users.push(user);
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
    await bindInviteRelationIfEligible({
      db,
      user,
      isNewUser,
      rawInviteCode: body.inviteCode,
      ip: context.ip,
    });
    removeSmsChallenge(db, phone, "login");
    appendAuditLog(db, {
      actorId: user.id,
      action: "auth.sms.login",
      target: user.id,
      meta: { username },
    });
    const token = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  /*
   * ── 手机号 + 密码账号体系（流程结构对齐 sparkx.zone）──────────────────────
   * phone-send-code       { phone, purpose: "register" | "reset" }
   * phone-register        { phone, password, code, agreed: true, inviteCode? }
   * phone-login           { phone, password, agreed: true }
   * phone-reset-password  { phone, password, code }
   * 规则与文案的唯一事实源：shared/phone-auth-rules.ts。
   */
  if (action === "phone-send-code") {
    const phone = normalizeMainlandPhone(body.phone);
    const purpose: PhoneCodePurpose = body.purpose === "reset" ? "reset" : "register";
    if (!phone) {
      return { status: 400, body: { error: PHONE_AUTH_MESSAGES.invalidPhone } };
    }
    const exists = db.users.some((item) => item.loginKey === loginKey(phoneUsername(phone)));
    // 注册时号码已存在 / 重置时号码不存在 → 直接告诉用户，不浪费一条短信。
    if (purpose === "register" && exists) {
      return { status: 409, body: { error: PHONE_AUTH_MESSAGES.phoneRegistered } };
    }
    if (purpose === "reset" && !exists) {
      return { status: 404, body: { error: PHONE_AUTH_MESSAGES.phoneNotRegistered } };
    }

    pruneSmsChallenges(db);
    const now = Date.now();
    const today = currentDayKey();
    const existing = findSmsChallenge(db, phone, purpose);
    if (existing?.resendAfterAt && Date.parse(existing.resendAfterAt) > now) {
      return {
        status: 429,
        body: {
          error: "验证码发送太频繁，请稍后再试",
          retryAfterSeconds: Math.ceil((Date.parse(existing.resendAfterAt) - now) / 1000),
        },
      };
    }
    const dailyCount = existing?.dailyKey === today ? Number(existing.dailyCount || 0) : 0;
    if (dailyCount >= SMS_CODE_DAILY_LIMIT) {
      return { status: 429, body: { error: "今日验证码发送次数已达上限" } };
    }

    const code = generateSmsCode();
    const sent = await sendSmsVerificationCode(phone, code);
    if (!sent.sent) {
      return { status: 503, body: { error: sent.reason === "sms_not_configured" ? "短信服务暂未开通，请联系管理员" : (sent.reason || "短信发送失败，请稍后重试") } };
    }

    const challenge: SmsChallenge = {
      phone,
      purpose,
      codeHash: hashToken(`${purpose}:${phone}:${code}`),
      sentAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SMS_CODE_TTL_MS).toISOString(),
      resendAfterAt: new Date(now + SMS_CODE_RESEND_MS).toISOString(),
      attempts: 0,
      dailyKey: today,
      dailyCount: dailyCount + 1,
    };
    await mutateDatabase((fresh) => {
      fresh.smsChallenges = [
        challenge,
        ...(fresh.smsChallenges || []).filter((item) => !isSameSmsChallenge(item, phone, purpose)),
      ].slice(0, 1000);
      appendAuditLog(fresh, {
        actorId: "sms",
        action: "auth.phone.code.send",
        target: phoneUsername(phone),
        meta: { purpose, provider: sent.provider, requestId: sent.requestId },
      });
    });
    return {
      status: 200,
      body: {
        ok: true,
        expiresAt: challenge.expiresAt,
        retryAfterSeconds: Math.ceil(SMS_CODE_RESEND_MS / 1000),
        ...(process.env.SMS_DRY_RUN === "true" ? { debugCode: code } : {}),
      },
    };
  }

  if (action === "phone-register" || action === "phone-reset-password") {
    const isRegister = action === "phone-register";
    const purpose: PhoneCodePurpose = isRegister ? "register" : "reset";
    const phone = normalizeMainlandPhone(body.phone);
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (!phone) {
      return { status: 400, body: { error: PHONE_AUTH_MESSAGES.invalidPhone } };
    }
    const passwordError = validatePhoneAuthPassword(password);
    if (passwordError) {
      return { status: 400, body: { error: passwordError } };
    }
    if (!/^\d{6}$/.test(code)) {
      return { status: 400, body: { error: code ? PHONE_AUTH_MESSAGES.invalidCode : PHONE_AUTH_MESSAGES.emptyCode } };
    }
    // ⚠️ 协议同意必须后端也校验：前端勾选框可被绕过，「用户已同意协议」是要落证据的。
    if (isRegister && body.agreed !== true) {
      return { status: 400, body: { error: PHONE_AUTH_MESSAGES.agreementRequired } };
    }

    const username = phoneUsername(phone);
    const existingUser = db.users.find((item) => item.loginKey === loginKey(username));
    if (isRegister && existingUser) {
      return { status: 409, body: { error: PHONE_AUTH_MESSAGES.phoneRegistered } };
    }
    if (!isRegister && !existingUser) {
      return { status: 404, body: { error: PHONE_AUTH_MESSAGES.phoneNotRegistered } };
    }
    if (isRegister && isSignupRateLimited(db, context.ip)) {
      return {
        status: 429,
        body: { error: `注册过于频繁，请 ${SIGNUP_IP_RATE_LIMIT.windowHours} 小时后再试，或联系客服协助开通` },
      };
    }

    const codeFailure = verifySmsChallenge(db, phone, purpose, code);
    if (codeFailure) {
      await saveDatabase(db);
      return codeFailure;
    }
    removeSmsChallenge(db, phone, purpose);

    if (isRegister) {
      const user = createUser(username, password, "viewer", {
        ip: context.ip,
        userAgent: context.userAgent,
      });
      user.inviteCode = generateUniqueInviteCode(db.users);
      // 与 register 一致：只绑定邀请关系，不发积分（见 register 分支注释）。
      await bindInviteRelationIfEligible({
        db,
        user,
        isNewUser: true,
        rawInviteCode: body.inviteCode,
        ip: context.ip,
      });
      appendAuditLog(db, {
        actorId: user.id,
        action: "auth.phone.register",
        target: user.id,
        meta: { username, agreedPolicyVersion: "2026-04-01" },
      });
      const token = createSession(db, user.id);
      db.users.push(user);
      await saveDatabase(db);
      return { status: 200, body: { token, user: publicUser(user) } };
    }

    const user = existingUser!;
    const salt = crypto.randomBytes(16).toString("hex");
    user.salt = salt;
    user.passwordHash = hashPassword(password, salt);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    appendAuditLog(db, {
      actorId: user.id,
      action: "auth.password.reset.completed",
      target: user.id,
      meta: { provider: "sms", username },
    });
    await saveDatabase(db);
    return { status: 200, body: { ok: true } };
  }

  /*
   * phone-login 只做入参校验，随后落入下方 login 分支 —— 锁定 / 失败计数 / 会话
   * 与账号密码登录共用同一份实现，避免两份逻辑漂移。
   */
  let phoneLoginUsername = "";
  if (action === "phone-login") {
    const phone = normalizeMainlandPhone(body.phone);
    const password = typeof body.password === "string" ? body.password : "";
    if (!phone) {
      return { status: 400, body: { error: PHONE_AUTH_MESSAGES.invalidPhone } };
    }
    if (!password) {
      return { status: 400, body: { error: PHONE_AUTH_MESSAGES.emptyPassword } };
    }
    if (body.agreed !== true) {
      return { status: 400, body: { error: PHONE_AUTH_MESSAGES.agreementRequired } };
    }
    phoneLoginUsername = phoneUsername(phone);
  }

  if (action === "register") {
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    if (!username) {
      return { status: 400, body: { error: "请输入账号或邮箱" } };
    }
    if (password.trim().length < 4) {
      return { status: 400, body: { error: "密码至少需要 4 位" } };
    }
    if (db.users.some((user) => user.loginKey === loginKey(username))) {
      return { status: 409, body: { error: "该账号已注册，请直接登录" } };
    }

    /**
     * 注册限频。**必须在 createUser 之前**，否则账号已经建出来了再拒绝，
     * 会留下一堆孤儿记录，还会把后续的限频计数越推越高。
     *
     * ⚠️ 这条限制是「注册初始额度」的配套风控，两者同进同退：
     * 发放初始额度突破了「注册链路零成本」这条原有红线，
     * 没有限频的话一个脚本就能无限薅。删任何一边之前先想清楚另一边。
     */
    if (isSignupRateLimited(db, context.ip)) {
      return {
        status: 429,
        body: { error: `注册过于频繁，请 ${SIGNUP_IP_RATE_LIMIT.windowHours} 小时后再试，或联系客服协助开通` },
      };
    }

    const user = createUser(username, password, "viewer", {
      ip: context.ip,
      userAgent: context.userAgent,
    });
    user.inviteCode = generateUniqueInviteCode(db.users);

    // ⚠️ 邀请关系在这里**只做绑定，绝不发放任何积分**。
    // 发奖统一推迟到被邀请人首次付费时（见 server/invite-rewards.ts 顶部说明）。
    // 注册奖励与邀请奖励是两回事：前者是固定的体验额度（有限频兜底），
    // 后者挂在「被邀请人首次付费」上，绝不能挪到注册链路。
    await bindInviteRelationIfEligible({
      db,
      user,
      isNewUser: true,
      rawInviteCode: body.inviteCode,
      ip: context.ip,
    });

    const token = createSession(db, user.id);
    db.users.push(user);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "login" || action === "phone-login") {
    const username = phoneLoginUsername || normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";
    if (body.adminLogin === true && username.includes("@")) {
      return { status: 400, body: { error: "管理后台请使用账号 ID 登录，不支持邮件登录" } };
    }
    const user = db.users.find((item) => item.loginKey === loginKey(username));

    if (user?.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
      return { status: 429, body: { error: "登录失败次数过多，请稍后再试", lockedUntil: user.lockedUntil } };
    }
    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      if (user) {
        user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
        if (user.failedLoginCount >= LOGIN_LOCK_THRESHOLD) {
          user.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS).toISOString();
          appendAuditLog(db, {
            actorId: user.id,
            action: "auth.login.locked",
            target: user.id,
            meta: { failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil },
          });
        }
        await saveDatabase(db);
      }
      return { status: 401, body: { error: phoneLoginUsername ? PHONE_AUTH_MESSAGES.wrongCredentials : "账号或密码错误，请重新输入" } };
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }

    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
    const token = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "social") {
    // 🔒 第三方登录目前【未实现】，该入口一律拒绝。
    //
    // 原实现（2026-09-13 前）是一个匿名后门，危害如下：
    //   1. 账号名写死成 `${provider}@artx.social`，**不含任何第三方用户标识** ——
    //      同一 provider 的所有访客登录进的是同一个账号，积分、作品、订单全部共享。
    //   2. **完全不校验第三方凭据**：请求体只有一个 `provider` 字符串，没有 code/token，
    //      服务端也没做任何回调换取。任何人 `curl -d '{"provider":"google"}'
    //      /api/auth/social` 就能直接拿到一个有效会话 —— 无需密码、无需邮箱、无需验证码。
    //   3. 账号首次访问时被**自动创建**（随机密码，无人知晓），于是它既无法找回，
    //      又对所有人敞开。
    //
    // ⚠️ 取证结论（勿因「看起来没人用」而放松）：
    //   - 前端没有任何组件调用 socialAuth，但**路由是公开可达的**，风险与前端无关。
    //   - 生产库 14 个用户中 artx.social 账号为 0，说明尚未被利用，属于「及时关闭」而非
    //     「事后补救」。
    //   - `OAUTH_*` / `*_CLIENT_ID` / `*_CLIENT_SECRET` 只存在于部署模板与文档中，
    //     服务端无任何 OAuth 实现代码；生产运行态仅有 OAUTH_PUBLIC_BASE_URL /
    //     OAUTH_FRONTEND_URL 两个 URL，**没有任何一家的 client secret**。
    //     即没有「已经接好、只是这里漏了校验」的可能性。
    //
    // 📌 将来真正接入 OAuth 时，必须同时满足以下三条，缺一不可：
    //   a. 校验第三方回调凭据（code/token），由服务端向 provider 换取用户信息，
    //      绝不能信任客户端直接传来的身份声明；
    //   b. 账号身份 = `provider` + **第三方唯一用户 id**（如 sub / openid），
    //      落到 loginKey 上，确保不同人永远是不同账号；
    //   c. 首次绑定要么走注册流程，要么与既有账号显式关联，不做静默自动建号。
    return {
      status: 501,
      body: { error: "第三方登录尚未开放，请使用邮箱或手机号登录" },
    };
  }

  if (action === "me") {
    const token = getBearerToken(body);
    const session = token ? db.sessions.find((item) => item.tokenHash === hashToken(token)) : undefined;
    const user = session ? db.users.find((item) => item.id === session.userId) : undefined;

    if (!user) {
      return { status: 401, body: { error: "登录已失效" } };
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }
    return { status: 200, body: { ok: true, user: publicUser(user) } };
  }

  if (action === "forgot-password") {
    const email = normalizeEmail(body.email || body.username);
    if (!email) {
      return { status: 400, body: { error: "请输入有效的邮箱地址" } };
    }
    const user = db.users.find((item) => item.loginKey === loginKey(email));
    const message = "如果账号存在，验证码已发送到对应邮箱，请在 10 分钟内完成密码重置。";
    let debugCode: string | undefined;
    let emailProvider = "email";
    let resetChallenge: EmailChallenge | undefined;

    if (user) {
      pruneEmailChallenges(db);
      const now = Date.now();
      const today = currentDayKey();
      const existing = findEmailChallenge(db, email, "password_reset");
      if (existing?.resendAfterAt && Date.parse(existing.resendAfterAt) > now) {
        return {
          status: 429,
          body: {
            error: "验证码发送太频繁，请稍后再试",
            retryAfterSeconds: Math.ceil((Date.parse(existing.resendAfterAt) - now) / 1000),
          },
        };
      }
      const dailyCount = existing?.dailyKey === today ? Number(existing.dailyCount || 0) : 0;
      if (dailyCount >= EMAIL_CODE_DAILY_LIMIT) {
        return { status: 429, body: { error: "今日邮箱验证码发送次数已达上限" } };
      }

      const code = generateSmsCode();
      const sent: { sent: boolean; reason?: string; provider?: string } = process.env.EMAIL_DRY_RUN === "true"
        ? { sent: true, provider: "dry-run" }
        : await sendUserEmailNotification({
          to: email,
          subject: "ArtX 密码重置验证码",
          text: [
            "你正在重置 ArtX 账号密码。",
            "",
            `验证码：${code}`,
            "验证码 10 分钟内有效。",
            "",
            "如果这不是你本人操作，请忽略此邮件。",
          ].join("\n"),
          html: buildVerificationCodeEmailHtml({
            title: "ArtX 密码重置验证码",
            intro: "你正在重置 ArtX 账号密码。",
            code,
          }),
        });
      if (!sent.sent) {
        return { status: 503, body: { error: sent.reason || "邮箱服务暂未配置或发送失败" } };
      }
      emailProvider = sent.provider || emailProvider;

      const challenge: EmailChallenge = {
        email,
        purpose: "password_reset",
        codeHash: hashToken(`${email}:${code}`),
        sentAt: new Date(now).toISOString(),
        expiresAt: new Date(now + EMAIL_CODE_TTL_MS).toISOString(),
        resendAfterAt: new Date(now + EMAIL_CODE_RESEND_MS).toISOString(),
        attempts: 0,
        dailyKey: today,
        dailyCount: dailyCount + 1,
      };
      resetChallenge = challenge;
      debugCode = process.env.EMAIL_DRY_RUN === "true" ? code : undefined;
    }
    // 外发已在锁外完成；落库进锁、重读最新数据。
    await mutateDatabase((fresh) => {
      if (resetChallenge) {
        const pending = resetChallenge;
        fresh.emailChallenges = [
          pending,
          ...(fresh.emailChallenges || []).filter((item) => !(item.email === email && emailChallengePurpose(item) === "password_reset")),
        ].slice(0, 1000);
      }
      appendAuditLog(fresh, {
        actorId: user?.id || "system",
        action: "auth.password.reset.requested",
        target: user?.id || loginKey(email),
        meta: {
          username: email,
          matched: Boolean(user),
          provider: emailProvider,
        },
      });
    });
    return {
      status: 200,
      body: {
        ok: true,
        message,
        ...(debugCode ? { debugCode } : {}),
      },
    };
  }

  if (action === "reset-password") {
    const token = typeof body.resetToken === "string" ? body.resetToken.trim() : "";
    const email = normalizeEmail(body.email || body.username);
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (password.trim().length < 8) {
      return { status: 400, body: { error: "新密码至少需要 8 位" } };
    }
    if (!token && (!email || !/^\d{6}$/.test(code))) {
      return { status: 400, body: { error: "请输入邮箱和 6 位验证码" } };
    }

    if (!token) {
      pruneEmailChallenges(db);
      const challenge = findEmailChallenge(db, email, "password_reset");
      const user = db.users.find((item) => item.loginKey === loginKey(email));
      if (!challenge || !user) {
        return { status: 400, body: { error: "验证码无效或已过期，请重新获取" } };
      }
      if (challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
        removeEmailChallenge(db, email, "password_reset");
        await saveDatabase(db);
        return { status: 429, body: { error: "验证码错误次数过多，请重新获取" } };
      }
      if (challenge.codeHash !== hashToken(`${email}:${code}`)) {
        challenge.attempts = Number(challenge.attempts || 0) + 1;
        await saveDatabase(db);
        return { status: 401, body: { error: "验证码错误" } };
      }
      const salt = crypto.randomBytes(16).toString("hex");
      user.salt = salt;
      user.passwordHash = hashPassword(password, salt);
      user.resetTokenHash = undefined;
      user.resetTokenExpiresAt = undefined;
      user.failedLoginCount = 0;
      user.lockedUntil = undefined;
      removeEmailChallenge(db, email, "password_reset");
      db.sessions = db.sessions.filter((item) => item.userId !== user.id);
      appendAuditLog(db, {
        actorId: user.id,
        action: "auth.password.reset.completed",
        target: user.id,
        meta: { provider: "smtp", username: email },
      });
      await saveDatabase(db);
      return { status: 200, body: { ok: true } };
    }

    const tokenHash = hashToken(token);
    const user = db.users.find((item) =>
      item.resetTokenHash === tokenHash &&
      item.resetTokenExpiresAt &&
      Date.parse(item.resetTokenExpiresAt) > Date.now()
    );
    if (!user) {
      return { status: 400, body: { error: "重置令牌无效或已过期" } };
    }
    const salt = crypto.randomBytes(16).toString("hex");
    user.salt = salt;
    user.passwordHash = hashPassword(password, salt);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    await saveDatabase(db);
    return { status: 200, body: { ok: true } };
  }

  if (action === "change-password") {
    const token = getBearerToken(body);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!token) {
      return { status: 401, body: { error: "登录已失效，请重新登录" } };
    }
    if (newPassword.trim().length < 8) {
      return { status: 400, body: { error: "新密码至少需要 8 位" } };
    }
    const session = db.sessions.find((item) => item.tokenHash === hashToken(token));
    const user = session ? db.users.find((item) => item.id === session.userId) : undefined;
    if (!user) {
      return { status: 401, body: { error: "登录已失效，请重新登录" } };
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }
    if (hashPassword(currentPassword, user.salt) !== user.passwordHash) {
      return { status: 401, body: { error: "当前密码不正确" } };
    }
    const salt = crypto.randomBytes(16).toString("hex");
    user.salt = salt;
    user.passwordHash = hashPassword(newPassword, salt);
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    db.sessions = db.sessions.filter((item) => item.userId !== user.id);
    appendAuditLog(db, {
      actorId: user.id,
      action: "auth.password.change",
      target: user.id,
      meta: { username: user.username },
    });
    const nextToken = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { ok: true, token: nextToken, user: publicUser(user) } };
  }

  if (action === "logout") {
    const token = getBearerToken(body);
    if (token) {
      db.sessions = db.sessions.filter((item) => item.tokenHash !== hashToken(token));
      await saveDatabase(db);
    }
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { error: "Unknown auth action" } };
}

// ---- 写锁包装（自动生成形态，见 withAuthWriteLock 注释）----
export function createApiKeyForAuthorization(...args: Parameters<typeof createApiKeyForAuthorizationUnlocked>): ReturnType<typeof createApiKeyForAuthorizationUnlocked> {
  return withAuthWriteLock(() => createApiKeyForAuthorizationUnlocked(...args));
}

export function settleFirstPaymentForInvite(...args: Parameters<typeof settleFirstPaymentForInviteUnlocked>): ReturnType<typeof settleFirstPaymentForInviteUnlocked> {
  return withAuthWriteLock(() => settleFirstPaymentForInviteUnlocked(...args));
}

export function revokeFirstPaymentForInvite(...args: Parameters<typeof revokeFirstPaymentForInviteUnlocked>): ReturnType<typeof revokeFirstPaymentForInviteUnlocked> {
  return withAuthWriteLock(() => revokeFirstPaymentForInviteUnlocked(...args));
}

export function setInviteAcceptDisabled(...args: Parameters<typeof setInviteAcceptDisabledUnlocked>): ReturnType<typeof setInviteAcceptDisabledUnlocked> {
  return withAuthWriteLock(() => setInviteAcceptDisabledUnlocked(...args));
}

export function createAuthUserForAdmin(...args: Parameters<typeof createAuthUserForAdminUnlocked>): ReturnType<typeof createAuthUserForAdminUnlocked> {
  return withAuthWriteLock(() => createAuthUserForAdminUnlocked(...args));
}

export function updateAuthUserAdmin(...args: Parameters<typeof updateAuthUserAdminUnlocked>): ReturnType<typeof updateAuthUserAdminUnlocked> {
  return withAuthWriteLock(() => updateAuthUserAdminUnlocked(...args));
}

