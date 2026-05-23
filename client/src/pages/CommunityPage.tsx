/**
 * CommunityPage — 创作社区（占位页）
 */
import { useTheme } from "@/contexts/ThemeContext";
import TopBar from "@/components/workspace/TopBar";
import { Users, Sparkles } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";

export default function CommunityPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.10, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1, gap: "var(--space-md)" }}>
        <TopBar credits={75} />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center" style={{ position: "relative", zIndex: 1, gap: "var(--space-md)" }}>
        <div className="w-16 h-16 rounded-[var(--radius-lg-design)] flex items-center justify-center" style={{ background: "oklch(0.62 0.22 290 / 0.12)" }}>
          <Users size={28} style={{ color: "oklch(0.62 0.22 290)" }} />
        </div>
        <p className="type-headline" style={{ color: text }}>创作社区</p>
        <p className="type-caption" style={{ color: sub }}>即将上线，敬请期待</p>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-pill)] type-caption" style={{ background: "oklch(0.62 0.22 290 / 0.10)", color: "oklch(0.62 0.22 290)" }}>
          <Sparkles size={11} />
          Coming Soon
        </div>
      </div>
    </div>
  );
}
