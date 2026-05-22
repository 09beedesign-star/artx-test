/**
 * InfiniteCanvas — React Flow based canvas
 * Tapnow-style node connection system:
 * - Nodes have left/right handles (connection ports)
 * - Hover node to reveal handles
 * - Drag from handle to create bezier edges
 * - Edges: white semi-transparent, 3px, no arrowhead
 * - Right-click context menu to add nodes
 * - Bottom AI prompt bar
 */
import { useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  Panel,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  Image as ImageIcon, MessageSquare, Type, Wand2,
  Sparkles, Trash2, Send, Paperclip, ChevronDown,
  X, Zap, Bot, Cpu,
} from "lucide-react";
import { GENERATED_ASSETS, PROJECTS, AI_MODELS } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

// AI_MODELS imported from workspace-data

// ── Model Selector (shared across nodes) ──────────────────────
function ModelSelector({ model, onChange, isDark }: { model: string; onChange: (m: string) => void; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const current = AI_MODELS.find(m => m.id === model) || AI_MODELS[0];
  const bg = isDark ? "oklch(0.13 0.015 270)" : "oklch(0.96 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.75 0.01 270)" : "oklch(0.35 0.01 270)";
  const popBg = isDark ? "oklch(0.16 0.018 270)" : "oklch(0.99 0.004 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";

  return (
    <div className="relative nodrag nopan" style={{ zIndex: 100 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: current.color, flexShrink: 0, display: "inline-block" }} />
        {current.label}
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-1 left-0 rounded-lg overflow-hidden shadow-2xl"
          style={{ background: popBg, border: `1px solid ${border}`, minWidth: 160, zIndex: 200 }}
          onClick={e => e.stopPropagation()}
        >
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] transition-colors"
              style={{
                color: text,
                background: m.id === model ? hoverBg : "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = m.id === model ? hoverBg : "transparent")}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0, display: "inline-block" }} />
              <span className="font-medium">{m.label}</span>
              <span style={{ marginLeft: "auto", opacity: 0.45, fontSize: 10 }}>{m.vendor}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Node toolbar (bottom of each node) ────────────────────────
function NodeToolbar({ model, onModelChange, onDelete, isDark }: {
  model: string; onModelChange: (m: string) => void; onDelete: () => void; isDark: boolean;
}) {
  const border = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const text = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)";
  return (
    <div
      className="flex items-center justify-between px-2 py-1.5 nodrag nopan"
      style={{ borderTop: `1px solid ${border}` }}
    >
      <ModelSelector model={model} onChange={onModelChange} isDark={isDark} />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1 rounded transition-colors hover:opacity-80"
        style={{ color: text }}
        title="删除节点"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ── Node wrapper with handles ──────────────────────────────────
function NodeWrapper({ children, selected, isDark, model, onModelChange, onDelete, style }: {
  children: React.ReactNode;
  selected: boolean;
  isDark: boolean;
  model: string;
  onModelChange: (m: string) => void;
  onDelete: () => void;
  style?: React.CSSProperties;
}) {
  const bg = isDark ? "oklch(0.13 0.015 270)" : "oklch(0.98 0.004 270)";
  const border = selected
    ? "oklch(0.65 0.22 290)"
    : isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const shadow = selected
    ? "0 0 0 2px oklch(0.65 0.22 290 / 0.4), 0 8px 32px oklch(0 0 0 / 0.4)"
    : "0 4px 24px oklch(0 0 0 / 0.25)";

  return (
    <div
      className="relative flex flex-col rounded-xl overflow-visible"
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        boxShadow: shadow,
        transition: "border-color 0.15s, box-shadow 0.15s",
        ...style,
      }}
    >
      {/* Left handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: "transparent",
          border: "none",
          width: 0,
          height: 0,
          left: -1,
        }}
        className="!w-3 !h-3 !rounded-full !border-2 !bg-white/80 !border-white/60 hover:!bg-white hover:!scale-125 transition-all"
      />
      {/* Right handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: "transparent",
          border: "none",
          width: 0,
          height: 0,
          right: -1,
        }}
        className="!w-3 !h-3 !rounded-full !border-2 !bg-white/80 !border-white/60 hover:!bg-white hover:!scale-125 transition-all"
      />
      <div className="flex flex-col flex-1 overflow-hidden rounded-xl">
        {children}
      </div>
      <NodeToolbar model={model} onModelChange={onModelChange} onDelete={onDelete} isDark={isDark} />
    </div>
  );
}

// ── Asset Node ─────────────────────────────────────────────────
function AssetNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [model, setModel] = useState("flux-pro");
  const { deleteElements, getNode } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  const asset = GENERATED_ASSETS.find(a => a.id === (data.assetId as string)) || GENERATED_ASSETS[0];
  const text = isDark ? "oklch(0.75 0.01 270)" : "oklch(0.30 0.01 270)";
  const subtext = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";
  const tagBg = isDark ? "oklch(0.18 0.02 270)" : "oklch(0.92 0.005 270)";

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })} style={{ width: 240 }}>
      {/* Image */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "16/10" }}>
        <img src={asset.src} alt={asset.title} className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2 flex gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: tagBg, color: subtext }}>
            {asset.type}
          </span>
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: "oklch(0 0 0 / 0.5)", color: "oklch(0.85 0 0)" }}>
            {asset.width}×{asset.height}
          </span>
        </div>
      </div>
      {/* Title */}
      <div className="px-3 py-2">
        <p className="text-[12px] font-semibold truncate" style={{ color: text }}>{asset.title}</p>
        <p className="text-[10px] mt-0.5" style={{ color: subtext }}>{(asset.tags || []).join(" · ")}</p>
      </div>
    </NodeWrapper>
  );
}

