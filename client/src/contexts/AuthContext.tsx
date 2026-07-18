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
    const stored = readStoredSession();
    if (!stored) return;

    setIsAuthenticated(true);
    setUser(stored.user);

    fetchAuth("me", { token: stored.token }).then((result) => {
      if (result.ok && result.user) {
        const normalizedUser = normalizeAuthUser(result.user);
        persistSession({ token: stored.token, user: normalizedUser });
        setUser(normalizedUser);
        return;
      }
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
      setUser(null);
    }).catch(() => {
      // Keep the local session when the test server is temporarily unreachable.
    });
  }, []);

  useEffect(() => {
    const handleLoginRequired = () => setLoginModalOpen(true);
    window.addEventListener("artx:login-required", handleLoginRequired);
    return () => window.removeEventListener("artx:login-required", handleLoginRequired);
  }, []);

  const authenticate = async (action: "login" | "register", username: string, password: string) => {
    try {
      const result = await fetchAuth(action, { username, password });
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
      const result = await fetchAuth("sms-login", { phone, code });
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
      return { ok: true };
    } catch {
      return { ok: false, error: "短信验证码服务暂时不可用，请稍后重试" };
    }
  };

  const authenticateWithEmail = async (email: string, code: string) => {
    try {
      const result = await fetchAuth("email-login", { email, code });
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
          return { ok: false, error: result.error || "第三方登录暂时不可用" };
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

function getAuthApiBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  );

  if (configured) return configured;
  return defaultApiBaseUrlForCurrentHost("");
}
