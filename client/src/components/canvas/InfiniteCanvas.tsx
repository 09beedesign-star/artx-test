/**
 * InfiniteCanvas — Neo-Studio Dark Design System
 * Infinite canvas workspace: pan, zoom, node management, toolbar
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ZoomIn, ZoomOut, Maximize, Hand, MousePointer2,
  Plus, Image as ImageIcon, MessageSquare, Type, Wand2,
  Grid3X3, Sparkles, Trash2, Copy, Layers,
} from "lucide-react";
import { useCanvas } from "@/hooks/useCanvas";
import type { CanvasNode } from "@/hooks/useCanvas";
import { AssetNode, ChatNode, PromptNode, TextNode } from "./CanvasNodes";
import { GENERATED_ASSETS, PROJECTS } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

// ── Initial canvas layout ─────────────────────────────────────

function buildInitialNodes(): CanvasNode[] {
  return [
    {
      id: "chat-1",
      type: "chat",
      x: 60,
      y: 80,
      width: 340,
      height: 440,
      zIndex: 10,
      data: {},
    },
    {
      id: "asset-1",
      type: "asset",
      x: 460,
      y: 80,
      width: 240,
      zIndex: 11,
      data: { assetId: "a1" },
    },
    {
      id: "asset-2",
      type: "asset",
      x: 720,
      y: 80,
      width: 240,
      zIndex: 12,
      data: { assetId: "a2" },
    },
    {
      id: "prompt-1",
      type: "prompt",
      x: 460,
      y: 560,
      width: 300,
      zIndex: 13,
      data: { prompt: "为次世代跑鞋品牌设计产品页视觉资产，包括英雄图、产品特写和运动员穿着图，突出性能与材质。" },
    },
    {
      id: "text-1",
      type: "text",
      x: 780,
      y: 560,
      width: 200,
      zIndex: 14,
      data: { text: "版本 v2.1\n已生成 4 张图片\n待审核：英雄图", colorIdx: 0 },
    },
    {
      id: "asset-3",
      type: "asset",
      x: 1000,
      y: 80,
      width: 240,
      zIndex: 15,
      data: { assetId: "a3" },
    },
    {
      id: "asset-4",
      type: "asset",
      x: 1000,
      y: 460,
      width: 240,
      zIndex: 16,
      data: { assetId: "a4" },
    },
  ];
}

type Tool = "select" | "hand";

interface InfiniteCanvasProps {
  projectId?: string;
}

export default function InfiniteCanvas({ projectId = "p1" }: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [showGrid, setShowGrid] = useState(true);
  const project = PROJECTS.find((p) => p.id === projectId) || PROJECTS[0];

  const {
    transform,
    nodes,
    selectedNodeId,
    isPanning,
    isDraggingNode,
    setSelectedNodeId,
    startPan,
    onMouseMove,
    stopDrag,
    onWheel,
    startNodeDrag,
    zoomIn,
    zoomOut,
    resetView,
    fitView,
    addNode,
    removeNode,
  } = useCanvas(buildInitialNodes());

  // Attach wheel listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      onWheel(e, rect);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [onWheel]);

  // Fit view on mount
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
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          removeNode(selectedNodeId);
        }
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

  const handleAddNode = useCallback((type: CanvasNode["type"]) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Place new node at center of visible canvas
    const cx = (rect.width / 2 - transform.x) / transform.scale;
    const cy = (rect.height / 2 - transform.y) / transform.scale;
    const id = `${type}-${Date.now()}`;

    if (type === "asset") {
      const unusedAsset = GENERATED_ASSETS.find((a) => !nodes.some((n) => n.data.assetId === a.id));
      addNode({ id, type: "asset", x: cx - 120, y: cy - 150, width: 240, data: { assetId: unusedAsset?.id || "a1" } });
    } else if (type === "chat") {
      addNode({ id, type: "chat", x: cx - 170, y: cy - 220, width: 340, height: 440, data: {} });
    } else if (type === "prompt") {
      addNode({ id, type: "prompt", x: cx - 150, y: cy - 80, width: 300, data: { prompt: "" } });
    } else if (type === "text") {
      addNode({ id, type: "text", x: cx - 100, y: cy - 60, width: 200, data: { text: "备注…", colorIdx: Math.floor(Math.random() * 4) } });
    }
  }, [transform, nodes, addNode]);

  // Right-click context menu
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

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ position: "relative" }}>
      {/* Canvas toolbar */}
      <CanvasToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        onAddNode={handleAddNode}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={() => {
          const el = containerRef.current;
          if (el) fitView(el.clientWidth, el.clientHeight);
        }}
        onResetView={resetView}
        scalePercent={scalePercent}
        projectTitle={project.title}
      />

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{
          cursor,
          background: "oklch(0.09 0.012 270)",
        }}
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
              backgroundImage: `radial-gradient(circle, oklch(1 0 0 / 12%) 1px, transparent 1px)`,
              backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
              backgroundPosition: `${transform.x % (24 * transform.scale)}px ${transform.y % (24 * transform.scale)}px`,
            }}
          />
        )}

        {/* Canvas world */}
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            willChange: "transform",
          }}
        >
          {nodes.map((node) => {
            const commonProps = {
              node,
              isSelected: selectedNodeId === node.id,
              onDragStart: startNodeDrag,
              onSelect: setSelectedNodeId,
              onRemove: removeNode,
            };
            switch (node.type) {
              case "asset":   return <AssetNode key={node.id} {...commonProps} />;
              case "chat":    return <ChatNode key={node.id} {...commonProps} />;
              case "prompt":  return <PromptNode key={node.id} {...commonProps} onGenerate={(p) => { toast("开始生成", { description: p.slice(0, 40) + "…" }); }} />;
              case "text":    return <TextNode key={node.id} {...commonProps} />;
              default:        return null;
            }
          })}
        </div>

        {/* Empty state hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.58 0.22 290 / 0.1)", border: "1px solid oklch(0.58 0.22 290 / 0.2)" }}
            >
              <Sparkles size={28} style={{ color: "oklch(0.58 0.22 290 / 0.5)" }} />
            </div>
            <p className="text-[14px] font-medium" style={{ color: "oklch(0.40 0.01 270)" }}>画布为空</p>
            <p className="text-[12px] mt-1" style={{ color: "oklch(0.32 0.01 270)" }}>点击工具栏 + 添加节点，或使用快捷键</p>
          </div>
        )}

        {/* Context menu */}
        {ctxMenu && (
          <div
            className="absolute z-50 rounded-xl overflow-hidden animate-fade-up"
            style={{
              left: ctxMenu.x,
              top: ctxMenu.y,
              background: "oklch(0.15 0.018 270)",
              border: "1px solid oklch(1 0 0 / 12%)",
              boxShadow: "0 8px 32px oklch(0 0 0 / 0.6)",
              minWidth: 180,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { icon: ImageIcon, label: "添加素材节点", color: "oklch(0.78 0.18 290)", action: () => { addNode({ id: `asset-${Date.now()}`, type: "asset", x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 240, data: { assetId: GENERATED_ASSETS[Math.floor(Math.random() * GENERATED_ASSETS.length)].id } }); closeCtxMenu(); } },
              { icon: MessageSquare, label: "添加 AI 对话", color: "oklch(0.72 0.18 200)", action: () => { addNode({ id: `chat-${Date.now()}`, type: "chat", x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 340, height: 440, data: {} }); closeCtxMenu(); } },
              { icon: Wand2, label: "添加提示词", color: "oklch(0.78 0.18 60)", action: () => { addNode({ id: `prompt-${Date.now()}`, type: "prompt", x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 300, data: { prompt: "" } }); closeCtxMenu(); } },
              { icon: Type, label: "添加文本备注", color: "oklch(0.80 0.18 330)", action: () => { addNode({ id: `text-${Date.now()}`, type: "text", x: ctxMenu.canvasX, y: ctxMenu.canvasY, width: 200, data: { text: "备注…", colorIdx: Math.floor(Math.random() * 4) } }); closeCtxMenu(); } },
            ].map(({ icon: Icon, label, color, action }) => (
              <button key={label} onClick={action} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-white/5 transition-colors text-left">
                <Icon size={13} style={{ color }} />
                <span style={{ color: "oklch(0.80 0.008 270)" }}>{label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: "oklch(1 0 0 / 8%)", margin: "2px 0" }} />
            {selectedNodeId && (
              <button onClick={() => { removeNode(selectedNodeId); closeCtxMenu(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-red-500/10 transition-colors text-left">
                <Trash2 size={13} style={{ color: "oklch(0.65 0.22 25)" }} />
                <span style={{ color: "oklch(0.65 0.22 25)" }}>删除选中节点</span>
              </button>
            )}
            <button onClick={() => { toast("全选节点", { description: "功能即将上线" }); closeCtxMenu(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-white/5 transition-colors text-left">
              <Layers size={13} style={{ color: "oklch(0.52 0.01 270)" }} />
              <span style={{ color: "oklch(0.65 0.01 270)" }}>全选节点</span>
            </button>
          </div>
        )}

        {/* Zoom indicator */}
        <div
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg pointer-events-none"
          style={{ background: "oklch(0.14 0.018 270 / 0.9)", border: "1px solid oklch(1 0 0 / 8%)", backdropFilter: "blur(8px)" }}
        >
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "oklch(0.55 0.01 270)" }}>
            {scalePercent}%
          </span>
        </div>

        {/* Shortcut hint */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-lg pointer-events-none"
          style={{ background: "oklch(0.14 0.018 270 / 0.85)", border: "1px solid oklch(1 0 0 / 8%)", backdropFilter: "blur(8px)" }}
        >
          {[
            { key: "滚轮", desc: "缩放" },
            { key: "Alt+拖拽", desc: "平移" },
            { key: "H", desc: "手型" },
            { key: "V", desc: "选择" },
          ].map((s) => (
            <div key={s.key} className="flex items-center gap-1">
              <span
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: "oklch(1 0 0 / 8%)", color: "oklch(0.55 0.01 270)", fontFamily: "monospace" }}
              >
                {s.key}
              </span>
              <span className="text-[10px]" style={{ color: "oklch(0.40 0.01 270)" }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Canvas Toolbar ────────────────────────────────────────────

function CanvasToolbar({
  activeTool, setActiveTool, showGrid, setShowGrid,
  onAddNode, onZoomIn, onZoomOut, onFitView, onResetView,
  scalePercent, projectTitle,
}: {
  activeTool: Tool;
  setActiveTool: (t: Tool) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  onAddNode: (type: CanvasNode["type"]) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetView: () => void;
  scalePercent: number;
  projectTitle: string;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const ADD_ITEMS: { type: CanvasNode["type"]; label: string; icon: React.ElementType; color: string }[] = [
    { type: "asset", label: "素材节点", icon: ImageIcon, color: "oklch(0.78 0.18 290)" },
    { type: "chat", label: "AI 对话", icon: MessageSquare, color: "oklch(0.72 0.18 200)" },
    { type: "prompt", label: "提示词", icon: Wand2, color: "oklch(0.78 0.18 60)" },
    { type: "text", label: "文本备注", icon: Type, color: "oklch(0.80 0.18 330)" },
  ];

  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0"
      style={{ height: 48, borderBottom: "1px solid oklch(1 0 0 / 6%)", background: "oklch(0.11 0.015 270)" }}
    >
      {/* Project title */}
      <span className="text-[13px] font-semibold mr-2" style={{ color: "oklch(0.75 0.01 270)" }}>
        {projectTitle}
      </span>

      <div className="w-px h-5 mx-1" style={{ background: "oklch(1 0 0 / 8%)" }} />

      {/* Tool selector */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg"
        style={{ background: "oklch(1 0 0 / 5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
      >
        {([
          { id: "select", icon: MousePointer2, title: "选择 (V)" },
          { id: "hand", icon: Hand, title: "手型 (H)" },
        ] as { id: Tool; icon: React.ElementType; title: string }[]).map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            title={title}
            onClick={() => setActiveTool(id)}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-all duration-150"
            style={activeTool === id ? {
              background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
            } : { color: "oklch(0.52 0.01 270)" }}
          >
            <Icon size={13} className={activeTool === id ? "text-white" : ""} />
          </button>
        ))}
      </div>

      <div className="w-px h-5 mx-1" style={{ background: "oklch(1 0 0 / 8%)" }} />

      {/* Add node */}
      <div className="relative">
        <button
          onClick={() => setAddMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150"
          style={{
            background: addMenuOpen
              ? "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))"
              : "oklch(1 0 0 / 5%)",
            border: "1px solid oklch(1 0 0 / 8%)",
            color: addMenuOpen ? "white" : "oklch(0.65 0.01 270)",
          }}
        >
          <Plus size={13} />
          添加节点
        </button>
        {addMenuOpen && (
          <div
            className="absolute top-full left-0 mt-1.5 rounded-xl overflow-hidden z-50 animate-fade-up"
            style={{ background: "oklch(0.15 0.018 270)", border: "1px solid oklch(1 0 0 / 10%)", boxShadow: "0 8px 32px oklch(0 0 0 / 0.5)", minWidth: 160 }}
          >
            {ADD_ITEMS.map(({ type, label, icon: Icon, color }) => (
              <button
                key={type}
                onClick={() => { onAddNode(type); setAddMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] hover:bg-white/5 transition-colors text-left"
              >
                <Icon size={13} style={{ color }} />
                <span style={{ color: "oklch(0.80 0.008 270)" }}>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid toggle */}
      <button
        title="切换网格"
        onClick={() => setShowGrid(!showGrid)}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
        style={showGrid ? {
          background: "oklch(0.58 0.22 290 / 0.2)",
          border: "1px solid oklch(0.58 0.22 290 / 0.4)",
          color: "oklch(0.78 0.18 290)",
        } : {
          color: "oklch(0.45 0.01 270)",
        }}
      >
        <Grid3X3 size={14} />
      </button>

      <div className="flex-1" />

      {/* Zoom controls */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg"
        style={{ background: "oklch(1 0 0 / 5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
      >
        <button
          title="缩小 (⌘-)"
          onClick={onZoomOut}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
          style={{ color: "oklch(0.55 0.01 270)" }}
        >
          <ZoomOut size={13} />
        </button>
        <button
          onClick={onResetView}
          className="px-2 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "oklch(0.60 0.01 270)", minWidth: 44 }}
          title="重置视图 (⌘0)"
        >
          {scalePercent}%
        </button>
        <button
          title="放大 (⌘+)"
          onClick={onZoomIn}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
          style={{ color: "oklch(0.55 0.01 270)" }}
        >
          <ZoomIn size={13} />
        </button>
        <button
          title="适应视图"
          onClick={onFitView}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
          style={{ color: "oklch(0.55 0.01 270)" }}
        >
          <Maximize size={13} />
        </button>
      </div>
    </div>
  );
}
