/**
 * HomePage — 首页
 * Design: Neo-Studio Dark
 * Layout: TopBar + 居中英雄区（标题 + AI输入框）+ 快速入口卡片 + 最近项目
 * AI Input: artx 风格 — 大圆角深色输入框，底部工具行（附件/模型/发送）
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import TopBar from "@/components/workspace/TopBar";
import {
  Sparkles, LayoutGrid, Paperclip, ChevronDown,
  Send, Mic, X, Check, MoreHorizontal, Pencil, Copy, Trash2, Eye, EyeOff,
  PlayCircle, Heart,
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
            onClick={() => setOpen(false)}
          >
            <Pencil size={13} />重命名
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: textColor }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => setOpen(false)}
          >
            <Copy size={13} />创建副本
          </button>
          <div style={{ height: 1, background: border, margin: "2px 0" }} />
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: "oklch(0.65 0.22 25)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.65 0.22 25 / 0.10)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => setOpen(false)}
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

const RECENT_PROJECT_COVERS = [POSTER_2, BRAND_KIT, POSTER_1, SOCIAL_AD, POSTER_1];
const RECENT_PROJECTS = PROJECTS.slice(0, 5).map((project, index) => ({
  ...project,
  cover: RECENT_PROJECT_COVERS[index % RECENT_PROJECT_COVERS.length],
}));

const PROMPT_SUGGESTIONS = [
  "产品海报",
  "品牌视觉",
  "社媒配图",
  "电商主图",
  "活动长图",
  "Logo 灵感",
  "包装设计",
  "落地页视觉",
];

// ── artx-style AI Input Box ──────────────────────────────────
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
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-lg-design)] type-caption transition-colors"
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
                {AI_MODELS.map(model => (
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
                        <p className="type-caption mt-0.5" style={{ color: subColor }}>{model.vendor}</p>
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

// ── Login / Register Dialog ───────────────────────────────────
function LoginRegisterDialog({ isDark }: { isDark: boolean }) {
  const { loginModalOpen, closeLoginModal, login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [provider, setProvider] = useState<"google" | "wechat" | "apple">("google");
  const [username, setUsername] = useState("09bee");
  const [password, setPassword] = useState("1234");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  if (!loginModalOpen) return null;

  const text = isDark ? "oklch(0.94 0.006 270)" : "oklch(0.97 0.004 270)";
  const muted = "oklch(0.68 0.018 275)";
  const dim = "oklch(0.52 0.018 275)";
  const border = "oklch(1 0 0 / 12%)";
  const inputBg = "oklch(1 0 0 / 7%)";
  const accentGradient = "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.68 0.18 220))";

  const visualCards = [
    { title: "Brand System", tone: "linear-gradient(135deg, oklch(0.18 0.035 280), oklch(0.34 0.12 300))", x: "-8%", y: "14%", w: "34%", h: 118, rotate: "-7deg" },
    { title: "AI Canvas", tone: "linear-gradient(135deg, oklch(0.20 0.05 245), oklch(0.48 0.18 220))", x: "18%", y: "0%", w: "40%", h: 148, rotate: "3deg" },
    { title: "Motion Mood", tone: "linear-gradient(135deg, oklch(0.16 0.04 270), oklch(0.55 0.20 290))", x: "56%", y: "18%", w: "34%", h: 124, rotate: "8deg" },
    { title: "Visual Grid", tone: "linear-gradient(135deg, oklch(0.13 0.03 270), oklch(0.44 0.15 185))", x: "2%", y: "55%", w: "38%", h: 132, rotate: "2deg" },
    { title: "Product Shot", tone: "linear-gradient(135deg, oklch(0.24 0.05 270), oklch(0.72 0.18 35))", x: "42%", y: "48%", w: "45%", h: 154, rotate: "-4deg" },
  ];

  const handleConfirm = () => {
    const normalizedUsername = username.trim();
    setError("");

    if (!normalizedUsername) {
      setError("请输入账号");
      return;
    }

    if (!password.trim()) {
      setError("请输入密码");
      return;
    }

    if (!login(normalizedUsername, password)) {
      setError("账号或密码错误，请重新输入");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto px-4 py-8"
      style={{
        background:
          "radial-gradient(circle at 50% -8%, oklch(0.36 0.15 285 / 0.40), transparent 34%), radial-gradient(circle at 18% 82%, oklch(0.48 0.18 220 / 0.28), transparent 30%), oklch(0.055 0.012 270)",
        color: text,
        backdropFilter: "blur(16px)",
      }}
    >
      <button
        className="fixed right-5 top-5 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{ background: "oklch(1 0 0 / 8%)", border: `1px solid ${border}`, color: muted, backdropFilter: "blur(18px)" }}
        onClick={closeLoginModal}
        aria-label="关闭登录窗口"
      >
        <X size={18} />
      </button>

      <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col items-center justify-center py-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] flex items-center justify-center" style={{ background: accentGradient, boxShadow: "0 16px 42px oklch(0.58 0.22 290 / 0.38)" }}>
            <Sparkles size={18} color="white" />
          </div>
          <div>
            <p className="type-body-sm" style={{ color: text }}>Art X</p>
            <p className="type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.02em" }}>Creative Design Workspace</p>
          </div>
        </div>

        <div className="relative w-full max-w-[1040px]">
          <div
            className="relative mx-auto h-[360px] w-full overflow-hidden rounded-[34px]"
            style={{
              background: "linear-gradient(180deg, oklch(0.10 0.024 270), oklch(0.075 0.018 270))",
              border: `1px solid ${border}`,
              boxShadow: "0 46px 120px rgba(0,0,0,0.62), inset 0 -1px 0 oklch(1 0 0 / 9%)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-28" style={{ background: "linear-gradient(180deg, oklch(0.20 0.06 260 / 0.75), transparent)" }} />
            <div className="absolute inset-x-[12%] bottom-0 h-32 rounded-t-[44px]" style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.72), oklch(0.68 0.18 220 / 0.66))", filter: "blur(2px)" }} />
            <div className="absolute left-8 top-8 right-8 flex items-center justify-between text-[10px] uppercase tracking-[0.24em]" style={{ color: "oklch(0.82 0.018 275 / 0.72)" }}>
              <span>AI Moodboard</span>
              <span>Prompt · Canvas · Delivery</span>
            </div>

            {visualCards.map(card => (
              <div
                key={card.title}
                className="absolute overflow-hidden rounded-[24px] p-4"
                style={{
                  left: card.x,
                  top: card.y,
                  width: card.w,
                  height: card.h,
                  transform: `rotate(${card.rotate})`,
                  background: card.tone,
                  border: "1px solid oklch(1 0 0 / 15%)",
                  boxShadow: "0 28px 70px rgba(0,0,0,0.42)",
                }}
              >
                <div className="absolute inset-0 opacity-45" style={{ backgroundImage: "linear-gradient(90deg, oklch(1 0 0 / 9%) 1px, transparent 1px), linear-gradient(0deg, oklch(1 0 0 / 8%) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.70 0.18 35)" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.58 0.22 290)" }} />
                  </div>
                  <p className="type-caption" style={{ color: "white", textTransform: "none", letterSpacing: "0.02em" }}>{card.title}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="relative z-10 mx-auto -mt-24 w-full max-w-[430px] rounded-[30px] p-5 sm:p-6"
            style={{
              background: "linear-gradient(180deg, oklch(0.16 0.022 270 / 0.92), oklch(0.105 0.018 270 / 0.96))",
              border: "1px solid oklch(1 0 0 / 14%)",
              boxShadow: "0 34px 100px rgba(0,0,0,0.70)",
              backdropFilter: "blur(24px)",
            }}
          >
            <div className="mb-5 text-center">
              <p className="type-caption mb-2" style={{ color: "oklch(0.68 0.18 220)", textTransform: "none", letterSpacing: "0.16em" }}>WELCOME TO ART X</p>
              <h2 className="text-[26px] font-semibold tracking-[-0.04em]" style={{ color: text }}>{mode === "login" ? "登录创意工作台" : "创建 Art X 账号"}</h2>
              <p className="type-caption mt-2" style={{ color: muted, textTransform: "none", letterSpacing: "0.02em" }}>使用测试账号 09bee / 1234 体验完整创作流程。</p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-[18px] p-1" style={{ background: "oklch(1 0 0 / 6%)", border: `1px solid ${border}` }}>
              {(["login", "register"] as const).map(item => {
                const active = mode === item;
                return (
                  <button
                    key={item}
                    onClick={() => { setMode(item); setError(""); }}
                    className="h-10 rounded-[14px] type-body-sm transition-all active:scale-[0.98]"
                    style={{ background: active ? accentGradient : "transparent", color: active ? "white" : muted, boxShadow: active ? "0 10px 26px oklch(0.58 0.22 290 / 0.25)" : "none" }}
                  >
                    {item === "login" ? "登录" : "注册"}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="type-caption" style={{ color: muted }}>账号 / 邮箱</span>
                <input
                  value={username}
                  onChange={e => { setUsername(e.target.value); if (error) setError(""); }}
                  className="h-12 rounded-[16px] px-4 outline-none type-caption transition-colors"
                  style={{
                    background: inputBg,
                    border: `1px solid ${error === "请输入账号" ? "oklch(0.68 0.22 25)" : border}`,
                    color: text,
                  }}
                  placeholder="请输入账号或邮箱"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="type-caption" style={{ color: muted }}>密码</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (error) setError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
                    className="h-12 w-full rounded-[16px] pl-4 pr-11 outline-none type-caption transition-colors"
                    style={{
                      background: inputBg,
                      border: `1px solid ${error === "请输入密码" ? "oklch(0.68 0.22 25)" : border}`,
                      color: text,
                    }}
                    placeholder="请输入密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[12px] flex items-center justify-center transition-opacity hover:opacity-75 active:scale-95"
                    style={{ color: muted }}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.02em" }}>
                <span className="w-4 h-4 rounded-[5px] flex items-center justify-center" style={{ background: "oklch(0.58 0.22 290 / 0.20)", border: "1px solid oklch(0.58 0.22 290 / 0.46)" }}>
                  <Check size={11} color="oklch(0.76 0.16 230)" />
                </span>
                保持登录
              </label>
              <button className="type-caption" style={{ color: "oklch(0.70 0.18 220)", textTransform: "none", letterSpacing: "0.02em" }}>忘记密码？</button>
            </div>

            {error && (
              <p className="type-caption mt-3" role="alert" style={{ color: "oklch(0.72 0.20 25)", textTransform: "none", letterSpacing: "0.02em" }}>
                {error}
              </p>
            )}

            <button
              onClick={handleConfirm}
              className="w-full h-12 mt-5 rounded-[18px] type-body-sm transition-all hover:scale-[1.01] active:scale-[0.98]"
              style={{ background: accentGradient, color: "white", boxShadow: "0 18px 42px oklch(0.58 0.22 290 / 0.34)" }}
            >
              {mode === "login" ? "进入 Art X" : "注册并进入 Art X"}
            </button>

            <div className="my-5 flex items-center gap-4">
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 16%))" }} />
              <span className="type-caption" style={{ color: dim, textTransform: "none", letterSpacing: "0.04em" }}>其他登录方式</span>
              <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, oklch(1 0 0 / 16%), transparent)" }} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["google", "wechat", "apple"] as const).map(item => {
                const active = provider === item;
                const label = item === "google" ? "G" : item === "wechat" ? "微" : "";
                return (
                  <button
                    key={item}
                    onClick={() => setProvider(item)}
                    className="h-12 rounded-[16px] type-body-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: active ? "oklch(1 0 0 / 14%)" : "oklch(1 0 0 / 7%)",
                      border: `1px solid ${active ? "oklch(0.68 0.18 220 / 0.48)" : border}`,
                      color: active ? text : muted,
                    }}
                    aria-label={item === "google" ? "Google 登录" : item === "wechat" ? "微信登录" : "Apple 登录"}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
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

  const handleStartDesign = () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    navigate("/project/p1");
  };

  const handlePromptSubmit = (_text: string) => {
    handleStartDesign();
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

          {isAuthenticated && (
            <div
              className="flex flex-wrap items-center justify-center gap-2 mt-4 overflow-hidden"
              style={{ width: "100%", maxWidth: 680, maxHeight: 76 }}
            >
              {PROMPT_SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={index}
                  className="type-caption px-3 py-1.5 rounded-[var(--radius-pill)] transition-all hover:opacity-80 active:scale-95"
                  style={{
                    background: chipBg,
                    border: `1px solid ${chipBorder}`,
                    color: sub,
                  }}
                  onClick={() => handlePromptSubmit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
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

            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {RECENT_PROJECTS.map(project => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="rounded-[var(--radius-lg-design)] overflow-hidden text-left group transition-all hover:scale-[1.02] cursor-pointer"
                  style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}
                >
                  <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
                    <img src={project.cover} alt={project.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
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
                  onClick={() => navigate(`/project/p1`)}
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
      <LoginRegisterDialog isDark={isDark} />
    </div>
  );
}
