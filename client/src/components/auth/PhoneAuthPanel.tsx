import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  CODE_LENGTH,
  PHONE_AUTH_MESSAGES,
  PHONE_MAX_LENGTH,
  isValidMainlandPhone,
  validatePhoneAuthPassword,
} from "@shared/phone-auth-rules";

/**
 * 登录 / 注册 / 重置密码 三视图面板。
 *
 * 📌 流程结构、字段顺序、占位文案、校验文案、链接文案 —— 全部对齐
 *    https://www.sparkx.zone 「登录/注册」弹窗（2026-10-27 实抓，截图在交付记录里）：
 *    - 登录：手机号 → 密码(眼睛) → 协议勾选 →「登录」→「重置密码 | 我要注册」
 *    - 注册：手机号 → 8位密码 → 确认密码 → 验证码(获取验证码) → 协议勾选 →「注册」→「我要登录」
 *    - 重置：手机号 → 新密码 → 确认密码 → 验证码 →「重置密码」→「返回登录」（无协议勾选）
 *    - 协议勾选默认不勾；未勾提交 → 勾选框下红字「请勾选用户协议」+ 顶部 toast
 * 📌 视觉保持 ArtX 自己的风格（紫色主按钮、玻璃面板、深浅主题），不照搬 SparkX 的 UI。
 * ⚠️ 校验规则只从 shared/phone-auth-rules.ts 取，后端用的是同一份。
 */

export type PhoneAuthView = "login" | "register" | "reset";

type FieldKey = "phone" | "password" | "confirm" | "code" | "agree";
type FieldErrors = Partial<Record<FieldKey, string>>;

const RESEND_SECONDS_FALLBACK = 60;