// ── Chat Node ──────────────────────────────────────────────────
function ChatNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [model, setModel] = useState("gpt-4o");
  const { deleteElements } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  const text = isDark ? "oklch(0.78 0.01 270)" : "oklch(0.25 0.01 270)";
  const subtext = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";
  const msgBg = isDark ? "oklch(0.18 0.02 270)" : "oklch(0.94 0.005 270)";
  const aiBg = isDark ? "oklch(0.58 0.22 290 / 0.15)" : "oklch(0.58 0.22 290 / 0.08)";
  const aiBorder = isDark ? "oklch(0.58 0.22 290 / 0.25)" : "oklch(0.58 0.22 290 / 0.2)";
  const headerBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const inputBg = isDark ? "oklch(0.16 0.018 270)" : "oklch(0.96 0.005 270)";
  const inputBorder = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";

  const messages = [
    { role: "user", content: "为次世代跑鞋品牌设计产品页视觉资产" },
    { role: "ai", content: "好的，我将为你生成以下内容：\n• 应用用户视角\n• 搜索参考资料\n• 生成视觉资产" },
    { role: "ai", content: "已为你的跑鞋品牌设计了一套视觉资产，包含英雄图、产品特写和运动员穿着图，突出性能与材质。" },
  ];

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })} style={{ width: 320 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${headerBorder}` }}>
        <div className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: "oklch(0.58 0.22 290 / 0.2)" }}>
          <MessageSquare size={11} style={{ color: "oklch(0.72 0.22 290)" }} />
        </div>
        <span className="text-[12px] font-semibold" style={{ color: text }}>AI 对话</span>
      </div>
      {/* Messages */}
      <div className="flex flex-col gap-2 p-3 overflow-y-auto nodrag nopan" style={{ maxHeight: 260 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="rounded-lg px-3 py-2 text-[11px] leading-relaxed max-w-[85%] whitespace-pre-line"
              style={{
                background: msg.role === "user" ? aiBg : msgBg,
                border: msg.role === "user" ? `1px solid ${aiBorder}` : "none",
                color: text,
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      {/* Input */}
      <div className="px-3 pb-3 nodrag nopan">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: inputBg, border: `1px solid ${inputBorder}` }}>
          <input
            className="flex-1 bg-transparent text-[11px] outline-none"
            style={{ color: text }}
            placeholder="继续对话..."
            onClick={e => e.stopPropagation()}
          />
          <button className="p-1 rounded" style={{ color: subtext }}>
            <Send size={11} />
          </button>
        </div>
      </div>
    </NodeWrapper>
  );
}

// ── Prompt Node ────────────────────────────────────────────────
function PromptNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [model, setModel] = useState("flux-pro");
  const [prompt, setPrompt] = useState((data.prompt as string) || "");
  const { deleteElements } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  const text = isDark ? "oklch(0.78 0.01 270)" : "oklch(0.25 0.01 270)";
  const subtext = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";
  const headerBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const inputBg = isDark ? "oklch(0.10 0.012 270)" : "oklch(0.94 0.005 270)";
  const inputBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })} style={{ width: 300 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${headerBorder}` }}>
        <div className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: "oklch(0.78 0.18 50 / 0.2)" }}>
          <Wand2 size={11} style={{ color: "oklch(0.78 0.18 50)" }} />
        </div>
        <span className="text-[12px] font-semibold" style={{ color: text }}>提示词</span>
      </div>
      {/* Textarea */}
      <div className="p-3 nodrag nopan">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-[11px] leading-relaxed resize-none outline-none"
          style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: text, minHeight: 80 }}
          placeholder="输入提示词..."
          rows={4}
          onClick={e => e.stopPropagation()}
        />
      </div>
      {/* Generate button */}
      <div className="px-3 pb-3 nodrag nopan">
        <button
          className="w-full py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
          style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
          onClick={() => toast("开始生成", { description: prompt.slice(0, 40) + "…" })}
        >
          <Sparkles size={11} />
          生成
        </button>
      </div>
    </NodeWrapper>
  );
}

