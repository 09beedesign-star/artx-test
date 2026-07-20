import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  Heart,
  ImagePlus,
  PlayCircle,
  Send,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import asteroidImage from "@/assets/ardot/3_3.png";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import HomeFirstTopUpBanner, {
  dismissFirstTopUpBannerForToday,
  isFirstTopUpBannerDismissedToday,
} from "@/components/home/HomeFirstTopUpBanner";
import promptCsv from "@/data/ai_image_prompt_rank_50.csv?raw";
import { createWorkspaceHistoryProject } from "@/lib/project-history";
import { requestAiAuth } from "@/lib/ai";

type InspirationRecommendation = {
  rank: number;
  field: string;
  title: string;
  description: string;
  prompt: string;
  imageUrl: string;
  author: string;
};

type HomeInspirationItem = InspirationRecommendation & {
  viewCount: number;
  likeCount: number;
};

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuote) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuote = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function loadInspirationRecommendations(csv: string): InspirationRecommendation[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = rows[0] ?? [];
  const get = (record: string[], key: string) => record[header.indexOf(key)]?.trim() ?? "";

  return rows
    .slice(1)
    .filter((record) => record.length > 1)
    .map((record) => ({
      rank: Number(get(record, "rank")) || 0,
      field: get(record, "field"),
      title: get(record, "title"),
      description: get(record, "description"),
      prompt: get(record, "prompt"),
      imageUrl: get(record, "image_url"),
      author: get(record, "author"),
    }))
    .filter((item) => item.title && item.imageUrl);
}

const INSPIRATION_RECOMMENDATIONS = loadInspirationRecommendations(promptCsv);
const BRAND_LOGO_SIZE = "h-[20px] w-[109px]";
const HOME_INSPIRATION_MIN_METRIC = 1000;
const HOME_INSPIRATION_MAX_METRIC = 10000;

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

function randomInspirationMetric() {
  return Math.floor(
    HOME_INSPIRATION_MIN_METRIC +
      Math.random() * (HOME_INSPIRATION_MAX_METRIC - HOME_INSPIRATION_MIN_METRIC + 1)
  );
}

