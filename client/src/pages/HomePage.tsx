/**
 * HomePage — 首页
 * Design: Neo-Studio Dark
 * Layout: 欢迎区 + 快速入口卡片 + 最近项目
 */
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import TopBar from "@/components/workspace/TopBar";
import {
  Sparkles, LayoutGrid, Wand2, Image as ImageIcon,
  ArrowRight, Clock, ChevronRight,
} from "lucide-react";
import { PROJECTS, POSTER_1, POSTER_2, BRAND_KIT, SOCIAL_AD, BG_GLOW } from "@/lib/workspace-data";

const COVERS: Record<string, string> = {
  p1: POSTER_2, p2: BRAND_KIT, p3: POSTER_1, p4: SOCIAL_AD,
};

const QUICK_ACTIONS = [
  {
    id: "canvas",
    icon: Wand2,
    title: "AI 创作",
    desc: "用自然语言描述，AI 在画布上生成视觉素材",
    gradient: "linear-gradient(135deg, oklch(0.45 0.22 290), oklch(0.50 0.20 260))",
    glow: "oklch(0.55 0.22 290 / 0.35)",
    path: "/workspace",
  },
  {
    id: "template",
    icon: LayoutGrid,
    title: "从模板开始",
    desc: "浏览精选模板，快速启动你的创作项目",
    gradient: "linear-gradient(135deg, oklch(0.42 0.18 220), oklch(0.48 0.16 200))",
    glow: "oklch(0.50 0.18 220 / 0.30)",
    path: "/workspace",
  },
  {
    id: "import",
    icon: ImageIcon,
    title: "导入素材",
    desc: "上传图片或品牌资产，开始 AI 辅助编辑",
    gradient: "linear-gradient(135deg, oklch(0.42 0.18 160), oklch(0.48 0.16 140))",
    glow: "oklch(0.50 0.18 160 / 0.30)",
    path: "/workspace",
  },
];

export default function HomePage() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const bg = isDark ? "oklch(0.09 0.012 270)" : "oklch(0.94 0.006 270)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.15 0.008 270)";
  const sub = isDark ? "oklch(0.52 0.01 270)" : "oklch(0.50 0.01 270)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(0.97 0.004 270)";
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={75} />
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8" style={{ position: "relative", zIndex: 1 }}>
        {/* Welcome */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} style={{ color: "oklch(0.72 0.22 290)" }} />
            <span className="text-[12px] font-medium" style={{ color: "oklch(0.72 0.22 290)" }}>AI 创意工作台</span>
          </div>
          <h1 className="text-[28px] font-bold leading-tight mb-2" style={{ color: text }}>
            今天想创作什么？
          </h1>
          <p className="text-[14px]" style={{ color: sub }}>
            用 AI 的力量，将你的创意想法变成精美的视觉作品
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => navigate(action.path)}
                className="relative rounded-2xl p-5 text-left overflow-hidden group transition-all hover:scale-[1.02]"
                style={{
                  background: action.gradient,
                  boxShadow: `0 8px 32px ${action.glow}`,
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <Icon size={18} color="white" />
                </div>
                <p className="text-[14px] font-semibold text-white mb-1">{action.title}</p>
                <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.70)" }}>{action.desc}</p>
                <ArrowRight size={14} color="rgba(255,255,255,0.6)" className="absolute bottom-4 right-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            );
          })}
        </div>

        {/* Recent Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: sub }} />
              <span className="text-[14px] font-semibold" style={{ color: text }}>最近项目</span>
            </div>
            <button
              onClick={() => navigate("/workspace")}
              className="flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
              style={{ color: "oklch(0.62 0.22 290)" }}
            >
              查看全部
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {PROJECTS.slice(0, 4).map(project => (
              <button
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="rounded-xl overflow-hidden text-left group transition-all hover:scale-[1.02]"
                style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}
              >
                <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
                  {COVERS[project.id] ? (
                    <img src={COVERS[project.id]} alt={project.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.92 0.005 270)" }}>
                      <LayoutGrid size={24} style={{ color: sub }} />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[12px] font-semibold truncate" style={{ color: text }}>{project.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: sub }}>{project.updatedAt}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
