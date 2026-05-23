/**
 * ProfilePage — personal homepage detail page
 * Presents the current user's public profile overview while preserving the artx visual language.
 */
import { Mail, MapPin, Pencil, Sparkles, UserRound } from "lucide-react";
import TopBar from "@/components/workspace/TopBar";
import { BG_GLOW } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";

export default function ProfilePage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const textPrimary = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.88)";
  const textSecondary = isDark ? "rgba(255,255,255,0.56)" : "rgba(20,20,36,0.56)";
  const textMuted = isDark ? "rgba(255,255,255,0.36)" : "rgba(20,20,36,0.36)";
  const cardBg = isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.76)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(20,20,36,0.10)";

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        background: isDark ? "oklch(0.09 0.012 270)" : "oklch(0.975 0.004 80)",
        color: textPrimary,
      }}
    >
      <TopBar credits={75} />
      <main className="relative flex-1 overflow-y-auto px-8 py-8">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: BG_GLOW }} />
        <div className="relative mx-auto max-w-5xl">
          <section
            className="overflow-hidden rounded-[var(--radius-xl-design)]"
            style={{
              background: cardBg,
              border: `1px solid ${border}`,
              boxShadow: isDark ? "0 24px 72px rgba(0,0,0,0.34)" : "0 24px 72px rgba(20,20,36,0.10)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div
              className="h-40"
              style={{
                background:
                  "radial-gradient(circle at 16% 20%, oklch(0.68 0.20 290 / 0.45), transparent 30%), radial-gradient(circle at 72% 28%, oklch(0.68 0.18 210 / 0.38), transparent 34%), linear-gradient(135deg, oklch(0.22 0.04 275), oklch(0.14 0.025 250))",
              }}
            />
            <div className="px-8 pb-8">
              <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="flex items-end gap-5">
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-[28px]"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                      border: `4px solid ${isDark ? "oklch(0.13 0.012 270)" : "white"}`,
                      boxShadow: "0 18px 36px oklch(0.58 0.22 290 / 0.28)",
                    }}
                  >
                    <UserRound size={34} color="white" />
                  </div>
                  <div className="pb-2">
                    <h1 className="type-title-sm" style={{ color: textPrimary, fontSize: 26, fontWeight: 680 }}>09bee</h1>
                    <p className="type-body-sm mt-1" style={{ color: textSecondary }}>artx 创作者个人主页</p>
                  </div>
                </div>
                <button
                  onClick={() => toast("编辑资料", { description: "功能即将上线" })}
                  className="flex items-center gap-2 rounded-[var(--radius-lg-design)] px-4 py-2 type-caption transition-opacity hover:opacity-85"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(20,20,36,0.06)",
                    border: `1px solid ${border}`,
                    color: textPrimary,
                  }}
                >
                  <Pencil size={14} />
                  编辑资料
                </button>
              </div>

              <div className="mt-7 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div
                  className="rounded-[var(--radius-lg-design)] p-5"
                  style={{ background: isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.52)", border: `1px solid ${border}` }}
                >
                  <p className="type-body-sm mb-3" style={{ color: textPrimary, fontWeight: 560 }}>个人简介</p>
                  <p className="type-body-sm leading-7" style={{ color: textSecondary }}>
                    专注品牌视觉、社媒内容与 AI 辅助创作流程。这里用于展示用户的公开信息、创作偏好与项目概览，后续可接入真实账号资料和作品数据。
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {['品牌视觉', 'AI 创作', '模板设计', '灵感整理'].map(tag => (
                      <span
                        key={tag}
                        className="rounded-[var(--radius-pill)] px-3 py-1 type-caption"
                        style={{ background: isDark ? "rgba(255,255,255,0.07)" : "rgba(20,20,36,0.06)", color: textSecondary }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-[var(--radius-lg-design)] p-5"
                  style={{ background: isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.52)", border: `1px solid ${border}` }}
                >
                  <p className="type-body-sm mb-4" style={{ color: textPrimary, fontWeight: 560 }}>账号信息</p>
                  <div className="space-y-3 type-caption" style={{ color: textSecondary }}>
                    <div className="flex items-center gap-2"><Mail size={14} style={{ color: textMuted }} /> 09bee@artx.design</div>
                    <div className="flex items-center gap-2"><MapPin size={14} style={{ color: textMuted }} /> 中国 · 远程协作</div>
                    <div className="flex items-center gap-2"><Sparkles size={14} style={{ color: textMuted }} /> 已创建 12 个项目</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
