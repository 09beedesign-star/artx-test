import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  Eye,
  ImagePlus,
  Send,
  X,
} from "lucide-react";
import { InspirationReactionButton } from "@/components/inspiration/InspirationReactionButton";
import { useInspirationReactions } from "@/hooks/useInspirationReactions";
import { normalizeInspirationIdentity } from "@/lib/inspiration-identity";
import {
  getInspirationFavoriteBaseCount,
  getInspirationLikeBaseCount,
  getInspirationViewBaseCount,
} from "@/lib/inspiration-metrics";
import {
  fetchInspirationFeed,
  getInspirationFallbackFeed,
  type InspirationFeedItem,
} from "@/lib/inspiration-feed";
import { getDisplayLikeCount } from "@/lib/inspiration-reactions";
import { useAuth, rememberInviteCodeFromUrl } from "@/contexts/AuthContext";
import { useBillingDialog } from "@/components/billing/BillingDialogProvider";
import { TOUR_ANCHORS } from "@shared/onboarding-steps";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import HomeFirstTopUpBanner, {
  dismissFirstTopUpBannerForToday,
  isFirstTopUpBannerDismissedToday,
} from "@/components/home/HomeFirstTopUpBanner";
import AnnouncementModal from "@/components/announcement/AnnouncementModal";
import { HOME_ANNOUNCEMENT } from "@/components/announcement/announcement-content";
import {
  hasSeenAnnouncement,
  markAnnouncementSeen,
  hasAnnouncementForcePending,
  clearAnnouncementForcePending,
  ANNOUNCEMENT_REPLAY_EVENT,
} from "@/components/announcement/announcement-seen-store";
import { setAnnouncementBlocking } from "@/components/announcement/announcement-gate";
import { createWorkspaceHistoryProject } from "@/lib/project-history";
import { requestAiAuth } from "@/lib/ai";
import {
  ModelSelector,
  useImageModelOptions,
} from "@/components/canvas/ModelSelector";
import {
  readPreferredImageModelId,
  writePreferredImageModelId,
} from "@/lib/assistant-model-preference";
import {
  fitReferencesToBudget,
  writeHomePromptHandoff,
  type HomePromptReference,
} from "@/lib/home-prompt-handoff";
import type { AiModelOption } from "@/lib/workspace-data";
import type { PendingSkillLoad } from "@/lib/skill-store";
import { ThemeModeSwitcher } from "@/components/theme/ThemeModeSwitcher";
import { useTheme } from "@/contexts/ThemeContext";
import { CenteredAuthDialog } from "@/components/auth/CenteredAuthDialog";
import { CenteredPromptPanel } from "@/components/home/CenteredPromptPanel";

// 记住账号功能的 Cookie 名称和过期时间
const REMEMBERED_LOGIN_COOKIE = "artx_remembered_login";
const REMEMBERED_LOGIN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30天

/**
 * ⚠️ 直接复用共享类型。
 * 这里原来另写了一份 `InspirationRecommendation`（少 group/subcategory/model），
 * 于是首页把 `item.field` 同时当 group 和 subcategory 塞进收藏快照，
 * 个人中心里同一条内容的分类标签与专题页不一致。
 */
type HomeInspirationItem = InspirationFeedItem & {
  viewCount: number;
  likeCount: number;
};

const BRAND_LOGO_SIZE = "h-[20px] w-[109px]";
/** 首页灵感推荐最多展示的条数。远程有 900 条，首页只需要一屏量。 */
const HOME_INSPIRATION_LIMIT = 50;

const PROMPT_SUGGESTIONS = [
  "帮我生成一张赛博朋克风格插画",
  "设计一个极简主义Logo",
  "把这张照片变成水彩画风格",
];

const HOME_PROMPT_PLACEHOLDER = "描述你想要生成的图片，例如：帮我生成一张赛博朋克风格插画";
const HOME_AUTH_PANEL_STORAGE_KEY = "artx:home-auth-panel";
const HOME_POST_LOGIN_REDIRECT_STORAGE_KEY = "artx:home-post-login-redirect";

type LandingTab = "home" | "inspiration" | "skills" | "ecommerce" | "workspace" | "help";

/**
 * 洗牌兜底顺序。
 *
 * ⚠️ 洗的是**顺序**，不是身份。头像和三个计数都是 title 的纯函数，
 * 所以首页随便洗，同一条内容在专题页依然是同一张脸、同一个数字。
 * 📌 「一致性不依赖顺序」是降级方案能成立的前提之一。
 */
