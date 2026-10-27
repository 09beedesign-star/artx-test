import { X, Gift } from "lucide-react";
import { PhoneAuthPanel } from "./PhoneAuthPanel";
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
export function CenteredAuthDialog({
  open,
  onClose,
  defaultMode = "login",
  inviteCode = "",
}: CenteredAuthDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // 主题颜色
  const textPrimary = isDark ? "#ffffff" : "#2c2c2b";
  const textSecondary = isDark ? "#86868b" : "#6a6a6b";
  const textMuted = isDark ? "#7d7d7d" : "#8e8b86";
  const bgOverlay = isDark ? "rgba(34,34,34,0.72)" : "rgba(255,255,255,0.90)";

  if (!open) return null;

  /*
   * 表单本体 = PhoneAuthPanel（登录 / 注册 / 重置三视图，流程结构对齐 sparkx.zone）。
   * 本组件只负责 ArtX 自己的弹窗外壳 + 邀请落地提示。
   */
  const inviteBanner = inviteCode ? (
    <div
      className="mt-5 rounded-[12px] border px-4 py-3"
      style={{
        borderColor: isDark ? "rgba(147,108,255,0.35)" : "rgba(147,108,255,0.25)",
        backgroundColor: isDark ? "rgba(147,108,255,0.12)" : "rgba(147,108,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: textPrimary }}>
        <Gift size={15} className="text-[#C4AEFF]" />
        好友邀请你加入 ArtX Studio
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: textSecondary }}>
        邀请码{" "}
        <span className="font-mono font-semibold text-[#C4AEFF]">{inviteCode}</span>{" "}
        已自动填好，无需手动输入。 注册后完成首次付费（满 HKD{" "}
        {INVITE_REWARD_CONFIG.minPaidAmountHkd}）， 你可得{" "}
        {INVITE_REWARD_CONFIG.inviteeCredits} 积分，邀请你的好友可得{" "}
        {INVITE_REWARD_CONFIG.inviterCredits} 积分。
      </p>
    </div>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
      style={{ background: bgOverlay, backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="relative max-h-full w-full max-w-[440px] overflow-y-auto rounded-[20px] border p-10 backdrop-blur-[22px]"
        style={{
          borderColor: isDark ? "#454545" : "#f0efed",
          backgroundColor: isDark ? "rgba(34, 34, 34, 0.95)" : "rgba(255, 255, 255, 0.98)",
          boxShadow: isDark ? "0 30px 80px rgba(0,0,0,0.52)" : "0 30px 80px rgba(0,0,0,0.12)",
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

        <PhoneAuthPanel
          isDark={isDark}
          initialView={defaultMode}
          onSuccess={onClose}
          banner={inviteBanner}
        />
      </div>
    </div>
  );
}
