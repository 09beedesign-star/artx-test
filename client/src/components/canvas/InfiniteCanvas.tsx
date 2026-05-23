/**
 * InfiniteCanvas — React Flow based canvas
 * Features:
 * 1. C-key lasso: hold C + drag to draw a selection box that cuts all edges it intersects
 * 2. Right-click on blank canvas: NO menu (dismiss only)
 * 3. Right-click on node: context menu with icon commands
 * 4. Asset node double-click zoom is disabled; image download is available from the node context menu
 */
import { useCallback, useState, useRef, useEffect, useMemo, type ReactNode, Fragment } from "react";
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
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  Position,
  useReactFlow,
  useViewport,
  ReactFlowProvider,
  SelectionMode,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  Image as ImageIcon, MessageSquare, Type, Wand2,
  Sparkles, Trash2, Send, Paperclip, ChevronDown,
  X, Copy, Clipboard, Edit3, PlusSquare, FileText,
  ZoomIn, Download, Crop, Box, Eraser, SlidersHorizontal,
  MoreHorizontal, FolderOutput, Maximize2, Mic, RefreshCw,
  ChevronLeft, Home, LayoutGrid, Lock, Unlock, Plus, Minus,
  Search, ArrowRight, Share2, MousePointer2, CircleDot, Grid3X3,
  Square, PenLine, ImagePlus, Video, Captions, Repeat2, LogOut, FolderDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { GENERATED_ASSETS, AI_MODELS, PROJECTS, type GeneratedAsset, type Project } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

const ENABLE_NODE_CONNECTIONS = false;

// ── Model Selector ─────────────────────────────────────────────
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
        className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md-design)] type-caption transition-all"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: current.color, flexShrink: 0, display: "inline-block" }} />
        {current.label}
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-1 left-0 rounded-[var(--radius-md-design)] overflow-hidden shadow-2xl"
          style={{ background: popBg, border: `1px solid ${border}`, minWidth: 160, zIndex: 200 }}
          onClick={e => e.stopPropagation()}
        >
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left type-caption transition-colors"
              style={{ color: text }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0, display: "inline-block" }} />
              <span className="type-caption" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{m.label}</span>
              <span className="type-caption" style={{ marginLeft: "auto", opacity: 0.45 }}>{m.vendor}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Node Toolbar ───────────────────────────────────────────────
function NodeToolbar({ model, onModelChange, onDelete, isDark }: {
  model: string; onModelChange: (m: string) => void; onDelete: () => void; isDark: boolean;
}) {
  const border = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const text = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)";
  return (
    <div className="flex items-center justify-between px-2 py-1.5 nodrag nopan" style={{ borderTop: `1px solid ${border}` }}>
      <ModelSelector model={model} onChange={onModelChange} isDark={isDark} />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1 rounded-[var(--radius-xs)] transition-colors hover:opacity-80"
        style={{ color: text }}
        title="删除节点"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ── Node Wrapper with handles ──────────────────────────────────
function NodeWrapper({ children, selected, isDark, model, onModelChange, onDelete, style, onContextMenu, onClick, onMouseDownCapture }: {
  children: React.ReactNode;
  selected: boolean;
  isDark: boolean;
  model: string;
  onModelChange: (m: string) => void;
  onDelete: () => void;
  style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDownCapture?: (e: React.MouseEvent) => void;
}) {
  const bg = isDark ? "oklch(0.13 0.015 270)" : "oklch(0.98 0.004 270)";
  const border = selected
    ? "oklch(0.65 0.22 290)"
    : isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const shadow = selected
    ? "0 0 0 2px oklch(0.65 0.22 290 / 0.72), 0 0 0 6px oklch(0.65 0.22 290 / 0.18), 0 18px 48px oklch(0 0 0 / 0.44)"
    : "0 4px 24px oklch(0 0 0 / 0.25)";

  return (
    <div
      className="relative flex flex-col rounded-[var(--radius-lg-design)] overflow-visible"
      style={{ ...style, background: (style?.background as string) || bg, border: `1.5px solid ${border}`, boxShadow: shadow, transition: "border-color 0.15s, box-shadow 0.15s" }}
      onContextMenu={onContextMenu}
      onClick={onClick}
      onMouseDownCapture={onMouseDownCapture}
    >
      {ENABLE_NODE_CONNECTIONS && (
        <>
          <Handle type="target" position={Position.Left} id="left"
            className="!w-3 !h-3 !rounded-[var(--radius-pill)] !border-2 hover:!scale-125 transition-all"
            style={{
              left: -1,
              backgroundColor: isDark ? "rgba(255,255,255,0.80)" : "oklch(0.28 0.01 270)",
              borderColor: isDark ? "rgba(255,255,255,0.60)" : "oklch(0.20 0.01 270)",
            }} />
          <Handle type="source" position={Position.Right} id="right"
            className="!w-3 !h-3 !rounded-[var(--radius-pill)] !border-2 hover:!scale-125 transition-all"
            style={{
              right: -1,
              backgroundColor: isDark ? "rgba(255,255,255,0.80)" : "oklch(0.28 0.01 270)",
              borderColor: isDark ? "rgba(255,255,255,0.60)" : "oklch(0.20 0.01 270)",
            }} />
        </>
      )}
      <div className="flex flex-col flex-1 overflow-hidden rounded-[var(--radius-lg-design)]">
        {children}
      </div>
      <NodeToolbar model={model} onModelChange={onModelChange} onDelete={onDelete} isDark={isDark} />
    </div>
  );
}

// ── Image Preview Modal ────────────────────────────────────────
function ImagePreviewModal({ src, title, onClose, isDark }: {
  src: string; title: string; onClose: () => void; isDark: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)", zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center"
        style={{ maxWidth: "90vw", maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar — unified semi-transparent bar */}
        <div
          className="flex items-center gap-2 mb-3 px-3"
          style={{
            height: 40,
            borderRadius: "var(--radius-md-design)",
            background: "rgba(255,255,255,0.10)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.12)",
            minWidth: 240,
          }}
        >
          <span className="text-white/75 type-caption flex-1 truncate">{title}</span>
          <button
            onClick={() => toast("下载", { description: "功能即将上线" })}
            className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all hover:bg-white/15 active:scale-90"
            style={{ color: "rgba(255,255,255,0.80)" }}
          >
            <Download size={14} />
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all hover:bg-white/15 active:scale-90"
            style={{ color: "rgba(255,255,255,0.80)" }}
          >
            <X size={14} />
          </button>
        </div>
        {/* Image */}
        <img
          src={src}
          alt={title}
          style={{ maxWidth: "85vw", maxHeight: "80vh", borderRadius: "var(--radius-md-design)", boxShadow: "0 24px 80px rgba(0,0,0,0.7)", objectFit: "contain" }}
        />
        <p className="text-white/30 type-caption mt-3">按 Esc 关闭 · 点击背景关闭</p>
      </div>
    </div>
  );
}

// ── Asset Node Floating Toolbar ──────────────────────────────
function AssetFloatingToolbar({ isDark, position, onAction }: {
  isDark: boolean;
  position: { left: number; top: number };
  onAction: (action: string) => void;
}) {
  const toolBg = isDark ? "rgba(22,22,30,0.88)" : "rgba(255,255,255,0.86)";
  const toolBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const iconColor = isDark ? "rgba(255,255,255,0.76)" : "rgba(28,28,40,0.82)";
  const dividerColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const tools = [
    { icon: <Crop size={15} />, label: "裁剪", action: "crop" },
    { icon: <Box size={15} />, label: "3D", action: "3d" },
    { icon: <Eraser size={15} />, label: "消除", action: "erase" },
    { icon: <SlidersHorizontal size={15} />, label: "调色", action: "adjust" },
    { icon: <MoreHorizontal size={15} />, label: "更多", action: "more", dot: true },
  ];
  const actions = [
    { icon: <FolderOutput size={15} />, label: "移动到", action: "move" },
    { icon: <Download size={15} />, label: "下载", action: "download" },
    { icon: <Maximize2 size={15} />, label: "全屏", action: "fullscreen" },
  ];
  const buttonClass = "relative w-8 h-8 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all active:scale-90";
  const renderButton = (item: { icon: ReactNode; label: string; action: string; dot?: boolean }) => (
    <button
      key={item.action}
      title={item.label}
      aria-label={item.label}
      onClick={(e) => { e.stopPropagation(); onAction(item.action); }}
      className={buttonClass}
      style={{ color: iconColor }}
      onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {item.icon}
      {item.dot && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-[var(--radius-pill)]" style={{ background: "oklch(0.60 0.22 260)" }} />}
    </button>
  );

  return (
    <div
      className="absolute nodrag nopan"
      style={{ left: position.left, top: position.top, transform: "translate(-100%, -50%)", zIndex: 1600 }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="flex flex-col items-center rounded-[var(--radius-md-design)]"
        style={{
          background: toolBg,
          border: `1px solid ${toolBorder}`,
          backdropFilter: "blur(16px)",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.12)",
          padding: "4px",
          gap: 0,
        }}
      >
        {tools.map(renderButton)}
        <div style={{ width: 20, height: 1, background: dividerColor, margin: "2px 0", flexShrink: 0 }} />
        {actions.map(renderButton)}
      </div>
    </div>
  );
}


// ── Multi Image Selection Floating Toolbar ─────────────────────
function MultiSelectionFloatingToolbar({
  isDark,
  count,
  grouped,
  position,
  onAction,
}: {
  isDark: boolean;
  count: number;
  grouped: boolean;
  position: { left: number; top: number };
  onAction: (action: string) => void;
}) {
  const bg = isDark ? "rgba(22,22,30,0.88)" : "rgba(255,255,255,0.86)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const text = isDark ? "rgba(255,255,255,0.82)" : "rgba(28,28,40,0.82)";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const accent = "oklch(0.65 0.22 290)";
  const groupHint = grouped ? "已编组" : "未编组";
  const items = [
    { icon: <Box size={15} />, label: "编组", action: "group" },
    { icon: <FolderOutput size={15} />, label: "取消编组", action: "ungroup" },
    { icon: <LayoutGrid size={15} />, label: "自动布局", action: "auto-layout" },
    { icon: <Download size={15} />, label: "下载", action: "download" },
  ];

  return (
    <div
      className="absolute nodrag nopan"
      style={{ left: position.left, top: position.top, transform: "translate(-100%, -50%)", zIndex: 1600 }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="flex flex-col items-center rounded-[var(--radius-md-design)]"
        style={{
          background: bg,
          border: `1px solid ${border}`,
          color: text,
          backdropFilter: "blur(16px)",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.12)",
          padding: "4px",
          gap: 0,
        }}
        aria-label={`${count} 张图片已选中，${groupHint}`}
      >
        <div
          className="w-8 h-8 flex flex-col items-center justify-center rounded-[var(--radius-md-design)]"
          title={`${count} 张图片已选中 · ${groupHint}`}
          style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: text }}
        >
          <span className="type-caption" style={{ color: accent, fontWeight: 700, lineHeight: 1 }}>{count}</span>
        </div>
        <div style={{ width: 20, height: 1, background: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)", margin: "2px 0", flexShrink: 0 }} />
        {items.map(item => (
          <button
            key={item.action}
            title={item.label}
            aria-label={item.label}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-90"
            style={{ color: text }}
            onClick={() => onAction(item.action)}
            onMouseEnter={e => (e.currentTarget.style.background = hover)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Asset Node Prompt Panel ────────────────────────────────────
function AssetPromptPanel({ isDark, assetSrc, onExpand }: {
  isDark: boolean; assetSrc: string; onExpand: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("flux-pro");
  const panelBg = isDark ? "rgba(22,22,30,0.97)" : "rgba(240,240,248,0.97)";
  const panelBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const divider = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const chipBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const chipText = isDark ? "oklch(0.65 0.01 270)" : "oklch(0.45 0.01 270)";
  return (
    <div className="absolute nodrag nopan"
      data-asset-src={assetSrc}
      style={{ top: "calc(100% + 12px)", left: -48, width: "100%", background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: "var(--radius-md-design)", backdropFilter: "blur(20px)", boxShadow: "0 16px 48px rgba(0,0,0,0.4)", zIndex: 50 }}>
      <div className="flex items-center gap-2 p-3">
        <div className="w-9 h-9 rounded-[var(--radius-md-design)] flex items-center justify-center flex-shrink-0" style={{ background: chipBg, border: `1.5px solid ${panelBorder}`, color: chipText }}>
          <ImageIcon size={15} strokeWidth={1.8} />
        </div>
        <div className="w-9 h-9 rounded-[var(--radius-md-design)] flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{ border: `1.5px dashed ${panelBorder}`, color: chipText }}
          onClick={() => toast("添加参考图")}>
          <PlusSquare size={14} />
        </div>
        <div className="flex-1" />
        <button onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ color: chipText }}>
          <Maximize2 size={13} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="描述你想对这张图片做什么..."
          rows={3} className="w-full bg-transparent type-caption leading-relaxed resize-none outline-none"
          style={{ color: textColor }}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (prompt.trim()) { toast("AI 正在处理图片", { description: prompt.slice(0, 50) }); setPrompt(""); } } }} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: `1px solid ${divider}` }}>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <button className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-80"
          style={{ background: chipBg, color: chipText }}
          onClick={e => { e.stopPropagation(); toast("尺寸设置"); }}>
          <RefreshCw size={10} /> 自适应 · 1K
        </button>
        <button className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-80"
          style={{ background: chipBg, color: chipText }}
          onClick={e => { e.stopPropagation(); toast("风格设置"); }}>风格</button>
        <button className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-80"
          style={{ background: chipBg, color: chipText }}
          onClick={e => { e.stopPropagation(); toast("摄影机控制"); }}>摄影机控制</button>
        <div className="flex-1" />
        <button className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-80"
          style={{ color: chipText }}
          onClick={e => { e.stopPropagation(); toast("语音输入"); }}>
          <Mic size={12} />
        </button>
        <span className="type-caption" style={{ color: chipText }}>1×</span>
        <button className="w-7 h-7 rounded-[var(--radius-pill)] flex items-center justify-center transition-all hover:opacity-90"
          style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
          onClick={e => { e.stopPropagation(); if (prompt.trim()) { toast("AI 正在处理图片", { description: prompt.slice(0, 50) }); setPrompt(""); } else toast("请先输入描述"); }}>
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Asset Node ─────────────────────────────────────────────────
function AssetNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const multiSelectionActive = Boolean(data.multiSelectionActive);
  const [model, setModel] = useState("flux-pro");
  const [preview, setPreview] = useState(false);
  const { deleteElements, setNodes: setFlowNodes } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  useEffect(() => {
    const handlePreviewRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === nodeId) setPreview(true);
    };
    window.addEventListener("asset-preview-request", handlePreviewRequest);
    return () => window.removeEventListener("asset-preview-request", handlePreviewRequest);
  }, [nodeId]);

  const localSrc = (data as Record<string, unknown>).localSrc as string | undefined;
  const asset = GENERATED_ASSETS.find(a => a.id === (data.assetId as string)) || GENERATED_ASSETS[0];
  const displaySrc = localSrc || asset.src;
  const isEditing = !!(data as { isEditing?: boolean }).isEditing;
  const displayTitle = (data.title as string) || asset.title || "素材节点";
  const displayType = "图片";
  const subtext = isDark ? "oklch(0.62 0.006 270)" : "oklch(0.46 0.006 270)";
  const tagBg = isDark ? "oklch(0.28 0.004 270)" : "oklch(0.78 0.004 270)";
  const assetShellBg = isDark ? "oklch(0.20 0.004 270)" : "oklch(0.86 0.004 270)";
  const assetShellBorder = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
  const iconPanelBg = isDark ? "oklch(0.24 0.004 270)" : "oklch(0.80 0.004 270)";
  const naturalWidth = localSrc ? 720 : Math.max(1, asset.width || 720);
  const naturalHeight = localSrc ? 960 : Math.max(1, asset.height || 960);
  const maxNodeSide = 360;
  const minNodeSide = 180;
  const scale = Math.min(1, maxNodeSide / Math.max(naturalWidth, naturalHeight));
  const nodeWidth = Math.max(minNodeSide, Math.round(naturalWidth * scale));

  // Close panel when node loses selection
  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId, nodeType: "asset" }
    }));
  }, [nodeId]);

  const handleAssetMouseDownCapture = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      e.stopPropagation();
    }
  }, []);

  const handleAssetClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const additive = e.ctrlKey || e.metaKey;
    setFlowNodes(nds => {
      const wasSelected = Boolean(nds.find(n => n.id === nodeId)?.selected);
      const nextSelectedIds: string[] = [];
      const nextNodes = nds.map(n => {
        const selected = additive
          ? (n.id === nodeId ? !wasSelected : Boolean(n.selected))
          : n.id === nodeId;
        if (selected) nextSelectedIds.push(n.id);
        return { ...n, selected };
      });
      window.dispatchEvent(new CustomEvent("asset-click-selection", { detail: { selectedIds: nextSelectedIds } }));
      return nextNodes;
    });
    window.dispatchEvent(new CustomEvent("asset-reference", {
      detail: { id: nodeId, title: displayTitle, src: displaySrc, ctrlKey: additive }
    }));
  }, [displaySrc, displayTitle, nodeId, setFlowNodes]);

  return (
    <>
      <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
        onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })}
        style={{ width: nodeWidth, background: assetShellBg, border: `1.5px solid ${assetShellBorder}` }}
        onContextMenu={handleNodeCtxMenu}
        onClick={handleAssetClick}
        onMouseDownCapture={handleAssetMouseDownCapture}
      >
        <div
          className="relative flex items-center justify-center overflow-hidden cursor-pointer"
          style={{ background: iconPanelBg, borderBottom: `1px solid ${assetShellBorder}` }}
          onDoubleClick={(e) => { e.stopPropagation(); }}
        >
          <img
            src={displaySrc}
            alt={displayTitle}
            draggable={false}
            style={{ width: "100%", height: "auto", display: "block", objectFit: "contain" }}
          />
          {/* 15% black mask shown when this node is being edited */}
          {isEditing && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "rgba(0,0,0,0.15)",
                transition: "opacity 0.4s ease",
              }}
            />
          )}
          <div className="absolute top-2 right-2">
            <span className="type-caption px-1.5 py-0.5 rounded-[var(--radius-md-design)]" style={{ background: tagBg, color: subtext }}>
              {displayType}
            </span>
          </div>
        </div>

      </NodeWrapper>

      {/* Bottom prompt panel — shown on click when selected */}
      {preview && (
        <ImagePreviewModal src={displaySrc} title={displayTitle} onClose={() => setPreview(false)} isDark={isDark} />
      )}
    </>
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

  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId, nodeType: "chat" }
    }));
  }, [nodeId]);

  const messages = [
    { role: "user", content: "为次世代跑鞋品牌设计产品页视觉资产" },
    { role: "ai", content: "好的，我将为你生成以下内容：\n• 应用用户视角\n• 搜索参考资料\n• 生成视觉资产" },
    { role: "ai", content: "已为你的跑鞋品牌设计了一套视觉资产，包含英雄图、产品特写和运动员穿着图，突出性能与材质。" },
  ];

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })}
      style={{ width: 320 }} onContextMenu={handleNodeCtxMenu}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${headerBorder}` }}>
        <div className="w-5 h-5 rounded-[var(--radius-md-design)] flex items-center justify-center" style={{ background: "oklch(0.58 0.22 290 / 0.2)" }}>
          <MessageSquare size={11} style={{ color: "oklch(0.72 0.22 290)" }} />
        </div>
        <span className="type-caption" style={{ color: text }}>AI 对话</span>
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto nodrag nopan" style={{ maxHeight: 260 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="rounded-[var(--radius-md-design)] px-3 py-2 type-caption leading-relaxed max-w-[85%] whitespace-pre-line"
              style={{ background: msg.role === "user" ? aiBg : msgBg, border: msg.role === "user" ? `1px solid ${aiBorder}` : "none", color: text }}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3 nodrag nopan">
        <div className="flex items-center gap-2 rounded-[var(--radius-md-design)] px-3 py-2"
          style={{ background: inputBg, border: `1px solid ${inputBorder}` }}>
          <input className="flex-1 bg-transparent type-caption outline-none" style={{ color: text }}
            placeholder="继续对话..." onClick={e => e.stopPropagation()} />
          <button className="p-1 rounded-[var(--radius-xs)]" style={{ color: subtext }}><Send size={11} /></button>
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
  const headerBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const inputBg = isDark ? "oklch(0.10 0.012 270)" : "oklch(0.94 0.005 270)";
  const inputBorder = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId, nodeType: "prompt" }
    }));
  }, [nodeId]);

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })}
      style={{ width: 300 }} onContextMenu={handleNodeCtxMenu}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${headerBorder}` }}>
        <div className="w-5 h-5 rounded-[var(--radius-md-design)] flex items-center justify-center" style={{ background: "oklch(0.78 0.18 50 / 0.2)" }}>
          <Wand2 size={11} style={{ color: "oklch(0.78 0.18 50)" }} />
        </div>
        <span className="type-caption" style={{ color: text }}>提示词</span>
      </div>
      <div className="p-3 nodrag nopan">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          className="w-full rounded-[var(--radius-md-design)] px-3 py-2 type-caption leading-relaxed resize-none outline-none"
          style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: text, minHeight: 80 }}
          placeholder="输入提示词..." rows={4} onClick={e => e.stopPropagation()} />
      </div>
      <div className="px-3 pb-3 nodrag nopan">
        <button className="w-full py-1.5 rounded-[var(--radius-md-design)] type-caption flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
          style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
          onClick={() => toast("开始生成", { description: prompt.slice(0, 40) + "…" })}>
          <Sparkles size={11} />生成
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

  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId, nodeType: "text" }
    }));
  }, [nodeId]);

  return (
    <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
      onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })}
      style={{ width: 200, background: c.bg, border: `1.5px solid ${c.border}` }}
      onContextMenu={handleNodeCtxMenu}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${headerBorder}` }}>
        <Type size={11} style={{ color: textColor, opacity: 0.6 }} />
        <span className="type-caption" style={{ color: textColor }}>备注</span>
      </div>
      <div className="p-3 nodrag nopan">
        <textarea value={text2} onChange={e => setText2(e.target.value)}
          className="w-full bg-transparent type-caption leading-relaxed resize-none outline-none"
          style={{ color: textColor, minHeight: 60 }}
          placeholder="输入备注..." rows={3} onClick={e => e.stopPropagation()} />
      </div>
    </NodeWrapper>
  );
}

// ── Custom Edge ────────────────────────────────────────────────
function TapnowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { deleteElements } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  const strokeColor = isDark
    ? (selected ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.376)")
    : (selected ? "rgba(40,40,60,0.85)" : "rgba(60,60,80,0.45)");

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{
        stroke: strokeColor,
        strokeWidth: selected ? 3.5 : 3,
        strokeLinecap: "round",
      }} />
      {selected && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${midX}px,${midY}px)`, pointerEvents: "all", zIndex: 10 }}
            className="nodrag nopan">
            <button onClick={() => deleteElements({ edges: [{ id }] })}
              className="w-5 h-5 rounded-[var(--radius-pill)] flex items-center justify-center shadow-lg hover:opacity-80"
              style={{ background: "oklch(0.55 0.22 20)", border: "1.5px solid rgba(255,255,255,0.3)" }}>
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
};
const edgeTypes: EdgeTypes = {
  tapnow: TapnowEdge as unknown as EdgeTypes["tapnow"],
};