function shuffleInspirationRecommendations(items: InspirationRecommendation[]) {
  return [...items]
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function createHomeInspirationFeed(): HomeInspirationItem[] {
  return shuffleInspirationRecommendations(INSPIRATION_RECOMMENDATIONS).map(item => ({
    ...item,
    viewCount: randomInspirationMetric(),
    likeCount: randomInspirationMetric(),
  }));
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

export default function HomePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, login, register } = useAuth();
  const [panelMode, setPanelMode] = useState<PanelMode>(isAuthenticated ? "prelogin" : "prelogin");
  const [prompt, setPrompt] = useState(HOME_PROMPT);
  const [promptTouched, setPromptTouched] = useState(false);
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
  const [homeInspirationItems, setHomeInspirationItems] = useState(createHomeInspirationFeed);
  const [selectedHomeInspiration, setSelectedHomeInspiration] = useState<HomeInspirationItem | null>(null);
  const [homeInspirationImageHeight, setHomeInspirationImageHeight] = useState<number | null>(null);
  const [isFirstTopUpBannerDismissed, setIsFirstTopUpBannerDismissed] = useState(
    isFirstTopUpBannerDismissedToday,
  );
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
    setHomeInspirationItems(createHomeInspirationFeed());
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
    navigate(redirectPath);
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!loginBubble) return;
    const timer = window.setTimeout(() => setLoginBubble(null), 1800);
    return () => window.clearTimeout(timer);
  }, [loginBubble]);

  useEffect(() => {
    const requestedPanel = sessionStorage.getItem(HOME_AUTH_PANEL_STORAGE_KEY);
    if (requestedPanel !== "login" && requestedPanel !== "register") return;
    sessionStorage.removeItem(HOME_AUTH_PANEL_STORAGE_KEY);
    if (isAuthenticated) return;
    setCurrentLandingTab("home");
    setPanelMode(requestedPanel);
    homeRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
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

  const shouldRenderAuthPanel = !isAuthenticated;
  const displayedMode = isAuthenticated ? "prelogin" : panelMode;

  const handleMainScroll = () => {
    const main = mainRef.current;
    const homeHeight = homeRef.current?.offsetHeight || window.innerHeight;
    const scrollTop = main?.scrollTop ?? 0;

    if (scrollTop >= homeHeight * 0.55) {
      hasReachedInspirationRef.current = true;
    }

    if (!isAuthenticated && hasReachedInspirationRef.current && scrollTop <= homeHeight * 0.15) {
      setPanelMode("prelogin");
      hasReachedInspirationRef.current = false;
    }
  };

  const createProjectFromPrompt = () => {
    const text = prompt.trim() || HOME_PROMPT;
    const shouldAutoRun = promptTouched && text !== HOME_PROMPT;
    const title = text.length > 18 ? `${text.slice(0, 18)}...` : text;
    const project = createWorkspaceHistoryProject(title || undefined, text);
    sessionStorage.setItem("artx:pending-home-prompt", JSON.stringify({
      projectId: project.id,
      prompt: text,
      model: "auto",
      shouldAutoRun,
      createdAt: project.createdAt,
    }));
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

  const scrollToHome = () => {
    setCurrentLandingTab("home");
    if (!isAuthenticated) setPanelMode("prelogin");
    homeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleStartExperience = () => {
    if (isAuthenticated) {
      navigate("/workspace");
      return;
    }
    setPanelMode("login");
  };

  const openFirstTopUpBilling = () => {
    if (isAuthenticated) {
      navigate("/billing?tab=recharge");
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#222222]">
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
      <header className={`fixed left-0 right-0 ${isFirstTopUpBannerDismissed ? "top-0" : "top-[90px]"} z-50 flex h-[64px] items-center gap-3 bg-[#222222]/20 px-4 backdrop-blur-[18px] sm:gap-4`}>
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
              />
            </div>
            {shouldRenderAuthPanel && (
              <div className={`absolute inset-0 transition-all duration-500 ease-out ${displayedMode === "prelogin" ? "pointer-events-none opacity-0 -translate-y-3" : "pointer-events-auto opacity-100 translate-y-0"}`}>
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
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-medium text-[#9370ff]">Inspiration Picks</p>
              <h2 className="text-[34px] font-black leading-tight text-white sm:text-[44px]">灵感推荐</h2>
            </div>
          </div>

          <div className="columns-1 gap-4 md:columns-2 xl:columns-4">
            {homeInspirationItems.map(item => (
              <button
                key={`${item.rank}-${item.title}`}
                type="button"
                onClick={() => setSelectedHomeInspiration(item)}
                className="group mb-4 w-full break-inside-avoid overflow-hidden rounded-md border border-white/10 bg-[#222222] text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-1"
              >
                <div className="relative overflow-hidden">
                  <img src={item.imageUrl} alt={item.title} className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
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
                      <span className="flex items-center gap-1 text-xs font-medium text-white/69">
                        <Heart size={14} fill="currentColor" strokeWidth={0} />
                        {item.likeCount}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      {selectedHomeInspiration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ background: "rgba(34,34,34,0.72)", backdropFilter: "blur(10px)" }} onClick={() => setSelectedHomeInspiration(null)}>
          <section
            className="relative max-h-full w-full overflow-hidden rounded-[var(--radius-lg-design)]"
            style={{ maxWidth: 980, background: "#222222", border: `1px solid ${homeInspirationBorder}` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute right-3 top-3 z-10 flex items-center" style={{ gap: 16 }}>
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
}: {
  prompt: string;
  promptTouched: boolean;
  onPromptChange: (value: string) => void;
  onSend: () => void;
}) {
  const animatedPrompt = usePromptTypingAnimation(HOME_PROMPT, promptTouched);

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

        <div className="mb-6 mt-6 flex min-h-[282px] flex-1 flex-col justify-between rounded-[10px] border border-[#545454] bg-[#212121] p-4">
          <textarea
            value={promptTouched ? prompt : animatedPrompt}
            onChange={event => onPromptChange(event.target.value)}
            className="h-36 resize-none bg-transparent text-sm leading-[22px] text-white outline-none placeholder:text-[#7d7d7d]"
            placeholder={HOME_PROMPT}
          />
          <div className="flex h-10 items-center justify-between">
            <div className="flex items-center gap-4 text-[#7d7d7d]">
              <button type="button" className="flex h-8 items-center gap-1.5 rounded-md text-xs transition-colors hover:text-white">
                <ImagePlus size={15} />
                添加参考图
              </button>
              <span className="h-4 w-px bg-[#454545]" />
              <button type="button" className="flex h-8 items-center gap-1 rounded-md text-xs transition-colors hover:text-white">
                图像生成
                <ChevronDown size={14} />
              </button>
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
            <label className="flex min-w-0 cursor-pointer items-center gap-2 text-left">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={event => onRememberPasswordChange(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[#222] accent-[#936CFF]"
              />
              <span className="truncate text-[13px] font-medium text-white">
                记住密码
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
