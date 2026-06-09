import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "artx-auth-session";
const LOCAL_AUTH_USERS_KEY = "artx-local-auth-users";

interface AuthUser {
  id: string;
  username: string;
  createdAt?: string;
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
  socialAuth: (provider: "google" | "wechat" | "apple") => Promise<{ ok: boolean; error?: string }>;
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
        persistSession({ token: stored.token, user: result.user });
        setUser(result.user);
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
      if (!persistSession({ token: result.token, user: result.user })) {
        return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
      }
      setIsAuthenticated(true);
      setUser(result.user);
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
        if (!persistSession({ token: result.token, user: result.user })) {
          return { ok: false, error: "浏览器本地存储空间不足，已尝试清理旧画布缓存，请重新登录" };
        }
        setIsAuthenticated(true);
        setUser(result.user);
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
    return { token: parsed.token, user: parsed.user };
  } catch {
    return null;
  }
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
  ];
  const removableKeys = [
    "artx:workspace-project-history",
  ];

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (removableKeys.includes(key) || removablePrefixes.some(prefix => key.startsWith(prefix))) {
      localStorage.removeItem(key);
    }
  }
}

async function fetchAuth(action: "register" | "login" | "me" | "logout" | "social", payload: Record<string, unknown>) {
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
  } as { ok: boolean; error?: string; token?: string; user?: AuthUser };
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
    user: { id: user.id, username: user.username, createdAt: user.createdAt },
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
  const configured = (
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://artx-test.onrender.com";
  }

  return "";
}
