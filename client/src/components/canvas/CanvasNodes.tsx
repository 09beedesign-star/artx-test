/**
 * CanvasNodes — Neo-Studio Dark Design System
 * Node components for the infinite canvas.
 * Each node has a bottom model-switcher toolbar (tapnow-style).
 */
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X, Download, Maximize2, Sparkles, Send, Loader2,
  Check, GripVertical, MessageSquare, Type, MoreHorizontal,
  Paperclip, Wand2, Cpu, ChevronDown,
} from "lucide-react";
import type { CanvasNode } from "@/hooks/useCanvas";
import { GENERATED_ASSETS } from "@/lib/workspace-data";
import type { ChatMessage, AgentStep } from "@/lib/workspace-data";
import { AUTO_AI_MODEL, IMAGE_AI_MODEL_OPTIONS, TEXT_AI_MODEL_OPTIONS } from "@/lib/workspace-data";
import { callLLM, requestAiAuth } from "@/lib/ai";

type AiModelOption = typeof TEXT_AI_MODEL_OPTIONS[number] | typeof IMAGE_AI_MODEL_OPTIONS[number];

// ── Model Switcher (shared bottom toolbar) ────────────────────

function ModelSwitcher({
  modelId,
  onChange,
  models = TEXT_AI_MODEL_OPTIONS,
  isDark = true,
}: {
  modelId: string;
  onChange: (id: string) => void;
  models?: AiModelOption[];
  isDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.id === modelId) ?? AUTO_AI_MODEL;

  const chipBg  = isDark ? "oklch(1 0 0 / 5%)"          : "oklch(0 0 0 / 5%)";
  const chipBdr = isDark ? "oklch(1 0 0 / 10%)"          : "oklch(0 0 0 / 10%)";
  const textPri = isDark ? "oklch(0.80 0.008 270)"       : "oklch(0.20 0.008 270)";
  const textSec = isDark ? "oklch(0.45 0.01 270)"        : "oklch(0.55 0.01 270)";
  const popBg   = isDark ? "oklch(0.15 0.018 270)"       : "oklch(0.99 0.004 270)";
  const popBdr  = isDark ? "oklch(1 0 0 / 12%)"          : "oklch(0 0 0 / 12%)";

  return (
    <div className="relative">
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all"
        style={{
          background: open ? "oklch(0.58 0.22 290 / 0.15)" : chipBg,
          border: `1px solid ${open ? "oklch(0.58 0.22 290 / 0.35)" : chipBdr}`,
          color: open ? "oklch(0.78 0.18 290)" : textPri,
        }}
      >
        <Cpu size={10} style={{ color: current.color }} />
        <span>{current.label}</span>
        <ChevronDown size={9} style={{ color: textSec }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full left-0 mb-1.5 rounded-xl overflow-hidden z-50"
            style={{
              background: popBg,
              border: `1px solid ${popBdr}`,
              boxShadow: "0 -8px 24px oklch(0 0 0 / 0.4)",
              minWidth: 180,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textSec }}>切换模型</span>
            </div>
            {models.map((m) => {
              const isActive = m.id === modelId;
              return (
                <button
                  key={m.id}
                  onClick={(e) => { e.stopPropagation(); onChange(m.id); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left"
                  style={{
                    background: isActive ? "oklch(0.58 0.22 290 / 0.12)" : "transparent",
                    color: isActive ? "oklch(0.78 0.18 290)" : textPri,
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />
                  <div className="flex flex-col leading-tight">
                    <span className="font-medium">{m.label}</span>
                    {"description" in m && m.description ? (
                      <span className="truncate" style={{ color: textSec, fontSize: 10, maxWidth: 148 }}>{m.description}</span>
                    ) : null}
                  </div>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />}
                </button>
              );
            })}
            <div className="h-1.5" />
          </div>
        </>
      )}
    </div>
  );
}

// ── Node Wrapper ──────────────────────────────────────────────

interface NodeWrapperProps {
  node: CanvasNode;
  isSelected: boolean;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  children: React.ReactNode;
  minWidth?: number;
  className?: string;
  fullDrag?: boolean;
}

export function NodeWrapper({
  node, isSelected, onDragStart, onSelect, onRemove,
  children, minWidth = 200, className, fullDrag = true,
}: NodeWrapperProps) {
  return (
    <div
      className={cn("absolute select-none", className)}
      style={{ left: node.x, top: node.y, width: node.width, zIndex: node.zIndex, minWidth, cursor: fullDrag ? "grab" : undefined }}
      onMouseDown={(e) => { if (e.button !== 0) return; onDragStart(e, node.id); }}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
    >
      {isSelected && (
        <div className="absolute pointer-events-none" style={{ inset: -2, border: "1.5px solid oklch(0.58 0.22 290 / 0.7)", boxShadow: "0 0 0 4px oklch(0.58 0.22 290 / 0.12)", borderRadius: 18, zIndex: 1 }} />
      )}
      <button
        className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full flex items-center justify-center z-10 transition-opacity duration-150"
        style={{ background: "oklch(0.20 0.02 270)", border: "1px solid oklch(1 0 0 / 15%)", opacity: isSelected ? 1 : 0 }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
      >
        <X size={10} style={{ color: "oklch(0.60 0.01 270)" }} />
      </button>
      <div className="group/node">{children}</div>
    </div>
  );
}

// ── Asset Node ────────────────────────────────────────────────

export function AssetNode({ node, isSelected, onDragStart, onSelect, onRemove }: Omit<NodeWrapperProps, "children" | "className" | "fullDrag">) {
  const asset = GENERATED_ASSETS.find((a) => a.id === (node.data.assetId as string)) || GENERATED_ASSETS[0];
  const [modelId, setModelId] = useState("auto");

  const typeColor: Record<string, string> = { image: "oklch(0.78 0.18 290)", video: "oklch(0.72 0.18 200)", brand: "oklch(0.78 0.18 60)", poster: "oklch(0.80 0.18 330)" };
  const typeLabel: Record<string, string> = { image: "图片", video: "视频", brand: "品牌", poster: "海报" };
  const color = typeColor[asset.type] ?? "oklch(0.78 0.18 290)";

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={180}>
      <div className="rounded-2xl overflow-hidden transition-shadow duration-200"
        style={{
          background: "oklch(0.14 0.018 270)",
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.4)" : "oklch(1 0 0 / 10%)"}`,
          boxShadow: isSelected ? "0 12px 40px oklch(0.58 0.22 290 / 0.2), 0 4px 16px oklch(0 0 0 / 0.5)" : "0 4px 20px oklch(0 0 0 / 0.4)",
        }}
      >
        {/* Image */}
        <div className="relative overflow-hidden group/img" style={{ aspectRatio: `${asset.width}/${asset.height}` }}>
          <img src={asset.src} alt={asset.title} className="w-full h-full object-cover pointer-events-none" draggable={false} />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/35 transition-all duration-200 flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toast("下载", { description: "功能即将上线" }); }}
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ background: "oklch(1 0 0 / 20%)" }}>
              <Download size={13} className="text-white" />
            </button>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toast("全屏预览", { description: "功能即将上线" }); }}
              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ background: "oklch(1 0 0 / 20%)" }}>
              <Maximize2 size={13} className="text-white" />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-[10px] font-medium" style={{ color }}>{typeLabel[asset.type] ?? "图片"}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-white truncate flex-1">{asset.title}</div>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toast("更多操作", { description: "功能即将上线" }); }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors ml-1">
              <MoreHorizontal size={12} style={{ color: "oklch(0.45 0.01 270)" }} />
            </button>
          </div>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "oklch(0.72 0.18 200)" }}>
            {asset.width} × {asset.height}
          </span>
        </div>

        {/* ── Model switcher bottom bar ── */}
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1" style={{ borderTop: "1px solid oklch(1 0 0 / 6%)" }}
          onMouseDown={(e) => e.stopPropagation()}>
          <ModelSwitcher modelId={modelId} onChange={setModelId} models={IMAGE_AI_MODEL_OPTIONS} isDark={true} />
          <div className="flex-1" />
          <button onClick={(e) => { e.stopPropagation(); toast("重新生成", { description: "功能即将上线" }); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-all"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.2), oklch(0.72 0.18 200 / 0.15))", border: "1px solid oklch(0.58 0.22 290 / 0.25)", color: "oklch(0.78 0.18 290)" }}>
            <Sparkles size={9} />
            重新生成
          </button>
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Chat Node ─────────────────────────────────────────────────

