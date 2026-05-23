import { useState } from "react";
import { Check, Eye, EyeOff, Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

// ── Global Login / Register Dialog ─────────────────────────────
export default function LoginRegisterDialog() {
  const { resolvedTheme } = useTheme();
  const { loginModalOpen, closeLoginModal, login } = useAuth();
  const isDark = resolvedTheme === "dark";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [provider, setProvider] = useState<"google" | "wechat" | "apple">("google");
  const [username, setUsername] = useState("09bee");
  const [password, setPassword] = useState("1234");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  if (!loginModalOpen) return null;

  const text = isDark ? "oklch(0.94 0.006 270)" : "oklch(0.97 0.004 270)";
  const muted = "oklch(0.68 0.018 275)";
  const dim = "oklch(0.52 0.018 275)";
  const border = "oklch(1 0 0 / 12%)";
  const inputBg = "oklch(1 0 0 / 7%)";
  const accentGradient = "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.68 0.18 220))";

  const visualCards = [
    { title: "Brand System", tone: "linear-gradient(135deg, oklch(0.18 0.035 280), oklch(0.34 0.12 300))", x: "-8%", y: "14%", w: "34%", h: 118, rotate: "-7deg" },
    { title: "AI Canvas", tone: "linear-gradient(135deg, oklch(0.20 0.05 245), oklch(0.48 0.18 220))", x: "18%", y: "0%", w: "40%", h: 148, rotate: "3deg" },
    { title: "Motion Mood", tone: "linear-gradient(135deg, oklch(0.16 0.04 270), oklch(0.55 0.20 290))", x: "56%", y: "18%", w: "34%", h: 124, rotate: "8deg" },
    { title: "Visual Grid", tone: "linear-gradient(135deg, oklch(0.13 0.03 270), oklch(0.44 0.15 185))", x: "2%", y: "55%", w: "38%", h: 132, rotate: "2deg" },
    { title: "Product Shot", tone: "linear-gradient(135deg, oklch(0.24 0.05 270), oklch(0.72 0.18 35))", x: "42%", y: "48%", w: "45%", h: 154, rotate: "-4deg" },
  ];

  const handleConfirm = () => {
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

    if (!login(normalizedUsername, password)) {
      setError("账号或密码错误，请重新输入");
    }
  };

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

        <div className="relative w-full max-w-[1040px]">
          <div
            className="relative mx-auto h-[360px] w-full overflow-hidden rounded-[34px]"
            style={{
              background: "linear-gradient(180deg, oklch(0.10 0.024 270), oklch(0.075 0.018 270))",
              border: `1px solid ${border}`,
              boxShadow: "0 46px 120px rgba(0,0,0,0.62), inset 0 -1px 0 oklch(1 0 0 / 9%)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-28" style={{ background: "linear-gradient(180deg, oklch(0.20 0.06 260 / 0.75), transparent)" }} />
            <div className="absolute inset-x-[12%] bottom-0 h-32 rounded-t-[44px]" style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.72), oklch(0.68 0.18 220 / 0.66))", filter: "blur(2px)" }} />
            <div className="absolute left-8 top-8 right-8 flex items-center justify-between text-[10px] uppercase tracking-[0.24em]" style={{ color: "oklch(0.82 0.018 275 / 0.72)" }}>
              <span>AI Moodboard</span>
              <span>Prompt · Canvas · Delivery</span>
            </div>

            {visualCards.map(card => (
              <div
                key={card.title}
                className="absolute overflow-hidden rounded-[24px] p-4"
                style={{
                  left: card.x,
                  top: card.y,
                  width: card.w,
                  height: card.h,
                  transform: `rotate(${card.rotate})`,
                  background: card.tone,
                  border: "1px solid oklch(1 0 0 / 15%)",
                  boxShadow: "0 28px 70px rgba(0,0,0,0.42)",
                }}
              >
                <div className="absolute inset-0 opacity-45" style={{ backgroundImage: "linear-gradient(90deg, oklch(1 0 0 / 9%) 1px, transparent 1px), linear-gradient(0deg, oklch(1 0 0 / 8%) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.70 0.18 35)" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.58 0.22 290)" }} />
                  </div>
                  <p className="type-caption" style={{ color: "white", textTransform: "none", letterSpacing: "0.02em" }}>{card.title}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="relative z-10 mx-auto -mt-24 w-full max-w-[430px] rounded-[30px] p-5 sm:p-6"
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
              <p className="type-caption mt-2" style={{ color: muted, textTransform: "none", letterSpacing: "0.02em" }}>使用测试账号 09bee / 1234 体验完整创作流程。</p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-[18px] p-1" style={{ background: "oklch(1 0 0 / 6%)", border: `1px solid ${border}` }}>
              {(["login", "register"] as const).map(item => {
                const active = mode === item;
                return (
                  <button
                    key={item}
                    onClick={() => { setMode(item); setError(""); }}
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
                  placeholder="请输入账号或邮箱"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="type-caption" style={{ color: muted }}>密码</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (error) setError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
                    className="h-12 w-full rounded-[16px] pl-4 pr-11 outline-none type-caption transition-colors"
                    style={{
                      background: inputBg,
                      border: `1px solid ${error === "请输入密码" ? "oklch(0.68 0.22 25)" : border}`,
                      color: text,
                    }}
                    placeholder="请输入密码"
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
              className="w-full h-12 mt-5 rounded-[18px] type-body-sm transition-all hover:scale-[1.01] active:scale-[0.98]"
              style={{ background: accentGradient, color: "white", boxShadow: "0 18px 42px oklch(0.58 0.22 290 / 0.34)" }}
            >
              {mode === "login" ? "进入 Art X" : "注册并进入 Art X"}
            </button>

            <div className="my-5 flex items-center gap-4">
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 16%))" }} />
              <span className="type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.04em" }}>其他登录方式</span>
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, oklch(1 0 0 / 16%), transparent)" }} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["google", "wechat", "apple"] as const).map(item => {
                const active = provider === item;
                const label = item === "google" ? "G" : item === "wechat" ? "微" : "";
                return (
                  <button
                    key={item}
                    onClick={() => setProvider(item)}
                    className="h-12 rounded-[16px] type-body-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: active ? "oklch(1 0 0 / 14%)" : "oklch(1 0 0 / 7%)",
                      border: `1px solid ${active ? "oklch(0.68 0.18 220 / 0.48)" : border}`,
                      color: active ? text : muted,
                    }}
                    aria-label={item === "google" ? "Google 登录" : item === "wechat" ? "微信登录" : "Apple 登录"}
                  >
                    {label}
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
