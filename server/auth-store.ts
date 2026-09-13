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
} from "./invite-rewards";

type AuthAction = "register" | "login" | "me" | "logout" | "social" | "forgot-password" | "reset-password" | "change-password" | "sms-send-code" | "sms-login" | "email-send-code" | "email-login";
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

async function loadDatabase(): Promise<AuthDatabase> {
  let db: AuthDatabase = { users: [], sessions: [], smsChallenges: [], auditLogs: [] };

  if (authPostgresStore) {
    const stored = await authPostgresStore.load();
    if (stored) {
      db = normalizeDatabase(stored);
    }
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DATA_FILE, "utf-8");
      const parsed = parseAuthDatabase(raw);
      db = parsed.db;
      if (parsed.recovered) {
        await saveDatabase(db);
      }
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
    await saveDatabase(db);
  }

  if (isDevAutoLoginEnabled()) {
    await ensureDevAutoLoginSession(db);
  }

  return db;
}

/**
 * 为本地测试播种一个固定的测试账号与长期会话。
 * 走的是真实的 users / sessions 结构，因此所有后端鉴权逻辑保持原样不变。
 */
async function ensureDevAutoLoginSession(db: AuthDatabase) {
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

  if (changed) {
    await saveDatabase(db);
  }
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
  return `+86${phone}`;
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
    db.sessions = db.sessions.filter((item) => item !== session);
    await saveDatabase(db);
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

export async function createApiKeyForAuthorization(authorization: unknown, payload: unknown) {
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
  key.lastUsedAt = new Date().toISOString();
  await saveDatabase(db);
  return { status: 200 as const, body: { user: publicUser(user), apiKey: { id: key.id, prefix: key.prefix } } };
}

export async function listAuthUsers() {
  const db = await loadDatabase();
  return db.users.map((user) => publicUser(user));
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
export async function settleFirstPaymentForInvite(input: {
  userId: string;
  paidAmountHkd: number;
  now?: Date;
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
export async function revokeFirstPaymentForInvite(userId: string): Promise<{
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
export async function getInviteSummaryForUser(userId: string) {
  const db = await loadDatabase();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    return null;
  }
  // 历史账号没有邀请码（功能上线前注册的），首次访问时补发并落库，
  // 否则老用户永远看不到自己的邀请码。
  if (!user.inviteCode) {
    user.inviteCode = generateUniqueInviteCode(db.users);
    await saveDatabase(db);
  }
  return buildInviteSummary(user, db.users);
}

export async function createAuthUserForAdmin(input: {
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

export async function updateAuthUserAdmin(input: {
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

export async function handleAuthAction(
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
    db.emailChallenges = [
      challenge,
      ...(db.emailChallenges || []).filter((item) => !(item.email === email && emailChallengePurpose(item) === "login")),
    ].slice(0, 1000);
    appendAuditLog(db, {
      actorId: "email",
      action: "auth.email.send",
      target: email,
      meta: { provider: sent.provider || "email" },
    });
    await saveDatabase(db);

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
    if (!user) {
      user = createUser(email, crypto.randomBytes(18).toString("hex"), "viewer", {
        ip: context.ip,
        userAgent: context.userAgent,
      });
      db.users.push(user);
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
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
    const existing = (db.smsChallenges || []).find((item) => item.phone === phone);
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
    db.smsChallenges = [
      challenge,
      ...(db.smsChallenges || []).filter((item) => item.phone !== phone),
    ].slice(0, 1000);
    appendAuditLog(db, {
      actorId: "sms",
      action: "auth.sms.send",
      target: phoneUsername(phone),
      meta: { provider: sent.provider, requestId: sent.requestId },
    });
    await saveDatabase(db);

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
    const challenge = (db.smsChallenges || []).find((item) => item.phone === phone);
    if (!challenge) {
      return { status: 400, body: { error: "验证码无效或已过期，请重新获取" } };
    }
    if (challenge.attempts >= SMS_CODE_MAX_ATTEMPTS) {
      db.smsChallenges = (db.smsChallenges || []).filter((item) => item.phone !== phone);
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
    if (!user) {
      user = createUser(username, crypto.randomBytes(18).toString("hex"), "viewer", {
        ip: context.ip,
        userAgent: context.userAgent,
      });
      db.users.push(user);
    }
    if (user.status === "disabled") {
      return { status: 403, body: { error: "当前账号已被停用，请联系管理员" } };
    }
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date().toISOString();
    db.smsChallenges = (db.smsChallenges || []).filter((item) => item.phone !== phone);
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

    const user = createUser(username, password, "viewer", {
      ip: context.ip,
      userAgent: context.userAgent,
    });
    user.inviteCode = generateUniqueInviteCode(db.users);

    // ⚠️ 邀请关系在这里**只做绑定，绝不发放任何积分**。
    // 发奖统一推迟到被邀请人首次付费时（见 server/invite-rewards.ts 顶部说明）。
    // 注册链路零成本，任何在此处发积分的改动都会让整套防刷失效。
    const rawInviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
    if (rawInviteCode.trim()) {
      const inviter = findUserByInviteCode(db.users, rawInviteCode);
      const verdict = evaluateBindingEligibility({
        inviter,
        inviteeIdentityKey: identityKeyOf(username),
        inviteeIp: context.ip,
        allUsers: db.users,
      });
      if (verdict.eligible && inviter) {
        user.invitedBy = inviter.id;
        user.invitedAt = new Date().toISOString();
        appendAuditLog(db, {
          actorId: user.id,
          action: "invite.bind",
          target: inviter.id,
          meta: { inviteCode: rawInviteCode.trim().toUpperCase() },
        });
      } else if (!verdict.eligible) {
        // 绑定失败不阻断注册 —— 用户注册这件事本身是合法的，
        // 只是拿不到邀请奖励。阻断注册会把风控误判直接变成拉新损失。
        appendAuditLog(db, {
          actorId: user.id,
          action: "invite.bind.rejected",
          target: inviter?.id || "unknown",
          meta: { reason: verdict.reason, detail: verdict.detail },
        });
      }
    }

    const token = createSession(db, user.id);
    db.users.push(user);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "login") {
    const username = normalizeUsername(body.username);
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
      return { status: 401, body: { error: "账号或密码错误，请重新输入" } };
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
      db.emailChallenges = [
        challenge,
        ...(db.emailChallenges || []).filter((item) => !(item.email === email && emailChallengePurpose(item) === "password_reset")),
      ].slice(0, 1000);
      debugCode = process.env.EMAIL_DRY_RUN === "true" ? code : undefined;
    }
    appendAuditLog(db, {
      actorId: user?.id || "system",
      action: "auth.password.reset.requested",
      target: user?.id || loginKey(email),
      meta: {
        username: email,
        matched: Boolean(user),
        provider: emailProvider,
      },
    });
    await saveDatabase(db);
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
