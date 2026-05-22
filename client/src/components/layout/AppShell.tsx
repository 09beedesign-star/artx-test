/**
 * AppShell — Global Layout with Left Sidebar
 * Design: Neo-Studio Dark
 * Sidebar icons: 首页 / 工作台 / 创作社区 + bottom: 设置/用户
 */
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Home, LayoutGrid, Users, Settings, HelpCircle,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "home",      label: "首页",     icon: Home,        path: "/" },
  { id: "workspace", label: "工作台",   icon: LayoutGrid,  path: "/workspace" },
  { id: "community", label: "创作社区", icon: Users,       path: "/community" },
];

const BOTTOM_ITEMS = [
  { id: "settings", label: "设置", icon: Settings, path: "/settings" },
  { id: "help",     label: "帮助", icon: HelpCircle, path: "/help" },
];

interface AppShellProps {
  children: React.ReactNode;
  /** If true, hide the sidebar (used on canvas page) */
  hideSidebar?: boolean;
}

export default function AppShell({ children, hideSidebar = false }: AppShellProps) {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const sidebarBg = isDark ? "oklch(0.11 0.012 270)" : "#F5F5F5";
  const sidebarBorder = isDark ? "rgba(255,255,255,0.07)" : "oklch(0.88 0.006 255)";
  const iconDefault = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.50 0.012 255)";
  const iconActive = isDark ? "oklch(0.92 0.008 270)" : "oklch(0.22 0.018 255)";
  const activeBg = isDark ? "rgba(255,255,255,0.08)" : "oklch(0.93 0.010 290 / 0.5)";
  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "oklch(0 0 0 / 0.04)";

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  if (hideSidebar) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left Sidebar ── */}
      <aside
        className="flex flex-col items-center py-4 flex-shrink-0"
        style={{
          width: 56,
          background: sidebarBg,
          borderRight: `1px solid ${sidebarBorder}`,
          zIndex: 10,
          transition: "background 0.25s ease",
        }}
      >
        {/* Logo */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center mb-6 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
            boxShadow: "0 4px 16px oklch(0.58 0.22 290 / 0.35)",
          }}
          onClick={() => navigate("/")}
        >
          <Sparkles size={17} color="white" />
        </div>

        {/* Main nav */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => {
            const active = isActive(path);
            return (
              <Tooltip key={id} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(path)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                    style={{
                      background: active ? activeBg : "transparent",
                      color: active ? iconActive : iconDefault,
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = hoverBg;
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    {active && (
                      <span
                        className="absolute left-0 w-0.5 h-5 rounded-r-full"
                        style={{ background: "oklch(0.62 0.22 290)" }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <span className="text-xs">{label}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom items */}
        <div className="flex flex-col items-center gap-1">
          {BOTTOM_ITEMS.map(({ id, label, icon: Icon, path }) => (
            <Tooltip key={id} delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(path)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                  style={{ color: iconDefault }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = hoverBg)}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <Icon size={17} strokeWidth={1.8} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <span className="text-xs">{label}</span>
              </TooltipContent>
            </Tooltip>
          ))}

          {/* User avatar */}
          <div
            className="w-8 h-8 rounded-full mt-2 flex items-center justify-center text-[12px] font-semibold cursor-pointer select-none"
            style={{
              background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
              color: "white",
            }}
          >
            U
          </div>
        </div>
      </aside>

      {/* ── Page Content ── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
