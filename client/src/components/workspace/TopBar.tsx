/**
 * TopBar — Neo-Studio Dark Design System
 * Global top navigation: search, theme switcher (Radix DropdownMenu), credits, user info
 */
import { useState, type ElementType } from "react";
import { Bell, ChevronDown, Sparkles, Plus, Moon, Sun, Monitor, Check, UserRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import CreateProjectDialog, { type CreateProjectPayload } from "@/components/workspace/CreateProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TopBarProps {
  credits?: number;
  onNewProjectClick?: () => void;
  onCreateProject?: (payload: CreateProjectPayload) => void;
}

const THEME_OPTIONS: { mode: ThemeMode; icon: ElementType; label: string }[] = [
  { mode: "dark",   icon: Moon,    label: "深色" },
  { mode: "light",  icon: Sun,     label: "浅色" },
  { mode: "system", icon: Monitor, label: "跟随系统" },
];

export default function TopBar({ credits = 75, onNewProjectClick, onCreateProject }: TopBarProps) {
  const { mode, setMode, resolvedTheme } = useTheme();
  const { isAuthenticated, openLoginModal, logout } = useAuth();
  const [, navigate] = useLocation();

  const isDark = resolvedTheme === "dark";

  const surface   = isDark ? "oklch(0.11 0.015 270)"       : "var(--design-surface-soft)";
  const border    = isDark ? "oklch(1 0 0 / 6%)"           : "var(--hairline)";
  const textPri   = isDark ? "oklch(0.85 0.01 270)"        : "oklch(0.22 0.018 255)";
  const textSec   = isDark ? "oklch(0.50 0.01 270)"        : "oklch(0.50 0.012 255)";
  const hoverBg   = isDark ? "oklch(1 0 0 / 5%)"           : "oklch(0 0 0 / 0.04)";

  const ActiveIcon = THEME_OPTIONS.find((o) => o.mode === mode)?.icon ?? Moon;
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const handleConfirmLogout = () => {
    logout();
    setLogoutConfirmOpen(false);
    navigate("/");
  };

  const handleNewProjectClick = () => {
    if (onNewProjectClick) {
      onNewProjectClick();
      return;
    }
    setCreateProjectOpen(true);
  };

  const handleCreateProject = (payload: CreateProjectPayload) => {
    if (onCreateProject) {
      onCreateProject(payload);
      return;
    }
    toast("项目已创建", { description: payload.name });
    navigate(`/project/${payload.id}`);
  };

  return (
    <>
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{ height: 52, background: surface, borderBottom: `1px solid ${border}`, zIndex: 10 }}
    >
      <div className="flex-1" />

      {!isAuthenticated && (
        <button
          onClick={openLoginModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md-design)] type-caption transition-all duration-150 active:scale-95"
          style={{
            background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
            color: "white",
            fontSize: 13,
            boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.24)",
          }}
        >
          开始体验
        </button>
      )}

      {isAuthenticated && (<>

      {/* New project */}
      <button
        onClick={handleNewProjectClick}
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

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 px-2 py-1 rounded-[var(--radius-md-design)] transition-colors outline-none"
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
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="min-w-[150px]"
          style={{
            background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)"}`,
            boxShadow: "0 8px 32px oklch(0 0 0 / 0.25)",
          }}
        >
          <DropdownMenuItem
            onClick={() => navigate("/profile")}
            className="flex items-center gap-2.5 px-3 py-2 type-caption cursor-pointer"
            style={{ color: textPri }}
          >
            <UserRound size={13} style={{ color: textSec }} />
            <span>个人主页</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator style={{ background: isDark ? "oklch(1 0 0 / 8%)" : "oklch(0.88 0.006 255)" }} />
          <DropdownMenuItem
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex items-center gap-2.5 px-3 py-2 type-caption cursor-pointer"
            style={{ color: "oklch(0.68 0.22 25)" }}
          >
            <LogOut size={13} />
            <span>退出</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </>)}
    </header>

    <CreateProjectDialog
      open={createProjectOpen}
      onOpenChange={setCreateProjectOpen}
      onCreate={handleCreateProject}
    />

    <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
      <AlertDialogContent
        className="w-[min(420px,calc(100vw-32px))] rounded-[var(--radius-lg-design)] border p-0 overflow-hidden"
        style={{
          background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
          borderColor: isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)",
          boxShadow: "0 24px 80px oklch(0 0 0 / 0.35)",
        }}
      >
        <div className="p-6">
          <AlertDialogHeader className="gap-2 text-center">
            <AlertDialogTitle
              className="type-title-sm"
              style={{ color: textPri, fontSize: 18, fontWeight: 650 }}
            >
              确认退出当前账号？
            </AlertDialogTitle>
            <AlertDialogDescription
              className="type-body-sm leading-6"
              style={{ color: textSec }}
            >
              退出后将回到未登录首页。所有内容会在下一次打开后继续进行，你可以随时重新登录并继续当前创作。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-6 flex-row justify-center gap-3 sm:justify-center">
            <AlertDialogCancel
              className="h-9 min-w-[96px] rounded-[var(--radius-md-design)] type-caption"
              style={{
                background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                borderColor: isDark ? "oklch(1 0 0 / 10%)" : "oklch(0.88 0.006 255)",
                color: textPri,
              }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLogout}
              className="h-9 min-w-[112px] rounded-[var(--radius-md-design)] type-caption"
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                color: "white",
                boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.22)",
              }}
            >
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
