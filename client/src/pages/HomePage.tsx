import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronDown,
  Github,
  Heart,
  ImagePlus,
  Mail,
  MessageCircle,
  PlayCircle,
  Send,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import asteroidImage from "@/assets/ardot/3_3.png";
import artxStudioLogo from "@/assets/brand/artxstudio-logo.png";
import { BRAND_KIT, POSTER_1, POSTER_2, SOCIAL_AD } from "@/lib/workspace-data";
import { createWorkspaceHistoryProject } from "@/lib/project-history";

const COMMUNITY_PROJECTS = [
  { id: "community-1", title: "未来跑鞋视觉实验", updatedAt: "社区精选", cover: POSTER_2, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-2", title: "咖啡品牌灵感板", updatedAt: "用户作品", cover: BRAND_KIT, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-3", title: "城市户外广告片", updatedAt: "社区精选", cover: POSTER_1, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-4", title: "智能设备发布海报", updatedAt: "用户作品", cover: SOCIAL_AD, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-5", title: "潮流服饰大片", updatedAt: "灵感推荐", cover: POSTER_1, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-6", title: "新消费包装系统", updatedAt: "社区精选", cover: BRAND_KIT, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-7", title: "运动科技主视觉", updatedAt: "用户作品", cover: POSTER_2, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-8", title: "社媒营销创意图", updatedAt: "灵感推荐", cover: SOCIAL_AD, author: "Emma_Wilson", plays: "4478", likes: "125" },
];

const PROMPT_SUGGESTIONS = [
  "帮我生成一张赛博朋克风格插画",
  "设计一个极简主义Logo",
  "把这张照片变成水彩画风格",
];

const HOME_PROMPT = "hello，欢迎来到。ArtX,正式开启你的。灵感AI创意之旅吧！";

type PanelMode = "prelogin" | "login" | "register";
type LandingTab = "home" | "inspiration" | "skills" | "workspace" | "help";

const getStageScale = () => {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / 1600, window.innerHeight / 900);
};

