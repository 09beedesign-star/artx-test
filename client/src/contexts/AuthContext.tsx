import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "@/lib/api-base-url";

const AUTH_STORAGE_KEY = "artx-auth-session";
const LOCAL_AUTH_USERS_KEY = "artx-local-auth-users";

interface AuthUser {
  id: string;
  username: string;
  createdAt?: string;
  role?: "viewer" | "support" | "finance" | "admin" | "super_admin";
  permissions?: string[];
  isAdmin?: boolean;
  allowedAiModels?: string[];
}

interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  sendSmsCode: (phone: string) => Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }>;
  loginWithSmsCode: (phone: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  sendEmailCode: (email: string) => Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }>;
  loginWithEmailCode: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  forgotPassword: (username: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
  resetPassword: (username: string, code: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  socialAuth: (provider: "google" | "wechat" | "apple" | "github" | "meta") => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applySession = (session: AuthSession) => {
      if (cancelled) return;
      persistSession(session);
      setIsAuthenticated(true);
      setUser(session.user);
    };

    const stored = readStoredSession();

    if (!stored) {
      // 本地测试免登录：没有本地会话时，向后端换取测试会话。
      // 开关关闭时 fetchDevSession() 直接返回 null，行为与改动前完全一致。
      if (isDevSkipAuthEnabled()) {
        fetchDevSession().then((session) => {
          if (session) applySession(session);
        });
      }
      return () => { cancelled = true; };
    }

    setIsAuthenticated(true);
    setUser(stored.user);

    fetchAuth("me", { token: stored.token }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.user) {
        const normalizedUser = normalizeAuthUser(result.user);
        persistSession({ token: stored.token, user: normalizedUser });
        setUser(normalizedUser);
        return;
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
      setUser(null);

      // 本地测试免登录：已存会话失效时，自动换一个新的测试会话。
      if (isDevSkipAuthEnabled()) {
        fetchDevSession().then((session) => {
          if (session) applySession(session);
        });
      }
    }).catch(() => {
      // Keep the local session when the test server is temporarily unreachable.
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleLoginRequired = () => {
      // ⚠️ 首页（"/"）自带右侧内嵌登录面板（HomePage 的 panelMode），
      // 若这里再打开居中弹窗，用户会在同一屏看到**两个登录入口**叠在一起。
      // 这就是「首页重复登录弹窗」的成因 —— 触发点不在首页自身，而在这个全局事件：
      // lib/ai.ts 在 401 时会派发 artx:login-required，首页试用 AI 同样会走到。
      //
      // 修在监听侧而不是各个派发点：派发点有 2 处（BillingPage、lib/ai.ts），
      // 将来还会增加；收敛在这里可以一次覆盖全部，避免再漏。
      if (typeof window !== "undefined" && window.location.pathname === "/") {
        // 让首页把自己的面板切到登录态并滚动到位，不再叠加弹窗。
        window.sessionStorage.setItem("artx:home-auth-panel", "login");
        window.dispatchEvent(new CustomEvent("artx:home-auth-panel-requested"));
        return;
      }
      setLoginModalOpen(true);
    };
    window.addEventListener("artx:login-required", handleLoginRequired);
    return () => window.removeEventListener("artx:login-required", handleLoginRequired);
  }, []);

  const authenticate = async (action: "login" | "register", username: string, password: string) => {
    try {
      // 邀请码只在注册时透传。从暂存读取而非让各调用方传参，
      // 是为了不改动已有的 login/register 调用签名。
      // ⚠️ 邀请码只建立「绑定关系」，不会发放任何积分 ——
      // 发放统一推迟到被邀请人首次付费（server/invite-rewards.ts）。
      const inviteCode = action === "register" ? getPendingInviteCode() : "";
      const result = await fetchAuth(action, {
        username,
        password,
        ...(inviteCode ? { inviteCode } : {}),
      });
      if (!result.ok || !result.token || !result.user) {
        if (isGithubPagesTest()) {
          const localResult = authenticateLocally(action, username, password);
          if (localResult.ok) applyStoredSession();
          return localResult;
        }
        return { ok: false, error: result.error || "登录失败，请稍后重试" };
      }
      const normalizedUser = normalizeAuthUser(result.user);
      if (!persistSession({ token: result.token, user: normalizedUser })) {
        return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
      }
      setIsAuthenticated(true);
      setUser(normalizedUser);
      setLoginModalOpen(false);
      // 邀请码已随注册请求送达后端，无论后端是否判定可绑定（风控可能拒绝），
      // 本地都不再保留 —— 留着只会在同一浏览器换号注册时重复携带。
      if (inviteCode) clearPendingInviteCode();
      return { ok: true };
    } catch {
      if (isGithubPagesTest()) {
        const localResult = authenticateLocally(action, username, password);
        if (localResult.ok) applyStoredSession();
        return localResult;
      }
      return { ok: false, error: "测试服务暂时不可用，请稍后重试" };
    }
  };

  const authenticateWithSms = async (phone: string, code: string) => {
    try {
      // ⚠️ 短信验证码登录对**新手机号会自动建号**（server/auth-store.ts 的
      // sms-login 分支里有 createUser）。也就是说它同时是一条注册路径 ——
      // 从邀请链接进来的人如果选了"手机号登录"，在这里不带邀请码，
      // 关系就永远绑不上，且全程零报错。后端只在新建账号时采纳该字段，
      // 老用户重复登录传了也会被忽略。
      const inviteCode = getPendingInviteCode();
      const result = await fetchAuth("sms-login", {
        phone,
        code,
        ...(inviteCode ? { inviteCode } : {}),
      });
      if (!result.ok || !result.token || !result.user) {
        return { ok: false, error: result.error || "短信验证码登录失败" };
      }
      const normalizedUser = normalizeAuthUser(result.user);
      if (!persistSession({ token: result.token, user: normalizedUser })) {
        return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
      }
      setIsAuthenticated(true);
      setUser(normalizedUser);
      setLoginModalOpen(false);
      if (inviteCode) clearPendingInviteCode();
      return { ok: true };
    } catch {
      return { ok: false, error: "短信验证码服务暂时不可用，请稍后重试" };
    }
  };

  const authenticateWithEmail = async (email: string, code: string) => {
    try {
      // 与 sms-login 同理：邮箱验证码登录对新邮箱同样会自动建号，
      // 是一条实际存在的注册路径，必须携带邀请码。
      const inviteCode = getPendingInviteCode();
      const result = await fetchAuth("email-login", {
        email,
        code,
        ...(inviteCode ? { inviteCode } : {}),
      });
      if (!result.ok || !result.token || !result.user) {
        return { ok: false, error: result.error || "邮箱验证码登录失败" };
      }
      const normalizedUser = normalizeAuthUser(result.user);
      if (!persistSession({ token: result.token, user: normalizedUser })) {
        return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
      }
      setIsAuthenticated(true);
      setUser(normalizedUser);
      setLoginModalOpen(false);
      if (inviteCode) clearPendingInviteCode();
      return { ok: true };
    } catch {
      return { ok: false, error: "邮箱验证码服务暂时不可用，请稍后重试" };
    }
  };

  const applyStoredSession = () => {
    const stored = readStoredSession();
    if (!stored) return;
    setIsAuthenticated(true);
    setUser(stored.user);
    setLoginModalOpen(false);
  };

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated,
    user,
    loginModalOpen,
    openLoginModal: () => setLoginModalOpen(true),
    closeLoginModal: () => setLoginModalOpen(false),
    login: (username: string, password: string) => authenticate("login", username, password),
    register: (username: string, password: string) => authenticate("register", username, password),
    sendSmsCode: async (phone: string) => {
      try {
        const result = await fetchAuth("sms-send-code", { phone });
        return {
          ok: result.ok,
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds,
        };
      } catch {
        return { ok: false, error: "短信验证码服务暂时不可用，请稍后重试" };
      }
    },
    loginWithSmsCode: authenticateWithSms,
    sendEmailCode: async (email: string) => {
      try {
        const result = await fetchAuth("email-send-code", { email });
        return {
          ok: result.ok,
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds,
        };
      } catch {
        return { ok: false, error: "邮箱验证码服务暂时不可用，请稍后重试" };
      }
    },
    loginWithEmailCode: authenticateWithEmail,
    forgotPassword: async (username: string) => {
      try {
        const result = await fetchAuth("forgot-password", { username });
        return {
          ok: result.ok,
          error: result.error,
          message: result.message,
        };
      } catch {
        return { ok: false, error: "密码重置服务暂时不可用，请稍后重试" };
      }
    },
    resetPassword: async (username: string, code: string, password: string) => {
      try {
        const result = await fetchAuth("reset-password", { username, code, password });
        return {
          ok: result.ok,
          error: result.error,
        };
      } catch {
        return { ok: false, error: "密码重置服务暂时不可用，请稍后重试" };
      }
    },
    changePassword: async (currentPassword: string, newPassword: string) => {
      const stored = readStoredSession();
      if (!stored?.token) {
        return { ok: false, error: "登录已失效，请重新登录" };
      }
      try {
        const result = await fetchAuth("change-password", {
          token: stored.token,
          currentPassword,
          newPassword,
        });
        if (!result.ok || !result.token || !result.user) {
          return { ok: false, error: result.error || "密码修改失败" };
        }
        const normalizedUser = normalizeAuthUser(result.user);
        if (!persistSession({ token: result.token, user: normalizedUser })) {
          return { ok: false, error: "浏览器本地存储空间不足，请重新登录后再试" };
        }
        setIsAuthenticated(true);
        setUser(normalizedUser);
        return { ok: true };
      } catch {
        return { ok: false, error: "密码修改服务暂时不可用，请稍后重试" };
      }
    },
    socialAuth: async (provider) => {
      try {
        const result = await fetchAuth("social", { provider });
        if (!result.ok || !result.token || !result.user) {
          if (isGithubPagesTest()) {
            const localResult = authenticateLocally("registerOrLogin", `${provider}@artx.test`, provider);
            if (localResult.ok) applyStoredSession();
            return localResult;
          }
          // ⚠️ 服务端 /api/auth/social 自 2026-09-13 起固定返回 501（第三方登录未实现）。
          // 原实现是个后门：不校验第三方凭据，且同 provider 所有人共用一个账号。
          // 这里只负责把服务端的说明如实透传，不要在前端"兜底登录"绕过去。
          return { ok: false, error: result.error || "第三方登录尚未开放，请使用邮箱或手机号登录" };
        }
        const normalizedUser = normalizeAuthUser(result.user);
        if (!persistSession({ token: result.token, user: normalizedUser })) {
          return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
        }
        setIsAuthenticated(true);
        setUser(normalizedUser);
        setLoginModalOpen(false);
        return { ok: true };
      } catch {
        if (isGithubPagesTest()) {
          const localResult = authenticateLocally("registerOrLogin", `${provider}@artx.test`, provider);
          if (localResult.ok) applyStoredSession();
          return localResult;
        }
        return { ok: false, error: "测试服务暂时不可用，请稍后重试" };
      }
    },
    logout: () => {
      const stored = readStoredSession();
      if (stored?.token) {
        fetchAuth("logout", { token: stored.token }).catch(() => {});
      }
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
      setUser(null);
    },
  }), [isAuthenticated, user, loginModalOpen]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.token || !parsed.user?.id || !parsed.user.username) return null;
    return { token: parsed.token, user: normalizeAuthUser(parsed.user) };
  } catch {
    return null;
  }
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  const role = user.role || (user.username === "09bee" ? "super_admin" : "viewer");
  const rolePermissions: Record<NonNullable<AuthUser["role"]>, string[]> = {
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
  const permissions = Array.from(new Set([
    ...rolePermissions[role],
    ...(Array.isArray(user.permissions) ? user.permissions : []),
  ]));

  return {
    ...user,
    allowedAiModels: Array.isArray(user.allowedAiModels)
      ? Array.from(new Set(user.allowedAiModels.filter((model): model is string => typeof model === "string")))
      : undefined,
    role,
    permissions,
    isAdmin: permissions.includes("admin:access"),
  };
}