// ── Initial data ───────────────────────────────────────────────
const DEFAULT_ASSET_TAGS = ["默认 icon", "灰色容器"];

const createDefaultAssetData = (id: string, title = "素材节点") => ({
  id,
  assetId: "default",
  title,
  assetType: "素材",
  tags: DEFAULT_ASSET_TAGS,
});

type CanvasNodeSize = { width: number; height: number };
type CanvasNodeBounds = { x: number; y: number; width: number; height: number; right: number; bottom: number; centerX: number; centerY: number };

function getCanvasNodeSize(node: Node): CanvasNodeSize {
  const nodeWithRuntimeSize = node as Node & { measured?: { width?: number; height?: number }; width?: number; height?: number };
  const measuredWidth = nodeWithRuntimeSize.measured?.width ?? nodeWithRuntimeSize.width;
  const measuredHeight = nodeWithRuntimeSize.measured?.height ?? nodeWithRuntimeSize.height;
  if (typeof measuredWidth === "number" && measuredWidth > 0 && typeof measuredHeight === "number" && measuredHeight > 0) {
    return { width: measuredWidth, height: measuredHeight };
  }

  if (node.type === "asset") {
    const assetId = (node.data as Record<string, unknown>).assetId as string;
    const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
    const naturalWidth = Math.max(1, asset.width || 720);
    const naturalHeight = Math.max(1, asset.height || 960);
    const scale = Math.min(1, 360 / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(180, Math.round(naturalWidth * scale));
    const height = Math.max(120, Math.round(naturalHeight * scale));
    return { width, height };
  }

  if (node.type === "chat") return { width: 320, height: 340 };
  if (node.type === "prompt") return { width: 300, height: 190 };
  if (node.type === "text") return { width: 200, height: 130 };
  return { width: 260, height: 200 };
}

function getCanvasNodeBounds(node: Node): CanvasNodeBounds {
  const size = getCanvasNodeSize(node);
  return {
    x: node.position.x,
    y: node.position.y,
    width: size.width,
    height: size.height,
    right: node.position.x + size.width,
    bottom: node.position.y + size.height,
    centerX: node.position.x + size.width / 2,
    centerY: node.position.y + size.height / 2,
  };
}

function getCanvasNodesBounds(nodes: Node[], ids: string[]): CanvasNodeBounds | null {
  const selected = nodes.filter(n => ids.includes(n.id));
  if (selected.length === 0) return null;
  const bounds = selected.map(getCanvasNodeBounds);
  const x = Math.min(...bounds.map(b => b.x));
  const y = Math.min(...bounds.map(b => b.y));
  const right = Math.max(...bounds.map(b => b.right));
  const bottom = Math.max(...bounds.map(b => b.bottom));
  return { x, y, width: right - x, height: bottom - y, right, bottom, centerX: x + (right - x) / 2, centerY: y + (bottom - y) / 2 };
}

function canvasRectsOverlap(a: CanvasNodeBounds, b: CanvasNodeBounds, padding = 0) {
  return a.x < b.right + padding && a.right + padding > b.x && a.y < b.bottom + padding && a.bottom + padding > b.y;
}

const initialNodes: Node[] = GENERATED_ASSETS.map((asset, index) => ({
  id: `asset-sample-${asset.id}`,
  type: "asset",
  position: { x: -420 + index * 280, y: index % 2 === 0 ? -160 : 120 },
  data: {
    id: `asset-sample-${asset.id}`,
    assetId: asset.id,
    title: asset.title,
    assetType: "图片",
    tags: asset.tags || DEFAULT_ASSET_TAGS,
  },
}));

const initialEdges: Edge[] = [];


// ── Bottom AI Prompt Bar ───────────────────────────────────────
function BottomPromptBar({
  isDark,
  referencedAssets,
  onRemoveReference,
  onClearAllReferences,
}: {
  isDark: boolean;
  referencedAssets: { id: string; title: string; src: string }[];
  onRemoveReference: (id: string) => void;
  onClearAllReferences: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasRefs = referencedAssets.length > 0;
  const bg = isDark ? "rgba(22,22,30,0.80)" : "rgba(255,255,255,0.82)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const activeBorder = "oklch(0.62 0.22 290 / 60%)";
  const text = isDark ? "oklch(0.80 0.008 270)" : "oklch(0.20 0.008 270)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const chipBg = isDark ? "oklch(0.58 0.22 290 / 0.18)" : "oklch(0.58 0.22 290 / 0.12)";
  const chipBorder = isDark ? "oklch(0.62 0.22 290 / 0.35)" : "oklch(0.58 0.22 290 / 0.30)";
  const chipText = isDark ? "oklch(0.80 0.18 290)" : "oklch(0.42 0.18 290)";
  const removeColor = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.58 0.01 270)";

  // Auto-focus textarea when references change
  useEffect(() => {
    if (hasRefs) setTimeout(() => textareaRef.current?.focus(), 60);
  }, [hasRefs]);

  const handleSend = () => {
    if (prompt.trim() || hasRefs) {
      const refPart = referencedAssets.map(a => `[引用: ${a.title}]`).join(" ");
      toast("AI 正在生成节点", { description: ((refPart ? refPart + " " : "") + prompt).slice(0, 80) });
      setPrompt("");
      setRows(1);
      onClearAllReferences();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Backspace on empty prompt removes last reference
    if (e.key === "Backspace" && prompt === "" && hasRefs) {
      onRemoveReference(referencedAssets[referencedAssets.length - 1].id);
    }
  };

  const hasContent = prompt.trim() || hasRefs;
  const placeholderText = hasRefs
    ? referencedAssets.length === 1
      ? `基于「${referencedAssets[0].title}」描述你的创作意图...`
      : `基于 ${referencedAssets.length} 个引用素材描述你的创作意图...`
    : "描述你想创作的内容，AI 将在画布上生成节点...";

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[var(--radius-lg-design)] shadow-2xl overflow-hidden"
      style={{
        background: bg,
        border: `1.5px solid ${hasRefs ? activeBorder : border}`,
        backdropFilter: "blur(20px)",
        width: "min(680px, calc(100% - 420px))",
        zIndex: 50,
        transition: "border-color 0.25s cubic-bezier(0.23,1,0.32,1), box-shadow 0.25s cubic-bezier(0.23,1,0.32,1)",
        boxShadow: hasRefs
          ? `0 0 0 3px oklch(0.62 0.22 290 / 0.12), 0 10px 34px rgba(210,214,224,0.10)`
          : `0 10px 34px rgba(210,214,224,0.10)`,
      }}
    >
      {/* Multi-reference chip row */}
      {hasRefs && (
        <div
          className="flex items-center gap-1.5 px-3 pt-2.5 pb-2 flex-wrap"
          style={{ borderBottom: `1px solid ${divider}` }}
        >
          {referencedAssets.map(asset => (
            <div
              key={asset.id}
              className="relative flex items-center gap-1.5 pr-1 pl-1 py-0.5 rounded-[var(--radius-pill)] type-caption"
              style={{ background: chipBg, border: `1px solid ${chipBorder}`, color: chipText }}
            >
              {/* Default material icon */}
              <span className="flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 3, background: isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)", flexShrink: 0 }}>
                <ImageIcon size={10} style={{ opacity: 0.75 }} />
              </span>
              <span>{asset.title}</span>
              {/* Per-chip remove button */}
              <button
                onClick={() => onRemoveReference(asset.id)}
                className="w-4 h-4 rounded-[var(--radius-pill)] flex items-center justify-center ml-0.5 transition-all hover:bg-white/20 active:scale-90"
                style={{ color: removeColor, flexShrink: 0 }}
                title="移除引用"
              >
                <X size={9} strokeWidth={2.5} />
              </button>
            </div>
          ))}
          {/* Clear all button when multiple refs */}
          {referencedAssets.length > 1 && (
            <button
              onClick={onClearAllReferences}
              className="type-caption px-1.5 py-0.5 rounded-[var(--radius-pill)] hover:opacity-70 transition-opacity"
              style={{ color: removeColor }}
            >
              全部清除
            </button>
          )}
        </div>
      )}

      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => { setPrompt(e.target.value); setRows(Math.min(e.target.value.split("\n").length, 5)); }}
          onKeyDown={handleKeyDown}
          rows={rows}
          className="w-full bg-transparent type-caption leading-relaxed resize-none outline-none"
          style={{ color: text }}
          placeholder={placeholderText}
        />
      </div>
      <div className="flex items-center gap-2 px-3 pb-3" style={{ paddingTop: 8 }}>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md-design)] type-caption hover:opacity-80"
          style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)" }}
          onClick={() => toast("参考图", { description: "功能即将上线" })}
        >
          <Paperclip size={12} /><span>参考图</span>
        </button>
        <div className="flex-1" />
        <span className="type-caption" style={{ color: isDark ? "oklch(0.38 0.008 270)" : "oklch(0.62 0.008 270)" }}>
          {hasRefs ? `Ctrl+单击 多选 · ` : ""}回车发送
        </span>
        <button
          onClick={handleSend}
          className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center hover:opacity-80"
          style={{ background: hasContent ? "oklch(0.58 0.22 290)" : (isDark ? "oklch(0.22 0.015 270)" : "oklch(0.88 0.005 270)") }}
        >
          <Send size={13} color={hasContent ? "white" : (isDark ? "oklch(0.40 0.01 270)" : "oklch(0.65 0.01 270)")} />
        </button>
      </div>
    </div>
  );
}

