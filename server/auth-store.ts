import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PostgresJsonDocumentStore } from "./postgres-json-store";
import { normalizeMainlandPhone, sendSmsVerificationCode } from "./sms-service";

type AuthAction = "register" | "login" | "me" | "logout" | "social" | "forgot-password" | "reset-password" | "change-password" | "sms-send-code" | "sms-login";
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
  status?: "active" | "disabled";
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
  failedLoginCount?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
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

interface AuthDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
  apiKeys?: StoredApiKey[];
  smsChallenges?: SmsChallenge[];
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

function normalizeProvider(value: unknown) {
  return value === "google" || value === "wechat" || value === "apple" || value === "github" || value === "meta" ? value : "";
}

function loginKey(username: string) {
  return username.toLowerCase();
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
    isAdmin: canAccessAdmin({ ...user, role }),
  };
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

function createUser(username: string, password: string, role: AdminRole = "viewer"): StoredUser {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    username,
    loginKey: loginKey(username),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
    role,
    permissions: [],
    status: "active",
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

  return db;
}

function normalizeDatabase(parsed: Partial<AuthDatabase>): AuthDatabase {
  const now = Date.now();
  return {
    users: Array.isArray(parsed.users)
      ? parsed.users.map((user) => ({
        ...user,
        role: normalizeRole(user.role),
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
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
  return crypto.randomBytes(18).toString("hex");
}

function generateSmsCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function phoneUsername(phone: string) {
  return `+86${phone}`;
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

export async function updateAuthUserAdmin(input: {
  actorId: string;
  actorName: string;
  userId: string;
  role?: AdminRole;
  status?: "active" | "disabled";
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

  appendAuditLog(db, {
    actorId: input.actorId,
    action: "admin.user.update",
    target: user.id,
    meta: {
      role: user.role,
      status: user.status,
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

export async function handleAuthAction(action: AuthAction, payload: unknown) {
  const db = await loadDatabase();
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

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
      user = createUser(username, crypto.randomBytes(18).toString("hex"));
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

    const user = createUser(username, password);
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
    const provider = normalizeProvider(body.provider);
    if (!provider) {
      return { status: 400, body: { error: "不支持的第三方登录方式" } };
    }
    const providerName = provider === "google" ? "gmail" : provider;
    const username = `${providerName}@artx.social`;
    let user = db.users.find((item) => item.loginKey === loginKey(username));
    if (!user) {
      user = createUser(username, crypto.randomBytes(18).toString("hex"));
      db.users.push(user);
    }
    const token = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
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
    return { status: 200, body: { user: publicUser(user) } };
  }

  if (action === "forgot-password") {
    const username = normalizeUsername(body.username);
    if (!username) {
      return { status: 400, body: { error: "请输入账号或邮箱" } };
    }
    const user = db.users.find((item) => item.loginKey === loginKey(username));
    if (!user) {
      return { status: 404, body: { error: "账号不存在" } };
    }
    const resetToken = generateResetToken();
    user.resetTokenHash = hashToken(resetToken);
    user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await saveDatabase(db);
    return {
      status: 200,
      body: {
        ok: true,
        resetToken,
        expiresAt: user.resetTokenExpiresAt,
      },
    };
  }

  if (action === "reset-password") {
    const token = typeof body.resetToken === "string" ? body.resetToken.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!token) {
      return { status: 400, body: { error: "缺少重置令牌" } };
    }
    if (password.trim().length < 4) {
      return { status: 400, body: { error: "密码至少需要 4 位" } };
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