function persistSession(session: AuthSession) {
  const serialized = JSON.stringify(session);
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, serialized);
    return true;
  } catch {
    clearLargeArtxLocalCache();
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }
}

function clearLargeArtxLocalCache() {
  const removablePrefixes = [
    "artx:canvas-state:",
    "artx:canvas-assistant-messages:",
    "artx:workspace-project-history:",
    "artx:workspace-project-history:fallback:",
  ];
  const removableKeys = [
    "artx:workspace-project-history",
    "artx:workspace-project-history:fallback",
  ];

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (removableKeys.includes(key) || removablePrefixes.some(prefix => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * 从 URL 读取邀请码（?invite=XXXXXXXX）。
 *
 * 邀请链接由 InviteDialog 生成。这里做大小写归一与长度上限，
 * 长度上限是为了防止有人构造超长参数撑大注册请求体；
 * 真正的合法性判定在后端 findUserByInviteCode，前端不做任何信任假设。
 */
function readInviteCodeFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const raw = new URLSearchParams(window.location.search).get("invite") || "";
    return raw.trim().toUpperCase().slice(0, 32);
  } catch {
    return "";
  }
}

/**
 * 邀请码的本地暂存。
 *
 * ⚠️⚠️ 这不是"顺手加个缓存"，而是邀请闭环能不能成立的前提：
 *
 * 原实现只在**提交注册的那一刻**现读 window.location.search。
 * 但真实用户从邀请链接落地后，几乎不会原地立刻注册 —— 他会先逛首页、
 * 点进灵感页、看看定价，这些跳转都会把 ?invite= 参数弄丢。
 * 等他终于想注册时，URL 上早就没有邀请码了，于是**关系静默不绑定**，
 * 全程没有任何报错，邀请人和被邀请人都以为一切正常。
 *
 * 更要命的是这个错误**不可挽回**：后端 settleFirstPaymentForInvite 在
 * 结算时若发现没有邀请关系会直接跳过，但 hasPaid 标记**照样落盘**
 * （server/auth-store.ts 首次付费结算段）。也就是说一旦首次付费发生，
 * 事后再怎么补绑都永远拿不到奖励。绑定的容错窗口只有"注册前"这一次。
 *
 * 因此这里把邀请码落到 localStorage，并给一个保守的有效期：
 *   - 有效期不宜过长 —— 半个月前点过某人链接的人，今天注册算谁的？
 *     30 天与后端 bindingValidDays 的量级对齐，语义上也讲得通。
 *   - 绑定成功后必须立刻清除，避免同一浏览器换号注册时重复携带。
 */
const INVITE_CODE_STORAGE_KEY = "artx-pending-invite-code";
const INVITE_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function rememberInviteCodeFromUrl() {
  if (typeof window === "undefined") return "";
  const code = readInviteCodeFromUrl();
  if (!code) return "";
  try {
    window.localStorage.setItem(
      INVITE_CODE_STORAGE_KEY,
      JSON.stringify({ code, savedAt: Date.now() }),
    );
  } catch {
    // localStorage 被禁用或写满时不阻断流程：URL 上仍有邀请码，
    // 只要用户在当前页直接注册依然能绑上，只是跳转后会丢。
  }
  return code;
}

export function getPendingInviteCode() {
  if (typeof window === "undefined") return "";
  // URL 优先：用户刚从链接进来，这份最新鲜，也覆盖 localStorage 不可用的情况。
  const fromUrl = readInviteCodeFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const raw = window.localStorage.getItem(INVITE_CODE_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { code?: string; savedAt?: number };
    const code = typeof parsed.code === "string" ? parsed.code : "";
    const savedAt = Number(parsed.savedAt || 0);
    if (!code || !savedAt || Date.now() - savedAt > INVITE_CODE_TTL_MS) {
      window.localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
      return "";
    }
    return code;
  } catch {
    return "";
  }
}

export function clearPendingInviteCode() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
  } catch {
    // 清不掉也不影响正确性：后端对已绑定用户会拒绝二次绑定。
  }
}