function shuffleInspirationRecommendations(items: InspirationFeedItem[]) {
  return [...items]
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

/**
 * 给条目挂上展示计数。
 *
 * ⚠️⚠️⚠️ 这里原来是 `randomInspirationMetric()`（`Math.random()`），已删除。
 * 随机数导致三个连锁问题，且**一个都不会报错**：
 *   1. 同一张卡片在首页和专题页数字不同；
 *   2. 刷新一次数字就变；
 *   3. 用户点赞 +1 完全没意义 —— 基数自己每次都在跳几千。
 * 现在改成 title 哈希算出的确定性基数（`inspiration-metrics.ts`），
 * 同一条内容在任何页面、任何时刻都是同一个数，用户的 +1 才看得见。
 */
function withInspirationMetrics(item: InspirationFeedItem): HomeInspirationItem {
  return {
    ...item,
    viewCount: getInspirationViewBaseCount(item.title),
    likeCount: getInspirationLikeBaseCount(item.title),
  };
}

/**
 * 兜底数据源。
 *
 * ⚠️⚠️ 必须走 `getInspirationFallbackFeed()` —— 与专题页降级时**同一份数据**。
 * 这里原来读的是首页自己那份 CSV 解析（已删），虽然当时 title 口径碰巧相同，
 * 但两份重复实现只要有一边被改就会悄悄漂移，且不报错。
 * 📌 远程挂掉时两页仍然逐条一致，靠的就是这个共享出口。
 */
function createHomeInspirationFallbackFeed(): HomeInspirationItem[] {
  return shuffleInspirationRecommendations(getInspirationFallbackFeed()).map(withInspirationMetrics);
}

const getStageScale = () => {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / 1600, window.innerHeight / 900);
};

function getCookieValue(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map(item => item.trim())
      .find(item => item.startsWith(prefix))
      ?.slice(prefix.length) || ""
  );
}

