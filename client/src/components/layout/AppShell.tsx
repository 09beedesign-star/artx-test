/**
 * AppShell — Global Layout with Left Sidebar
 * Design: Neo-Studio — wide sidebar with nav groups
 * Sections: 首页 / 灵感选题 / 技能商店 | 工作区: 工作台 / 素材库
 */
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Home, Sparkles, Library, FolderOpen, Archive,
  Settings, HelpCircle,
} from "lucide-react";


interface AppShellProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
}

export default function AppShell({ children, hideSidebar = false }: AppShellProps) {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const isDark = resolvedTheme === "dark";
  const shouldHideSidebar = hideSidebar || !isAuthenticated;

  // ── Theme tokens ──────────────────────────────────────────────
  const sidebarBg    = isDark ? "oklch(0.11 0.012 270)" : "var(--design-surface-soft)";
  const sidebarBorder= isDark ? "oklch(1 0 0 / 7%)" : "var(--hairline)";
  const textPrimary  = isDark ? "rgba(255,255,255,0.82)" : "rgba(20,20,36,0.82)";
  const textSecondary= isDark ? "rgba(255,255,255,0.38)" : "rgba(20,20,36,0.38)";
  const textMuted    = isDark ? "rgba(255,255,255,0.28)" : "rgba(20,20,36,0.28)";
  const hoverBg      = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const activeBg     = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeColor  = isDark ? "rgba(255,255,255,0.90)" : "rgba(20,20,36,0.90)";
  const dividerColor = isDark ? "oklch(1 0 0 / 7%)" : "var(--hairline)";

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  if (shouldHideSidebar) {
    return (
      <>
        {!isAuthenticated && (
          <button
            onClick={() => navigate("/")}
            className="fixed left-4 top-3 z-30 flex items-center gap-2.5 rounded-[var(--radius-md-design)] px-1 py-1 transition-opacity hover:opacity-85"
            style={{ color: textPrimary }}
            aria-label="返回 artx 首页"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md-design)]"
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                boxShadow: "0 3px 12px oklch(0.58 0.22 290 / 0.30)",
              }}
            >
              <Sparkles size={13} color="white" />
            </span>
            <span className="type-body-sm tracking-tight">artx</span>
          </button>
        )}
        {children}
      </>
    );
  }

  // ── Shared nav item renderer ──────────────────────────────────
  const NavItem = ({
    icon: Icon, label, path, iconSize = 16,
  }: { icon: React.ElementType; label: string; path: string; iconSize?: number }) => {
    const active = isActive(path);
    return (
      <button
        onClick={() => navigate(path)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md-design)] type-caption transition-all text-left"
        style={{
          background: active ? activeBg : "transparent",
          color: active ? activeColor : textSecondary,
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <Icon size={iconSize} strokeWidth={active ? 2.0 : 1.6} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left Sidebar ── */}
      <aside
        className="flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: 200,
          background: sidebarBg,
          borderRight: `1px solid ${sidebarBorder}`,
          zIndex: 10,
          transition: "background 0.25s ease",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <div
            className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center flex-shrink-0 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
              boxShadow: "0 3px 12px oklch(0.58 0.22 290 / 0.30)",
            }}
            onClick={() => navigate("/")}
          >
            <Sparkles size={13} color="white" />
          </div>
          <span
            className="type-body-sm tracking-tight cursor-pointer"
            style={{ color: textPrimary }}
            onClick={() => navigate("/")}
          >
            artx
          </span>
        </div>

        {/* ── Scrollable nav body ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2" style={{ scrollbarWidth: "none" }}>

          {/* Top nav */}
          <div className="flex flex-col gap-0.5 mb-2">
            <NavItem icon={Home}    label="首页"     path="/" />
            <NavItem icon={Sparkles} label="灵感选题" path="/inspiration" iconSize={15} />
            <NavItem icon={Library}  label="技能商店" path="/skills"      iconSize={15} />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: dividerColor, margin: "8px 4px" }} />

          {/* 工作区 group */}
          <div className="mb-2">
            <p className="type-caption px-3 py-1.5 tracking-wider uppercase" style={{ color: textMuted }}>
              工作区
            </p>
            <div className="flex flex-col gap-0.5">
              <NavItem icon={FolderOpen} label="工作台" path="/workspace" iconSize={15} />
              <NavItem icon={Archive}    label="素材库"   path="/assets"    iconSize={15} />
            </div>
          </div>

        </div>

        {/* ── Bottom: Settings + Help + User ── */}
        <div
          className="px-2 pb-4 pt-2 flex flex-col gap-0.5"
          style={{ borderTop: `1px solid ${dividerColor}` }}
        >
          <NavItem icon={Settings}   label="设置" path="/settings" iconSize={15} />
          <NavItem icon={HelpCircle} label="帮助" path="/help"     iconSize={15} />

          {/* User row — 点击跳转个人主页 */}
          <div
            className="flex items-center gap-2.5 px-3 py-2 mt-1 rounded-[var(--radius-md-design)] cursor-pointer transition-all"
            style={{ color: textSecondary }}
            onClick={() => navigate("/profile")}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = hoverBg)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <div
              className="w-6 h-6 rounded-[var(--radius-pill)] flex items-center justify-center type-caption flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                color: "white",
              }}
            >
              U
            </div>
            <span className="type-caption truncate" style={{ color: textPrimary, textTransform: "none", letterSpacing: "0.02em" }}>用户名</span>
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