async function fetchAuth(action: "register" | "login" | "me" | "logout" | "social" | "sms-send-code" | "sms-login" | "email-send-code" | "email-login" | "forgot-password" | "reset-password" | "change-password", payload: Record<string, unknown>) {
  const apiBaseUrl = getAuthApiBaseUrl();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Auth API returned non-JSON");
  }
  const data = await response.json().catch(() => ({}));
  return {
    ...data,
    ok: response.ok,
  } as { ok: boolean; error?: string; token?: string; user?: AuthUser; retryAfterSeconds?: number; message?: string };
}

function authenticateLocally(action: "login" | "register" | "registerOrLogin", username: string, password: string) {
  const users = readLocalUsers();
  const existing = users.find(item => item.username === username);
  if (action === "register" && existing) {
    return { ok: false, error: "账号已存在，请直接登录" };
  }
  if (action === "login" && !existing) {
    return { ok: false, error: "账号不存在，请先注册" };
  }
  const now = new Date().toISOString();
  const user = existing || {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    password,
    createdAt: now,
  };
  if (existing && existing.password !== password) {
    return { ok: false, error: "账号或密码错误" };
  }
  if (!existing) {
    users.push(user);
    writeLocalUsers(users);
  }
  const session = {
    token: `local-test:${user.id}:${Date.now()}`,
    user: normalizeAuthUser({ id: user.id, username: user.username, createdAt: user.createdAt }),
  };
  if (!persistSession(session)) {
    return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
  }
  return { ok: true };
}

function readLocalUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is AuthUser & { password: string } => {
      return Boolean(item && typeof item.id === "string" && typeof item.username === "string" && typeof item.password === "string");
    }) : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: Array<AuthUser & { password: string }>) {
  try {
    localStorage.setItem(LOCAL_AUTH_USERS_KEY, JSON.stringify(users));
  } catch {
    clearLargeArtxLocalCache();
    localStorage.setItem(LOCAL_AUTH_USERS_KEY, JSON.stringify(users));
  }
}

function isGithubPagesTest() {
  return typeof window !== "undefined" && window.location.hostname.endsWith("github.io");
}

/**
 * 本地测试免登录开关。
 *
 * 仅当构建时注入 VITE_DEV_SKIP_AUTH=true 时为真。
 * 生产构建不设置该变量，Vite 会把整个分支静态判定为 false 并 tree-shake 掉，
 * 因此发布环境的登录流程完全不受影响。
 */
function isDevSkipAuthEnabled() {
  return import.meta.env.VITE_DEV_SKIP_AUTH === "true";
}

/**
 * 向后端换取本地测试会话。失败时返回 null，调用方回退到正常登录流程。
 */
async function fetchDevSession(): Promise<AuthSession | null> {
  if (!isDevSkipAuthEnabled()) return null;

  try {
    const apiBaseUrl = getAuthApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/auth/dev-session`, { method: "GET" });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;

    const data = await response.json() as { token?: string; user?: AuthUser };
    if (!data.token || !data.user?.id || !data.user.username) return null;

    return { token: data.token, user: normalizeAuthUser(data.user) };
  } catch {
    return null;
  }
}

function getAuthApiBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  );

  if (configured) return configured;
  return defaultApiBaseUrlForCurrentHost("");
}
