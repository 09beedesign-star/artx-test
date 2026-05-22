/**
 * CanvasNodes — Neo-Studio Dark Design System
 * Node components that live on the infinite canvas:
 * - AssetNode: generated image/video card
 * - ChatNode: AI conversation thread
 * - PromptNode: floating prompt input box
 * - TextNode: sticky note / annotation
 */
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X, Download, Maximize2, Sparkles, Send, Loader2,
  Check, Image as ImageIcon, Video, Palette, GripVertical,
  MessageSquare, Type, MoreHorizontal, Paperclip, Wand2,
} from "lucide-react";
import type { CanvasNode } from "@/hooks/useCanvas";
import { GENERATED_ASSETS } from "@/lib/workspace-data";
import type { ChatMessage, AgentStep } from "@/lib/workspace-data";

interface NodeWrapperProps {
  node: CanvasNode;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  children: React.ReactNode;
  minWidth?: number;
  className?: string;
}

export function NodeWrapper({
  node, isSelected, onDragStart, onSelect, onRemove, children, minWidth = 200, className,
}: NodeWrapperProps) {
  return (
    <div
      className={cn("absolute select-none", className)}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        zIndex: node.zIndex,
        minWidth,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
    >
      {/* Selection ring */}
      {isSelected && (
        <div
          className="absolute pointer-events-none rounded-2xl"
          style={{
            inset: -2,
            border: "1.5px solid oklch(0.58 0.22 290 / 0.7)",
            boxShadow: "0 0 0 4px oklch(0.58 0.22 290 / 0.12)",
            borderRadius: 18,
            zIndex: 1,
          }}
        />
      )}

      {/* Drag handle + close */}
      <div
        className="absolute -top-7 left-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ opacity: isSelected ? 1 : undefined }}
      >
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-t-lg cursor-grab active:cursor-grabbing"
          style={{ background: "oklch(0.18 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)" }}
          onMouseDown={(e) => onDragStart(e, node.id)}
        >
          <GripVertical size={12} style={{ color: "oklch(0.45 0.01 270)" }} />
          <span className="text-[10px]" style={{ color: "oklch(0.45 0.01 270)" }}>
            {node.type === "asset" ? "素材" : node.type === "chat" ? "对话" : node.type === "prompt" ? "提示词" : "文本"}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
          className="w-5 h-5 rounded flex items-center justify-center transition-colors"
          style={{ background: "oklch(0.18 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)" }}
        >
          <X size={10} style={{ color: "oklch(0.55 0.01 270)" }} />
        </button>
      </div>

      <div className="group">{children}</div>
    </div>
  );
}

// ── Asset Node ────────────────────────────────────────────────

export function AssetNode({ node, isSelected, onDragStart, onSelect, onRemove }: Omit<NodeWrapperProps, "children" | "className">) {
  const asset = GENERATED_ASSETS.find((a) => a.id === (node.data.assetId as string)) || GENERATED_ASSETS[0];
  const typeColor = {
    image: "oklch(0.78 0.18 290)",
    video: "oklch(0.72 0.18 200)",
    brand: "oklch(0.78 0.18 60)",
    poster: "oklch(0.80 0.18 330)",
  }[asset.type] || "oklch(0.78 0.18 290)";
  const typeLabel = { image: "图片", video: "视频", brand: "品牌", poster: "海报" }[asset.type] || "图片";

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={180}>
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200"
        style={{
          background: "oklch(0.14 0.018 270)",
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.4)" : "oklch(1 0 0 / 10%)"}`,
          boxShadow: isSelected
            ? "0 12px 40px oklch(0.58 0.22 290 / 0.2), 0 4px 16px oklch(0 0 0 / 0.5)"
            : "0 4px 20px oklch(0 0 0 / 0.4)",
        }}
      >
        {/* Image */}
        <div className="relative overflow-hidden group/img" style={{ aspectRatio: `${asset.width}/${asset.height}` }}>
          <img src={asset.src} alt={asset.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/35 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); toast("下载", { description: "功能即将上线" }); }}
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm"
              style={{ background: "oklch(1 0 0 / 20%)" }}
            >
              <Download size={13} className="text-white" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toast("全屏预览", { description: "功能即将上线" }); }}
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm"
              style={{ background: "oklch(1 0 0 / 20%)" }}
            >
              <Maximize2 size={13} className="text-white" />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: typeColor }} />
            <span className="text-[10px] font-medium" style={{ color: typeColor }}>{typeLabel}</span>
          </div>
          <div className="text-[13px] font-semibold text-white truncate">{asset.title}</div>
          <div className="flex items-center justify-between mt-1">
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "oklch(0.72 0.18 200)" }}>
              {asset.width} × {asset.height}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); toast("更多操作", { description: "功能即将上线" }); }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <MoreHorizontal size={12} style={{ color: "oklch(0.45 0.01 270)" }} />
            </button>
          </div>
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Chat Node ─────────────────────────────────────────────────

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: "c1",
    role: "user",
    content: "为次世代跑鞋品牌设计产品页视觉资产",
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: "c2",
    role: "assistant",
    content: "已为跑鞋产品页生成一套视觉资产，聚焦清晰度与性能冲击力。",
    steps: [
      { id: "s1", label: "分析用户意图", detail: "Analyzing intent", status: "done" },
      { id: "s2", label: "搜索参考资料", detail: "Searching references", status: "done" },
      { id: "s3", label: "生成创意资产", detail: "Generating assets", status: "done" },
    ],
    timestamp: new Date(Date.now() - 60000),
  },
];