export function PhoneAuthPanel({
  isDark,
  initialView = "login",
  onSuccess,
  banner,
}: {
  isDark: boolean;
  initialView?: PhoneAuthView;
  onSuccess?: () => void;
  /** 视图标题下方的附加内容（如邀请落地提示），只在注册 / 登录视图显示 */
  banner?: ReactNode;
}) {
  const { phoneLogin, phoneRegister, phoneResetPassword, sendPhoneCode } = useAuth();
  const [view, setView] = useState<PhoneAuthView>(initialView);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => setView(initialView), [initialView]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const switchView = (next: PhoneAuthView) => {
    // 切换视图时保留手机号（与 SparkX 一致），清掉密码 / 验证码 / 错误态。
    setView(next);
    setPassword("");
    setConfirm("");
    setCode("");
    setAgreed(false);
    setErrors({});
  };

  const startCountdown = (seconds: number) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setCountdown(seconds);
    timerRef.current = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  /** 按 SparkX 的规则一次性算出所有字段错误（多处同时标红），返回第一条用于 toast。 */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!isValidMainlandPhone(phone)) next.phone = PHONE_AUTH_MESSAGES.invalidPhone;
    if (view === "login") {
      if (!password) next.password = PHONE_AUTH_MESSAGES.emptyPassword;
    } else {
      const passwordError = validatePhoneAuthPassword(password);
      if (passwordError) next.password = passwordError;
      if (!confirm || confirm !== password) next.confirm = PHONE_AUTH_MESSAGES.passwordMismatch;
      if (!code) next.code = PHONE_AUTH_MESSAGES.emptyCode;
      else if (code.length !== CODE_LENGTH) next.code = PHONE_AUTH_MESSAGES.invalidCode;
    }
    if (view !== "reset" && !agreed) next.agree = PHONE_AUTH_MESSAGES.agreementRequired;
    return next;
  };

  const firstError = (fieldErrors: FieldErrors) =>
    fieldErrors.phone || fieldErrors.password || fieldErrors.confirm || fieldErrors.code || fieldErrors.agree || "";

  const handleSendCode = async () => {
    if (sendingCode || countdown > 0) return;
    if (!isValidMainlandPhone(phone)) {
      setErrors((prev) => ({ ...prev, phone: PHONE_AUTH_MESSAGES.invalidPhone }));
      toast.error(PHONE_AUTH_MESSAGES.invalidPhone);
      return;
    }
    setSendingCode(true);
    const result = await sendPhoneCode(phone, view === "reset" ? "reset" : "register");
    setSendingCode(false);
    if (!result.ok) {
      toast.error(result.error || PHONE_AUTH_MESSAGES.requestFailed);
      if (result.retryAfterSeconds) startCountdown(result.retryAfterSeconds);
      return;
    }
    toast.success("验证码已发送");
    startCountdown(result.retryAfterSeconds || RESEND_SECONDS_FALLBACK);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const fieldErrors = validate();
    setErrors(fieldErrors);
    const message = firstError(fieldErrors);
    if (message) {
      toast.error(message);
      return;
    }

    setBusy(true);
    const result = view === "login"
      ? await phoneLogin(phone, password)
      : view === "register"
        ? await phoneRegister(phone, password, code)
        : await phoneResetPassword(phone, password, code);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error || PHONE_AUTH_MESSAGES.requestFailed);
      return;
    }
    if (view === "reset") {
      toast.success("密码已重置，请使用新密码登录");
      switchView("login");
      return;
    }
    onSuccess?.();
  };

  const clearError = (key: FieldKey) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const title = view === "login" ? "登录 ArtX Studio 账号" : view === "register" ? "注册 ArtX Studio 账号" : "重置 ArtX Studio 密码";
  const submitLabel = view === "login" ? "登录" : view === "register" ? "注册" : "重置密码";

  const textPrimary = isDark ? "text-white" : "text-black/90";
  const textSecondary = isDark ? "text-[#86868b]" : "text-black/55";
  const linkColor = isDark ? "text-[#a3a3a3] hover:text-white" : "text-black/55 hover:text-black/85";
  const errorText = isDark ? "text-red-300" : "text-red-600";

  return (
    <form className="flex flex-col" onSubmit={handleSubmit} noValidate autoComplete="on" data-phone-auth-view={view}>
      <p className={`text-[13px] ${textSecondary}`}>欢迎来到 ArtX Studio！用AI打开你的创意世界之门</p>
      <h2 className={`mt-3 text-[26px] font-bold leading-[31px] ${textPrimary}`}>{title}</h2>

      {view !== "reset" && banner}

      <div className="mt-7 flex flex-col gap-3.5">
        <AuthInput
          isDark={isDark}
          type="tel"
          name="phone"
          autoComplete="tel"
          inputMode="numeric"
          maxLength={PHONE_MAX_LENGTH}
          placeholder="请输入你的手机号"
          value={phone}
          error={errors.phone}
          onChange={(value) => {
            setPhone(value.replace(/\D/g, "").slice(0, PHONE_MAX_LENGTH));
            clearError("phone");
          }}
        />
        <PasswordInput
          isDark={isDark}
          name={view === "login" ? "password" : "new-password"}
          autoComplete={view === "login" ? "current-password" : "new-password"}
          placeholder={view === "login" ? "请输入你的密码" : "请输入8位密码（包含英文、数字）"}
          value={password}
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            clearError("password");
          }}
        />
        {view !== "login" && (
          <>
            <PasswordInput
              isDark={isDark}
              name="confirm-password"
              autoComplete="new-password"
              placeholder="请重新输入你的密码"
              value={confirm}
              error={errors.confirm}
              onChange={(value) => {
                setConfirm(value);
                clearError("confirm");
              }}
            />
            <AuthInput
              isDark={isDark}
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={CODE_LENGTH}
              placeholder="请输入验证码"
              value={code}
              error={errors.code}
              onChange={(value) => {
                setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
                clearError("code");
              }}
              trailing={
                <button
                  type="button"
                  onClick={() => void handleSendCode()}
                  disabled={sendingCode || countdown > 0}
                  className="shrink-0 whitespace-nowrap px-1 text-[13px] font-semibold text-[#936CFF] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}s 后重新获取` : "获取验证码"}
                </button>
              }
            />
          </>
        )}
      </div>

      {view !== "reset" && (
        <div className="mt-4">
          <label className="flex cursor-pointer items-center gap-2 text-left">
            <input
              type="checkbox"
              name="agreement"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                clearError("agree");
              }}
              className="h-4 w-4 shrink-0 rounded accent-[#936CFF]"
            />
            <span className={`text-[13px] ${textSecondary}`}>
              {view === "login" ? "登录" : "注册"}即表示您同意{" "}
              <a href="/agreement" target="_blank" rel="noopener noreferrer" className={`font-semibold ${textPrimary} hover:text-[#936CFF]`} onClick={(event) => event.stopPropagation()}>用户协议</a>
              {" "}和{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className={`font-semibold ${textPrimary} hover:text-[#936CFF]`} onClick={(event) => event.stopPropagation()}>隐私政策</a>
            </span>
          </label>
          {errors.agree && <p className={`mt-1.5 text-left text-[12px] font-medium ${errorText}`} role="alert">{errors.agree}</p>}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 h-12 rounded-[10px] bg-[#936CFF] text-base font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.25)] transition-all hover:bg-[#A384FF] disabled:opacity-60"
      >
        {busy ? "请稍候..." : submitLabel}
      </button>

      <div className="mt-5 flex items-center justify-center gap-3 text-[13px] font-medium">
        {view === "login" ? (
          <>
            <button type="button" className={`bg-transparent transition-colors ${linkColor}`} onClick={() => switchView("reset")}>重置密码</button>
            <span className={isDark ? "text-white/20" : "text-black/20"}>|</span>
            <button type="button" className={`bg-transparent transition-colors ${linkColor}`} onClick={() => switchView("register")}>我要注册</button>
          </>
        ) : view === "register" ? (
          <button type="button" className={`bg-transparent transition-colors ${linkColor}`} onClick={() => switchView("login")}>我要登录</button>
        ) : (
          <button type="button" className={`bg-transparent transition-colors ${linkColor}`} onClick={() => switchView("login")}>返回登录</button>
        )}
      </div>
    </form>
  );
}

