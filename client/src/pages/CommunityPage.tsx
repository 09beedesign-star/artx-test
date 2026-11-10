/**
 * CommunityPage — 创作社区（占位页）
 */
import { useTheme } from "@/contexts/ThemeContext";
import { Users, Sparkles } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";

export default function CommunityPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "#161616" : "var(--design-surface-soft)";
  const text = isDark ? "#161616" : "#161616";
  const sub = isDark ? "#777472" : "#99999e";

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.10, zIndex: 0 }} />
      )}
      <div className="flex-1 flex flex-col items-center justify-center" style={{ position: "relative", zIndex: 1, gap: "var(--space-md)" }}>
        <div className="w-16 h-16 rounded-[var(--radius-lg-design)] flex items-center justify-center" style={{ background: "rgba(22,22,22,0.08)" }}>
          <Users size={28} style={{ color: "#161616" }} />
        </div>
        <p className="type-headline" style={{ color: text }}>创作社区</p>
        <p className="type-caption" style={{ color: sub }}>即将上线，敬请期待</p>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-pill)] type-caption" style={{ background: "rgba(22,22,22,0.10)", color: "#161616" }}>
          <Sparkles size={11} />
          Coming Soon
        </div>
      </div>
    </div>
  );
}
