/**
 * TopBar — Neo-Studio Dark Design System
 * Global top navigation: search, theme switcher (Radix DropdownMenu), credits, user info
 */
import { Search, Bell, ChevronDown, Sparkles, Plus, Moon, Sun, Monitor, Check } from "lucide-react";
import { toast } from "sonner";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const isDark = resolvedTheme === "dark";

  const surface   = isDark ? "oklch(0.11 0.015 270)"       : "var(--design-surface-soft)";
  const border    = isDark ? "oklch(1 0 0 / 6%)"           : "var(--hairline)";
  const inputBg   = isDark ? "oklch(1 0 0 / 5%)"           : "var(--design-canvas)";
  const inputBdr  = isDark ? "oklch(1 0 0 / 8%)"           : "var(--hairline)";
  const textPri   = isDark ? "oklch(0.85 0.01 270)"        : "oklch(0.22 0.018 255)";
  const textSec   = isDark ? "oklch(0.50 0.01 270)"        : "oklch(0.50 0.012 255)";
  const hoverBg   = isDark ? "oklch(1 0 0 / 5%)"           : "oklch(0 0 0 / 0.04)";

  const ActiveIcon = THEME_OPTIONS.find((o) => o.mode === mode)?.icon ?? Moon;

  return (
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{ height: 52, background: surface, borderBottom: `1px solid ${border}`, zIndex: 10 }}
    >
      {/* Search bar */}
      <div
        className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md-design)]"
        style={{ background: inputBg, border: `1px solid ${inputBdr}` }}
      >
        <Search size={13} style={{ color: textSec }} />
        <input
          type="text"
          placeholder="搜索项目、素材或命令…"
          className="flex-1 bg-transparent outline-none type-caption"
          style={{ color: textPri, fontSize: 13 }}
        />
        <span
          className="type-caption px-1.5 py-0.5 rounded-[var(--radius-xs)]"
          style={{ background: hoverBg, color: textSec, fontFamily: "JetBrains Mono, monospace" }}
        >
          ⌘K
        </span>
      </div>

      <div className="flex-1" />

      {/* New project */}
      <button
        onClick={() => toast("新建项目", { description: "功能即将上线" })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md-design)] type-caption transition-all duration-150 active:scale-95"
        style={{
          background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
          color: "white",
          fontSize: 13,
        }}
      >
        <Plus size={13} />
        新建项目
      </button>

      {/* ── Theme switcher via Radix DropdownMenu ── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors outline-none"
            style={{ color: textSec }}
            title="切换主题"
          >
            <ActiveIcon size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-[140px]"
          style={{
            background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)"}`,
            boxShadow: "0 8px 32px oklch(0 0 0 / 0.25)",
          }}
        >
          <DropdownMenuLabel
            className="type-caption uppercase px-3 pt-2 pb-1"
            style={{ color: textSec }}
          >
            主题
          </DropdownMenuLabel>
          <DropdownMenuSeparator style={{ background: isDark ? "oklch(1 0 0 / 8%)" : "oklch(0.88 0.006 255)" }} />
          {THEME_OPTIONS.map(({ mode: m, icon: Icon, label }) => {
            const isActive = mode === m;
            return (
              <DropdownMenuItem
                key={m}
                onClick={() => setMode(m)}
                className="flex items-center gap-2.5 px-3 py-2 type-caption cursor-pointer"
                style={{
                  color: isActive ? "oklch(0.78 0.18 290)" : textPri,
                  background: isActive ? "oklch(0.58 0.22 290 / 0.12)" : "transparent",
                }}
              >
                <Icon size={13} style={{ color: isActive ? "oklch(0.78 0.18 290)" : textSec }} />
                <span>{label}</span>
                {isActive && (
                  <Check size={11} className="ml-auto" style={{ color: "oklch(0.72 0.18 200)" }} />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Credits */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md-design)] cursor-pointer transition-colors"
        style={{ color: textPri }}
        onClick={() => toast("积分详情", { description: "功能即将上线" })}
      >
        <Sparkles size={13} style={{ color: "oklch(0.78 0.18 290)" }} />
        <span className="type-caption">{credits}</span>
        <span className="type-caption" style={{ color: textSec }}>积分</span>
      </div>

      {/* Bell */}
      <button
        onClick={() => toast("通知", { description: "暂无新通知" })}
        className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors relative"
        style={{ color: textSec }}
      >
        <Bell size={15} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-[var(--radius-pill)]" style={{ background: "oklch(0.58 0.22 290)" }} />
      </button>

      {/* User */}
      <button
        onClick={() => toast("用户设置", { description: "功能即将上线" })}
        className="flex items-center gap-2 px-2 py-1 rounded-[var(--radius-md-design)] transition-colors"
        style={{ color: textPri }}
      >
        <div
          className="w-7 h-7 rounded-[var(--radius-pill)] flex items-center justify-center type-caption"
          style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}
        >
          U
        </div>
        <span className="type-caption">用户名</span>
        <ChevronDown size={12} style={{ color: textSec }} />
      </button>
    </header>
  );
}
