/**
 * InfiniteCanvas — React Flow based canvas
 * Features:
 * 1. C-key lasso: hold C + drag to draw a selection box that cuts all edges it intersects
 * 2. Right-click on blank canvas: NO menu (dismiss only)
 * 3. Right-click on node: context menu with icon commands
 * 4. Double-click asset node: full-screen image preview modal
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
  Search, ArrowRight, Share2,
} from "lucide-react";
import { useLocation } from "wouter";
import { GENERATED_ASSETS, AI_MODELS, PROJECTS, type GeneratedAsset, type Project } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

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
function NodeWrapper({ children, selected, isDark, model, onModelChange, onDelete, style, onContextMenu }: {
  children: React.ReactNode;
  selected: boolean;
  isDark: boolean;
  model: string;
  onModelChange: (m: string) => void;
  onDelete: () => void;
  style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
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
function AssetFloatingToolbar({ isDark, onPreview, onDownload }: {
  isDark: boolean; onPreview: () => void; onDownload: () => void;
}) {
  const toolBg = isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.97)";
  const toolBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
  const iconColor = isDark ? "rgba(255,255,255,0.75)" : "rgba(20,20,36,0.82)";
  const dividerColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
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
  const handleClick = (action: string) => {
    if (action === "download") { onDownload(); return; }
    if (action === "fullscreen") { onPreview(); return; }
    toast("功能即将上线", { description: action });
  };
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-2 py-1.5 rounded-[var(--radius-lg-design)] nodrag nopan"
      style={{ top: -52, background: toolBg, border: `1px solid ${toolBorder}`, backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.35)", zIndex: 50, whiteSpace: "nowrap" }}
    >
      {tools.map((t) => (
        <button key={t.action} title={t.label}
          onClick={(e) => { e.stopPropagation(); handleClick(t.action); }}
          className="relative w-8 h-8 rounded-[var(--radius-lg-design)] flex items-center justify-center transition-all"
          style={{ color: iconColor }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          {t.icon}
          {(t as any).dot && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-[var(--radius-pill)]" style={{ background: "oklch(0.60 0.22 260)" }} />}
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: dividerColor, margin: "0 4px", flexShrink: 0 }} />
      {actions.map((t) => (
        <button key={t.action} title={t.label}
          onClick={(e) => { e.stopPropagation(); handleClick(t.action); }}
          className="w-8 h-8 rounded-[var(--radius-lg-design)] flex items-center justify-center transition-all"
          style={{ color: iconColor }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          {t.icon}
        </button>
      ))}
    </div>
  );
}


// ── Multi Image Selection Floating Toolbar ─────────────────────
function MultiSelectionFloatingToolbar({
  isDark,
  count,
  grouped,
  onAction,
}: {
  isDark: boolean;
  count: number;
  grouped: boolean;
  onAction: (action: string) => void;
}) {
  const bg = isDark ? "rgba(22,22,30,0.92)" : "rgba(255,255,255,0.94)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.86)" : "rgba(28,28,40,0.84)";
  const muted = isDark ? "rgba(255,255,255,0.52)" : "rgba(28,28,40,0.52)";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
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
      className="absolute top-20 -translate-x-1/2 rounded-[var(--radius-xl-design)] shadow-2xl nodrag nopan overflow-hidden"
      style={{
        left: "calc((100% - 372px) / 2)",
        background: bg,
        border: `1px solid ${border}`,
        color: text,
        zIndex: 1600,
        backdropFilter: "blur(22px)",
        boxShadow: isDark
          ? "0 18px 48px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04) inset"
          : "0 18px 48px rgba(40,40,70,0.16), 0 0 0 1px rgba(255,255,255,0.75) inset",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 mr-1 rounded-[var(--radius-md-design)]" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: muted }}>
          <span className="type-caption" style={{ color: accent, fontWeight: 700 }}>{count}</span>
          <span className="type-caption">张图片已选中 · {groupHint}</span>
        </div>
        {items.map(item => (
          <button
            key={item.action}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md-design)] type-caption transition-colors"
            style={{ color: text }}
            onClick={() => onAction(item.action)}
            onMouseEnter={e => (e.currentTarget.style.background = hover)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {item.icon}
            <span>{item.label}</span>
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
    <div className="absolute left-1/2 -translate-x-1/2 nodrag nopan"
      data-asset-src={assetSrc}
      style={{ top: "calc(100% + 12px)", width: 380, background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: "var(--radius-md-design)", backdropFilter: "blur(20px)", boxShadow: "0 16px 48px rgba(0,0,0,0.4)", zIndex: 50 }}>
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
  const [showPanel, setShowPanel] = useState(false);
  const { deleteElements } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  const asset = GENERATED_ASSETS.find(a => a.id === (data.assetId as string)) || GENERATED_ASSETS[0];
  const isEditing = !!(data as { isEditing?: boolean }).isEditing;
  const displayTitle = (data.title as string) || asset.title || "素材节点";
  const displayTags = Array.isArray(data.tags)
    ? (data.tags as string[])
    : ((asset.tags as string[] | undefined) || ["默认 icon", "灰色容器"]);
  const displayType = "图片";
  const text = isDark ? "oklch(0.82 0.006 270)" : "oklch(0.22 0.006 270)";
  const subtext = isDark ? "oklch(0.62 0.006 270)" : "oklch(0.46 0.006 270)";
  const tagBg = isDark ? "oklch(0.28 0.004 270)" : "oklch(0.78 0.004 270)";
  const assetShellBg = isDark ? "oklch(0.20 0.004 270)" : "oklch(0.86 0.004 270)";
  const assetShellBorder = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
  const iconPanelBg = isDark ? "oklch(0.24 0.004 270)" : "oklch(0.80 0.004 270)";
  const naturalWidth = Math.max(1, asset.width || 720);
  const naturalHeight = Math.max(1, asset.height || 960);
  const maxNodeSide = 360;
  const minNodeSide = 180;
  const scale = Math.min(1, maxNodeSide / Math.max(naturalWidth, naturalHeight));
  const nodeWidth = Math.max(minNodeSide, Math.round(naturalWidth * scale));

  // Close panel when node loses selection
  useEffect(() => { if (!selected) setShowPanel(false); }, [selected]);

  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId, nodeType: "asset" }
    }));
  }, [nodeId]);

  return (
    <>
      <NodeWrapper selected={selected} isDark={isDark} model={model} onModelChange={setModel}
        onDelete={() => deleteElements({ nodes: [{ id: nodeId }] })}
        style={{ width: nodeWidth, background: assetShellBg, border: `1.5px solid ${assetShellBorder}` }}
        onContextMenu={handleNodeCtxMenu}
      >
        {/* Floating top toolbar — visible for a single selected image node only */}
        {selected && !multiSelectionActive && (
          <AssetFloatingToolbar
            isDark={isDark}
            onPreview={() => setPreview(true)}
            onDownload={() => toast("下载", { description: "功能即将上线" })}
          />
        )}

        <div
          className="relative flex items-center justify-center overflow-hidden cursor-pointer"
          style={{ background: iconPanelBg, borderBottom: `1px solid ${assetShellBorder}` }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPanel(p => !p);
            // Dispatch reference event to BottomPromptBar (pass ctrlKey for multi-select)
            window.dispatchEvent(new CustomEvent("asset-reference", {
              detail: { id: nodeId, title: displayTitle, src: asset.src, ctrlKey: e.ctrlKey || e.metaKey }
            }));
          }}
          onDoubleClick={(e) => { e.stopPropagation(); }}
        >
          <img
            src={asset.src}
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
        <div className="px-3 py-2">
          <p className="type-caption truncate" style={{ color: text }}>{displayTitle}</p>
          <p className="type-caption mt-0.5" style={{ color: subtext }}>{displayTags.join(" · ")}</p>
          {(data as { note?: string }).note && (
            <p className="type-caption mt-1 truncate" style={{ color: "oklch(0.72 0.18 290)" }}>{(data as { note?: string }).note}</p>
          )}
        </div>
      </NodeWrapper>

      {/* Bottom prompt panel — shown on click when selected */}
      {showPanel && selected && (
        <AssetPromptPanel
          isDark={isDark}
          assetSrc={asset.src}
          onExpand={() => setPreview(true)}
        />
      )}

      {preview && (
        <ImagePreviewModal src={asset.src} title={asset.title} onClose={() => setPreview(false)} isDark={isDark} />
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
  const bg = isDark ? "oklch(0.13 0.015 270 / 0.95)" : "oklch(0.98 0.004 270 / 0.95)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
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
  const groupAction = menu.grouped ? "ungroup" : "group";
  const groupLabel = menu.grouped ? "解散打组" : "打组";

  const items = isSelectionMenu ? [
    { icon: <Copy size={13} />, label: "复制", action: "copy", color: iconColor },
    { icon: <Clipboard size={13} />, label: "粘贴", action: "paste", color: iconColor },
    { icon: <Box size={13} />, label: groupLabel, action: groupAction, color: iconColor },
    { icon: <Type size={13} />, label: "添加文本备注", action: "add-note", color: iconColor },
    { icon: <Trash2 size={13} />, label: "删除节点", action: "delete", color: dangerColor },
  ] : [
    { icon: <Edit3 size={13} />, label: "编辑素材", action: "edit-asset", color: iconColor },
    ...(menu.nodeType === "asset" ? [{ icon: <Download size={13} />, label: "下载图片", action: "download", color: iconColor }] : []),
    { icon: <Copy size={13} />, label: "复制", action: "copy", color: iconColor },
    { icon: <Clipboard size={13} />, label: "粘贴", action: "paste", color: iconColor },
    { icon: <Box size={13} />, label: groupLabel, action: groupAction, color: iconColor },
    { icon: <Type size={13} />, label: "添加文本备注", action: "add-note", color: iconColor },
    { icon: <Trash2 size={13} />, label: "删除节点", action: "delete", color: dangerColor },
  ];

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
function ZoomControlBar({ isDark }: { isDark: boolean }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [locked, setLocked] = useState(false);

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
      style={{ bottom: 80, left: 16, zIndex: 100 }}
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
          style={{ color: locked ? "oklch(0.62 0.22 290)" : iconColor }}
          title={locked ? "解锁画布" : "锁定画布"}
          onClick={() => setLocked(l => !l)}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {locked ? <Lock size={13} strokeWidth={2} /> : <Unlock size={13} strokeWidth={2} />}
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
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
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
          border: `1.5px solid ${border}`,
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


function CanvasAssistantPanel({ isDark, projectTitle }: { isDark: boolean; projectTitle: string }) {
  const bg = isDark ? "oklch(0.125 0.014 270 / 0.98)" : "oklch(0.995 0.002 80 / 0.98)";
  const border = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.84 0.008 270)" : "oklch(0.18 0.008 270)";
  const sub = isDark ? "oklch(0.56 0.01 270)" : "oklch(0.48 0.012 255)";
  const chipBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)";

  return (
    <aside
      className="absolute inset-y-0 right-0 hidden xl:flex flex-col nodrag nopan"
      style={{ width: 372, background: bg, borderLeft: `1px solid ${border}`, zIndex: 120, backdropFilter: "blur(22px)" }}
    >
      <div className="h-14 flex items-center justify-between px-5" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="min-w-0">
          <p className="type-caption font-semibold truncate" style={{ color: text, fontSize: 15 }}>{projectTitle}</p>
          <p className="type-caption mt-0.5" style={{ color: sub, fontSize: 11 }}>画布助手</p>
        </div>
        <div className="flex items-center gap-1">
          {[PlusSquare, Share2, MoreHorizontal].map((Icon, index) => (
            <button key={index} className="w-8 h-8 rounded-[var(--radius-md-design)] flex items-center justify-center transition-opacity hover:opacity-75" style={{ color: sub }}>
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 py-6 overflow-hidden">
        <div className="flex justify-end mb-8">
          <div className="px-4 py-3 rounded-[var(--radius-lg-design)] type-caption" style={{ background: chipBg, color: text, maxWidth: 210 }}>
            选择图片节点后，可在左侧画布直接编辑素材。
          </div>
        </div>
        <p className="type-caption mb-2" style={{ color: sub }}>May 23, 2026</p>
        <div className="rounded-[var(--radius-lg-design)] p-4" style={{ background: chipBg, border: `1px solid ${border}` }}>
          <p className="type-caption leading-6" style={{ color: text }}>
            右键图片节点可以快速执行编辑素材、复制、粘贴、打组、添加文本备注和删除节点。当前布局已按参考图改为左侧大画布、右侧助手区、底部浮动工具区。
          </p>
        </div>
      </div>

      <div className="p-4" style={{ borderTop: `1px solid ${border}` }}>
        <div className="rounded-[var(--radius-xl-design)] px-3 py-3" style={{ background: chipBg, border: `1px solid ${border}` }}>
          <textarea
            placeholder="输入对当前画布的想法..."
            rows={2}
            className="w-full bg-transparent outline-none resize-none type-caption leading-6"
            style={{ color: text }}
          />
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2" style={{ color: sub }}>
              <Plus size={14} />
              <LayoutGrid size={14} />
              <span className="type-caption">Agent</span>
            </div>
            <button className="w-8 h-8 rounded-[var(--radius-pill)] flex items-center justify-center" style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white" }}>
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
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

  const bg = isDark ? "oklch(0.13 0.015 270 / 0.60)" : "oklch(0.98 0.004 270 / 0.60)";
  const panelBg = isDark ? "oklch(0.15 0.018 270 / 0.98)" : "oklch(0.995 0.002 80 / 0.98)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.52 0.01 270)" : "oklch(0.50 0.012 255)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";

  return (
    <div ref={ref} className="absolute nodrag nopan" style={{ top: 16, left: "calc((100% - 372px) / 2)", transform: "translateX(-50%)", zIndex: 102, width: 380 }}>
      <div
        className="flex items-center gap-2 px-3 rounded-[var(--radius-lg-design)] shadow-lg"
        style={{ height: 34, background: bg, border: `1.5px solid ${open ? "oklch(0.62 0.22 290 / 0.55)" : border}`, backdropFilter: "blur(14px)" }}
        onMouseDown={e => e.stopPropagation()}
      >
        <Search size={14} style={{ color: open ? "oklch(0.72 0.18 290)" : sub }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="搜索项目或素材..."
          className="flex-1 bg-transparent outline-none type-caption"
          style={{ color: text }}
        />
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
  const { screenToFlowPosition, getEdges, getNodes, fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeCtxMenu, setNodeCtxMenu] = useState<NodeCtxState | null>(null);
  const [clipboard, setClipboard] = useState<Node[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  // ── Edit-asset state: zoom in on canvas then show editing prompt bar ──
  const [editAsset, setEditAsset] = useState<{ id: string; title: string; src: string; nodeId: string } | null>(null);
  const [isZoomingToEdit, setIsZoomingToEdit] = useState(false);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const MAX_HISTORY_STEPS = 20;

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
      setNodes(nds => nds.map(n => actionIds.includes(n.id) ? { ...n, data: { ...(n.data as Record<string, unknown>), groupId } } : n));
      toast(`已打组 ${actionIds.length} 个画布`, { description: "右键可解散打组" });
    } else if (action === "ungroup") {
      pushHistory();
      setNodes(nds => nds.map(n => actionIds.includes(n.id) ? { ...n, data: { ...(n.data as Record<string, unknown>), groupId: undefined } } : n));
      toast("已解散打组");
    } else if (action === "auto-layout") {
      if (actionIds.length < 2) { toast("请至少选择 2 个图片节点再自动布局"); return; }
      pushHistory();
      const selected = nodes.filter(n => actionIds.includes(n.id));
      const avgX = selected.reduce((sum, n) => sum + n.position.x, 0) / selected.length;
      const avgY = selected.reduce((sum, n) => sum + n.position.y, 0) / selected.length;
      const columns = Math.ceil(Math.sqrt(selected.length));
      const gapX = 320;
      const gapY = 280;
      setNodes(nds => nds.map(n => {
        const index = actionIds.indexOf(n.id);
        if (index === -1) return n;
        const row = Math.floor(index / columns);
        const col = index % columns;
        const totalRows = Math.ceil(actionIds.length / columns);
        return {
          ...n,
          position: {
            x: avgX + (col - (columns - 1) / 2) * gapX,
            y: avgY + (row - (totalRows - 1) / 2) * gapY,
          },
        };
      }));
      toast("已完成自动布局", { description: `${actionIds.length} 个图片节点已重新排列` });
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping) return;
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
  }, [pushHistory, selectedNodeIds, setNodes, undoCanvas]);

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
  const currentProject = PROJECTS.find(project => project.id === projectId);

  // Inject isEditing flag into the target node's data so AssetNodeComponent can show the mask
  const selectedImageNodeIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
  const multiImageSelectionActive = selectedImageNodeIds.length > 1;
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
    <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ height: "100%" }}>
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
        onClick={() => setNodeCtxMenu(null)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: "tapnow" }}
        connectionLineStyle={{ stroke: "rgba(255,255,255,0.5)", strokeWidth: 2.5 }}
        connectionLineType={"bezier" as any}
        style={{ background: canvasBg, width: "calc(100% - 372px)" }}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={false}
        panOnDrag={[2]}
        nodesDraggable={true}
        nodesConnectable={ENABLE_NODE_CONNECTIONS}
        edgesFocusable={ENABLE_NODE_CONNECTIONS}
        edgesReconnectable={ENABLE_NODE_CONNECTIONS}
      >
        <Background variant={BackgroundVariant.Dots} gap={30} size={2.6} color={dotColor} />
        <MiniMap
          style={{ background: isDark ? "oklch(0.11 0.015 270)" : "oklch(0.95 0.004 270)", border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}`, borderRadius: "var(--radius-md-design)", right: 388 }}
          maskColor={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"}
          nodeColor={isDark ? "oklch(0.35 0.02 270)" : "oklch(0.75 0.005 270)"}
          zoomable
          pannable
        />
        <Controls showZoom={false} showFitView={false} showInteractive={false} />
      </ReactFlow>

      <CanvasAssistantPanel isDark={isDark} projectTitle={currentProject?.title || "Untitled"} />

      {multiImageSelectionActive && (
        <MultiSelectionFloatingToolbar
          isDark={isDark}
          count={selectedImageNodeIds.length}
          grouped={areNodesGrouped(selectedImageNodeIds)}
          onAction={(action) => handleNodeAction(action, "__selection__")}
        />
      )}
      {/* Custom zoom controls — vertical bar matching preview toolbar style */}
      <ZoomControlBar isDark={isDark} />

      {/* Back button — top-left */}
      <BackButton isDark={isDark} />

      {/* Canvas search — fixed beside project info */}
      <CanvasSearchBar
        isDark={isDark}
        currentProjectId={projectId}
        onProjectRequest={setPendingProject}
        onAssetAdd={handleAssetAddFromSearch}
      />

      {/* C-key lasso eraser — hidden while node connections are temporarily disabled */}
      {ENABLE_NODE_CONNECTIONS && <LassoEraser isDark={isDark} onCut={handleLassoCut} />}

      {/* Node context menu */}
      {nodeCtxMenu && (
        <NodeContextMenu menu={nodeCtxMenu} onClose={() => setNodeCtxMenu(null)} onAction={handleNodeAction} isDark={isDark} />
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
