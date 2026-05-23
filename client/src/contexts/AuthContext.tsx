import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "artx-authenticated";
const TEST_USERNAME = "09bee";
const TEST_PASSWORD = "1234";

interface AuthContextValue {
  isAuthenticated: boolean;
  loginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    setIsAuthenticated(localStorage.getItem(AUTH_STORAGE_KEY) === "true");
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated,
    loginModalOpen,
    openLoginModal: () => setLoginModalOpen(true),
    closeLoginModal: () => setLoginModalOpen(false),
    login: (username: string, password: string) => {
      const passed = username.trim() === TEST_USERNAME && password === TEST_PASSWORD;
      if (passed) {
        localStorage.setItem(AUTH_STORAGE_KEY, "true");
        setIsAuthenticated(true);
        setLoginModalOpen(false);
      }
      return passed;
    },
    logout: () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsAuthenticated(false);
    },
  }), [isAuthenticated, loginModalOpen]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
