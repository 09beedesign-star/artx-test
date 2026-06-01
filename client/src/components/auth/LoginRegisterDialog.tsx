import { useState } from "react";
import { Check, Eye, EyeOff, Mail, Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

// ── Global Login / Register Dialog ─────────────────────────────
export default function LoginRegisterDialog() {
  const { resolvedTheme } = useTheme();
  const { loginModalOpen, closeLoginModal, login, register, socialAuth } = useAuth();
  const isDark = resolvedTheme === "dark";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [provider, setProvider] = useState<"google" | "wechat" | "apple">("google");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loginModalOpen) return null;

  const text = isDark ? "oklch(0.94 0.006 270)" : "oklch(0.97 0.004 270)";
  const muted = "oklch(0.68 0.018 275)";
  const dim = "oklch(0.52 0.018 275)";
  const border = "oklch(1 0 0 / 12%)";
  const inputBg = "oklch(1 0 0 / 7%)";
  const accentGradient = "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.68 0.18 220))";


  const handleConfirm = async () => {
    const normalizedUsername = username.trim();
    setError("");

    if (!normalizedUsername) {
      setError("请输入账号");
      return;
    }

    if (!password.trim()) {
      setError("请输入密码");
      return;
    }

    setSubmitting(true);
    const result = mode === "register"
      ? await register(normalizedUsername, password)
      : await login(normalizedUsername, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error || (mode === "register" ? "注册失败，请稍后重试" : "账号或密码错误，请重新输入"));
    }
  };

  const handleSocialAuth = async (nextProvider: "google" | "wechat" | "apple") => {
    setProvider(nextProvider);
    setError("");
    setSubmitting(true);
    const result = await socialAuth(nextProvider);
    setSubmitting(false);
    if (!result.ok) setError(result.error || "第三方登录暂时不可用");
  };

  const socialConfig = {
    google: { label: "gmail 邮箱", color: "#EA4335", icon: <Mail size={15} /> },
    wechat: { label: "微信", color: "#07C160", icon: <span style={{ fontSize: 15, fontWeight: 800 }}>微</span> },
    apple: { label: "apple", color: "#F5F5F7", icon: <span style={{ fontSize: 17, lineHeight: 1 }}></span> },
  } as const;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto px-4 py-8"
      style={{
        background:
          "radial-gradient(circle at 50% -8%, oklch(0.36 0.15 285 / 0.40), transparent 34%), radial-gradient(circle at 18% 82%, oklch(0.48 0.18 220 / 0.28), transparent 30%), oklch(0.055 0.012 270)",
        color: text,
        backdropFilter: "blur(16px)",
      }}
    >
      <button
        className="fixed right-5 top-5 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{ background: "oklch(1 0 0 / 8%)", border: `1px solid ${border}`, color: muted, backdropFilter: "blur(18px)" }}
        onClick={closeLoginModal}
        aria-label="关闭登录窗口"
      >
        <X size={18} />
      </button>

      <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col items-center justify-center py-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] flex items-center justify-center" style={{ background: accentGradient, boxShadow: "0 16px 42px oklch(0.58 0.22 290 / 0.38)" }}>
            <Sparkles size={18} color="white" />
          </div>
          <div>
            <p className="type-body-sm" style={{ color: text }}>Art X</p>
            <p className="type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.02em" }}>Creative Design Workspace</p>
          </div>
        </div>

        <div className="relative w-full max-w-[430px]">
          <div
            className="relative z-10 mx-auto w-full max-w-[430px] rounded-[30px] p-5 sm:p-6"
            style={{
              background: "linear-gradient(180deg, oklch(0.16 0.022 270 / 0.92), oklch(0.105 0.018 270 / 0.96))",
              border: "1px solid oklch(1 0 0 / 14%)",
              boxShadow: "0 34px 100px rgba(0,0,0,0.70)",
              backdropFilter: "blur(24px)",
            }}
          >
            <div className="mb-5 text-center">
              <p className="type-caption mb-2" style={{ color: "oklch(0.68 0.18 220)", textTransform: "none", letterSpacing: "0.16em" }}>WELCOME TO ART X</p>
              <h2 className="text-[26px] font-semibold tracking-[-0.04em]" style={{ color: text }}>{mode === "login" ? "登录创意工作台" : "创建 Art X 账号"}</h2>
              <p className="type-caption mt-2" style={{ color: muted, textTransform: "none", letterSpacing: "0.02em" }}>注册账号后即可在测试链接中登录使用。</p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-[18px] p-1" style={{ background: "oklch(1 0 0 / 6%)", border: `1px solid ${border}` }}>
              {(["login", "register"] as const).map(item => {
                const active = mode === item;
                return (
                  <button
                    key={item}
                    onClick={() => { setMode(item); setError(""); }}
                    disabled={submitting}
                    className="h-10 rounded-[14px] type-body-sm transition-all active:scale-[0.98]"
                    style={{ background: active ? accentGradient : "transparent", color: active ? "white" : muted, boxShadow: active ? "0 10px 26px oklch(0.58 0.22 290 / 0.25)" : "none" }}
                  >
                    {item === "login" ? "登录" : "注册"}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="type-caption" style={{ color: muted }}>账号 / 邮箱</span>
                <input
                  value={username}
                  onChange={e => { setUsername(e.target.value); if (error) setError(""); }}
                  className="h-12 rounded-[16px] px-4 outline-none type-caption transition-colors"
                  style={{
                    background: inputBg,
                    border: `1px solid ${error === "请输入账号" ? "oklch(0.68 0.22 25)" : border}`,
                    color: text,
                  }}
                  placeholder=""
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="type-caption" style={{ color: muted }}>密码</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (error) setError(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && !submitting) void handleConfirm(); }}
                    className="h-12 w-full rounded-[16px] pl-4 pr-11 outline-none type-caption transition-colors"
                    style={{
                      background: inputBg,
                      border: `1px solid ${error === "请输入密码" ? "oklch(0.68 0.22 25)" : border}`,
                      color: text,
                    }}
                    placeholder=""
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[12px] flex items-center justify-center transition-opacity hover:opacity-75 active:scale-95"
                    style={{ color: muted }}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.02em" }}>
                <span className="w-4 h-4 rounded-[5px] flex items-center justify-center" style={{ background: "oklch(0.58 0.22 290 / 0.20)", border: "1px solid oklch(0.58 0.22 290 / 0.46)" }}>
                  <Check size={11} color="oklch(0.76 0.16 230)" />
                </span>
                保持登录
              </label>
              <button className="type-caption" style={{ color: "oklch(0.70 0.18 220)", textTransform: "none", letterSpacing: "0.02em" }}>忘记密码？</button>
            </div>

            {error && (
              <p className="type-caption mt-3" role="alert" style={{ color: "oklch(0.72 0.20 25)", textTransform: "none", letterSpacing: "0.02em" }}>
                {error}
              </p>
            )}

            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full h-12 mt-5 rounded-[18px] type-body-sm transition-all hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed"
              style={{ background: accentGradient, color: "white", boxShadow: "0 18px 42px oklch(0.58 0.22 290 / 0.34)", opacity: submitting ? 0.68 : 1 }}
            >
              {submitting ? "处理中..." : mode === "login" ? "进入 Art X" : "注册并进入 Art X"}
            </button>

            <div className="my-5 flex items-center gap-4">
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 16%))" }} />
              <span className="type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.04em" }}>其他登录方式</span>
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, oklch(1 0 0 / 16%), transparent)" }} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["google", "wechat", "apple"] as const).map(item => {
                const active = provider === item;
                const config = socialConfig[item];
                return (
                  <button
                    key={item}
                    onClick={() => void handleSocialAuth(item)}
                    disabled={submitting}
                    className="h-12 rounded-[16px] type-caption transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed"
                    style={{
                      background: active ? "oklch(1 0 0 / 14%)" : "oklch(1 0 0 / 7%)",
                      border: `1px solid ${active ? "oklch(0.68 0.18 220 / 0.48)" : border}`,
                      color: active ? text : muted,
                    }}
                    aria-label={item === "google" ? "Google 登录" : item === "wechat" ? "微信登录" : "Apple 登录"}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-[7px]" style={{ background: config.color, color: item === "apple" ? "#111" : "white" }}>{config.icon}</span>
                      {config.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
