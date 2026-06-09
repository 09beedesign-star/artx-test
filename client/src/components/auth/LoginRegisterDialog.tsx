import { useEffect, useState } from "react";
import { Github, Mail, MessageCircle, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Global Login / Register Dialog
// 首页使用 HomePage 内部右侧面板；其它场景统一使用这个居中弹窗。
export default function LoginRegisterDialog() {
  const { loginModalOpen, closeLoginModal, login, register, socialAuth } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loginModalOpen) return;
    setError("");
    setSubmitting(false);
  }, [loginModalOpen]);

  if (!loginModalOpen) return null;

  const isRegister = mode === "register";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setError("");

    if (!normalizedEmail || !password.trim()) {
      setError("请输入邮箱和密码");
      return;
    }

    setSubmitting(true);
    const result = isRegister
      ? await register(normalizedEmail, password)
      : await login(normalizedEmail, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || (isRegister ? "注册失败，请稍后重试" : "登录失败，请稍后重试"));
    }
  };

  const handleSocialAuth = async (provider: "google" | "wechat" | "github" | "meta") => {
    setError("");
    setSubmitting(true);
    const result = await socialAuth(provider);
    setSubmitting(false);
    if (!result.ok) setError(result.error || "第三方登录暂时不可用");
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4 py-8"
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeLoginModal();
      }}
    >
      <div className="relative h-[726px] w-full max-w-[472px]">
        <button
          type="button"
          onClick={closeLoginModal}
          className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#1c1c1c]/90 text-white/70 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-[18px] transition-colors hover:border-white/35 hover:text-white"
          aria-label="关闭登录窗口"
        >
          <X size={16} />
        </button>

        <GlassPanel>
          <form className="flex h-full flex-col" onSubmit={handleSubmit}>
            <PanelHeader title={isRegister ? "创建 ArtX Studio 账号" : "欢迎使用 ArtX Studio"} />

            <div className="mt-8 flex flex-col gap-5">
              <LabeledInput
                label="邮箱地址"
                value={email}
                onChange={setEmail}
                autoComplete="username"
                placeholder="请输入你的账号或邮箱"
              />
              <LabeledInput
                label="密码"
                type="password"
                value={password}
                onChange={setPassword}
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
              disabled={submitting}
              className="mt-5 h-12 rounded-[10px] bg-[#936CFF] text-base font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.25)] transition-all hover:bg-[#A384FF] disabled:opacity-60"
            >
              {submitting ? "请稍候..." : isRegister ? "注 册" : "登 录"}
            </button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-[#939393]" />
              <span className="text-[13px] text-white">或</span>
              <span className="h-px flex-1 bg-[#939393]" />
            </div>

            <div className="flex flex-col gap-[10px]">
              <SocialButton icon={<Mail size={18} className="text-[#ea4335]" />} label="使用 Gmail 登录" onClick={() => void handleSocialAuth("google")} />
              <SocialButton icon={<MessageCircle size={18} className="text-[#19b36b]" />} label="使用微信登录" onClick={() => void handleSocialAuth("wechat")} />
              <SocialButton icon={<Github size={18} className="text-[#7fb2ff]" />} label="使用 GitHub 登录" onClick={() => void handleSocialAuth("github")} />
              <SocialButton icon={<span className="text-xl leading-none text-[#3f7cff]">∞</span>} label="使用 Meta 登录" onClick={() => void handleSocialAuth("meta")} />
            </div>

            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError("");
              }}
              className="mt-5 appearance-none bg-transparent text-center text-[13px] text-[#936CFF] transition-colors hover:text-[#A384FF]"
            >
              {isRegister ? "已有账号？立即登录" : "还没有账号？立即注册"}
            </button>
          </form>
        </GlassPanel>
      </div>
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
