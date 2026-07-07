import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type ResetStep = "email" | "code" | "ready" | "password";

export default function ForgotPasswordDialog({
  open,
  initialEmail = "",
  onClose,
  onBackToLogin,
}: {
  open: boolean;
  initialEmail?: string;
  onClose: () => void;
  onBackToLogin?: () => void;
}) {
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("email");
    setEmail(initialEmail);
    setCode("");
    setIssuedCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setBusy(false);
  }, [initialEmail, open]);

  const passwordMismatch = Boolean(confirmPassword && newPassword !== confirmPassword);
  const passwordReady = newPassword.trim().length >= 8 && confirmPassword.trim().length >= 8 && !passwordMismatch;
  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (step === "email") return Boolean(email.trim());
    if (step === "code") return Boolean(code.trim());
    if (step === "password") return passwordReady;
    return false;
  }, [busy, code, email, passwordReady, step]);

  if (!open) return null;

  const handleSendCode = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("请输入邮件地址");
      return;
    }
    setBusy(true);
    setError("");
    const result = await requestPasswordReset(normalizedEmail);
    setBusy(false);
    if (!result.ok || !result.resetToken) {
      setError(result.error || "验证码发送失败，请稍后重试");
      return;
    }
    setIssuedCode(result.resetToken);
    setCode("");
    setStep("code");
    toast.success("验证码已发送", { description: "请到邮箱复制验证码后继续。" });
  };

  const handleConfirmCode = () => {
    if (!code.trim()) {
      setError("请输入邮箱里的验证码");
      return;
    }
    if (code.trim() !== issuedCode) {
      setError("验证码不正确或已过期");
      return;
    }
    setError("");
    setStep("ready");
  };

  const handleResetPassword = async () => {
    if (!passwordReady) return;
    setBusy(true);
    setError("");
    const result = await resetPassword(issuedCode, newPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "密码修改失败");
      return;
    }
    toast.success("密码修改成功", { description: "请使用新密码重新登录。" });
    onClose();
    onBackToLogin?.();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#222222]/45 px-4 py-8"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[430px] rounded-[18px] border border-white/12 bg-[#222222]/95 p-6 text-white shadow-[0_28px_80px_rgba(0,0,0,0.48)] backdrop-blur-[22px]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md bg-white/6 text-white/64 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="关闭忘记密码弹窗"
        >
          <X size={15} />
        </button>

        {step === "ready" ? (
          <div className="pt-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#936CFF]/18 text-[#A98AFF]">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="mt-4 text-[22px] font-bold">验证码已确认</h2>
            <p className="mt-3 text-sm leading-6 text-white/66">
              请尽快修改密码，修改完成后再使用新密码登录。
            </p>
            <button
              type="button"
              onClick={() => setStep("password")}
              className="mt-6 text-sm font-semibold text-[#A98AFF] transition-colors hover:text-white"
            >
              修改密码
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[22px] font-bold">{step === "password" ? "修改密码" : "忘记密码"}</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              {step === "email" && "输入邮件地址后，我们会发送用于重置密码的验证码。"}
              {step === "code" && "复制邮箱中的验证码，填入下方输入框后确认。"}
              {step === "password" && "请输入新密码，并再次确认。支持中文、英文与大小写组合。"}
            </p>

            <div className="mt-6 grid gap-4">
              {step === "email" && (
                <PasswordInput
                  label="邮件地址"
                  value={email}
                  onChange={setEmail}
                  placeholder="请输入邮件地址"
                  autoComplete="email"
                />
              )}
              {step === "code" && (
                <PasswordInput
                  label="验证码"
                  value={code}
                  onChange={setCode}
                  placeholder="请输入邮箱验证码"
                  autoComplete="one-time-code"
                />
              )}
              {step === "password" && (
                <>
                  <PasswordInput
                    label="新密码"
                    type="password"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="至少 8 位，支持中英文和大小写"
                    autoComplete="new-password"
                  />
                  <PasswordInput
                    label="再次输入新密码"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="请再次输入新密码"
                    autoComplete="new-password"
                  />
                </>
              )}
            </div>

            <div className="mt-3 min-h-5 text-[13px] font-medium text-red-300">
              {passwordMismatch ? "两次密码不一致" : error}
            </div>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                if (step === "email") void handleSendCode();
                if (step === "code") handleConfirmCode();
                if (step === "password") void handleResetPassword();
              }}
              className="mt-3 h-11 w-full rounded-[10px] bg-[#936CFF] text-sm font-semibold text-white shadow-[0_10px_28px_rgba(147,108,255,0.26)] transition-all hover:bg-[#A384FF] disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
            >
              {busy ? "请稍候..." : step === "email" ? "发送" : step === "code" ? "确认" : "修改密码"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PasswordInput({
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
      <span className="mb-1.5 block text-[13px] font-medium text-white/88">{label}</span>
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
