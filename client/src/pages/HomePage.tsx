/**
 * HomePage — 首页
 * Design: Neo-Studio Dark
 * Layout: TopBar + 居中英雄区（标题 + AI输入框）+ 快速入口卡片 + 最近项目
 * AI Input: artx 风格 — 大圆角深色输入框，底部工具行（附件/模型/发送）
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import TopBar from "@/components/workspace/TopBar";
import {
  Sparkles, LayoutGrid, Paperclip, ChevronDown,
  Send, Mic, Check, MoreHorizontal, Pencil, Copy, Trash2,
  PlayCircle, Heart,
} from "lucide-react";
import { POSTER_1, POSTER_2, BRAND_KIT, SOCIAL_AD, BG_GLOW, IMAGE_AI_MODELS } from "@/lib/workspace-data";
import {
  createWorkspaceHistoryProject,
  readWorkspaceProjectHistory,
  touchWorkspaceProjectHistory,
  type WorkspaceHistoryProject,
} from "@/lib/project-history";

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

  // 与工作台 CardMenu 完全一致的 token
  const bg = isDark ? "rgba(18,18,26,0.97)" : "rgba(248,248,252,0.97)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const hoverBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      {/* 触发按钮：与工作台一致 w-5 h-5 rounded-[var(--radius-md-design)]，无背景，仅 open 时微亮 */}
      <button
        className="w-5 h-5 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all active:scale-90"
        style={{
          background: open
            ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)")
            : "transparent",
          color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.012 255)",
        }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          className="absolute rounded-[var(--radius-lg-design)] overflow-hidden z-[9999]"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            minWidth: 160,
            boxShadow: "0 16px 48px rgba(0,0,0,0.40)",
            backdropFilter: "blur(20px)",
            bottom: "calc(100% + 8px)",
            right: 0,
          }}
        >
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: textColor }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { setOpen(false); toast("重命名", { description: "功能即将上线" }); }}
          >
            <Pencil size={13} />重命名
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: textColor }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { setOpen(false); toast("创建副本", { description: "功能即将上线" }); }}
          >
            <Copy size={13} />创建副本
          </button>
          <div style={{ height: 1, background: border, margin: "2px 0" }} />
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: "oklch(0.65 0.22 25)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.65 0.22 25 / 0.10)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { setOpen(false); toast("删除", { description: "功能即将上线" }); }}
          >
            <Trash2 size={13} />删除
          </button>
        </div>
      )}
    </div>
  );
}

const COMMUNITY_PROJECTS = [
  { id: "community-1", title: "未来跑鞋视觉实验", updatedAt: "社区精选", cover: POSTER_2, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-2", title: "咖啡品牌灵感板", updatedAt: "用户作品", cover: BRAND_KIT, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-3", title: "城市户外广告片", updatedAt: "社区精选", cover: POSTER_1, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-4", title: "智能设备发布海报", updatedAt: "用户作品", cover: SOCIAL_AD, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-5", title: "潮流服饰大片", updatedAt: "灵感推荐", cover: POSTER_1, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-6", title: "新消费包装系统", updatedAt: "社区精选", cover: BRAND_KIT, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-7", title: "运动科技主视觉", updatedAt: "用户作品", cover: POSTER_2, author: "Emma_Wilson", plays: "4478", likes: "125" },
  { id: "community-8", title: "社媒营销创意图", updatedAt: "灵感推荐", cover: SOCIAL_AD, author: "Emma_Wilson", plays: "4478", likes: "125" },
];

const PROMPT_SUGGESTIONS = [
  "产品海报",
  "品牌视觉",
  "社媒配图",
  "电商主图",
  "活动长图",
  "Logo 灵感",
  "包装设计",
];

const HOME_TYPEWRITER_PROMPT = "hello，欢迎来到。ArtX,正式开启你的。灵感AI创意之旅吧！";

