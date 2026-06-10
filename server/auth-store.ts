import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type AuthAction = "register" | "login" | "me" | "logout" | "social";
type OAuthProvider = "google" | "wechat" | "github" | "meta";

interface StoredUser {
  id: string;
  username: string;
  loginKey: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  oauthProvider?: OAuthProvider;
  oauthSubject?: string;
  displayName?: string;
  avatarUrl?: string;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
}

interface AuthDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
}

const DATA_DIR = process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data");
const DATA_FILE = path.join(DATA_DIR, "auth-users.json");
const DEFAULT_USERNAME = "09bee";
const DEFAULT_PASSWORD = "1234";

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value: unknown) {
  return value === "google" || value === "wechat" || value === "github" || value === "meta" ? value : "";
}

function loginKey(username: string) {
  return username.toLowerCase();
}

function publicUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function hashPassword(password: string, salt: string) {
  return crypto.pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createUser(username: string, password: string): StoredUser {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    username,
    loginKey: loginKey(username),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
}

function createOAuthUser(profile: OAuthProfile): StoredUser {
  const password = crypto.randomBytes(18).toString("hex");
  const user = createUser(profile.email || `${profile.provider}-${profile.subject}@artx.social`, password);
  user.loginKey = oauthLoginKey(profile.provider, profile.subject);
  user.oauthProvider = profile.provider;
  user.oauthSubject = profile.subject;
  user.displayName = profile.name || profile.email || profile.provider;
  user.avatarUrl = profile.avatarUrl;
  return user;
}

async function loadDatabase(): Promise<AuthDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let db: AuthDatabase = { users: [], sessions: [] };

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

  if (!db.users.some((user) => user.loginKey === loginKey(DEFAULT_USERNAME))) {
    db.users.push(createUser(DEFAULT_USERNAME, DEFAULT_PASSWORD));
    await saveDatabase(db);
  }

  return db;
}

function normalizeDatabase(parsed: Partial<AuthDatabase>): AuthDatabase {
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
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
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
  await fs.rename(tmpFile, DATA_FILE);
}

function createSession(db: AuthDatabase, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date().toISOString(),
  });
  return token;
}

function oauthLoginKey(provider: OAuthProvider, subject: string) {
  return `oauth:${provider}:${subject}`;
}

interface OAuthProfile {
  provider: OAuthProvider;
  subject: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scope: string;
}

const OAUTH_PROVIDERS: Record<OAuthProvider, Omit<OAuthProviderConfig, "clientId" | "clientSecret">> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: "read:user user:email",
  },
  meta: {
    authorizeUrl: `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v20.0"}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v20.0"}/oauth/access_token`,
    userInfoUrl: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v20.0"}/me`,
    scope: "email public_profile",
  },
  wechat: {
    authorizeUrl: "https://open.weixin.qq.com/connect/qrconnect",
    tokenUrl: "https://api.weixin.qq.com/sns/oauth2/access_token",
    userInfoUrl: "https://api.weixin.qq.com/sns/userinfo",
    scope: "snsapi_login",
  },
};

