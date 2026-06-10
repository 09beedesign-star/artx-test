import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "artx-auth-session";

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
  socialAuth: (provider: "google" | "wechat" | "github" | "meta") => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialSession = useMemo(() => readStoredSession(), []);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(initialSession));
  const [user, setUser] = useState<AuthUser | null>(initialSession?.user || null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    const callbackResult = readOAuthCallbackResult();
    if (callbackResult && "token" in callbackResult && callbackResult.token && callbackResult.user?.id && callbackResult.user.username) {
      if (persistSession({ token: callbackResult.token, user: callbackResult.user })) {
        setIsAuthenticated(true);
        setUser(callbackResult.user);
        setLoginModalOpen(false);
      }
      clearOAuthCallbackParams();
      return;
    }
    if (callbackResult && "error" in callbackResult && callbackResult.error) {
      clearOAuthCallbackParams();
    }

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
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
      setUser(null);
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
      return { ok: false, error: "认证服务暂时不可用，请稍后重试" };
    }
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
        window.location.href = getOAuthStartUrl(provider);
        return { ok: true };
      } catch {
        return { ok: false, error: "认证服务暂时不可用，请稍后重试" };
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

function readOAuthCallbackResult(): (AuthSession & { error?: never }) | { error: string } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const encodedResult = params.get("auth_result");
    const authError = params.get("auth_error");
    if (authError) return { error: authError };
    if (!encodedResult) return null;
    const decoded = JSON.parse(base64UrlDecode(encodedResult)) as Partial<AuthSession>;
    if (!decoded.token || !decoded.user?.id || !decoded.user.username) return null;
    return { token: decoded.token, user: decoded.user };
  } catch {
    return null;
  }
}

function clearOAuthCallbackParams() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_result");
    url.searchParams.delete("auth_error");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore URL cleanup failures.
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

function getOAuthStartUrl(provider: "google" | "wechat" | "github" | "meta") {
  const apiBaseUrl = getAuthApiBaseUrl();
  const returnTo = window.location.href;
  return `${apiBaseUrl}/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;
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