// ── artx-style AI Input Box ──────────────────────────────────
function HeroInputBox({ isDark, onSubmit }: { isDark: boolean; onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(IMAGE_AI_MODELS[0]);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [typedPrompt, setTypedPrompt] = useState("");
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

  useEffect(() => {
    if (value.trim()) {
      setTypedPrompt("");
      return;
    }
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const typeOnce = () => {
      setTypedPrompt("");
      for (let i = 1; i <= HOME_TYPEWRITER_PROMPT.length; i += 1) {
        const charTimeout = setTimeout(() => {
          setTypedPrompt(HOME_TYPEWRITER_PROMPT.slice(0, i));
        }, i * 42);
        timeoutIds.push(charTimeout);
      }
      timeoutIds.push(setTimeout(typeOnce, 6000));
    };
    typeOnce();
    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [value]);

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
      className="w-full rounded-[var(--radius-xl-design)]"
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
      <div className="relative flex-1 px-6 pt-6 pb-3">
        {!value && typedPrompt && (
          <div
            className="pointer-events-none absolute left-6 right-6 top-6 leading-relaxed"
            style={{
              color: subColor,
              fontSize: 16,
              opacity: 0.72,
              whiteSpace: "pre-wrap",
            }}
          >
            {typedPrompt}
            <span style={{ opacity: 0.8 }}>｜</span>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder=""
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
          {/* Attachment — 触发隐藏文件选择器 */}
          <label
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-lg-design)] type-caption transition-colors cursor-pointer"
            style={{ color: subColor }}
            onMouseEnter={e => (e.currentTarget.style.background = toolBtnBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) toast("参考图已添加", { description: file.name });
                e.target.value = "";
              }}
            />
            <Paperclip size={14} />
            <span>添加参考图</span>
          </label>

          {/* Separator */}
          <div style={{ width: 1, height: 18, background: dividerColor, margin: "0 4px" }} />

          {/* Model selector */}
          <div ref={modelRef} className="relative">
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-lg-design)] type-caption transition-colors"
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
                className="absolute bottom-full mb-2 left-0 rounded-[var(--radius-lg-design)] overflow-hidden shadow-2xl z-50"
                style={{
                  background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.97 0.004 270)",
                  border: `1px solid ${dividerColor}`,
                  minWidth: 200,
                  backdropFilter: "blur(16px)",
                }}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: dividerColor }}>
                  <p className="type-caption uppercase tracking-wider" style={{ color: subColor }}>选择模型</p>
                </div>
                {IMAGE_AI_MODELS.map(model => (
                  <button
                    key={model.id}
                    className="flex items-center justify-between w-full px-3 py-2.5 text-left type-caption transition-colors"
                    style={{ color: textColor }}
                    onMouseEnter={e => (e.currentTarget.style.background = toolBtnHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { setSelectedModel(model); setModelOpen(false); }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-[var(--radius-pill)]" style={{ background: model.color }} />
                      <div>
                        <p className="type-caption" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{model.label}</p>
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
            className="w-8 h-8 rounded-[var(--radius-lg-design)] flex items-center justify-center transition-colors"
            style={{ color: subColor }}
            onMouseEnter={e => (e.currentTarget.style.background = toolBtnBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => toast("语音输入", { description: "功能即将上线" })}
          >
            <Mic size={15} />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="w-8 h-8 rounded-[var(--radius-lg-design)] flex items-center justify-center transition-all active:scale-95"
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
  const { isAuthenticated, openLoginModal } = useAuth();
  const isDark = resolvedTheme === "dark";

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.52 0.01 270)" : "oklch(0.50 0.012 255)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "oklch(0.88 0.006 255)";
  const chipBg = isDark ? "oklch(1 0 0 / 0.06)" : "oklch(1 0 0 / 0.75)";
  const chipBorder = isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.08)";
  const [recentProjects, setRecentProjects] = useState<WorkspaceHistoryProject[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setRecentProjects(readWorkspaceProjectHistory());
  }, [isAuthenticated]);

  const handleRecentProjectOpen = (projectId: string) => {
    touchWorkspaceProjectHistory(projectId);
    setRecentProjects(readWorkspaceProjectHistory());
    navigate(`/project/${projectId}`);
  };

  const handlePromptSubmit = (text: string) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const title = text.length > 18 ? `${text.slice(0, 18)}...` : text;
    const project = createWorkspaceHistoryProject(title || undefined, text);
    sessionStorage.setItem("artx:pending-home-prompt", JSON.stringify({
      projectId: project.id,
      prompt: text,
      createdAt: project.createdAt,
    }));
    toast("已创建新画布", { description: text.slice(0, 80) });
    navigate(`/project/${project.id}`);
  };

  const handleSuggestionClick = (suggestion: string) => {
    navigate(`/inspiration?topic=${encodeURIComponent(suggestion)}`);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} />
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
            <span className="type-caption" style={{ color: "oklch(0.72 0.22 290)" }}>
              artx
            </span>
          </div>

          {/* Headline */}
          <h1
            className="type-display-lg mb-2 text-center"
            style={{ color: text, letterSpacing: "-0.02em" }}
          >
            今天想创作什么？
          </h1>
          <p className="type-body-sm mb-8 text-center" style={{ color: sub }}>
            用 AI 的力量，将你的创意想法变成精美的视觉作品
          </p>

          {/* AI Input Box — artx style */}
          <div className="w-full" style={{ maxWidth: 680 }}>
            <HeroInputBox isDark={isDark} onSubmit={handlePromptSubmit} />
          </div>

          <div
            className="flex items-center gap-2 mt-4 overflow-x-auto overflow-y-hidden"
            style={{ width: "100%", maxWidth: 680, whiteSpace: "nowrap", scrollbarWidth: "none" }}
          >
            {PROMPT_SUGGESTIONS.map((suggestion, index) => (
              <button
                key={index}
                className="type-caption px-3 py-1.5 rounded-[var(--radius-pill)] transition-all hover:opacity-80 active:scale-95 shrink-0"
                style={{
                  background: chipBg,
                  border: `1px solid ${chipBorder}`,
                  color: sub,
                }}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
            </div>
        </div>

        {isAuthenticated && (
          <div className="px-8 pb-10">
            <div className="mb-5 text-center">
              <h2
                className="type-headline"
                style={{
                  color: text,
                  fontFamily: "SimHei, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif",
                  fontWeight: 900,
                  letterSpacing: "0.02em",
                }}
              >
                最近项目
              </h2>
            </div>

            <div
              className="flex gap-3 overflow-x-auto overflow-y-hidden pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {recentProjects.map(project => (
                <div
                  key={project.id}
                  onClick={() => handleRecentProjectOpen(project.id)}
                  className="shrink-0 rounded-[var(--radius-lg-design)] overflow-hidden text-left group transition-all hover:scale-[1.02] cursor-pointer"
                  style={{ width: 220, background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
                    {project.cover ? (
                      <img src={project.cover} alt={project.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: isDark ? "oklch(0.16 0.014 270)" : "oklch(0.94 0.006 255)", color: sub }}>
                        <LayoutGrid size={22} />
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="type-caption truncate" style={{ color: text, textTransform: "none", letterSpacing: "0.02em" }}>{project.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <p className="type-caption" style={{ color: sub, fontSize: 11 }}>{project.updatedAt}</p>
                      <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <HomeCardMenu isDark={isDark} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Below fold: Inspiration Discovery ── */}
        <div className="px-8 pb-10">
          <div>
            <div className="mb-5 text-center">
              <h2
                className="type-headline"
                style={{
                  color: text,
                  fontFamily: "SimHei, 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', sans-serif",
                  fontWeight: 900,
                  letterSpacing: "0.02em",
                }}
              >
                灵感发现
              </h2>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {COMMUNITY_PROJECTS.map(project => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="rounded-[var(--radius-lg-design)] overflow-hidden text-left group transition-all hover:scale-[1.02] cursor-pointer"
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
                    {project.cover ? (
                      <img src={project.cover} alt={project.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.92 0.005 270)" }}>
                        <LayoutGrid size={24} style={{ color: sub }} />
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0" aria-label={`${project.author} 的作品数据`}>
                      <div
                        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, oklch(0.86 0.08 45), oklch(0.70 0.12 25))",
                          border: `1px solid ${isDark ? "oklch(1 0 0 / 0.14)" : "oklch(0 0 0 / 0.08)"}`,
                          color: "oklch(0.20 0.015 45)",
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "-0.03em",
                        }}
                      >
                        EW
                      </div>
                      <span
                        className="shrink-0"
                        style={{
                          color: text,
                          fontSize: 16,
                          lineHeight: "28px",
                          fontWeight: 500,
                          letterSpacing: "-0.03em",
                          minWidth: 106,
                        }}
                      >
                        {project.author}
                      </span>
                      <div
                        className="ml-auto flex items-center gap-2 shrink-0"
                        style={{ color: isDark ? "oklch(0.72 0.006 270 / 0.72)" : "oklch(0.70 0.006 270)" }}
                      >
                        <span className="flex items-center gap-1" style={{ fontSize: 14, fontWeight: 500 }}>
                          <PlayCircle size={16} fill="currentColor" strokeWidth={0} />
                          {project.plays}
                        </span>
                        <span className="flex items-center gap-1" style={{ fontSize: 14, fontWeight: 500 }}>
                          <Heart size={16} fill="currentColor" strokeWidth={0} />
                          {project.likes}
                        </span>
                        <Sparkles size={16} fill="currentColor" strokeWidth={1.5} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="min-w-0">
                        <p className="type-caption truncate" style={{ color: text, textTransform: "none", letterSpacing: "0.02em" }}>{project.title}</p>
                        <p className="type-caption mt-0.5" style={{ color: sub, fontSize: 11 }}>{project.updatedAt}</p>
                      </div>
                      <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <HomeCardMenu isDark={isDark} />
                      </div>
                    </div>
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
