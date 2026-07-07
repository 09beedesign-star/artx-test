import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronDown,
  Heart,
  ImagePlus,
  PlayCircle,
  Send,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import asteroidImage from "@/assets/ardot/3_3.png";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import promptCsv from "@/data/ai_image_prompt_rank_50.csv?raw";
import { createWorkspaceHistoryProject } from "@/lib/project-history";
import { requestAiAuth } from "@/lib/ai";

type InspirationRecommendation = {
  rank: number;
  field: string;
  title: string;
  description: string;
  imageUrl: string;
  author: string;
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
      imageUrl: get(record, "image_url"),
      author: get(record, "author"),
    }))
    .filter((item) => item.title && item.imageUrl);
}

const INSPIRATION_RECOMMENDATIONS = loadInspirationRecommendations(promptCsv);
const BRAND_LOGO_SIZE = "h-[20px] w-[109px]";

const PROMPT_SUGGESTIONS = [
  "帮我生成一张赛博朋克风格插画",
  "设计一个极简主义Logo",
  "把这张照片变成水彩画风格",
];

const HOME_PROMPT = "hello，欢迎来到。ArtX,正式开启你的。灵感AI创意之旅吧！";
const HOME_AUTH_PANEL_STORAGE_KEY = "artx:home-auth-panel";
const PROMPT_TYPE_DURATION_MS = 5000;
const PROMPT_PAUSE_DURATION_MS = 3000;
const PROMPT_FRAME_MS = 80;

type PanelMode = "prelogin" | "login" | "register";
type LandingTab = "home" | "inspiration" | "skills" | "workspace" | "help";
type LoginBubble = { left: number; top: number; id: number } | null;

const getStageScale = () => {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / 1600, window.innerHeight / 900);
};

export default function HomePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, login, register } = useAuth();
  const [panelMode, setPanelMode] = useState<PanelMode>(isAuthenticated ? "prelogin" : "prelogin");
  const [prompt, setPrompt] = useState(HOME_PROMPT);
  const [promptTouched, setPromptTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [stageScale, setStageScale] = useState(getStageScale);
  const [activeTab, setActiveTab] = useState<LandingTab>("home");
  const [loginBubble, setLoginBubble] = useState<LoginBubble>(null);
  const activeTabRef = useRef<LandingTab>("home");
  const hasReachedInspirationRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const homeRef = useRef<HTMLElement>(null);
  const inspirationRef = useRef<HTMLElement>(null);

  const setCurrentLandingTab = (tab: LandingTab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  };

  useEffect(() => {
    if (isAuthenticated) setPanelMode("prelogin");
  }, [isAuthenticated]);

  useEffect(() => {
    if (!loginBubble) return;
    const timer = window.setTimeout(() => setLoginBubble(null), 1800);
    return () => window.clearTimeout(timer);
  }, [loginBubble]);

  useEffect(() => {
    const requestedPanel = sessionStorage.getItem(HOME_AUTH_PANEL_STORAGE_KEY);
    if (requestedPanel !== "login" && requestedPanel !== "register") return;
    sessionStorage.removeItem(HOME_AUTH_PANEL_STORAGE_KEY);
    setCurrentLandingTab("home");
    setPanelMode(requestedPanel);
    homeRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, []);

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
    toast(action === "register" ? "注册成功" : "登录成功", { description: "欢迎回到 ArtX Studio" });
    createProjectFromPrompt();
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleAuthAction("login");
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

  const showLoginRequiredBubble = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLoginBubble({
      left: rect.left + rect.width / 2,
      top: rect.bottom + 10,
      id: Date.now(),
    });
  };

  return (
    <main ref={mainRef} onScroll={handleMainScroll} className="h-screen overflow-x-hidden overflow-y-auto bg-[#222222] text-white scroll-smooth">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-[64px] items-center gap-3 bg-[#222222]/20 px-4 backdrop-blur-[18px] sm:gap-4">
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
            <div className={`absolute inset-0 transition-all duration-500 ease-out ${displayedMode === "prelogin" ? "pointer-events-none opacity-0 -translate-y-3" : "pointer-events-auto opacity-100 translate-y-0"}`}>
              <LoginPanel
                mode={displayedMode === "register" ? "register" : "login"}
                email={email}
                password={password}
                busy={authBusy}
                error={authError}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onSubmit={handleAuthSubmit}
                onAuthAction={handleAuthAction}
                onBackToPrompt={() => setPanelMode("prelogin")}
              />
            </div>
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
            {INSPIRATION_RECOMMENDATIONS.map(item => (
              <button
                key={`${item.rank}-${item.title}`}
                type="button"
                onClick={() => navigate("/inspiration")}
                className="group mb-4 w-full break-inside-avoid overflow-hidden rounded-md border border-white/10 bg-[#222222] text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-1"
              >
                <div className="relative overflow-hidden">
                  <img src={item.imageUrl} alt={item.title} className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                  <span className="absolute left-3 top-3 rounded-full bg-[#222222]/48 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                    #{item.rank}
                  </span>
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f7d795] to-[#d98261] text-xs font-bold text-[#28160c]">
                      EW
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{item.author || "ArtX"}</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-white/69">
                      <PlayCircle size={14} fill="currentColor" strokeWidth={0} />
                      {Math.max(1200, item.rank * 137)}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-white/69">
                      <Heart size={14} fill="currentColor" strokeWidth={0} />
                      {Math.max(88, item.rank * 9)}
                    </span>
                  </div>
                  <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-white/59">{item.field}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/73">{item.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
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
  busy,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onAuthAction,
  onBackToPrompt,
}: {
  mode: "login" | "register";
  email: string;
  password: string;
  busy: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onAuthAction: (action: "login" | "register") => void | Promise<void>;
  onBackToPrompt: () => void;
}) {
  const isRegister = mode === "register";

  return (
    <GlassPanel>
      <form className="flex h-full flex-col" onSubmit={onSubmit}>
        <PanelHeader title={isRegister ? "创建 ArtX Studio 账号" : "欢迎使用 ArtX Studio"} />

        <div className="mt-8 flex flex-col gap-5">
          <LabeledInput
            label="用户名或邮箱"
            value={email}
            onChange={onEmailChange}
            autoComplete="username"
            placeholder="请输入用户名或邮箱"
          />
          <LabeledInput
            label="密码"
            type="password"
            value={password}
            onChange={onPasswordChange}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder="请输入密码"
          />
        </div>

        <div className="mt-4 flex h-5 items-center justify-between gap-3">
          <p className={`min-w-0 flex-1 truncate text-left text-[13px] font-medium text-red-300 ${error ? "visible" : "invisible"}`}>
            {error || " "}
          </p>
          <button type="button" className="shrink-0 appearance-none bg-transparent text-[13px] font-medium text-[#7d7d7d] transition-colors hover:text-white">
            忘记密码？
          </button>
        </div>

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
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-white">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-[46px] w-full rounded-[10px] border border-[#545454] bg-[#222] px-3.5 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-[#7d7d7d] focus:border-[#936CFF] focus:shadow-[0_0_0_3px_rgba(147,108,255,0.22)]"
      />
    </label>
  );
}
