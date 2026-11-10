/**
 * AppShell — Three-Column Layout (图叙 AI 风格)
 * Left icon rail | Middle nav panel | Right content
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "@/lib/api-base-url";
import { fileToDataUrl, submitUserFeedback } from "@/lib/feedback-submit";
import { toast } from "sonner";
import artxStudioMark from "@/assets/brand/artxstudio-mark.png";
import defaultWechatGroupQr from "@/assets/community/wechat-group-qr.jpg";
import { DEFAULT_IMAGE_MODEL_ID } from "@shared/image-models";
import { TOUR_ANCHORS, type TourAnchor } from "@shared/onboarding-steps";
import InviteDialog from "@/components/workspace/InviteDialog";
import CreateProjectDialog, { type CreateProjectPayload } from "@/components/workspace/CreateProjectDialog";
import { createWorkspaceHistoryProject, readWorkspaceProjectHistory, upsertWorkspaceProjectHistory } from "@/lib/project-history";
import {
  createWorkspaceFolder,
  listWorkspaceFolders,
  WORKSPACE_FOLDERS_UPDATED_EVENT,
  type WorkspaceFolderSummary,
} from "@/lib/project-folders";
import { WORKSPACE_PROJECTS_UPDATED_EVENT } from "@/lib/workspace-sync";
import {
  Home, Sparkles, Library, FolderOpen,
  CreditCard, HelpCircle, ImagePlus, Send, X, KeyRound, Copy, Loader2, QrCode, Gift, Compass,
  Store, Brain, Plus, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen,
  Users, LayoutGrid, Layers, FileText, Zap,
} from "lucide-react";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useBillingDialog } from "@/components/billing/BillingDialogProvider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


interface AppShellProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
}

interface HelpScreenshot {
  id: string;
  name: string;
  url: string;
  file: File;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** 左侧 icon 栏 hover 提示的延迟：0.2s（Radix 默认 300ms 偏慢，ericbi 2026-11-10 指定）。 */
const SIDEBAR_TOOLTIP_DELAY = 200;
const MAX_HELP_SCREENSHOTS = 4;
const MAX_HELP_SCREENSHOT_BYTES = 4 * 1024 * 1024;
/*
 * 品牌徽标是方形圆章（黑底白 A + ArtXStudio 字标），不是横版字标，
 * 所以尺寸必须给成正方形 —— 沿用旧的 h-[20px] w-[109px] 会把它拉成细条。
 */
const BRAND_LOGO_SIZE = "h-9 w-9";
/** 快捷键文案与修饰键：macOS 用 ⌘，其他平台用 Ctrl。 */
const IS_APPLE_PLATFORM =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const EXTERNAL_AGENT_BASE_URL = "https://admin.artxsd.com";
const OPENAI_COMPATIBLE_BASE_URL = `${EXTERNAL_AGENT_BASE_URL}/v1`;
// 对外 OpenAI 兼容接口文档里展示的推荐模型，必须跟随全站默认模型，
// 否则文档里抄给第三方 Agent 的 model 会是个已经不再推荐的旧值。
const RECOMMENDED_IMAGE_MODEL = DEFAULT_IMAGE_MODEL_ID;
const OPENAI_COMPATIBLE_VERSION = "506a8b9";