// ── Node Context Menu (right-click on node or selected group) ───
interface NodeCtxState {
  x: number;
  y: number;
  nodeId: string;
  nodeType: string;
  selectedIds?: string[];
  grouped?: boolean;
}

function NodeContextMenu({ menu, onClose, onAction, isDark }: {
  menu: NodeCtxState;
  onClose: () => void;
  onAction: (action: string, nodeId: string) => void;
  isDark: boolean;
}) {
  const bg = isDark ? "oklch(0.14 0.018 270)" : "oklch(0.99 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.18 0.008 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 5%)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const iconColor = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)";
  const dangerColor = "oklch(0.65 0.22 20)";

  const selectedCount = menu.selectedIds?.length || 1;
  const isSelectionMenu = menu.nodeType === "selection" || selectedCount > 1;
  const isGroupContainerMenu = menu.nodeType === "group-container" || menu.nodeType === "group-container-inside";

  // Group container right-click menu: 解散打组 / 进入打组 / 重命名
  const isInsideGroup = menu.nodeType === "group-container-inside";
  const groupContainerItems = isInsideGroup
    ? [
        { icon: <LogOut size={13} />, label: "退出打组", action: "exit-group", color: iconColor },
        { icon: <Box size={13} />, label: "重命名", action: "rename-group", color: iconColor },
        { icon: <FolderOutput size={13} />, label: "解散打组", action: "ungroup", color: dangerColor },
      ]
    : [
        { icon: <FolderDown size={13} />, label: "批量下载", action: "batch-download", color: iconColor },
        { icon: <Box size={13} />, label: "重命名", action: "rename-group", color: iconColor },
        { icon: <FolderOutput size={13} />, label: "解散打组", action: "ungroup", color: dangerColor },
      ];

  // Multi-selection menu: 打组 / 取消编组 / 自动布局 / 下载
  const selectionItems = [
    { icon: <Copy size={13} />, label: "复制", action: "copy", color: iconColor },
    { icon: <Clipboard size={13} />, label: "粘贴", action: "paste", color: iconColor },
    { icon: <Box size={13} />, label: "打组", action: "group", color: iconColor },
    { icon: <Type size={13} />, label: "添加文本备注", action: "add-note", color: iconColor },
    { icon: <Trash2 size={13} />, label: "删除节点", action: "delete", color: dangerColor },
  ];

  // Single node menu: NO 解散打组 (removed per spec)
  const singleItems = [
    { icon: <Edit3 size={13} />, label: "编辑素材", action: "edit-asset", color: iconColor },
    ...(menu.nodeType === "asset" ? [{ icon: <Download size={13} />, label: "下载图片", action: "download", color: iconColor }] : []),
    { icon: <Copy size={13} />, label: "复制", action: "copy", color: iconColor },
    { icon: <Clipboard size={13} />, label: "粘贴", action: "paste", color: iconColor },
    { icon: <Type size={13} />, label: "添加文本备注", action: "add-note", color: iconColor },
    { icon: <Trash2 size={13} />, label: "删除节点", action: "delete", color: dangerColor },
  ];

  const items = isGroupContainerMenu ? groupContainerItems : isSelectionMenu ? selectionItems : singleItems;

  useEffect(() => {
    const handler = (e: MouseEvent) => { onClose(); };
    // Delay so the right-click that opened this doesn't immediately close it
    const t = setTimeout(() => window.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", handler); };
  }, [onClose]);

  return (
    <div
      className="absolute rounded-[var(--radius-lg-design)] overflow-hidden shadow-2xl"
      style={{ left: menu.x, top: menu.y, background: bg, border: `1px solid ${border}`, minWidth: 196, zIndex: 2000 }}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={`div-${i}`} style={{ height: 1, background: divider, margin: "2px 0" }} />
        ) : (
          <button
            key={item.action}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left type-caption transition-colors"
            style={{ color: item.action === "delete" ? dangerColor : text }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { onAction(item.action, menu.nodeId); onClose(); }}
          >
            <span style={{ color: item.color, opacity: item.action === "delete" ? 1 : 0.75, flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Group Container Overlay (rendered over ReactFlow canvas) ──────────────────────────────────
interface GroupInfo {
  groupId: string;
  name: string;
  bounds: CanvasNodeBounds;
}

function GroupContainerOverlay({
  groups,
  viewport,
  isDark,
  enteringGroupId,
  onContextMenu,
  onDoubleClick,
  onDragEnd,
  onLabelDoubleClick,
}: {
  groups: GroupInfo[];
  viewport: { x: number; y: number; zoom: number };
  isDark: boolean;
  enteringGroupId: string | null;
  onContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onDoubleClick: (groupId: string) => void;
  onDragEnd: (groupId: string, dx: number, dy: number) => void;
  onLabelDoubleClick: (groupId: string) => void;
}) {
  if (groups.length === 0) return null;
  const containerBg = isDark ? "oklch(0.58 0.22 290 / 0.07)" : "oklch(0.58 0.22 290 / 0.05)";
  const containerBorder = isDark ? "oklch(0.65 0.20 290 / 0.45)" : "oklch(0.55 0.20 290 / 0.35)";
  const labelBg = isDark ? "oklch(0.58 0.22 290 / 0.85)" : "oklch(0.52 0.20 290 / 0.90)";
  const enteringBorder = "oklch(0.72 0.22 50 / 0.80)";
  const enteringBg = isDark ? "oklch(0.72 0.22 50 / 0.06)" : "oklch(0.72 0.22 50 / 0.04)";

  return (
    <>
      {groups.map(g => {
        const pad = 20;
        const left = g.bounds.x * viewport.zoom + viewport.x - pad;
        const top = g.bounds.y * viewport.zoom + viewport.y - pad - 28;
        const width = g.bounds.width * viewport.zoom + pad * 2;
        const height = g.bounds.height * viewport.zoom + pad * 2 + 28;
        const isEntering = enteringGroupId === g.groupId;
        return (
          <GroupContainerCard
            key={g.groupId}
            groupId={g.groupId}
            name={g.name}
            left={left}
            top={top}
            width={width}
            height={height}
            isEntering={isEntering}
            isDark={isDark}
            containerBg={containerBg}
            containerBorder={containerBorder}
            labelBg={labelBg}
            enteringBorder={enteringBorder}
            enteringBg={enteringBg}
            onContextMenu={onContextMenu}
            onDoubleClick={onDoubleClick}
            onDragEnd={onDragEnd}
            onLabelDoubleClick={onLabelDoubleClick}
          />
        );
      })}
    </>
  );
}

// Individual draggable group container card
function GroupContainerCard({
  groupId, name, left, top, width, height, isEntering, isDark,
  containerBg, containerBorder, labelBg, enteringBorder, enteringBg,
  onContextMenu, onDoubleClick, onDragEnd, onLabelDoubleClick,
}: {
  groupId: string; name: string; left: number; top: number; width: number; height: number;
  isEntering: boolean; isDark: boolean;
  containerBg: string; containerBorder: string; labelBg: string; enteringBorder: string; enteringBg: string;
  onContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onDoubleClick: (groupId: string) => void;
  onDragEnd: (groupId: string, dx: number, dy: number) => void;
  onLabelDoubleClick: (groupId: string) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const lastClickTime = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on primary button, not on label area
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-group-label]")) return;
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: left, startTop: top };
    setDragging(true);
    setOffset({ dx: 0, dy: 0 });
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setOffset({ dx: ev.clientX - dragRef.current.startX, dy: ev.clientY - dragRef.current.startY });
    };
    const onUp = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setDragging(false);
      setOffset({ dx: 0, dy: 0 });
      dragRef.current = null;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        onDragEnd(groupId, dx, dy);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [left, top, groupId, onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      // Double click detected
      e.stopPropagation();
      onDoubleClick(groupId);
    }
    lastClickTime.current = now;
  }, [groupId, onDoubleClick]);

  const currentLeft = left + (dragging ? offset.dx : 0);
  const currentTop = top + (dragging ? offset.dy : 0);

  return (
    <div
      className="absolute"
      style={{
        left: currentLeft,
        top: currentTop,
        width,
        height,
        background: isEntering ? enteringBg : containerBg,
        border: `1.5px solid ${isEntering ? enteringBorder : containerBorder}`,
        borderRadius: "var(--radius-lg-design)",
        zIndex: dragging ? 20 : 5,
        pointerEvents: "all",
        transition: dragging ? "none" : "border-color 0.2s ease, background 0.2s ease",
        boxShadow: dragging
          ? `0 12px 48px rgba(0,0,0,0.28), 0 0 0 2px oklch(0.65 0.20 290 / 0.60)`
          : isEntering
            ? `0 0 0 3px oklch(0.72 0.22 50 / 0.15), 0 8px 32px rgba(0,0,0,0.18)`
            : `0 4px 24px rgba(0,0,0,0.10)`,
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, groupId); }}
    >
      {/* Group name label — top-left, double-click to rename */}
      <div
        data-group-label="true"
        className="absolute flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-md-design)] type-caption"
        style={{
          top: 6,
          left: 8,
          background: isEntering ? "oklch(0.72 0.22 50 / 0.88)" : labelBg,
          color: "white",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.02em",
          pointerEvents: "all",
          userSelect: "none",
          backdropFilter: "blur(8px)",
          cursor: "pointer",
        }}
        onDoubleClick={e => { e.stopPropagation(); onLabelDoubleClick(groupId); }}
        title="双击重命名"
      >
        <Box size={9} strokeWidth={2.2} />
        {name}
      </div>
      {/* Hint when entering */}
      {isEntering && (
        <div
          className="absolute"
          style={{
            bottom: 8, right: 10,
            fontSize: 10,
            color: isDark ? "oklch(0.72 0.22 50 / 0.75)" : "oklch(0.55 0.18 50 / 0.80)",
            fontWeight: 500,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          已进入打组 · 单击空白退出
        </div>
      )}
    </div>
  );
}

// ── C-key Lasso Eraser Overlay ─────────────────────────────────
interface LassoRect { x: number; y: number; w: number; h: number; }

function LassoEraser({ isDark, onCut }: { isDark: boolean; onCut: (rect: LassoRect) => void }) {
  const [active, setActive] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<LassoRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setActive(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") {
        setActive(false);
        setDrawing(false);
        setStart(null);
        setRect(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!active || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = overlayRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDrawing(true);
    setStart({ x: e.clientX - r.left, y: e.clientY - r.top });
    setRect(null);
  }, [active]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing || !start) return;
    const el = overlayRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    setRect({
      x: Math.min(start.x, cx),
      y: Math.min(start.y, cy),
      w: Math.abs(cx - start.x),
      h: Math.abs(cy - start.y),
    });
  }, [drawing, start]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing || !rect) { setDrawing(false); setStart(null); setRect(null); return; }
    e.stopPropagation();
    onCut(rect);
    setDrawing(false);
    setStart(null);
    setRect(null);
  }, [drawing, rect, onCut]);

  if (!active) return null;

  const borderColor = isDark ? "rgba(255,100,100,0.8)" : "rgba(200,50,50,0.8)";
  const fillColor = isDark ? "rgba(255,80,80,0.08)" : "rgba(200,50,50,0.06)";

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{ zIndex: 500, cursor: "crosshair" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Hint */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-[var(--radius-pill)] type-caption pointer-events-none"
        style={{ background: isDark ? "rgba(255,80,80,0.15)" : "rgba(200,50,50,0.1)", border: `1px solid ${borderColor}`, color: isDark ? "rgba(255,150,150,0.9)" : "rgba(180,40,40,0.9)" }}>
        ✂ 框选区域内的连线将被切断 · 松开 C 键退出
      </div>
      {/* Lasso rect */}
      {rect && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: rect.x, top: rect.y, width: rect.w, height: rect.h,
            background: fillColor,
            border: `1.5px dashed ${borderColor}`,
            borderRadius: "var(--radius-xs)",
          }}
        />
      )}
    </div>
  );
}

