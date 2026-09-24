import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  Gift,
  ImagePlus,
  PlayCircle,
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
import { INVITE_REWARD_CONFIG } from "@shared/billing-config";
import { TOUR_ANCHORS } from "@shared/onboarding-steps";
import asteroidImage from "@/assets/ardot/3_3.png";
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

const HOME_PROMPT = "hello，欢迎来到。ArtX,正式开启你的。灵感AI创意之旅吧！";
const HOME_AUTH_PANEL_STORAGE_KEY = "artx:home-auth-panel";
const HOME_POST_LOGIN_REDIRECT_STORAGE_KEY = "artx:home-post-login-redirect";
const REMEMBERED_LOGIN_COOKIE = "artx_remembered_login";
const REMEMBERED_LOGIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const PROMPT_TYPE_DURATION_MS = 5000;
const PROMPT_PAUSE_DURATION_MS = 3000;
const PROMPT_FRAME_MS = 80;

type PanelMode = "prelogin" | "login" | "register";
type LandingTab = "home" | "inspiration" | "skills" | "workspace" | "help";
type LoginBubble = { left: number; top: number; id: number } | null;

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
  const { isAuthenticated, login, register, openLoginModal } = useAuth();
  const [panelMode, setPanelMode] = useState<PanelMode>(isAuthenticated ? "prelogin" : "prelogin");
  const [prompt, setPrompt] = useState(HOME_PROMPT);
  const [promptTouched, setPromptTouched] = useState(false);
  /**
   * 首页公告弹窗（阻断式）。
   *
   * 判定顺序（强硬规则，产品定稿 2026-09-19）：
   *   ① 有「强制待弹标记」→ 必弹，无视已读记录
   *      （标记由 AuthContext 在每条登录 / 注册成功路径上打）
   *   ② 否则看这一期是否已读
   *
   * ⚠️ 惰性初始化不可省：两个判断都会摸 localStorage，
   *    写成 useState(表达式) 会在每次渲染都执行一遍。
   */
  const [announcementOpen, setAnnouncementOpen] = useState(
    () =>
      hasAnnouncementForcePending() || !hasSeenAnnouncement(HOME_ANNOUNCEMENT.id)
  );
  /**
   * 首页选的出图模型。与画布共用同一份 localStorage 偏好（用户 2026-09-15 拍板），
   * 所以这里读的不是本地初值，而是全站统一的偏好。
   *
   * ⚠️ 惰性初始化不可省：readPreferredImageModelId 会摸 localStorage，
   * 写成 useState(readPreferredImageModelId()) 会在每次渲染都执行一次。
   */
  const [homeImageModelId, setHomeImageModelId] = useState(readPreferredImageModelId);
  const homeImageModelOptions = useImageModelOptions();
  /**
   * 首页「添加参考图」选中的图片。跟着提示词一起交接给画布，
   * 进画布后直接成为引用图片（与在画布里上传的效果一致）。
   */
  const [homeReferences, setHomeReferences] = useState<HomePromptReference[]>([]);
  const [email, setEmail] = useState(getRememberedLoginUsername);
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(
    () => Boolean(getRememberedLoginUsername())
  );
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [stageScale, setStageScale] = useState(getStageScale);
  const [activeTab, setActiveTab] = useState<LandingTab>("home");
  const [loginBubble, setLoginBubble] = useState<LoginBubble>(null);
  const [homeInspirationItems, setHomeInspirationItems] = useState(
    createHomeInspirationFallbackFeed
  );
  /**
   * 远程灵感是否已接管。
   *
   * ⚠️ 用来挡住「刷新按钮把远程数据重新洗回 CSV」：
   * 下面的 refresh 逻辑原来无条件调 createHomeInspirationFeed()，
   * 若远程已经接管，再调一次就把首页悄悄打回本地 CSV，
   * 表现是「刚才两页头像还一致，点了下刷新就不一致了」，且不报错。
   */
  const remoteInspirationLoadedRef = useRef(false);
  /**
   * 灵感点赞 / 收藏状态。
   * ⚠️ 与专题页、个人中心共用同一份 hook —— 首页点的赞必须能在个人中心看到。
   */
  const inspirationReactions = useInspirationReactions();

  /**
   * 列表项 → 沉淀快照。
   *
   * ⚠️⚠️ 字段必须**给全且与专题页同口径**（专题页同名函数即参照）。
   * 原来首页把 `item.field` 同时塞给 group 和 subcategory，
   * 导致同一条内容从首页收藏、从专题页收藏，进个人中心后分类标签不一样。
   */
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
  /*
   * 邀请落地态。
   *
   * ⚠️ 这是邀请闭环此前最直观的断裂点：朋友点开 /?invite=XXXX 进来，
   * 页面**没有任何变化** —— 不提示"谁邀请了你"，也不引导去注册，
   * 面板默认停在 prelogin。用户自然会问"哪里输邀请码"，
   * 而正确答案是"不用输，但你必须去注册"，这件事没人告诉他。
   *
   * 首次挂载时把 URL 上的邀请码落到本地（见 AuthContext 的
   * rememberInviteCodeFromUrl），之后即使用户逛遍全站再回来注册，
   * 邀请码依然在，关系才绑得上。
   */
  const [landedInviteCode, setLandedInviteCode] = useState("");
  const activeTabRef = useRef<LandingTab>("home");
  const hasReachedInspirationRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const homeRef = useRef<HTMLElement>(null);
  const inspirationRef = useRef<HTMLElement>(null);
  const homeInspirationImageRef = useRef<HTMLImageElement | null>(null);
  const homeInspirationPromptRef = useRef<HTMLDivElement | null>(null);
  const homeInspirationBorder = "rgba(255,255,255,0.10)";

  const setCurrentLandingTab = (tab: LandingTab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setPanelMode("prelogin");
    setAuthError("");
    setLoginBubble(null);
    /*
     * ⚠️⚠️ 只有仍在兜底数据上才重洗顺序。
     * 远程数据一旦接管，重洗会把首页打回本地 CSV，
     * 于是「登录前两页头像一致 → 登录后不一致」，而且不报任何错。
     */
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
   * 带邀请码落地时：记住邀请码，并把右侧面板直接切到注册态。
   *
   * ⚠️ 必须先判 isAuthenticated —— 已登录用户点朋友的邀请链接，
   * 给他弹注册面板毫无意义（他也绑不上，后端只对新账号绑定）。
   * 这种情况下只记码不改 UI：万一他随后退出登录换新号注册，码还在。
   */
  useEffect(() => {
    const code = rememberInviteCodeFromUrl();
    if (!code) return;
    setLandedInviteCode(code);
    if (isAuthenticated) return;
    setCurrentLandingTab("home");
    setPanelMode("register");
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

  /*
    未登录用户点了首充 → 登录成功后要接着把充值界面给他。

    ⚠️ 这里也必须开浮层而不是 navigate：跳页的话用户刚登录就被甩出首页，
    还得自己点回来。sessionStorage 里存的那个 "/billing?tab=recharge"
    只当「意图标记」用，不再当成跳转目标。
  */
  useEffect(() => {
    if (!isAuthenticated) return;
    const redirectPath = sessionStorage.getItem(HOME_POST_LOGIN_REDIRECT_STORAGE_KEY);
    if (redirectPath !== "/billing?tab=recharge") return;
    sessionStorage.removeItem(HOME_POST_LOGIN_REDIRECT_STORAGE_KEY);
    openBilling("recharge");
  }, [isAuthenticated, openBilling]);

  useEffect(() => {
    if (!loginBubble) return;
    const timer = window.setTimeout(() => setLoginBubble(null), 1800);
    return () => window.clearTimeout(timer);
  }, [loginBubble]);

  useEffect(() => {
    const applyRequestedPanel = () => {
      const requestedPanel = sessionStorage.getItem(HOME_AUTH_PANEL_STORAGE_KEY);
      if (requestedPanel !== "login" && requestedPanel !== "register") return;
      sessionStorage.removeItem(HOME_AUTH_PANEL_STORAGE_KEY);
      if (isAuthenticated) return;
      setCurrentLandingTab("home");
      setPanelMode(requestedPanel);
      homeRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    };

    // 挂载时读一次：覆盖「从 RequireLogin 重定向回首页」的场景。
    applyRequestedPanel();

    // ⚠️ 还必须监听事件：首页**不会重新挂载**，仅靠上面那次读取，
    // 停留在首页时触发的 artx:login-required 不会有任何反应（面板不切换），
    // 用户会觉得"点了没反应"。AuthContext 在首页把全局弹窗换成了本事件，
    // 这里是它唯一的落点，删掉即等于首页登录入口失灵。
    //
    // 📌 已知行为差异（2026-09-24，产品仅要求先改「开始体验」）：
    // 本路径（lib/ai.ts / BillingPage 在 401 时派发）无论用户滚到哪里，
    // 都会 scrollIntoView 把他拽回第一屏用内嵌面板；而「开始体验」按钮
    // 已改为「滚出首屏就弹居中小弹窗」（requestLoginByScrollPosition）。
    // 若后续要统一，改这里即可——但注意不能直接删 scrollIntoView，
    // 否则在已滚走的场景会退化成「点了没反应」。
    window.addEventListener("artx:home-auth-panel-requested", applyRequestedPanel);
    return () => window.removeEventListener("artx:home-auth-panel-requested", applyRequestedPanel);
  }, [isAuthenticated]);

  useEffect(() => {
    const updateStageScale = () => {
      setStageScale(getStageScale());
    };
    updateStageScale();
    window.addEventListener("resize", updateStageScale);
    return () => window.removeEventListener("resize", updateStageScale);
  }, []);

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

        const previousTab = activeTabRef.current;
        setCurrentLandingTab(visibleSection.tab);
        if (!isAuthenticated && previousTab === "inspiration" && visibleSection.tab === "home") {
          setPanelMode("prelogin");
        }
      },
      { threshold: [0.45, 0.65] },
    );

    sections.forEach(section => {
      if (section.ref.current) observer.observe(section.ref.current);
    });
    return () => observer.disconnect();
  }, [isAuthenticated]);

  /*
   * 登录面板的挂载条件。
   *
   * ⚠️⚠️ 两个条件缺一不可，少了第二个会**破坏浏览器自动填充**：
   *   1. !isAuthenticated —— 已登录不得把密码表单留在 DOM 里
   *      （隐藏表单仍可能触发密码管理器的身份确认弹窗，见 MEMORY.md）；
   *   2. displayedMode !== "prelogin" —— 面板收起时也必须真正卸载。
   *
   * 此前只有第 1 个条件，收起状态靠 opacity-0 + pointer-events-none 遮住，
   * 表单从首屏起就一直挂在 DOM 上。Chrome/Safari 的密码管理器在页面加载时
   * 就会扫描表单并决定要不要提示填充，而对一个**可见性为 0**的表单
   * 它的行为是不稳定的 —— 等用户点开登录面板时，填充时机早就过去了，
   * 于是"勾了选项却什么都没自动填上"（2026-09-13 用户报的现象）。
   *
   * 卸载后浏览器会在面板真正出现时重新发现表单，填充提示才会按预期弹出。
   *
   * 📌 卸载不影响淡出动画：收起时先播 PreloginPanel 的淡入（500ms），
   * 登录面板本身是直接移除的，视觉上被上层面板盖住，用户看不到突变。
   */
  const displayedMode = isAuthenticated ? "prelogin" : panelMode;
  const shouldRenderAuthPanel = !isAuthenticated && displayedMode !== "prelogin";

  const handleMainScroll = () => {
    const main = mainRef.current;
    const homeHeight = homeRef.current?.offsetHeight || window.innerHeight;
    const scrollTop = main?.scrollTop ?? 0;

    if (scrollTop >= homeHeight * 0.55) {
      hasReachedInspirationRef.current = true;
    }

    if (!isAuthenticated && hasReachedInspirationRef.current && scrollTop <= homeHeight * HOME_HERO_VISIBLE_RATIO) {
      setPanelMode("prelogin");
      hasReachedInspirationRef.current = false;
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

  /**
   * 首页参考图上传。
   *
   * ⚠️ 这里刻意**不复用画布的 10MB 单张上限**。画布把图片存在内存里，
   * 而首页必须先把它塞进 sessionStorage（配额约 5MB）才能交接给画布 ——
   * 照搬 10MB 会让写入直接抛 QuotaExceededError，连提示词一起丢掉。
   * 体积闸门的口径统一在 home-prompt-handoff.ts，不要在这里另立一套。
   */
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

    // 预算是对「最终要交接的整份列表」算的，所以必须连同已选的一起过闸，
    // 不能只判断新增的这几张 —— 否则分多次添加就能绕过总预算。
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
    const text = prompt.trim() || HOME_PROMPT;
    const shouldAutoRun = promptTouched && text !== HOME_PROMPT;
    const title = text.length > 18 ? `${text.slice(0, 18)}...` : text;
    const project = createWorkspaceHistoryProject(title || undefined, text);
    const handoffResult = writeHomePromptHandoff({
      projectId: project.id,
      prompt: text,
      /**
       * ⚠️⚠️ 这里以前是硬编码的 "auto"，模型选择器接入后必须传用户真选的值，
       * 否则选择器就是个纯装饰 —— 这个项目 2026-09-13 刚踩过一模一样的坑
       * （见 InfiniteCanvas.tsx 消费侧那段注释：「首页选的图片模型被当成了纯装饰」）。
       *
       * 消费侧（CanvasAssistantPanel）的口径是 isSupportedImageModelId(model)：
       *   - 传具体模型 id → 判真 → 跳过意图路由，直接出图
       *   - 传 "auto"    → 判假 → 走 routeCreativeIntent 意图路由
       * 后者与接入选择器之前的行为完全一致，所以选 auto 是零行为变化。
       */
      model: homeImageModelId,
      shouldAutoRun,
      createdAt: project.createdAt,
      references: homeReferences.length > 0 ? homeReferences : undefined,
    });
    // 降级路径必须明说。静默丢图会让用户以为参考图已经带过去了，
    // 到画布里才发现没有 —— 而那时候他已经离开首页，无从补救。
    if (handoffResult.droppedReferences && homeReferences.length > 0) {
      toast("参考图未能带入画布", {
        description: "浏览器存储空间不足，请进入画布后重新上传",
      });
    }
    toast("已创建新画布", { description: text.slice(0, 80) });
    navigate(`/project/${project.id}`);
  };

  const handlePreloginSend = () => {
    if (!isAuthenticated || !requestAiAuth()) {
      setPanelMode("login");
      return;
    }
    createProjectFromPrompt();
  };

  const handleAuthAction = async (action: "login" | "register") => {
    if (!email.trim() || !password.trim()) {
      setAuthError("请输入用户名或邮箱和密码");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    const result = action === "register"
      ? await register(email.trim(), password)
      : await login(email.trim(), password);
    setAuthBusy(false);

    if (!result.ok) {
      setAuthError(result.error || "登录失败，请稍后重试");
      return;
    }
    if (action === "login") {
      if (rememberPassword) {
        saveRememberedLoginUsername(email.trim());
        await storeBrowserPasswordCredential(email.trim(), password);
      } else {
        clearRememberedLoginUsername();
      }
    }
    // 从邀请链接来的新用户必须得到明确反馈，否则他不知道邀请到底生效没有 ——
    // 而这件事没有第二次机会：一旦首次付费发生时关系还没建立，
    // 后端会把已付费标记落盘，事后补绑永远拿不到奖励。
    if (action === "register" && landedInviteCode) {
      setLandedInviteCode("");
      toast("注册成功，邀请已生效", {
        description: `完成首次付费（满 HKD ${INVITE_REWARD_CONFIG.minPaidAmountHkd}）后，你将获得 ${INVITE_REWARD_CONFIG.inviteeCredits} 积分`,
      });
      setPanelMode("prelogin");
      return;
    }
    toast(action === "register" ? "注册成功" : "登录成功", { description: "欢迎回到 ArtX Studio" });
    setPanelMode("prelogin");
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleAuthAction("login");
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
    if (!isAuthenticated) setPanelMode("prelogin");
    homeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /*
    未登录入口的唯一分流规则（产品定稿 2026-09-24）：

      还在第一屏  → 右侧内嵌面板切成登录态（用户正看着它，锚点归位）
      已滚出第一屏 → 弹全站通用的居中小弹窗（LoginRegisterDialog）

    ⚠️⚠️⚠️ 为什么必须分流，而不是一律用内嵌面板：
    内嵌面板固定在第一屏右侧。用户滚到灵感推荐区再点登录，面板确实切换了，
    但它在几屏之外——用户什么都看不到，**表现为「点了没反应」且零报错**。

    ⚠️⚠️⚠️ 滚动真值只能取 mainRef.current.scrollTop：
    首页装在 <main class="overflow-y-auto"> 这个内部滚动容器里，
    `window.scrollY` / `document.documentElement.scrollTop` 恒为 0，
    用它判断会永远走「在第一屏」分支——同样零报错，只是规则彻底失效。

    ⚠️ 阈值与 handleMainScroll 的 0.15 对齐：那里把「滚回 0.15 以内」
    视为回到首屏并复位面板。两处用同一个口径，才不会出现
    「面板已被复位成 prelogin，点击却还按已滚走处理」的错位。
  */
  const isHomeHeroVisible = () => {
    const homeHeight = homeRef.current?.offsetHeight || window.innerHeight;
    const scrollTop = mainRef.current?.scrollTop ?? 0;
    return scrollTop <= homeHeight * HOME_HERO_VISIBLE_RATIO;
  };

  /** 未登录时按当前浏览位置选择登录入口形态。已登录的跳转由各调用方自理。 */
  const requestLoginByScrollPosition = () => {
    if (isHomeHeroVisible()) {
      setPanelMode("login");
      return;
    }
    openLoginModal();
  };

  const handleStartExperience = () => {
    if (isAuthenticated) {
      navigate("/workspace");
      return;
    }
    requestLoginByScrollPosition();
  };

  /*
    首充引导 —— 走全站统一的计费浮层，不跳页。

    ⚠️ 首页没有 TopBar，所以这里不能指望「TopBar 那个入口已经改好了」。
    必须显式接到同一个 Provider 上，否则就会出现「右上角点充值是浮层、
    首页点首充是跳页」这种两套行为（零报错，最难被发现）。
  */
  const openFirstTopUpBilling = () => {
    if (isAuthenticated) {
      openBilling("recharge");
      return;
    }

    sessionStorage.setItem(HOME_POST_LOGIN_REDIRECT_STORAGE_KEY, "/billing?tab=recharge");
    setPanelMode("login");
  };

  const showLoginRequiredBubble = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLoginBubble({
      left: rect.left + rect.width / 2,
      top: rect.bottom + 10,
      id: Date.now(),
    });
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
    <div className="flex h-screen flex-col overflow-hidden bg-[#222222]">
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
      <main ref={mainRef} onScroll={handleMainScroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#222222] text-white scroll-smooth">
      <header className={`fixed left-0 right-0 ${isFirstTopUpBannerDismissed ? "top-0" : "top-[80px]"} z-50 flex h-[64px] items-center gap-3 bg-[#222222]/20 px-4 backdrop-blur-[18px] sm:gap-4`}>
        {loginBubble && (
          <div
            key={loginBubble.id}
            className="pointer-events-none fixed z-[70] -translate-x-1/2 rounded-md border border-white/10 bg-[#222222]/90 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
            style={{ left: loginBubble.left, top: loginBubble.top }}
          >
            请先登录
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setCurrentLandingTab("home");
            if (!isAuthenticated) setPanelMode("prelogin");
            navigate("/");
          }}
          className={`${BRAND_LOGO_SIZE} shrink-0 transition-opacity hover:opacity-85`}
          aria-label="ArtXStudio 首页"
        >
          <img
            src={artxStudioLogo}
            alt="ArtXStudio"
            className="block h-full w-full object-contain object-left"
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
          onWorkspace={(event) => {
            if (!isAuthenticated) {
              showLoginRequiredBubble(event);
              return;
            }
            setCurrentLandingTab("workspace");
            navigate("/workspace");
          }}
          onHelp={(event) => {
            if (!isAuthenticated) {
              showLoginRequiredBubble(event);
              return;
            }
            setCurrentLandingTab("help");
            navigate("/help");
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleStartExperience}
            className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[#936CFF] px-4 text-sm font-medium text-white shadow-[0_10px_28px_rgba(147,108,255,0.30)] transition-colors hover:bg-[#8257ff]"
          >
            {isAuthenticated ? "进入工作台" : "开始体验"}
          </button>
        </div>
      </header>
      <section ref={homeRef} className="relative min-h-screen overflow-hidden bg-[#222222]">
        <div
          className="absolute left-1/2 top-1/2 z-10 h-[900px] w-[1600px] origin-center bg-[#222222]"
          style={{ transform: `translate(-50%, -50%) scale(${stageScale})` }}
        >
          <HeroBackdrop />
          <HeroStatement />
          <div className="absolute left-[1001px] top-[117px] h-[726px] w-[472px]">
            <div className={`absolute inset-0 transition-all duration-500 ease-out ${displayedMode === "prelogin" ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"}`}>
              <PreloginPanel
                prompt={prompt}
                promptTouched={promptTouched}
                onPromptChange={value => {
                  setPromptTouched(true);
                  setPrompt(value);
                }}
                onSend={handlePreloginSend}
                imageModelId={homeImageModelId}
                imageModelOptions={homeImageModelOptions}
                onImageModelChange={handleHomeImageModelChange}
                references={homeReferences}
                onReferenceFiles={handleHomeReferenceFiles}
                onRemoveReference={handleRemoveHomeReference}
              />
            </div>
            {shouldRenderAuthPanel && (
              /*
               * 这里不再写 displayedMode === "prelogin" 的隐藏分支：
               * shouldRenderAuthPanel 已经保证收起时整块卸载，那个分支恒不可达。
               * 留着会让人以为"隐藏态仍在 DOM 里"，正是本次要修掉的行为。
               */
              <div className="absolute inset-0 pointer-events-auto translate-y-0 opacity-100 transition-all duration-500 ease-out">
                <LoginPanel
                  mode={displayedMode === "register" ? "register" : "login"}
                  email={email}
                  password={password}
                  rememberPassword={rememberPassword}
                  busy={authBusy}
                  error={authError}
                  onEmailChange={setEmail}
                  onPasswordChange={setPassword}
                  onRememberPasswordChange={setRememberPassword}
                  onSubmit={handleAuthSubmit}
                  onAuthAction={handleAuthAction}
                  onBackToPrompt={() => setPanelMode("prelogin")}
                  inviteCode={landedInviteCode}
                />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={scrollToInspiration}
          className="absolute bottom-5 left-1/2 z-20 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/20 bg-[#222222]/20 text-white/70 backdrop-blur-md transition-all hover:border-white/45 hover:text-white"
          aria-label="滚动到灵感推荐"
        >
          <ChevronDown size={20} />
        </button>
      </section>

      <section ref={inspirationRef} className="min-h-screen bg-[#222222] px-6 py-20 sm:px-10 lg:px-20">
        <div className="mx-auto max-w-[1600px]">
          {/*
            ⚠️ 引导锚点刻意打在标题行而不是外层 section 上：
            section 是 min-h-screen 的满屏容器（实测高 6108px），
            拿它当挖孔目标 = 把整个视口挖空 = 黑色遮罩视觉上完全消失。
          */}
          <div data-tour-id={TOUR_ANCHORS.homeInspirationSection} className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-medium text-[#9370ff]">Inspiration Picks</p>
              <h2 className="text-[34px] font-black leading-tight text-white sm:text-[44px]">灵感推荐</h2>
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
                className="group mb-4 w-full cursor-pointer break-inside-avoid overflow-hidden rounded-md border border-white/10 bg-[#222222] text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-1"
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
                      <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-white/59">{item.field}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/73">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <span className="flex items-center gap-1 text-xs font-medium text-white/69">
                        <PlayCircle size={14} fill="currentColor" strokeWidth={0} />
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
              className="text-sm font-semibold text-[#C5ED47] underline decoration-[#C5ED47]/60 underline-offset-4 transition-colors hover:text-[#D7F877]"
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
            style={{ maxWidth: 980, background: "#222222", border: `1px solid ${homeInspirationBorder}` }}
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
                  background: "rgba(34,34,34,0.88)",
                  border: `1px solid ${homeInspirationBorder}`,
                  backdropFilter: "blur(12px)",
                }}
              >
                <InspirationReactionButton
                  kind="like"
                  size={16}
                  idleColor="oklch(0.73 0.010 270)"
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
                  idleColor="oklch(0.73 0.010 270)"
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
                style={{ background: "rgba(34,34,34,0.88)", border: `1px solid ${homeInspirationBorder}`, color: "oklch(0.88 0.008 270)", backdropFilter: "blur(12px)" }}
                aria-label="复制提示词"
                title="复制提示词"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => setSelectedHomeInspiration(null)}
                className="shrink-0 rounded-[var(--radius-pill)] p-2 transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(34,34,34,0.88)", border: `1px solid ${homeInspirationBorder}`, color: "oklch(0.88 0.008 270)", backdropFilter: "blur(12px)" }}
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
              <div className="bg-[#222222]">
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
                <p className="type-caption leading-5" style={{ color: "oklch(0.73 0.010 270)", letterSpacing: 0, textTransform: "none" }}>{selectedHomeInspiration.description}</p>
                <div className="mt-4 rounded-[var(--radius-md-design)] p-4" style={{ background: "#222222", border: `1px solid ${homeInspirationBorder}` }}>
                  <p className="whitespace-pre-wrap type-caption leading-6" style={{ color: "oklch(0.88 0.008 270)", letterSpacing: 0, textTransform: "none" }}>
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
  onWorkspace,
  onHelp,
}: {
  activeTab: LandingTab;
  onHome: () => void;
  onInspiration: () => void;
  onSkills: () => void;
  onWorkspace: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onHelp: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const navItems = [
    { key: "home" as const, label: "首页", onClick: onHome },
    { key: "inspiration" as const, label: "灵感推荐", onClick: onInspiration },
    { key: "skills" as const, label: "技能商店", onClick: onSkills },
    { key: "workspace" as const, label: "工作台", onClick: onWorkspace },
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
              : "bg-transparent text-white/73 hover:bg-white/8 hover:text-white"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function HeroBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_48%,rgba(54,54,54,0.65),transparent_34%),linear-gradient(135deg,#222222_8%,#2a2a2a_52%,#222222_100%)]" />
      <img
        src={asteroidImage}
        alt=""
        className="absolute left-[-2%] top-0 h-full w-[68%] object-cover opacity-[0.92] mix-blend-screen [mask-image:linear-gradient(90deg,transparent_0%,transparent_14%,rgba(0,0,0,0.42)_22%,#000_32%,#000_100%)]"
      />
      <div className="absolute inset-y-0 left-0 w-[18%] bg-[linear-gradient(90deg,#222222_0%,rgba(34,34,34,0.92)_14%,rgba(34,34,34,0.36)_58%,rgba(34,34,34,0)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,34,34,0.18)_0%,rgba(34,34,34,0.08)_48%,rgba(34,34,34,0.84)_70%,#222222_100%)]" />
      <div className="absolute bottom-0 left-0 h-40 w-[55%] bg-gradient-to-t from-[#222222] to-transparent" />
    </>
  );
}

function HeroStatement() {
  return (
    <div className="absolute inset-0">
      <div className="absolute left-[244px] top-[270px] flex max-w-[510px] gap-5">
        <div className="mt-3 h-[289px] w-[7px] shrink-0 bg-gradient-to-b from-[#7475ff] via-[#4dc1ed] via-30% via-[#fff400] via-55% to-[#ff00b5]" />
        <div>
          <p className="text-[70px] font-black leading-[0.98] tracking-normal text-white">AI</p>
          <h1 className="mt-1 text-[70px] font-black leading-[74px] tracking-normal text-white">
            用魔法勾勒<br />你想象中的<br />世界
          </h1>
        </div>
      </div>
      <p className="absolute left-[208px] top-[782px] text-[24px] leading-7 text-white/41">
        Artificial intelligence drives<br />limitless creativity
      </p>
    </div>
  );
}

function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-[20px] border border-[#454545] bg-[#222222]/70 p-10 shadow-[0_30px_80px_rgba(0,0,0,0.52)] backdrop-blur-[22px]">
      {children}
    </div>
  );
}

function PreloginPanel({
  prompt,
  promptTouched,
  onPromptChange,
  onSend,
  imageModelId,
  imageModelOptions,
  onImageModelChange,
  references,
  onReferenceFiles,
  onRemoveReference,
}: {
  prompt: string;
  promptTouched: boolean;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  imageModelId: string;
  imageModelOptions: AiModelOption[];
  onImageModelChange: (modelId: string) => void;
  references: HomePromptReference[];
  onReferenceFiles: (files: File[]) => void;
  onRemoveReference: (id: string) => void;
}) {
  const animatedPrompt = usePromptTypingAnimation(HOME_PROMPT, promptTouched);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  return (
    <GlassPanel>
      <div className="flex h-full flex-col">
        <PanelHeader />

        <div className="mt-6">
          <p className="mb-2 text-[13px] font-medium text-[#7d7d7d]">试试这些提示</p>
          <div className="flex flex-col gap-[10px]">
            {PROMPT_SUGGESTIONS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => onPromptChange(item)}
                className="h-11 min-w-0 appearance-none overflow-hidden rounded-[10px] border border-[#454545] bg-transparent px-3.5 text-left text-sm text-[#7d7d7d] transition-colors hover:border-white/55 hover:text-white"
              >
                <span className="block min-w-0 truncate whitespace-nowrap">{item}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          data-tour-id={TOUR_ANCHORS.homePromptPanel}
          className="mb-6 mt-6 flex min-h-[282px] flex-1 flex-col justify-between rounded-[10px] border border-[#545454] bg-[#212121] p-4"
        >
          <textarea
            value={promptTouched ? prompt : animatedPrompt}
            onChange={event => onPromptChange(event.target.value)}
            className="h-36 resize-none bg-transparent text-sm leading-[22px] text-white outline-none placeholder:text-[#7d7d7d]"
            placeholder={HOME_PROMPT}
          />
          {references.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {references.map(reference => (
                <div
                  key={reference.id}
                  className="group relative h-12 w-12 overflow-hidden rounded-md border border-[#454545]"
                  title={reference.title}
                >
                  <img
                    src={reference.src}
                    alt={reference.title}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveReference(reference.id)}
                    className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`移除参考图 ${reference.title}`}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex h-10 items-center justify-between">
            <div className="flex items-center gap-4 text-[#7d7d7d]">
              {/*
                * 原本是无 onClick 的空壳按钮，2026-09-15 接上真实上传。
                * 走隐藏 file input 而不是自绘拖拽区 —— 与画布 composer
                * 的上传入口保持同一种交互，用户不需要学两套。
                */}
              <input
                ref={referenceInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => {
                  const files = Array.from(event.target.files || []);
                  // 先清空 value，否则连续两次选同一个文件不会触发 change。
                  event.target.value = "";
                  if (files.length > 0) onReferenceFiles(files);
                }}
              />
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                className="flex h-8 items-center gap-1.5 rounded-md text-xs transition-colors hover:text-white"
              >
                <ImagePlus size={15} />
                添加参考图
              </button>
              <span className="h-4 w-px bg-[#454545]" />
              {/*
                * 这里原本是个写死「图像生成 ⌄」的空壳按钮（无 onClick），
                * 2026-09-15 换成与画布共用的 ModelSelector。
                *
                * ⚠️ 用的是共享组件而非首页自己写一个：模型清单会持续变动
                *（新模型上线、权益调整），两份渲染实现必然对不上。
                *
                * surface 传首页玻璃面板的配色 —— 画布走 isDark 主题变量，
                * 首页是固定深色面板（#212121/#454545），两套色不能混用。
                *
                * 【2026-09-16 按用户要求对齐左边的「添加参考图」按钮】
                * 那个按钮的完整样式只有两条：默认 #7d7d7d、hover 转白，没有底托。
                * 选择器此前 hover 会套一块深色底托、图标还恒为白，
                * 两个并排控件看上去不像同一套控件。现在三处对齐：
                *   · hoverBackground: transparent  → 去掉黑色底托
                *   · hoverText: #ffffff            → hover 文字转白，同参考图按钮
                *   · openBorder: transparent       → 展开时也不描边（原本是紫色高亮）
                * 图标颜色不用单独传：组件内部已让它跟随按钮文字色。
                *
                * placement 改回 up：这一行贴着面板底部，向下弹会被玻璃面板边缘
                * 截断，用户要滚动才看得到后面的模型。向上弹展开在提示词区上方，
                * 整个清单一屏可见。
                */}
              <ModelSelector
                model={imageModelId}
                onChange={onImageModelChange}
                isDark
                models={imageModelOptions}
                placement="up"
                surface={{
                  background: "transparent",
                  border: "transparent",
                  text: "#7d7d7d",
                  hoverBackground: "transparent",
                  hoverText: "#ffffff",
                  openBorder: "transparent",
                }}
                triggerClassName="flex h-8 items-center gap-1.5 rounded-md px-0 text-xs transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={onSend}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#936CFF] text-white shadow-[0_8px_22px_rgba(147,108,255,0.28)] transition-all hover:bg-[#A384FF] active:scale-95"
              aria-label="发送并登录"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

function LoginPanel({
  mode,
  email,
  password,
  rememberPassword,
  busy,
  error,
  onEmailChange,
  onPasswordChange,
  onRememberPasswordChange,
  onSubmit,
  onAuthAction,
  onBackToPrompt,
  inviteCode,
}: {
  mode: "login" | "register";
  email: string;
  password: string;
  rememberPassword: boolean;
  busy: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberPasswordChange: (value: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onAuthAction: (action: "login" | "register") => void | Promise<void>;
  onBackToPrompt: () => void;
  /** 从邀请链接落地时带入，空串表示自然访问。 */
  inviteCode: string;
}) {
  const { forgotPassword, resetPassword } = useAuth();
  const isRegister = mode === "register";
  const [resetMode, setResetMode] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleSendResetCode = async () => {
    const username = resetUsername.trim() || email.trim();
    setResetMessage("");
    if (!username) {
      setResetMessage("请输入注册邮箱或用户名");
      return;
    }
    setResetUsername(username);
    setResetBusy(true);
    const result = await forgotPassword(username);
    setResetBusy(false);
    setResetMessage(result.ok ? result.message || "验证码已发送，请查看邮箱。" : result.error || "验证码发送失败，请稍后重试");
  };

  const handleResetSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = resetUsername.trim() || email.trim();
    const code = resetCode.trim();
    setResetMessage("");
    if (!username || !code || !resetPasswordValue || !resetConfirmPassword) {
      setResetMessage("请填写邮箱、验证码、新密码和确认密码");
      return;
    }
    if (resetPasswordValue !== resetConfirmPassword) {
      setResetMessage("两次输入的新密码不一致");
      return;
    }
    if (resetPasswordValue.length < 8) {
      setResetMessage("新密码至少需要 8 位");
      return;
    }
    setResetBusy(true);
    const result = await resetPassword(username, code, resetPasswordValue);
    setResetBusy(false);
    if (!result.ok) {
      setResetMessage(result.error || "密码重置失败，请稍后重试");
      return;
    }
    setResetCode("");
    setResetPasswordValue("");
    setResetConfirmPassword("");
    setResetMode(false);
    setResetMessage("");
  };

  if (resetMode) {
    return (
      <GlassPanel>
        <form className="flex h-full flex-col" autoComplete="on" onSubmit={handleResetSubmit}>
          <PanelHeader title="找回密码" />

          <div className="mt-8 flex flex-col gap-4">
            <LabeledInput
              label="注册邮箱或用户名"
              value={resetUsername}
              onChange={setResetUsername}
              name="username"
              autoComplete="username"
              placeholder="请输入注册邮箱或用户名"
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <LabeledInput
                label="验证码"
                value={resetCode}
                onChange={value => setResetCode(value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                placeholder="6 位验证码"
              />
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => void handleSendResetCode()}
                className="mt-[25px] h-12 rounded-[10px] border border-white/15 bg-white/8 px-4 text-sm font-semibold text-white transition-all hover:bg-white/12 disabled:opacity-60"
              >
                {resetBusy ? "发送中" : "发送验证码"}
              </button>
            </div>
            <LabeledInput
              label="新密码"
              type="password"
              value={resetPasswordValue}
              onChange={setResetPasswordValue}
              name="new-password"
              autoComplete="new-password"
              placeholder="至少 8 位"
            />
            <LabeledInput
              label="确认新密码"
              type="password"
              value={resetConfirmPassword}
              onChange={setResetConfirmPassword}
              name="confirm-new-password"
              autoComplete="new-password"
              placeholder="再次输入新密码"
            />
          </div>

          <p className={`mt-4 min-h-5 text-left text-[13px] font-medium ${resetMessage ? "text-amber-100" : "text-transparent"}`}>
            {resetMessage || " "}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={resetBusy}
              onClick={() => setResetMode(false)}
              className="h-12 rounded-[10px] border border-white/15 bg-white/8 text-base font-semibold text-white transition-all hover:bg-white/12 disabled:opacity-60"
            >
              返回登录
            </button>
            <button
              type="submit"
              disabled={resetBusy}
              className="h-12 rounded-[10px] bg-[#936CFF] text-base font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.25)] transition-all hover:bg-[#A384FF] disabled:opacity-60"
            >
              {resetBusy ? "重置中..." : "重置密码"}
            </button>
          </div>
        </form>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <form className="flex h-full flex-col" onSubmit={onSubmit} autoComplete="on">
        <PanelHeader title={isRegister ? "创建 ArtX Studio 账号" : "欢迎使用 ArtX Studio"} />

        {/*
          邀请落地提示。
          ⚠️ 刻意**不做成输入框** —— 邀请码已随链接自动带上，
          让用户再抄一遍只会增加出错机会。这里的职责是回答朋友心里
          那两个问题：「谁邀我」和「我能得到什么」，
          并明确告知奖励条件（注册 + 首次付费），避免事后预期落差。
        */}
        {inviteCode && (
          <div className="mt-5 rounded-[12px] border border-[#936CFF]/35 bg-[#936CFF]/12 px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <Gift size={15} className="text-[#C4AEFF]" />
              好友邀请你加入 ArtX Studio
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/70">
              邀请码 <span className="font-mono font-semibold text-[#C4AEFF]">{inviteCode}</span> 已自动填好，无需手动输入。
              注册后完成首次付费（满 HKD {INVITE_REWARD_CONFIG.minPaidAmountHkd}），
              你可得 {INVITE_REWARD_CONFIG.inviteeCredits} 积分，邀请你的好友可得 {INVITE_REWARD_CONFIG.inviterCredits} 积分。
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-5">
          <LabeledInput
            label="用户名或邮箱"
            value={email}
            onChange={onEmailChange}
            name="username"
            id="artx-login-username"
            autoComplete="username"
            placeholder="请输入用户名或邮箱"
          />
          <LabeledInput
            label="密码"
            type="password"
            value={password}
            onChange={onPasswordChange}
            name={isRegister ? "new-password" : "password"}
            id={isRegister ? "artx-register-password" : "artx-login-password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder="请输入密码"
          />
        </div>

        {!isRegister && (
          <div className="mt-3 flex h-5 items-center justify-between gap-3">
            {/*
              ⚠️ 这里的文案必须是「记住账号」。

              勾选后 ArtX **不保存任何密码**，只做两件事：把用户名写进 cookie
              供下次回填，以及调 navigator.credentials.store 把凭据交给浏览器
              自带的密码管理器（见 handleAuthAction）。密码全程由浏览器/系统
              钥匙串保管，ArtX 侧永远拿不到、也不该拿到。

              若把文案写成「记住」+「密码」，用户会预期下次密码自动出现在输入框里，
              而那永远不会发生 —— 这正是 2026-09-13 用户报上来的"bug"，
              根因是文案与行为不一致，不是功能坏了。

              要做到由 ArtX 自己保管凭据，必须先落实安全的存储方案；
              注意项目根 MEMORY.md 明令禁止把明文密码写进 cookie / localStorage。

              ⚠️ 注意：本注释刻意避免出现「记住」紧跟「密码」的完整词组 ——
              HomePage.auth-project.test.ts 用 toContain 扫源码来断言 UI 文案，
              注释里写了那个词会让断言命中注释本身，变成永远为真的假通过。
            */}
            <label
              className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
              title="勾选后下次自动填入账号；密码由浏览器的密码管理器保存，登录时在密码框选择即可"
            >
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={event => onRememberPasswordChange(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[#222] accent-[#936CFF]"
              />
              <span className="truncate text-[13px] font-medium text-white">
                记住账号
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                setResetUsername(email.trim());
                setResetMessage("");
                setResetMode(true);
              }}
              className="shrink-0 appearance-none bg-transparent text-[13px] font-medium text-[#7d7d7d] transition-colors hover:text-white"
            >
              忘记密码？
            </button>
          </div>
        )}

        <p className={`mt-4 h-5 min-w-0 truncate text-left text-[13px] font-medium text-red-300 ${error ? "visible" : "invisible"}`}>
          {error || " "}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAuthAction("register")}
            className="h-12 rounded-[10px] bg-[#2F80ED] text-base font-semibold text-white shadow-[0_10px_28px_rgba(47,128,237,0.24)] transition-all hover:bg-[#4A96FF] disabled:opacity-60"
          >
            {busy ? "请稍候..." : "注 册"}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-[10px] bg-[#936CFF] text-base font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.25)] transition-all hover:bg-[#A384FF] disabled:opacity-60"
          >
            {busy ? "请稍候..." : "登 录"}
          </button>
        </div>

        <p className="mt-5 text-center text-[13px] text-[#7d7d7d]">
          用户名或邮箱注册/登陆
        </p>
      </form>
    </GlassPanel>
  );
}

function usePromptTypingAnimation(text: string, paused: boolean) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    if (paused) return;

    const characters = Array.from(text);
    const cycleDuration = PROMPT_TYPE_DURATION_MS + PROMPT_PAUSE_DURATION_MS;
    const startedAt = Date.now();

    const update = () => {
      const elapsed = (Date.now() - startedAt) % cycleDuration;
      if (elapsed >= PROMPT_TYPE_DURATION_MS) {
        setDisplayedText(text);
        return;
      }

      const visibleCount = Math.floor((elapsed / PROMPT_TYPE_DURATION_MS) * characters.length);
      setDisplayedText(characters.slice(0, visibleCount).join(""));
    };

    update();
    const intervalId = window.setInterval(update, PROMPT_FRAME_MS);
    return () => window.clearInterval(intervalId);
  }, [paused, text]);

  return paused ? text : displayedText;
}

function PanelHeader({
  title = "欢迎使用 ArtX Studio",
}: {
  title?: string;
}) {
  return (
    <div>
      <h2 className="text-[26px] font-bold leading-[31px] text-white">{title}</h2>
      <p className="mt-5 text-sm text-[#86868b]">用AI打开你的创意世界之门</p>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  name,
  id,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  name?: string;
  id?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[13px] font-medium text-white">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        name={name}
        autoComplete={autoComplete}
        className="h-[46px] w-full rounded-[10px] border border-[#545454] bg-[#222] px-3.5 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-[#7d7d7d] focus:border-[#936CFF] focus:shadow-[0_0_0_3px_rgba(147,108,255,0.22)]"
      />
    </label>
  );
}