function getAppApiBaseUrl() {
  const configured = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    ""
  );
  if (configured) return configured;
  return defaultApiBaseUrlForCurrentHost(typeof window !== "undefined" ? window.location.origin : "");
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
  const search = useSearch();
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, user, openLoginModal } = useAuth();
  const { openBilling } = useBillingDialog();
  const onboarding = useOnboarding();
  const [helpOpen, setHelpOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  /** 侧边栏折叠：收起后只保留 icon，再次点击展开。 */
  const [navCollapsed, setNavCollapsed] = useState(false);
  /*
    ⚠️ 打开邀请弹窗的唯一入口。
    不要在别处直接调 setInviteOpen(true) —— 引导的触发挂在这里，
    绕过它会让「好友推荐」这一段静默不播放且零报错。
  */
  const openInviteDialog = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setInviteOpen(true);
    onboarding.start("invite", { onlyIfUnseen: true });
  };

  /** 新建画布弹窗：由左侧「新创作」按钮与 ⌘N / Ctrl+N 共同触发。 */
  const [createOpen, setCreateOpen] = useState(false);

  /*
   * 中间面板的「项目 / 最近」：真实数据。
   * ⚠️ 以前这里是写死的空状态占位（「打开的项目会显示在这里」），
   *    用户在工作台建了项目，侧栏却永远空着 —— 一眼就是假 UI。
   * ✅ 和工作台共用同一条事件总线，任一侧改动立刻互相同步。
   */
  const [panelFolders, setPanelFolders] = useState<WorkspaceFolderSummary[]>([]);
  const [recentBoards, setRecentBoards] = useState<ReturnType<typeof readWorkspaceProjectHistory>>([]);
  const activeFolderId = useMemo(() => new URLSearchParams(search).get("p"), [search]);
  const activeFolder = useMemo(
    () => (activeFolderId ? panelFolders.find(folder => folder.id === activeFolderId) ?? null : null),
    [panelFolders, activeFolderId]
  );

  const refreshPanel = useCallback(() => {
    setPanelFolders(listWorkspaceFolders());
    // 「最近」= 最近打开/修改过的画板，取前 5 条即可
    setRecentBoards(readWorkspaceProjectHistory().slice(0, 5));
  }, []);

  useEffect(() => {
    refreshPanel();
    window.addEventListener(WORKSPACE_PROJECTS_UPDATED_EVENT, refreshPanel);
    window.addEventListener(WORKSPACE_FOLDERS_UPDATED_EVENT, refreshPanel);
    return () => {
      window.removeEventListener(WORKSPACE_PROJECTS_UPDATED_EVENT, refreshPanel);
      window.removeEventListener(WORKSPACE_FOLDERS_UPDATED_EVENT, refreshPanel);
    };
  }, [refreshPanel]);

  // 路由变化 = 可能的「刚打开某块画板」，最近列表要重排
  useEffect(() => { refreshPanel(); }, [location, activeFolderId, refreshPanel]);

  /**
   * 侧栏底部的积分余额。
   *
   * ⚠️ 与 TopBar 各取一份，别试图让 TopBar 把余额「传下来」：
   *    TopBar 只在有顶栏的页面存在，而侧栏是全局的；反过来依赖会让
   *    首页、画布这些没有 TopBar 的页面拿不到余额，静默显示成 0。
   *    两个消费点各自 refresh 同一份服务端事实，才是唯一可靠的做法。
   * ⚠️ 服务端不返回 balance 时必须保持 null（显示「--」），
   *    不能兜底成 0 —— 用户会把「没取到」读成「积分花光了」。
   */
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const refreshCreditBalance = useCallback(async () => {
    if (!isAuthenticated) {
      setCreditBalance(null);
      return;
    }
    const token = getStoredAuthToken();
    if (!token) {
      setCreditBalance(null);
      return;
    }
    try {
      const response = await fetch(`${getAppApiBaseUrl()}/api/billing/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.balance !== "number") return;
      setCreditBalance(payload.balance);
    } catch {
      // 网络抖动时保留上一次的数值，不要闪成「--」
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshCreditBalance();
  }, [refreshCreditBalance, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const handleCreditsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === "number") setCreditBalance(detail.balance);
      void refreshCreditBalance();
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") void refreshCreditBalance();
    };
    const interval = window.setInterval(() => void refreshCreditBalance(), 15_000);
    window.addEventListener("focus", refreshCreditBalance);
    // 用完积分立刻回到侧栏可见，否则要等 15 秒轮询才变
    window.addEventListener("artx:credits-updated", handleCreditsUpdated);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCreditBalance);
      window.removeEventListener("artx:credits-updated", handleCreditsUpdated);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [isAuthenticated, refreshCreditBalance]);

  /**
   * 侧栏「升级」= 打开订阅浮层（不跳页）。
   * 未登录先弹登录：没身份看不到自己的套餐。
   */
  const openUpgrade = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    openBilling("subscription");
  }, [isAuthenticated, openLoginModal, openBilling]);

  /*
   * 「新创作」的唯一入口。
   * ⚠️ 不要改成 navigate("/") —— 那只是回首页，用户点了并不会真的拿到一块新画板。
   * 未登录先弹登录：没登录建出来的项目存不进云端，等于白建。
   */
  const openCreateProject = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setCreateOpen(true);
  }, [isAuthenticated, openLoginModal]);

  const handleCreateProject = useCallback((payload: CreateProjectPayload) => {
    /*
     * 当前正待在某个项目里（/workspace?p=xxx）时，新画板直接落在该项目下；
     * 否则进「未归类」，用户可以在工作台里再移动。
     * 不做这一步的话，用户在项目里按 ⌘N 建出来的画板会跑到项目外面，
     * 当场就是「新建了但看不见」。
     */
    const folder = activeFolder
      ? { id: activeFolder.id, name: activeFolder.name }
      : null;
    const project = createWorkspaceHistoryProject(payload.name, undefined, folder);
    // createWorkspaceHistoryProject 内部已 upsert 一次，这里补上封面后按 id 覆盖。
    upsertWorkspaceProjectHistory({ ...project, cover: payload.cover });
    setCreateOpen(false);
    refreshPanel();
    toast("画板已创建", { description: payload.name });
    navigate(`/project/${project.id}`);
  }, [navigate, activeFolder, refreshPanel]);

  /**
   * 侧栏「项目 +」= 新建项目并直接进去。
   * ⚠️ 必须登录：项目本身只存本机，但项目里的画板会走云同步，
   *    未登录建的画板云端没有身份可挂，用户换设备就「全没了」。
   */
  const handleCreateFolder = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const folder = createWorkspaceFolder();
    refreshPanel();
    navigate(`/workspace?p=${folder.id}`);
  }, [isAuthenticated, openLoginModal, navigate, refreshPanel]);

  /*
   * ⌘N（macOS）/ Ctrl+N（Windows、Linux）新建画布。
   * ⚠️ 输入框、文本域、可编辑区里不拦截：N 是普通字符，别把用户打的字吃掉。
   * ⚠️ Chrome / Safari 把 ⌘N、Ctrl+N 当成「新建窗口」的浏览器级快捷键，页面常常收不到 ——
   *    所以额外接受一个不被浏览器占用的 Alt+N 作为等同入口。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey) return;
      const accelerator = IS_APPLE_PLATFORM ? event.metaKey : event.ctrlKey;
      if (!accelerator && !event.altKey) return;
      if (event.key.toLowerCase() !== "n") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      // 拦掉浏览器默认的「新建窗口 / 新建标签页」。
      event.preventDefault();
      openCreateProject();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openCreateProject]);

  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [helpPrompt, setHelpPrompt] = useState("");
  const [helpScreenshots, setHelpScreenshots] = useState<HelpScreenshot[]>([]);
  const [helpSubmitting, setHelpSubmitting] = useState(false);
  const helpFileInputRef = useRef<HTMLInputElement>(null);
  const isDark = resolvedTheme === "dark";
  const shouldHideSidebar = hideSidebar;

  // ── Theme tokens (图叙 AI 规格) ──────────────────────────────────────────────
  const mainBg       = isDark ? "#111111" : "#ffffff";
  const sidebarBg    = isDark ? "#0d0d0d" : "#fafafa";
  const sidebarBorder= isDark ? "transparent" : "#e6e3df";
  const textPrimary  = isDark ? "#f1f1f3" : "#262627";
  const textSecondary= isDark ? "#99999e" : "#777472";
  const hoverBg      = isDark ? "#2a2a2a" : "#f5f6f8";
  const activeBg     = isDark ? "#333333" : "#ecedf0";
  const brandGreenIcon = isDark ? "#C5ED47" : "#5C7A1A"; // 品牌绿色图标（白天模式加深）
  const activeColor  = isDark ? "#f4f4f5" : "#262627";
  const wechatGroupQrUrl = import.meta.env.VITE_WECHAT_GROUP_QR_URL || "/api/community/wechat-group-qr/image";
  const [communityQrSrc, setCommunityQrSrc] = useState(wechatGroupQrUrl);
  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);
  const helpActive = isActive("/help");

  const activateHelpPrompt = () => {
    setHelpOpen(true);
  };

  const handleHelpClick = () => {
    if (helpActive) {
      toast("您当前已在帮助与反馈页面中，请提交你的建议吧。");
      return;
    }
    activateHelpPrompt();
  };

  const closeHelpPrompt = () => {
    helpScreenshots.forEach(image => URL.revokeObjectURL(image.url));
    setHelpOpen(false);
    setHelpPrompt("");
    setHelpScreenshots([]);
    if (helpFileInputRef.current) helpFileInputRef.current.value = "";
  };

  const openCommunityDialog = () => {
    setCommunityQrSrc(wechatGroupQrUrl);
    setCommunityOpen(true);
  };

  const closeCommunityDialog = () => {
    setCommunityOpen(false);
  };

  const submitHelpPrompt = async () => {
    if (!helpPrompt.trim() && helpScreenshots.length === 0) {
      toast.error("请先输入问题或上传截图");
      return;
    }
    const token = getStoredAuthToken();
    if (!token) {
      toast.error("请先登录后再提交反馈");
      openLoginModal();
      return;
    }

    setHelpSubmitting(true);
    try {
      const attachments = await Promise.all(helpScreenshots.map(async image => ({
        name: image.name,
        src: await fileToDataUrl(image.file),
      })));
      await submitUserFeedback({
        token,
        content: helpPrompt,
        module: "帮助弹窗",
        attachments,
      });
      toast.success("反馈已提交", { description: "后台已收到你的反馈和截图。" });
      closeHelpPrompt();
    } catch (error) {
      toast.error("反馈提交失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setHelpSubmitting(false);
    }
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
    const oversized = files.find(file => file.size > MAX_HELP_SCREENSHOT_BYTES);
    if (oversized) {
      toast.error("图片过大", { description: "单张反馈图片不能超过 4MB。" });
      event.target.value = "";
      return;
    }

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
      file,
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

  const communityDialog = communityOpen ? (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.20)" }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) closeCommunityDialog();
      }}
    >
      <div
        data-artx-dialog-surface
        className="w-[min(380px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-5 text-center shadow-2xl"
        style={{
          background: isDark ? "rgba(22,22,30,0.98)" : "rgba(255,255,255,0.98)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
          backdropFilter: "blur(18px)",
        }}
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-dialog-title"
      >
        <div className="mb-4 flex items-center justify-between gap-3 text-left">
          <div>
            <p id="community-dialog-title" className="text-[18px] font-semibold" style={{ color: textPrimary }}>
              加入社群
            </p>
            <p className="mt-1 text-[13px]" style={{ color: textSecondary }}>
              用户可扫码加入微信群
            </p>
          </div>
          <button
            type="button"
            onClick={closeCommunityDialog}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-80"
            style={{
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
              color: textPrimary,
            }}
            aria-label="关闭加入社群弹窗"
          >
            <X size={15} />
          </button>
        </div>

        <div
          className="mx-auto flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-[var(--radius-lg-design)] border p-3"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
            background: "white",
          }}
        >
          {wechatGroupQrUrl ? (
            <img
              src={communityQrSrc}
              alt="微信群二维码"
              className="h-full w-full object-contain"
              onError={() => {
                if (communityQrSrc !== defaultWechatGroupQr) {
                  setCommunityQrSrc(defaultWechatGroupQr);
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-md-design)] border border-dashed border-black/18 text-[#222222]">
              <QrCode size={56} strokeWidth={1.5} />
              <span className="text-xs font-medium">请配置微信群二维码</span>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const helpDialog = helpOpen ? (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.20)" }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) closeHelpPrompt();
      }}
    >
      <div
        data-artx-dialog-surface
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
            disabled={helpSubmitting}
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
            disabled={helpSubmitting}
            className="h-9 min-w-[96px] inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
            style={{
              background: "#161616",
              color: "white",
              boxShadow: "0 6px 24px rgba(48,37,25,0.12)",
            }}
          >
            <Send size={13} />
            {helpSubmitting ? "提交中" : "提交"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const apiBaseUrl = getAppApiBaseUrl();
  const apiKeyForSnippet = apiKeyValue || "YOUR_ARTX_API_KEY";
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
  const mcpConfigText = JSON.stringify({
    mcpServers: {
      "artx-image": {
        url: `${EXTERNAL_AGENT_BASE_URL}/api/mcp`,
        headers: {
          Authorization: `Bearer ${apiKeyForSnippet}`,
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
        data-artx-dialog-surface
        className="max-h-[calc(100vh-48px)] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-[var(--radius-xl-design)] p-5 shadow-2xl"
        style={{
          background: isDark ? "#222222" : "rgba(255,255,255,0.98)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex h-8 w-8 items-center justify-center" style={{ color: brandGreenIcon }}>
              <KeyRound size={24} strokeWidth={1.8} />
            </div>
            <h2 style={{ color: textPrimary, fontSize: 24, fontWeight: 720 }}>API key</h2>
            <p className="mt-2 max-w-[560px] leading-6" style={{ color: textSecondary, fontSize: 13 }}>
              生成后可用于第三方 Agent 通过 OpenAI 兼容接口或 MCP 调用 ArtX 图片生成能力。
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
          </div>
          <div className="min-w-0 rounded-[var(--radius-lg-design)] border p-4" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)" }}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="type-caption" style={{ color: textPrimary, fontWeight: 680 }}>OpenAI 兼容接口</div>
                <div className="mt-1 leading-5" style={{ color: textSecondary, fontSize: 12 }}>
                  版本 {OPENAI_COMPATIBLE_VERSION}。第三方 Agent 关闭 stream，图片模型推荐 {RECOMMENDED_IMAGE_MODEL}。
                </div>
              </div>
              <button type="button" onClick={() => copyText(thirdPartyAgentConfigText, "Agent 配置")} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-3 type-caption" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: textPrimary }}>
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
                <div key={label} className="min-w-0 rounded-[var(--radius-md-design)] border p-2.5" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(0,0,0,0.18)" : "white" }}>
                  <div className="mb-1 type-caption" style={{ color: textSecondary }}>{label}</div>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap" style={{ color: textPrimary, fontSize: 11, scrollbarWidth: "thin" }}>{value}</code>
                    <button type="button" onClick={() => copyText(value, label)} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md-design)]" style={{ color: textPrimary, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}>
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => copyText(modelsCurlText, "models curl")} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-3 type-caption" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: textPrimary }}>
                <Copy size={13} />
                复制 /models
              </button>
              <button type="button" onClick={() => copyText(chatCompletionCurlText, "生图 curl")} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md-design)] px-3 type-caption" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: textPrimary }}>
                <Copy size={13} />
                复制生图请求
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(0,0,0,0.18)" : "white" }}>
            <div className="mb-1 type-caption" style={{ color: textSecondary }}>站内 API Base URL（用于生成 Key）</div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap" style={{ color: textPrimary, fontSize: 12, scrollbarWidth: "thin" }}>{apiBaseUrl}</code>
                <button type="button" onClick={() => copyText(apiBaseUrl, "站内 API Base URL")} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]" style={{ color: textPrimary, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}>
                  <Copy size={13} />
                </button>
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-lg-design)] border p-4" style={{ borderColor: sidebarBorder, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)" }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="type-caption" style={{ color: textPrimary, fontWeight: 680 }}>MCP 配置代码</div>
                <div className="mt-1 leading-5" style={{ color: textSecondary, fontSize: 12 }}>使用同一把 API Key，让支持 MCP 的 Agent 直接调用 ArtX 生图工具。</div>
              </div>
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

  // ── Icon rail button (left column) ─────────────────────────────
  const IconRailBtn = ({
    icon: Icon, label, path, onClick, active: forceActive, tourId,
  }: {
    icon: React.ElementType;
    label: string;
    path?: string;
    onClick?: () => void;
    active?: boolean;
    tourId?: TourAnchor;
  }) => {
    const active = forceActive !== undefined ? forceActive : (path ? isActive(path) : false);
    const handleClick = () => {
      if (onClick) { onClick(); return; }
      if (path) {
        if (!isAuthenticated && path === "/workspace") { openLoginModal(); return; }
        navigate(path);
      }
    };
    return (
      <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            data-tour-id={tourId}
            /*
             * ⚠️ 这里刻意**不写 title**：原生 title 的延迟由系统决定（约 1s）且不可调，
             * 会和下面的 Radix tooltip 叠成两个气泡。可访问性靠 aria-label 兜。
             */
            aria-label={label}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-all"
            style={{
              background: active ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,22,0.10)") : "transparent",
              color: active ? (isDark ? "#ffffff" : "#161616") : (isDark ? "#999999" : "#888888"),
            }}
            onMouseEnter={e => {
              if (!active) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.07)" : "rgba(22,22,22,0.06)";
            }}
            onMouseLeave={e => {
              if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <Icon size={17} strokeWidth={active ? 1.9 : 1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>
    );
  };

  // ── Middle panel nav item ────────────────────────────────────
  const PanelNavItem = ({
    icon: Icon, label, path, onClick, tourId,
  }: {
    icon: React.ElementType;
    label: string;
    path?: string;
    onClick?: () => void;
    tourId?: TourAnchor;
  }) => {
    const active = path ? isActive(path) : false;
    const handleClick = () => {
      if (onClick) { onClick(); return; }
      if (path) {
        if (!isAuthenticated && path === "/workspace") { openLoginModal(); return; }
        navigate(path);
      }
    };
    return (
      <button
        type="button"
        onClick={handleClick}
        data-tour-id={tourId}
        className="w-full flex h-[32px] items-center gap-2 rounded-lg px-2.5 text-left transition-all"
        style={{
          background: active ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(22,22,22,0.08)") : "transparent",
          color: active ? (isDark ? "#f1f1f3" : "#161616") : (isDark ? "#888888" : "#777777"),
        }}
        onMouseEnter={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.05)";
        }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <Icon size={15} strokeWidth={active ? 1.9 : 1.5} style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }} />
        <span style={{ fontSize: 12.5, fontWeight: active ? 560 : 440, letterSpacing: "-0.01em" }} className="truncate">
          {label}
        </span>
      </button>
    );
  };

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
              src={artxStudioMark}
              alt="ArtXStudio"
              className={`block ${BRAND_LOGO_SIZE} object-contain`}
            />
          </button>
        )}
        {children}
        {helpDialog}
        {apiKeyDialog}
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: mainBg }}>

      {/* ── Column 1: Icon Rail (52px) ── */}
      <div
        className="flex flex-shrink-0 flex-col items-center py-3 gap-1"
        style={{
          width: 52,
          background: isDark ? "#0d0d0d" : "#f5f5f5",
          borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.08)"}`,
        }}
      >
        {/* Logo */}
        <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mb-2 flex h-8 w-8 items-center justify-center"
              aria-label="ArtXStudio 首页"
            >
              <img src={artxStudioMark} alt="ArtXStudio" className="h-7 w-7 object-contain" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>返回首页</TooltipContent>
        </Tooltip>

        {/* Primary nav icons */}
        <IconRailBtn icon={Home}       label="首页"      path="/"                  tourId={TOUR_ANCHORS.navHome} />
        <IconRailBtn icon={Sparkles}   label="灵感模板"  path="/inspiration"        tourId={TOUR_ANCHORS.navInspiration} />
        <IconRailBtn icon={Users}      label="画布社区"   path="/community"          />
        <IconRailBtn icon={FolderOpen} label="工作台"    path="/workspace"           tourId={TOUR_ANCHORS.navWorkspace} />
        <IconRailBtn icon={Store}      label="电商画布"  path="/ecommerce-canvas"    />
        <IconRailBtn icon={Library}    label="技能商店"  path="/skills"              tourId={TOUR_ANCHORS.navSkills} />
        <IconRailBtn icon={Brain}      label="长期记忆"  path="/memory"              />
        <IconRailBtn icon={CreditCard} label="充值与订阅" path="/billing"            tourId={TOUR_ANCHORS.navBilling} />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom utility icons */}
        <IconRailBtn icon={Gift}       label="邀请好友"   onClick={openInviteDialog}  tourId={TOUR_ANCHORS.navInvite} />
        <IconRailBtn icon={QrCode}     label="加入社群"   onClick={openCommunityDialog} />
        <IconRailBtn icon={HelpCircle} label="帮助与反馈" onClick={handleHelpClick}    active={helpActive} />
        <IconRailBtn icon={KeyRound}   label="API key"   onClick={openApiKeyDialog}   />
        <IconRailBtn
          icon={Compass}
          label="新手引导"
          onClick={() => {
            onboarding.resetAll();
            toast.success("新手引导已重置，进入对应页面即可重新观看");
          }}
        />

        {/* Panel toggle */}
        <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setNavCollapsed(v => !v)}
              aria-label={navCollapsed ? "展开导航面板" : "收起导航面板"}
              className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg transition-all"
              style={{ color: isDark ? "#666" : "#aaa" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "#ccc" : "#555")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "#666" : "#aaa")}
            >
              {navCollapsed
                ? <PanelLeftOpen size={16} strokeWidth={1.5} />
                : <PanelLeftClose size={16} strokeWidth={1.5} />
              }
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {navCollapsed ? "展开导航面板" : "收起导航面板"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Column 2: Middle Nav Panel (220px, collapsible) ── */}
      <div
        className="flex flex-shrink-0 flex-col overflow-hidden"
        style={{
          width: navCollapsed ? 0 : 220,
          opacity: navCollapsed ? 0 : 1,
          pointerEvents: navCollapsed ? "none" : "auto",
          background: isDark ? "#111111" : "#fafafa",
          borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.08)"}`,
          transition: "width 0.22s cubic-bezier(0.23,1,0.32,1), opacity 0.18s ease",
          overflow: "hidden",
        }}
      >
        <div className="flex flex-col h-full overflow-y-auto px-2.5 py-4" style={{ scrollbarWidth: "none" }}>
          {/* New creation button —— 直接新建画板，不再跳首页 */}
          <button
            type="button"
            onClick={openCreateProject}
            title={`新创作（${IS_APPLE_PLATFORM ? "⌘N" : "Ctrl+N"}）`}
            className="mb-4 flex h-9 w-full items-center justify-between gap-2 rounded-full px-4 transition-all"
            style={{
              background: "#161616",
              color: "#ffffff",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#333333")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#161616")}
          >
            <div className="flex items-center gap-2">
              <Plus size={14} strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 520, letterSpacing: "-0.01em" }}>新创作</span>
            </div>
            <kbd
              className="flex items-center gap-0.5 rounded px-1 py-0.5"
              style={{
                fontSize: 10,
                background: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "inherit",
              }}
            >
              {IS_APPLE_PLATFORM ? "⌘N" : "Ctrl N"}
            </kbd>
          </button>

          {/* Main nav items */}
          <div className="flex flex-col gap-0.5 mb-4">
            <PanelNavItem icon={Sparkles}   label="灵感模板"  path="/inspiration"   tourId={TOUR_ANCHORS.navInspiration} />
            <PanelNavItem icon={Users}      label="画布社区"  path="/community"     />
          </div>

          {/* Divider */}
          <div
            className="mb-3 mt-1"
            style={{ height: 1, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(22,22,22,0.08)" }}
          />

          {/* Projects section */}
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#555" : "#aaa", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              项目
            </span>
            <div className="flex items-center gap-0.5">
              <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    aria-label="新建项目"
                    className="flex h-5 w-5 items-center justify-center rounded transition-all"
                    style={{ color: isDark ? "#666" : "#bbb" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "#ccc" : "#555")}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "#666" : "#bbb")}
                  >
                    <Plus size={13} strokeWidth={1.8} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>新建项目</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => navigate("/workspace")}
                    aria-label="前往工作台"
                    className="flex h-5 w-5 items-center justify-center rounded transition-all"
                    style={{ color: isDark ? "#666" : "#bbb" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "#ccc" : "#555")}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = isDark ? "#666" : "#bbb")}
                  >
                    <LayoutGrid size={13} strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>前往工作台</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Project list —— 真实项目，点进去即进入该项目的画板列表 */}
          {panelFolders.length > 0 && (
            <div className="mb-2 flex flex-col gap-0.5">
              {panelFolders.slice(0, 6).map(folder => {
                const active = folder.id === activeFolderId;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => navigate(`/workspace?p=${folder.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 text-left transition-all"
                    style={{
                      height: 30,
                      background: active ? (isDark ? "rgba(255,255,255,0.10)" : "rgba(22,22,22,0.08)") : "transparent",
                      color: active ? (isDark ? "#f1f1f3" : "#161616") : (isDark ? "#888888" : "#777777"),
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.05)";
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <FolderOpen size={14} strokeWidth={active ? 1.9 : 1.5} style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }} />
                    <span className="truncate" style={{ fontSize: 12.5, fontWeight: active ? 560 : 440, letterSpacing: "-0.01em" }}>
                      {folder.name}
                    </span>
                    <span className="ml-auto flex-shrink-0" style={{ fontSize: 10.5, color: isDark ? "#555" : "#aaa" }}>
                      {folder.boardCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Recent boards label */}
          <button
            type="button"
            className="mb-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left"
            style={{ color: isDark ? "#666" : "#aaa" }}
            onClick={() => navigate("/workspace")}
          >
            <ChevronDown size={12} strokeWidth={1.8} />
            <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: "-0.01em" }}>最近</span>
          </button>

          {recentBoards.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {recentBoards.map(board => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => navigate(`/project/${board.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 text-left transition-all"
                  style={{ height: 28, color: isDark ? "#888888" : "#777777" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.05)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <FileText size={13} strokeWidth={1.5} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span className="truncate" style={{ fontSize: 12, letterSpacing: "-0.01em" }}>{board.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-start gap-1.5 px-2 pt-6">
              <Layers size={22} strokeWidth={1.2} style={{ color: isDark ? "#333" : "#ddd" }} />
              <span
                style={{
                  fontSize: 11.5,
                  color: isDark ? "#444" : "#ccc",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                打开的画板会显示在这里
              </span>
            </div>
          )}

          {/*
            底部只留「个人中心 + 积分」两块。

            ⚠️ 电商画布 / 技能商店 / 长期记忆 / 充值与订阅 这四项已从这里移除，
               但入口没有消失 —— 它们仍在最左侧 icon 栏上一一对应，
               这里再放一份是重复出口（点哪都行反而让人以为有两套功能）。
          */}
          <div
            className="mt-auto pt-2 flex flex-col gap-2"
            style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(22,22,22,0.08)"}` }}
          >
            {/* 个人中心 */}
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) {
                  openLoginModal();
                  return;
                }
                navigate("/profile");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-all"
              style={{ color: isDark ? "#c8c8cc" : "#3a3a3c" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(22,22,22,0.05)")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              {/*
                头像优先用「首字母圆章」，不引外链图片：
                未登录 / 头像挂掉时引图会露出破图，而首字母永远是完整的。
              */}
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,22,0.08)",
                  color: isDark ? "#f1f1f3" : "#161616",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {(user?.username || "U").trim().slice(0, 1).toUpperCase() || "U"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 520, letterSpacing: "-0.01em" }}>
                  {user?.username || "未登录"}
                </span>
                <span className="block truncate" style={{ fontSize: 10.5, color: isDark ? "#5c5c60" : "#a0a0a4" }}>
                  个人中心
                </span>
              </span>
              <ChevronRight size={13} strokeWidth={1.6} style={{ flexShrink: 0, opacity: 0.55 }} />
            </button>

            {/* 积分 + 升级 */}
            <div
              className="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
              style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(22,22,22,0.035)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1" style={{ color: isDark ? "#5c5c60" : "#a0a0a4" }}>
                  <Zap size={10} strokeWidth={2} />
                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.02em" }}>积分</span>
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em", color: isDark ? "#f1f1f3" : "#161616", lineHeight: "18px" }}
                  title={creditBalance === null ? "正在读取积分余额" : `当前积分 ${creditBalance}`}
                >
                  {creditBalance === null ? "--" : creditBalance.toLocaleString("zh-CN")}
                </div>
              </div>
              <button
                type="button"
                onClick={openUpgrade}
                className="flex-shrink-0 rounded-full px-2.5 py-1 transition-all"
                style={{ background: "#161616", color: "#ffffff", fontSize: 11, fontWeight: 560, letterSpacing: "0.01em" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#333333")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "#161616")}
              >
                升级
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Column 3: Page Content ── */}
      <main className="min-w-0 flex-1 overflow-hidden" style={{ background: isDark ? "#0a0a0b" : "#ffffff" }}>
        {children}
      </main>

      {communityDialog}
      {helpDialog}
      {apiKeyDialog}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateProject}
        title="新建画布"
      />
    </div>
  );
}
