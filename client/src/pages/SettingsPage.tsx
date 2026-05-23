/**
 * SettingsPage — placeholder settings page
 * Keeps the existing artx visual language while the detailed settings modules are pending.
 */
import { Settings, Sparkles } from "lucide-react";
import TopBar from "@/components/workspace/TopBar";
import { BG_GLOW } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

export default function SettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const textPrimary = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.88)";
  const textSecondary = isDark ? "rgba(255,255,255,0.48)" : "rgba(20,20,36,0.52)";
  const cardBg = isDark ? "oklch(0.11 0.015 270 / 0.78)" : "oklch(1 0 0 / 0.78)";
  const cardBorder = isDark ? "oklch(1 0 0 / 8%)" : "var(--hairline)";

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        background: isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)",
        position: "relative",
        transition: "background 0.25s ease",
      }}
    >
      {isDark && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${BG_GLOW})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.14,
            zIndex: 0,
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={75} />
      </div>

      <main className="flex-1 overflow-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center px-6 py-12">
          <section
            className="w-full rounded-[var(--radius-lg-design)] border p-8 text-center backdrop-blur-xl"
            style={{ background: cardBg, borderColor: cardBorder, boxShadow: "var(--design-shadow-soft)" }}
          >
            <div
              className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[var(--radius-md-design)]"
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                boxShadow: "0 10px 28px oklch(0.58 0.22 290 / 0.26)",
              }}
            >
              <Settings size={20} color="white" />
            </div>
            <div className="mb-2 flex items-center justify-center gap-2" style={{ color: textPrimary }}>
              <Sparkles size={15} style={{ color: "oklch(0.72 0.18 200)" }} />
              <h1 className="type-title-sm" style={{ fontSize: 22, fontWeight: 650 }}>设置</h1>
            </div>
            <p className="type-body-sm leading-6" style={{ color: textSecondary }}>
              设置功能待定。当前页面已完成路由与入口连接，后续可在这里补充账号、偏好、通知与创作参数等配置项。
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