export function ChatNode({ node, isSelected, onDragStart, onSelect, onRemove }: Omit<NodeWrapperProps, "children" | "className">) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    const userMsg: ChatMessage = { id: `c${Date.now()}`, role: "user", content: input.trim(), timestamp: new Date() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setIsGenerating(true);

    const steps: AgentStep[] = [
      { id: "s1", label: "分析意图", detail: "Analyzing", status: "running" },
      { id: "s2", label: "生成资产", detail: "Generating", status: "pending" },
    ];
    const aiMsg: ChatMessage = { id: `c${Date.now() + 1}`, role: "assistant", content: "", steps, timestamp: new Date() };
    setMessages((p) => [...p, aiMsg]);

    await new Promise((r) => setTimeout(r, 900));
    setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, steps: m.steps?.map((s) => s.id === "s1" ? { ...s, status: "done" } : s.id === "s2" ? { ...s, status: "running" } : s) } : m));
    await new Promise((r) => setTimeout(r, 1000));
    setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, content: "已根据您的需求完成创意资产生成，请查看画布上的素材节点。", steps: m.steps?.map((s) => ({ ...s, status: "done" as const })) } : m));
    setIsGenerating(false);
  };

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={320}>
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "oklch(0.13 0.016 270)",
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.4)" : "oklch(1 0 0 / 10%)"}`,
          boxShadow: "0 8px 32px oklch(0 0 0 / 0.5)",
          height: node.height || 420,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
          onMouseDown={(e) => onDragStart(e, node.id)}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}
          >
            <Sparkles size={11} className="text-white" />
          </div>
          <span className="text-[13px] font-semibold text-white flex-1">AI 对话</span>
          <MessageSquare size={13} style={{ color: "oklch(0.45 0.01 270)" }} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold"
                style={msg.role === "user"
                  ? { background: "oklch(0.22 0.02 270)", color: "oklch(0.65 0.01 270)" }
                  : { background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }
                }
              >
                {msg.role === "user" ? "U" : <Sparkles size={9} className="text-white" />}
              </div>
              <div className={cn("flex flex-col gap-1.5 max-w-[85%]", msg.role === "user" ? "items-end" : "items-start")}>
                {msg.steps && (
                  <div className="rounded-xl px-3 py-2 space-y-1.5 w-full" style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)" }}>
                    {msg.steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 flex items-center justify-center">
                          {step.status === "done"
                            ? <Check size={9} style={{ color: "oklch(0.72 0.18 200)" }} />
                            : step.status === "running"
                            ? <Loader2 size={9} className="animate-spin" style={{ color: "oklch(0.58 0.22 290)" }} />
                            : <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.30 0.01 270)" }} />
                          }
                        </div>
                        <span className="text-[11px]" style={{ color: step.status === "done" ? "oklch(0.72 0.18 200)" : step.status === "running" ? "oklch(0.80 0.008 270)" : "oklch(0.40 0.01 270)" }}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.content && (
                  <div
                    className="rounded-xl px-3 py-2 text-[12px] leading-relaxed"
                    style={msg.role === "user"
                      ? { background: "oklch(0.58 0.22 290 / 0.18)", border: "1px solid oklch(0.58 0.22 290 / 0.28)", color: "oklch(0.88 0.008 270)" }
                      : { background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)", color: "oklch(0.80 0.008 270)" }
                    }
                  >
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isGenerating && (
            <div className="flex gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}>
                <Sparkles size={9} className="text-white" />
              </div>
              <div className="flex gap-1 items-center px-3 py-2 rounded-xl" style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "oklch(0.58 0.22 290)", animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-2.5 pb-2.5 shrink-0" style={{ borderTop: "1px solid oklch(1 0 0 / 6%)", paddingTop: 8 }}>
          <div
            className="flex items-end gap-2 rounded-xl px-3 py-2"
            style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="继续对话…"
              rows={1}
              className="flex-1 bg-transparent outline-none resize-none text-[12px]"
              style={{ color: "oklch(0.85 0.008 270)", lineHeight: 1.5 }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); handleSend(); }}
              disabled={!input.trim() || isGenerating}
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-40 transition-all"
              style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}
            >
              <Send size={10} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Prompt Node ───────────────────────────────────────────────

