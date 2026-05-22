/**
 * InfiniteCanvas — Neo-Studio Dark Design System
 * Infinite canvas workspace: pan, zoom, node management
 * - Add nodes via RIGHT-CLICK context menu only
 * - Bottom floating AI prompt bar (tapnow-style)
 * - Theme-aware colors
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ZoomIn, ZoomOut, Maximize, Hand, MousePointer2,
  Image as ImageIcon, MessageSquare, Type, Wand2,
  Grid3X3, Sparkles, Trash2, Layers,
  Send, Paperclip, ChevronDown, Cpu,
} from "lucide-react";
import { useCanvas } from "@/hooks/useCanvas";
import type { CanvasNode } from "@/hooks/useCanvas";
import { AssetNode, ChatNode, PromptNode, TextNode } from "./CanvasNodes";
import { GENERATED_ASSETS, PROJECTS } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

// ── Initial layout ────────────────────────────────────────────

function buildInitialNodes(): CanvasNode[] {
  return [
    { id: "chat-1",   type: "chat",   x: 60,   y: 80,  width: 340, height: 440, zIndex: 10, data: {} },
    { id: "asset-1",  type: "asset",  x: 460,  y: 80,  width: 240, zIndex: 11, data: { assetId: "a1" } },
    { id: "asset-2",  type: "asset",  x: 720,  y: 80,  width: 240, zIndex: 12, data: { assetId: "a2" } },
    { id: "prompt-1", type: "prompt", x: 460,  y: 560, width: 300, zIndex: 13, data: { prompt: "为次世代跑鞋品牌设计产品页视觉资产，包括英雄图、产品特写和运动员穿着图，突出性能与材质。" } },
    { id: "text-1",   type: "text",   x: 780,  y: 560, width: 200, zIndex: 14, data: { text: "版本 v2.1\n已生成 4 张图片\n待审核：英雄图", colorIdx: 0 } },
    { id: "asset-3",  type: "asset",  x: 1000, y: 80,  width: 240, zIndex: 15, data: { assetId: "a3" } },
    { id: "asset-4",  type: "asset",  x: 1000, y: 460, width: 240, zIndex: 16, data: { assetId: "a4" } },
  ];
}

type Tool = "select" | "hand";

interface InfiniteCanvasProps {
  projectId?: string;
}

// ── Models list ───────────────────────────────────────────────
export const AI_MODELS = [
  { id: "gpt-4o",        label: "GPT-4o",        vendor: "OpenAI",    color: "oklch(0.72 0.18 160)" },
  { id: "claude-3-5",    label: "Claude 3.5",     vendor: "Anthropic", color: "oklch(0.78 0.18 50)"  },
  { id: "gemini-1-5",    label: "Gemini 1.5",     vendor: "Google",    color: "oklch(0.72 0.18 240)" },
  { id: "flux-pro",      label: "Flux Pro",       vendor: "Black Forest", color: "oklch(0.78 0.18 290)" },
  { id: "midjourney-v6", label: "Midjourney v6",  vendor: "Midjourney", color: "oklch(0.80 0.18 330)" },
  { id: "sora",          label: "Sora",           vendor: "OpenAI",    color: "oklch(0.72 0.18 200)" },
];

export default function InfiniteCanvas({ projectId = "p1" }: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [showGrid, setShowGrid] = useState(true);
  const project = PROJECTS.find((p) => p.id === projectId) || PROJECTS[0];
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const {
    transform, nodes, selectedNodeId, isPanning, isDraggingNode,
    setSelectedNodeId, startPan, onMouseMove, stopDrag, onWheel,
    startNodeDrag, zoomIn, zoomOut, resetView, fitView, addNode, removeNode,
  } = useCanvas(buildInitialNodes());

  // Wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => { const rect = el.getBoundingClientRect(); onWheel(e, rect); };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [onWheel]);

  // Fit on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setTimeout(() => fitView(el.clientWidth, el.clientHeight), 100);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "h") setActiveTool("hand");
      if (e.key === "v" || e.key === "Escape") setActiveTool("select");
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); resetView(); }
      if (e.key === "=" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); zoomIn(); }
      if (e.key === "-" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); zoomOut(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId &&
          !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        removeNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeId, removeNode, resetView, zoomIn, zoomOut]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === "hand" || e.button === 1 || (e.button === 0 && e.altKey)) {
      startPan(e);
    } else {
      setSelectedNodeId(null);
    }
  }, [activeTool, startPan, setSelectedNodeId]);

  // ── Right-click context menu ──────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
    const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, canvasX, canvasY });
  }, [transform]);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const cursor = activeTool === "hand" || isPanning
    ? isPanning ? "grabbing" : "grab"
    : isDraggingNode ? "grabbing" : "default";

  const scalePercent = Math.round(transform.scale * 100);

  // Theme-aware canvas colors
  const canvasBg    = isDark ? "oklch(0.09 0.012 270)"      : "oklch(0.93 0.006 270)";
  const dotColor    = isDark ? "oklch(1 0 0 / 10%)"         : "oklch(0 0 0 / 10%)";
  const toolbarBg   = isDark ? "oklch(0.11 0.015 270)"      : "oklch(0.97 0.004 270)";
  const toolbarBdr  = isDark ? "oklch(1 0 0 / 6%)"          : "oklch(0 0 0 / 8%)";
  const ctxBg       = isDark ? "oklch(0.15 0.018 270)"      : "oklch(0.99 0.004 270)";
  const ctxBdr      = isDark ? "oklch(1 0 0 / 12%)"         : "oklch(0 0 0 / 12%)";
  const ctxText     = isDark ? "oklch(0.80 0.008 270)"      : "oklch(0.20 0.008 270)";
  const ctxDivider  = isDark ? "oklch(1 0 0 / 8%)"          : "oklch(0 0 0 / 8%)";

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden relative">
      {/* Canvas toolbar */}
      <CanvasToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={() => { const el = containerRef.current; if (el) fitView(el.clientWidth, el.clientHeight); }}
        onResetView={resetView}
        scalePercent={scalePercent}
        projectTitle={project.title}
        toolbarBg={toolbarBg}
        toolbarBdr={toolbarBdr}
        isDark={isDark}
      />

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor, background: canvasBg }}
        onMouseDown={(e) => { handleCanvasMouseDown(e); closeCtxMenu(); }}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onContextMenu={handleContextMenu}
      >
        {/* Dot grid */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
              backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
              backgroundPosition: `${transform.x % (24 * transform.scale)}px ${transform.y % (24 * transform.scale)}px`,
            }}
          />
        )}

        {/* Canvas world */}
        <div
          className="absolute origin-top-left"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, willChange: "transform" }}
        >
          {nodes.map((node) => {
            const commonProps = { node, isSelected: selectedNodeId === node.id, onDragStart: startNodeDrag, onSelect: setSelectedNodeId, onRemove: removeNode };
            switch (node.type) {
              case "asset":  return <AssetNode  key={node.id} {...commonProps} />;
              case "chat":   return <ChatNode   key={node.id} {...commonProps} />;
              case "prompt": return <PromptNode key={node.id} {...commonProps} onGenerate={(p) => toast("开始生成", { description: p.slice(0, 40) + "…" })} />;
              case "text":   return <TextNode   key={node.id} {...commonProps} />;
              default:       return null;
            }
          })}
        </div>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.58 0.22 290 / 0.1)", border: "1px solid oklch(0.58 0.22 290 / 0.2)" }}>
              <Sparkles size={28} style={{ color: "oklch(0.58 0.22 290 / 0.5)" }} />
            </div>
            <p className="text-[14px] font-medium" style={{ color: isDark ? "oklch(0.40 0.01 270)" : "oklch(0.55 0.01 270)" }}>画布为空</p>
            <p className="text-[12px] mt-1" style={{ color: isDark ? "oklch(0.32 0.01 270)" : "oklch(0.60 0.01 270)" }}>
              右键点击画布添加节点
            </p>
          </div>
        )}

        {/* ── Right-click context menu ── */}
        {ctxMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeCtxMenu} />
            <div
              className="absolute z-50 rounded-xl overflow-hidden"
              style={{
                left: ctxMenu.x, top: ctxMenu.y,
                background: ctxBg,
                border: `1px solid ${ctxBdr}`,
                boxShadow: "0 12px 40px oklch(0 0 0 / 0.5)",
                minWidth: 200,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Section: Add node */}
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isDark ? "oklch(0.42 0.01 270)" : "oklch(0.55 0.01 270)" }}>
                  添加节点
                </span>
              </div>
              {[
                { icon: ImageIcon,    label: "素材节点",   color: "oklch(0.78 0.18 290)", action: () => { addNode({ id: `asset-${Date.now()}`,  type: "asset",  x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 240, data: { assetId: GENERATED_ASSETS[Math.floor(Math.random() * GENERATED_ASSETS.length)].id } }); closeCtxMenu(); } },
                { icon: MessageSquare,label: "AI 对话框",  color: "oklch(0.72 0.18 200)", action: () => { addNode({ id: `chat-${Date.now()}`,   type: "chat",   x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 340, height: 440, data: {} }); closeCtxMenu(); } },
                { icon: Wand2,        label: "提示词节点", color: "oklch(0.78 0.18 60)",  action: () => { addNode({ id: `prompt-${Date.now()}`, type: "prompt", x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 300, data: { prompt: "" } }); closeCtxMenu(); } },
                { icon: Type,         label: "文本备注",   color: "oklch(0.80 0.18 330)", action: () => { addNode({ id: `text-${Date.now()}`,   type: "text",   x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 200, data: { text: "备注…", colorIdx: Math.floor(Math.random() * 4) } }); closeCtxMenu(); } },
              ].map(({ icon: Icon, label, color, action }) => (
                <button key={label} onClick={action}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left"
                  style={{ color: ctxText }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon size={13} style={{ color }} />
                  <span>{label}</span>
                </button>
              ))}

              <div style={{ height: 1, background: ctxDivider, margin: "4px 12px" }} />

              {/* Section: Canvas actions */}
              <div className="px-3 pt-1 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isDark ? "oklch(0.42 0.01 270)" : "oklch(0.55 0.01 270)" }}>
                  画布操作
                </span>
              </div>
              <button onClick={() => { toast("全选节点", { description: "功能即将上线" }); closeCtxMenu(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left"
                style={{ color: isDark ? "oklch(0.65 0.01 270)" : "oklch(0.45 0.01 270)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Layers size={13} style={{ color: isDark ? "oklch(0.52 0.01 270)" : "oklch(0.55 0.01 270)" }} />
                <span>全选节点</span>
              </button>

              {selectedNodeId && (
                <>
                  <div style={{ height: 1, background: ctxDivider, margin: "4px 12px" }} />
                  <button onClick={() => { removeNode(selectedNodeId); closeCtxMenu(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left"
                    style={{ color: "oklch(0.65 0.22 25)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(0.65 0.22 25 / 0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Trash2 size={13} style={{ color: "oklch(0.65 0.22 25)" }} />
                    <span>删除选中节点</span>
                  </button>
                </>
              )}
              <div className="h-1.5" />
            </div>
          </>
        )}

        {/* Zoom indicator */}
        <div
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg pointer-events-none"
          style={{
            background: isDark ? "oklch(0.14 0.018 270 / 0.9)" : "oklch(0.97 0.004 270 / 0.92)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 10%)"}`,
            backdropFilter: "blur(8px)",
          }}
        >
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)" }}>
            {scalePercent}%
          </span>
        </div>
      </div>

      {/* ── Bottom AI Input Bar ── */}
      <BottomPromptBar isDark={isDark} />
    </div>
  );
}

// ── Bottom Prompt Bar (tapnow-style) ──────────────────────────

const BOTTOM_MODELS = AI_MODELS.slice(0, 4);

function BottomPromptBar({ isDark }: { isDark: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const barBg    = isDark ? "oklch(0.13 0.016 270 / 0.95)" : "oklch(0.99 0.004 270 / 0.96)";
  const barBdr   = isDark ? "oklch(1 0 0 / 12%)"           : "oklch(0 0 0 / 12%)";
  const inputBg  = isDark ? "oklch(0.10 0.014 270)"         : "oklch(0.96 0.005 270)";
  const inputBdr = isDark ? "oklch(1 0 0 / 10%)"            : "oklch(0 0 0 / 10%)";
  const textPri  = isDark ? "oklch(0.88 0.008 270)"         : "oklch(0.15 0.008 270)";
  const textSec  = isDark ? "oklch(0.48 0.01 270)"          : "oklch(0.55 0.01 270)";
  const chipBg   = isDark ? "oklch(1 0 0 / 6%)"             : "oklch(0 0 0 / 6%)";
  const chipBdr  = isDark ? "oklch(1 0 0 / 10%)"            : "oklch(0 0 0 / 10%)";
  const popBg    = isDark ? "oklch(0.15 0.018 270)"         : "oklch(0.99 0.004 270)";
  const popBdr   = isDark ? "oklch(1 0 0 / 12%)"            : "oklch(0 0 0 / 12%)";

  const handleSend = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 1800));
    toast("生成完成", { description: `已使用 ${selectedModel.label} 处理您的请求` });
    setPrompt("");
    setIsGenerating(false);
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex justify-center pb-5 px-6 pointer-events-none"
      style={{ zIndex: 30 }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl pointer-events-auto"
        style={{
          background: barBg,
          border: `1px solid ${barBdr}`,
          boxShadow: "0 -4px 32px oklch(0 0 0 / 0.2), 0 8px 32px oklch(0 0 0 / 0.3)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Text area */}
        <div className="px-4 pt-3.5 pb-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="描述你想创作的内容，AI 将在画布上生成节点…"
            rows={1}
            className="w-full bg-transparent outline-none resize-none text-[14px] leading-relaxed"
            style={{
              color: textPri,
              minHeight: 24,
              maxHeight: 120,
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Bottom toolbar */}
        <div
          className="flex items-center gap-2 px-3 pb-3"
          style={{ borderTop: `1px solid ${isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 6%)"}`, paddingTop: 8 }}
        >
          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={{
                background: modelOpen ? "oklch(0.58 0.22 290 / 0.15)" : chipBg,
                border: `1px solid ${modelOpen ? "oklch(0.58 0.22 290 / 0.35)" : chipBdr}`,
                color: modelOpen ? "oklch(0.78 0.18 290)" : textPri,
              }}
            >
              <Cpu size={12} style={{ color: selectedModel.color }} />
              <span>{selectedModel.label}</span>
              <ChevronDown size={10} style={{ color: textSec }} />
            </button>

            {modelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
                <div
                  className="absolute bottom-full left-0 mb-2 rounded-xl overflow-hidden z-50"
                  style={{
                    background: popBg,
                    border: `1px solid ${popBdr}`,
                    boxShadow: "0 -8px 32px oklch(0 0 0 / 0.4)",
                    minWidth: 200,
                  }}
                >
                  <div className="px-3 pt-2.5 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textSec }}>选择模型</span>
                  </div>
                  {AI_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m); setModelOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left"
                      style={{
                        background: selectedModel.id === m.id ? "oklch(0.58 0.22 290 / 0.12)" : "transparent",
                        color: selectedModel.id === m.id ? "oklch(0.78 0.18 290)" : textPri,
                      }}
                      onMouseEnter={(e) => { if (selectedModel.id !== m.id) e.currentTarget.style.background = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)"; }}
                      onMouseLeave={(e) => { if (selectedModel.id !== m.id) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                      <div className="flex flex-col">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-[10px]" style={{ color: textSec }}>{m.vendor}</span>
                      </div>
                      {selectedModel.id === m.id && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
                      )}
                    </button>
                  ))}
                  <div className="h-1.5" />
                </div>
              </>
            )}
          </div>

          {/* Attachment */}
          <button
            onClick={() => toast("上传参考图", { description: "功能即将上线" })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-all"
            style={{ background: chipBg, border: `1px solid ${chipBdr}`, color: textSec }}
          >
            <Paperclip size={12} />
            <span>参考图</span>
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Hint */}
          <span className="text-[11px] hidden sm:block" style={{ color: isDark ? "oklch(0.35 0.01 270)" : "oklch(0.60 0.01 270)" }}>
            Enter 发送 · Shift+Enter 换行
          </span>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!prompt.trim() || isGenerating}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 disabled:opacity-40 active:scale-95"
            style={{
              background: prompt.trim() && !isGenerating
                ? "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))"
                : isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)",
            }}
          >
            {isGenerating
              ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              : <Send size={13} className={prompt.trim() ? "text-white" : ""} style={{ color: prompt.trim() ? undefined : textSec }} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Canvas Toolbar ────────────────────────────────────────────

function CanvasToolbar({
  activeTool, setActiveTool, showGrid, setShowGrid,
  onZoomIn, onZoomOut, onFitView, onResetView,
  scalePercent, projectTitle, toolbarBg, toolbarBdr, isDark,
}: {
  activeTool: Tool;
  setActiveTool: (t: Tool) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetView: () => void;
  scalePercent: number;
  projectTitle: string;
  toolbarBg: string;
  toolbarBdr: string;
  isDark: boolean;
}) {
  const textSec   = isDark ? "oklch(0.52 0.01 270)" : "oklch(0.55 0.01 270)";
  const textPri   = isDark ? "oklch(0.75 0.01 270)" : "oklch(0.25 0.01 270)";
  const divider   = isDark ? "oklch(1 0 0 / 8%)"    : "oklch(0 0 0 / 8%)";
  const chipBg    = isDark ? "oklch(1 0 0 / 5%)"    : "oklch(0 0 0 / 5%)";
  const chipBdr   = isDark ? "oklch(1 0 0 / 8%)"    : "oklch(0 0 0 / 8%)";

  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0"
      style={{ height: 48, borderBottom: `1px solid ${toolbarBdr}`, background: toolbarBg }}
    >
      {/* Project title */}
      <span className="text-[13px] font-semibold mr-2" style={{ color: textPri }}>{projectTitle}</span>
      <div className="w-px h-5 mx-1" style={{ background: divider }} />

      {/* Tool selector */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: chipBg, border: `1px solid ${chipBdr}` }}>
        {([
          { id: "select", icon: MousePointer2, title: "选择 (V)" },
          { id: "hand",   icon: Hand,          title: "手型 (H)" },
        ] as { id: Tool; icon: React.ElementType; title: string }[]).map(({ id, icon: Icon, title }) => (
          <button key={id} title={title} onClick={() => setActiveTool(id)}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-all duration-150"
            style={activeTool === id
              ? { background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" }
              : { color: textSec }
            }
          >
            <Icon size={13} className={activeTool === id ? "text-white" : ""} />
          </button>
        ))}
      </div>

      <div className="w-px h-5 mx-1" style={{ background: divider }} />

      {/* Right-click hint */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]"
        style={{ background: chipBg, border: `1px solid ${chipBdr}`, color: textSec }}
      >
        <span style={{ fontFamily: "monospace" }}>右键</span>
        <span>添加节点</span>
      </div>

      {/* Grid toggle */}
      <button title="切换网格" onClick={() => setShowGrid(!showGrid)}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
        style={showGrid
          ? { background: "oklch(0.58 0.22 290 / 0.2)", border: "1px solid oklch(0.58 0.22 290 / 0.4)", color: "oklch(0.78 0.18 290)" }
          : { color: textSec }
        }
      >
        <Grid3X3 size={14} />
      </button>

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: chipBg, border: `1px solid ${chipBdr}` }}>
        <button title="缩小 (⌘-)" onClick={onZoomOut}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: textSec }}
        >
          <ZoomOut size={13} />
        </button>
        <button onClick={onResetView} title="重置视图 (⌘0)"
          className="px-2 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: isDark ? "oklch(0.60 0.01 270)" : "oklch(0.45 0.01 270)", minWidth: 44 }}
        >
          {scalePercent}%
        </button>
        <button title="放大 (⌘+)" onClick={onZoomIn}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: textSec }}
        >
          <ZoomIn size={13} />
        </button>
        <button title="适应视图" onClick={onFitView}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: textSec }}
        >
          <Maximize size={13} />
        </button>
      </div>
    </div>
  );
}