function inputShellClass(isDark: boolean, error?: string) {
  const base = "flex h-[46px] w-full items-center gap-2 rounded-[10px] border px-3.5 transition-[border-color,box-shadow] focus-within:shadow-[0_0_0_3px_rgba(147,108,255,0.22)]";
  if (error) {
    return `${base} ${isDark ? "border-red-400/80 bg-red-500/[0.06]" : "border-red-500/70 bg-red-50"}`;
  }
  return `${base} ${isDark ? "border-[#545454] bg-[#222] focus-within:border-[#936CFF]" : "border-black/20 bg-white focus-within:border-[#936CFF]"}`;
}

function AuthInput({
  isDark,
  value,
  onChange,
  placeholder,
  error,
  trailing,
  type = "text",
  name,
  autoComplete,
  inputMode,
  maxLength,
}: {
  isDark: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  trailing?: ReactNode;
  type?: string;
  name?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  const textColor = isDark ? "text-white" : "text-black/90";
  // 与 SparkX 一致：出错时占位文字也变红
  const placeholderColor = error
    ? isDark ? "placeholder:text-red-300/80" : "placeholder:text-red-500/80"
    : isDark ? "placeholder:text-[#7d7d7d]" : "placeholder:text-black/40";
  return (
    <div>
      <div className={inputShellClass(isDark, error)}>
        <input
          type={type}
          name={name}
          value={value}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className={`h-full min-w-0 flex-1 bg-transparent text-sm outline-none ${textColor} ${placeholderColor}`}
        />
        {trailing}
      </div>
      {error && <p className={`mt-1 text-left text-[12px] font-medium ${isDark ? "text-red-300" : "text-red-600"}`}>{error}</p>}
    </div>
  );
}

function PasswordInput(props: Omit<Parameters<typeof AuthInput>[0], "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthInput
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className={`shrink-0 transition-colors ${props.isDark ? "text-[#7d7d7d] hover:text-white" : "text-black/40 hover:text-black/80"}`}
          aria-label={visible ? "隐藏密码" : "显示密码"}
        >
          {visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      }
    />
  );
}
