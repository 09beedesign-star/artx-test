/**
 * AppShell — Global Layout with Left Sidebar
 * Design: Neo-Studio — wide sidebar with nav groups
 * Sections: 首页 / 灵感选题 / 技能商店 / 工作台
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import generationMark from "@/assets/generation/ai-generation-mark.svg";
import {
  Home, Sparkles, Library, FolderOpen,
  HelpCircle,
} from "lucide-react";


interface AppShellProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
}

export default function AppShell({ children, hideSidebar = false }: AppShellProps) {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPrompt, setHelpPrompt] = useState("");
  const isDark = resolvedTheme === "dark";
  const shouldHideSidebar = hideSidebar || !isAuthenticated;

  // ── Theme tokens ──────────────────────────────────────────────
  const sidebarBg    = isDark ? "oklch(0.11 0.012 270)" : "var(--design-surface-soft)";
  const sidebarBorder= isDark ? "oklch(1 0 0 / 7%)" : "var(--hairline)";
  const textPrimary  = isDark ? "rgba(255,255,255,0.82)" : "rgba(20,20,36,0.82)";
  const textSecondary= isDark ? "rgba(255,255,255,0.38)" : "rgba(20,20,36,0.38)";
  const hoverBg      = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const activeBg     = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeColor  = isDark ? "rgba(255,255,255,0.90)" : "rgba(20,20,36,0.90)";
  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const activateHelpPrompt = () => {
    setHelpOpen(true);
  };

  const closeHelpPrompt = () => {
    setHelpOpen(false);
    setHelpPrompt("");
  };

  const submitHelpPrompt = () => {
    toast("AI 帮助", { description: helpPrompt.trim() || "有什么问题可以问我，我会尽量帮你解答。" });
    closeHelpPrompt();
  };

  if (shouldHideSidebar) {
    return (
      <>
        {!isAuthenticated && (
          <button
            onClick={() => navigate("/")}
            className="fixed left-4 top-3 z-30 flex origin-left scale-[0.715] items-center gap-2.5 rounded-[var(--radius-md-design)] px-1 py-1 transition-opacity hover:opacity-85"
            style={{ color: textPrimary }}
            aria-label="返回 artx 首页"
          >
            <img
              src={artxStudioLogo}
              alt="ArtXStudio"
              className="block h-7 w-[152px] object-contain object-left"
            />
          </button>
        )}
        {children}
        {helpOpen && (
          <div
            className="fixed inset-0 flex items-center justify-center px-6"
            style={{ zIndex: 10000, background: "rgba(0,0,0,0.20)" }}
            onMouseDown={e => {
              if (e.target === e.currentTarget) closeHelpPrompt();
            }}
          >
            <div
              className="w-[min(520px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-4 shadow-2xl"
              style={{
                background: isDark ? "rgba(22,22,30,0.98)" : "rgba(255,255,255,0.98)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                backdropFilter: "blur(18px)",
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <textarea
                autoFocus
                value={helpPrompt}
                onChange={e => setHelpPrompt(e.target.value)}
                placeholder="有什么问题可以问我，我会尽量帮你解答。"
                className="w-full resize-none bg-transparent outline-none leading-6"
                rows={5}
                style={{ color: textPrimary, fontSize: 15 }}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeHelpPrompt}
                  className="h-9 min-w-[88px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-80"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
                    color: textPrimary,
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitHelpPrompt}
                  className="h-9 min-w-[96px] inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
                  style={{
                    background: "#C5ED47",
                    color: "#000",
                    boxShadow: "0 8px 22px rgba(197,237,71,0.24)",
                  }}
                >
                  <img src={generationMark} alt="" aria-hidden="true" draggable={false} className="h-3.5 w-3.5 object-contain" style={{ filter: "brightness(0)" }} />
                  提交
                </button>
              </div>
            </div>
          </div>
        )}
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
          <button
            type="button"
            className="h-7 w-[152px] origin-left scale-[0.715] cursor-pointer transition-opacity hover:opacity-85"
            onClick={() => navigate("/")}
            aria-label="ArtXStudio 首页"
          >
            <img
              src={artxStudioLogo}
              alt="ArtXStudio"
              className="block h-full w-full object-contain object-left"
            />
          </button>
        </div>

        {/* ── Scrollable nav body ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2" style={{ scrollbarWidth: "none" }}>

          {/* Top nav */}
          <div className="flex flex-col gap-0.5 mb-2">
            <NavItem icon={Home}    label="首页"     path="/" />
            <NavItem icon={Sparkles} label="灵感选题" path="/inspiration" iconSize={15} />
            <NavItem icon={Library}  label="技能商店" path="/skills"      iconSize={15} />
            <NavItem icon={FolderOpen} label="工作台" path="/workspace" iconSize={15} />
          </div>

        </div>

        {/* ── Bottom: Help ── */}
        <div
          className="px-2 pb-4 pt-2 flex flex-col gap-0.5"
        >
          <button
            onClick={activateHelpPrompt}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md-design)] type-caption transition-all text-left"
            style={{ background: "transparent", color: textSecondary }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = hoverBg)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <HelpCircle size={15} strokeWidth={1.6} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span className="truncate">帮助</span>
          </button>
        </div>
      </aside>

      {/* ── Page Content ── */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
      {helpOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center px-6"
          style={{ zIndex: 10000, background: "rgba(0,0,0,0.20)" }}
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeHelpPrompt();
          }}
        >
          <div
            className="w-[min(520px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-4 shadow-2xl"
            style={{
              background: isDark ? "rgba(22,22,30,0.98)" : "rgba(255,255,255,0.98)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              backdropFilter: "blur(18px)",
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <textarea
              autoFocus
              value={helpPrompt}
              onChange={e => setHelpPrompt(e.target.value)}
              placeholder="有什么问题可以问我，我会尽量帮你解答。"
              className="w-full resize-none bg-transparent outline-none leading-6"
              rows={5}
              style={{ color: textPrimary, fontSize: 15 }}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeHelpPrompt}
                className="h-9 min-w-[88px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-80"
                style={{
                  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
                  color: textPrimary,
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitHelpPrompt}
                className="h-9 min-w-[96px] inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
                style={{
                  background: "#C5ED47",
                  color: "#000",
                  boxShadow: "0 8px 22px rgba(197,237,71,0.24)",
                }}
              >
                <img src={generationMark} alt="" aria-hidden="true" draggable={false} className="h-3.5 w-3.5 object-contain" style={{ filter: "brightness(0)" }} />
                提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
