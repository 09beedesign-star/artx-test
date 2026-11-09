/**
 * MainCanvas — Neo-Studio Dark Design System
 * Central workspace: project header, chat history, AI generation steps, asset gallery, prompt input
 * Philosophy: Deep blue-purple dark, purple→cyan gradient, creative studio atmosphere
 */
import { useState, useRef, useEffect } from "react";
import { DEFAULT_TEXT_MODEL } from "../../../../shared/text-models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Paperclip, Wand2, ChevronDown, Image as ImageIcon,
  Video, Palette, Check, Loader2, Download, Maximize2,
  MoreHorizontal, RefreshCw, Sparkles, Star, Share2,
  Clock, ChevronRight,
} from "lucide-react";
import { INITIAL_MESSAGES, GENERATED_ASSETS, PROJECTS } from "@/lib/workspace-data";
import { notifyAiFailure } from "@/lib/ai-credit-gate";
import type { ChatMessage, GeneratedAsset, AgentStep } from "@/lib/workspace-data";
import { callLLM, requestAiAuth } from "@/lib/ai";
import { routeCreativeIntent } from "@/lib/ai-intent";
import generationMark from "@/assets/generation/ai-generation-mark.svg";

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
  const project = PROJECTS.find((p) => p.id === projectId) || {
    id: projectId || "__blank-workspace__",
    title: "空白画布",
    updatedAt: "刚刚",
  };
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
        model: DEFAULT_TEXT_MODEL,
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
                assets: undefined,
              }
            : m
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      notifyAiFailure("工作区 AI 生成失败", message);
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
        style={{ height: 48, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-1.5 text-[12px]">
          <span style={{ color: "#a0a0a6" }}>我的项目</span>
          <ChevronRight size={11} style={{ color: "#555" }} />
          <span className="font-semibold" style={{ color: "#f1f1f3" }}>{project.title}</span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
          <span className="text-[10px] font-medium" style={{ color: "#10b981" }}>进行中</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[11px]" style={{ color: "#777472" }}>
          <Clock size={11} />
          <span>{project.updatedAt}</span>
        </div>
        <button onClick={() => setStarred(!starred)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
          <Star size={13} style={{ color: starred ? "#f59e0b" : "#777472", fill: starred ? "#f59e0b" : "none" }} />
        </button>
        <button onClick={() => toast("分享项目", { description: "功能即将上线" })} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
          <Share2 size={13} style={{ color: "#777472" }} />
        </button>
        <button
          onClick={() => toast("导出资产", { description: "功能即将上线" })}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium transition-all duration-150 hover:bg-white/5"
          style={{ border: "1px solid rgba(255,255,255,0.10)", color: "#a0a0a6" }}
        >
          <Download size={12} />导出
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-4 shrink-0"
        style={{ height: 44, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        {(["chat", "gallery"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150",
              activeTab === tab ? "text-white" : "hover:text-white"
            )}
            style={activeTab === tab ? { background: "rgba(255,255,255,0.10)", color: "white" } : { color: "#777472" }}
          >
            {tab === "chat" ? "对话生成" : "素材画廊"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => { setMessages([]); toast("已清空对话", { description: "开始新的创作" }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors hover:bg-white/5"
          style={{ color: "#777472" }}
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
              style={{ background: "linear-gradient(135deg, #333333, #666666)" }}
            >
              <Sparkles size={12} className="text-white" />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "#ffffff", animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-[12px]" style={{ color: "#a0a0a6" }}>AI 正在思考…</span>
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
              className="px-3 py-1.5 rounded-full text-[12px] transition-all duration-150 hover:border-white/20"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#a0a0a6",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div
          className="rounded-2xl overflow-hidden transition-all duration-200"
          style={{
            background: "#1a1a1a",
            border: `1px solid ${input ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.10)"}`,
            boxShadow: input ? "0 0 0 3px rgba(255,255,255,0.06)" : undefined,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
            placeholder="描述你想要生成的设计内容..."
            rows={3}
            className="w-full bg-transparent px-4 pt-3 pb-2 text-sm outline-none resize-none"
            style={{ color: "#f1f1f3", fontSize: 14, lineHeight: 1.6 }}
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <button onClick={() => toast("上传素材", { description: "功能即将上线" })} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <Paperclip size={14} style={{ color: "#777472" }} />
            </button>
            <button onClick={() => toast("风格设置", { description: "功能即将上线" })} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <Wand2 size={14} style={{ color: "#777472" }} />
            </button>
            <div className="flex-1" />
            <span className="text-[11px]" style={{ color: "#555" }}>{input.length}/2000</span>
            <button
              onClick={onSend}
              disabled={!input.trim() || isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-150 disabled:opacity-40 hover:bg-[#e8e8e8]"
              style={{ background: "#ffffff", color: "#111111" }}
            >
              {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <img src={generationMark} alt="" aria-hidden="true" draggable={false} className="h-3.5 w-3.5 object-contain" style={{ filter: "brightness(0)" }} />}
              {isGenerating ? "生成中…" : "生成"}
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: "#555" }}>
          按 Enter 发送 · Shift+Enter 换行 · 标准生图约 300 积分/张
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
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
      >
        <Sparkles size={24} style={{ color: "#f1f1f3" }} />
      </div>
      <h3 className="text-lg font-bold mb-1" style={{ color: "#f1f1f3" }}>开始你的创作</h3>
      <p className="text-[13px] text-center mb-8" style={{ color: "#a0a0a6" }}>
        描述你的设计需求，AI 将为你生成专业的视觉资产
      </p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {quickStarts.map((item) => (
          <button
            key={item.title}
            onClick={() => onSuggest(item.prompt)}
            className="flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-all duration-150 hover:border-white/20 card-hover"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[13px] font-semibold" style={{ color: "#f1f1f3" }}>{item.title}</span>
            <span className="text-[11px]" style={{ color: "#777472" }}>{item.desc}</span>
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
          ? { background: "#2a2a2a", color: "#a0a0a6" }
          : { background: "linear-gradient(135deg, #333333, #555555)" }
        }
      >
        {isUser ? "U" : <Sparkles size={12} className="text-white" />}
      </div>

      <div className={cn("flex flex-col gap-2 max-w-[82%]", isUser ? "items-end" : "items-start")}>
        {!isUser && message.steps && message.steps.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 space-y-2 w-full"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.10)" }}
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
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#f1f1f3",
            } : {
              background: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e0e0e0",
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

        <span className="text-[10px] px-1" style={{ color: "#555" }}>
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
          <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
            <Check size={9} style={{ color: "#10b981" }} />
          </div>
        ) : step.status === "running" ? (
          <Loader2 size={12} className="animate-spin" style={{ color: "#ffffff" }} />
        ) : (
          <div className="w-2 h-2 rounded-full" style={{ background: "#444" }} />
        )}
      </div>
      <span
        className="text-[12px] font-medium"
        style={{
          color: step.status === "done"
            ? "#10b981"
            : step.status === "running"
            ? "#f1f1f3"
            : "#777472",
        }}
      >
        {step.label}
      </span>
      <span className="text-[10px] ml-auto" style={{ color: "#555" }}>{step.detail}</span>
    </div>
  );
}

// ── Asset Card ────────────────────────────────────────────────

function AssetCard({ asset }: { asset: GeneratedAsset }) {
  const typeLabel = { image: "图片", video: "视频", brand: "品牌", poster: "海报" }[asset.type];
  const typeColor = {
    image: "#f1f1f3",
    video: "#10b981",
    brand: "#f59e0b",
    poster: "#f472b6",
  }[asset.type];
  const TypeIcon = { image: ImageIcon, video: Video, brand: Palette, poster: ImageIcon }[asset.type];

  return (
    <div
      className="rounded-xl overflow-hidden card-hover group cursor-pointer"
      style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)" }}
      onClick={() => toast("预览资产", { description: "功能即将上线" })}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: "3/4" }}>
        <img
          src={asset.src}
          alt={asset.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[#222222]/0 group-hover:bg-[#222222]/35 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); toast("下载", { description: "功能即将上线" }); }}
            className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
            style={{ background: "rgba(255,255,255,0.20)" }}
          >
            <Download size={13} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toast("全屏预览", { description: "功能即将上线" }); }}
            className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
            style={{ background: "rgba(255,255,255,0.20)" }}
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
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.22)",
              color: "#f1f1f3",
            } : {
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#a0a0a6",
            }}
          >
            {{ all: "全部", image: "图片", video: "视频", brand: "品牌" }[f]}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => toast("排序", { description: "功能即将上线" })} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <MoreHorizontal size={15} style={{ color: "#777472" }} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <ImageIcon size={32} style={{ color: "#555" }} className="mb-3" />
          <p className="text-[13px]" style={{ color: "#a0a0a6" }}>暂无该类型素材</p>
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