function getRememberedLoginUsername() {
  const value = getCookieValue(REMEMBERED_LOGIN_COOKIE);
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function getSecureCookieSuffix() {
  if (typeof window === "undefined") return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

function saveRememberedLoginUsername(username: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBERED_LOGIN_COOKIE}=${encodeURIComponent(username)}; Max-Age=${REMEMBERED_LOGIN_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${getSecureCookieSuffix()}`;
}

function clearRememberedLoginUsername() {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBERED_LOGIN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${getSecureCookieSuffix()}`;
}

function getPasswordCredentialConstructor() {
  if (typeof window === "undefined") return null;
  return (
    window as typeof window & {
      PasswordCredential?: new (data: {
        id: string;
        name?: string;
        password: string;
      }) => Credential;
    }
  ).PasswordCredential || null;
}

async function storeBrowserPasswordCredential(username: string, password: string) {
  if (typeof navigator === "undefined" || !navigator.credentials) return;
  const PasswordCredential = getPasswordCredentialConstructor();
  if (!PasswordCredential) return;
  try {
    await navigator.credentials.store(
      new PasswordCredential({ id: username, name: username, password })
    );
  } catch {
    // Browser password manager prompts are best-effort and may be disabled by user settings.
  }
}

/**
 * 「首屏是否还看得见」的唯一阈值：滚动量 ≤ 首屏高度 × 该比例即视为仍在第一屏。
 *
 * ⚠️ 必须由登录入口分流（requestLoginByScrollPosition）和滚动复位
 * （handleMainScroll）**共用同一个常量**。两处各写一个字面量 0.15，
 * 日后只改其中一处，就会出现「面板已复位成 prelogin、点击却按已滚走处理」
 * 这种自相矛盾的状态，且零报错。
 */
const HOME_HERO_VISIBLE_RATIO = 0.15;

export default function HomePage() {
  const [, navigate] = useLocation();
  const { openBilling } = useBillingDialog();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [prompt, setPrompt] = useState("");
  const [centeredAuthOpen, setCenteredAuthOpen] = useState(false);
  const [centeredAuthMode, setCenteredAuthMode] = useState<"login" | "register">("login");
  const [announcementOpen, setAnnouncementOpen] = useState(
    () =>
      hasAnnouncementForcePending() || !hasSeenAnnouncement(HOME_ANNOUNCEMENT.id)
  );
  const [homeImageModelId, setHomeImageModelId] = useState(readPreferredImageModelId);
  const homeImageModelOptions = useImageModelOptions();
  const [homeReferences, setHomeReferences] = useState<HomePromptReference[]>([]);
  const [homeActiveSkill, setHomeActiveSkill] = useState<PendingSkillLoad | null>(null);
  const [activeTab, setActiveTab] = useState<LandingTab>("home");
  const [homeInspirationItems, setHomeInspirationItems] = useState(
    createHomeInspirationFallbackFeed
  );
  const remoteInspirationLoadedRef = useRef(false);
  const inspirationReactions = useInspirationReactions();
  const toReactionItem = (item: HomeInspirationItem) => ({
    id: normalizeInspirationIdentity(item.title),
    title: item.title,
    field: item.field,
    group: item.group,
    subcategory: item.subcategory,
    description: item.description,
    prompt: item.prompt,
    imageUrl: item.imageUrl,
  });

  const [selectedHomeInspiration, setSelectedHomeInspiration] = useState<HomeInspirationItem | null>(null);
  const [homeInspirationImageHeight, setHomeInspirationImageHeight] = useState<number | null>(null);
  const [isFirstTopUpBannerDismissed, setIsFirstTopUpBannerDismissed] = useState(
    isFirstTopUpBannerDismissedToday,
  );
  const [landedInviteCode, setLandedInviteCode] = useState("");
  const activeTabRef = useRef<LandingTab>("home");
  const hasReachedInspirationRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const homeRef = useRef<HTMLElement>(null);
  const inspirationRef = useRef<HTMLElement>(null);
  const homeInspirationImageRef = useRef<HTMLImageElement | null>(null);
  const homeInspirationPromptRef = useRef<HTMLDivElement | null>(null);
  
  // ── 全局主题颜色（根据主题动态计算）──
  const textPrimary = isDark ? "#ffffff" : "#2c2c2b";
  const textSecondary = isDark ? "rgba(255,255,255,0.73)" : "#6a6a6b";
  const textMuted = isDark ? "#7d7d7d" : "#8e8b86";
  const textTertiary = isDark ? "rgba(255,255,255,0.45)" : "#a8a8a8";
  const textAccent = isDark ? "rgba(255,255,255,0.88)" : "#2c2c2b";
  const bgMain = isDark ? "#222222" : "#ffffff";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "#f0efed";
  
  // 灵感详情弹窗颜色
  const homeInspirationBorder = borderColor;
  const homeInspirationPanelBg = isDark ? "#222222" : "#ffffff";
  const homeInspirationCardBg = isDark ? "#222222" : "#ffffff";
  const homeInspirationText = isDark ? "oklch(0.88 0.008 270)" : "#2c2c2b";
  const homeInspirationButtonBg = isDark ? "rgba(34,34,34,0.88)" : "rgba(255,255,255,0.88)";
  const homeInspirationButtonIdleColor = isDark ? "oklch(0.73 0.010 270)" : "#6a6a6b";
  const homeInspirationButtonIconColor = isDark ? "oklch(0.88 0.008 270)" : "#2c2c2b";

  const setCurrentLandingTab = (tab: LandingTab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    // 已登录用户访问首页时，关闭登录弹窗
    setCenteredAuthOpen(false);
    // 只有仍在兜底数据上才重洗顺序
    if (remoteInspirationLoadedRef.current) return;
    setHomeInspirationItems(createHomeInspirationFallbackFeed());
  }, [isAuthenticated]);

  /*
   * 拉取远程灵感，与专题页**同一个接口、同一份映射**。
   *
   * 📌 这是「两页头像与点赞数一致」的根本前提：一致不是靠对齐算法，
   * 而是靠两页消费同一条内容（同一个 title）。算法早就是纯函数了，
   * 之前对不上的原因是首页读 CSV、专题页读接口，两边压根没有同一条数据。
   *
   * ⚠️ 失败时保持兜底数据不动（不要清空）：首页是落地页，白屏比不一致严重得多。
   */
  useEffect(() => {
    const controller = new AbortController();

    fetchInspirationFeed(controller.signal)
      .then(items => {
        if (controller.signal.aborted || items.length === 0) return;
        remoteInspirationLoadedRef.current = true;
        /*
         * ⚠️ 直接整条传给 withInspirationMetrics，**不要在这里手抄字段列表**。
         * 原来这里逐字段列了 7 个，把 group/subcategory/model 丢掉了，
         * 于是首页收藏的条目进个人中心后分类标签与专题页不一致 —— 不报错。
         */
        setHomeInspirationItems(
          items.slice(0, HOME_INSPIRATION_LIMIT).map(withInspirationMetrics)
        );
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // 不 toast：首页有兜底内容可看，弹错只会打扰落地用户。
        console.warn("[home] inspiration feed failed, fallback to local csv", error);
      });

    return () => controller.abort();
  }, []);

  /*
   * 带邀请码落地时：记住邀请码，并自动打开注册弹窗。
   */
  useEffect(() => {
    const code = rememberInviteCodeFromUrl();
    if (!code) return;
    setLandedInviteCode(code);
    if (isAuthenticated) return;
    // 自动打开注册弹窗
    setCenteredAuthMode("register");
    setCenteredAuthOpen(true);
  }, [isAuthenticated]);

  const measureHomeInspirationImage = () => {
    const height = homeInspirationImageRef.current?.getBoundingClientRect().height || 0;
    if (height > 0) setHomeInspirationImageHeight(Math.round(height));
  };

  useEffect(() => {
    if (!selectedHomeInspiration) {
      setHomeInspirationImageHeight(null);
      return;
    }

    const animationFrame = window.requestAnimationFrame(measureHomeInspirationImage);
    window.addEventListener("resize", measureHomeInspirationImage);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", measureHomeInspirationImage);
    };
  }, [selectedHomeInspiration]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const redirectPath = sessionStorage.getItem(HOME_POST_LOGIN_REDIRECT_STORAGE_KEY);
    if (redirectPath !== "/billing?tab=recharge") return;
    sessionStorage.removeItem(HOME_POST_LOGIN_REDIRECT_STORAGE_KEY);
    openBilling("recharge");
  }, [isAuthenticated, openBilling]);

  useEffect(() => {
    const applyRequestedPanel = () => {
      const requestedPanel = sessionStorage.getItem(HOME_AUTH_PANEL_STORAGE_KEY);
      if (requestedPanel !== "login" && requestedPanel !== "register") return;
      sessionStorage.removeItem(HOME_AUTH_PANEL_STORAGE_KEY);
      if (isAuthenticated) return;
      // 打开居中登录弹窗
      setCenteredAuthMode(requestedPanel);
      setCenteredAuthOpen(true);
      homeRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    };

    applyRequestedPanel();
    window.addEventListener("artx:home-auth-panel-requested", applyRequestedPanel);
    return () => window.removeEventListener("artx:home-auth-panel-requested", applyRequestedPanel);
  }, [isAuthenticated]);

  useEffect(() => {
    const sections = [
      { tab: "home" as const, ref: homeRef },
      { tab: "inspiration" as const, ref: inspirationRef },
    ];
    const observer = new IntersectionObserver(
      entries => {
        const visibleEntry = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const visibleSection = sections.find(section => section.ref.current === visibleEntry?.target);
        if (!visibleSection) return;
        setCurrentLandingTab(visibleSection.tab);
      },
      { threshold: [0.45, 0.65] },
    );

    sections.forEach(section => {
      if (section.ref.current) observer.observe(section.ref.current);
    });
    return () => observer.disconnect();
  }, [isAuthenticated]);

  const handleMainScroll = () => {
    const main = mainRef.current;
    const homeHeight = homeRef.current?.offsetHeight || window.innerHeight;
    const scrollTop = main?.scrollTop ?? 0;

    if (scrollTop >= homeHeight * 0.55) {
      hasReachedInspirationRef.current = true;
    }
  };

  /**
   * 模型切换要立刻落盘，而不是等发送时再存。
   *
   * 用户可能选完模型就去逛灵感区、或直接关掉页面 —— 若只在发送时写入，
   * 这次选择就丢了。这与画布侧「选中即写 localStorage」的行为也保持一致。
   */
  const handleHomeImageModelChange = (modelId: string) => {
    setHomeImageModelId(modelId);
    writePreferredImageModelId(modelId);
  };

  const handleHomeReferenceFiles = async (files: File[]) => {
    const imageFiles = files.filter(file =>
      file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name)
    );
    const rejectedCount = files.length - imageFiles.length;
    if (rejectedCount > 0) {
      toast("已跳过非图片文件", {
        description: `${rejectedCount} 个文件不是图片格式，未加入参考图`,
      });
    }
    if (imageFiles.length === 0) return;

    const readAsDataUrl = (file: File) =>
      new Promise<string | null>(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          resolve(typeof result === "string" ? result : null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });

    const loaded: HomePromptReference[] = [];
    let failedCount = 0;
    for (const file of imageFiles) {
      const dataUrl = await readAsDataUrl(file);
      if (!dataUrl) {
        failedCount += 1;
        continue;
      }
      loaded.push({
        id: `home-reference-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: file.name.replace(/\.[^.]+$/, "") || "参考图",
        src: dataUrl,
      });
    }
    if (failedCount > 0) {
      toast("部分图片读取失败", {
        description: `${failedCount} 张图片无法读取，请重试`,
      });
    }
    if (loaded.length === 0) return;

    const { accepted, droppedCount } = fitReferencesToBudget([
      ...homeReferences,
      ...loaded,
    ]);
    if (droppedCount > 0) {
      toast("部分参考图未能添加", {
        description: `${droppedCount} 张图片超出体积或数量上限，已跳过`,
      });
    }
    setHomeReferences(accepted);
  };

  const handleRemoveHomeReference = (id: string) => {
    setHomeReferences(prev => prev.filter(reference => reference.id !== id));
  };

  const createProjectFromPrompt = () => {
    const text = prompt.trim();
    if (!text) {
      toast("请输入提示词");
      return;
    }
    const title = text.length > 18 ? `${text.slice(0, 18)}...` : text;
    const project = createWorkspaceHistoryProject(title || undefined, text);
    const handoffResult = writeHomePromptHandoff({
      projectId: project.id,
      prompt: text,
      model: homeImageModelId,
      shouldAutoRun: true,
      createdAt: project.createdAt,
      references: homeReferences.length > 0 ? homeReferences : undefined,
      skill: homeActiveSkill ? { id: homeActiveSkill.id, name: homeActiveSkill.name } : undefined,
    });
    if (handoffResult.droppedReferences && homeReferences.length > 0) {
      toast("参考图未能带入画布", {
        description: "浏览器存储空间不足，请进入画布后重新上传",
      });
    }
    toast("已创建新画布", { description: text.slice(0, 80) });
    navigate(`/project/${project.id}`);
  };

  const handlePromptSend = () => {
    if (!isAuthenticated || !requestAiAuth()) {
      // 未登录，打开居中登录弹窗
      setCenteredAuthMode("login");
      setCenteredAuthOpen(true);
      return;
    }
    createProjectFromPrompt();
  };

  const copyHomeInspirationPrompt = async (promptText: string) => {
    try {
      await navigator.clipboard.writeText(promptText);
      toast("提示词已复制");
    } catch {
      toast("复制失败", { description: "请手动复制提示词内容" });
    }
  };

  const scrollHomeInspirationPrompt = (event: React.WheelEvent<HTMLDivElement>) => {
    const promptPanel = homeInspirationPromptRef.current;
    if (!promptPanel) return;
    const target = event.target as Node;
    if (promptPanel.contains(target)) return;

    event.preventDefault();
    promptPanel.scrollTop += event.deltaY;
  };


  const scrollToInspiration = () => {
    setCurrentLandingTab("inspiration");
    inspirationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openInspirationPage = () => navigate("/inspiration");

  const scrollToHome = () => {
    setCurrentLandingTab("home");
    homeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleStartExperience = () => {
    if (isAuthenticated) {
      navigate("/workspace");
      return;
    }
    // 未登录，打开居中登录弹窗
    setCenteredAuthMode("login");
    setCenteredAuthOpen(true);
  };

  const openFirstTopUpBilling = () => {
    if (isAuthenticated) {
      openBilling("recharge");
      return;
    }
    sessionStorage.setItem(HOME_POST_LOGIN_REDIRECT_STORAGE_KEY, "/billing?tab=recharge");
    setCenteredAuthMode("login");
    setCenteredAuthOpen(true);
  };

  const showLoginRequired = () => {
    if (isAuthenticated) return;
    setCenteredAuthMode("login");
    setCenteredAuthOpen(true);
  };

  /**
   * 把「公告正在阻断」同步给新手引导（公告优先，两者不同时出现）。
   *
   * ⚠️ 清理函数里必须置回 false：
   *    用户没关弹窗就跳走（点浏览器后退 / 外链）时，若不复位，
   *    闸门会永久卡住，新手引导在整个会话里再也不播且不报错。
   */
  useEffect(() => {
    setAnnouncementBlocking(announcementOpen);
    return () => setAnnouncementBlocking(false);
  }, [announcementOpen]);

  /**
   * 每次登录 / 注册成功后，公告必须再弹一次（产品定稿 2026-09-19）。
   *
   * ⚠️ 为什么不能只靠 AuthContext 清 localStorage：
   *    登录弹窗就开在首页上，清记录时 HomePage 早已挂载，
   *    上面那次惰性初始化不会重新执行 —— 表现是「登录成功但公告没出来，
   *    要手动刷新才有」，而且全程零报错。所以必须由事件当场把它打开。
   */
  useEffect(() => {
    const replay = () => setAnnouncementOpen(true);
    window.addEventListener(ANNOUNCEMENT_REPLAY_EVENT, replay);
    return () => window.removeEventListener(ANNOUNCEMENT_REPLAY_EVENT, replay);
  }, []);

  /**
   * 消费掉「强制待弹标记」—— 必须等弹窗**真的打开之后**才清。
   *
   * ⚠️ 为什么不在上面那次惰性初始化里顺手清：
   *    React 严格模式下初始化函数会跑两次。第一次读到标记并清掉，
   *    第二次读到的就是空 —— 弹窗时有时无，而且零报错，极难复现。
   *    放在 open === true 的 effect 里，无论初始化跑几次都只是重复 remove，幂等。
   *
   * ⚠️ 也不能不清：不清的话标记会永久留在 localStorage，
   *    用户关掉弹窗后每刷一次首页就再弹一次，等于关不掉。
   */
  useEffect(() => {
    if (announcementOpen) clearAnnouncementForcePending();
  }, [announcementOpen]);

  /** 唯一关闭入口：右下角「我知道了」（右上角 ✕ 已于 2026-09-19 移除） */
  const handleAnnouncementClose = () => {
    markAnnouncementSeen(HOME_ANNOUNCEMENT.id);
    setAnnouncementOpen(false);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bgMain }}>
      {/* 居中登录/注册弹窗 */}
      <CenteredAuthDialog
        open={centeredAuthOpen}
        onClose={() => setCenteredAuthOpen(false)}
        defaultMode={centeredAuthMode}
        inviteCode={landedInviteCode}
      />
      
      {/* 首页公告 —— 阻断式，带半透明蒙层，只能通过右下角绿色按钮关闭 */}
      <AnnouncementModal
        open={announcementOpen}
        content={HOME_ANNOUNCEMENT}
        onClose={handleAnnouncementClose}
      />
      {!isFirstTopUpBannerDismissed && (
        <HomeFirstTopUpBanner
          onDismiss={() => {
            dismissFirstTopUpBannerForToday();
            setIsFirstTopUpBannerDismissed(true);
          }}
          onOpenBilling={openFirstTopUpBilling}
        />
      )}
      <main ref={mainRef} onScroll={handleMainScroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth" style={{ background: bgMain, color: textPrimary }}>
      <header className={`fixed left-0 right-0 ${isFirstTopUpBannerDismissed ? "top-0" : "top-[80px]"} z-50 flex h-[64px] items-center gap-3 px-4 backdrop-blur-[18px] sm:gap-4`} style={{ background: isDark ? "rgba(34,34,34,0.20)" : "rgba(255,255,255,0.90)" }}>
        <button
          type="button"
          onClick={() => {
            setCurrentLandingTab("home");
            navigate("/");
          }}
          className={`${BRAND_LOGO_SIZE} shrink-0 transition-opacity hover:opacity-85`}
          aria-label="ArtXStudio 首页"
        >
          <img
            src={artxStudioLogo}
            alt="ArtXStudio"
            className="artx-logo block h-full w-full object-contain object-left"
            style={{
              filter: isDark ? "none" : "brightness(0)",
            }}
          />
        </button>
        <LandingTopNav
          activeTab={activeTab}
          onHome={scrollToHome}
          onInspiration={scrollToInspiration}
          onSkills={() => {
            setCurrentLandingTab("skills");
            navigate("/skills");
          }}
          onEcommerce={() => {
            setCurrentLandingTab("ecommerce");
            navigate("/ecommerce-canvas");
          }}
          onWorkspace={(event) => {
            if (!isAuthenticated) {
              showLoginRequired();
              return;
            }
            setCurrentLandingTab("workspace");
            navigate("/workspace");
          }}
          onHelp={(event) => {
            if (!isAuthenticated) {
              showLoginRequired();
              return;
            }
            setCurrentLandingTab("help");
            navigate("/help");
          }}
          isDark={isDark}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeModeSwitcher />
          <button
            type="button"
            onClick={handleStartExperience}
            className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[#936CFF] px-4 text-sm font-medium text-white shadow-[0_10px_28px_rgba(147,108,255,0.30)] transition-colors hover:bg-[#8257ff]"
          >
            {isAuthenticated ? "进入工作台" : "开始体验"}
          </button>
        </div>
      </header>
      
      {/* 第一屏：居中的提示词输入区域（移除 banner 和左侧大标题） */}
      <section ref={homeRef} className="relative flex min-h-screen items-center justify-center px-6" style={{ background: bgMain }}>
        <CenteredPromptPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          onSend={handlePromptSend}
          imageModelId={homeImageModelId}
          imageModelOptions={homeImageModelOptions}
          onImageModelChange={handleHomeImageModelChange}
          references={homeReferences}
          onReferenceFiles={handleHomeReferenceFiles}
          onRemoveReference={handleRemoveHomeReference}
          activeSkill={homeActiveSkill}
          onSkillChange={setHomeActiveSkill}
          isDark={isDark}
          textPrimary={textPrimary}
          textMuted={textMuted}
          bgMain={bgMain}
          borderColor={borderColor}
          suggestions={PROMPT_SUGGESTIONS}
          onSuggestionClick={setPrompt}
        />

        <button
          type="button"
          onClick={scrollToInspiration}
          className="absolute bottom-[72px] left-1/2 z-20 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border transition-all"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.10)",
            backgroundColor: isDark ? "rgba(34,34,34,0.20)" : "rgba(255,255,255,0.50)",
            color: isDark ? "rgba(255,255,255,0.70)" : "rgba(0,0,0,0.60)",
            backdropFilter: "blur(12px)",
          }}
          aria-label="滚动到灵感推荐"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = isDark
              ? "rgba(255,255,255,0.45)"
              : "rgba(0,0,0,0.20)";
            e.currentTarget.style.color = isDark ? "#ffffff" : "#000000";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDark
              ? "rgba(255,255,255,0.20)"
              : "rgba(0,0,0,0.10)";
            e.currentTarget.style.color = isDark
              ? "rgba(255,255,255,0.70)"
              : "rgba(0,0,0,0.60)";
          }}
        >
          <ChevronDown size={22} />
        </button>
      </section>

      <section ref={inspirationRef} className="min-h-screen px-6 py-10 sm:px-10 lg:px-20" style={{ background: bgMain }}>
        <div className="mx-auto max-w-[1600px]">
          {/*
            ⚠️ 引导锚点刻意打在标题行而不是外层 section 上：
            section 是 min-h-screen 的满屏容器（实测高 6108px），
            拿它当挖孔目标 = 把整个视口挖空 = 黑色遮罩视觉上完全消失。
          */}
          <div data-tour-id={TOUR_ANCHORS.homeInspirationSection} className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-medium" style={{ color: textAccent }}>Inspiration Picks</p>
              <h2 className="text-[34px] font-black leading-tight sm:text-[44px]" style={{ color: textPrimary }}>灵感推荐</h2>
            </div>
          </div>

          <div className="columns-1 gap-4 md:columns-2 xl:columns-4">
            {homeInspirationItems.map((item, itemIndex) => (
              /*
               * ⚠️⚠️ 这里从 <button> 改成了 role="button" 的 <div>。
               * 原因：卡片内要放真实可点的点赞按钮（需求 1），
               * 而 <button> 里嵌 <button> 是**非法 HTML**，浏览器会把内层按钮
               * 提到外面去，导致点赞按钮跑出卡片、点击行为完全不可预期。
               * 📌 交互语义靠 role + tabIndex + onKeyDown 补齐，无障碍不降级。
               */
              <div
                key={`${item.rank}-${item.title}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedHomeInspiration(item)}
                onKeyDown={event => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedHomeInspiration(item);
                }}
                data-tour-id={itemIndex === 0 ? TOUR_ANCHORS.homeInspirationCard : undefined}
                className="group mb-4 w-full cursor-pointer break-inside-avoid overflow-hidden rounded-md border transition-transform hover:-translate-y-1"
                style={{
                  borderColor,
                  backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
                  boxShadow: isDark
                    ? "0 10px 30px rgba(0,0,0,0.5)"
                    : "0 4px 20px rgba(0,0,0,0.08)",
                }}
              >
                <div className="relative overflow-hidden">
                  <img src={item.imageUrl} alt={item.title} className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                  {/*
                    ⚠️ 虚拟创作者头像已按用户要求全站移除（所有场景，不只这一处）。
                    这里保留渐变遮罩 —— 它是图片与下方文字的过渡，和头像无关。
                  */}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.field}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5 pr-0">
                      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: textTertiary }}>
                        <Eye size={14} />
                        {item.viewCount}
                      </span>
                      {/*
                        真实点赞（需求 1）。原来这里是个纯展示的 Heart，点了没反应。
                        ⚠️ 按钮内部已 stopPropagation，否则点赞会顺带触发外层卡片的详情弹窗。
                      */}
                      <InspirationReactionButton
                        kind="like"
                        active={inspirationReactions.isActive(
                          "like",
                          normalizeInspirationIdentity(item.title)
                        )}
                        count={getDisplayLikeCount(
                          item.likeCount,
                          inspirationReactions.isActive(
                            "like",
                            normalizeInspirationIdentity(item.title)
                          )
                        )}
                        onToggle={() => inspirationReactions.toggle("like", toReactionItem(item))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center pb-2">
            <button
              type="button"
              onClick={openInspirationPage}
              data-tour-id={TOUR_ANCHORS.homeInspirationMore}
              className="artx-green-text text-sm font-semibold underline decoration-[var(--color-brand-green)]/60 underline-offset-4 transition-colors hover:opacity-80"
              style={{ color: 'var(--color-brand-green-text)' }}
            >
              查看全部灵感推荐
            </button>
          </div>
        </div>
      </section>
      {selectedHomeInspiration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ background: "rgba(34,34,34,0.72)", backdropFilter: "blur(10px)" }} onClick={() => setSelectedHomeInspiration(null)}>
          <section
            data-artx-dialog-surface
            className="relative max-h-full w-full overflow-hidden rounded-[var(--radius-lg-design)]"
            style={{ maxWidth: 980, background: homeInspirationPanelBg, border: `1px solid ${homeInspirationBorder}` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute right-3 top-3 z-10 flex items-center" style={{ gap: 16 }}>
              {/*
                详情浮窗的点赞 / 收藏（需求 2）。
                ⚠️⚠️ 改之前首页详情浮窗**只有复制和关闭**，用户打开大图想点赞
                找不到入口，必须退回去点卡片上那个小图标。
                📌 与专题页详情浮窗**同一套组件、同一个基数函数、同一个 hook**，
                所以两页详情里的数字天然相同，点赞状态也互通。
                ⚠️ 收藏基数走 seed 的另一段位，不能复用点赞基数（否则两个数永远相等）。
              */}
              <span
                className="flex shrink-0 items-center rounded-[var(--radius-pill)] px-3 py-2"
                style={{
                  gap: 14,
                  background: homeInspirationButtonBg,
                  border: `1px solid ${homeInspirationBorder}`,
                  backdropFilter: "blur(12px)",
                }}
              >
                <InspirationReactionButton
                  kind="like"
                  size={16}
                  idleColor={homeInspirationButtonIdleColor}
                  active={inspirationReactions.isActive(
                    "like",
                    normalizeInspirationIdentity(selectedHomeInspiration.title)
                  )}
                  count={getDisplayLikeCount(
                    getInspirationLikeBaseCount(selectedHomeInspiration.title),
                    inspirationReactions.isActive(
                      "like",
                      normalizeInspirationIdentity(selectedHomeInspiration.title)
                    )
                  )}
                  onToggle={() =>
                    inspirationReactions.toggle("like", toReactionItem(selectedHomeInspiration))
                  }
                />
                <InspirationReactionButton
                  kind="favorite"
                  size={16}
                  idleColor={homeInspirationButtonIdleColor}
                  active={inspirationReactions.isActive(
                    "favorite",
                    normalizeInspirationIdentity(selectedHomeInspiration.title)
                  )}
                  count={getDisplayLikeCount(
                    getInspirationFavoriteBaseCount(selectedHomeInspiration.title),
                    inspirationReactions.isActive(
                      "favorite",
                      normalizeInspirationIdentity(selectedHomeInspiration.title)
                    )
                  )}
                  onToggle={() =>
                    inspirationReactions.toggle("favorite", toReactionItem(selectedHomeInspiration))
                  }
                />
              </span>
              <button
                onClick={() => copyHomeInspirationPrompt(selectedHomeInspiration.prompt)}
                className="shrink-0 rounded-[var(--radius-pill)] p-2 transition-all hover:scale-105 active:scale-95"
                style={{ background: homeInspirationButtonBg, border: `1px solid ${homeInspirationBorder}`, color: homeInspirationButtonIconColor, backdropFilter: "blur(12px)" }}
                aria-label="复制提示词"
                title="复制提示词"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => setSelectedHomeInspiration(null)}
                className="shrink-0 rounded-[var(--radius-pill)] p-2 transition-all hover:scale-105 active:scale-95"
                style={{ background: homeInspirationButtonBg, border: `1px solid ${homeInspirationBorder}`, color: homeInspirationButtonIconColor, backdropFilter: "blur(12px)" }}
                aria-label="关闭弹层"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 pr-14" style={{ borderBottom: `1px solid ${homeInspirationBorder}` }}>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: "oklch(0.62 0.22 290 / 0.20)", color: "oklch(0.80 0.17 290)", letterSpacing: 0, textTransform: "none" }}>
                    {selectedHomeInspiration.field}
                  </span>
                </div>
                <h2 className="type-body-sm leading-6" style={{ color: "oklch(0.88 0.008 270)", fontWeight: 760 }}>{selectedHomeInspiration.title}</h2>
              </div>
            </div>

            <div
              className="grid items-start overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]"
              style={{ maxHeight: "calc(100vh - 160px)", overscrollBehavior: "contain" }}
              onWheel={scrollHomeInspirationPrompt}
            >
              <div className="bg-card">
                <div className="relative">
                  <img
                    ref={homeInspirationImageRef}
                    src={selectedHomeInspiration.imageUrl}
                    alt={selectedHomeInspiration.title}
                    className="relative z-10 block h-auto max-h-[calc(100vh-160px)] w-full object-contain"
                    onLoad={measureHomeInspirationImage}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center px-8 text-center" style={{ background: "linear-gradient(135deg, oklch(0.20 0.05 290), oklch(0.18 0.04 205))" }}>
                    <span className="type-body-sm" style={{ color: "oklch(0.88 0.02 270)", fontWeight: 650 }}>
                      本地图片待同步
                    </span>
                  </div>
                </div>
              </div>
              <div
                ref={homeInspirationPromptRef}
                className="overflow-y-auto p-4"
                style={{
                  height: homeInspirationImageHeight ? `${homeInspirationImageHeight}px` : "auto",
                  maxHeight: homeInspirationImageHeight ? `${homeInspirationImageHeight}px` : "calc(100vh - 160px)",
                  overscrollBehavior: "contain",
                }}
              >
                <p className="type-caption leading-5" style={{ color: homeInspirationButtonIdleColor, letterSpacing: 0, textTransform: "none" }}>{selectedHomeInspiration.description}</p>
                <div className="mt-4 rounded-[var(--radius-md-design)] p-4" style={{ background: homeInspirationCardBg, border: `1px solid ${homeInspirationBorder}` }}>
                  <p className="whitespace-pre-wrap type-caption leading-6" style={{ color: homeInspirationText, letterSpacing: 0, textTransform: "none" }}>
                    {selectedHomeInspiration.prompt}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      </main>
    </div>
  );
}

