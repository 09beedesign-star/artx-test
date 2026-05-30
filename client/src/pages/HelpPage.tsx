/**
 * HelpPage — 帮助中心
 * Design: Neo-Studio Dark
 */
import { useTheme } from "@/contexts/ThemeContext";
import TopBar from "@/components/workspace/TopBar";
import { HelpCircle, ExternalLink, Sparkles } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";

const HELP_LINKS = [
  { label: "快速入门指南", desc: "了解 artx 的核心功能和基本操作", href: "#" },
  { label: "画布操作手册", desc: "节点、编组、自动布局等高级功能说明", href: "#" },
  { label: "AI 模型说明", desc: "各模型的能力范围与使用建议", href: "#" },
  { label: "常见问题", desc: "登录、积分、导出等常见问题解答", href: "#" },
  { label: "联系支持", desc: "遇到问题？联系我们的技术支持团队", href: "#" },
];

export default function HelpPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "oklch(0.88 0.006 255)";
  const hoverBg = isDark ? "oklch(0.16 0.012 270)" : "oklch(0.97 0.004 270)";

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.10, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} />
      </div>
      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="max-w-xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-14 h-14 rounded-[var(--radius-lg-design)] flex items-center justify-center mb-4" style={{ background: "oklch(0.62 0.22 290 / 0.12)" }}>
              <HelpCircle size={26} style={{ color: "oklch(0.62 0.22 290)" }} />
            </div>
            <h1 className="type-headline mb-2" style={{ color: text }}>帮助中心</h1>
            <p className="type-caption text-center" style={{ color: sub }}>查找文档、教程和常见问题解答</p>
          </div>

          {/* Help links */}
          <div className="flex flex-col gap-2">
            {HELP_LINKS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3.5 rounded-[var(--radius-lg-design)] transition-all group"
                style={{ background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = cardBg)}
              >
                <div>
                  <p className="type-caption mb-0.5" style={{ color: text, textTransform: "none", letterSpacing: "0.02em", fontWeight: 500 }}>{item.label}</p>
                  <p className="type-caption" style={{ color: sub, fontSize: 11 }}>{item.desc}</p>
                </div>
                <ExternalLink size={14} style={{ color: sub, flexShrink: 0, marginLeft: 12 }} />
              </a>
            ))}
          </div>

          {/* Footer badge */}
          <div className="flex justify-center mt-8">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-pill)] type-caption" style={{ background: "oklch(0.62 0.22 290 / 0.10)", color: "oklch(0.62 0.22 290)" }}>
              <Sparkles size={11} />
              更多文档即将完善
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