// ── Asset Edit Prompt Bar (in-canvas, no overlay) ──────────────────────────────────────────────
function AssetEditPromptBar({
  asset, isDark, onClose,
}: {
  asset: { id: string; title: string; src: string };
  isDark: boolean;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("flux-pro");
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fade-in after mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const text = isDark ? "rgba(255,255,255,0.85)" : "rgba(20,20,36,0.85)";
  const subtext = isDark ? "rgba(255,255,255,0.40)" : "rgba(20,20,36,0.40)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const handleSend = () => {
    if (prompt.trim()) {
      toast("AI 正在编辑素材", { description: prompt.slice(0, 60) });
      setPrompt("");
      onClose();
    } else {
      toast("请先输入编辑指令");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        width: "min(680px, calc(100% - 420px))",
        zIndex: 200,
        background: isDark ? "rgba(18,18,28,0.97)" : "rgba(255,255,255,0.97)",
        backdropFilter: "blur(24px)",
        border: `1.5px solid oklch(0.62 0.22 290 / 55%)`,
        boxShadow: `0 0 0 3px oklch(0.62 0.22 290 / 0.12), 0 12px 48px rgba(0,0,0,0.28)`,
        borderRadius: "var(--radius-md-design)",
        overflow: "hidden",
        // Slide-up entrance, always centered horizontally
        transform: visible
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(20px)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.35s cubic-bezier(0.23,1,0.32,1), opacity 0.30s ease",
      }}
    >
      {/* Header: asset chip + close */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2" style={{ borderBottom: `1px solid ${divider}` }}>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-pill)] type-caption"
          style={{
            background: isDark ? "oklch(0.58 0.22 290 / 0.18)" : "oklch(0.58 0.22 290 / 0.12)",
            border: `1px solid ${isDark ? "oklch(0.62 0.22 290 / 0.35)" : "oklch(0.58 0.22 290 / 0.30)"}`,
            color: isDark ? "oklch(0.80 0.18 290)" : "oklch(0.42 0.18 290)",
          }}
        >
          <img src={asset.src} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} />
          <ImageIcon size={9} style={{ opacity: 0.7 }} />
          <span>{asset.title}</span>
        </div>
        <span className="type-caption" style={{ color: subtext }}>正在编辑此素材</span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all hover:opacity-70 active:scale-90"
          style={{ color: subtext }}
          title="关闭 (Esc)"
        >
          <X size={13} />
        </button>
      </div>

      {/* Prompt textarea */}
      <div className="px-4 pt-3 pb-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          rows={2}
          className="w-full bg-transparent type-caption leading-relaxed resize-none outline-none"
          style={{ color: text }}
          placeholder="描述你想如何编辑这张图片，例如：更换背景为星空、加强光效、调整配色..."
        />
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center gap-2 px-3 pb-3" style={{ borderTop: `1px solid ${divider}`, paddingTop: 8 }}>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <div className="flex-1" />
        <span className="type-caption" style={{ color: subtext }}>回车发送</span>
        <button
          onClick={handleSend}
          className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center hover:opacity-80 active:scale-90 transition-all"
          style={{ background: prompt.trim() ? "oklch(0.58 0.22 290)" : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)") }}
        >
          <Send size={13} color={prompt.trim() ? "white" : (isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)")} />
        </button>
      </div>
    </div>
  );
}

// ── Zoom Control Bar (left-bottom vertical bar) ──────────────────────────────
function ZoomControlBar({ isDark, locked, onLockedChange }: { isDark: boolean; locked: boolean; onLockedChange: (locked: boolean) => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // Bar style mirrors the image preview toolbar
  const barBg = isDark ? "rgba(22,22,30,0.80)" : "rgba(255,255,255,0.82)";
  const barBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const iconColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(28,28,40,0.80)";
  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const btnClass = "w-8 h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-90 hover:opacity-80";

  return (
    <div
      className="absolute"
      style={{ bottom: 110, left: 31, zIndex: 100, opacity: 0.6 }}
    >
      <div
        className="flex flex-col items-center"
        style={{
          background: barBg,
          backdropFilter: "blur(12px)",
          border: `1px solid ${barBorder}`,
          borderRadius: "var(--radius-md-design)",
          padding: "4px",
          gap: 0,
          boxShadow: isDark
            ? "0 8px 32px rgba(0,0,0,0.45)"
            : "0 4px 20px rgba(0,0,0,0.12)",
        }}
      >
        {/* Zoom In */}
        <button
          className={btnClass}
          style={{ color: iconColor }}
          title="放大"
          onClick={() => zoomIn({ duration: 200 })}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Plus size={15} strokeWidth={2} />
        </button>

        {/* Divider */}
        <div style={{ width: 20, height: 1, background: dividerColor, margin: "2px 0" }} />

        {/* Zoom Out */}
        <button
          className={btnClass}
          style={{ color: iconColor }}
          title="缩小"
          onClick={() => zoomOut({ duration: 200 })}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Minus size={15} strokeWidth={2} />
        </button>

        {/* Divider */}
        <div style={{ width: 20, height: 1, background: dividerColor, margin: "2px 0" }} />

        {/* Fit View — four-corner frame with center dot */}
        <button
          className={btnClass}
          style={{ color: iconColor }}
          title="居中显示"
          onClick={() => fitView({ duration: 400, padding: 0.15 })}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {/* Custom SVG: outer corner brackets + inner center square */}
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Top-left corner */}
            <path d="M1 4.5V1H4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Top-right corner */}
            <path d="M10.5 1H14V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Bottom-right corner */}
            <path d="M14 10.5V14H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Bottom-left corner */}
            <path d="M4.5 14H1V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Center square */}
            <rect x="5.5" y="5.5" width="4" height="4" rx="0.8" fill="currentColor" opacity="0.85"/>
          </svg>
        </button>

        {/* Divider */}
        <div style={{ width: 20, height: 1, background: dividerColor, margin: "2px 0" }} />

        {/* Lock / Unlock */}
        <button
          className={btnClass}
          style={{
            color: locked ? "oklch(0.68 0.29 25)" : iconColor,
            background: locked ? "oklch(0.62 0.28 25 / 0.18)" : "transparent",
            boxShadow: locked ? "0 0 0 1px oklch(0.68 0.29 25 / 0.35), 0 0 18px oklch(0.62 0.28 25 / 0.26)" : "none",
          }}
          title={locked ? "解锁画布" : "锁定画布"}
          aria-pressed={locked}
          onClick={() => onLockedChange(!locked)}
          onMouseEnter={e => (e.currentTarget.style.background = locked ? "oklch(0.62 0.28 25 / 0.24)" : hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = locked ? "oklch(0.62 0.28 25 / 0.18)" : "transparent")}
        >
          {locked ? <Lock size={13} strokeWidth={2.4} /> : <Unlock size={13} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}

// ── Back Button ───────────────────────────────────────────────
function BackButton({ isDark }: { isDark: boolean }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const backButtonRef = useRef<HTMLDivElement>(null);
  const bg = isDark ? "oklch(0.13 0.015 270 / 0.95)" : "oklch(0.98 0.004 270 / 0.95)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "oklch(0.78 0.01 270)" : "oklch(0.25 0.01 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof globalThis.Node && backButtonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", handler, true), 50);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", handler, true); };
  }, [open]);

  return (
    <div ref={backButtonRef} className="absolute" style={{ top: 12, left: 12, zIndex: 101 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-lg-design)] type-caption shadow-lg transition-all hover:opacity-90 active:scale-95"
        style={{
          background: bg,
          border: `1px solid ${border}`,
          color: text,
          backdropFilter: "blur(12px)",
        }}
      >
        <ChevronLeft size={14} />
        返回
      </button>
      {open && (
        <div
          className="absolute top-full mt-1.5 left-0 rounded-[var(--radius-lg-design)] overflow-hidden shadow-2xl"
          style={{ background: bg, border: `1px solid ${border}`, minWidth: 148, backdropFilter: "blur(16px)" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left type-caption transition-colors"
            style={{ color: text }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { navigate("/"); setOpen(false); }}
          >
            <Home size={13} />
            返回首页
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left type-caption transition-colors"
            style={{ color: text }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { navigate("/workspace"); setOpen(false); }}
          >
            <LayoutGrid size={13} />
            返回工作台
          </button>
        </div>
      )}
    </div>
  );
}

// ── Top-Left Node Creation Toolbar ───────────────────────────
function TopLeftToolbar({ isDark, onAdd }: { isDark: boolean; onAdd: (type: string, x: number, y: number) => void }) {
  const [open, setOpen] = useState(false);
  const bg = isDark ? "oklch(0.13 0.015 270 / 0.95)" : "oklch(0.98 0.004 270 / 0.95)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
  const text = isDark ? "oklch(0.78 0.01 270)" : "oklch(0.25 0.01 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  const nodeOptions = [
    { icon: <ImageIcon size={13} />, label: "图片节点", type: "asset" },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    const t = setTimeout(() => window.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", handler); };
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-lg-design)] type-caption shadow-lg transition-all hover:opacity-90 active:scale-95"
        style={{
          background: open
            ? (isDark ? "oklch(0.55 0.18 280)" : "oklch(0.50 0.18 280)")
            : (isDark ? "oklch(0.18 0.02 270 / 0.95)" : "oklch(0.97 0.004 270 / 0.95)"),
          border: `1.5px solid ${open ? "oklch(0.65 0.20 280 / 0.6)" : border}`,
          color: open ? "white" : text,
          backdropFilter: "blur(12px)",
        }}
      >
        <ImageIcon size={14} />
        创建图片
        <ChevronDown size={11} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1.5 left-0 rounded-[var(--radius-lg-design)] overflow-hidden shadow-2xl"
          style={{ background: bg, border: `1px solid ${border}`, minWidth: 168, backdropFilter: "blur(16px)" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-2" style={{ borderBottom: `1px solid ${divider}` }}>
            <span className="type-caption uppercase" style={{ color: isDark ? "oklch(0.42 0.01 270)" : "oklch(0.58 0.01 270)" }}>创建图片节点</span>
          </div>
          {nodeOptions.map((opt) => (
            <button
              key={opt.type}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left type-caption transition-colors"
              style={{ color: text }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              onClick={() => {
                // Place new node at a visible center-ish position
                onAdd(opt.type, 200 + Math.random() * 200, 150 + Math.random() * 150);
                setOpen(false);
                toast(`已添加${opt.label}`);
              }}
            >
              <span style={{ color: isDark ? "oklch(0.55 0.15 280)" : "oklch(0.50 0.15 280)", flexShrink: 0 }}>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Canvas Top Tool Palette ─────────────────────────────────────
function CanvasTopToolPalette({ isDark }: { isDark: boolean }) {
  const [active, setActive] = useState("annotate");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);
  const bg = isDark ? "rgba(22,22,30,0.82)" : "rgba(255,255,255,0.88)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.78)" : "rgba(28,28,40,0.82)";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const popBg = isDark ? "rgba(24,24,34,0.96)" : "rgba(255,255,255,0.96)";

  const tools = [
    { id: "move", label: "移动", icon: <MousePointer2 size={18} /> },
    { id: "annotate", label: "注释", icon: <CircleDot size={18} /> },
    { id: "upload", label: "上传图片", icon: <ImagePlus size={17} /> },
    { id: "grid", label: "网格", icon: <Grid3X3 size={17} /> },
    { id: "shape", label: "创建几何形", icon: <Square size={17} /> },
    { id: "draw", label: "绘制", icon: <PenLine size={17} /> },
    { id: "text", label: "创建文字", icon: <Type size={18} /> },
    { id: "image-ai", label: "生成图片", icon: <Sparkles size={17} /> },
    { id: "video-ai", label: "生成视频", icon: <Video size={17} /> },
    { id: "copy-ai", label: "智能文案", icon: <Captions size={17} />, dot: true },
  ];

  const handleToolClick = (id: string) => {
    setActive(id);
    setUploadOpen(id === "upload" ? value => !value : false);
    setShapeOpen(id === "shape" ? value => !value : false);
    if (!["upload", "shape"].includes(id)) toast("工具已切换", { description: tools.find(tool => tool.id === id)?.label });
  };

  return (
    <div className="absolute nodrag nopan" style={{ top: 16, left: "calc((100% - clamp(280px, 32vw, 372px)) / 2)", transform: "translateX(-50%)", zIndex: 1300 }} onMouseDown={e => e.stopPropagation()}>
      {(uploadOpen || shapeOpen) && (
        <div
          className="absolute left-[88px] bottom-full mb-2 rounded-[var(--radius-lg-design)] p-2 shadow-2xl"
          style={{ background: popBg, border: `1px solid ${border}`, backdropFilter: "blur(18px)", minWidth: shapeOpen ? 176 : 150 }}
        >
          {(uploadOpen ? [
            { icon: <ImagePlus size={15} />, label: "上传图片" },
            { icon: <Video size={15} />, label: "上传视频" },
          ] : [
            { icon: <Square size={15} />, label: "矩形", key: "R" },
            { icon: <PenLine size={15} />, label: "线条", key: "L" },
            { icon: <ArrowRight size={15} />, label: "箭头", key: "⇧ L" },
            { icon: <CircleDot size={15} />, label: "椭圆", key: "O" },
            { icon: <Box size={15} />, label: "多边形" },
            { icon: <Sparkles size={15} />, label: "星形" },
          ]).map(item => (
            <button key={item.label} className="flex w-full items-center gap-3 rounded-[var(--radius-md-design)] px-3 py-2 type-caption text-left" style={{ color: text }} onClick={() => toast(item.label)} onMouseEnter={e => (e.currentTarget.style.background = hover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {item.icon}<span className="flex-1">{item.label}</span>{"key" in item && <span style={{ opacity: 0.42 }}>{item.key}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center rounded-[var(--radius-lg-design)] px-2 py-1 shadow-lg" style={{ background: bg, border: `1px solid ${border}`, backdropFilter: "blur(18px)", gap: 6 }}>
        {tools.map((tool, index) => (
          <Fragment key={tool.id}>
            {index === 7 && <div style={{ width: 1, height: 24, background: border, margin: "0 3px" }} />}
            <button
              title={tool.label}
              aria-label={tool.label}
              className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-95"
              style={{ color: text, background: active === tool.id ? activeBg : "transparent" }}
              onClick={() => handleToolClick(tool.id)}
              onMouseEnter={e => { if (active !== tool.id) e.currentTarget.style.background = hover; }}
              onMouseLeave={e => { if (active !== tool.id) e.currentTarget.style.background = "transparent"; }}
            >
              {tool.icon}
              {tool.dot && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: "oklch(0.66 0.23 25)" }} />}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}



// ── Canvas Search Bar ───────────────────────────────────────────
function SaveProjectConfirmDialog({ isDark, project, onCancel, onSave }: {
  isDark: boolean;
  project: Project;
  onCancel: () => void;
  onSave: () => void;
}) {
  const bg = isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)";
  const text = isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.58 0.01 270)" : "oklch(0.50 0.012 255)";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.58)", backdropFilter: "blur(8px)", zIndex: 4000 }}
      onMouseDown={onCancel}
    >
      <div
        className="w-[min(420px,calc(100vw-32px))] rounded-[var(--radius-lg-design)] p-6 shadow-2xl"
        style={{ background: bg, border: `1px solid ${border}`, boxShadow: "0 24px 80px oklch(0 0 0 / 0.35)" }}
        onMouseDown={e => e.stopPropagation()}
      >
        <h3 className="type-title-sm text-center" style={{ color: text, fontSize: 18, fontWeight: 650 }}>保存当前项目？</h3>
        <p className="type-body-sm mt-3 text-center leading-6" style={{ color: sub }}>
          跳转到「{project.title}」前，是否先保存当前画布的编辑内容？
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onCancel}
            className="h-9 min-w-[96px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-85"
            style={{ background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)", border: `1px solid ${border}`, color: text }}
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="h-9 min-w-[112px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white", boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.22)" }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}


function CanvasAssistantPanel({ isDark, collapsed, isAuthenticated, onToggleCollapsed, onLoginRequest, referencedAssets, onRemoveReference }: { isDark: boolean; collapsed: boolean; isAuthenticated: boolean; onToggleCollapsed: () => void; onLoginRequest: () => void; referencedAssets: { id: string; title: string; src: string }[]; onRemoveReference: (id: string) => void }) {
  const [inputFocused, setInputFocused] = useState(false);
  const bg = isDark ? "oklch(0.125 0.014 270 / 0.98)" : "oklch(0.995 0.002 80 / 0.98)";
  const border = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.84 0.008 270)" : "oklch(0.18 0.008 270)";
  const sub = isDark ? "oklch(0.56 0.01 270)" : "oklch(0.48 0.012 255)";
  const chipBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)";
  const inputShadow = "0 16px 42px rgba(210,214,224,0.10), 0 0 0 1px rgba(210,214,224,0.10)";
  const panelWidth = "clamp(280px, 32vw, 372px)";
  const collapsedPeekWidth = 112;
  const actionButtons = [
    { label: "新建对话", icon: <PlusSquare size={16} />, onClick: () => toast("已新建对话") },
    { label: "分享对话", icon: <Share2 size={16} />, onClick: () => toast("分享对话", { description: "分享能力准备中" }) },
    { label: collapsed ? "展开对话框" : "收起对话框", icon: <ChevronLeft size={16} style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />, onClick: onToggleCollapsed },
  ];
  const conversationRecords = [
    "选择图片节点后，可在左侧画布直接编辑素材。",
    "右键图片节点可以快速执行编辑素材、复制、粘贴、打组、添加文本备注和删除节点。当前布局已按参考图改为左侧大画布、右侧助手区、底部浮动工具区。",
  ];

  return (
    <aside
      className="absolute inset-y-0 right-0 flex flex-col nodrag nopan transition-transform duration-200 ease-out"
      style={{
        width: panelWidth,
        maxWidth: "calc(100vw - 48px)",
        background: bg,
        borderLeft: collapsed ? "none" : `1px solid ${border}`,
        zIndex: 120,
        backdropFilter: "blur(22px)",
        transform: collapsed ? `translateX(calc(100% - ${collapsedPeekWidth}px))` : "translateX(0)",
        boxShadow: collapsed ? "none" : isDark ? "-12px 0 40px rgba(0,0,0,0.18)" : "-12px 0 36px rgba(30,35,55,0.08)",
      }}
    >
      <div className="h-14 flex items-center justify-end px-4" style={{ gap: 12 }}>
        {(collapsed ? actionButtons.slice(2) : actionButtons).map(item => (
          <button
            key={item.label}
            className="h-8 w-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors hover:opacity-85"
            style={{ background: "transparent", color: sub, border: "none" }}
            title={item.label}
            aria-label={item.label}
            onClick={item.onClick}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {!collapsed && (
        <>
          <div className="flex-1 min-h-0 px-5 py-6 overflow-hidden">
            <p className="type-caption mb-2" style={{ color: sub }}>May 23, 2026</p>
            <div className="flex flex-col gap-4">
              {conversationRecords.map((record, index) => (
                <div key={index} className={index === 0 ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[86%]">
                    <div className="rounded-[var(--radius-lg-design)] p-4" style={{ background: chipBg, border: `1px solid ${border}` }}>
                      <p className="type-caption leading-6" style={{ color: text }}>{record}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2" style={{ justifyContent: index === 0 ? "flex-end" : "flex-start" }}>
                      <button className="h-7 w-7 flex items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-75" style={{ color: sub, background: "transparent" }} title="刷新" aria-label="刷新" onClick={() => toast("已刷新该条对话")}>
                        <Repeat2 size={13} />
                      </button>
                      <button className="h-7 w-7 flex items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-75" style={{ color: sub, background: "transparent" }} title="复制" aria-label="复制" onClick={() => { navigator.clipboard?.writeText(record); toast("已复制对话内容"); }}>
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 p-4 mt-auto">
            <div
              className="rounded-[var(--radius-xl-design)] px-3 py-3 transition-shadow duration-200"
              style={{
                background: chipBg,
                border: `1px solid ${border}`,
                boxShadow: inputFocused ? inputShadow : "none",
              }}
            >
              {/* 引用标签 — 在输入框内部顶部，最多显示两行，超出折叠为数字徽章 */}
              {referencedAssets.length > 0 && (() => {
                // 每行最多放 2 个标签（约 140px 宽），两行最多 4 个
                const MAX_VISIBLE = 4;
                const visible = referencedAssets.slice(0, MAX_VISIBLE);
                const overflow = referencedAssets.length - MAX_VISIBLE;
                const tagBg = isDark ? "oklch(0.58 0.20 290 / 0.18)" : "oklch(0.58 0.18 290 / 0.10)";
                const tagBorder = isDark ? "oklch(0.72 0.18 290 / 0.35)" : "oklch(0.52 0.18 290 / 0.30)";
                const tagText = isDark ? "oklch(0.82 0.012 270)" : "oklch(0.28 0.012 270)";
                return (
                  <div className="flex flex-wrap gap-1.5 mb-2" style={{ maxHeight: 58, overflow: "hidden" }}>
                    {visible.map((ref, idx) => {
                      const isLast = idx === MAX_VISIBLE - 1 && overflow > 0;
                      return (
                        <div
                          key={ref.id}
                          className="flex items-center gap-1 rounded-[var(--radius-md-design)] px-1.5 py-0.5"
                          style={{ background: tagBg, border: `1px solid ${tagBorder}`, maxWidth: 130, flexShrink: 0 }}
                        >
                          <img src={ref.src} alt={ref.title} style={{ width: 16, height: 16, borderRadius: 2, objectFit: "cover", flexShrink: 0 }} />
                          <span className="type-caption truncate" style={{ color: tagText, maxWidth: isLast ? 40 : 72, fontSize: 11 }}>
                            {isLast ? "..." : ref.title}
                          </span>
                          {isLast ? (
                            // 蓝色圆环数字徽章
                            <span
                              className="flex items-center justify-center rounded-full flex-shrink-0"
                              style={{
                                width: 18, height: 18,
                                background: "oklch(0.52 0.22 260)",
                                color: "white",
                                fontSize: 10,
                                fontWeight: 700,
                                lineHeight: 1,
                                border: "2px solid oklch(0.72 0.18 260 / 0.6)",
                              }}
                              title={`还有 ${overflow + 1} 个引用`}
                            >
                              {overflow + 1}
                            </span>
                          ) : (
                            <button
                              onClick={() => onRemoveReference(ref.id)}
                              className="flex items-center justify-center flex-shrink-0 rounded-full transition-opacity hover:opacity-70"
                              style={{ color: isDark ? "oklch(0.62 0.008 270)" : "oklch(0.50 0.008 270)", background: "transparent", border: "none", padding: 0, lineHeight: 1 }}
                              title="移除引用"
                              aria-label="移除引用"
                            >
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <textarea
                placeholder={referencedAssets.length > 0 ? `基于 ${referencedAssets.length} 个引用素材，描述你的创作意图...` : (isAuthenticated ? "输入对当前画布的想法..." : "登录后可输入提示词")}
                rows={2}
                disabled={!isAuthenticated}
                className="w-full bg-transparent outline-none resize-none type-caption leading-6 disabled:cursor-not-allowed"
                style={{ color: isAuthenticated ? text : sub, opacity: isAuthenticated ? 1 : 0.58 }}
                onFocus={() => { if (!isAuthenticated) { onLoginRequest(); return; } setInputFocused(true); }}
                onBlur={() => setInputFocused(false)}
              />
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2" style={{ color: sub }}>
                  <Plus size={14} />
                  <LayoutGrid size={14} />
                  <span className="type-caption">Agent</span>
                </div>
                <button disabled={!isAuthenticated} className="w-8 h-8 rounded-[var(--radius-pill)] flex items-center justify-center disabled:cursor-not-allowed" style={{ background: isAuthenticated ? "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" : (isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"), color: isAuthenticated ? "white" : sub, opacity: isAuthenticated ? 1 : 0.65 }} onClick={() => { if (!isAuthenticated) onLoginRequest(); }}>
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function CanvasSearchBar({ isDark, currentProjectId, onProjectRequest, onAssetAdd }: {
  isDark: boolean;
  currentProjectId: string;
  onProjectRequest: (project: Project) => void;
  onAssetAdd: (asset: GeneratedAsset) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && e.target instanceof globalThis.Node && !ref.current.contains(e.target)) setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const projectResults = PROJECTS.filter(project => {
    if (project.id === currentProjectId && !normalized) return true;
    const haystack = `${project.title} ${project.subtitle || ""}`.toLowerCase();
    return normalized ? haystack.includes(normalized) : true;
  }).slice(0, 4);
  const assetResults = GENERATED_ASSETS.filter(asset => {
    const haystack = `${asset.title} ${asset.type} ${(asset.tags || []).join(" ")}`.toLowerCase();
    return normalized ? haystack.includes(normalized) : true;
  }).slice(0, 4);

  const bg = isDark ? "rgba(22,22,30,0.80)" : "rgba(255,255,255,0.82)";
  const panelBg = isDark ? "oklch(0.15 0.018 270 / 0.98)" : "oklch(0.995 0.002 80 / 0.98)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.52 0.01 270)" : "oklch(0.50 0.012 255)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";

  // Always expanded — no collapse
  return (
    <div ref={ref} className="absolute nodrag nopan" style={{ top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1400, width: 320 }}>
      <div
        className="flex items-center gap-2 px-3 rounded-[var(--radius-lg-design)] shadow-lg overflow-hidden"
        style={{ height: 38, background: bg, border: `1px solid ${open ? "oklch(0.62 0.22 290 / 0.55)" : border}`, backdropFilter: "blur(14px)", transition: "border-color 0.18s ease" }}
        onMouseDown={e => e.stopPropagation()}
        onClick={() => setOpen(true)}
      >
        <Search size={14} style={{ color: open ? "oklch(0.72 0.18 290)" : sub, flexShrink: 0, transition: "color 0.15s" }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="搜索项目或素材..."
          className="flex-1 bg-transparent outline-none type-caption"
          style={{ color: text }}
        />
        {query && (
          <button
            onClick={e => { e.stopPropagation(); setQuery(""); setOpen(false); }}
            className="flex items-center justify-center w-4 h-4 rounded-full transition-opacity hover:opacity-70"
            style={{ color: sub, flexShrink: 0 }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {open && (
        <div
          className="mt-2 rounded-[var(--radius-lg-design)] overflow-hidden shadow-2xl"
          style={{ background: panelBg, border: `1px solid ${border}`, backdropFilter: "blur(20px)", maxHeight: 460 }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-2" style={{ borderBottom: `1px solid ${divider}` }}>
            <span className="type-caption uppercase" style={{ color: sub }}>项目</span>
          </div>
          {projectResults.length ? projectResults.map(project => (
            <button
              key={project.id}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left type-caption transition-colors"
              style={{ color: text }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              onClick={() => { onProjectRequest(project); setOpen(false); }}
            >
              <LayoutGrid size={13} style={{ color: "oklch(0.62 0.18 290)", flexShrink: 0 }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{project.title}</span>
                <span className="block truncate" style={{ color: sub, fontSize: 11 }}>{project.subtitle || project.updatedAt}</span>
              </span>
              <ArrowRight size={13} style={{ color: sub, flexShrink: 0 }} />
            </button>
          )) : (
            <div className="px-3 py-3 type-caption" style={{ color: sub }}>未找到匹配项目</div>
          )}

          <div className="px-3 py-2" style={{ borderTop: `1px solid ${divider}`, borderBottom: `1px solid ${divider}` }}>
            <span className="type-caption uppercase" style={{ color: sub }}>素材</span>
          </div>
          {assetResults.length ? assetResults.map(asset => (
            <div key={asset.id} className="flex items-center gap-2.5 px-3 py-2.5 transition-colors" onMouseEnter={e => (e.currentTarget.style.background = hoverBg)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div className="w-9 h-9 rounded-[var(--radius-md-design)] overflow-hidden flex items-center justify-center" style={{ background: isDark ? "oklch(0.20 0.004 270)" : "oklch(0.88 0.004 270)", border: `1px solid ${divider}`, flexShrink: 0 }}>
                <img src={asset.src} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="type-caption truncate" style={{ color: text }}>{asset.title}</p>
                <p className="type-caption truncate" style={{ color: sub, fontSize: 11 }}>{asset.tags?.join(" · ") || asset.type}</p>
              </div>
              <button
                onClick={() => { onAssetAdd(asset); setOpen(false); }}
                className="px-2 py-1 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-85"
                style={{ background: "oklch(0.58 0.22 290 / 0.18)", border: "1px solid oklch(0.62 0.22 290 / 0.35)", color: isDark ? "oklch(0.82 0.18 290)" : "oklch(0.42 0.18 290)", flexShrink: 0 }}
              >
                加入画布
              </button>
            </div>
          )) : (
            <div className="px-3 py-3 type-caption" style={{ color: sub }}>未找到匹配素材</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inner Canvas ───────────────────────────────────────────────
function InnerCanvas({ projectId = "p1" }: { projectId?: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [, navigate] = useLocation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { screenToFlowPosition, getEdges, getNodes, fitView, getViewport, setViewport } = useReactFlow();
  const viewport = useViewport();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeCtxMenu, setNodeCtxMenu] = useState<NodeCtxState | null>(null);
  const [clipboard, setClipboard] = useState<Node[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  // ── Edit-asset state: zoom in on canvas then show editing prompt bar ──
  const [editAsset, setEditAsset] = useState<{ id: string; title: string; src: string; nodeId: string } | null>(null);
  const [isZoomingToEdit, setIsZoomingToEdit] = useState(false);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  // ── Referenced assets: auto-populated from selected image nodes ──
  const [referencedAssets, setReferencedAssets] = useState<{ id: string; title: string; src: string }[]>([]);
  // ── Group system state ──
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [groupCounter, setGroupCounter] = useState(1);
  const [enteringGroupId, setEnteringGroupId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ clientX: number; clientY: number; viewport: { x: number; y: number; zoom: number } } | null>(null);
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const MAX_HISTORY_STEPS = 20;
  // ── Local file drag-drop state ──
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragCounterRef = useRef(0);

  const cloneNodesForHistory = useCallback((items: Node[]) => items.map(node => ({
    ...node,
    position: { ...node.position },
    data: { ...(node.data as Record<string, unknown>) },
  })), []);

  const cloneEdgesForHistory = useCallback((items: Edge[]) => items.map(edge => ({
    ...edge,
    data: edge.data ? { ...(edge.data as Record<string, unknown>) } : edge.data,
  })), []);

  const pushHistory = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY_STEPS - 1)),
      { nodes: cloneNodesForHistory(nodes), edges: cloneEdgesForHistory(edges) },
    ];
  }, [cloneEdgesForHistory, cloneNodesForHistory, edges, nodes]);

  const undoCanvas = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) {
      toast("暂无可回退的画布操作");
      return;
    }
    setNodes(cloneNodesForHistory(previous.nodes));
    setEdges(cloneEdgesForHistory(previous.edges));
    setSelectedNodeIds(previous.nodes.filter(n => n.selected).map(n => n.id));
    setNodeCtxMenu(null);
    toast("已回退一步", { description: `还可回退 ${historyRef.current.length} 步` });
  }, [cloneEdgesForHistory, cloneNodesForHistory, setEdges, setNodes]);

  const handleNodesChangeWithHistory = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    if (changes.some(change => change.type !== "select")) pushHistory();
    onNodesChange(changes);
  }, [onNodesChange, pushHistory]);

  const handleEdgesChangeWithHistory = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    if (changes.some(change => change.type !== "select")) pushHistory();
    onEdgesChange(changes);
  }, [onEdgesChange, pushHistory]);

  const onConnect = useCallback((params: Connection) => {
    pushHistory();
    setEdges(eds => addEdge({ ...params, type: "tapnow" }, eds));
  }, [pushHistory, setEdges]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const stopMiddleAuxClick = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };

    const handleMiddleMouseDown = (event: MouseEvent) => {
      if (event.button !== 1 || isCanvasLocked) return;
      if (!(event.target instanceof Element) || !root.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      middlePanRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: getViewport(),
      };
      document.body.style.cursor = "grabbing";

      const handleMiddleMouseMove = (moveEvent: MouseEvent) => {
        const pan = middlePanRef.current;
        if (!pan) return;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        setViewport({
          x: pan.viewport.x + (moveEvent.clientX - pan.clientX),
          y: pan.viewport.y + (moveEvent.clientY - pan.clientY),
          zoom: pan.viewport.zoom,
        });
      };

      const handleMiddleMouseUp = (upEvent: MouseEvent) => {
        if (upEvent.button !== 1) return;
        upEvent.preventDefault();
        upEvent.stopPropagation();
        middlePanRef.current = null;
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", handleMiddleMouseMove, true);
        window.removeEventListener("mouseup", handleMiddleMouseUp, true);
      };

      window.addEventListener("mousemove", handleMiddleMouseMove, true);
      window.addEventListener("mouseup", handleMiddleMouseUp, true);
    };

    root.addEventListener("mousedown", handleMiddleMouseDown, true);
    root.addEventListener("auxclick", stopMiddleAuxClick, true);
    return () => {
      root.removeEventListener("mousedown", handleMiddleMouseDown, true);
      root.removeEventListener("auxclick", stopMiddleAuxClick, true);
      document.body.style.cursor = "";
      middlePanRef.current = null;
    };
  }, [getViewport, isCanvasLocked, setViewport]);

  const getActionNodeIds = useCallback((nodeId: string) => {
    if (nodeId === "__selection__") return selectedNodeIds;
    return selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
  }, [selectedNodeIds]);

  const areNodesGrouped = useCallback((ids: string[]) => {
    if (ids.length === 0) return false;
    const selected = nodes.filter(n => ids.includes(n.id));
    return selected.length > 0 && selected.every(n => Boolean((n.data as Record<string, unknown>).groupId));
  }, [nodes]);

  // ── Right-click: blank canvas shows batch menu only when nodes are selected ──
  const handlePaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    if (selectedNodeIds.length === 0) {
      setNodeCtxMenu(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    setNodeCtxMenu({
      x: e.clientX - (rect?.left || 0),
      y: e.clientY - (rect?.top || 0),
      nodeId: "__selection__",
      nodeType: "selection",
      selectedIds: selectedNodeIds,
      grouped: areNodesGrouped(selectedNodeIds),
    });
  }, [areNodesGrouped, selectedNodeIds]);

  // ── Node right-click via custom event ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number; nodeId: string; nodeType: string };
      const actionIds = selectedNodeIds.includes(detail.nodeId) ? selectedNodeIds : [detail.nodeId];
      setSelectedNodeIds(actionIds);
      setNodes(nds => nds.map(n => ({ ...n, selected: actionIds.includes(n.id) })));
      setNodeCtxMenu({
        x: detail.x,
        y: detail.y,
        nodeId: detail.nodeId,
        nodeType: detail.nodeType,
        selectedIds: actionIds,
        grouped: areNodesGrouped(actionIds),
      });
    };
    window.addEventListener("node-contextmenu", handler);
    return () => window.removeEventListener("node-contextmenu", handler);
  }, [areNodesGrouped, selectedNodeIds, setNodes]);

  // ── Node context menu actions ──
  const handleNodeAction = useCallback((action: string, nodeId: string) => {
    const actionIds = getActionNodeIds(nodeId);
    if (action === "delete") {
      pushHistory();
      setNodes(nds => nds.filter(n => !actionIds.includes(n.id)));
      setEdges(eds => eds.filter(e => !actionIds.includes(e.source) && !actionIds.includes(e.target)));
      setSelectedNodeIds([]);
    } else if (action === "copy") {
      const copied = nodes.filter(n => actionIds.includes(n.id));
      if (copied.length > 0) { setClipboard(copied); toast(`已复制 ${copied.length} 个画布`); }
    } else if (action === "paste") {
      if (clipboard.length > 0) {
        pushHistory();
        const now = Date.now();
        const idMap = new Map(clipboard.map((node, index) => [node.id, `${node.type}-${now}-${index}`]));
        const pasted = clipboard.map((node, index) => {
          const id = idMap.get(node.id) || `${node.type}-${now}-${index}`;
          return {
            ...node,
            id,
            selected: true,
            position: { x: node.position.x + 48, y: node.position.y + 48 },
            data: { ...(node.data as Record<string, unknown>), id, groupId: (node.data as Record<string, unknown>).groupId ? `group-${now}` : undefined },
          };
        });
        setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(pasted));
        setSelectedNodeIds(pasted.map(n => n.id));
        toast(`已粘贴 ${pasted.length} 个画布`);
      } else { toast("剪贴板为空"); }
    } else if (action === "group") {
      if (actionIds.length < 2) { toast("请至少选择 2 个画布再打组"); return; }
      pushHistory();
      const groupId = `group-${Date.now()}`;
      // Auto-name: 打组01, 打组02, ...
      const paddedNum = String(groupCounter).padStart(2, "0");
      const autoName = `打组${paddedNum}`;
      setGroupNames(prev => ({ ...prev, [groupId]: autoName }));
      setGroupCounter(c => c + 1);
      setNodes(nds => nds.map(n => actionIds.includes(n.id) ? { ...n, data: { ...(n.data as Record<string, unknown>), groupId } } : n));
      toast(`已创建「${autoName}」`, { description: `${actionIds.length} 个图片节点已打组，右键容器可管理` });
    } else if (action === "ungroup") {
      pushHistory();
      // Find groupId from the action nodes
      const ungroupIds = actionIds.length > 0 ? actionIds : (nodeCtxMenu?.selectedIds || []);
      const targetNode = nodes.find(n => ungroupIds.includes(n.id));
      const gid = targetNode ? (targetNode.data as Record<string, unknown>).groupId as string | undefined : undefined;
      setNodes(nds => nds.map(n => {
        const nGroupId = (n.data as Record<string, unknown>).groupId as string | undefined;
        if (gid ? nGroupId === gid : ungroupIds.includes(n.id)) {
          return { ...n, data: { ...(n.data as Record<string, unknown>), groupId: undefined } };
        }
        return n;
      }));
      if (gid) setGroupNames(prev => { const next = { ...prev }; delete next[gid]; return next; });
      setEnteringGroupId(null);
      toast("已解散打组");
    } else if (action === "auto-layout") {
      const selectedAssetIds = actionIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
      if (selectedAssetIds.length < 2) { toast("请至少选择 2 个图片节点再自动布局"); return; }
      pushHistory();
      const selected = selectedAssetIds.map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node[];
      const selectedBounds = getCanvasNodesBounds(selected, selectedAssetIds);
      if (!selectedBounds) return;

      const gap = 40;
      const columns = Math.ceil(Math.sqrt(selected.length));
      const totalRows = Math.ceil(selected.length / columns);
      const sizes = selected.map(getCanvasNodeSize);
      const cellWidth = Math.max(...sizes.map(size => size.width)) + gap;
      const cellHeight = Math.max(...sizes.map(size => size.height)) + gap;
      const gridWidth = columns * cellWidth - gap;
      const gridHeight = totalRows * cellHeight - gap;
      const startX = selectedBounds.centerX - gridWidth / 2;
      let startY = selectedBounds.centerY - gridHeight / 2;
      const unselectedBounds = nodes.filter(n => !selectedAssetIds.includes(n.id)).map(getCanvasNodeBounds);

      const buildLayout = (top: number) => selected.map((node, index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;
        const size = sizes[index];
        const x = startX + col * cellWidth + (cellWidth - gap - size.width) / 2;
        const y = top + row * cellHeight + (cellHeight - gap - size.height) / 2;
        return { id: node.id, position: { x, y }, bounds: { x, y, width: size.width, height: size.height, right: x + size.width, bottom: y + size.height, centerX: x + size.width / 2, centerY: y + size.height / 2 } };
      });

      let layout = buildLayout(startY);
      let attempts = 0;
      while (attempts < 80 && layout.some(item => unselectedBounds.some(bounds => canvasRectsOverlap(item.bounds, bounds, 12)))) {
        startY += cellHeight;
        layout = buildLayout(startY);
        attempts += 1;
      }
      const positionById = new Map(layout.map(item => [item.id, item.position]));
      setNodes(nds => nds.map(n => selectedAssetIds.includes(n.id) ? { ...n, position: positionById.get(n.id) || n.position, selected: true } : n));
      setSelectedNodeIds(selectedAssetIds);
      toast("已完成自动布局", { description: `${selectedAssetIds.length} 个图片节点已重新排列，节点之间不重叠` });
    } else if (action === "download") {
      const selectedAssets = nodes
        .filter(n => actionIds.includes(n.id) && n.type === "asset")
        .map(n => {
          const assetId = (n.data as Record<string, unknown>).assetId as string;
          const title = ((n.data as Record<string, unknown>).title as string) || n.id;
          const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
          return { title, src: asset.src };
        });
      selectedAssets.forEach((asset, index) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = asset.src;
          link.download = `${asset.title || "artx-image"}.png`;
          link.target = "_blank";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 120);
      });
      toast("正在下载图片", { description: `${selectedAssets.length} 个图片素材已加入下载队列` });
    } else if (action === "add-asset") {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        pushHistory();
        const id = `asset-${Date.now()}`;
        setNodes(nds => [...nds, { id, type: "asset", position: { x: node.position.x + 300, y: node.position.y }, data: createDefaultAssetData(id, "新图片节点") }]);
      }
    } else if (action === "add-note") {
      pushHistory();
      setNodes(nds => nds.map(n => actionIds.includes(n.id) ? {
        ...n,
        data: { ...(n.data as Record<string, unknown>), note: "双击图片或使用编辑素材继续描述备注" }
      } : n));
      toast("已添加文本备注", { description: "备注已附加到当前图片素材" });
    } else if (action === "edit-asset") {
      const node = nodes.find(n => n.id === nodeId);
      if (node && node.type === "asset") {
        const assetId = (node.data as Record<string, unknown>).assetId as string;
        const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
        setIsZoomingToEdit(true);
        // Smooth zoom-in push animation on the canvas itself
        fitView({ nodes: [{ id: nodeId }], duration: 900, padding: 0.08 });
        // After animation completes, reveal the editing prompt bar
        setTimeout(() => {
          setEditAsset({ id: asset.id, title: asset.title, src: asset.src, nodeId });
          setIsZoomingToEdit(false);
        }, 950);
      }
    }
  }, [nodes, clipboard, getActionNodeIds, pushHistory, setNodes, setEdges]);

  // ── Add node from position ──
  const addNode = useCallback((_type: string, x: number, y: number) => {
    pushHistory();
    const id = `asset-${Date.now()}`;
    setNodes(nds => [...nds, {
      id,
      type: "asset",
      position: { x, y },
      data: createDefaultAssetData(id, "新图片节点"),
    }]);
  }, [pushHistory, setNodes]);


  const handleAssetAddFromSearch = useCallback((asset: GeneratedAsset) => {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const position = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 120 + Math.random() * 160, y: 80 + Math.random() * 120 };
    const id = `asset-${asset.id}-${Date.now()}`;
    pushHistory();
    setNodes(nds => [...nds, {
      id,
      type: "asset",
      position: { x: position.x - 120, y: position.y - 80 },
      data: {
        id,
        assetId: asset.id,
        title: asset.title,
        assetType: asset.type,
        tags: asset.tags || DEFAULT_ASSET_TAGS,
      },
    }]);
    toast("已加入当前画布", { description: asset.title });
  }, [pushHistory, screenToFlowPosition, setNodes]);

  const handleProjectSaveAndNavigate = useCallback(() => {
    if (!pendingProject) return;
    toast("当前项目已保存", { description: "正在跳转到目标项目" });
    navigate(`/project/${pendingProject.id}`);
    setPendingProject(null);
  }, [navigate, pendingProject]);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    setSelectedNodeIds(selectedNodes.map(n => n.id));
  }, []);

  // ── Handle group container right-click ──
  const handleGroupContainerContextMenu = useCallback((e: React.MouseEvent, groupId: string) => {
    const rect = containerRef.current?.getBoundingClientRect();
    // If currently inside this group, show "exit-group" instead of "enter-group"
    setNodeCtxMenu({
      x: e.clientX - (rect?.left || 0),
      y: e.clientY - (rect?.top || 0),
      nodeId: "__group__",
      nodeType: enteringGroupId === groupId ? "group-container-inside" : "group-container",
      selectedIds: nodes.filter(n => (n.data as Record<string, unknown>).groupId === groupId).map(n => n.id),
      grouped: true,
    });
    // Store groupId for ungroup/enter/rename actions
    (window as unknown as Record<string, unknown>).__artx_ctx_group_id__ = groupId;
  }, [nodes, enteringGroupId]);

  // ── Double-click group container → enter group ──
  const handleGroupContainerDoubleClick = useCallback((groupId: string) => {
    setEnteringGroupId(groupId);
    toast(`已进入「${groupNames[groupId] || groupId}」`, {
      description: "现在可单独选中并编辑组内图片，单击空白处或右键可退出",
    });
  }, [groupNames]);

  // ── Drag group container → move all nodes in group ──
  const handleGroupContainerDragEnd = useCallback((groupId: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    pushHistory();
    setNodes(nds => nds.map(n => {
      const gid = (n.data as Record<string, unknown>).groupId as string | undefined;
      if (gid !== groupId) return n;
      return { ...n, position: { x: n.position.x + dx / viewport.zoom, y: n.position.y + dy / viewport.zoom } };
    }));
  }, [pushHistory, setNodes, viewport.zoom]);

  // ── Click blank canvas → exit group if inside one ──
  const handlePaneClick = useCallback(() => {
    setNodeCtxMenu(null);
    if (enteringGroupId) {
      setEnteringGroupId(null);
      setSelectedNodeIds([]);
      toast("已退出打组");
    }
  }, [enteringGroupId]);

  // ── Double-click group label → rename ──
  const handleGroupLabelDoubleClick = useCallback((groupId: string) => {
    setRenamingGroupId(groupId);
    setRenameValue(groupNames[groupId] || "");
  }, [groupNames]);

  // ── Local file drag-drop handlers ──
  const handleCanvasDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only handle file drags from OS (not internal ReactFlow node drags)
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes("Files")) return;
    e.dataTransfer.dropEffect = "copy";
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
      setDragPos(null);
    }
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setDragPos(null);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) { toast("请拖入图片文件（JPG / PNG / GIF / WebP）"); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    const baseX = e.clientX - (rect?.left || 0);
    const baseY = e.clientY - (rect?.top || 0);
    pushHistory();
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        const img = new window.Image();
        img.onload = () => {
          const dropPos = screenToFlowPosition({ x: (rect?.left || 0) + baseX + index * 32, y: (rect?.top || 0) + baseY + index * 32 });
          const id = `local-${Date.now()}-${index}`;
          const maxSide = 360;
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 360, img.naturalHeight || 360));
          const nodeWidth = Math.max(180, Math.round((img.naturalWidth || 360) * scale));
          setNodes(nds => [...nds, {
            id,
            type: "asset",
            position: { x: dropPos.x - nodeWidth / 2, y: dropPos.y - 100 },
            data: {
              id,
              assetId: "default",
              localSrc: dataUrl,
              title: file.name.replace(/\.[^.]+$/, ""),
              assetType: "图片",
              tags: DEFAULT_ASSET_TAGS,
            },
          }]);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    toast(`已导入 ${files.length} 张图片`, { description: "本地图片已成功添加到画布" });
  }, [pushHistory, screenToFlowPosition, setNodes]);

  // ── Handle group actions from context menu ──
  const handleGroupAction = useCallback((action: string) => {
    const groupId = (window as unknown as Record<string, unknown>).__artx_ctx_group_id__ as string | undefined;
    if (!groupId) return;
    if (action === "batch-download") {
      // 收集打组内所有图片节点
      const groupNodes = nodes.filter(n => {
        const nGroupId = (n.data as Record<string, unknown>).groupId as string | undefined;
        return nGroupId === groupId && n.type === "asset";
      });
      if (groupNodes.length === 0) {
        toast("该打组内没有图片节点");
        return;
      }
      const folderName = groupNames[groupId] || groupId;
      toast(`开始下载「${folderName}」中的 ${groupNodes.length} 张图片`, {
        description: "文件将依次下载到本地",
      });
      // 逐一下载组内所有图片，每张间隔 120ms 避免浏览器拦截
      groupNodes.forEach((node, index) => {
        setTimeout(() => {
          const nodeData = node.data as Record<string, unknown>;
          const localSrc = nodeData.localSrc as string | undefined;
          const assetId = nodeData.assetId as string;
          const title = (nodeData.title as string) || `图片_${index + 1}`;
          const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
          const src = localSrc || asset?.src || "";
          if (!src) return;
          const a = document.createElement("a");
          a.href = src;
          // 使用「打组名/图片名.ext」的路径形式，浏览器会将文件保存到同名文件夹
          const ext = src.startsWith("data:image/png") ? "png"
            : src.startsWith("data:image/gif") ? "gif"
            : src.startsWith("data:image/webp") ? "webp"
            : "jpg";
          a.download = `${folderName}/${title}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, index * 120);
      });
    } else if (action === "exit-group") {
      setEnteringGroupId(null);
      setSelectedNodeIds([]);
      toast("已退出打组");
    } else if (action === "rename-group") {
      setRenamingGroupId(groupId);
      setRenameValue(groupNames[groupId] || "");
    } else if (action === "ungroup") {
      pushHistory();
      setNodes(nds => nds.map(n => {
        const nGroupId = (n.data as Record<string, unknown>).groupId as string | undefined;
        if (nGroupId === groupId) return { ...n, data: { ...(n.data as Record<string, unknown>), groupId: undefined } };
        return n;
      }));
      setGroupNames(prev => { const next = { ...prev }; delete next[groupId]; return next; });
      setEnteringGroupId(null);
      toast("已解散打组");
    }
  }, [groupNames, pushHistory, setNodes]);

  // ── Sync selected image nodes → referencedAssets chips in BottomPromptBar ──
  useEffect(() => {
    const imageNodeIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
    if (imageNodeIds.length === 0) {
      setReferencedAssets([]);
      return;
    }
    const refs = imageNodeIds.map(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return null;
      const assetId = (node.data as Record<string, unknown>).assetId as string;
      const title = ((node.data as Record<string, unknown>).title as string) || nodeId;
      const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
      return { id: nodeId, title, src: asset?.src || "" };
    }).filter(Boolean) as { id: string; title: string; src: string }[];
    setReferencedAssets(refs);
  }, [selectedNodeIds, nodes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { selectedIds?: string[] };
      if (Array.isArray(detail.selectedIds)) setSelectedNodeIds(detail.selectedIds);
    };
    window.addEventListener("asset-click-selection", handler);
    return () => window.removeEventListener("asset-click-selection", handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping) return;
      const selectedAssetIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAssetIds.length > 0) {
        e.preventDefault();
        pushHistory();
        setNodes(nds => nds.filter(n => !selectedAssetIds.includes(n.id)));
        setEdges(eds => eds.filter(e => !selectedAssetIds.includes(e.source) && !selectedAssetIds.includes(e.target)));
        toast("已删除图片", { description: selectedAssetIds.length === 1 ? "已删除选中的图片节点" : `已删除 ${selectedAssetIds.length} 个图片节点` });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoCanvas();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (selectedNodeIds.length < 2) {
          toast("请先框选至少 2 个画布");
          return;
        }
        pushHistory();
        const groupId = `group-${Date.now()}`;
        setNodes(nds => nds.map(n => selectedNodeIds.includes(n.id) ? { ...n, data: { ...(n.data as Record<string, unknown>), groupId } } : n));
        toast(`已打组 ${selectedNodeIds.length} 个画布`, { description: "Windows 使用 Ctrl+G，Mac 使用 Command+G" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, pushHistory, selectedNodeIds, setEdges, setNodes, undoCanvas]);

  // ── C-key lasso: cut edges intersecting the lasso rect ──
  const handleLassoCut = useCallback((lassoRect: LassoRect) => {
    // lassoRect is in screen-space relative to container
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    // Convert lasso corners to flow coordinates
    const toFlow = (sx: number, sy: number) =>
      screenToFlowPosition({ x: sx + containerRect.left, y: sy + containerRect.top });

    const tl = toFlow(lassoRect.x, lassoRect.y);
    const br = toFlow(lassoRect.x + lassoRect.w, lassoRect.y + lassoRect.h);
    const minX = Math.min(tl.x, br.x), maxX = Math.max(tl.x, br.x);
    const minY = Math.min(tl.y, br.y), maxY = Math.max(tl.y, br.y);

    // Get node positions to find edge endpoints
    const currentNodes = getNodes();
    const nodeMap = new Map(currentNodes.map(n => [n.id, n]));

    const cutIds: string[] = [];
    getEdges().forEach(edge => {
      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (!srcNode || !tgtNode) return;

      // Approximate edge midpoint (center between source right and target left)
      const srcW = 240; const srcH = 200;
      const tgtW = 240;
      const sx = srcNode.position.x + srcW;
      const sy = srcNode.position.y + srcH / 2;
      const tx = tgtNode.position.x;
      const ty = tgtNode.position.y + srcH / 2;

      // Check if the bezier curve passes through the lasso rect
      // Sample 20 points along the bezier
      for (let t = 0; t <= 1; t += 0.05) {
        const cx1 = sx + (tx - sx) * 0.5;
        const cy1 = sy;
        const cx2 = tx - (tx - sx) * 0.5;
        const cy2 = ty;
        const bx = Math.pow(1-t,3)*sx + 3*Math.pow(1-t,2)*t*cx1 + 3*(1-t)*t*t*cx2 + t*t*t*tx;
        const by = Math.pow(1-t,3)*sy + 3*Math.pow(1-t,2)*t*cy1 + 3*(1-t)*t*t*cy2 + t*t*t*ty;
        if (bx >= minX && bx <= maxX && by >= minY && by <= maxY) {
          cutIds.push(edge.id);
          break;
        }
      }
    });

    if (cutIds.length > 0) {
      pushHistory();
      setEdges(eds => eds.filter(e => !cutIds.includes(e.id)));
      toast(`已切断 ${cutIds.length} 条连线`, { description: "松开 C 键退出切割模式" });
    } else {
      toast("未选中任何连线", { description: "请框选连线经过的区域" });
    }
  }, [screenToFlowPosition, getNodes, getEdges, pushHistory, setEdges]);

  const canvasBg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const dotColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.32)";

  // ── Compute group containers for overlay rendering ──
  const groupOverlayData: GroupInfo[] = useMemo(() => {
    const groupMap = new Map<string, Node[]>();
    nodes.forEach(n => {
      const gid = (n.data as Record<string, unknown>).groupId as string | undefined;
      if (gid) {
        if (!groupMap.has(gid)) groupMap.set(gid, []);
        groupMap.get(gid)!.push(n);
      }
    });
    const result: GroupInfo[] = [];
    groupMap.forEach((groupNodes, groupId) => {
      const bounds = getCanvasNodesBounds(groupNodes, groupNodes.map(n => n.id));
      if (!bounds) return;
      result.push({ groupId, name: groupNames[groupId] || groupId, bounds });
    });
    return result;
  }, [nodes, groupNames]);

  // Inject isEditing flag into the target node's data so AssetNodeComponent can show the mask
  const selectedImageNodeIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
  const multiImageSelectionActive = selectedImageNodeIds.length > 1;
  const handleSingleImageToolbarAction = useCallback((action: string) => {
    const nodeId = selectedImageNodeIds[0];
    if (!nodeId) return;
    if (action === "download") {
      handleNodeAction("download", nodeId);
      return;
    }
    if (action === "fullscreen") {
      window.dispatchEvent(new CustomEvent("asset-preview-request", { detail: { nodeId } }));
      return;
    }
    toast("功能即将上线", { description: action });
  }, [handleNodeAction, selectedImageNodeIds]);
  const selectedImageBounds = getCanvasNodesBounds(nodes, selectedImageNodeIds);
  const attachedImageToolbarPosition = selectedImageBounds
    ? {
        left: selectedImageBounds.x * viewport.zoom + viewport.x - 8,
        top: selectedImageBounds.centerY * viewport.zoom + viewport.y,
      }
    : { left: 31, top: 0 };
  const displayNodes = nodes.map(n => {
    const data = {
      ...n.data,
      multiSelectionActive: n.type === "asset" && multiImageSelectionActive && selectedImageNodeIds.includes(n.id),
    };
    return n.type === "asset" && editAsset && n.id === editAsset.nodeId
      ? { ...n, data: { ...data, isEditing: true } }
      : { ...n, data };
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{ height: "100%" }}
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
    >
      {/* 本地拖拽导入覆盖层 */}
      {isDragOver && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 9000 }}
        >
          {/* 半透明覆盖背景 */}
          <div
            className="absolute inset-0"
            style={{
              background: isDark
                ? "oklch(0.12 0.015 270 / 0.72)"
                : "oklch(0.96 0.008 270 / 0.80)",
              backdropFilter: "blur(2px)",
            }}
          />
          {/* 虯线矩形指引区域 */}
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(480px, 60vw)",
              height: "min(320px, 40vh)",
              border: `2.5px dashed ${isDark ? "oklch(0.72 0.18 290 / 0.80)" : "oklch(0.52 0.18 290 / 0.75)"}`,
              borderRadius: "var(--radius-lg-design, 12px)",
              background: isDark
                ? "oklch(0.58 0.18 290 / 0.08)"
                : "oklch(0.58 0.18 290 / 0.06)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div style={{
              width: 52, height: 52,
              borderRadius: "50%",
              background: isDark ? "oklch(0.58 0.20 290 / 0.25)" : "oklch(0.58 0.20 290 / 0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ImagePlus size={26} style={{ color: isDark ? "oklch(0.80 0.18 290)" : "oklch(0.48 0.18 290)" }} />
            </div>
            <div style={{
              textAlign: "center",
              color: isDark ? "oklch(0.88 0.012 270)" : "oklch(0.28 0.012 270)",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}>
              将图片拖入该区域
            </div>
            <div style={{
              textAlign: "center",
              color: isDark ? "oklch(0.62 0.008 270)" : "oklch(0.52 0.008 270)",
              fontSize: 13,
              fontWeight: 400,
            }}>
              支持 JPG、PNG、GIF、WebP 格式，可同时拖入多张
            </div>
          </div>
          {/* 鼠标跟随指示光晕 */}
          {dragPos && (
            <div
              className="absolute"
              style={{
                left: dragPos.x - 20,
                top: dragPos.y - 20,
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: isDark ? "oklch(0.72 0.20 290 / 0.30)" : "oklch(0.55 0.18 290 / 0.25)",
                border: `2px solid ${isDark ? "oklch(0.72 0.20 290 / 0.70)" : "oklch(0.52 0.18 290 / 0.65)"}`,
                pointerEvents: "none",
                transition: "left 0.05s, top 0.05s",
              }}
            />
          )}
        </div>
      )}
      <ReactFlow
        nodes={displayNodes}
        edges={ENABLE_NODE_CONNECTIONS ? edges : []}
        onNodesChange={handleNodesChangeWithHistory}
        onEdgesChange={ENABLE_NODE_CONNECTIONS ? handleEdgesChangeWithHistory : undefined}
        onConnect={ENABLE_NODE_CONNECTIONS ? onConnect : undefined}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneContextMenu={handlePaneContextMenu as any}
        onClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: "tapnow" }}
        connectionLineStyle={{ stroke: "rgba(255,255,255,0.5)", strokeWidth: 2.5 }}
        connectionLineType={"bezier" as any}
        style={{ background: canvasBg, width: isAssistantCollapsed ? "calc(100% - 112px)" : "calc(100% - clamp(280px, 32vw, 372px))" }}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Control", "Meta"]}
        selectNodesOnDrag={false}
        panOnDrag={isCanvasLocked ? false : [1]}
        nodesDraggable={!isCanvasLocked}
        nodesConnectable={ENABLE_NODE_CONNECTIONS}
        edgesFocusable={ENABLE_NODE_CONNECTIONS}
        edgesReconnectable={ENABLE_NODE_CONNECTIONS}
      >
        <Background variant={BackgroundVariant.Dots} gap={30} size={2.6} color={dotColor} />
        <MiniMap
          style={{
            width: 100,
            height: 75,
            left: 16,
            bottom: 8,
            right: "auto",
            opacity: 0.6,
            background: isDark ? "oklch(0.11 0.015 270)" : "oklch(0.95 0.004 270)",
            border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}`,
            borderRadius: "var(--radius-md-design)",
          }}
          maskColor={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"}
          nodeColor={isDark ? "oklch(0.35 0.02 270)" : "oklch(0.75 0.005 270)"}
          zoomable
          pannable={!isCanvasLocked}
        />
        <Controls showZoom={false} showFitView={false} showInteractive={false} />
      </ReactFlow>

      <CanvasAssistantPanel
        isDark={isDark}
        collapsed={isAssistantCollapsed}
        isAuthenticated={isAuthenticated}
        onLoginRequest={openLoginModal}
        onToggleCollapsed={() => setIsAssistantCollapsed(value => !value)}
        referencedAssets={referencedAssets}
        onRemoveReference={(id) => setReferencedAssets(prev => prev.filter(r => r.id !== id))}
      />

      {selectedImageNodeIds.length === 1 && !multiImageSelectionActive && (
        <AssetFloatingToolbar
          isDark={isDark}
          position={attachedImageToolbarPosition}
          onAction={handleSingleImageToolbarAction}
        />
      )}

      {multiImageSelectionActive && (
        <MultiSelectionFloatingToolbar
          isDark={isDark}
          count={selectedImageNodeIds.length}
          grouped={areNodesGrouped(selectedImageNodeIds)}
          position={attachedImageToolbarPosition}
          onAction={(action) => handleNodeAction(action, "__selection__")}
        />
      )}
      {/* Group container overlay — rendered above ReactFlow, below toolbars */}
      <GroupContainerOverlay
        groups={groupOverlayData}
        viewport={viewport}
        isDark={isDark}
        enteringGroupId={enteringGroupId}
        onContextMenu={handleGroupContainerContextMenu}
        onDoubleClick={handleGroupContainerDoubleClick}
        onDragEnd={handleGroupContainerDragEnd}
        onLabelDoubleClick={handleGroupLabelDoubleClick}
      />

      {/* Rename group dialog */}
      {renamingGroupId && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", zIndex: 5000 }}
          onMouseDown={() => setRenamingGroupId(null)}
        >
          <div
            className="w-[min(360px,calc(100vw-32px))] rounded-[var(--radius-lg-design)] p-5 shadow-2xl"
            style={{
              background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
              border: `1px solid ${isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)"}`,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <p className="type-caption mb-3" style={{ color: isDark ? "oklch(0.82 0.008 270)" : "oklch(0.22 0.018 255)", fontWeight: 600 }}>重命名打组</p>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && renameValue.trim()) {
                  setGroupNames(prev => ({ ...prev, [renamingGroupId]: renameValue.trim() }));
                  toast(`已重命名为「${renameValue.trim()}」`);
                  setRenamingGroupId(null);
                }
                if (e.key === "Escape") setRenamingGroupId(null);
              }}
              className="w-full px-3 py-2 rounded-[var(--radius-md-design)] type-caption outline-none"
              style={{
                background: isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 4%)",
                border: `1px solid ${isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)"}`,
                color: isDark ? "oklch(0.85 0.008 270)" : "oklch(0.18 0.008 270)",
              }}
              placeholder="输入打组名称..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRenamingGroupId(null)}
                className="px-3 py-1.5 rounded-[var(--radius-md-design)] type-caption"
                style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)" }}
              >取消</button>
              <button
                onClick={() => {
                  if (renameValue.trim()) {
                    setGroupNames(prev => ({ ...prev, [renamingGroupId]: renameValue.trim() }));
                    toast(`已重命名为「${renameValue.trim()}」`);
                  }
                  setRenamingGroupId(null);
                }}
                className="px-3 py-1.5 rounded-[var(--radius-md-design)] type-caption"
                style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
              >确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom zoom controls — vertical bar matching preview toolbar style */}
      <ZoomControlBar isDark={isDark} locked={isCanvasLocked} onLockedChange={setIsCanvasLocked} />

      {/* Canvas top tool palette — centered above the canvas area */}
      <CanvasTopToolPalette isDark={isDark} />

      {/* Back button — top-left */}
      <BackButton isDark={isDark} />


      {/* C-key lasso eraser — hidden while node connections are temporarily disabled */}
      {ENABLE_NODE_CONNECTIONS && <LassoEraser isDark={isDark} onCut={handleLassoCut} />}

      {/* Node context menu */}
      {nodeCtxMenu && (
        <NodeContextMenu
          menu={nodeCtxMenu}
          onClose={() => setNodeCtxMenu(null)}
          onAction={(action, nodeId) => {
            if (nodeCtxMenu.nodeType === "group-container" || nodeCtxMenu.nodeType === "group-container-inside") {
              handleGroupAction(action);
            } else {
              handleNodeAction(action, nodeId);
            }
            setNodeCtxMenu(null);
          }}
          isDark={isDark}
        />
      )}

      {/* Edit-asset prompt bar — shown after zoom-in animation, overlays bottom */}
      {editAsset && (
        <AssetEditPromptBar
          asset={editAsset}
          isDark={isDark}
          onClose={() => {
            setEditAsset(null);
            // Remove isEditing flag from node data
            setNodes(nds => nds.map(n =>
              n.type === "asset" && n.id === editAsset.nodeId
                ? { ...n, data: { ...n.data, isEditing: false } }
                : n
            ));
          }}
        />
      )}

      {pendingProject && (
        <SaveProjectConfirmDialog
          isDark={isDark}
          project={pendingProject}
          onCancel={() => setPendingProject(null)}
          onSave={handleProjectSaveAndNavigate}
        />
      )}

    </div>
  );
}

// ── Public export ──────────────────────────────────────────────
export default function InfiniteCanvas({ projectId = "p1" }: { projectId?: string }) {
  return (
    <ReactFlowProvider>
      <InnerCanvas projectId={projectId} />
    </ReactFlowProvider>
  );
}
