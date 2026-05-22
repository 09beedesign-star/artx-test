/**
 * HomePage — 首页
 * Design: Neo-Studio Dark
 * Layout: TopBar + 居中英雄区（标题 + AI输入框）+ 快速入口卡片 + 最近项目
 * AI Input: Lovart 风格 — 大圆角深色输入框，底部工具行（附件/模型/发送）
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import TopBar from "@/components/workspace/TopBar";
import {
  Sparkles, LayoutGrid, Wand2, Image as ImageIcon,
  ArrowRight, Clock, ChevronRight, Paperclip, ChevronDown,
  Send, Mic, X, Check, MoreHorizontal, Pencil, Copy, Trash2,
} from "lucide-react";
import { PROJECTS, POSTER_1, POSTER_2, BRAND_KIT, SOCIAL_AD, BG_GLOW, AI_MODELS } from "@/lib/workspace-data";

// ── Home Project Card Menu ────────────────────────────────────
function HomeCardMenu({ isDark }: { isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const bg = isDark ? "rgba(18,18,26,0.97)" : "rgba(248,248,252,0.97)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const hoverBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

  const items = [
    { icon: <Pencil size={13} />, label: "重命名" },
    { icon: <Copy size={13} />, label: "创建副本" },
    { divider: true },
    { icon: <Trash2 size={13} />, label: "删除", danger: true },
  ];

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: open
            ? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)")
            : (isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.80)"),
          color: isDark ? "white" : "#333",
          backdropFilter: "blur(6px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-1.5 right-0 rounded-xl overflow-hidden z-50"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            minWidth: 152,
            boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            backdropFilter: "blur(16px)",
          }}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} style={{ height: 1, background: border, margin: "2px 0" }} />
            ) : (
              <button
                key={i}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[12px] text-left transition-colors"
                style={{ color: item.danger ? "oklch(0.65 0.22 25)" : textColor }}
                onMouseEnter={e => (e.currentTarget.style.background = item.danger ? "oklch(0.65 0.22 25 / 0.10)" : hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => setOpen(false)}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

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

const PROMPT_SUGGESTIONS = [
  "设计一套跑鞋产品落地页视觉素材",
  "为咖啡品牌生成品牌视觉系统",
  "创作一组电商促销海报",
  "制作品牌社交媒体内容套件",
];

// ── Lovart-style AI Input Box ──────────────────────────────────
function HeroInputBox({ isDark, onSubmit }: { isDark: boolean; onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea — min 320px, max 380px within the 460px box
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 140), 180) + "px";
  }, [value]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const boxBg = isDark ? "oklch(0.20 0.015 270)" : "oklch(0.97 0.004 270)";
  const boxBorder = focused
    ? "oklch(0.62 0.22 290 / 0.70)"
    : hovered
      ? (isDark ? "oklch(1 0 0 / 0.18)" : "oklch(0.52 0.22 290 / 0.22)")
      : isDark ? "oklch(1 0 0 / 0.10)" : "oklch(0 0 0 / 0.10)";
  const textColor = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.15 0.008 270)";
  const subColor = isDark ? "oklch(0.45 0.01 270)" : "oklch(0.55 0.01 270)";
  const dividerColor = isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.08)";
  const toolBtnBg = isDark ? "oklch(1 0 0 / 0.06)" : "oklch(0 0 0 / 0.05)";
  const toolBtnHover = isDark ? "oklch(1 0 0 / 0.10)" : "oklch(0 0 0 / 0.08)";

  return (
    <div
      className="w-full rounded-3xl"
      style={{
        background: boxBg,
        border: `1.5px solid ${boxBorder}`,
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        boxShadow: focused
          ? `0 0 0 4px oklch(0.62 0.22 290 / 0.12), 0 24px 64px oklch(0 0 0 / 0.28)`
          : hovered
            ? (isDark
                ? `0 0 0 2px oklch(0.62 0.22 290 / 0.08), 0 20px 60px oklch(0 0 0 / 0.28)`
                : `0 0 0 2px oklch(0.52 0.22 290 / 0.10), 0 20px 56px oklch(0 0 0 / 0.12)`)
            : `0 12px 48px oklch(0 0 0 / 0.18)`,
        backdropFilter: "blur(20px)",
        transform: hovered && !focused ? "scale(1.008)" : "scale(1)",
        transition: "transform 0.35s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.35s cubic-bezier(0.23, 1, 0.32, 1), border-color 0.25s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Textarea — fills the box */}
      <div className="flex-1 px-6 pt-6 pb-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="今天想设计什么？描述你的创意想法…"
          rows={4}
          className="w-full h-full resize-none bg-transparent outline-none leading-relaxed"
          style={{
            color: textColor,
            caretColor: "oklch(0.72 0.22 290)",
            fontSize: 16,
            minHeight: 140,
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: dividerColor, margin: "0 16px" }} />

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-3 py-2.5">
        {/* Left tools */}
        <div className="flex items-center gap-1">
          {/* Attachment */}
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
            style={{ color: subColor }}
            onMouseEnter={e => (e.currentTarget.style.background = toolBtnBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => {}}
          >
            <Paperclip size={14} />
            <span>添加参考图</span>
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: dividerColor, margin: "0 4px" }} />

          {/* Model selector */}
          <div ref={modelRef} className="relative">
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
              style={{ color: subColor }}
              onMouseEnter={e => (e.currentTarget.style.background = toolBtnBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              onClick={() => setModelOpen(o => !o)}
            >
              <span>{selectedModel.label}</span>
              <ChevronDown size={12} style={{ opacity: 0.6 }} />
            </button>

            {/* Model dropdown */}
            {modelOpen && (
              <div
                className="absolute bottom-full mb-2 left-0 rounded-xl overflow-hidden shadow-2xl z-50"
                style={{
                  background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.97 0.004 270)",
                  border: `1px solid ${dividerColor}`,
                  minWidth: 200,
                  backdropFilter: "blur(16px)",
                }}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: dividerColor }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: subColor }}>选择模型</p>
                </div>
                {AI_MODELS.map(model => (
                  <button
                    key={model.id}
                    className="flex items-center justify-between w-full px-3 py-2.5 text-left text-[12px] transition-colors"
                    style={{ color: textColor }}
                    onMouseEnter={e => (e.currentTarget.style.background = toolBtnHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { setSelectedModel(model); setModelOpen(false); }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-full" style={{ background: model.color }} />
                      <div>
                        <p className="font-medium">{model.label}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: subColor }}>{model.vendor}</p>
                      </div>
                    </div>
                    {selectedModel.id === model.id && (
                      <Check size={13} style={{ color: "oklch(0.72 0.22 290)" }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: mic + send */}
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: subColor }}
            onMouseEnter={e => (e.currentTarget.style.background = toolBtnBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <Mic size={15} />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
            style={{
              background: value.trim()
                ? "linear-gradient(135deg, oklch(0.55 0.22 290), oklch(0.50 0.20 260))"
                : isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.06)",
              color: value.trim() ? "white" : subColor,
              boxShadow: value.trim() ? "0 4px 12px oklch(0.55 0.22 290 / 0.40)" : "none",
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const bg = isDark ? "oklch(0.09 0.012 270)" : "#F5F5F5";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.52 0.01 270)" : "oklch(0.50 0.012 255)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "oklch(0.88 0.006 255)";
  const chipBg = isDark ? "oklch(1 0 0 / 0.06)" : "oklch(0.93 0.010 290 / 0.5)";
  const chipBorder = isDark ? "oklch(1 0 0 / 0.10)" : "oklch(0.52 0.22 290 / 0.18)";

  const handlePromptSubmit = (text: string) => {
    // Navigate to workspace with the prompt as a query param (future: pass to canvas)
    navigate("/workspace");
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={75} />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        {/* ── Hero Section: 垂直居中，占屏幕约 50% ── */}
        <div
          className="flex flex-col items-center justify-center px-8"
          style={{ minHeight: "50vh", paddingTop: "5vh", paddingBottom: "4vh" }}
        >
          {/* Badge */}
          <div className="flex items-center gap-2 mb-5">
            <Sparkles size={14} style={{ color: "oklch(0.72 0.22 290)" }} />
            <span className="text-[12px] font-medium tracking-wide" style={{ color: "oklch(0.72 0.22 290)" }}>
              AI 创意工作台
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-[32px] font-bold leading-tight mb-2 text-center"
            style={{ color: text, letterSpacing: "-0.02em" }}
          >
            今天想创作什么？
          </h1>
          <p className="text-[14px] mb-8 text-center" style={{ color: sub }}>
            用 AI 的力量，将你的创意想法变成精美的视觉作品
          </p>

          {/* AI Input Box — Lovart style */}
          <div className="w-full" style={{ maxWidth: 680 }}>
            <HeroInputBox isDark={isDark} onSubmit={handlePromptSubmit} />
          </div>

          {/* Prompt suggestion chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4" style={{ maxWidth: 680 }}>
            {PROMPT_SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="px-3 py-1.5 rounded-full text-[12px] transition-all hover:opacity-80 active:scale-95"
                style={{
                  background: chipBg,
                  border: `1px solid ${chipBorder}`,
                  color: sub,
                }}
                onClick={() => handlePromptSubmit(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* ── Below fold: Quick Actions + Recent Projects ── */}
        <div className="px-8 pb-10">
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
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="rounded-xl overflow-hidden text-left group transition-all hover:scale-[1.02] cursor-pointer"
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
                    {/* ... menu bottom-right */}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <HomeCardMenu isDark={isDark} />
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-[12px] font-semibold truncate" style={{ color: text }}>{project.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: sub }}>{project.updatedAt}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