const INITIAL_CHAT: ChatMessage[] = [
  { id: "c1", role: "user", content: "为次世代跑鞋品牌设计产品页视觉资产", timestamp: new Date(Date.now() - 120000) },
  {
    id: "c2", role: "assistant", content: "已为跑鞋产品页生成一套视觉资产，聚焦清晰度与性能冲击力。",
    steps: [
      { id: "s1", label: "分析用户意图", detail: "Analyzing intent", status: "done" },
      { id: "s2", label: "搜索参考资料", detail: "Searching references", status: "done" },
      { id: "s3", label: "生成创意资产", detail: "Generating assets", status: "done" },
    ],
    timestamp: new Date(Date.now() - 60000),
  },
];

export function ChatNode({ node, isSelected, onDragStart, onSelect, onRemove }: Omit<NodeWrapperProps, "children" | "className" | "fullDrag">) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelId, setModelId] = useState("auto");
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;
    if (!requestAiAuth()) {
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
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

    try {
      setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, steps: m.steps?.map((s) => s.id === "s1" ? { ...s, status: "done" as const } : s.id === "s2" ? { ...s, status: "running" as const } : s) } : m));
      const result = await callLLM({
        module: "chat-node",
        model: modelId,
        messages: [
          ...messages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
          { role: "user", content: input.trim() },
        ],
      });
      setMessages((p) => p.map((m) => m.id === aiMsg.id ? { ...m, content: result.text, steps: m.steps?.map((s) => ({ ...s, status: "done" as const })) } : m));
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      toast("Chat 节点请求失败", { description: message });
      setMessages((p) => p.filter((m) => m.id !== aiMsg.id));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={320} fullDrag={false}>
      <div className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "oklch(0.13 0.016 270)",
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.4)" : "oklch(1 0 0 / 10%)"}`,
          boxShadow: "0 8px 32px oklch(0 0 0 / 0.5)",
          height: node.height || 420,
        }}
      >
        {/* Header — drag handle */}
        <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 cursor-grab active:cursor-grabbing"
          style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
          onMouseDown={(e) => { if (e.button !== 0) return; onDragStart(e, node.id); }}
        >
          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}>
            <Sparkles size={11} className="text-white" />
          </div>
          <span className="text-[13px] font-semibold text-white flex-1">AI 对话</span>
          <GripVertical size={13} style={{ color: "oklch(0.35 0.01 270)" }} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" onMouseDown={(e) => e.stopPropagation()}>
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold"
                style={msg.role === "user"
                  ? { background: "oklch(0.22 0.02 270)", color: "oklch(0.65 0.01 270)" }
                  : { background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }
                }>
                {msg.role === "user" ? "U" : <Sparkles size={9} className="text-white" />}
              </div>
              <div className={cn("flex flex-col gap-1.5 max-w-[85%]", msg.role === "user" ? "items-end" : "items-start")}>
                {msg.steps && (
                  <div className="rounded-xl px-3 py-2 space-y-1.5 w-full" style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)" }}>
                    {msg.steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 flex items-center justify-center">
                          {step.status === "done" ? <Check size={9} style={{ color: "oklch(0.72 0.18 200)" }} />
                            : step.status === "running" ? <Loader2 size={9} className="animate-spin" style={{ color: "oklch(0.58 0.22 290)" }} />
                            : <div className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.30 0.01 270)" }} />}
                        </div>
                        <span className="text-[11px]" style={{ color: step.status === "done" ? "oklch(0.72 0.18 200)" : step.status === "running" ? "oklch(0.80 0.008 270)" : "oklch(0.40 0.01 270)" }}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.content && (
                  <div className="rounded-xl px-3 py-2 text-[12px] leading-relaxed"
                    style={msg.role === "user"
                      ? { background: "oklch(0.58 0.22 290 / 0.18)", border: "1px solid oklch(0.58 0.22 290 / 0.28)", color: "oklch(0.88 0.008 270)" }
                      : { background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)", color: "oklch(0.80 0.008 270)" }
                    }>
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isGenerating && (
            <div className="flex gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}>
                <Sparkles size={9} className="text-white" />
              </div>
              <div className="flex gap-1 items-center px-3 py-2 rounded-xl" style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 8%)" }}>
                {[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full animate-bounce" style={{ background: "oklch(0.58 0.22 290)", animationDelay: `${i * 150}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-2.5 pb-2 shrink-0" style={{ borderTop: "1px solid oklch(1 0 0 / 6%)", paddingTop: 6 }}
          onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-end gap-2 rounded-xl px-3 py-2" style={{ background: "oklch(0.16 0.02 270)", border: "1px solid oklch(1 0 0 / 10%)" }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="继续对话…" rows={1}
              className="flex-1 bg-transparent outline-none resize-none text-[12px]"
              style={{ color: "oklch(0.85 0.008 270)", lineHeight: 1.5 }} />
            <button onClick={(e) => { e.stopPropagation(); handleSend(); }} disabled={!input.trim() || isGenerating}
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-40 transition-all"
              style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }}>
              <Send size={10} className="text-white" />
            </button>
          </div>
        </div>

        {/* ── Model switcher bottom bar ── */}
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1.5 shrink-0"
          style={{ borderTop: "1px solid oklch(1 0 0 / 6%)" }}
          onMouseDown={(e) => e.stopPropagation()}>
          <MessageSquare size={10} style={{ color: "oklch(0.38 0.01 270)" }} />
          <span className="text-[10px]" style={{ color: "oklch(0.38 0.01 270)" }}>模型</span>
          <ModelSwitcher modelId={modelId} onChange={setModelId} isDark={true} />
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Prompt Node ───────────────────────────────────────────────

export function PromptNode({
  node, isSelected, onDragStart, onSelect, onRemove, onGenerate,
}: Omit<NodeWrapperProps, "children" | "className" | "fullDrag"> & { onGenerate?: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState((node.data.prompt as string) || "");
  const [modelId, setModelId] = useState("auto");
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={280} fullDrag={false}>
      <div className="rounded-2xl overflow-hidden"
        style={{
          background: "oklch(0.14 0.018 270)",
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.5)" : "oklch(0.58 0.22 290 / 0.2)"}`,
          boxShadow: "0 8px 32px oklch(0.58 0.22 290 / 0.1), 0 4px 16px oklch(0 0 0 / 0.4)",
        }}
      >
        {/* Header — drag handle */}
        <div className="flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing"
          style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)", background: "linear-gradient(135deg, oklch(0.58 0.22 290 / 0.12), oklch(0.72 0.18 200 / 0.08))" }}
          onMouseDown={(e) => { if (e.button !== 0) return; onDragStart(e, node.id); }}>
          <Wand2 size={13} style={{ color: "oklch(0.72 0.18 290)" }} />
          <span className="text-[12px] font-semibold" style={{ color: "oklch(0.78 0.18 290)" }}>提示词</span>
          <div className="flex-1" />
          <GripVertical size={13} style={{ color: "oklch(0.35 0.01 270)" }} />
        </div>

        {/* Textarea */}
        <div className="p-3" onMouseDown={(e) => e.stopPropagation()}>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想生成的内容…" rows={4}
            className="w-full bg-transparent outline-none resize-none text-[13px] leading-relaxed"
            style={{ color: "oklch(0.85 0.008 270)" }} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-3 pb-2" onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={(e) => { e.stopPropagation(); toast("上传参考图", { description: "功能即将上线" }); }}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <Paperclip size={13} style={{ color: "oklch(0.50 0.01 270)" }} />
          </button>
          <div className="flex-1" />
          <button onClick={async (e) => {
              e.stopPropagation();
              if (!prompt.trim() || isGenerating) return;
              if (!requestAiAuth()) {
                toast("请先登录", { description: "登录后即可使用 AI 能力" });
                return;
              }
              if (onGenerate) {
                onGenerate(prompt);
                return;
              }
              setIsGenerating(true);
              try {
                const result = await callLLM({
                  module: "prompt-node-generation",
                  model: modelId,
                  prompt: `请根据这个 Prompt 节点内容生成可执行的视觉创作说明和高质量提示词：${prompt}`,
                });
                toast("Prompt 节点已生成", { description: result.text.slice(0, 90) });
              } catch (error) {
                const message = error instanceof Error ? error.message : "请稍后重试";
                toast("Prompt 节点生成失败", { description: message });
              } finally {
                setIsGenerating(false);
              }
            }} disabled={!prompt.trim() || isGenerating}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}>
            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {isGenerating ? "生成中" : "生成"}
          </button>
        </div>

        {/* ── Model switcher bottom bar ── */}
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1.5"
          style={{ borderTop: "1px solid oklch(1 0 0 / 6%)" }}
          onMouseDown={(e) => e.stopPropagation()}>
          <Wand2 size={10} style={{ color: "oklch(0.38 0.01 270)" }} />
          <span className="text-[10px]" style={{ color: "oklch(0.38 0.01 270)" }}>模型</span>
          <ModelSwitcher modelId={modelId} onChange={setModelId} isDark={true} />
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Text Node ─────────────────────────────────────────────────

const NOTE_COLORS = [
  { bg: "oklch(0.22 0.06 290)", border: "oklch(0.58 0.22 290 / 0.4)", text: "oklch(0.85 0.008 270)" },
  { bg: "oklch(0.20 0.06 200)", border: "oklch(0.72 0.18 200 / 0.4)", text: "oklch(0.85 0.008 270)" },
  { bg: "oklch(0.22 0.06 60)",  border: "oklch(0.78 0.18 60 / 0.4)",  text: "oklch(0.85 0.008 270)" },
  { bg: "oklch(0.20 0.04 330)", border: "oklch(0.80 0.18 330 / 0.4)", text: "oklch(0.85 0.008 270)" },
];

export function TextNode({ node, isSelected, onDragStart, onSelect, onRemove }: Omit<NodeWrapperProps, "children" | "className" | "fullDrag">) {
  const [text, setText] = useState((node.data.text as string) || "在此输入备注…");
  const [colorIdx] = useState((node.data.colorIdx as number) || 0);
  const [modelId, setModelId] = useState("auto");
  const color = NOTE_COLORS[colorIdx % NOTE_COLORS.length];

  return (
    <NodeWrapper node={node} isSelected={isSelected} onDragStart={onDragStart} onSelect={onSelect} onRemove={onRemove} minWidth={160} fullDrag={false}>
      <div className="rounded-2xl overflow-hidden"
        style={{
          background: color.bg,
          border: `1px solid ${isSelected ? "oklch(0.58 0.22 290 / 0.6)" : color.border}`,
          boxShadow: "0 4px 16px oklch(0 0 0 / 0.3)",
        }}
      >
        {/* Header — drag handle */}
        <div className="flex items-center gap-1.5 px-3 py-2 cursor-grab active:cursor-grabbing"
          style={{ borderBottom: `1px solid ${color.border}` }}
          onMouseDown={(e) => { if (e.button !== 0) return; onDragStart(e, node.id); }}>
          <Type size={11} style={{ color: "oklch(0.55 0.01 270)" }} />
          <span className="text-[10px]" style={{ color: "oklch(0.48 0.01 270)" }}>备注</span>
          <div className="flex-1" />
          <GripVertical size={11} style={{ color: "oklch(0.35 0.01 270)" }} />
        </div>

        {/* Textarea */}
        <div className="p-3" onMouseDown={(e) => e.stopPropagation()}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            className="w-full bg-transparent outline-none resize-none text-[13px] leading-relaxed"
            style={{ color: color.text }} />
        </div>

        {/* ── Model switcher bottom bar ── */}
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-1.5"
          style={{ borderTop: `1px solid ${color.border}` }}
          onMouseDown={(e) => e.stopPropagation()}>
          <Cpu size={10} style={{ color: "oklch(0.38 0.01 270)" }} />
          <span className="text-[10px]" style={{ color: "oklch(0.38 0.01 270)" }}>模型</span>
          <ModelSwitcher modelId={modelId} onChange={setModelId} isDark={true} />
        </div>
      </div>
    </NodeWrapper>
  );
}