function getOAuthConfig(provider: OAuthProvider): OAuthProviderConfig {
  const base = OAUTH_PROVIDERS[provider];
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`] || process.env[`${prefix}_APP_ID`] || "";
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] || process.env[`${prefix}_APP_SECRET`] || "";
  return { ...base, clientId, clientSecret };
}

function getOAuthPublicBaseUrl() {
  return (process.env.OAUTH_PUBLIC_BASE_URL || process.env.PUBLIC_API_BASE_URL || "https://artx-test.onrender.com").replace(/\/+$/, "");
}

function getOAuthFrontendUrl() {
  return (process.env.OAUTH_FRONTEND_URL || "https://09beedesign-star.github.io/artx-test/").replace(/\/?$/, "/");
}

function getOAuthCallbackUrl(provider: OAuthProvider) {
  return `${getOAuthPublicBaseUrl()}/api/auth/oauth/${provider}/callback`;
}

function getOAuthStateSecret() {
  return process.env.OAUTH_STATE_SECRET || process.env.SESSION_SECRET || "artx-dev-oauth-state";
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function signStatePayload(payload: string) {
  return crypto.createHmac("sha256", getOAuthStateSecret()).update(payload).digest("base64url");
}

function createOAuthState(provider: OAuthProvider, returnTo: string) {
  const payload = base64UrlEncode(JSON.stringify({
    provider,
    returnTo: normalizeReturnTo(returnTo),
    nonce: crypto.randomBytes(12).toString("hex"),
    createdAt: Date.now(),
  }));
  return `${payload}.${signStatePayload(payload)}`;
}

function parseOAuthState(state: string, provider: OAuthProvider) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || signature !== signStatePayload(payload)) {
    throw new Error("OAuth state is invalid");
  }
  const parsed = JSON.parse(base64UrlDecode(payload)) as { provider?: string; returnTo?: string; createdAt?: number };
  if (parsed.provider !== provider) throw new Error("OAuth provider mismatch");
  if (!parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth state is expired");
  }
  return normalizeReturnTo(parsed.returnTo || "");
}

function normalizeReturnTo(value: string) {
  const fallback = getOAuthFrontendUrl();
  try {
    const url = new URL(value || fallback);
    const allowedFrontend = new URL(fallback);
    const isAllowedHostedSite = url.origin === "https://09beedesign-star.github.io" && url.pathname.startsWith("/artx-test");
    const isConfiguredFrontend = url.origin === allowedFrontend.origin && url.pathname.startsWith(allowedFrontend.pathname.replace(/\/$/, ""));
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.origin);
    if (isAllowedHostedSite || isConfiguredFrontend || isLocal) return url.toString();
  } catch {
    // Fall back below.
  }
  return fallback;
}

function redirectWithAuthResult(returnTo: string, body: Record<string, unknown>) {
  const url = new URL(normalizeReturnTo(returnTo));
  url.searchParams.set("auth_result", base64UrlEncode(JSON.stringify(body)));
  return url.toString();
}

function redirectWithOAuthError(returnTo: string, error: string) {
  const url = new URL(normalizeReturnTo(returnTo));
  url.searchParams.set("auth_error", error);
  return url.toString();
}

async function exchangeOAuthCode(provider: OAuthProvider, code: string) {
  const config = getOAuthConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth credentials are not configured`);
  }
  const redirectUri = getOAuthCallbackUrl(provider);

  if (provider === "wechat") {
    const params = new URLSearchParams({
      appid: config.clientId,
      secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
    });
    const response = await fetch(`${config.tokenUrl}?${params.toString()}`);
    const data = await response.json() as { access_token?: string; openid?: string; unionid?: string; errcode?: number; errmsg?: string };
    if (!response.ok || !data.access_token || !data.openid) {
      throw new Error(data.errmsg || "微信授权失败");
    }
    return { accessToken: data.access_token, openid: data.openid, unionid: data.unionid };
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `${provider} 授权失败`);
  }
  return { accessToken: data.access_token };
}

