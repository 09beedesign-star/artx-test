import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronDown,
  ImagePlus,
  LogOut,
  Send,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import asteroidImage from "@/assets/ardot/3_3.png";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import promptCsv from "@/data/ai_image_prompt_rank_50.csv?raw";
import { createWorkspaceHistoryProject } from "@/lib/project-history";
import { requestAiAuth } from "@/lib/ai";

const PROMPT_SUGGESTIONS = [
  "帮我生成一张赛博朋克风格插画",
  "设计一个极简主义Logo",
  "把这张照片变成水彩画风格",
];

const HOME_PROMPT = "hello，欢迎来到。ArtX,正式开启你的。灵感AI创意之旅吧！";

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

type PanelMode = "prelogin" | "login" | "register";
type LandingTab = "home" | "inspiration" | "skills" | "workspace" | "help";
type HomePromptItem = {
  rank: number;
  field: string;
  title: string;
  description: string;
  imageUrl: string;
  author: string;
};

function parsePromptCsv(csv: string) {
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

function loadHomePromptItems(csv: string): HomePromptItem[] {
  const rows = parsePromptCsv(csv.replace(/^\uFEFF/, ""));
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

const HOME_PROMPT_ITEMS = loadHomePromptItems(promptCsv);

const getStageScale = () => {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / 1600, window.innerHeight / 900);
};

function getBillingApiBaseUrl() {
  const configured = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_AUTH_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return "https://artx-test.onrender.com";
  }
  return "";
}

function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

async function fetchBillingSummary(): Promise<{ balance?: number }> {
  const token = getAuthToken();
  const response = await fetch(`${getBillingApiBaseUrl()}/api/billing/summary`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) return {};
  return response.json().catch(() => ({}));
}