function LandingTopNav({
  activeTab,
  onHome,
  onInspiration,
  onSkills,
  onEcommerce,
  onWorkspace,
  onHelp,
  isDark,
}: {
  activeTab: LandingTab;
  onHome: () => void;
  onInspiration: () => void;
  onSkills: () => void;
  onEcommerce: () => void;
  onWorkspace: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onHelp: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isDark: boolean;
}) {
  const navItems = [
    { key: "home" as const, label: "首页", onClick: onHome },
    { key: "inspiration" as const, label: "灵感推荐", onClick: onInspiration },
    { key: "skills" as const, label: "技能商店", onClick: onSkills },
    { key: "workspace" as const, label: "工作台", onClick: onWorkspace },
    // 电商画布紧跟在「工作台」右侧（ericbi 2026-10-17 指定位置）。
    // 无需登录即可浏览（生成时再拦），与侧栏入口同一路由 /ecommerce-canvas。
    { key: "ecommerce" as const, label: "电商画布", onClick: onEcommerce },
    { key: "help" as const, label: "帮助与反馈", onClick: onHelp },
  ];

  return (
    <nav className="ml-auto flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:gap-3 lg:absolute lg:left-1/2 lg:top-1/2 lg:ml-0 lg:flex-none lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-visible" aria-label="首页导航">
      {navItems.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className={`h-9 shrink-0 appearance-none rounded-md px-3 text-center text-xs font-medium transition-colors sm:min-w-[82px] sm:text-sm ${
            activeTab === item.key
              ? "bg-[#936CFF] text-white shadow-[0_8px_20px_rgba(147,108,255,0.28)]"
              : isDark 
                ? "bg-transparent text-white/73 hover:bg-white/8 hover:text-white"
                : "bg-transparent text-black/73 hover:bg-black/8 hover:text-black"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

