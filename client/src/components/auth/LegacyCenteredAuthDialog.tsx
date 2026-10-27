// ⚠️ 旧版 ArtX 登录界面（用户名/邮箱 + 密码），原样保留自 772934a。
// 仅在手机号登录开关关闭时使用（见 useAuthFeatures / ARTX_PHONE_AUTH_ENABLED）。开关全量打开且稳定后可删除。
import { useState } from "react";
import { X, Gift } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { INVITE_REWARD_CONFIG } from "@shared/billing-config";

interface CenteredAuthDialogProps {
  open: boolean;
  onClose: () => void;
  /** 默认显示的模式：login 或 register */
  defaultMode?: "login" | "register";
  /** 邀请码（可选） */
  inviteCode?: string;
}

/**
 * 居中的登录/注册弹窗。
 * 支持黑白模式，出现在画面正中间，带半透明背景遮罩。
 */
export function LegacyCenteredAuthDialog({
  open,
  onClose,
  defaultMode = "login",
  inviteCode = "",
}: CenteredAuthDialogProps) {
  const { login, register, forgotPassword, resetPassword } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [mode, setMode] = useState<"login" | "register" | "reset">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // 重置密码相关状态
  const [resetUsername, setResetUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  // 主题颜色
  const textPrimary = isDark ? "#ffffff" : "#2c2c2b";
  const textSecondary = isDark ? "#86868b" : "#6a6a6b";
  const textMuted = isDark ? "#7d7d7d" : "#8e8b86";
  const bgDialog = isDark ? "#222222" : "#ffffff";
  const bgOverlay = isDark ? "rgba(34,34,34,0.72)" : "rgba(255,255,255,0.90)";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "#f0efed";

  if (!open) return null;

  const handleAuthAction = async (action: "login" | "register") => {
    if (!email.trim() || !password.trim()) {
      setAuthError("请输入用户名或邮箱和密码");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    const result =
      action === "register"
        ? await register(email.trim(), password)
        : await login(email.trim(), password);
    setAuthBusy(false);

    if (!result.ok) {
      setAuthError(result.error || "登录失败，请稍后重试");
      return;
    }

    // 成功后关闭弹窗
    onClose();
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleAuthAction("login");
  };

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
    setResetMessage(
      result.ok
        ? result.message || "验证码已发送，请查看邮箱。"
        : result.error || "验证码发送失败，请稍后重试"
    );
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
    setMode("login");
    setResetMessage("");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: bgOverlay, backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-[20px] border p-10 backdrop-blur-[22px]"
        style={{
          borderColor: isDark ? "#454545" : "#f0efed",
          backgroundColor: isDark
            ? "rgba(34, 34, 34, 0.95)"
            : "rgba(255, 255, 255, 0.98)",
          boxShadow: isDark
            ? "0 30px 80px rgba(0,0,0,0.52)"
            : "0 30px 80px rgba(0,0,0,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: textMuted }}
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        {mode === "reset" ? (
          <form autoComplete="on" onSubmit={handleResetSubmit}>
            <h2
              className="text-[26px] font-bold leading-[31px]"
              style={{ color: textPrimary }}
            >
              找回密码
            </h2>
            <p className="mt-3 text-sm" style={{ color: textSecondary }}>
              通过注册邮箱重置密码
            </p>

            <div className="mt-8 flex flex-col gap-4">
              <LabeledInput
                label="注册邮箱或用户名"
                value={resetUsername}
                onChange={setResetUsername}
                name="username"
                autoComplete="username"
                placeholder="请输入注册邮箱或用户名"
                isDark={isDark}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <LabeledInput
                  label="验证码"
                  value={resetCode}
                  onChange={(value) =>
                    setResetCode(value.replace(/\D/g, "").slice(0, 6))
                  }
                  autoComplete="one-time-code"
                  placeholder="6 位验证码"
                  isDark={isDark}
                />
                <button
                  type="button"
                  disabled={resetBusy}
                  onClick={() => void handleSendResetCode()}
                  className="mt-[25px] h-12 rounded-[10px] border bg-opacity-10 px-4 text-sm font-semibold transition-all hover:bg-opacity-20 disabled:opacity-60"
                  style={{
                    borderColor: isDark ? "rgba(255,255,255,0.15)" : borderColor,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.05)",
                    color: textPrimary,
                  }}
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
                isDark={isDark}
              />
              <LabeledInput
                label="确认新密码"
                type="password"
                value={resetConfirmPassword}
                onChange={setResetConfirmPassword}
                name="confirm-new-password"
                autoComplete="new-password"
                placeholder="再次输入新密码"
                isDark={isDark}
              />
            </div>

            <p
              className={`mt-4 min-h-5 text-left text-[13px] font-medium ${
                resetMessage ? "text-amber-400" : "text-transparent"
              }`}
            >
              {resetMessage || " "}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => setMode("login")}
                className="h-12 rounded-[10px] border text-base font-semibold transition-all hover:bg-opacity-20 disabled:opacity-60"
                style={{
                  borderColor: isDark ? "rgba(255,255,255,0.15)" : borderColor,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)",
                  color: textPrimary,
                }}
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
        ) : (
          <form onSubmit={handleAuthSubmit} autoComplete="on">
            <h2
              className="text-[26px] font-bold leading-[31px]"
              style={{ color: textPrimary }}
            >
              {mode === "register" ? "创建 ArtX Studio 账号" : "欢迎使用 ArtX Studio"}
            </h2>
            <p className="mt-3 text-sm" style={{ color: textSecondary }}>
              用AI打开你的创意世界之门
            </p>

            {/* 邀请落地提示 */}
            {inviteCode && (
              <div
                className="mt-5 rounded-[12px] border px-4 py-3"
                style={{
                  borderColor: isDark
                    ? "rgba(147,108,255,0.35)"
                    : "rgba(147,108,255,0.25)",
                  backgroundColor: isDark
                    ? "rgba(147,108,255,0.12)"
                    : "rgba(147,108,255,0.08)",
                }}
              >
                <div
                  className="flex items-center gap-2 text-[13px] font-semibold"
                  style={{ color: textPrimary }}
                >
                  <Gift size={15} className="text-[#C4AEFF]" />
                  好友邀请你加入 ArtX Studio
                </div>
                <p
                  className="mt-1.5 text-[12px] leading-relaxed"
                  style={{ color: textSecondary }}
                >
                  邀请码{" "}
                  <span className="font-mono font-semibold text-[#C4AEFF]">
                    {inviteCode}
                  </span>{" "}
                  已自动填好，无需手动输入。 注册后完成首次付费（满 HKD{" "}
                  {INVITE_REWARD_CONFIG.minPaidAmountHkd}）， 你可得{" "}
                  {INVITE_REWARD_CONFIG.inviteeCredits} 积分，邀请你的好友可得{" "}
                  {INVITE_REWARD_CONFIG.inviterCredits} 积分。
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-5">
              <LabeledInput
                label="用户名或邮箱"
                value={email}
                onChange={setEmail}
                name="username"
                autoComplete="username"
                placeholder="请输入用户名或邮箱"
                isDark={isDark}
              />
              <LabeledInput
                label="密码"
                type="password"
                value={password}
                onChange={setPassword}
                name={mode === "register" ? "new-password" : "password"}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                placeholder="请输入密码"
                isDark={isDark}
              />
            </div>

            {mode === "login" && (
              <div className="mt-3 flex h-5 items-center justify-between gap-3">
                <label
                  className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
                  title="勾选后下次自动填入账号；密码由浏览器的密码管理器保存，登录时在密码框选择即可"
                >
                  <input
                    type="checkbox"
                    checked={rememberPassword}
                    onChange={(event) =>
                      setRememberPassword(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-border bg-input accent-[#936CFF]"
                  />
                  <span
                    className="truncate text-[13px] font-medium"
                    style={{ color: textPrimary }}
                  >
                    记住账号
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetUsername(email.trim());
                    setResetMessage("");
                    setMode("reset");
                  }}
                  className="shrink-0 appearance-none bg-transparent text-[13px] font-medium transition-colors hover:opacity-80"
                  style={{ color: textMuted }}
                >
                  忘记密码？
                </button>
              </div>
            )}

            <p
              className={`mt-4 h-5 min-w-0 truncate text-left text-[13px] font-medium text-red-400 ${
                authError ? "visible" : "invisible"
              }`}
            >
              {authError || " "}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleAuthAction("register")}
                className="h-12 rounded-[10px] bg-[#2F80ED] text-base font-semibold text-white shadow-[0_10px_28px_rgba(47,128,237,0.24)] transition-all hover:bg-[#4A96FF] disabled:opacity-60"
              >
                {authBusy ? "请稍候..." : "注 册"}
              </button>
              <button
                type="submit"
                disabled={authBusy}
                className="h-12 rounded-[10px] bg-[#936CFF] text-base font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.25)] transition-all hover:bg-[#A384FF] disabled:opacity-60"
              >
                {authBusy ? "请稍候..." : "登 录"}
              </button>
            </div>

            <p className="mt-5 text-center text-[13px]" style={{ color: textMuted }}>
              用户名或邮箱注册/登陆
            </p>
          </form>
        )}
      </div>
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
  autoComplete,
  isDark,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  name?: string;
  autoComplete?: string;
  isDark: boolean;
}) {
  const labelColor = isDark ? "#ffffff" : "#2c2c2b";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "#f0efed";
  const bgInput = isDark ? "rgba(255,255,255,0.05)" : "#fbfbfa";
  const textColor = isDark ? "#ffffff" : "#2c2c2b";
  const placeholderColor = isDark ? "#7d7d7d" : "#8e8b86";

  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[13px] font-medium"
        style={{ color: labelColor }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        name={name}
        autoComplete={autoComplete}
        className="h-[46px] w-full rounded-[10px] border px-3.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#936CFF] focus:shadow-[0_0_0_3px_rgba(147,108,255,0.22)]"
        style={{
          borderColor: borderColor,
          backgroundColor: bgInput,
          color: textColor,
        }}
      />
    </label>
  );
}
