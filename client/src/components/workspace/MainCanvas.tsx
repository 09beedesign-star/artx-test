/**
 * MainCanvas — Neo-Studio Dark Design System
 * Central workspace: project header, chat history, AI generation steps, asset gallery, prompt input
 * Philosophy: Deep blue-purple dark, purple→cyan gradient, creative studio atmosphere
 */
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Send, Paperclip, Wand2, ChevronDown, Image as ImageIcon,
  Video, Palette, Check, Loader2, Download, Maximize2,
  MoreHorizontal, RefreshCw, Sparkles, Star, Share2,
  Clock, ChevronRight,
} from "lucide-react";
import { INITIAL_MESSAGES, GENERATED_ASSETS, PROJECTS } from "@/lib/workspace-data";
import type { ChatMessage, GeneratedAsset, AgentStep } from "@/lib/workspace-data";
import { callLLM, requestAiAuth } from "@/lib/ai";
import { routeCreativeIntent } from "@/lib/ai-intent";

const SUGGESTIONS = [
  "为品牌设计 Logo 套件",
  "生成社交媒体海报",
  "制作产品展示视频",
  "设计品牌色彩系统",
];

interface MainCanvasProps {
  projectId?: string;
}

export default function MainCanvas({ projectId = "p1" }: MainCanvasProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "gallery">("chat");
  const bottomRef = useRef<HTMLDivElement>(null);
  const project = PROJECTS.find((p) => p.id === projectId) || PROJECTS[0];
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    if (!requestAiAuth()) {
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
    const userMsg: ChatMessage = {
      id: `m${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsGenerating(true);

    const steps: AgentStep[] = [
      { id: "s1", label: "分析用户意图", detail: "Analyzing intent", status: "running" },
      { id: "s2", label: "搜索参考资料", detail: "Searching references", status: "pending" },
      { id: "s3", label: "生成创意资产", detail: "Generating assets", status: "pending" },
    ];

    const aiMsg: ChatMessage = {
      id: `m${Date.now() + 1}`,
      role: "assistant",
      content: "",
      steps,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, aiMsg]);

    try {
      updateStep(aiMsg.id, "s1", "done", "s2", "running");
      const decision = await routeCreativeIntent({
        module: "workspace-chat-generation",
        model: "gpt-4o",
        prompt: userMsg.content,
        recentMessages: messages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
        preferImageWhenReferences: false,
      });
      updateStep(aiMsg.id, "s2", "done", "s3", "running");
      updateStep(aiMsg.id, "s3", "done");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? {
                ...m,
                content: decision.mode === "image"
                  ? `我判断这次请求更适合直接生成图片，已整理为生图任务：${decision.imagePrompt || userMsg.content}`
                  : (decision.reply || userMsg.content),
                assets: decision.mode === "image" ? [GENERATED_ASSETS[0], GENERATED_ASSETS[1]] : undefined,
              }
            : m
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      toast("工作区 AI 生成失败", { description: message });
      setMessages((prev) => prev.filter((m) => m.id !== aiMsg.id));
    } finally {
      setIsGenerating(false);
    }
  };

  function updateStep(msgId: string, doneId: string, doneStatus: "done", nextId?: string, nextStatus?: "running") {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.steps) return m;
        return {
          ...m,
          steps: m.steps.map((s) => {
            if (s.id === doneId) return { ...s, status: doneStatus };
            if (nextId && s.id === nextId) return { ...s, status: nextStatus! };
            return s;
          }),
        };
      })
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full">
      {/* Project header */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{ height: 48, borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
      >
        <div className="flex items-center gap-1.5 text-[12px]">
          <span style={{ color: "oklch(0.45 0.01 270)" }}>我的项目</span>
          <ChevronRight size={11} style={{ color: "oklch(0.35 0.01 270)" }} />
          <span className="font-semibold" style={{ color: "oklch(0.85 0.01 270)" }}>{project.title}</span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: "oklch(0.72 0.18 200 / 0.12)", border: "1px solid oklch(0.72 0.18 200 / 0.25)" }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
          <span className="text-[10px] font-medium" style={{ color: "oklch(0.72 0.18 200)" }}>进行中</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[11px]" style={{ color: "oklch(0.42 0.01 270)" }}>
          <Clock size={11} />
          <span>{project.updatedAt}</span>
        </div>
        <button onClick={() => setStarred(!starred)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
          <Star size={13} style={{ color: starred ? "oklch(0.78 0.18 60)" : "oklch(0.42 0.01 270)", fill: starred ? "oklch(0.78 0.18 60)" : "none" }} />
        </button>
        <button onClick={() => toast("分享项目", { description: "功能即将上线" })} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
          <Share2 size={13} style={{ color: "oklch(0.42 0.01 270)" }} />
        </button>
        <button
          onClick={() => toast("导出资产", { description: "功能即将上线" })}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium transition-all duration-150 hover:bg-white/5"
          style={{ border: "1px solid oklch(1 0 0 / 10%)", color: "oklch(0.65 0.01 270)" }}
        >
          <Download size={12} />导出
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-4 shrink-0"
        style={{ height: 44, borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
      >
        {(["chat", "gallery"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150",
              activeTab === tab ? "text-white" : "hover:text-white"
            )}
            style={activeTab === tab ? { background: "oklch(1 0 0 / 8%)", color: "white" } : { color: "oklch(0.52 0.01 270)" }}
          >
            {tab === "chat" ? "对话生成" : "素材画廊"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { setMessages([]); toast("已清空对话", { description: "开始新的创作" }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors hover:bg-white/5"
          style={{ color: "oklch(0.52 0.01 270)" }}
        >
          <RefreshCw size={12} />新对话
        </button>
      </div>

      {activeTab === "chat" ? (
        <ChatView
          messages={messages}
          isGenerating={isGenerating}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          bottomRef={bottomRef}
        />
      ) : (
        <GalleryView assets={GENERATED_ASSETS} />
      )}
    </div>
  );
}

// ── Chat View ─────────────────────────────────────────────────

function ChatView({
  messages, isGenerating, input, setInput, onSend, bottomRef,
}: {
  messages: ChatMessage[];
  isGenerating: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <EmptyState onSuggest={setInput} />
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} message={msg} index={i} />
        ))}
        {isGenerating && (
          <div className="flex items-center gap-2 px-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}
            >
              <Sparkles size={12} className="text-white" />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
              style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)" }}
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "oklch(0.58 0.22 290)", animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-[12px]" style={{ color: "oklch(0.55 0.01 270)" }}>AI 正在思考…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4">
        <div className="flex gap-2 mb-3 flex-wrap">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="px-3 py-1.5 rounded-full text-[12px] transition-all duration-150 hover:border-purple-500/40"
              style={{
                background: "oklch(1 0 0 / 4%)",
                border: "1px solid oklch(1 0 0 / 8%)",
                color: "oklch(0.62 0.01 270)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div
          className="rounded-xl overflow-hidden transition-all duration-200"
          style={{
            background: "oklch(0.16 0.02 270)",
            border: `1px solid ${input ? "oklch(0.58 0.22 290 / 0.35)" : "oklch(1 0 0 / 10%)"}`,
            boxShadow: input ? "0 0 0 3px oklch(0.58 0.22 290 / 0.08)" : undefined,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
            placeholder="描述你想要生成的设计内容，例如：为一个咖啡品牌设计一套完整的视觉识别系统…"
            rows={3}
            className="w-full bg-transparent px-4 pt-3 pb-2 text-sm outline-none resize-none"
            style={{ color: "oklch(0.88 0.008 270)", fontSize: 14, lineHeight: 1.6 }}
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <button onClick={() => toast("上传素材", { description: "功能即将上线" })} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <Paperclip size={14} style={{ color: "oklch(0.52 0.01 270)" }} />
            </button>
            <button onClick={() => toast("风格设置", { description: "功能即将上线" })} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <Wand2 size={14} style={{ color: "oklch(0.52 0.01 270)" }} />
            </button>
            <div className="flex-1" />
            <span className="text-[11px]" style={{ color: "oklch(0.38 0.01 270)" }}>{input.length}/2000</span>
            <button
              onClick={onSend}
              disabled={!input.trim() || isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}
            >
              {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {isGenerating ? "生成中…" : "生成"}
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: "oklch(0.35 0.01 270)" }}>
          按 Enter 发送 · Shift+Enter 换行 · 每次生成消耗约 5 积分
        </p>
      </div>
    </>
  );
}

// ── Empty State ───────────────────────────────────────────────

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  const quickStarts = [
    { icon: "🎨", title: "品牌视觉系统", desc: "Logo、色彩、字体一键生成", prompt: "为一个现代科技品牌设计完整的视觉识别系统" },
    { icon: "📱", title: "社交媒体内容", desc: "Instagram、小红书等平台素材", prompt: "为时尚品牌生成一套小红书风格的产品海报" },
    { icon: "🎬", title: "产品宣传视频", desc: "脚本到视觉一键生成", prompt: "为跑鞋产品制作一段 15 秒的宣传视频素材" },
    { icon: "🖼️", title: "电商产品图", desc: "主图、详情页、Banner", prompt: "为电商平台设计一套产品主图和详情页视觉" },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.2), oklch(0.72 0.18 200 / 0.2))", border: "1px solid oklch(0.58 0.22 290 / 0.3)" }}
      >
        <Sparkles size={24} style={{ color: "oklch(0.72 0.18 290)" }} />
      </div>
      <h3 className="text-lg font-bold mb-1" style={{ color: "oklch(0.90 0.008 270)" }}>开始你的创作</h3>
      <p className="text-[13px] text-center mb-8" style={{ color: "oklch(0.52 0.01 270)" }}>
        描述你的设计需求，AI 将为你生成专业的视觉资产
      </p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {quickStarts.map((item) => (
          <button
            key={item.title}
            onClick={() => onSuggest(item.prompt)}
            className="flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all duration-150 hover:border-purple-500/30 card-hover"
            style={{ background: "oklch(0.15 0.018 270)", border: "1px solid oklch(1 0 0 / 8%)" }}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[13px] font-semibold" style={{ color: "oklch(0.85 0.008 270)" }}>{item.title}</span>
            <span className="text-[11px]" style={{ color: "oklch(0.48 0.01 270)" }}>{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────

function MessageBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex gap-3 animate-fade-up", isUser ? "flex-row-reverse" : "flex-row")}
      style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[12px] font-bold"
        style={isUser
          ? { background: "oklch(0.22 0.02 270)", color: "oklch(0.70 0.01 270)" }
          : { background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }
        }
      >
        {isUser ? "U" : <Sparkles size={12} className="text-white" />}
      </div>

      <div className={cn("flex flex-col gap-2 max-w-[82%]", isUser ? "items-end" : "items-start")}>
        {!isUser && message.steps && message.steps.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 space-y-2 w-full"
            style={{ background: "oklch(0.15 0.018 270)", border: "1px solid oklch(1 0 0 / 8%)" }}
          >
            {message.steps.map((step) => (
              <StepItem key={step.id} step={step} />
            ))}
          </div>
        )}

        {message.content && (
          <div
            className="rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={isUser ? {
              background: "oklch(0.58 0.22 290 / 0.18)",
              border: "1px solid oklch(0.58 0.22 290 / 0.28)",
              color: "oklch(0.90 0.008 270)",
            } : {
              background: "oklch(0.15 0.018 270)",
              border: "1px solid oklch(1 0 0 / 8%)",
              color: "oklch(0.82 0.008 270)",
            }}
          >
            {message.content}
          </div>
        )}

        {!isUser && message.assets && message.assets.length > 0 && (
          <div className="grid grid-cols-2 gap-2 w-full">
            {message.assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}

        <span className="text-[10px] px-1" style={{ color: "oklch(0.36 0.01 270)" }}>
          {message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ── Step Item ─────────────────────────────────────────────────

function StepItem({ step }: { step: AgentStep }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0">
        {step.status === "done" ? (
          <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "oklch(0.72 0.18 200 / 0.2)" }}>
            <Check size={9} style={{ color: "oklch(0.72 0.18 200)" }} />
          </div>
        ) : step.status === "running" ? (
          <Loader2 size={12} className="animate-spin" style={{ color: "oklch(0.58 0.22 290)" }} />
        ) : (
          <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.30 0.01 270)" }} />
        )}
      </div>
      <span
        className="text-[12px] font-medium"
        style={{
          color: step.status === "done"
            ? "oklch(0.72 0.18 200)"
            : step.status === "running"
            ? "oklch(0.85 0.008 270)"
            : "oklch(0.42 0.01 270)",
        }}
      >
        {step.label}
      </span>
      <span className="text-[10px] ml-auto" style={{ color: "oklch(0.36 0.01 270)" }}>{step.detail}</span>
    </div>
  );
}

// ── Asset Card ────────────────────────────────────────────────

function AssetCard({ asset }: { asset: GeneratedAsset }) {
  const typeLabel = { image: "图片", video: "视频", brand: "品牌", poster: "海报" }[asset.type];
  const typeColor = {
    image: "oklch(0.78 0.18 290)",
    video: "oklch(0.72 0.18 200)",
    brand: "oklch(0.78 0.18 60)",
    poster: "oklch(0.80 0.18 330)",
  }[asset.type];
  const TypeIcon = { image: ImageIcon, video: Video, brand: Palette, poster: ImageIcon }[asset.type];

  return (
    <div
      className="rounded-xl overflow-hidden card-hover group cursor-pointer"
      style={{ background: "oklch(0.13 0.016 270)", border: "1px solid oklch(1 0 0 / 8%)" }}
      onClick={() => toast("预览资产", { description: "功能即将上线" })}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: "3/4" }}>
        <img
          src={asset.src}
          alt={asset.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); toast("下载", { description: "功能即将上线" }); }}
            className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
            style={{ background: "oklch(1 0 0 / 20%)" }}
          >
            <Download size={13} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toast("全屏预览", { description: "功能即将上线" }); }}
            className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
            style={{ background: "oklch(1 0 0 / 20%)" }}
          >
            <Maximize2 size={13} className="text-white" />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-0.5">
          <TypeIcon size={10} style={{ color: typeColor }} />
          <span className="text-[10px] font-medium" style={{ color: typeColor }}>{typeLabel}</span>
        </div>
        <div className="text-[12px] font-medium text-white truncate">{asset.title}</div>
        <div className="font-mono-dim mt-0.5">{asset.width} × {asset.height}</div>
      </div>
    </div>
  );
}

// ── Gallery View ──────────────────────────────────────────────

function GalleryView({ assets }: { assets: GeneratedAsset[] }) {
  const [filter, setFilter] = useState<"all" | "image" | "video" | "brand">("all");
  const filtered = filter === "all" ? assets : assets.filter((a) => a.type === filter);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "image", "video", "brand"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150"
            style={filter === f ? {
              background: "oklch(0.58 0.22 290 / 0.18)",
              border: "1px solid oklch(0.58 0.22 290 / 0.4)",
              color: "oklch(0.80 0.18 290)",
            } : {
              background: "oklch(1 0 0 / 4%)",
              border: "1px solid oklch(1 0 0 / 8%)",
              color: "oklch(0.52 0.01 270)",
            }}
          >
            {{ all: "全部", image: "图片", video: "视频", brand: "品牌" }[f]}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => toast("排序", { description: "功能即将上线" })} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <MoreHorizontal size={15} style={{ color: "oklch(0.50 0.01 270)" }} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <ImageIcon size={32} style={{ color: "oklch(0.32 0.01 270)" }} className="mb-3" />
          <p className="text-[13px]" style={{ color: "oklch(0.45 0.01 270)" }}>暂无该类型素材</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((asset, i) => (
            <div key={asset.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <AssetCard asset={asset} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
