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

  const authenticate = async (action: "login" | "register", username: string, password: string) => {
    try {
      const result = await fetchAuth(action, { username, password });
      if (!result.ok || !result.token || !result.user) {
        return { ok: false, error: result.error || "登录失败，请稍后重试" };
      }
      persistSession({ token: result.token, user: result.user });
      setIsAuthenticated(true);
      setUser(result.user);
      setLoginModalOpen(false);
      return { ok: true };
    } catch {
      return { ok: false, error: "测试服务暂时不可用，请稍后重试" };
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
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

async function fetchAuth(action: "register" | "login" | "me" | "logout", payload: Record<string, unknown>) {
  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AI_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  const response = await fetch(`${apiBaseUrl}/api/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return {
    ...data,
    ok: response.ok,
  } as { ok: boolean; error?: string; token?: string; user?: AuthUser };
}