export default function HomePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user, login, register, logout } = useAuth();
  const [panelMode, setPanelMode] = useState<PanelMode>(isAuthenticated ? "prelogin" : "prelogin");
  const [prompt, setPrompt] = useState(HOME_PROMPT);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [credits, setCredits] = useState(0);
  const [stageScale, setStageScale] = useState(getStageScale);
  const [activeTab, setActiveTab] = useState<LandingTab>("home");
  const homeRef = useRef<HTMLElement>(null);
  const inspirationRef = useRef<HTMLElement>(null);

  const displayName = user?.username || "用户名";
  const avatarLetter = displayName.trim().slice(0, 1).toUpperCase() || "U";
  const avatarColor = useMemo(() => {
    const seed = displayName.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return AVATAR_COLORS[seed % AVATAR_COLORS.length];
  }, [displayName]);

  useEffect(() => {
    if (isAuthenticated) setPanelMode("prelogin");
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCredits(0);
      return;
    }
    fetchBillingSummary()
      .then(result => {
        if (typeof result.balance === "number") setCredits(result.balance);
      })
      .catch(() => {});
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
        if (visibleSection) setActiveTab(visibleSection.tab);
      },
      { threshold: [0.45, 0.65] },
    );

    sections.forEach(section => {
      if (section.ref.current) observer.observe(section.ref.current);
    });
    return () => observer.disconnect();
  }, []);

  const displayedMode = isAuthenticated ? "prelogin" : panelMode;

  const createProjectFromPrompt = () => {
    const text = prompt.trim() || HOME_PROMPT;
    const title = text.length > 18 ? `${text.slice(0, 18)}...` : text;
    const project = createWorkspaceHistoryProject(title || undefined, text);
    sessionStorage.setItem("artx:pending-home-prompt", JSON.stringify({
      projectId: project.id,
      prompt: text,
      model: "auto",
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
      setAuthError("请输入邮箱或 ID 和密码");
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
    setActiveTab("inspiration");
    inspirationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToHome = () => {
    setActiveTab("home");
    homeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleStartExperience = () => {
    if (isAuthenticated) {
      navigate("/workspace");
      return;
    }
    setPanelMode("login");
  };

  return (
    <main className="h-screen overflow-y-auto bg-black text-white scroll-smooth">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-[64px] items-center gap-3 bg-black/20 px-4 backdrop-blur-[18px] sm:gap-4 sm:px-8 lg:px-20">
        <button
          type="button"
          onClick={() => {
            setActiveTab("home");
            navigate("/");
          }}
          className="h-9 w-[194px] shrink-0 transition-opacity hover:opacity-85"
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
            setActiveTab("skills");
            navigate("/skills");
          }}
          onWorkspace={() => {
            setActiveTab("workspace");
            navigate("/workspace");
          }}
          onHelp={() => {
            setActiveTab("help");
            navigate("/help");
          }}
        />
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2">
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={handleStartExperience}
              className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[#936CFF] px-4 text-sm font-medium text-white shadow-[0_10px_28px_rgba(147,108,255,0.30)] transition-colors hover:bg-[#8257ff]"
            >
              开始体验
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/workspace")}
                className="h-10 shrink-0 whitespace-nowrap rounded-md bg-[#936CFF] px-4 text-sm font-medium text-white shadow-[0_10px_28px_rgba(147,108,255,0.30)] transition-colors hover:bg-[#8257ff]"
              >
                进入工作台
              </button>
              <div className="flex h-10 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.06] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <button
                  type="button"
                  onClick={() => navigate("/billing?tab=recharge")}
                  className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-white/88 transition-colors hover:bg-white/[0.08]"
                  title="查看积分与充值"
                >
                  <Sparkles size={13} className="text-[#B48CFF]" />
                  <span>{credits.toLocaleString("zh-HK")}</span>
                  <span className="text-white/48">积分</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/billing?tab=subscription")}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-[#C5ED47] px-2.5 text-xs font-semibold text-[#17210d] shadow-[0_8px_22px_rgba(197,237,71,0.16)] transition-transform active:scale-95"
                  title="进入订阅、充值与升级"
                >
                  <Zap size={13} />
                  <span>升级</span>
                </button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-10 items-center gap-2 rounded-md px-2 text-white outline-none transition-colors hover:bg-white/[0.08]"
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: avatarColor }}
                    >
                      {avatarLetter}
                    </span>
                    <span className="hidden max-w-[120px] truncate text-xs font-medium text-white/88 lg:block">{displayName}</span>
                    <ChevronDown size={12} className="text-white/45" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="min-w-[150px] border-white/12 bg-[#24222a] text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
                >
                  <DropdownMenuItem
                    onClick={() => navigate("/profile")}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-white/86 focus:bg-white/[0.08] focus:text-white"
                  >
                    <UserRound size={13} className="text-white/48" />
                    <span>个人主页</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={() => {
                      logout();
                      navigate("/");
                    }}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs text-[#ff8f7f] focus:bg-white/[0.08] focus:text-[#ff8f7f]"
                  >
                    <LogOut size={13} />
                    <span>退出</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>
      <section ref={homeRef} className="relative min-h-screen overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 z-10 h-[900px] w-[1600px] origin-center"
          style={{ transform: `translate(-50%, -50%) scale(${stageScale})` }}
        >
          <HeroBackdrop />
          <HeroStatement />
          <div className="absolute left-[1001px] top-[117px] h-[726px] w-[472px]">
            <div className={`absolute inset-0 transition-all duration-500 ease-out ${displayedMode === "prelogin" ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"}`}>
              <PreloginPanel
                prompt={prompt}
                onPromptChange={setPrompt}
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
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={scrollToInspiration}
          className="absolute bottom-5 left-1/2 z-20 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/20 bg-black/20 text-white/70 backdrop-blur-md transition-all hover:border-white/45 hover:text-white"
          aria-label="滚动到灵感选题"
        >
          <ChevronDown size={20} />
        </button>
      </section>

      <section ref={inspirationRef} className="min-h-screen bg-[#080808] px-6 py-20 sm:px-10 lg:px-20">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-medium text-[#9370ff]">Inspiration Topics</p>
              <h2 className="text-[34px] font-black leading-tight text-white sm:text-[44px]">灵感选题</h2>
            </div>
            <p className="max-w-[420px] text-sm leading-6 text-white/45">
              50 组热门图片提示词选题，按真实案例封面快速浏览创作方向。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {HOME_PROMPT_ITEMS.map(item => (
              <button
                key={`${item.rank}-${item.title}`}
                type="button"
                onClick={() => navigate("/inspiration")}
                className="group overflow-hidden rounded-md border border-white/10 bg-[#151515] text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-1"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-black">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="relative z-10 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center bg-[linear-gradient(135deg,#33224e,#173246)]">
                    <span className="text-xs leading-5 text-white/76">图片待同步</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                  <span className="absolute left-3 top-3 z-20 rounded-full bg-black/48 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                    #{item.rank}
                  </span>
                </div>
                <div className="p-4">
                  <div className="mb-3 flex min-w-0 items-center gap-2">
                    <span className="min-w-0 max-w-[58%] truncate whitespace-nowrap rounded-full bg-[#936CFF]/18 px-2.5 py-1 text-xs font-medium text-[#c9b8ff]">
                      {item.field}
                    </span>
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap text-xs text-white/45">
                      {item.author}
                    </span>
                  </div>
                  <p className="truncate whitespace-nowrap text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 truncate whitespace-nowrap text-xs text-white/42">{item.description}</p>
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
  onWorkspace: () => void;
  onHelp: () => void;
}) {
  const navItems = [
    { key: "home" as const, label: "首页", onClick: onHome },
    { key: "inspiration" as const, label: "灵感选题", onClick: onInspiration },
    { key: "skills" as const, label: "技能商店", onClick: onSkills },
    { key: "workspace" as const, label: "工作台", onClick: onWorkspace },
    { key: "help" as const, label: "帮助与反馈", onClick: onHelp },
  ];

  return (
    <nav className="ml-auto flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:gap-3 lg:absolute lg:left-1/2 lg:top-1/2 lg:z-0 lg:ml-0 lg:flex-none lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-visible" aria-label="首页导航">
      {navItems.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className={`h-9 shrink-0 appearance-none rounded-md px-3 text-center text-xs font-medium transition-colors sm:min-w-[82px] sm:text-sm ${
            activeTab === item.key
              ? "bg-[#936CFF] text-white shadow-[0_8px_20px_rgba(147,108,255,0.28)]"
              : "bg-transparent text-white/62 hover:bg-white/8 hover:text-white"
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_48%,rgba(54,54,54,0.65),transparent_34%),linear-gradient(135deg,#000_8%,#111_52%,#000_100%)]" />
      <img
        src={asteroidImage}
        alt=""
        className="absolute left-[-2%] top-0 h-full w-[68%] object-cover opacity-[0.92] mix-blend-screen"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.08)_48%,rgba(0,0,0,0.84)_70%,#000_100%)]" />
      <div className="absolute bottom-0 left-0 h-40 w-[55%] bg-gradient-to-t from-black to-transparent" />
    </>
  );
}

function HeroStatement() {
  return (
    <div className="absolute inset-0">
      <div className="absolute left-[215px] top-[80px] h-[672px] w-px bg-white/10" />
      <div className="absolute left-[215px] top-[752px] h-[300px] w-px origin-top rotate-[28deg] bg-white/10" />
      <div className="absolute left-[180px] top-[735px] h-[70px] w-[70px] rounded-full border border-white/45">
        <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
      <div className="absolute left-[244px] top-[270px] flex max-w-[510px] gap-5">
        <div className="mt-3 h-[289px] w-[7px] shrink-0 bg-gradient-to-b from-[#7475ff] via-[#4dc1ed] via-30% via-[#fff400] via-55% to-[#ff00b5]" />
        <div>
          <p className="text-[70px] font-black leading-[0.98] tracking-normal text-white">AI</p>
          <h1 className="mt-1 text-[70px] font-black leading-[74px] tracking-normal text-white">
            用魔法勾勒<br />你想象中的<br />世界
          </h1>
        </div>
      </div>
      <p className="absolute left-[208px] top-[782px] text-[24px] leading-7 text-white/16">
        Artificial intelligence drives<br />limitless creativity
      </p>
    </div>
  );
}

function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-[20px] border border-[#454545] bg-[#1c1c1c]/70 p-10 shadow-[0_30px_80px_rgba(0,0,0,0.52)] backdrop-blur-[22px]">
      {children}
    </div>
  );
}

function PreloginPanel({
  prompt,
  onPromptChange,
  onSend,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
}) {
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
            value={prompt}
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
}) {
  const isRegister = mode === "register";

  return (
    <GlassPanel>
      <form className="flex h-full flex-col" onSubmit={onSubmit}>
        <PanelHeader title={isRegister ? "创建 ArtX Studio 账号" : "欢迎使用 ArtX Studio"} />

        <div className="mt-8 flex flex-col gap-5">
          <LabeledInput
            label="邮箱或 ID"
            value={email}
            onChange={onEmailChange}
            autoComplete="username"
            placeholder="请输入邮箱或 ID"
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
          注册支持邮箱或 ID；已有密码账号可直接登录。
        </p>
      </form>
    </GlassPanel>
  );
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