// ── Text Node ──────────────────────────────────────────────────
function TextNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [model, setModel] = useState("gpt-4o");
  const [text2, setText2] = useState((data.text as string) || "");
  const { deleteElements } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  const colors = [
    { bg: isDark ? "oklch(0.72 0.18 50 / 0.12)" : "oklch(0.72 0.18 50 / 0.08)", border: "oklch(0.72 0.18 50 / 0.3)" },
    { bg: isDark ? "oklch(0.72 0.18 160 / 0.12)" : "oklch(0.72 0.18 160 / 0.08)", border: "oklch(0.72 0.18 160 / 0.3)" },
    { bg: isDark ? "oklch(0.72 0.18 290 / 0.12)" : "oklch(0.72 0.18 290 / 0.08)", border: "oklch(0.72 0.18 290 / 0.3)" },
  ];
  const colorIdx = typeof data.colorIdx === "number" ? data.colorIdx % colors.length : 0;
  const c = colors[colorIdx];
  const textColor = isDark ? "oklch(0.78 0.01 270)" : "oklch(0.25 0.01 270)";
  const headerBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })}
      style={{ width: 200, background: c.bg, border: `1.5px solid ${c.border}` }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${headerBorder}` }}>
        <Type size={11} style={{ color: textColor, opacity: 0.6 }} />
        <span className="text-[11px] font-semibold" style={{ color: textColor }}>备注</span>
      </div>
      {/* Text */}
      <div className="p-3 nodrag nopan">
        <textarea
          value={text2}
          onChange={e => setText2(e.target.value)}
          className="w-full bg-transparent text-[11px] leading-relaxed resize-none outline-none"
          style={{ color: textColor, minHeight: 60 }}
          placeholder="输入备注..."
          rows={3}
          onClick={e => e.stopPropagation()}
        />
      </div>
    </NodeWrapper>
  );
}

// ── Custom Edge ────────────────────────────────────────────────
function TapnowEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { deleteElements } = useReactFlow();

  const stroke = selected ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.376)";
  const strokeWidth = selected ? 3.5 : 3;

  // Midpoint for delete button
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke, strokeWidth, strokeLinecap: "round" }} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
            className="nodrag nopan"
          >
            <button
              onClick={() => deleteElements({ edges: [{ id }] })}
              className="w-5 h-5 rounded-full flex items-center justify-center shadow-lg transition-opacity hover:opacity-80"
              style={{ background: "oklch(0.55 0.22 20)", border: "1.5px solid rgba(255,255,255,0.3)" }}
            >
              <X size={9} color="white" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ── Node types & edge types ────────────────────────────────────
const nodeTypes: NodeTypes = {
  asset: AssetNodeComponent as unknown as NodeTypes["asset"],
  chat: ChatNodeComponent as unknown as NodeTypes["chat"],
  prompt: PromptNodeComponent as unknown as NodeTypes["prompt"],
  text: TextNodeComponent as unknown as NodeTypes["text"],
};

const edgeTypes: EdgeTypes = {
  tapnow: TapnowEdge as unknown as EdgeTypes["tapnow"],
};

// ── Initial nodes ──────────────────────────────────────────────
const initialNodes: Node[] = [
  { id: "chat-1",   type: "chat",   position: { x: 60,   y: 80  }, data: { id: "chat-1",   assetId: "a1" } },
  { id: "asset-1",  type: "asset",  position: { x: 460,  y: 80  }, data: { id: "asset-1",  assetId: "a1" } },
  { id: "asset-2",  type: "asset",  position: { x: 720,  y: 80  }, data: { id: "asset-2",  assetId: "a2" } },
  { id: "prompt-1", type: "prompt", position: { x: 460,  y: 420 }, data: { id: "prompt-1", prompt: "为次世代跑鞋品牌设计产品页视觉资产，包括英雄图、产品特写和运动员穿着图，突出性能与材质。" } },
  { id: "text-1",   type: "text",   position: { x: 780,  y: 420 }, data: { id: "text-1",   text: "版本 v2.1\n已生成 4 张图片\n待审核：英雄图", colorIdx: 0 } },
  { id: "asset-3",  type: "asset",  position: { x: 980,  y: 80  }, data: { id: "asset-3",  assetId: "a3" } },
  { id: "asset-4",  type: "asset",  position: { x: 980,  y: 420 }, data: { id: "asset-4",  assetId: "a4" } },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "chat-1",   target: "asset-1",  type: "tapnow", sourceHandle: "right", targetHandle: "left" },
  { id: "e2", source: "chat-1",   target: "asset-2",  type: "tapnow", sourceHandle: "right", targetHandle: "left" },
  { id: "e3", source: "prompt-1", target: "asset-3",  type: "tapnow", sourceHandle: "right", targetHandle: "left" },
  { id: "e4", source: "asset-1",  target: "prompt-1", type: "tapnow", sourceHandle: "right", targetHandle: "left" },
];

// ── Bottom AI Prompt Bar ───────────────────────────────────────
function BottomPromptBar({ isDark }: { isDark: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const bg = isDark ? "oklch(0.13 0.015 270 / 0.95)" : "oklch(0.98 0.004 270 / 0.95)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
  const text = isDark ? "oklch(0.80 0.008 270)" : "oklch(0.20 0.008 270)";
  const placeholder = isDark ? "oklch(0.40 0.008 270)" : "oklch(0.60 0.008 270)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) {
        toast("AI 正在生成节点", { description: prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "") });
        setPrompt("");
        setRows(1);
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const lineCount = e.target.value.split("\n").length;
    setRows(Math.min(lineCount, 5));
  };

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        backdropFilter: "blur(20px)",
        width: "min(680px, calc(100% - 48px))",
        zIndex: 50,
      }}
    >
      {/* Text input */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={rows}
          className="w-full bg-transparent text-[13px] leading-relaxed resize-none outline-none"
          style={{ color: text }}
          placeholder="描述你想创作的内容，AI 将在画布上生成节点..."
        />
      </div>
      {/* Bottom toolbar */}
      <div className="flex items-center gap-2 px-3 pb-3" style={{ borderTop: `1px solid ${divider}`, paddingTop: 8 }}>
        {/* Model selector */}
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        {/* Attach */}
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-opacity hover:opacity-80"
          style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)" }}
          onClick={() => toast("参考图", { description: "功能即将上线" })}
        >
          <Paperclip size={12} />
          <span>参考图</span>
        </button>
        {/* Spacer */}
        <div className="flex-1" />
        {/* Hint */}
        <span className="text-[10px]" style={{ color: isDark ? "oklch(0.38 0.008 270)" : "oklch(0.62 0.008 270)" }}>
          Enter 发送 · Shift+Enter 换行
        </span>
        {/* Send */}
        <button
          onClick={() => {
            if (prompt.trim()) {
              toast("AI 正在生成节点", { description: prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "") });
              setPrompt("");
              setRows(1);
            }
          }}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
          style={{ background: prompt.trim() ? "oklch(0.58 0.22 290)" : (isDark ? "oklch(0.22 0.015 270)" : "oklch(0.88 0.005 270)") }}
        >
          <Send size={13} color={prompt.trim() ? "white" : (isDark ? "oklch(0.40 0.01 270)" : "oklch(0.65 0.01 270)")} />
        </button>
      </div>
    </div>
  );
}

// ── Context Menu ───────────────────────────────────────────────
interface CtxMenuState { x: number; y: number; flowX: number; flowY: number; }

function ContextMenu({ menu, onClose, onAdd, isDark }: {
  menu: CtxMenuState;
  onClose: () => void;
  onAdd: (type: string, x: number, y: number) => void;
  isDark: boolean;
}) {
  const bg = isDark ? "oklch(0.15 0.018 270)" : "oklch(0.99 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
  const text = isDark ? "oklch(0.80 0.008 270)" : "oklch(0.20 0.008 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  const items = [
    { icon: <ImageIcon size={13} />, label: "添加素材节点", type: "asset", color: "oklch(0.72 0.18 240)" },
    { icon: <MessageSquare size={13} />, label: "添加对话节点", type: "chat", color: "oklch(0.72 0.22 290)" },
    { icon: <Wand2 size={13} />, label: "添加提示词节点", type: "prompt", color: "oklch(0.78 0.18 50)" },
    { icon: <Type size={13} />, label: "添加文本备注", type: "text", color: "oklch(0.72 0.18 160)" },
  ];

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [onClose]);

  return (
    <div
      className="absolute rounded-xl overflow-hidden shadow-2xl"
      style={{
        left: menu.x, top: menu.y,
        background: bg, border: `1px solid ${border}`,
        minWidth: 180, zIndex: 1000,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${divider}` }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: isDark ? "oklch(0.45 0.01 270)" : "oklch(0.55 0.01 270)" }}>
          添加节点
        </span>
      </div>
      {items.map(item => (
        <button
          key={item.type}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[12px] transition-colors"
          style={{ color: text }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          onClick={() => { onAdd(item.type, menu.flowX, menu.flowY); onClose(); }}
        >
          <span style={{ color: item.color }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Canvas (inner, uses useReactFlow) ─────────────────────
interface InnerCanvasProps { projectId?: string; }

function InnerCanvas({ projectId = "p1" }: InnerCanvasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, type: "tapnow" }, eds));
  }, [setEdges]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, flowX: flowPos.x, flowY: flowPos.y });
  }, [screenToFlowPosition]);

  const addNode = useCallback((type: string, x: number, y: number) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x, y },
      data: {
        id,
        assetId: type === "asset" ? `a${Math.ceil(Math.random() * 4)}` : undefined,
        prompt: type === "prompt" ? "" : undefined,
        text: type === "text" ? "" : undefined,
        colorIdx: type === "text" ? Math.floor(Math.random() * 3) : undefined,
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes]);

  const canvasBg = isDark ? "#0d0d14" : "#eeeef2";
  const dotColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onContextMenu={handleContextMenu}
        onClick={() => setCtxMenu(null)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: "tapnow" }}
        connectionLineStyle={{ stroke: "rgba(255,255,255,0.5)", strokeWidth: 2.5 }}
        connectionLineType={"bezier" as any}
        style={{ background: canvasBg }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color={dotColor}
        />
        <MiniMap
          style={{
            background: isDark ? "oklch(0.11 0.015 270)" : "oklch(0.95 0.004 270)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}`,
            borderRadius: 8,
          }}
          maskColor={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"}
          nodeColor={isDark ? "oklch(0.35 0.02 270)" : "oklch(0.75 0.005 270)"}
        />
        <Controls
          style={{
            background: isDark ? "oklch(0.13 0.015 270)" : "oklch(0.97 0.004 270)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}`,
            borderRadius: 8,
          }}
        />
      </ReactFlow>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onAdd={addNode}
          isDark={isDark}
        />
      )}

      {/* Bottom AI prompt bar */}
      <BottomPromptBar isDark={isDark} />
    </div>
  );
}

// ── Public export (wrapped in ReactFlowProvider) ───────────────
interface InfiniteCanvasProps { projectId?: string; }

export default function InfiniteCanvas({ projectId = "p1" }: InfiniteCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas projectId={projectId} />
    </ReactFlowProvider>
  );
}
