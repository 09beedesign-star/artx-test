import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { PhoneAuthPanel } from "./PhoneAuthPanel";
import LegacyLoginRegisterDialog from "./LegacyLoginRegisterDialog";
import { useAuthFeatures } from "./useAuthFeatures";

// Global Login / Register Dialog
// 首页使用 HomePage 内部的 CenteredAuthDialog；其它场景统一使用这个居中弹窗。
// 表单本体是 PhoneAuthPanel（登录 / 注册 / 重置三视图，流程对齐 sparkx.zone）。
export default function LoginRegisterDialog() {
  // 开关（ARTX_PHONE_AUTH_ENABLED）：关 → 原 ArtX 登录界面；开 → 手机号三视图 + 老账号入口。
  const features = useAuthFeatures();
  const { loginModalOpen } = useAuth();
  if (!features) return loginModalOpen ? <AuthFeaturesLoading /> : null;
  if (!features.phoneAuth) return <LegacyLoginRegisterDialog />;
  return <PhoneLoginRegisterDialog />;
}

function AuthFeaturesLoading() {
  return <div className="fixed inset-0 z-[9999] bg-black/[0.06]" aria-busy="true" />;
}

function PhoneLoginRegisterDialog() {
  const { loginModalOpen, closeLoginModal } = useAuth();
  const { mode: themeMode } = useTheme();
  const isDark = themeMode === "dark";
  // 每次打开都重新挂载面板，回到登录视图、清空上次输入与错误态。
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => {
    if (loginModalOpen) setOpenKey((value) => value + 1);
  }, [loginModalOpen]);

  if (!loginModalOpen) return null;

  const overlayBg = isDark ? "bg-[#222222]/30" : "bg-black/[0.06]";
  const closeBtn = isDark
    ? "bg-[#222222]/90 border-white/15 text-white/70 hover:border-white/35 hover:text-white"
    : "bg-white/95 border-black/12 text-black/65 hover:border-black/25 hover:text-black";
  const panel = isDark
    ? "bg-[#222222]/70 border-[#454545] shadow-[0_30px_80px_rgba(0,0,0,0.52)]"
    : "bg-white/85 border-black/10 shadow-[0_30px_80px_rgba(0,0,0,0.18)]";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 py-8 ${overlayBg}`}
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeLoginModal();
      }}
    >
      {/* 高度随内容自适应；视口过矮时靠 max-h + 内部滚动兜底。 */}
      <div className="relative max-h-full w-full max-w-[472px]">
        <button
          type="button"
          onClick={closeLoginModal}
          className={`absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-[18px] transition-colors ${closeBtn}`}
          aria-label="关闭登录窗口"
        >
          <X size={16} />
        </button>

        <div data-artx-dialog-surface className={`max-h-full w-full overflow-y-auto rounded-[20px] border p-10 backdrop-blur-[22px] ${panel}`}>
          <PhoneAuthPanel key={openKey} isDark={isDark} onSuccess={closeLoginModal} />
        </div>
      </div>
    </div>
  );
}
