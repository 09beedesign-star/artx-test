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

export default function HomePage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, login, register, socialAuth } = useAuth();
  const [panelMode, setPanelMode] = useState<PanelMode>(isAuthenticated ? "prelogin" : "prelogin");
  const [prompt, setPrompt] = useState(HOME_PROMPT);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const homeRef = useRef<HTMLElement>(null);
  const inspirationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isAuthenticated) setPanelMode("prelogin");
  }, [isAuthenticated]);

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
    inspirationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToHome = () => {
    homeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="h-screen overflow-y-auto bg-black text-white snap-y snap-mandatory scroll-smooth">
      <section ref={homeRef} className="relative min-h-screen overflow-hidden snap-start">
        <HeroBackdrop />
        <header className="absolute left-6 right-6 top-6 z-20 flex items-center justify-between sm:left-10 sm:right-10 lg:left-20 lg:right-20">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-[28px] font-bold leading-none tracking-normal text-white transition-opacity hover:opacity-85 sm:text-[32px]"
            aria-label="ArtXStudio 首页"
          >
            ArtX<span className="font-normal">Studio</span>
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="h-10 rounded-md border border-white/20 px-4 text-sm font-medium text-white/80 transition-colors hover:border-white/45 hover:text-white"
            >
              进入工作台
            </button>
          )}
        </header>
        <LandingSideNav
          onHome={scrollToHome}
          onInspiration={scrollToInspiration}
          onSkills={() => navigate("/skills")}
          onWorkspace={() => navigate("/workspace")}
          onHelp={() => navigate("/help")}
        />

        <div className="relative z-10 grid min-h-screen items-center gap-8 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,1fr)_472px] lg:px-20 xl:px-24">
          <HeroStatement />
          <div className="relative mx-auto h-[min(726px,calc(100vh-150px))] w-full max-w-[472px] min-h-[620px] lg:mx-0 lg:ml-auto">
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

      <section ref={inspirationRef} className="min-h-screen snap-start bg-[#080808] px-6 py-20 sm:px-10 lg:px-20">
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

function LandingSideNav({
  onHome,
  onInspiration,
  onSkills,
  onWorkspace,
  onHelp,
}: {
  onHome: () => void;
  onInspiration: () => void;
  onSkills: () => void;
  onWorkspace: () => void;
  onHelp: () => void;
}) {
  const navItems = [
    { label: "首页", onClick: onHome },
    { label: "灵感来源", onClick: onInspiration },
    { label: "技能商店", onClick: onSkills },
    { label: "工作台", onClick: onWorkspace },
  ];

  return (
    <nav className="absolute left-6 top-[112px] z-20 hidden w-[150px] flex-col gap-2 sm:left-10 lg:left-20 lg:flex" aria-label="首页导航">
      <div className="flex flex-col gap-2">
        {navItems.map(item => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="h-9 appearance-none rounded-md border border-white/10 bg-black/18 px-3 text-left text-sm font-medium text-white/62 backdrop-blur-md transition-colors hover:border-white/35 hover:bg-white/8 hover:text-white"
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onHelp}
        className="mt-2 h-9 appearance-none rounded-md border border-[#936bff]/35 bg-[#936bff]/10 px-3 text-left text-sm font-medium text-[#b9a4ff] backdrop-blur-md transition-colors hover:border-[#b9a4ff]/70 hover:bg-[#936bff]/18 hover:text-white"
      >
        帮助与反馈
      </button>
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
    <div className="relative min-h-[540px] max-w-[720px] pt-20 lg:pt-0">
      <div className="absolute left-[10%] top-0 hidden h-[78%] w-px bg-white/10 lg:block" />
      <div className="absolute left-[10%] top-[60%] hidden h-[300px] w-px origin-top rotate-[28deg] bg-white/10 lg:block" />
      <div className="absolute bottom-5 left-[8%] hidden h-[70px] w-[70px] rounded-full border border-white/45 lg:block">
        <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
      <div className="relative ml-0 mt-[16vh] flex max-w-[510px] gap-5 sm:ml-[17%] lg:mt-[22vh]">
        <div className="mt-3 h-[289px] w-[7px] shrink-0 bg-gradient-to-b from-[#7475ff] via-[#4dc1ed] via-30% via-[#fff400] via-55% to-[#ff00b5]" />
        <div>
          <p className="text-[56px] font-black leading-[0.98] tracking-normal text-white sm:text-[70px]">AI</p>
          <h1 className="mt-1 text-[48px] font-black leading-[1.05] tracking-normal text-white sm:text-[70px] sm:leading-[74px]">
            用魔法勾勒<br />你想象中的<br />世界
          </h1>
        </div>
      </div>
      <p className="absolute bottom-0 left-[17%] hidden text-[24px] leading-7 text-white/16 lg:block">
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
            {PROMPT_SUGGESTIONS.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => onPromptChange(item)}
                className="h-11 appearance-none rounded-[10px] border border-[#454545] bg-transparent px-3.5 text-left text-sm transition-colors hover:border-white/55"
                style={{ color: index === 1 ? "#ffffff" : "#7d7d7d" }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex min-h-[282px] flex-1 flex-col justify-between rounded-[10px] border border-[#545454] bg-[#212121] p-4">
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
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#936bff] text-white shadow-[0_8px_22px_rgba(147,107,255,0.28)] transition-all hover:bg-[#a17dff] active:scale-95"
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

        <button type="button" className="mt-4 appearance-none self-end bg-transparent text-[13px] font-medium text-[#7d7d7d] transition-colors hover:text-white">
          忘记密码？
        </button>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-12 rounded-[10px] bg-[#936bff] text-base font-semibold text-white shadow-[0_10px_28px_rgba(88,86,214,0.25)] transition-all hover:bg-[#a17dff] disabled:opacity-60"
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
          className="mt-5 appearance-none bg-transparent text-center text-[13px] text-[#936bff] transition-colors hover:text-[#aa8aff]"
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
        className="h-[46px] w-full rounded-[10px] border border-[#545454] bg-[#222] px-3.5 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-[#7d7d7d] focus:border-[#8f6cff] focus:shadow-[0_0_0_3px_rgba(147,107,255,0.22)]"
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