export default function HomePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, login, register, socialAuth } = useAuth();
  const [panelMode, setPanelMode] = useState<PanelMode>(isAuthenticated ? "prelogin" : "prelogin");
  const [prompt, setPrompt] = useState(HOME_PROMPT);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [stageScale, setStageScale] = useState(getStageScale);
  const [activeTab, setActiveTab] = useState<LandingTab>("home");
  const homeRef = useRef<HTMLElement>(null);
  const inspirationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isAuthenticated) setPanelMode("prelogin");
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
      model: "artx-image-v1",
      createdAt: project.createdAt,
    }));
    toast("已创建新画布", { description: text.slice(0, 80) });
    navigate(`/project/${project.id}`);
  };

  const handlePreloginSend = () => {
    if (isAuthenticated) {
      createProjectFromPrompt();
      return;
    }
    setPanelMode("login");
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError("请输入邮箱和密码");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    const result = displayedMode === "register"
      ? await register(email.trim(), password)
      : await login(email.trim(), password);
    setAuthBusy(false);

    if (!result.ok) {
      setAuthError(result.error || "登录失败，请稍后重试");
      return;
    }
    toast(displayedMode === "register" ? "注册成功" : "登录成功", { description: "欢迎回到 ArtX Studio" });
    createProjectFromPrompt();
  };

  const handleSocialAuth = async (provider: "google" | "wechat" | "apple" | "github" | "meta") => {
    setAuthBusy(true);
    setAuthError("");
    const result = await socialAuth(provider);
    setAuthBusy(false);
    if (!result.ok) {
      setAuthError(result.error || "第三方登录暂时不可用");
      return;
    }
    toast("登录成功", { description: "欢迎回到 ArtX Studio" });
  };

  const scrollToInspiration = () => {
    setActiveTab("inspiration");
    inspirationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToHome = () => {
    setActiveTab("home");
    homeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="h-screen overflow-y-auto bg-black text-white scroll-smooth">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-[64px] items-center gap-4 bg-black/20 px-4 backdrop-blur-[18px] sm:px-8 lg:px-20">
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
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="ml-auto h-10 rounded-md border border-[#936CFF] bg-transparent px-4 text-sm font-medium text-[#936CFF] transition-colors hover:bg-[#936CFF] hover:text-white"
          >
            进入工作台
          </button>
        )}
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
                onModeChange={setPanelMode}
                onSocialAuth={handleSocialAuth}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={scrollToInspiration}
          className="absolute bottom-5 left-1/2 z-20 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/20 bg-black/20 text-white/70 backdrop-blur-md transition-all hover:border-white/45 hover:text-white"
          aria-label="滚动到灵感发现"
        >
          <ChevronDown size={20} />
        </button>
      </section>

      <section ref={inspirationRef} className="min-h-screen bg-[#080808] px-6 py-20 sm:px-10 lg:px-20">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-sm font-medium text-[#9370ff]">Inspiration Source</p>
              <h2 className="text-[34px] font-black leading-tight text-white sm:text-[44px]">灵感来源</h2>
            </div>
            <p className="max-w-[420px] text-sm leading-6 text-white/45">
              从社区作品、品牌视觉和社媒创意中快速找到方向，登录后可直接创建为你的新画布。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COMMUNITY_PROJECTS.map(project => (
              <button
                key={project.id}
                type="button"
                onClick={() => navigate(`/project/${project.id}`)}
                className="group overflow-hidden rounded-md border border-white/10 bg-[#151515] text-left shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-1"
              >
                <div className="relative aspect-video overflow-hidden">
                  <img src={project.cover} alt={project.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f7d795] to-[#d98261] text-xs font-bold text-[#28160c]">
                      EW
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{project.author}</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-white/55">
                      <PlayCircle size={14} fill="currentColor" strokeWidth={0} />
                      {project.plays}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-white/55">
                      <Heart size={14} fill="currentColor" strokeWidth={0} />
                      {project.likes}
                    </span>
                  </div>
                  <p className="truncate text-sm font-semibold text-white">{project.title}</p>
                  <p className="mt-1 text-xs text-white/42">{project.updatedAt}</p>
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
    { key: "inspiration" as const, label: "灵感来源", onClick: onInspiration },
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
                className="h-11 appearance-none rounded-[10px] border border-[#454545] bg-transparent px-3.5 text-left text-sm text-[#7d7d7d] transition-colors hover:border-white/55 hover:text-white"
              >
                {item}
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
  onModeChange,
  onSocialAuth,
}: {
  mode: "login" | "register";
  email: string;
  password: string;
  busy: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onModeChange: (mode: PanelMode) => void;
  onSocialAuth: (provider: "google" | "wechat" | "apple" | "github" | "meta") => void;
}) {
  const isRegister = mode === "register";

  return (
    <GlassPanel>
      <form className="flex h-full flex-col" onSubmit={onSubmit}>
        <PanelHeader title={isRegister ? "创建 ArtX Studio 账号" : "欢迎使用 ArtX Studio"} />

        <div className="mt-8 flex flex-col gap-5">
          <LabeledInput
            label="邮箱地址"
            value={email}
            onChange={onEmailChange}
            autoComplete="username"
            placeholder="请输入你的账号或邮箱"
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

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-12 rounded-[10px] bg-[#936CFF] text-base font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.25)] transition-all hover:bg-[#A384FF] disabled:opacity-60"
        >
          {busy ? "请稍候..." : isRegister ? "注 册" : "登 录"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#939393]" />
          <span className="text-[13px] text-white">或</span>
          <span className="h-px flex-1 bg-[#939393]" />
        </div>

        <div className="flex flex-col gap-[10px]">
          <SocialButton icon={<Mail size={18} className="text-[#ea4335]" />} label="使用 Gmail 登录" onClick={() => onSocialAuth("google")} />
          <SocialButton icon={<MessageCircle size={18} className="text-[#19b36b]" />} label="使用微信登录" onClick={() => onSocialAuth("wechat")} />
          <SocialButton icon={<Github size={18} className="text-[#7fb2ff]" />} label="使用 GitHub 登录" onClick={() => onSocialAuth("github")} />
          <SocialButton icon={<span className="text-xl leading-none text-[#3f7cff]">∞</span>} label="使用 Meta 登录" onClick={() => onSocialAuth("meta")} />
        </div>

        <button
          type="button"
          onClick={() => onModeChange(isRegister ? "login" : "register")}
          className="mt-5 appearance-none bg-transparent text-center text-[13px] text-[#936CFF] transition-colors hover:text-[#A384FF]"
        >
          {isRegister ? "已有账号？立即登录" : "还没有账号？立即注册"}
        </button>
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

function SocialButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 appearance-none items-center justify-center gap-3 rounded-[10px] border border-[#737373] bg-transparent text-sm font-medium text-white transition-colors hover:border-white"
    >
      {icon}
      {label}
    </button>
  );
}
