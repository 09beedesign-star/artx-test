/**
 * TopBar — Neo-Studio Dark Design System
 * Global top navigation: logo area, search, theme switcher, credits, user info
 */
import { useState } from "react";
import { Search, Bell, ChevronDown, Sparkles, Plus, Moon, Sun, Monitor } from "lucide-react";
import { toast } from "sonner";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";

interface TopBarProps {
  credits?: number;
}

const THEME_OPTIONS: { mode: ThemeMode; icon: React.ElementType; label: string }[] = [
  { mode: "dark",   icon: Moon,    label: "深色" },
  { mode: "light",  icon: Sun,     label: "浅色" },
  { mode: "system", icon: Monitor, label: "跟随系统" },
];

export default function TopBar({ credits = 75 }: TopBarProps) {
  const { mode, setMode, resolvedTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);

  const isDark = resolvedTheme === "dark";

  const surface   = isDark ? "oklch(0.11 0.015 270)"       : "oklch(1 0 0)";
  const border    = isDark ? "oklch(1 0 0 / 6%)"           : "oklch(0.88 0.006 255)";
  const inputBg   = isDark ? "oklch(1 0 0 / 5%)"           : "oklch(0.93 0.005 270)";
  const inputBdr  = isDark ? "oklch(1 0 0 / 8%)"           : "oklch(0.86 0.006 255)";
  const textPri   = isDark ? "oklch(0.85 0.01 270)"        : "oklch(0.22 0.018 255)";
  const textSec   = isDark ? "oklch(0.50 0.01 270)"        : "oklch(0.50 0.012 255)";
  const hoverBg   = isDark ? "oklch(1 0 0 / 5%)"           : "oklch(0 0 0 / 0.04)";
  const popupBg   = isDark ? "oklch(0.15 0.018 270)"       : "oklch(0.995 0.002 80)";
  const popupBdr  = isDark ? "oklch(1 0 0 / 12%)"          : "oklch(0.88 0.006 255)";
  const activeRow = isDark ? "oklch(0.58 0.22 290 / 0.15)" : "oklch(0.52 0.22 290 / 0.10)";

  const ActiveIcon = THEME_OPTIONS.find((o) => o.mode === mode)?.icon ?? Moon;

  return (
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{ height: 52, background: surface, borderBottom: `1px solid ${border}`, zIndex: 10 }}
    >
      {/* Search bar */}
      <div
        className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{ background: inputBg, border: `1px solid ${inputBdr}` }}
      >
        <Search size={13} style={{ color: textSec }} />
        <input
          type="text"
          placeholder="搜索项目、素材或命令…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: textPri, fontSize: 13 }}
        />
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: hoverBg, color: textSec, fontFamily: "monospace" }}
        >
          ⌘K
        </span>
      </div>

      <div className="flex-1" />

      {/* New project */}
      <button
        onClick={() => toast("新建项目", { description: "功能即将上线" })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 active:scale-95"
        style={{
          background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
          color: "white",
          fontSize: 13,
        }}
      >
        <Plus size={13} />
        新建项目
      </button>

      {/* ── Theme switcher ── */}
      <div className="relative">
        <button
          onClick={() => setThemeOpen((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{
            background: themeOpen ? activeRow : "transparent",
            border: `1px solid ${themeOpen ? "oklch(0.58 0.22 290 / 0.3)" : "transparent"}`,
            color: themeOpen ? "oklch(0.78 0.18 290)" : textSec,
          }}
          title="切换主题"
        >
          <ActiveIcon size={15} />
        </button>

        {themeOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
            <div
              className="absolute top-full right-0 mt-1.5 rounded-xl overflow-hidden z-50"
              style={{
                background: popupBg,
                border: `1px solid ${popupBdr}`,
                boxShadow: "0 8px 32px oklch(0 0 0 / 0.3)",
                minWidth: 140,
              }}
            >
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textSec }}>
                  主题
                </span>
              </div>
              {THEME_OPTIONS.map(({ mode: m, icon: Icon, label }) => {
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setThemeOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors"
                    style={{
                      background: isActive ? activeRow : "transparent",
                      color: isActive ? "oklch(0.78 0.18 290)" : textPri,
                    }}
                  >
                    <Icon size={13} style={{ color: isActive ? "oklch(0.78 0.18 290)" : textSec }} />
                    <span>{label}</span>
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
                    )}
                  </button>
                );
              })}
              <div className="h-2" />
            </div>
          </>
        )}
      </div>

      {/* Credits */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
        style={{ color: textPri }}
        onClick={() => toast("积分详情", { description: "功能即将上线" })}
      >
        <Sparkles size={13} style={{ color: "oklch(0.78 0.18 290)" }} />
        <span className="text-[13px] font-semibold">{credits}</span>
        <span className="text-[11px]" style={{ color: textSec }}>积分</span>
      </div>

      {/* Bell */}
      <button
        onClick={() => toast("通知", { description: "暂无新通知" })}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors relative"
        style={{ color: textSec }}
      >
        <Bell size={15} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.58 0.22 290)" }} />
      </button>

      {/* User */}
      <button
        onClick={() => toast("用户设置", { description: "功能即将上线" })}
        className="flex items-center gap-2 px-2 py-1 rounded-lg transition-colors"
        style={{ color: textPri }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
          style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}
        >
          U
        </div>
        <span className="text-[13px] font-medium">用户名</span>
        <ChevronDown size={12} style={{ color: textSec }} />
      </button>
    </header>
  );
}