async function getOAuthProfile(provider: OAuthProvider, tokenResult: { accessToken: string; openid?: string; unionid?: string }): Promise<OAuthProfile> {
  const config = getOAuthConfig(provider);
  if (provider === "google") {
    const response = await fetch(config.userInfoUrl!, { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } });
    const data = await response.json() as { sub?: string; email?: string; name?: string; picture?: string };
    if (!response.ok || !data.sub) throw new Error("Google 用户资料读取失败");
    return { provider, subject: data.sub, email: data.email, name: data.name, avatarUrl: data.picture };
  }

  if (provider === "github") {
    const response = await fetch(config.userInfoUrl!, { headers: { Authorization: `Bearer ${tokenResult.accessToken}`, Accept: "application/vnd.github+json" } });
    const data = await response.json() as { id?: number; login?: string; name?: string; avatar_url?: string; email?: string };
    if (!response.ok || !data.id) throw new Error("GitHub 用户资料读取失败");
    let email = data.email;
    if (!email) {
      const emailResponse = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tokenResult.accessToken}`, Accept: "application/vnd.github+json" } });
      const emails = await emailResponse.json().catch(() => []) as { email?: string; primary?: boolean; verified?: boolean }[];
      email = emails.find(item => item.primary && item.verified)?.email || emails.find(item => item.verified)?.email;
    }
    return { provider, subject: String(data.id), email, name: data.name || data.login, avatarUrl: data.avatar_url };
  }

  if (provider === "meta") {
    const params = new URLSearchParams({ fields: "id,name,email,picture", access_token: tokenResult.accessToken });
    const response = await fetch(`${config.userInfoUrl}?${params.toString()}`);
    const data = await response.json() as { id?: string; email?: string; name?: string; picture?: { data?: { url?: string } } };
    if (!response.ok || !data.id) throw new Error("Meta 用户资料读取失败");
    return { provider, subject: data.id, email: data.email, name: data.name, avatarUrl: data.picture?.data?.url };
  }

  const params = new URLSearchParams({
    access_token: tokenResult.accessToken,
    openid: tokenResult.openid || "",
    lang: "zh_CN",
  });
  const response = await fetch(`${config.userInfoUrl}?${params.toString()}`);
  const data = await response.json() as { openid?: string; unionid?: string; nickname?: string; headimgurl?: string; errmsg?: string };
  if (!response.ok || !data.openid) throw new Error(data.errmsg || "微信用户资料读取失败");
  return { provider, subject: data.unionid || data.openid, name: data.nickname, avatarUrl: data.headimgurl };
}

async function loginWithOAuthProfile(profile: OAuthProfile) {
  const db = await loadDatabase();
  const key = oauthLoginKey(profile.provider, profile.subject);
  let user = db.users.find(item => item.loginKey === key);
  if (!user && profile.email) {
    user = db.users.find(item => item.loginKey === loginKey(profile.email!));
  }

  if (!user) {
    user = createOAuthUser(profile);
    db.users.push(user);
  } else {
    user.oauthProvider = profile.provider;
    user.oauthSubject = profile.subject;
    user.loginKey = key;
    user.username = profile.email || user.username;
    user.displayName = profile.name || user.displayName;
    user.avatarUrl = profile.avatarUrl || user.avatarUrl;
  }

  const token = createSession(db, user.id);
  await saveDatabase(db);
  return { token, user: publicUser(user) };
}

export function createOAuthStartUrl(provider: OAuthProvider, returnTo: string) {
  const config = getOAuthConfig(provider);
  if (!config.clientId) {
    throw new Error(`${provider} OAuth client id is not configured`);
  }
  const state = createOAuthState(provider, returnTo);
  const redirectUri = getOAuthCallbackUrl(provider);
  const url = new URL(config.authorizeUrl);

  if (provider === "wechat") {
    url.searchParams.set("appid", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scope);
    url.searchParams.set("state", state);
    return `${url.toString()}#wechat_redirect`;
  }

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

export async function handleOAuthCallback(provider: OAuthProvider, query: Record<string, unknown>) {
  const code = typeof query.code === "string" ? query.code : "";
  const state = typeof query.state === "string" ? query.state : "";
  const returnTo = state ? parseOAuthState(state, provider) : getOAuthFrontendUrl();
  if (!code) return redirectWithOAuthError(returnTo, "第三方登录未返回授权码");

  try {
    const tokenResult = await exchangeOAuthCode(provider, code);
    const profile = await getOAuthProfile(provider, tokenResult);
    const session = await loginWithOAuthProfile(profile);
    return redirectWithAuthResult(returnTo, session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "第三方登录失败";
    return redirectWithOAuthError(returnTo, message);
  }
}

function getBearerToken(payload: Record<string, unknown>) {
  const token = payload.token;
  return typeof token === "string" ? token.trim() : "";
}

export async function handleAuthAction(action: AuthAction, payload: unknown) {
  const db = await loadDatabase();
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

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
    const user = db.users.find((item) => item.loginKey === loginKey(username));

    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      return { status: 401, body: { error: "账号或密码错误，请重新输入" } };
    }

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
    return { status: 200, body: { user: publicUser(user) } };
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
