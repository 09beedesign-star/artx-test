/**
 * TopBar — Neo-Studio Dark Design System
 * Global top navigation: search, theme switcher (Radix DropdownMenu), credits, user info
 */
import { useMemo, useState } from "react";
import { ChevronDown, Sparkles, Check, UserRound, LogOut, Search, KeyRound, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { type CreateProjectPayload } from "@/components/workspace/CreateProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  projectTitle?: string;
  projectTime?: string;
  showSearch?: boolean;
}

const AVATAR_COLORS = [
  "#4F8CFF",
  "#FF6B57",
  "#21B573",
  "#FFB020",
  "#8F5BFF",
  "#00A7A7",
  "#E84D89",
  "#6C7A89",
];

export default function TopBar({ credits = 0, projectTitle, projectTime, showSearch = false }: TopBarProps) {
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, user, openLoginModal, logout } = useAuth();
  const [, navigate] = useLocation();

  const isDark = resolvedTheme === "dark";

  const surface   = isDark ? "oklch(0.11 0.015 270)"       : "var(--design-surface-soft)";
  const border    = isDark ? "oklch(1 0 0 / 6%)"           : "var(--hairline)";
  const textPri   = isDark ? "oklch(0.85 0.01 270)"        : "oklch(0.22 0.018 255)";
  const textSec   = isDark ? "oklch(0.50 0.01 270)"        : "oklch(0.50 0.012 255)";
  const hoverBg   = isDark ? "oklch(1 0 0 / 5%)"           : "oklch(0 0 0 / 0.04)";

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyCreationConfirmed, setApiKeyCreationConfirmed] = useState(false);

  const searchBg = isDark ? "oklch(0.16 0.016 270 / 0.90)" : "oklch(0.97 0.003 270 / 0.92)";
  const searchBorder = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const searchSub = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.50 0.012 255)";
  const displayName = user?.username || "用户名";
  const avatarLetter = displayName.trim().slice(0, 1).toUpperCase() || "U";
  const avatarColor = useMemo(() => {
    const seed = displayName.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return AVATAR_COLORS[seed % AVATAR_COLORS.length];
  }, [displayName]);

  const handleConfirmLogout = () => {
    logout();
    setLogoutConfirmOpen(false);
    navigate("/");
  };

  const generateApiKey = () => {
    const bytes = new Uint8Array(24);
    globalThis.crypto?.getRandomValues?.(bytes);
    const token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    const nextKey = `artx_sk_${token.slice(0, 12)}_${token.slice(12, 36)}`;
    setApiKey(nextKey);
    setApiKeyCopied(false);
    setApiKeyCreationConfirmed(true);
    return nextKey;
  };

  const openApiKeyDialog = () => {
    setApiKeyCreationConfirmed(Boolean(apiKey));
    setApiKeyDialogOpen(true);
  };

  const copyApiKey = async () => {
    if (!apiKey) {
      toast.error("请先创建 API Key");
      return;
    }
    const key = apiKey;
    try {
      await navigator.clipboard.writeText(key);
      setApiKeyCopied(true);
      toast.success("API Key 已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <>
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{ height: 52, background: surface, borderBottom: `1px solid ${border}`, zIndex: 10 }}
    >
      {/* Left: project title */}
      <div className="flex items-baseline gap-2 min-w-0" style={{ flex: "0 0 auto", maxWidth: 280 }}>
        {projectTitle && (
          <>
            <span className="font-semibold text-sm truncate" style={{ color: textPri }}>{projectTitle}</span>
            {projectTime && <span className="type-caption whitespace-nowrap" style={{ color: textSec }}>{projectTime}</span>}
          </>
        )}
        {!projectTitle && <div style={{ flex: 1 }} />}
      </div>

      {/* Center: search bar (canvas mode only) */}
      {showSearch && (
        <div className="flex-1 flex justify-center" style={{ minWidth: 0 }}>
          <div style={{ width: "min(320px, 100%)", position: "relative" }}>
            <div
              className="flex items-center gap-2 px-3 rounded-[var(--radius-lg-design)]"
              style={{
                height: 34,
                background: searchBg,
                border: `1px solid ${searchBorder}`,
                backdropFilter: "blur(14px)",
                cursor: "default",
                opacity: 0.82,
              }}
            >
              <Search size={13} style={{ color: searchSub, flexShrink: 0 }} />
              <span
                className="flex-1 truncate select-none"
                style={{ fontSize: 12, color: searchSub, lineHeight: 1.4 }}
              >
                搜索项目或素材...
              </span>
            </div>
          </div>
        </div>
      )}
      {!showSearch && <div className="flex-1" />}

      {/* Right: actions */}

      {showSearch && (
        <button
          onClick={openApiKeyDialog}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md-design)] type-caption transition-all duration-150 active:scale-95"
          style={{
            height: 32,
            color: textPri,
            background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)")}
        >
          <KeyRound size={13} style={{ color: "oklch(0.72 0.18 200)" }} />
          <span>API Key</span>
        </button>
      )}

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

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 px-2 py-1 rounded-[var(--radius-md-design)] transition-colors outline-none"
            style={{ color: textPri }}
          >
            <div
              className="w-7 h-7 rounded-[var(--radius-pill)] flex items-center justify-center type-caption"
              style={{ background: avatarColor, color: "white" }}
            >
              {avatarLetter}
            </div>
            <span className="type-caption max-w-[120px] truncate">{displayName}</span>
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

    <AlertDialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
      <AlertDialogContent
        className="w-[min(460px,calc(100vw-32px))] rounded-[var(--radius-lg-design)] border p-0 overflow-hidden"
        style={{
          background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
          borderColor: isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)",
          boxShadow: "0 24px 80px oklch(0 0 0 / 0.35)",
        }}
      >
        <div className="p-6">
          <AlertDialogHeader className="gap-2 text-left">
            <div
              className="w-10 h-10 rounded-[var(--radius-md-design)] flex items-center justify-center mb-1"
              style={{
                background: isDark ? "oklch(0.72 0.18 200 / 0.14)" : "oklch(0.72 0.18 200 / 0.10)",
                color: "oklch(0.72 0.18 200)",
              }}
            >
              <KeyRound size={18} />
            </div>
            <AlertDialogTitle
              className="type-title-sm"
              style={{ color: textPri, fontSize: 18, fontWeight: 650 }}
            >
              {apiKeyCreationConfirmed ? "生成 API Key" : "是否需要创建 API Key？"}
            </AlertDialogTitle>
            <AlertDialogDescription
              className="type-body-sm leading-6"
              style={{ color: textSec }}
            >
              {apiKeyCreationConfirmed
                ? "复制该 Key 后可交给第三方 Agent 复用当前项目能力。真实 AI 鉴权后续接入，这里先搭建界面和交互框架。"
                : "创建后会生成一枚可复制的 API Key，用于后续接入第三方 Agent。"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {apiKeyCreationConfirmed && (
            <div
              className="mt-5 rounded-[var(--radius-md-design)] p-3"
              style={{
                background: isDark ? "oklch(0.10 0.012 270)" : "oklch(0.97 0.003 270)",
                border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 min-w-0 truncate"
                  style={{
                    color: textPri,
                    fontSize: 12,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {apiKey}
                </code>
                <button
                  onClick={copyApiKey}
                  className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors"
                  style={{
                    color: apiKeyCopied ? "oklch(0.68 0.18 145)" : textSec,
                    background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                  }}
                  title="复制 API Key"
                >
                  {apiKeyCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          <AlertDialogFooter className="mt-6 flex-row justify-end gap-3 sm:justify-end">
            <AlertDialogCancel
              className="h-9 min-w-[88px] rounded-[var(--radius-md-design)] type-caption"
              style={{
                background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                borderColor: isDark ? "oklch(1 0 0 / 10%)" : "oklch(0.88 0.006 255)",
                color: textPri,
              }}
            >
              关闭
            </AlertDialogCancel>
            <button
              onClick={() => generateApiKey()}
              className="h-9 min-w-[104px] inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md-design)] type-caption"
              style={{
                background: isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 0.05)",
                border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0.88 0.006 255)"}`,
                color: textPri,
              }}
            >
              <RefreshCw size={13} />
              {apiKeyCreationConfirmed ? "重新生成" : "确认创建"}
            </button>
            {apiKeyCreationConfirmed && (
              <AlertDialogAction
                onClick={copyApiKey}
                className="h-9 min-w-[96px] rounded-[var(--radius-md-design)] type-caption"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                  color: "white",
                  boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.22)",
                }}
              >
                复制
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>

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
