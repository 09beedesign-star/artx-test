import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  // legacy compat
  theme: ResolvedTheme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  switchable = true,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("theme-mode");
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
    return defaultTheme;
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Listen to system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: ResolvedTheme = mode === "system" ? systemTheme : mode;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem("theme-mode", m);
  };

  const toggleTheme = () => {
    setMode(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setMode, theme: resolvedTheme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
