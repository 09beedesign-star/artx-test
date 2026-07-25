/**
 * TopBar — Neo-Studio Dark Design System
 * Global top navigation: search, theme switcher (Radix DropdownMenu), credits, user info
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Sparkles, Check, UserRound, LogOut, Search, KeyRound, Copy, RefreshCw, Zap, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { type CreateProjectPayload } from "@/components/workspace/CreateProjectDialog";
import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "@/lib/api-base-url";
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
  onProjectTitleChange?: (title: string) => void;
  showSearch?: boolean;
  glass?: boolean;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
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
const EXTERNAL_AGENT_BASE_URL = "https://admin.artxsd.com";
const OPENAI_COMPATIBLE_BASE_URL = `${EXTERNAL_AGENT_BASE_URL}/v1`;
const RECOMMENDED_IMAGE_MODEL = "og-image2-medium";
const OPENAI_COMPATIBLE_VERSION = "506a8b9";

function getTopBarApiBaseUrl() {
  if (typeof window === "undefined") return ART_X_TEST_API_BASE_URL;
  const configured = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (configured) return configured;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith("github.io")) {
    return ART_X_TEST_API_BASE_URL;
  }
  return window.location.origin.replace(/\/+$/, "");
}

function getTopBarAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

export default function TopBar({ credits = 0, projectTitle, projectTime, onProjectTitleChange, showSearch = false, glass = false }: TopBarProps) {
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, user, openLoginModal, logout } = useAuth();
  const [, navigate] = useLocation();

  const isDark = resolvedTheme === "dark";

  const surface   = isDark
    ? (glass ? "rgba(34,34,34,0.20)" : "oklch(0.11 0.015 270)")
    : (glass ? "rgba(247,247,245,0.72)" : "var(--design-surface-soft)");
  const border    = isDark ? "oklch(1 0 0 / 6%)"           : "var(--hairline)";
  const textPri   = isDark ? "oklch(0.85 0.01 270)"        : "oklch(0.22 0.018 255)";
  const textSec   = isDark ? "oklch(0.65 0.010 270)"        : "oklch(0.65 0.010 255)";
  const hoverBg   = isDark ? "oklch(1 0 0 / 5%)"           : "oklch(0 0 0 / 0.04)";

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [apiKeyCreationConfirmed, setApiKeyCreationConfirmed] = useState(false);
  const [syncedCredits, setSyncedCredits] = useState<number | null>(null);
  const [isEditingProjectTitle, setIsEditingProjectTitle] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState(projectTitle || "");
  const projectTitleInputRef = useRef<HTMLInputElement>(null);

  const searchBg = isDark ? "oklch(0.16 0.016 270 / 0.90)" : "oklch(0.97 0.003 270 / 0.92)";
  const searchBorder = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const searchSub = isDark ? "oklch(0.65 0.010 270)" : "oklch(0.65 0.010 255)";
  const displayName = user?.username || "用户名";
  const avatarLetter = displayName.trim().slice(0, 1).toUpperCase() || "U";
  const avatarColor = useMemo(() => {
    const seed = displayName.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return AVATAR_COLORS[seed % AVATAR_COLORS.length];
  }, [displayName]);
  const displayCredits = syncedCredits ?? credits;

  useEffect(() => {
    if (!isEditingProjectTitle) setProjectTitleDraft(projectTitle || "");
  }, [isEditingProjectTitle, projectTitle]);

  useEffect(() => {
    if (!isEditingProjectTitle) return;
    projectTitleInputRef.current?.focus();
    projectTitleInputRef.current?.select();
  }, [isEditingProjectTitle]);

  const commitProjectTitleEdit = useCallback(() => {
    if (!isEditingProjectTitle) return;
    const nextTitle = projectTitleDraft.trim();
    setIsEditingProjectTitle(false);
    if (!nextTitle || nextTitle === projectTitle) {
      setProjectTitleDraft(projectTitle || "");
      return;
    }
    onProjectTitleChange?.(nextTitle);
  }, [isEditingProjectTitle, onProjectTitleChange, projectTitle, projectTitleDraft]);

  const cancelProjectTitleEdit = useCallback(() => {
    setProjectTitleDraft(projectTitle || "");
    setIsEditingProjectTitle(false);
  }, [projectTitle]);

  const refreshCredits = useCallback(async () => {
    if (!isAuthenticated) {
      setSyncedCredits(null);
      return;
    }
    const token = getTopBarAuthToken();
    if (!token) {
      setSyncedCredits(null);
      return;
    }
    try {
      const response = await fetch(`${getTopBarApiBaseUrl()}/api/billing/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.balance !== "number") return;
      setSyncedCredits(payload.balance);
    } catch {
      // Keep the last visible balance when the network is temporarily unavailable.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshCredits();
  }, [refreshCredits, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined" || typeof document === "undefined") return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshCredits();
    };
    const handleCreditsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === "number") {
        setSyncedCredits(detail.balance);
      }
      void refreshCredits();
    };
    const interval = window.setInterval(() => void refreshCredits(), 15_000);

    window.addEventListener("focus", refreshCredits);
    window.addEventListener("artx:credits-updated", handleCreditsUpdated);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCredits);
      window.removeEventListener("artx:credits-updated", handleCreditsUpdated);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isAuthenticated, refreshCredits]);

  const handleConfirmLogout = () => {
    logout();
    setLogoutConfirmOpen(false);
    navigate("/");
  };

  const developerFetch = async <T,>(path: string, options: RequestInit = {}) => {
    const token = getTopBarAuthToken();
    const response = await fetch(`${getTopBarApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "请求失败，请稍后重试");
    }
    return data as T;
  };

  const refreshApiKeys = async () => {
    const result = await developerFetch<{ keys?: ApiKeyRecord[] }>("/api/developer/api-keys");
    setApiKeys(result.keys || []);
  };

  const generateApiKey = async () => {
    setApiKeyLoading(true);
    try {
      const result = await developerFetch<{ key?: ApiKeyRecord & { value?: string } }>("/api/developer/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "ArtX MCP Key" }),
      });
      if (!result.key?.value) throw new Error("API Key 生成失败");
      setApiKey(result.key.value);
      setApiKeys(current => [result.key as ApiKeyRecord, ...current.filter(item => item.id !== result.key?.id)]);
      setApiKeyCopied(false);
      setApiKeyCreationConfirmed(true);
      toast.success("API Key 已生成", { description: "完整 Key 只在当前弹窗展示一次" });
    } catch (error) {
      toast.error("API Key 生成失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setApiKeyLoading(false);
    }
  };

  const openApiKeyDialog = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setApiKeyCreationConfirmed(Boolean(apiKey));
    setApiKeyDialogOpen(true);
    setApiKeyLoading(true);
    refreshApiKeys()
      .catch(error => toast.error("API Key 暂时不可用", { description: error instanceof Error ? error.message : "请稍后重试" }))
      .finally(() => setApiKeyLoading(false));
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

  const apiKeyForSnippet = apiKey || "YOUR_ARTX_API_KEY";
  const authorizationHeader = `Authorization: Bearer ${apiKeyForSnippet}`;
  const thirdPartyAgentConfigText = JSON.stringify({
    baseURL: OPENAI_COMPATIBLE_BASE_URL,
    apiKey: apiKeyForSnippet,
    model: RECOMMENDED_IMAGE_MODEL,
    stream: false,
  }, null, 2);
  const modelsCurlText = `curl ${OPENAI_COMPATIBLE_BASE_URL}/models \\
  -H "${authorizationHeader}"`;
  const chatCompletionCurlText = `curl ${OPENAI_COMPATIBLE_BASE_URL}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "${authorizationHeader}" \\
  -d '${JSON.stringify({
    model: RECOMMENDED_IMAGE_MODEL,
    stream: false,
    messages: [
      { role: "user", content: "生成一张干净背景的小白兔产品图" },
    ],
  }, null, 2)}'`;
  const mcpConfigText = JSON.stringify(
    {
      mcpServers: {
        "artx-image": {
          url: `${EXTERNAL_AGENT_BASE_URL}/api/mcp`,
          headers: {
            Authorization: `Bearer ${apiKeyForSnippet}`,
          },
        },
      },
    },
    null,
    2
  );

  const copyMcpConfig = async () => {
    const config = mcpConfigText;
    try {
      await navigator.clipboard.writeText(config);
      toast.success("MCP 配置已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const copyText = async (text: string, label = "内容") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <>
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{
        height: 52,
        background: surface,
        borderBottom: `1px solid ${border}`,
        backdropFilter: glass ? "blur(18px)" : undefined,
        WebkitBackdropFilter: glass ? "blur(18px)" : undefined,
        zIndex: 10,
      }}
    >
      {/* Left: project title */}
      <div className="flex items-baseline gap-2 min-w-0" style={{ flex: "0 0 auto", maxWidth: 280 }}>
        {projectTitle && (
          <>
            {isEditingProjectTitle ? (
              <input
                ref={projectTitleInputRef}
                value={projectTitleDraft}
                onChange={event => setProjectTitleDraft(event.target.value)}
                onBlur={commitProjectTitleEdit}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelProjectTitleEdit();
                  }
                }}
                className="font-semibold text-sm"
                style={{
                  width: 156,
                  height: 26,
                  color: textPri,
                  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  border: `1px solid ${searchBorder}`,
                  borderRadius: 6,
                  outline: "none",
                  padding: "0 8px",
                }}
              />
            ) : (
              <span
                className="font-semibold text-sm truncate"
                title="双击重命名画布"
                onDoubleClick={() => {
                  if (!onProjectTitleChange) return;
                  setProjectTitleDraft(projectTitle);
                  setIsEditingProjectTitle(true);
                }}
                style={{
                  color: textPri,
                  cursor: onProjectTitleChange ? "text" : "default",
                }}
              >
                {projectTitle}
              </span>
            )}
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
          className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[#936CFF] px-4 text-sm font-medium text-white shadow-[0_10px_28px_rgba(147,108,255,0.30)] transition-colors hover:bg-[#8257ff]"
          style={{
            border: "0",
          }}
        >
          开始体验
        </button>
      )}

      {isAuthenticated && (<>

      <div
        className="group relative"
        style={{ marginRight: 0 }}
      >
        <button
          type="button"
          onClick={openApiKeyDialog}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption transition-colors active:scale-95"
          style={{
            color: textPri,
            background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)")}
          aria-label="打开 MCP 配置"
        >
          <Link2 size={13} style={{ color: "oklch(0.72 0.18 200)" }} />
          <span style={{ fontWeight: 700, letterSpacing: 0 }}>MCP</span>
        </button>
        <div
          className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-md-design)] px-3 py-2 opacity-0 shadow-[0_14px_36px_rgba(0,0,0,0.24)] transition-opacity group-hover:opacity-100"
          style={{
            background: isDark ? "rgba(22,22,30,0.96)" : "rgba(30,30,40,0.94)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.16)"}`,
            color: "white",
            fontSize: 12,
            lineHeight: "16px",
          }}
        >
          复制 MCP 可以接入其他 Agent 里。
        </div>
      </div>

      {/* Credits + billing */}
      <div
        className="flex items-center rounded-[var(--radius-lg-design)] p-1 transition-colors"
        style={{
          height: 40,
          gap: 6,
          background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)",
          border: `1px solid ${isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 10%)"}`,
          boxShadow: isDark ? "inset 0 1px 0 oklch(1 0 0 / 6%)" : "inset 0 1px 0 oklch(1 0 0 / 70%)",
        }}
      >
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption transition-colors"
          style={{ color: textPri, background: "transparent" }}
          onClick={() => navigate("/billing?tab=recharge")}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          title="查看积分与充值"
        >
          <Sparkles size={13} style={{ color: "oklch(0.78 0.18 290)" }} />
          <span>{displayCredits.toLocaleString("zh-HK")}</span>
          <span style={{ color: textSec }}>积分</span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/billing?tab=subscription")}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption transition-all duration-150 active:scale-95"
          style={{
            background: "#C5ED47",
            color: "oklch(0.12 0.02 160)",
            boxShadow: "0 8px 22px oklch(0.72 0.18 130 / 0.16)",
            fontWeight: 650,
          }}
          title="进入订阅、充值与升级"
        >
          <Zap size={13} />
          <span>升级</span>
        </button>
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
        className="max-h-[calc(100vh-48px)] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-[var(--radius-lg-design)] border p-0"
        style={{
          background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
          borderColor: isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)",
          boxShadow: "0 24px 80px oklch(0 0 0 / 0.35)",
        }}
      >
        <div className="p-6">
          <AlertDialogHeader className="gap-2 text-left">
            <div
              className="mb-1 flex h-8 w-8 items-center justify-center"
              style={{
                color: "#C5ED47",
              }}
            >
              <KeyRound size={24} strokeWidth={1.8} />
            </div>
            <AlertDialogTitle
              className="type-title-sm"
              style={{ color: textPri, fontSize: 18, fontWeight: 650 }}
            >
              MCP 与 API Key
            </AlertDialogTitle>
            <AlertDialogDescription
              className="type-body-sm leading-6"
              style={{ color: textSec }}
            >
              生成真实 API Key 后，可把 OpenAI 兼容接口或 MCP 配置复制到其他 Agent 中调用 ArtX 图片生成能力。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div
            className="mt-5 rounded-[var(--radius-md-design)] p-3"
            style={{
              background: isDark ? "oklch(0.10 0.012 270)" : "oklch(0.97 0.003 270)",
              border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
            }}
          >
            <div className="mb-1 type-caption" style={{ color: textSec }}>API Key</div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 min-w-0 truncate"
                style={{
                  color: textPri,
                  fontSize: 12,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {apiKey || (apiKeys[0] ? `${apiKeys[0].prefix}••••••••••••••••` : "尚未生成")}
              </code>
              <button
                onClick={copyApiKey}
                disabled={!apiKey}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors disabled:opacity-45"
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

          <div
            className="mt-3 rounded-[var(--radius-md-design)] p-3"
            style={{
              background: isDark ? "oklch(0.10 0.012 270)" : "oklch(0.97 0.003 270)",
              border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
            }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="type-caption" style={{ color: textPri, fontWeight: 680 }}>OpenAI 兼容接口</div>
                <div className="mt-1 leading-5" style={{ color: textSec, fontSize: 12 }}>
                  版本 {OPENAI_COMPATIBLE_VERSION}。第三方 Agent 关闭 stream，图片模型推荐 {RECOMMENDED_IMAGE_MODEL}。
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(thirdPartyAgentConfigText, "Agent 配置")}
                className="h-8 shrink-0 inline-flex items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption"
                style={{
                  background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                  color: textPri,
                }}
              >
                <Copy size={13} />
                复制配置
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                ["Base URL", OPENAI_COMPATIBLE_BASE_URL],
                ["Model", RECOMMENDED_IMAGE_MODEL],
                ["Auth Header", authorizationHeader],
                ["Stream", "false"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-[var(--radius-md-design)] border p-2.5"
                  style={{
                    background: isDark ? "oklch(0.08 0.012 270)" : "white",
                    borderColor: isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)",
                  }}
                >
                  <div className="mb-1 type-caption" style={{ color: textSec }}>{label}</div>
                  <div className="flex items-center gap-2">
                    <code
                      className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap"
                      style={{
                        color: textPri,
                        fontSize: 11,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        scrollbarWidth: "thin",
                      }}
                    >
                      {value}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText(value, label)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md-design)]"
                      style={{
                        color: textPri,
                        background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText(modelsCurlText, "models curl")}
                className="h-8 inline-flex items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption"
                style={{
                  background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                  color: textPri,
                }}
              >
                <Copy size={13} />
                复制 /models
              </button>
              <button
                type="button"
                onClick={() => copyText(chatCompletionCurlText, "生图 curl")}
                className="h-8 inline-flex items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption"
                style={{
                  background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                  color: textPri,
                }}
              >
                <Copy size={13} />
                复制生图请求
              </button>
            </div>
          </div>

          <div
            className="mt-3 rounded-[var(--radius-md-design)] p-3"
            style={{
              background: isDark ? "oklch(0.10 0.012 270)" : "oklch(0.97 0.003 270)",
              border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="type-caption" style={{ color: textSec }}>MCP 配置代码</span>
              <button
                type="button"
                onClick={copyMcpConfig}
                className="h-8 inline-flex items-center gap-1.5 rounded-[var(--radius-md-design)] px-2.5 type-caption"
                style={{
                  background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
                  color: textPri,
                }}
              >
                <Copy size={13} />
                复制
              </button>
            </div>
            <pre
              className="max-h-[220px] overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-md-design)] p-3"
              style={{
                background: isDark ? "oklch(0.08 0.012 270)" : "white",
                color: textPri,
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              {mcpConfigText}
            </pre>
          </div>

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
              onClick={() => void generateApiKey()}
              disabled={apiKeyLoading}
              className="h-9 min-w-[104px] inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md-design)] type-caption"
              style={{
                background: isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 0.05)",
                border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0.88 0.006 255)"}`,
                color: textPri,
                opacity: apiKeyLoading ? 0.65 : 1,
              }}
            >
              <RefreshCw size={13} className={apiKeyLoading ? "animate-spin" : ""} />
              {apiKeyCreationConfirmed || apiKeys.length ? "重新生成" : "生成 Key"}
            </button>
            {apiKey && (
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
