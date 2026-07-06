/**
 * AppShell — Global Layout with Left Sidebar
 * Design: Neo-Studio — wide sidebar with nav groups
 * Sections: 首页 / 灵感选题 / 技能商店 / 工作台
 */
import { useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import {
  Home, Sparkles, Library, FolderOpen,
  CreditCard, HelpCircle, ImagePlus, Send, X, KeyRound, Copy, Loader2,
} from "lucide-react";


interface AppShellProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
}

interface HelpScreenshot {
  id: string;
  name: string;
  url: string;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

const MAX_HELP_SCREENSHOTS = 4;
const BRAND_LOGO_SIZE = "h-[20px] w-[109px]";

function getAppApiBaseUrl() {
  const configured = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://backstage.artxsd.com";
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

function getStoredAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

export default function AppShell({ children, hideSidebar = false }: AppShellProps) {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [helpPrompt, setHelpPrompt] = useState("");
  const [helpScreenshots, setHelpScreenshots] = useState<HelpScreenshot[]>([]);
  const helpFileInputRef = useRef<HTMLInputElement>(null);
  const isDark = resolvedTheme === "dark";
  const shouldHideSidebar = hideSidebar;

  // ── Theme tokens ──────────────────────────────────────────────
  const sidebarBg    = isDark ? "#222222" : "var(--design-surface-soft)";
  const sidebarBorder= isDark ? "oklch(1 0 0 / 7%)" : "var(--hairline)";
  const textPrimary  = isDark ? "rgba(255,255,255,0.82)" : "rgba(20,20,36,0.82)";
  const textSecondary= isDark ? "rgba(255,255,255,0.57)" : "rgba(20,20,36,0.38)";
  const hoverBg      = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const activeBg     = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeColor  = isDark ? "rgba(255,255,255,0.90)" : "rgba(20,20,36,0.90)";
  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const activateHelpPrompt = () => {
    setHelpOpen(true);
  };

  const closeHelpPrompt = () => {
    helpScreenshots.forEach(image => URL.revokeObjectURL(image.url));
    setHelpOpen(false);
    setHelpPrompt("");
    setHelpScreenshots([]);
    if (helpFileInputRef.current) helpFileInputRef.current.value = "";
  };

  const submitHelpPrompt = () => {
    if (!helpPrompt.trim() && helpScreenshots.length === 0) {
      toast.error("请先输入问题或上传截图");
      return;
    }
    toast("问题已提交", {
      description: helpScreenshots.length > 0
        ? `已附带 ${helpScreenshots.length} 张截图`
        : helpPrompt.trim().slice(0, 80),
    });
    closeHelpPrompt();
  };

  const developerFetch = async <T,>(path: string, options: RequestInit = {}) => {
    const token = getStoredAuthToken();
    const response = await fetch(`${getAppApiBaseUrl()}${path}`, {
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

  const openApiKeyDialog = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setApiKeyOpen(true);
    setApiKeyLoading(true);
    developerFetch<{ keys?: ApiKeyRecord[] }>("/api/developer/api-keys")
      .then(result => setApiKeys(result.keys || []))
      .catch(error => toast("API key 暂时不可用", { description: error instanceof Error ? error.message : "请稍后重试" }))
      .finally(() => setApiKeyLoading(false));
  };

  const createApiKey = async () => {
    setApiKeyLoading(true);
    try {
      const result = await developerFetch<{ key?: ApiKeyRecord & { value?: string } }>("/api/developer/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "ArtX MCP Key" }),
      });
      if (!result.key?.value) throw new Error("API key 生成失败");
      setApiKeyValue(result.key.value);
      setApiKeys(current => [result.key as ApiKeyRecord, ...current.filter(item => item.id !== result.key?.id)]);
      toast("API key 已生成", { description: "完整 key 只在当前弹窗展示一次" });
    } catch (error) {
      toast("API key 生成失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setApiKeyLoading(false);
    }
  };

  const copyText = async (text: string, label = "内容") => {
    await navigator.clipboard?.writeText(text);
    toast(`已复制${label}`);
  };

  const handleHelpScreenshotUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/"));
    if (files.length === 0) return;

    const available = MAX_HELP_SCREENSHOTS - helpScreenshots.length;
    if (available <= 0) {
      toast.error("最多只能上传 4 张截图");
      event.target.value = "";
      return;
    }

    if (files.length > available) {
      toast("已达到上传上限", { description: `本次只添加前 ${available} 张截图` });
    }

    const nextImages = files.slice(0, available).map(file => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID?.() || Date.now()}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    setHelpScreenshots(current => [...current, ...nextImages]);
    event.target.value = "";
  };

  const removeHelpScreenshot = (id: string) => {
    setHelpScreenshots(current => {
      const target = current.find(image => image.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter(image => image.id !== id);
    });
  };

  const helpDialog = helpOpen ? (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.20)" }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) closeHelpPrompt();
      }}
    >
      <div
        className="w-[min(560px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-4 shadow-2xl"
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
          placeholder="请描述你碰到的问题，也可以上传截图。"
          className="w-full resize-none rounded-[var(--radius-lg-design)] border bg-transparent p-3 outline-none leading-6"
          rows={5}
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
            color: textPrimary,
            fontSize: 15,
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {helpScreenshots.map(image => (
            <div
              key={image.id}
              className="group relative h-16 w-16 overflow-hidden rounded-[var(--radius-md-design)] border"
              style={{ borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)" }}
            >
              <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeHelpScreenshot(image.id)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm-design)] bg-[#222222]/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="移除截图"
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {helpScreenshots.length < MAX_HELP_SCREENSHOTS && (
            <button
              type="button"
              onClick={() => helpFileInputRef.current?.click()}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-md-design)] border border-dashed transition-opacity hover:opacity-80"
              style={{
                borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)",
                color: textSecondary,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)",
              }}
            >
              <ImagePlus size={17} />
              <span style={{ fontSize: 10 }}>{helpScreenshots.length}/{MAX_HELP_SCREENSHOTS}</span>
            </button>
          )}
          <input ref={helpFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleHelpScreenshotUpload} />
        </div>

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
              background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
              color: "white",
              boxShadow: "0 8px 22px oklch(0.58 0.22 290 / 0.24)",
            }}
          >
            <Send size={13} />
            提交
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const apiBaseUrl = getAppApiBaseUrl();
  const mcpConfigText = JSON.stringify({
    mcpServers: {
      "artx-image": {
        url: `${apiBaseUrl}/api/mcp`,
        headers: {
          Authorization: `Bearer ${apiKeyValue || "YOUR_ARTX_API_KEY"}`,
        },
      },
    },
  }, null, 2);

  const apiKeyDialog = apiKeyOpen ? (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.42)", backdropFilter: "blur(14px)" }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) setApiKeyOpen(false);
      }}
    >
      <div
        className="max-h-[calc(100vh-48px)] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-[var(--radius-xl-design)] p-5 shadow-2xl"
        style={{
          background: isDark ? "#222222" : "rgba(255,255,255,0.98)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex h-8 w-8 items-center justify-center" style={{ color: "#C5ED47" }}>
              <KeyRound size={24} strokeWidth={1.8} />
            </div>
            <h2 style={{ color: textPrimary, fontSize: 24, fontWeight: 720 }}>API key</h2>
            <p className="mt-2 max-w-[560px] leading-6" style={{ color: textSecondary, fontSize: 13 }}>
              生成后可用于第三方 AI Agent 通过 ArtX MCP 工具调用图片生成能力。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setApiKeyOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]"
            style={{ color: textSecondary, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0 rounded-[var(--radius-lg-design)] border p-4" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)" }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="type-caption" style={{ color: textPrimary, fontWeight: 680 }}>生成站点 API key</span>
              <button
                type="button"
                onClick={createApiKey}
                disabled={apiKeyLoading}
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-3 type-caption"
                style={{ background: "#C5ED47", color: "#10130A", fontWeight: 720, opacity: apiKeyLoading ? 0.65 : 1 }}
              >
                {apiKeyLoading ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                生成
              </button>
            </div>
            <div className="rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(0,0,0,0.18)" : "white" }}>
              <div className="mb-1 type-caption" style={{ color: textSecondary }}>API key</div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap" style={{ color: textPrimary, fontSize: 12, scrollbarWidth: "thin" }}>
                  {apiKeyValue || (apiKeys[0] ? `${apiKeys[0].prefix}••••••••••••••••` : "尚未生成")}
                </code>
                <button
                  type="button"
                  disabled={!apiKeyValue}
                  onClick={() => apiKeyValue && copyText(apiKeyValue, "API key")}
                  className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]"
                  style={{ color: apiKeyValue ? textPrimary : textSecondary, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(0,0,0,0.18)" : "white" }}>
              <div className="mb-1 type-caption" style={{ color: textSecondary }}>Base URL</div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap" style={{ color: textPrimary, fontSize: 12, scrollbarWidth: "thin" }}>{apiBaseUrl}</code>
                <button type="button" onClick={() => copyText(apiBaseUrl, "Base URL")} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]" style={{ color: textPrimary, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}>
                  <Copy size={13} />
                </button>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-lg-design)] border p-4" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)" }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="type-caption" style={{ color: textPrimary, fontWeight: 680 }}>MCP 配置代码</span>
              <button type="button" onClick={() => copyText(mcpConfigText, "MCP 配置")} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-3 type-caption" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: textPrimary }}>
                <Copy size={13} />
                复制
              </button>
            </div>
            <pre className="max-h-[260px] max-w-full overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-md-design)] p-3" style={{ background: isDark ? "rgba(0,0,0,0.28)" : "white", color: textPrimary, fontSize: 11, lineHeight: 1.65, scrollbarWidth: "thin" }}>
              {mcpConfigText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  ) : null;

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
            <img
              src={artxStudioLogo}
              alt="ArtXStudio"
              className={`block ${BRAND_LOGO_SIZE} object-contain object-left`}
            />
          </button>
        )}
        {children}
        {helpDialog}
        {apiKeyDialog}
      </>
    );
  }

  // ── Shared nav item renderer ──────────────────────────────────
  const NavItem = ({
    icon: Icon, label, path, iconSize = 16,
  }: { icon: React.ElementType; label: string; path: string; iconSize?: number }) => {
    const active = isActive(path);
    const handleClick = () => {
      if (!isAuthenticated && path === "/workspace") {
        openLoginModal();
        return;
      }
      navigate(path);
    };

    return (
      <button
        onClick={handleClick}
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
    <div className="flex h-screen overflow-hidden" style={{ background: "#222222" }}>
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
            className={`${BRAND_LOGO_SIZE} cursor-pointer transition-opacity hover:opacity-85`}
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
            <NavItem icon={CreditCard} label="充值与订阅" path="/billing" iconSize={15} />
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
          <button
            onClick={openApiKeyDialog}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md-design)] type-caption transition-all text-left"
            style={{ background: "transparent", color: textSecondary }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = hoverBg)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <KeyRound size={15} strokeWidth={1.6} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span className="truncate">API key</span>
          </button>
        </div>
      </aside>

      {/* ── Page Content ── */}
      <main className="flex-1 overflow-hidden" style={{ background: "#222222" }}>
        {children}
      </main>
      {helpDialog}
      {apiKeyDialog}
    </div>
  );
}