export function PromptNode({ node, isSelected, onDragStart, onSelect, onRemove, onGenerate }: Omit<NodeWrapperProps, "children" | "className"> & { onGenerate?: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState((node.data.prompt as string) || "");

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={280}>
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "oklch(0.14 0.018 270)",
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.5)" : "oklch(0.58 0.22 290 / 0.2)"}`,
          boxShadow: "0 8px 32px oklch(0.58 0.22 290 / 0.1), 0 4px 16px oklch(0 0 0 / 0.4)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 cursor-grab"
          style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)", background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.12), oklch(0.72 0.18 200 / 0.08))" }}
          onMouseDown={(e) => onDragStart(e, node.id)}
        >
          <Wand2 size={13} style={{ color: "oklch(0.72 0.18 290)" }} />
          <span className="text-[12px] font-semibold" style={{ color: "oklch(0.78 0.18 290)" }}>提示词</span>
        </div>

        {/* Textarea */}
        <div className="p-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想生成的内容…"
            rows={4}
            className="w-full bg-transparent outline-none resize-none text-[13px] leading-relaxed"
            style={{ color: "oklch(0.85 0.008 270)" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            onClick={(e) => { e.stopPropagation(); toast("上传参考图", { description: "功能即将上线" }); }}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Paperclip size={13} style={{ color: "oklch(0.50 0.01 270)" }} />
          </button>
          <div className="flex-1" />
          <button
            onClick={(e) => { e.stopPropagation(); onGenerate?.(prompt); }}
            disabled={!prompt.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}
          >
            <Sparkles size={12} />
            生成
          </button>
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Text Node ─────────────────────────────────────────────────

const NOTE_COLORS = [
  { bg: "oklch(0.22 0.06 290)", border: "oklch(0.58 0.22 290 / 0.4)", text: "oklch(0.85 0.008 270)" },
  { bg: "oklch(0.20 0.06 200)", border: "oklch(0.72 0.18 200 / 0.4)", text: "oklch(0.85 0.008 270)" },
  { bg: "oklch(0.22 0.06 60)", border: "oklch(0.78 0.18 60 / 0.4)", text: "oklch(0.85 0.008 270)" },
  { bg: "oklch(0.20 0.04 330)", border: "oklch(0.80 0.18 330 / 0.4)", text: "oklch(0.85 0.008 270)" },
];

export function TextNode({ node, isSelected, onDragStart, onSelect, onRemove }: Omit<NodeWrapperProps, "children" | "className">) {
  const [text, setText] = useState((node.data.text as string) || "在此输入备注…");
  const [colorIdx] = useState((node.data.colorIdx as number) || 0);
  const color = NOTE_COLORS[colorIdx % NOTE_COLORS.length];

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={160}>
      <div
        className="rounded-2xl p-3"
        style={{
          background: color.bg,
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.6)" : color.border}`,
          boxShadow: "0 4px 16px oklch(0 0 0 / 0.3)",
        }}
      >
        <div
          className="flex items-center gap-1.5 mb-2 cursor-grab"
          onMouseDown={(e) => onDragStart(e, node.id)}
        >
          <Type size={11} style={{ color: "oklch(0.55 0.01 270)" }} />
          <span className="text-[10px]" style={{ color: "oklch(0.48 0.01 270)" }}>备注</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full bg-transparent outline-none resize-none text-[13px] leading-relaxed"
          style={{ color: color.text }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </NodeWrapper>
  );
}
