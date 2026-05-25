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
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Boxes,
  Triangle, Pencil, MessageCircle, Star, Minus as MinusIcon,
} from "lucide-react";

// 「井号 + 方框」图标 — 创建画布专用
function CreateCanvasIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 外框矩形 */}
      <rect x="1.5" y="1.5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* 井号横线 */}
      <line x1="4.5" y1="6" x2="12.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4.5" y1="11" x2="12.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {/* 井号竖线 */}
      <line x1="6.5" y1="4" x2="6.5" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="10.5" y1="4" x2="10.5" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
import { useLocation } from "wouter";
import JSZip from "jszip";
import { saveAs } from "file-saver";
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
    { icon: <Boxes size={15} />, label: "编组", action: "group" },
    { icon: <FolderOutput size={15} />, label: "取消编组", action: "ungroup" },
    { icon: <LayoutGrid size={15} />, label: "自动排列", action: "auto-layout" },
    { icon: <AlignHorizontalSpaceAround size={15} />, label: "横向排列", action: "layout-horizontal" },
    { icon: <AlignVerticalSpaceAround size={15} />, label: "竖向排列", action: "layout-vertical" },
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
// ── 注释数据类型 ──
interface Annotation {
  id: string;
  x: number;   // 相对节点宽度的百分比 0-100
  y: number;   // 相对节点高度的百分比 0-100
  text: string;
  done: boolean;
  open: boolean;
  editing: boolean;
}

// ── AnnotationBubble 组件 ──
function AnnotationBubble({
  ann, isDark, onUpdate, onRemove
}: {
  ann: Annotation;
  isDark: boolean;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState(ann.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ann.editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [ann.editing]);

  // 点击气泡外任意区域（左键或右键）自动折叠
  useEffect(() => {
    if (!ann.open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as HTMLElement)) {
        if (ann.text.trim()) {
          onUpdate(ann.id, { open: false, editing: false });
        } else {
          onRemove(ann.id);
        }
      }
    };
    // 同时监听左键和右键
    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => document.removeEventListener("mousedown", handleOutsideClick, true);
  }, [ann.open, ann.id, ann.text, onUpdate, onRemove]);

  const bubbleBg = isDark ? "rgba(22,22,34,0.97)" : "rgba(255,255,255,0.98)";
  const bubbleBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,30,0.90)";
  const subColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";
  const iconBtnColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  const iconBtnHover = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)";
  const accentColor = "oklch(0.65 0.22 290)";
  const doneBg = isDark ? "rgba(34,42,22,0.97)" : "rgba(240,255,235,0.98)";
  const doneBorder = isDark ? "rgba(100,200,80,0.25)" : "rgba(80,160,60,0.20)";

  // 折叠状态：显示小圆点图标
  if (!ann.open) {
    return (
      <div
        data-ann-id={ann.id}
        className="absolute nodrag nopan"
        style={{
          left: `${ann.x}%`,
          top: `${ann.y}%`,
          transform: "translate(-50%, -50%)",
          zIndex: 50,
          cursor: "pointer",
        }}
        onClick={e => { e.stopPropagation(); onUpdate(ann.id, { open: true }); }}
        title={ann.text || "注释"}
      >
        <div style={{
          width: 22,
          height: 22,
          borderRadius: "50% 50% 50% 0",
          background: ann.done ? "oklch(0.62 0.18 145)" : accentColor,
          border: "2px solid rgba(255,255,255,0.9)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "rotate(-45deg)",
        }}>
          <MessageCircle size={9} color="white" style={{ transform: "rotate(45deg)" }} />
        </div>
      </div>
    );
  }

  // 展开气泡
  return (
    <div
      ref={bubbleRef}
      data-ann-id={ann.id}
      className="absolute nodrag nopan"
      style={{
        left: `${ann.x}%`,
        top: `${ann.y}%`,
        zIndex: 100,
        transform: "translateX(-50%)",
        minWidth: 220,
        maxWidth: 280,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* 连接线 */}
      <div style={{
        position: "absolute",
        left: "50%",
        bottom: "100%",
        transform: "translateX(-50%)",
        width: 2,
        height: 12,
        background: ann.done ? "oklch(0.62 0.18 145)" : accentColor,
        borderRadius: 1,
      }} />
      {/* 小圆点锚点 */}
      <div style={{
        position: "absolute",
        left: "50%",
        bottom: "calc(100% + 10px)",
        transform: "translate(-50%, 50%)",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: ann.done ? "oklch(0.62 0.18 145)" : accentColor,
        border: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }} />

      {/* 气泡主体 */}
      <div style={{
        background: ann.done ? doneBg : bubbleBg,
        border: `1px solid ${ann.done ? doneBorder : bubbleBorder}`,
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
        backdropFilter: "blur(16px)",
        overflow: "hidden",
      }}>
        {/* 标题栏 */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 6px 6px 10px",
          borderBottom: `1px solid ${ann.done ? doneBorder : bubbleBorder}`,
        }}>
          <span style={{ fontSize: 10, color: subColor, letterSpacing: "0.03em" }}>
            {ann.done ? "✓ 已完成" : "注释"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {/* 关闭按钮（折叠气泡，不删除） */}
            <button
              title={ann.text.trim() ? "折叠注释" : "撤销注释"}
              style={{ width: 22, height: 22, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: iconBtnColor, background: "transparent", border: "none", cursor: "pointer" }}
              onClick={() => {
                if (ann.text.trim()) {
                  onUpdate(ann.id, { open: false, editing: false });
                } else {
                  onRemove(ann.id);
                }
              }}
              onMouseEnter={e => (e.currentTarget.style.background = iconBtnHover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <X size={12} />
            </button>
            {/* 编辑按钮 */}
            {!ann.editing && (
              <button
                title="编辑注释"
                style={{ width: 22, height: 22, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: iconBtnColor, background: "transparent", border: "none", cursor: "pointer" }}
                onClick={() => { setDraft(ann.text); onUpdate(ann.id, { editing: true }); }}
                onMouseEnter={e => (e.currentTarget.style.background = iconBtnHover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <Edit3 size={12} />
              </button>
            )}
            {/* Done 按钮 */}
            <button
              title="完成并删除注释"
              style={{
                width: 22, height: 22, borderRadius: 5,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: iconBtnColor,
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: 600,
              }}
              onClick={() => onRemove(ann.id)}
              onMouseEnter={e => (e.currentTarget.style.background = iconBtnHover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Done
            </button>
          </div>
        </div>

        {/* 内容区 */}
        {ann.editing ? (
          <div style={{ padding: "8px 10px 8px" }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="输入注释内容..."
              rows={3}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: 12,
                lineHeight: 1.6,
                color: textColor,
                fontFamily: "inherit",
              }}
              onKeyDown={e => {
                if (e.key === "Escape") onUpdate(ann.id, { editing: false });
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onUpdate(ann.id, { text: draft, editing: false });
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
              <button
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, background: "transparent", border: `1px solid ${bubbleBorder}`, color: subColor, cursor: "pointer" }}
                onClick={() => onUpdate(ann.id, { editing: false })}
              >取消</button>
              <button
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, background: accentColor, border: "none", color: "white", cursor: "pointer" }}
                onClick={() => onUpdate(ann.id, { text: draft, editing: false })}
              >确认</button>
            </div>
          </div>
        ) : (
          <div
            style={{ padding: "8px 10px", fontSize: 12, lineHeight: 1.6, color: textColor, minHeight: 36, cursor: "text" }}
            onClick={() => { setDraft(ann.text); onUpdate(ann.id, { editing: true }); }}
          >
            {ann.text || <span style={{ color: subColor, fontStyle: "italic" }}>点击编辑注释...</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [preview, setPreview] = useState(false);
  const { setNodes: setFlowNodes } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";
  const [toolMode, setToolMode] = useState<string>("move");
  // 图片尺寸状态（支持拖拽缩放）
  const [imgW, setImgW] = useState<number>((data.imgW as number) || 0);
  const [imgH, setImgH] = useState<number>((data.imgH as number) || 0);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const viewport = useViewport();

  useEffect(() => {
    const handlePreviewRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === nodeId) setPreview(true);
    };
    window.addEventListener("asset-preview-request", handlePreviewRequest);
    return () => window.removeEventListener("asset-preview-request", handlePreviewRequest);
  }, [nodeId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<{ mode: string }>).detail?.mode;
      if (mode) setToolMode(mode);
    };
    window.addEventListener("tool-mode-change", handler);
    return () => window.removeEventListener("tool-mode-change", handler);
  }, []);

  const localSrc = (data as Record<string, unknown>).localSrc as string | undefined;
  const asset = GENERATED_ASSETS.find(a => a.id === (data.assetId as string)) || GENERATED_ASSETS[0];
  const displaySrc = localSrc || asset.src;
  const isEditing = !!(data as { isEditing?: boolean }).isEditing;
  const displayTitle = (data.title as string) || asset.title || "素材节点";

  // 初始尺寸：以自然尺寸比例计算
  const naturalWidth = localSrc ? 720 : Math.max(1, asset.width || 720);
  const naturalHeight = localSrc ? 960 : Math.max(1, asset.height || 960);
  const maxNodeSide = 360;
  const minNodeSide = 120;
  const initScale = Math.min(1, maxNodeSide / Math.max(naturalWidth, naturalHeight));
  const initW = Math.max(minNodeSide, Math.round(naturalWidth * initScale));
  const initH = Math.max(minNodeSide, Math.round(naturalHeight * initScale));

  // 如果未初始化则设置初始尺寸
  useEffect(() => {
    if (!imgW || !imgH) { setImgW(initW); setImgH(initH); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dispW = imgW || initW;
  const dispH = imgH || initH;

  // 选中边框样式
  const borderColor = selected
    ? "oklch(0.65 0.22 290)"
    : "transparent";
  const shadow = selected
    ? "0 0 0 2px oklch(0.65 0.22 290 / 0.72), 0 0 0 6px oklch(0.65 0.22 290 / 0.18), 0 8px 24px rgba(0,0,0,0.3)"
    : "0 4px 16px rgba(0,0,0,0.22)";
  const handleColor = "oklch(0.65 0.22 290)";

  // 右下角拖拽缩放
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDragRef.current = { startX: e.clientX, startY: e.clientY, startW: dispW, startH: dispH };
    setIsResizing(true);
    // 等比缩放：使用当前显示尺寸计算宽高比
    const aspectRatio = dispH / Math.max(1, dispW);
    const onMove = (mv: MouseEvent) => {
      const drag = resizeDragRef.current; if (!drag) return;
      const zoom = viewport.zoom || 1;
      const dx = (mv.clientX - drag.startX) / zoom;
      const dy = (mv.clientY - drag.startY) / zoom;
      // 取 dx/dy 中较大的分量作为缩放基准，保持宽高比
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy / aspectRatio;
      const newW = Math.max(60, Math.round(drag.startW + delta));
      const newH = Math.max(60, Math.round(newW * aspectRatio));
      setImgW(newW); setImgH(newH);
    };
    const onUp = (mu: MouseEvent) => {
      const drag = resizeDragRef.current; if (!drag) return;
      const zoom = viewport.zoom || 1;
      const dx = (mu.clientX - drag.startX) / zoom;
      const dy = (mu.clientY - drag.startY) / zoom;
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy / aspectRatio;
      const newW = Math.max(60, Math.round(drag.startW + delta));
      const newH = Math.max(60, Math.round(newW * aspectRatio));
      resizeDragRef.current = null;
      setIsResizing(false);
      setImgW(newW); setImgH(newH);
      // 只派发事件，由 InnerCanvas 统一处理更新+历史记录（不再调用 setFlowNodes ，避免双重写入导致回退失效）
      window.dispatchEvent(new CustomEvent("asset-resize-end", { detail: { nodeId, newW, newH } }));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [dispW, dispH, nodeId, viewport.zoom]);

  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId, nodeType: "asset" }
    }));
  }, [nodeId]);

  const handleAssetMouseDownCapture = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) e.stopPropagation();
  }, []);

  const handleAssetClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const additive = e.ctrlKey || e.metaKey;
    setFlowNodes(nds => {
      const wasSelected = Boolean(nds.find(n => n.id === nodeId)?.selected);
      const nextSelectedIds: string[] = [];
      const nextNodes = nds.map(n => {
        const sel = additive ? (n.id === nodeId ? !wasSelected : Boolean(n.selected)) : n.id === nodeId;
        if (sel) nextSelectedIds.push(n.id);
        return { ...n, selected: sel };
      });
      window.dispatchEvent(new CustomEvent("asset-click-selection", { detail: { selectedIds: nextSelectedIds } }));
      return nextNodes;
    });
    window.dispatchEvent(new CustomEvent("asset-reference", {
      detail: { id: nodeId, title: displayTitle, src: displaySrc, ctrlKey: additive }
    }));
  }, [displaySrc, displayTitle, nodeId, setFlowNodes]);

  const handleImageAnnotateClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== "annotate") return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    window.dispatchEvent(new CustomEvent("annotation-create", { detail: { annotation: {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: xPct, y: yPct, screenX: e.clientX, screenY: e.clientY,
      text: "", done: false, open: true, editing: true, nodeId,
    } } }));
  }, [toolMode, nodeId]);

  return (
    <>
      {/* 纯图片节点：无底部工具栏，无灰条 */}
      <div
        className="relative"
        style={{
          width: dispW, height: dispH,
          border: `2px solid ${borderColor}`,
          borderRadius: 4,
          boxShadow: shadow,
          overflow: "hidden",
          cursor: isResizing ? "nwse-resize" : toolMode === "annotate" ? "crosshair" : "grab",
          transition: "border-color 0.15s, box-shadow 0.15s",
          userSelect: "none",
        }}
        onContextMenu={handleNodeCtxMenu}
        onClick={handleAssetClick}
        onMouseDownCapture={handleAssetMouseDownCapture}
      >
        {ENABLE_NODE_CONNECTIONS && (
          <>
            <Handle type="target" position={Position.Left} id="left"
              className="!w-3 !h-3 !rounded-full !border-2"
              style={{ left: -1, backgroundColor: "rgba(255,255,255,0.80)", borderColor: "rgba(255,255,255,0.60)" }} />
            <Handle type="source" position={Position.Right} id="right"
              className="!w-3 !h-3 !rounded-full !border-2"
              style={{ right: -1, backgroundColor: "rgba(255,255,255,0.80)", borderColor: "rgba(255,255,255,0.60)" }} />
          </>
        )}
        <img
          src={displaySrc}
          alt={displayTitle}
          draggable={false}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", pointerEvents: "none" }}
          onClick={handleImageAnnotateClick as unknown as React.MouseEventHandler<HTMLImageElement>}
        />
        {isEditing && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.15)" }} />
        )}
        {/* 右下角缩放手柄（选中时显示） */}
        {selected && (
          <div
            className="absolute nodrag nopan"
            style={{
              right: -9, bottom: -9,
              width: 18, height: 18,
              borderRadius: "50%",
              background: handleColor,
              border: "2px solid white",
              cursor: "nwse-resize",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
              zIndex: 10,
            }}
            onMouseDown={handleResizeMouseDown}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 7L7 1M4 7L7 4M7 7V7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
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

// ── Canvas Frame Node — 画布帧节点 ─────────────────────────────────────────────
function CanvasFrameNode({ id, data, selected }: { id: string; data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const viewport = useViewport();

  // 内部尺寸状态（拖拽过程中实时更新）
  const [localW, setLocalW] = useState<number>((data.width as number) || 800);
  const [localH, setLocalH] = useState<number>((data.height as number) || 600);
  const [isResizing, setIsResizing] = useState(false);

  // 当外部 data 变化时同步（非拖拽状态）
  useEffect(() => {
    if (!isResizing) {
      setLocalW((data.width as number) || 800);
      setLocalH((data.height as number) || 600);
    }
  }, [data.width, data.height, isResizing]);

  const resizeDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startW: localW,
      startH: localH,
    };
    setIsResizing(true);

    const onMouseMove = (mv: MouseEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const zoom = viewport.zoom || 1;
      const dx = (mv.clientX - drag.startClientX) / zoom;
      const dy = (mv.clientY - drag.startClientY) / zoom;
      const newW = Math.max(80, Math.round(drag.startW + dx));
      const newH = Math.max(60, Math.round(drag.startH + dy));
      setLocalW(newW);
      setLocalH(newH);
    };

    const onMouseUp = (mu: MouseEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const zoom = viewport.zoom || 1;
      const dx = (mu.clientX - drag.startClientX) / zoom;
      const dy = (mu.clientY - drag.startClientY) / zoom;
      const newW = Math.max(80, Math.round(drag.startW + dx));
      const newH = Math.max(60, Math.round(drag.startH + dy));
      resizeDragRef.current = null;
      setIsResizing(false);
      // 通知 InnerCanvas 更新节点 data
      window.dispatchEvent(new CustomEvent("canvas-frame-resize", {
        detail: { id, width: newW, height: newH },
      }));
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [id, localW, localH, viewport.zoom]);

  const w = localW;
  const h = localH;
  const title = (data.title as string) || "画布";
  const borderColor = selected
    ? "oklch(0.65 0.22 290)"
    : isDark ? "oklch(1 0 0 / 20%)" : "oklch(0 0 0 / 18%)";
  // 使用用户选择的背景色，默认深灰色
  const bg = (data.bgColor as string) || "#2a2a30";
  const labelColor = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.52 0.01 270)";
  const handleColor = isDark ? "oklch(0.65 0.22 290 / 0.80)" : "oklch(0.50 0.20 290 / 0.80)";

  return (
    <div
      style={{
        width: w, height: h,
        background: bg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 8,
        boxSizing: "border-box",
        position: "relative",
        transition: isResizing ? "none" : "border-color 0.15s",
      }}
    >
      {/* 左上角标题 */}
      <div
        style={{
          position: "absolute",
          top: -22,
          left: 0,
          fontSize: 11,
          fontWeight: 500,
          color: labelColor,
          whiteSpace: "nowrap",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        {title} · {w} × {h} px
      </div>

      {/* 右下角拖拽手柄 — 18×18 圆形，内含伸缩图标 */}
      <div
        className="nodrag"
        onMouseDown={handleResizeMouseDown}
        style={{
          position: "absolute",
          right: -9,
          bottom: -9,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: isDark ? "oklch(0.32 0.01 270)" : "oklch(0.88 0.006 270)",
          border: `1.5px solid ${handleColor}`,
          boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.45)" : "0 2px 6px rgba(0,0,0,0.18)",
          cursor: "nwse-resize",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s, transform 0.12s",
        }}
        title="拖拽调整大小"
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.18)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
      >
        {/* 伸缩图标：双向对角箭头 */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          {/* 左上 → 右下 箭头 */}
          <path d="M1 3.5 L1 1 L3.5 1" stroke={handleColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M1 1 L4 4" stroke={handleColor} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          {/* 右下 → 左上 箭头 */}
          <path d="M9 6.5 L9 9 L6.5 9" stroke={handleColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M9 9 L6 6" stroke={handleColor} strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </div>

      {/* 连接手柄（隐藏） */}
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    </div>
  );
}


// ── Shape Node Component ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ShapeNodeComponent({ id, data, selected }: { id: string; data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { setNodes: setFlowNodes } = useReactFlow();
  const shapeType = (data.shapeType as string) || "rectangle";
  const w = (data.width as number) || 120;
  const h = (data.height as number) || 120;
  const fill = (data.fill as string) || (isDark ? "oklch(0.45 0.18 260)" : "oklch(0.60 0.18 260)");
  const stroke = (data.stroke as string) || "none";
  const strokeW = (data.strokeWidth as number) || 0;
  const opacity = (data.opacity as number) ?? 1;
  const isEditMode = !!(data.anchorEditMode as boolean);

  // 初始化锚点（圆形用四个方向控制点）
  const [anchors, setAnchors] = useState<{ x: number; y: number }[]>(() => {
    if (data.anchors) return data.anchors as { x: number; y: number }[];
    if (shapeType === "triangle") return [{ x: w/2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    if (shapeType === "circle") return [
      { x: w/2, y: 0 },    // 上
      { x: w, y: h/2 },    // 右
      { x: w/2, y: h },    // 下
      { x: 0, y: h/2 },    // 左
    ];
    if (shapeType === "star") {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? Math.min(w, h) / 2 : Math.min(w, h) / 4;
        pts.push({ x: w/2 + r * Math.cos(angle), y: h/2 + r * Math.sin(angle) });
      }
      return pts;
    }
    if (shapeType === "line") return [{ x: 0, y: h/2 }, { x: w, y: h/2 }];
    if (shapeType === "arrow") return [{ x: 0, y: h/2 }, { x: w, y: h/2 }];
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  });

  // 右键菜单状态
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // 右键菜单中的参数状态
  const [menuFill, setMenuFill] = useState(fill);
  const [menuStroke, setMenuStroke] = useState(stroke);
  const [menuStrokeW, setMenuStrokeW] = useState(String(strokeW));
  const [menuOpacity, setMenuOpacity] = useState(String(Math.round(opacity * 100)));

  // 关闭右键菜单
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      // 点击菜单外关闭
      const target = e.target as HTMLElement;
      if (!target.closest(".shape-ctx-menu")) closeCtxMenu();
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu, closeCtxMenu]);

  // 应用参数到节点
  const applyParams = useCallback(() => {
    const newOpacity = Math.max(0, Math.min(1, parseFloat(menuOpacity) / 100 || 1));
    const newStrokeW = parseFloat(menuStrokeW) || 0;
    setFlowNodes(nds => nds.map(n => n.id === id ? {
      ...n,
      data: { ...n.data, fill: menuFill, stroke: menuStroke, strokeWidth: newStrokeW, opacity: newOpacity }
    } : n));
    closeCtxMenu();
  }, [menuFill, menuStroke, menuStrokeW, menuOpacity, id, setFlowNodes, closeCtxMenu]);

  const draggingAnchorRef = useRef<number | null>(null);

  // 锚点拖拽处理
  const handleAnchorMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    draggingAnchorRef.current = idx;
    const nodeEl = (e.currentTarget as HTMLElement).closest(".react-flow__node");
    const onMove = (mv: MouseEvent) => {
      const rect = nodeEl?.getBoundingClientRect();
      if (!rect) return;
      const nx = mv.clientX - rect.left;
      const ny = mv.clientY - rect.top;
      setAnchors(prev => prev.map((a, i) => i === idx ? { x: nx, y: ny } : a));
    };
    const onUp = (upEvent: MouseEvent) => {
      draggingAnchorRef.current = null;
      const rect = nodeEl?.getBoundingClientRect();
      if (rect) {
        const finalX = upEvent.clientX - rect.left;
        const finalY = upEvent.clientY - rect.top;
        setAnchors(prev => {
          const updated = prev.map((a, i) => i === idx ? { x: finalX, y: finalY } : a);
          setFlowNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, anchors: updated } } : n));
          return updated;
        });
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [id, setFlowNodes]);

  // 双击进入锚点编辑模式
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFlowNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, anchorEditMode: true, anchors } } : n));
  }, [anchors, id, setFlowNodes]);

  // 右键弹出参数菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setMenuFill(fill); setMenuStroke(stroke);
    setMenuStrokeW(String(strokeW)); setMenuOpacity(String(Math.round(opacity * 100)));
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [fill, stroke, strokeW, opacity]);

  // 根据锚点计算圆形路径（用四个控制点拟合横纵半径）
  const buildCirclePath = (pts: { x: number; y: number }[]) => {
    // 上下点确定垂直半径，左右点确定水平半径
    const top = pts[0] ?? { x: w/2, y: 0 };
    const right = pts[1] ?? { x: w, y: h/2 };
    const bottom = pts[2] ?? { x: w/2, y: h };
    const left = pts[3] ?? { x: 0, y: h/2 };
    const cx = (left.x + right.x) / 2;
    const cy = (top.y + bottom.y) / 2;
    const rx = Math.abs(right.x - left.x) / 2;
    const ry = Math.abs(bottom.y - top.y) / 2;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  };

  const buildPath = (pts: { x: number; y: number }[]) => {
    if (shapeType === "circle") return buildCirclePath(pts);
    if (shapeType === "line") return `M ${pts[0]?.x ?? 0} ${pts[0]?.y ?? h/2} L ${pts[1]?.x ?? w} ${pts[1]?.y ?? h/2}`;
    if (shapeType === "arrow") {
      const x1 = pts[0]?.x ?? 0; const y1 = pts[0]?.y ?? h/2;
      const x2 = pts[1]?.x ?? w; const y2 = pts[1]?.y ?? h/2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const hl = 12; const ha = 0.4;
      return `M ${x1} ${y1} L ${x2} ${y2} M ${x2 - hl*Math.cos(angle-ha)} ${y2 - hl*Math.sin(angle-ha)} L ${x2} ${y2} L ${x2 - hl*Math.cos(angle+ha)} ${y2 - hl*Math.sin(angle+ha)}`;
    }
    if (pts.length < 2) return "";
    return pts.map((a, i) => `${i === 0 ? "M" : "L"} ${a.x} ${a.y}`).join(" ") + " Z";
  };

  const borderColor = selected ? "oklch(0.65 0.22 290)" : "transparent";
  const isLine = shapeType === "line" || shapeType === "arrow";

  return (
    <div
      style={{ width: w, height: h, position: "relative", outline: `2px solid ${borderColor}`, outlineOffset: 3, cursor: isEditMode ? "crosshair" : "default" }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* SVG 固定在节点左上角，坐标系与锚点 div 一致，超出范围用 overflow:visible 显示 */}
      <svg
        width={w} height={h}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity, pointerEvents: "none" }}
        viewBox={`0 0 ${w} ${h}`}
      >
        <path
          d={buildPath(anchors)}
          fill={isLine ? "none" : fill}
          stroke={isLine ? (stroke === "none" ? fill : stroke) : (stroke === "none" ? "none" : stroke)}
          strokeWidth={isLine ? Math.max(strokeW || 0, 2) : strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {isEditMode && anchors.map((a, idx) => (
        <div
          key={idx}
          className="nodrag"
          style={{
            position: "absolute",
            left: a.x - 5, top: a.y - 5,
            width: 10, height: 10,
            borderRadius: "50%",
            background: "white",
            border: "2px solid oklch(0.65 0.22 290)",
            cursor: "move",
            zIndex: 20,
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
          onMouseDown={e => handleAnchorMouseDown(e, idx)}
        />
      ))}
      {isEditMode && (
        <div style={{ position: "absolute", top: -24, left: 0, fontSize: 10, color: "oklch(0.65 0.22 290)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          锚点编辑模式 · 单击空白退出
        </div>
      )}
      {/* 右键参数菜单 */}
      {ctxMenu && (
        <div
          className="shape-ctx-menu"
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y,
            zIndex: 20000, background: isDark ? "#1e1e24" : "#fff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
            borderRadius: 10, padding: "14px 16px", minWidth: 220,
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            color: isDark ? "#e8e8f0" : "#1a1a2e", fontSize: 12,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>图形参数</p>
          {/* 填充色 */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ opacity: 0.6, marginBottom: 4 }}>填充色</p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={menuFill.startsWith("#") ? menuFill : "#6366f1"}
                onChange={e => setMenuFill(e.target.value)}
                style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer", borderRadius: 4, background: "transparent" }} />
              <input type="text" value={menuFill}
                onChange={e => setMenuFill(e.target.value)}
                style={{ flex: 1, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11, fontFamily: "monospace" }} />
            </div>
          </div>
          {/* 描边色 */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ opacity: 0.6, marginBottom: 4 }}>描边色</p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={menuStroke.startsWith("#") ? menuStroke : "#000000"}
                onChange={e => setMenuStroke(e.target.value)}
                style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer", borderRadius: 4, background: "transparent" }} />
              <input type="text" value={menuStroke}
                onChange={e => setMenuStroke(e.target.value)}
                style={{ flex: 1, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11, fontFamily: "monospace" }} />
            </div>
          </div>
          {/* 描边宽度 + 不透明度 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ opacity: 0.6, marginBottom: 4 }}>描边宽度</p>
              <input type="number" min={0} value={menuStrokeW} onChange={e => setMenuStrokeW(e.target.value)}
                style={{ width: "100%", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11 }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ opacity: 0.6, marginBottom: 4 }}>不透明度 %</p>
              <input type="number" min={0} max={100} value={menuOpacity} onChange={e => setMenuOpacity(e.target.value)}
                style={{ width: "100%", background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applyParams}
              style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: "oklch(0.55 0.22 290)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
              应用
            </button>
            <button onClick={closeCtxMenu}
              style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 }}>
              取消
            </button>
          </div>
        </div>
      )}
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    </div>
  );
}

// ── Node types & edge types ────────────────────────────────────────────
const nodeTypes: NodeTypes = {
  asset: AssetNodeComponent as unknown as NodeTypes["asset"],
  canvasFrame: CanvasFrameNode as unknown as NodeTypes["canvasFrame"],
  shape: ShapeNodeComponent as unknown as NodeTypes["shape"],
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
    { icon: <Boxes size={13} />, label: "打组", action: "group", color: iconColor },
    { icon: <LayoutGrid size={13} />, label: "自动排列", action: "auto-layout", color: iconColor },
    { icon: <AlignHorizontalSpaceAround size={13} />, label: "横向排列", action: "layout-horizontal", color: iconColor },
    { icon: <AlignVerticalSpaceAround size={13} />, label: "竖向排列", action: "layout-vertical", color: iconColor },
    { icon: <Type size={13} />, label: "添加文本备注", action: "add-note", color: iconColor },
    { icon: <Trash2 size={13} />, label: "删除节点", action: "delete", color: dangerColor },
  ];

  // Single node menu: NO 解散打组 (removed per spec)
  const singleItems = [
    { icon: <Wand2 size={13} />, label: "智能优化", action: "edit-asset", color: iconColor },
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
      toast("AI 正在智能优化", { description: prompt.slice(0, 60) });
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
        <span className="type-caption" style={{ color: subtext }}>智能优化此图片</span>
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
          placeholder="描述你希望如何优化这张图片，例如：更换背景为星空、加强光效、调整配色、提升画质..."
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
  const [active, setActive] = useState("move");
  const [shapeOpen, setShapeOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 点击画布空白处时关闭几何形子菜单
  useEffect(() => {
    const handler = () => setShapeOpen(false);
    window.addEventListener("pane-click", handler);
    return () => window.removeEventListener("pane-click", handler);
  }, []);

  // 同步外部工具模式变化（如 undo 后保持 smart-canvas 选中）
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<{ mode: string }>).detail?.mode;
      if (mode) setActive(mode);
    };
    window.addEventListener("tool-mode-change", handler);
    return () => window.removeEventListener("tool-mode-change", handler);
  }, []);

  const bg = isDark ? "rgba(22,22,30,0.82)" : "rgba(255,255,255,0.88)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(28,28,40,0.82)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const activeColor = "oklch(0.65 0.22 290)";
  const popBg = isDark ? "rgba(24,24,34,0.96)" : "rgba(255,255,255,0.96)";
  const tooltipBg = isDark ? "rgba(18,18,26,0.96)" : "rgba(30,30,40,0.92)";

  // 工具列表：仅保留 1-8
  const tools = [
    { id: "move",         label: "移动",       icon: <MousePointer2 size={17} /> },
    { id: "annotate",     label: "注释",       icon: <MessageCircle size={17} /> },
    { id: "upload",       label: "上传图片",   icon: <ImagePlus size={17} /> },
    { id: "smart-canvas", label: "创建画布",   icon: <CreateCanvasIcon size={17} /> },
    { id: "shape",        label: "几何形",     icon: <Triangle size={17} /> },
    { id: "draw",         label: "铅笔",       icon: <Pencil size={17} /> },
    { id: "text",         label: "文字",       icon: <Type size={17} /> },
    { id: "image-ai",     label: "智能生图",   icon: <Sparkles size={17} /> },
  ];

  // 几何形二级菜单
  const shapeItems = [
    { icon: <Triangle size={14} />,   label: "三角形", shapeType: "triangle" },
    { icon: <CircleDot size={14} />,  label: "圆形",   shapeType: "circle" },
    { icon: <Square size={14} />,     label: "正方形", shapeType: "square" },
    { icon: <Star size={14} />,       label: "五角星", shapeType: "star" },
    { icon: <MinusIcon size={14} />,  label: "线段",   shapeType: "line" },
    { icon: <ArrowRight size={14} />, label: "箭头",   shapeType: "arrow" },
  ];

  const handleToolClick = (id: string) => {
    if (id === "shape") {
      setShapeOpen(v => !v);
      setActive(id);
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: id } }));
      return;
    }
    setShapeOpen(false);
    setActive(id);
    // 向 InnerCanvas 广播工具模式变化
    window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: id } }));
    toast(
      tools.find(t => t.id === id)?.label ?? "",
      { description: id === "upload" ? "点击选择图片文件" : "工具已切换" }
    );
  };

  return (
    <div
      className="fixed nodrag nopan"
      style={{ top: 68, left: 511, zIndex: 1300, width: 320 }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* 几何形二级菜单 */}
      {shapeOpen && (
        <div
          className="absolute top-full mt-2 rounded-[var(--radius-lg-design)] p-2 shadow-2xl"
          style={{
            background: popBg,
            border: `1px solid ${border}`,
            backdropFilter: "blur(18px)",
            minWidth: 152,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <p className="px-3 pb-1 pt-0.5" style={{ color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)", fontSize: 10, letterSpacing: "0.04em" }}>基础几何形</p>
          {shapeItems.map(item => (
            <button
              key={item.label}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md-design)] px-3 py-2 type-caption text-left transition-colors"
              style={{ color: textColor }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("shape-select", { detail: { shapeType: item.shapeType, label: item.label } }));
                setShapeOpen(false);
              }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 主工具栏 */}
      <div
        className="flex items-center justify-between rounded-[var(--radius-lg-design)] px-2 py-1 shadow-lg"
        style={{ background: bg, border: `1px solid ${border}`, backdropFilter: "blur(18px)" }}
      >
        {tools.map(tool => (
          <div key={tool.id} className="relative">
            {/* Hover tooltip — 显示在图标下方 */}
            {hoveredId === tool.id && (
              <div
                className="absolute top-full mt-2 left-1/2 pointer-events-none"
                style={{
                  transform: "translateX(-50%)",
                  background: tooltipBg,
                  color: "rgba(255,255,255,0.92)",
                  borderRadius: 6,
                  padding: "4px 9px",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
                  zIndex: 10,
                }}
              >
                {/* 小三角朝上 */}
                <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: `4px solid ${tooltipBg}` }} />
                {tool.label}
              </div>
            )}
            <button
              aria-label={tool.label}
              className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-95"
              style={{
                color: active === tool.id ? activeColor : textColor,
                background: active === tool.id ? activeBg : "transparent",
              }}
              onClick={() => handleToolClick(tool.id)}
              onMouseEnter={() => setHoveredId(tool.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {tool.icon}
            </button>
          </div>
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
    "选择图片节点后，可在左侧画布直接进行智能优化。",
    "右键图片节点可以快速执行智能优化、复制、粘贴、打组、添加文本备注和删除节点。当前布局已按参考图改为左侧大画布、右侧助手区、底部浮动工具区。",
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
  // 始终跟踪最新的 nodes/edges，供 pushHistory 读取（避免闭包捕获旧值）
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
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
  // ── Download dialog state ──
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadGroupId, setDownloadGroupId] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<'jpg' | 'png' | 'webp'>('png');
  const containerRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ clientX: number; clientY: number; viewport: { x: number; y: number; zoom: number } } | null>(null);
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const MAX_HISTORY_STEPS = 50;
  const isRestoringRef = useRef(false); // undo 过程中屏蔽副作用
  // ── Local file drag-drop state ──
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragCounterRef = useRef(0);
  // ── Alt + drag 复制状态 ──
  // key: nodeId, value: { x, y } 记录按下 Alt 时节点的原始位置
  const altDragOriginRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isAltDragRef = useRef(false);
  // ── 工具模式 ──
  const [activeToolMode, setActiveToolMode] = useState<string>("move");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ── 创建画布工具：拖拽绘制矩形状态 ──
  type DrawRect = { startX: number; startY: number; endX: number; endY: number };
  const [drawingRect, setDrawingRect] = useState<DrawRect | null>(null);
  const [pendingRect, setPendingRect] = useState<DrawRect | null>(null); // 松开鼠标后待确认
  const [canvasInputW, setCanvasInputW] = useState("");
  const [canvasInputH, setCanvasInputH] = useState("");
  const [canvasBgColor, setCanvasBgColor] = useState("#2a2a30"); // 默认深灰色
  const [presetOpen, setPresetOpen] = useState(false); // 预设尺寸下拉展开状态
  // 色彩选择器的 DOM ref（必须在组件顶层声明，不能在 IIFE 内）
  const colorSbRef = useRef<HTMLDivElement>(null);
  const colorHueRef = useRef<HTMLDivElement>(null);
  // 始终跟踪最新的 HSV 分量，供拖拽回调中读取（避免闭包捕获旧值）
  const colorHsvRef = useRef<[number, number, number]>([0, 0, 0]);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  // ── 几何形创建弹窗状态 ──
  const [shapeDialog, setShapeDialog] = useState<{ type: string; label: string } | null>(null);
  const [shapeW, setShapeW] = useState("120");
  const [shapeH, setShapeH] = useState("120");
  const [shapeFill, setShapeFill] = useState("#6366f1");
  const [shapeStroke, setShapeStroke] = useState("none");
  const [shapeStrokeW, setShapeStrokeW] = useState("0");
  const [shapeOpacity, setShapeOpacity] = useState("100");
  const [shapeCornerRadius, setShapeCornerRadius] = useState("0");

  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<{ mode: string }>).detail?.mode;
      if (!mode) return;
      setActiveToolMode(mode);
      // 切换工具时清除绘制状态
      if (mode !== "smart-canvas") {
        setDrawingRect(null);
        setPendingRect(null);
        isDrawingRef.current = false;
        drawStartRef.current = null;
      }
    };
    window.addEventListener("tool-mode-change", handler);
    return () => window.removeEventListener("tool-mode-change", handler);
  }, []);

  // 监听几何形选择事件 → 进入拖拽创建模式（不再弹窗）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ shapeType: string; label: string }>).detail;
      if (!detail?.shapeType) return;
      // 设置当前几何形类型，进入拖拽模式
      setActiveToolMode(`shape-draw:${detail.shapeType}`);
      setShapeDialog(null); // 确保弹窗不显示
    };
    window.addEventListener("shape-select", handler);
    return () => window.removeEventListener("shape-select", handler);
  }, []);

  // ── 全局注释状态（注释气泡在画布最顶层渲染） ──
  // GlobalAnnotation 在 Annotation 基础上增加 nodeId 和节点内百分比坐标
  const [globalAnnotations, setGlobalAnnotations] = useState<(Annotation & { nodeId: string })[]>([]);
  // 监听节点发出的创建注释事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ annotation: Annotation & { nodeId: string } }>).detail;
      if (detail?.annotation) {
        setGlobalAnnotations(prev => [...prev, detail.annotation]);
      }
    };
    window.addEventListener("annotation-create", handler);
    return () => window.removeEventListener("annotation-create", handler);
  }, []);

  const updateGlobalAnnotation = useCallback((id: string, patch: Partial<Annotation>) => {
    setGlobalAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }, []);

  const removeGlobalAnnotation = useCallback((id: string) => {
    setGlobalAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);

  const cloneNodesForHistory = useCallback((items: Node[]) => items.map(node => ({
    ...node,
    position: { ...node.position },
    data: { ...(node.data as Record<string, unknown>) },
  })), []);

  const cloneEdgesForHistory = useCallback((items: Edge[]) => items.map(edge => ({
    ...edge,
    data: edge.data ? { ...(edge.data as Record<string, unknown>) } : edge.data,
  })), []);

  // pushHistory: 可传入明确快照，也可不传参数（自动从 ref 读取当前状态）
  const pushHistory = useCallback((snapshotNodes?: Node[], snapshotEdges?: Edge[]) => {
    if (isRestoringRef.current) return; // undo 过程中不入栈
    const ns = snapshotNodes ?? nodesRef.current;
    const es = snapshotEdges ?? edgesRef.current;
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY_STEPS - 1)),
      { nodes: cloneNodesForHistory(ns), edges: cloneEdgesForHistory(es) },
    ];
  }, [cloneEdgesForHistory, cloneNodesForHistory]);

  const undoCanvas = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) {
      toast("暂无可回退的画布操作");
      return;
    }
    // 屏蔽副作用，防止 undo 期间被事件监听器覆写状态
    isRestoringRef.current = true;
    setNodes(cloneNodesForHistory(previous.nodes));
    setEdges(cloneEdgesForHistory(previous.edges));
    setSelectedNodeIds(previous.nodes.filter(n => n.selected).map(n => n.id));
    setNodeCtxMenu(null);
    // 如果当前工具是「创建画布」，保持工具不变，用户可直接继续拖拽
    // （activeToolMode 通过闭包读取，无需额外处理）
    // 用双帧 rAF 确保 ReactFlow 内部的所有 onNodesChange 均在屏蔽窗口内完成
    requestAnimationFrame(() => requestAnimationFrame(() => { isRestoringRef.current = false; }));
    toast("已回退一步", { description: `还可回退 ${historyRef.current.length} 步` });
  }, [cloneEdgesForHistory, cloneNodesForHistory, setEdges, setNodes]);

  // ── 监听画布帧节点的拖拽调整尺寸事件 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; width: number; height: number }>).detail;
      if (!detail?.id || isRestoringRef.current) return;
      // 尺寸调整前先入历史（传入当前快照）
      pushHistory(nodesRef.current, edgesRef.current);
      setNodes(nds => nds.map(n => {
        if (n.id !== detail.id || n.type !== "canvasFrame") return n;
        return {
          ...n,
          style: { ...n.style, width: detail.width, height: detail.height },
          data: { ...(n.data as Record<string, unknown>), width: detail.width, height: detail.height },
        };
      }));
    };
    window.addEventListener("canvas-frame-resize", handler);
    return () => window.removeEventListener("canvas-frame-resize", handler);
  }, [pushHistory, setNodes]);

  // 监听图片节点缩放结束事件，将操作纳入历史记录
  useEffect(() => {
    const handler = (e: Event) => {
      if (isRestoringRef.current) return;
      const detail = (e as CustomEvent<{ nodeId: string; newW: number; newH: number }>).detail;
      if (!detail?.nodeId) return;
      // 屏蔽 handleNodesChangeWithHistory 的干扰，防止它在 setNodes 触发的 onNodesChange 中再次压入历史
      isRestoringRef.current = true;
      setNodes(nds => {
        // 在 updater 内保存操作前快照（nds 是 React 保证的当前真实状态）
        pushHistory(nds, edgesRef.current);
        return nds.map(n =>
          n.id === detail.nodeId
            ? { ...n, data: { ...n.data, imgW: detail.newW, imgH: detail.newH } }
            : n
        );
      });
      // 双帧 rAF 后解除屏蔽，确保 ReactFlow 内部所有 onNodesChange 均在屏蔽窗口内完成
      requestAnimationFrame(() => requestAnimationFrame(() => { isRestoringRef.current = false; }));
    };
    window.addEventListener("asset-resize-end", handler);
    return () => window.removeEventListener("asset-resize-end", handler);
  }, [pushHistory, setNodes, edgesRef]);

  // 处理文件选择后将图片添加到画布
  // 记录上传模式下用户点击的画布坐标
  const uploadClickPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleUploadFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) { toast("请选择图片文件（JPG / PNG / GIF / WebP）"); return; }
    pushHistory();
    // 优先使用点击坐标，如果没有则用画布中心
    const rect = containerRef.current?.getBoundingClientRect();
    const baseScreenX = uploadClickPosRef.current
      ? uploadClickPosRef.current.x
      : (rect?.left || 0) + (containerRef.current?.clientWidth || 800) / 2;
    const baseScreenY = uploadClickPosRef.current
      ? uploadClickPosRef.current.y
      : (rect?.top || 0) + (containerRef.current?.clientHeight || 600) / 2;
    uploadClickPosRef.current = null;
    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        const img = new window.Image();
        img.onload = () => {
          const offsetX = (index - (imageFiles.length - 1) / 2) * 40;
          const offsetY = (index - (imageFiles.length - 1) / 2) * 40;
          const flowPos = screenToFlowPosition({
            x: baseScreenX + offsetX,
            y: baseScreenY + offsetY,
          });
          const id = `upload-${Date.now()}-${index}`;
          const maxSide = 360;
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 360, img.naturalHeight || 360));
          const nodeWidth = Math.max(180, Math.round((img.naturalWidth || 360) * scale));
          setNodes(nds => [...nds, {
            id,
            type: "asset",
            position: { x: flowPos.x - nodeWidth / 2, y: flowPos.y - 100 },
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
    toast(`已上传 ${imageFiles.length} 张图片`, { description: "图片已成功添加到画布" });
    window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }, [pushHistory, screenToFlowPosition, setNodes]);

  // ── 节点拖拽中标记，避免拖拽过程中每帧都写入历史 ──
  const isDraggingRef = useRef(false);

  const handleNodesChangeWithHistory = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    // undo 恢复过程中不入历史，防止 undo 被 onNodesChange 立即覆写
    if (!isRestoringRef.current) {
      const hasNonDragChange = changes.some(change =>
        change.type !== "select" &&
        !(change.type === "position" && isDraggingRef.current)
      );
      if (hasNonDragChange) pushHistory();
    }
    onNodesChange(changes);
  }, [onNodesChange, pushHistory]);

  const handleEdgesChangeWithHistory = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    if (!isRestoringRef.current && changes.some(change => change.type !== "select")) pushHistory();
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

    } else if (action === "layout-horizontal") {
      // 横向排列：所有选中图片节点从左到右排成一行，顶部对齐到各自中心线
      const selectedAssetIds = actionIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
      if (selectedAssetIds.length < 2) { toast("请至少选择 2 个图片节点再排列"); return; }
      pushHistory();
      const selected = selectedAssetIds.map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node[];
      const selectedBounds = getCanvasNodesBounds(selected, selectedAssetIds);
      if (!selectedBounds) return;
      const gap = 40;
      const sizes = selected.map(getCanvasNodeSize);
      const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0) + gap * (selected.length - 1);
      let curX = selectedBounds.centerX - totalWidth / 2;
      const centerY = selectedBounds.centerY;
      const positions = selected.map((node, i) => {
        const s = sizes[i];
        const pos = { x: curX, y: centerY - s.height / 2 };
        curX += s.width + gap;
        return { id: node.id, position: pos };
      });
      const posMap = new Map(positions.map(p => [p.id, p.position]));
      setNodes(nds => nds.map(n => selectedAssetIds.includes(n.id) ? { ...n, position: posMap.get(n.id) || n.position, selected: true } : n));
      setSelectedNodeIds(selectedAssetIds);
      toast("已完成横向排列", { description: `${selectedAssetIds.length} 个图片节点已从左到右排列，垂直居中对齐，总宽 ${Math.round(totalWidth)}px` });

    } else if (action === "layout-vertical") {
      // 竖向排列：所有选中图片节点从上到下排成一列，左边对齐到各自中心线
      const selectedAssetIds = actionIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"));
      if (selectedAssetIds.length < 2) { toast("请至少选择 2 个图片节点再排列"); return; }
      pushHistory();
      const selected = selectedAssetIds.map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node[];
      const selectedBounds = getCanvasNodesBounds(selected, selectedAssetIds);
      if (!selectedBounds) return;
      const gap = 40;
      const sizes = selected.map(getCanvasNodeSize);
      const totalHeight = sizes.reduce((sum, s) => sum + s.height, 0) + gap * (selected.length - 1);
      let curY = selectedBounds.centerY - totalHeight / 2;
      const centerX = selectedBounds.centerX;
      const positions = selected.map((node, i) => {
        const s = sizes[i];
        const pos = { x: centerX - s.width / 2, y: curY };
        curY += s.height + gap;
        return { id: node.id, position: pos };
      });
      const posMap = new Map(positions.map(p => [p.id, p.position]));
      setNodes(nds => nds.map(n => selectedAssetIds.includes(n.id) ? { ...n, position: posMap.get(n.id) || n.position, selected: true } : n));
      setSelectedNodeIds(selectedAssetIds);
      toast("已完成竖向排列", { description: `${selectedAssetIds.length} 个图片节点已从上到下排列，水平居中对齐，总高 ${Math.round(totalHeight)}px` });

    } else if (action === "download") {
      const selectedAssetNodes = nodes.filter(n => actionIds.includes(n.id) && n.type === "asset");
      if (selectedAssetNodes.length === 0) { toast("没有可下载的图片节点"); return; }
      if (selectedAssetNodes.length === 1) {
        // 单张直接下载
        const node = selectedAssetNodes[0];
        const data = node.data as Record<string, unknown>;
        const title = (data.title as string) || "artx-image";
        const src = getNodeImageSrc(node);
        if (!src) { toast("该节点没有可下载的图片"); return; }
        setDownloadGroupId(null);
        setDownloadFormat('png');
        setDownloadDialogOpen(true);
        // 存储单张下载信息到 window 临时存储
        (window as unknown as Record<string, unknown>).__artx_single_download__ = { title, src, node };
      } else {
        // 多张直接弹出格式选择对话框打包下载
        setDownloadGroupId("__selection__");
        setDownloadFormat('png');
        setDownloadDialogOpen(true);
        (window as unknown as Record<string, unknown>).__artx_download_nodes__ = selectedAssetNodes;
      }
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
        const nodeData = node.data as Record<string, unknown>;
        const localSrc = nodeData.localSrc as string | undefined;
        const assetId = nodeData.assetId as string;
        const nodeTitle = (nodeData.title as string) || "图片";
        const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
        // 优先使用本地拖入的图片，否则使用预设素材图
        const src = localSrc || asset?.src || "";
        const title = nodeTitle || asset?.title || "图片";
        setIsZoomingToEdit(true);
        // 平滑缩放至当前选中节点
        fitView({ nodes: [{ id: nodeId }], duration: 900, padding: 0.08 });
        // 动画结束后显示智能优化输入框，仅针对当前节点
        setTimeout(() => {
          setEditAsset({ id: nodeId, title, src, nodeId });
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
  // 双击进入打组已禁用，保留回调以兼容组件接口
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleGroupContainerDoubleClick = useCallback((_groupId: string) => {
    // no-op: double-click to enter group is intentionally disabled
  }, []);

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

  // ── Click blank canvas → exit group if inside one, also close smart-optimize bar ──
  const handlePaneClick = useCallback((e: React.MouseEvent) => {
    setNodeCtxMenu(null);
    // 通知注释气泡折叠
    window.dispatchEvent(new CustomEvent("pane-click"));
    // 退出所有几何形的锚点编辑模式
    setNodes(nds => nds.map(n =>
      n.type === "shape" && n.data?.anchorEditMode
        ? { ...n, data: { ...n.data, anchorEditMode: false } }
        : n
    ));
    // 创建画布模式：点击不触发 paneClick 的其他逻辑
    if (activeToolMode === "smart-canvas") return;
    // 点击画布空白处关闭智能优化输入框
    if (editAsset) {
      setEditAsset(null);
      setNodes(nds => nds.map(n =>
        n.type === "asset" && n.id === editAsset.nodeId
          ? { ...n, data: { ...n.data, isEditing: false } }
          : n
      ));
    }
    if (enteringGroupId) {
      setEnteringGroupId(null);
      setSelectedNodeIds([]);
      toast("已退出打组");
    }
    // 上传模式：记录点击坐标并弹出文件选择框
    if (activeToolMode === "upload") {
      uploadClickPosRef.current = { x: e.clientX, y: e.clientY };
      uploadInputRef.current?.click();
    }
  }, [activeToolMode, editAsset, enteringGroupId, setNodes]);

  // ── 创建画布：鼠标事件处理 ──
  const handleCreateCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const isCanvas = activeToolMode === "smart-canvas";
    const isShape = activeToolMode.startsWith("shape-draw:");
    if (!isCanvas && !isShape) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    isDrawingRef.current = true;
    drawStartRef.current = { x, y };
    setDrawingRect({ startX: x, startY: y, endX: x, endY: y });
    setPendingRect(null);
  }, [activeToolMode]);

  const handleCreateCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawingRef.current || !drawStartRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawingRect({ startX: drawStartRef.current.x, startY: drawStartRef.current.y, endX: x, endY: y });
  }, []);

  const handleCreateCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDrawingRef.current || !drawStartRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dr = { startX: drawStartRef.current.x, startY: drawStartRef.current.y, endX: x, endY: y };
    const rawW = Math.abs(dr.endX - dr.startX);
    const rawH = Math.abs(dr.endY - dr.startY);
    isDrawingRef.current = false;
    drawStartRef.current = null;
    setDrawingRect(null);
    if (rawW < 8 || rawH < 8) return; // 太小，忽略

    // 几何形拖拽创建：直接创建节点，不弹窗
    if (activeToolMode.startsWith("shape-draw:")) {
      const shapeType = activeToolMode.replace("shape-draw:", "");
      const minX = Math.min(dr.startX, dr.endX);
      const minY = Math.min(dr.startY, dr.endY);
      const fw = rawW / viewport.zoom;
      const fh = rawH / viewport.zoom;
      const flowPos = screenToFlowPosition({
        x: (rect.left) + minX,
        y: (rect.top) + minY,
      });
      const nodeId = `shape-${Date.now()}`;
      // 计算初始锚点
      const getInitAnchors = (type: string, w: number, h: number) => {
        if (type === "triangle") return [{ x: w/2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
        if (type === "circle") return [{ x: w/2, y: 0 }, { x: w, y: h/2 }, { x: w/2, y: h }, { x: 0, y: h/2 }];
        if (type === "star") {
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            const r = i % 2 === 0 ? Math.min(w, h) / 2 : Math.min(w, h) / 4;
            pts.push({ x: w/2 + r * Math.cos(angle), y: h/2 + r * Math.sin(angle) });
          }
          return pts;
        }
        if (type === "line" || type === "arrow") return [{ x: 0, y: h/2 }, { x: w, y: h/2 }];
        return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
      };
      setNodes(nds => {
        pushHistory(nds, edgesRef.current);
        return [...nds, {
          id: nodeId,
          type: "shape",
          position: flowPos,
          style: { width: fw, height: fh },
          data: {
            id: nodeId,
            shapeType,
            width: fw,
            height: fh,
            fill: shapeFill,
            stroke: shapeStroke,
            strokeWidth: parseInt(shapeStrokeW) || 0,
            opacity: (parseInt(shapeOpacity) || 100) / 100,
            cornerRadius: parseInt(shapeCornerRadius) || 0,
            anchors: getInitAnchors(shapeType, fw, fh),
          },
        }];
      });
      return;
    }

    // 创建画布：显示弹窗
    setPendingRect(dr);
    setCanvasInputW(String(Math.round(rawW / viewport.zoom)));
    setCanvasInputH(String(Math.round(rawH / viewport.zoom)));
  }, [activeToolMode, edgesRef, pushHistory, screenToFlowPosition, setNodes, shapeFill, shapeOpacity, shapeStroke, shapeStrokeW, shapeCornerRadius, viewport.zoom]);

  const handleCreateCanvasConfirm = useCallback(() => {
    if (!pendingRect) return;
    const w = parseInt(canvasInputW) || 800;
    const h = parseInt(canvasInputH) || 600;
    const minX = Math.min(pendingRect.startX, pendingRect.endX);
    const minY = Math.min(pendingRect.startY, pendingRect.endY);
    // 将屏幕坐标转换为 flow 坐标
    const flowPos = screenToFlowPosition({ x: (containerRef.current?.getBoundingClientRect().left || 0) + minX, y: (containerRef.current?.getBoundingClientRect().top || 0) + minY });
    const id = `canvas-frame-${Date.now()}`;
    const bgColor = canvasBgColor;
    setNodes(nds => {
      // 在 updater 内调用，传入 prev 快照，确保记录的是添加节点前的真实状态
      pushHistory(nds, edgesRef.current);
      return [...nds, {
        id,
        type: "canvasFrame",
        position: flowPos,
        style: { width: w, height: h, background: bgColor },
        data: { id, title: "画布", width: w, height: h, bgColor },
      }];
    });
    setPendingRect(null);
    setCanvasInputW("");
    setCanvasInputH("");
    // 保持当前工具为「创建画布」，用户可继续拖拽创建新画布
    toast("画布已创建，可继续拖拽创建", { description: `${w} × ${h} px` });
  }, [canvasBgColor, canvasInputH, canvasInputW, pendingRect, pushHistory, screenToFlowPosition, setNodes]);

  const handleCreateCanvasCancel = useCallback(() => {
    setPendingRect(null);
    setCanvasInputW("");
    setCanvasInputH("");
  }, []);

  // ── 几何形创建确认/取消 ──
  const handleCreateShapeConfirm = useCallback(() => {
    if (!shapeDialog) return;
    const w = Math.max(1, parseInt(shapeW) || 120);
    const h = Math.max(1, parseInt(shapeH) || 120);
    const opacity = Math.min(1, Math.max(0, (parseInt(shapeOpacity) || 100) / 100));
    const strokeWidth = parseInt(shapeStrokeW) || 0;
    const cornerRadius = parseInt(shapeCornerRadius) || 0;
    // 将屏幕中心坐标转换为画布坐标
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const flowPos = screenToFlowPosition({ x: cx - w / 2, y: cy - h / 2 });
    const id = `shape-${Date.now()}`;
    setNodes(nds => {
      pushHistory(nds, edgesRef.current);
      return [...nds, {
        id,
        type: "shape",
        position: flowPos,
        style: { width: w, height: h },
        data: {
          id,
          shapeType: shapeDialog.type,
          width: w, height: h,
          fill: shapeFill,
          stroke: shapeStroke,
          strokeWidth,
          opacity,
          cornerRadius,
        },
      }];
    });
    setShapeDialog(null);
    toast(`已创建${shapeDialog.label}`, { description: `${w} × ${h} px` });
  }, [containerRef, edgesRef, pushHistory, screenToFlowPosition, setNodes, shapeCornerRadius, shapeDialog, shapeFill, shapeH, shapeOpacity, shapeStroke, shapeStrokeW, shapeW]);

  const handleCreateShapeCancel = useCallback(() => {
    setShapeDialog(null);
  }, []);

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

  // ── 获取节点的图片源 (localSrc 优先，其次 GENERATED_ASSETS) ──
  const getNodeImageSrc = useCallback((node: Node): string => {
    const data = node.data as Record<string, unknown>;
    if (data.localSrc) return data.localSrc as string;
    const assetId = data.assetId as string;
    const asset = GENERATED_ASSETS.find(a => a.id === assetId);
    return asset?.src || "";
  }, []);

  // ── 批量下载实现：将多个图片打包成 ZIP ──
  const handleBatchDownload = useCallback(async (
    targetNodes: Node[],
    format: 'jpg' | 'png' | 'webp',
    zipName = 'artx-images'
  ) => {
    const assetNodes = targetNodes.filter(n => n.type === "asset");
    if (assetNodes.length === 0) { toast("没有可下载的图片节点"); return; }

    const toastId = toast.loading(`正在打包 ${assetNodes.length} 张图片...`);

    try {
      const zip = new JSZip();
      const mimeType = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const ext = format;

      await Promise.all(assetNodes.map(async (node, index) => {
        const data = node.data as Record<string, unknown>;
        const title = (data.title as string) || `image-${index + 1}`;
        const src = getNodeImageSrc(node);
        if (!src) return;

        // 将图片转换为目标格式的 Blob
        const blob = await new Promise<Blob | null>((resolve) => {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || 800;
            canvas.height = img.naturalHeight || 600;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(null); return; }
            if (format === 'jpg') {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(b => resolve(b), mimeType, format === 'jpg' ? 0.92 : undefined);
          };
          img.onerror = () => {
            // 跨域图片失败时，尝试直接 fetch
            fetch(src)
              .then(r => r.blob())
              .then(b => resolve(b))
              .catch(() => resolve(null));
          };
          img.src = src;
        });

        if (blob) {
          // 清洁文件名，去除非法字符
          const safeName = title.replace(/[/\\:*?"<>|]/g, "_");
          zip.file(`${safeName}.${ext}`, blob);
        }
      }));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${zipName}.zip`);
      toast.dismiss(toastId);
      toast("下载完成", { description: `已将 ${assetNodes.length} 张图片打包为 ${zipName}.zip` });
    } catch (err) {
      toast.dismiss(toastId);
      toast("下载失败", { description: "请检查网络连接后重试" });
      console.error("[BatchDownload]", err);
    }
  }, [getNodeImageSrc]);

  // ── Alt + drag 复制节点 ──
  // 拖拽开始时：若按下 Alt，记录被拖节点的原始位置
  const handleAltDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    // 拖拽开始：记录历史
    pushHistory();
    isDraggingRef.current = true;

    if (!(_event.altKey)) {
      isAltDragRef.current = false;
      altDragOriginRef.current.clear();
      return;
    }
    isAltDragRef.current = true;

    // 确定需要复制的节点 id 列表
    const dragIds = selectedNodeIds.includes(node.id)
      ? selectedNodeIds.filter(id => nodes.some(n => n.id === id && n.type === "asset"))
      : (node.type === "asset" ? [node.id] : []);

    altDragOriginRef.current.clear();
    dragIds.forEach(id => {
      const n = nodes.find(nd => nd.id === id);
      if (n) altDragOriginRef.current.set(id, { x: n.position.x, y: n.position.y });
    });

    // 立即在原位插入幽灵占位节点（draggable=false，不跟随鼠标）
    // 幽灵节点插入到列表最前面（渲染在最底层），被拖动的原节点在上层
    // 用户看到的效果：副本从原图背后拖出
    setNodes(nds => {
      const ghosts: Node[] = [];
      dragIds.forEach(id => {
        const orig = nds.find(n => n.id === id);
        if (!orig) return;
        ghosts.push({
          ...orig,
          id: `__ghost__${id}`,
          draggable: false,
          selectable: false,
          zIndex: -1,
          data: { ...(orig.data as Record<string, unknown>), __isGhost: true },
        });
      });
      // 幽灵节点放在数组开头（渲染层最低），被拖动节点在其上方
      return [...ghosts, ...nds];
    });
  }, [nodes, pushHistory, selectedNodeIds, setNodes]);

  // 拖拽结束时：若是 Alt 拖拽，将幽灵节点升级为正式原图（留在原位），被拖动的节点保持在落点成为副本
  // ── 检测图片节点是否拖入画布帧，若是则嵌入 ──
  const checkAndEmbedIntoFrame = useCallback((draggedNode: Node, allNodes: Node[]) => {
    if (draggedNode.type !== "asset") return null;
    const nodePos = draggedNode.position;
    // 找到鼠标中心点所在的 canvasFrame 节点
    const nodeData = draggedNode.data as Record<string, unknown>;
    const nW = (nodeData.imgW as number) || 200;
    const nH = (nodeData.imgH as number) || 200;
    const centerX = nodePos.x + nW / 2;
    const centerY = nodePos.y + nH / 2;
    const frame = allNodes.find(n => {
      if (n.type !== "canvasFrame") return false;
      const fd = n.data as Record<string, unknown>;
      const fw = (fd.width as number) || 800;
      const fh = (fd.height as number) || 600;
      return (
        centerX >= n.position.x &&
        centerX <= n.position.x + fw &&
        centerY >= n.position.y &&
        centerY <= n.position.y + fh
      );
    });
    return frame || null;
  }, []);

  const handleAltDragStop = useCallback((_event: MouseEvent, _node: Node) => {
    isDraggingRef.current = false;
    if (!isAltDragRef.current) return;
    isAltDragRef.current = false;
    const origins = altDragOriginRef.current;
    if (origins.size === 0) return;
    altDragOriginRef.current = new Map();

    setNodes(nds => {
      // 分离幽灵节点和普通节点
      const ghostMap = new Map<string, Node>();
      const normalNodes: Node[] = [];
      nds.forEach(n => {
        const nid = (n.id as string);
        if (nid.startsWith("__ghost__")) {
          ghostMap.set(nid.replace("__ghost__", ""), n);
        } else {
          normalNodes.push(n);
        }
      });

      const result: Node[] = [];
      normalNodes.forEach(n => {
        const origin = origins.get(n.id);
        if (!origin) {
          // 不是被拖动的节点，直接保留
          result.push(n);
          return;
        }
        // 被拖动的节点现在在落点位置，它就是副本
        // 将幽灵节点作为原图（放回原始位置，正弸 draggable）
        const ghost = ghostMap.get(n.id);
        if (ghost) {
          result.push({
            ...ghost,
            id: n.id,                          // 恢复原始 id
            position: { x: origin.x, y: origin.y }, // 回到原始位置
            draggable: true,
            selectable: true,
            selected: false,
            data: {
              ...(ghost.data as Record<string, unknown>),
              __isGhost: undefined,
              id: n.id,
            },
          });
        } else {
          result.push({ ...n, position: { x: origin.x, y: origin.y }, selected: false });
        }
        // 被拖动的节点现在作为副本，放在落点位置
        const copyId = `${n.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        result.push({
          ...n,
          id: copyId,
          selected: true,
          data: {
            ...(n.data as Record<string, unknown>),
            id: copyId,
            isEditing: false,
          },
        });
      });

      return result;
    });

    const count = origins.size;
    toast(`已复制 ${count} 个图片节点`, { description: "原图保持不动，新副本在拖拽落点" });
  }, [setNodes]);

  // ── 普通拖拽结束：检测图片是否进入画布帧并嵌入 ──
  const handleNormalDragStop = useCallback((_event: MouseEvent, node: Node) => {
    isDraggingRef.current = false;
    if (node.type !== "asset") return;
    // 从最新的 nodesRef 中读取当前所有节点
    const allNodes = nodesRef.current;
    const draggedNode = allNodes.find(n => n.id === node.id);
    if (!draggedNode) return;
    const frame = checkAndEmbedIntoFrame(draggedNode, allNodes);
    if (!frame) return;
    // 嵌入：将图片位置转为相对于画布帧的坐标
    const relX = draggedNode.position.x - frame.position.x;
    const relY = draggedNode.position.y - frame.position.y;
    setNodes(nds => nds.map(n => {
      if (n.id !== node.id) return n;
      return {
        ...n,
        position: { x: relX, y: relY },
        data: { ...(n.data as Record<string, unknown>), embeddedInFrame: frame.id },
        zIndex: (frame.zIndex || 0) + 1,
        parentId: frame.id,
        extent: "parent" as const,
      };
    }));
    toast("图片已嵌入画布", { description: "图片将随画布一起移动" });
  }, [checkAndEmbedIntoFrame, nodesRef, setNodes]);

  // ── Handle group actions from context menu ──
  const handleGroupAction = useCallback((action: string) => {
    const groupId = (window as unknown as Record<string, unknown>).__artx_ctx_group_id__ as string | undefined;
    if (!groupId) return;
    if (action === "batch-download") {
      // 打开格式选择弹窗，让用户选择 ZIP 打包格式
      const groupNodes = nodes.filter(n => (n.data as Record<string, unknown>).groupId === groupId && n.type === "asset");
      if (groupNodes.length === 0) { toast("该打组没有图片节点"); return; }
      (window as unknown as Record<string, unknown>).__artx_download_nodes__ = groupNodes;
      setDownloadGroupId(groupId);
      setDownloadFormat('png');
      setDownloadDialogOpen(true);
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
      // 复制：Ctrl+C (Windows) / Cmd+C (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const toCopy = selectedNodeIds
          .map(id => nodes.find(n => n.id === id && n.type === "asset"))
          .filter(Boolean) as Node[];
        if (toCopy.length > 0) {
          e.preventDefault();
          setClipboard(toCopy);
          const isMac = navigator.platform.toUpperCase().includes("MAC") || navigator.userAgent.includes("Mac");
          toast(`已复制 ${toCopy.length} 个图片节点`, {
            description: isMac ? "按 ⌘V 粘贴到画布" : "按 Ctrl+V 粘贴到画布",
          });
        }
        return;
      }
      // 粘贴：Ctrl+V (Windows) / Cmd+V (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (clipboard.length > 0) {
          e.preventDefault();
          pushHistory();
          const now = Date.now();
          const pasted = clipboard.map((node, index) => ({
            ...node,
            id: `${node.type}-paste-${now}-${index}`,
            selected: true,
            position: { x: node.position.x + 24, y: node.position.y + 24 },
            data: {
              ...(node.data as Record<string, unknown>),
              id: `${node.type}-paste-${now}-${index}`,
              // 不继承打组，粘贴为独立节点
              groupId: undefined,
            },
          }));
          setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(pasted));
          setSelectedNodeIds(pasted.map(n => n.id));
          toast(`已粘贴 ${pasted.length} 个图片节点`, { description: "新节点已居中选中，可直接拖动定位" });
        } else {
          toast("剪贴板为空", { description: "请先选中图片节点再按 Ctrl/Cmd+C 复制" });
        }
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
  }, [nodes, clipboard, setClipboard, pushHistory, selectedNodeIds, setEdges, setNodes, undoCanvas]);

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
      style={{ height: "100%", cursor: activeToolMode === "smart-canvas" ? "crosshair" : undefined }}
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      onMouseDown={handleCreateCanvasMouseDown}
      onMouseMove={handleCreateCanvasMouseMove}
      onMouseUp={handleCreateCanvasMouseUp}
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
        onNodeDragStart={handleAltDragStart as any}
        onNodeDragStop={(event, node, nodes) => {
          handleAltDragStop(event as unknown as MouseEvent, node);
          handleNormalDragStop(event as unknown as MouseEvent, node);
        }}
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

      {/* 批量下载格式选择弹窗 */}
      {downloadDialogOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(10px)", zIndex: 6000 }}
          onMouseDown={() => setDownloadDialogOpen(false)}
        >
          <div
            className="w-[min(380px,calc(100vw-32px))] rounded-[var(--radius-lg-design)] overflow-hidden shadow-2xl"
            style={{
              background: isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)",
              border: `1px solid ${isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)"}`,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}` }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center"
                  style={{ background: "oklch(0.58 0.22 290 / 0.15)" }}>
                  <Download size={14} style={{ color: "oklch(0.72 0.18 290)" }} />
                </div>
                <span className="type-caption" style={{ color: isDark ? "oklch(0.85 0.008 270)" : "oklch(0.18 0.008 270)", fontWeight: 600 }}>
                  {(() => {
                    const dlNodes = (window as unknown as Record<string, unknown>).__artx_download_nodes__ as Node[] | undefined;
                    const singleDl = (window as unknown as Record<string, unknown>).__artx_single_download__ as { title: string } | undefined;
                    if (singleDl && !dlNodes) return `下载图片`;
                    const count = dlNodes?.length || 0;
                    return `批量下载 ${count} 张图片`;
                  })()}
                </span>
              </div>
              <button
                onClick={() => setDownloadDialogOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-md-design)] transition-all hover:opacity-70"
                style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* 格式选择 */}
            <div className="px-5 py-4">
              <p className="type-caption mb-3" style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)" }}>选择下载格式</p>
              <div className="flex gap-2">
                {(['png', 'jpg', 'webp'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setDownloadFormat(fmt)}
                    className="flex-1 py-2.5 rounded-[var(--radius-md-design)] type-caption font-medium transition-all"
                    style={{
                      background: downloadFormat === fmt
                        ? "oklch(0.58 0.22 290 / 0.18)"
                        : (isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 4%)"),
                      border: `1px solid ${downloadFormat === fmt ? "oklch(0.62 0.22 290 / 0.50)" : (isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)")}`,
                      color: downloadFormat === fmt
                        ? (isDark ? "oklch(0.82 0.18 290)" : "oklch(0.42 0.18 290)")
                        : (isDark ? "oklch(0.65 0.008 270)" : "oklch(0.45 0.008 270)"),
                    }}
                  >
                    .{fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="type-caption mt-2" style={{ color: isDark ? "oklch(0.42 0.01 270)" : "oklch(0.58 0.01 270)", fontSize: 11 }}>
                {downloadFormat === 'jpg' ? 'JPEG 有损压缩，文件较小' : downloadFormat === 'webp' ? 'WebP 现代格式，小且清晰' : 'PNG 无损压，支持透明背景'}
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setDownloadDialogOpen(false)}
                className="flex-1 py-2.5 rounded-[var(--radius-md-design)] type-caption transition-all hover:opacity-80"
                style={{
                  background: isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)",
                  border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)"}`,
                  color: isDark ? "oklch(0.60 0.01 270)" : "oklch(0.50 0.01 270)",
                }}
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setDownloadDialogOpen(false);
                  const dlNodes = (window as unknown as Record<string, unknown>).__artx_download_nodes__ as Node[] | undefined;
                  const singleDl = (window as unknown as Record<string, unknown>).__artx_single_download__ as { title: string; src: string } | undefined;

                  if (singleDl && !dlNodes) {
                    // 单张下载
                    const img = new window.Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      canvas.width = img.naturalWidth || 800;
                      canvas.height = img.naturalHeight || 600;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;
                      if (downloadFormat === 'jpg') { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
                      ctx.drawImage(img, 0, 0);
                      canvas.toBlob(blob => {
                        if (blob) saveAs(blob, `${singleDl.title}.${downloadFormat}`);
                      }, downloadFormat === 'jpg' ? 'image/jpeg' : downloadFormat === 'webp' ? 'image/webp' : 'image/png', downloadFormat === 'jpg' ? 0.92 : undefined);
                    };
                    img.onerror = () => {
                      fetch(singleDl.src).then(r => r.blob()).then(b => saveAs(b, `${singleDl.title}.${downloadFormat}`)).catch(() => toast("下载失败"));
                    };
                    img.src = singleDl.src;
                    (window as unknown as Record<string, unknown>).__artx_single_download__ = undefined;
                  } else if (dlNodes && dlNodes.length > 0) {
                    // 批量下载
                    const groupName = downloadGroupId === "__selection__"
                      ? "artx-selected-images"
                      : (groupNames[downloadGroupId || ""] || "artx-group");
                    await handleBatchDownload(dlNodes, downloadFormat, groupName);
                    (window as unknown as Record<string, unknown>).__artx_download_nodes__ = undefined;
                  }
                }}
                className="flex-1 py-2.5 rounded-[var(--radius-md-design)] type-caption font-medium transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                  color: "white",
                  boxShadow: "0 4px 16px oklch(0.58 0.22 290 / 0.30)",
                }}
              >
                开始下载
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建画布：拖拽矩形预览 */}
      {drawingRect && (() => {
        const rx = Math.min(drawingRect.startX, drawingRect.endX);
        const ry = Math.min(drawingRect.startY, drawingRect.endY);
        const rw = Math.abs(drawingRect.endX - drawingRect.startX);
        const rh = Math.abs(drawingRect.endY - drawingRect.startY);
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: rx, top: ry, width: rw, height: rh,
              border: "2px solid oklch(0.65 0.22 290)",
              background: "oklch(0.65 0.22 290 / 0.08)",
              borderRadius: 4,
              zIndex: 9800,
              boxSizing: "border-box",
            }}
          />
        );
      })()}

      {/* 创建画布：宽高输入弹窗 */}
      {pendingRect && (() => {
        const rx = Math.min(pendingRect.startX, pendingRect.endX);
        const ry = Math.min(pendingRect.startY, pendingRect.endY);
        const rw = Math.abs(pendingRect.endX - pendingRect.startX);
        const rh = Math.abs(pendingRect.endY - pendingRect.startY);
        // 弹窗宽度
        const popW = 240;
        // 默认显示在矩形右侧，若超出视口则显示在左侧
        const containerW = containerRef.current?.offsetWidth || 800;
        const containerH = containerRef.current?.offsetHeight || 600;
        // 弹窗最大高度 = 容器高度 - 24px 安全边距
        const popMaxH = containerH - 24;
        let popLeft = rx + rw + 12;
        if (popLeft + popW > containerW) popLeft = rx - popW - 12;
        if (popLeft < 8) popLeft = 8;
        let popTop = ry;
        if (popTop + popMaxH > containerH) popTop = Math.max(8, containerH - popMaxH - 8);
        if (popTop < 8) popTop = 8;
        const bg = isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.98)";
        const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
        const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(28,28,40,0.88)";
        const sub = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)";
        const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
        const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
        return (
          <>
            {/* 矩形预览（待确认状态） */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: rx, top: ry, width: rw, height: rh,
                border: "2px dashed oklch(0.65 0.22 290 / 0.80)",
                background: "oklch(0.65 0.22 290 / 0.06)",
                borderRadius: 4,
                zIndex: 9800,
                boxSizing: "border-box",
              }}
            />
            {/* 弹窗 */}
            <div
              className="absolute nodrag nopan"
              style={{
                left: popLeft, top: popTop, width: popW,
                maxHeight: popMaxH,
                display: "flex", flexDirection: "column",
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 10,
                boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.16)",
                backdropFilter: "blur(20px)",
                zIndex: 19999,
                overflow: "hidden",
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              {/* 内容区——可滚动 */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0", minHeight: 0 }}>
              <p style={{ color: text, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>设置画布尺寸</p>

              {/* 预设尺寸——可折叠下拉区域 */}
              {(() => {
                const presets = [
                  { label: "1:1",     desc: "1024 × 1024",  w: 1024, h: 1024, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /></svg> },
                  { label: "2:3",     desc: "1024 × 1536",  w: 1024, h: 1536, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="1" width="8" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /></svg> },
                  { label: "9:16",    desc: "1080 × 1920",  w: 1080, h: 1920, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="1" width="6" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /></svg> },
                  { label: "3:2",     desc: "1536 × 1024",  w: 1536, h: 1024, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /></svg> },
                  { label: "16:9",    desc: "1920 × 1080",  w: 1920, h: 1080, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="12" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" /></svg> },
                  { label: "A4",      desc: "1024 × 1754",  w: 1024, h: 1754, icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2.5" y="1" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M5 4h4M5 6.5h4M5 9h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" /></svg> },
                  { label: "Website", desc: "1366 × 768",   w: 1366, h: 768,  icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="0.9" /></svg> },
                ];
                const selBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)";
                const hoverItemBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
                const isSelected = (pw: number, ph: number) => canvasInputW === String(pw) && canvasInputH === String(ph);
                const selectedPreset = presets.find(p => isSelected(p.w, p.h));
                return (
                  <div style={{ marginBottom: 10, borderRadius: 7, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, overflow: "hidden" }}>
                    {/* 标题行（点击展开/收起） */}
                    <button
                      onClick={() => setPresetOpen(v => !v)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", padding: "7px 10px",
                        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                        border: "none", cursor: "pointer", color: text,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" /></svg>
                        预设尺寸
                        {selectedPreset && <span style={{ color: "oklch(0.65 0.22 290)", fontSize: 11, fontWeight: 600 }}>{selectedPreset.label}</span>}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                        style={{ transform: presetOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s" }}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {/* 展开内容 */}
                    {presetOpen && presets.map((p, i) => (
                      <button
                        key={p.label}
                        onClick={() => { setCanvasInputW(String(p.w)); setCanvasInputH(String(p.h)); setPresetOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "6px 10px",
                          background: isSelected(p.w, p.h) ? selBg : "transparent",
                          border: "none",
                          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                          cursor: "pointer", textAlign: "left",
                          transition: "background 0.12s", color: text,
                        }}
                        onMouseEnter={e => { if (!isSelected(p.w, p.h)) (e.currentTarget as HTMLElement).style.background = hoverItemBg; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected(p.w, p.h) ? selBg : "transparent"; }}
                      >
                        <span style={{ color: sub, flexShrink: 0, display: "flex", alignItems: "center" }}>{p.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, minWidth: 44 }}>{p.label}</span>
                        <span style={{ fontSize: 11, color: sub, marginLeft: "auto" }}>{p.desc}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* 分隔线 */}
              <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", marginBottom: 10 }} />

              {/* 背景色标题 */}
              <p style={{ color: text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>背景颜色</p>

              {/* 行业通用色彩选择器 */}
              {(() => {
                // 解析 hex 转 HSV
                const hexToHsv = (hex: string): [number, number, number] => {
                  const r = parseInt(hex.slice(1,3),16)/255;
                  const g = parseInt(hex.slice(3,5),16)/255;
                  const b = parseInt(hex.slice(5,7),16)/255;
                  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
                  let h = 0;
                  if (d !== 0) {
                    if (max === r) h = ((g-b)/d + (g<b?6:0)) / 6;
                    else if (max === g) h = ((b-r)/d + 2) / 6;
                    else h = ((r-g)/d + 4) / 6;
                  }
                  return [h*360, max===0?0:d/max, max];
                };
                const hsvToHex = (h: number, s: number, v: number): string => {
                  h = h/360; const i = Math.floor(h*6);
                  const f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
                  let r=0,g=0,b=0;
                  switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
                  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
                };
                const [ch, cs, cv] = hexToHsv(canvasBgColor.startsWith('#') && canvasBgColor.length===7 ? canvasBgColor : '#2a2a30');
                // 每次渲染时同步最新 HSV 到 ref，供拖拽回调读取（避免闭包捕获旧值）
                colorHsvRef.current = [ch, cs, cv];
                const sbRef = colorSbRef;
                const hueRef = colorHueRef;
                const handleSbDrag = (e: React.MouseEvent | MouseEvent) => {
                  const el = sbRef.current; if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                  // 从 ref 读取最新色相，避免闭包捕获旧的 ch
                  setCanvasBgColor(hsvToHex(colorHsvRef.current[0], s, v));
                };
                const handleHueDrag = (e: React.MouseEvent | MouseEvent) => {
                  const el = hueRef.current; if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
                  // 从 ref 读取最新 S/V，避免闭包捕获旧的 cs/cv
                  setCanvasBgColor(hsvToHex(h, colorHsvRef.current[1], colorHsvRef.current[2]));
                };
                const startDrag = (handler: (e: MouseEvent) => void) => {
                  const move = (e: MouseEvent) => handler(e);
                  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                  window.addEventListener('mousemove', move);
                  window.addEventListener('mouseup', up);
                };
                const pureHue = hsvToHex(ch, 1, 1);
                const swatches = ['#2a2a30','#ffffff','#000000','#ff4d4f','#ff7a00','#fadb14','#52c41a','#1677ff','#722ed1','#eb2f96','#13c2c2','#fa8c16'];
                return (
                  <div style={{ marginBottom: 12 }}>
                    {/* SB 面板 */}
                    <div
                      ref={sbRef}
                      style={{ width: '100%', height: 140, borderRadius: 6, marginBottom: 8, position: 'relative', cursor: 'crosshair',
                        background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${pureHue})`,
                        boxShadow: `inset 0 0 0 1px ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}` }}
                      onMouseDown={e => { handleSbDrag(e); startDrag(handleSbDrag); }}
                    >
                      <div style={{ position:'absolute', left: `${cs*100}%`, top: `${(1-cv)*100}%`,
                        width:12, height:12, borderRadius:'50%', border:'2px solid white',
                        transform:'translate(-50%,-50%)', boxShadow:'0 0 0 1px rgba(0,0,0,0.3)', pointerEvents:'none' }} />
                    </div>
                    {/* 色相条 */}
                    <div
                      ref={hueRef}
                      style={{ width:'100%', height:12, borderRadius:6, marginBottom:8, position:'relative', cursor:'ew-resize',
                        background:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
                        boxShadow:`inset 0 0 0 1px ${isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'}` }}
                      onMouseDown={e => { handleHueDrag(e); startDrag(handleHueDrag); }}
                    >
                      <div style={{ position:'absolute', left:`${ch/360*100}%`, top:'50%',
                        width:14, height:14, borderRadius:'50%', border:'2px solid white',
                        transform:'translate(-50%,-50%)', boxShadow:'0 0 0 1px rgba(0,0,0,0.3)', pointerEvents:'none' }} />
                    </div>
                    {/* HEX 输入 + 预览色块 */}
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:5, background:canvasBgColor, flexShrink:0,
                        border:`1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}` }} />
                      <div style={{ flex:1, display:'flex', alignItems:'center', background:inputBg,
                        border:`1px solid ${inputBorder}`, borderRadius:6, overflow:'hidden', height:28 }}>
                        <span style={{ color:sub, fontSize:11, padding:'0 6px', flexShrink:0 }}>#</span>
                        <input
                          type="text"
                          value={canvasBgColor.replace('#','').toUpperCase()}
                          onChange={e => { const v='#'+e.target.value.replace(/[^0-9a-fA-F]/g,'').slice(0,6); if(v.length===7) setCanvasBgColor(v); }}
                          style={{ flex:1, background:'transparent', border:'none', outline:'none', color:text, fontSize:12, padding:'0 4px', width:0, fontFamily:'monospace' }}
                          maxLength={6}
                        />
                      </div>
                    </div>
                    {/* 快捷色板 */}
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      {swatches.map(c => (
                        <button key={c} onClick={() => setCanvasBgColor(c)}
                          style={{ width:20, height:20, borderRadius:4, background:c, border: canvasBgColor===c ? '2px solid oklch(0.65 0.22 290)' : `1px solid ${isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)'}`,
                            cursor:'pointer', padding:0, flexShrink:0 }} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: sub, fontSize: 10, marginBottom: 4, letterSpacing: "0.04em" }}>宽度 W</p>
                  <div style={{ display: "flex", alignItems: "center", background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 6, overflow: "hidden" }}>
                    <input
                      autoFocus
                      type="number"
                      min={1}
                      value={canvasInputW}
                      onChange={e => setCanvasInputW(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleCreateCanvasConfirm(); if (e.key === "Escape") handleCreateCanvasCancel(); }}
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: text, fontSize: 13, padding: "5px 6px", width: 0 }}
                    />
                    <span style={{ color: sub, fontSize: 11, paddingRight: 7, flexShrink: 0 }}>px</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: sub, fontSize: 10, marginBottom: 4, letterSpacing: "0.04em" }}>高度 H</p>
                  <div style={{ display: "flex", alignItems: "center", background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 6, overflow: "hidden" }}>
                    <input
                      type="number"
                      min={1}
                      value={canvasInputH}
                      onChange={e => setCanvasInputH(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleCreateCanvasConfirm(); if (e.key === "Escape") handleCreateCanvasCancel(); }}
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: text, fontSize: 13, padding: "5px 6px", width: 0 }}
                    />
                    <span style={{ color: sub, fontSize: 11, paddingRight: 7, flexShrink: 0 }}>px</span>
                  </div>
                </div>
              </div>
              </div>{/* end scrollable content area */}
              {/* 确认/取消按钮——固定在弹窗底部 */}
              <div style={{ flexShrink: 0, padding: "10px 14px 12px", borderTop: `1px solid ${isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)"}`, display: "flex", gap: 8 }}>
                <button
                  onClick={handleCreateCanvasCancel}
                  style={{
                    flex: 1, height: 32, borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: inputBg, border: `1px solid ${inputBorder}`, color: text,
                    cursor: "pointer", transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  取消
                </button>
                <button
                  onClick={handleCreateCanvasConfirm}
                  style={{
                    flex: 1, height: 32, borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                    border: "none", color: "white",
                    cursor: "pointer", transition: "opacity 0.15s",
                    boxShadow: "0 2px 8px oklch(0.58 0.22 290 / 0.30)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  确认
                </button>
              </div>
            </div>
          </>
        );
      })()}


      {/* 隐藏的文件上传 input */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={e => handleUploadFiles(e.target.files)}
      />

      {/* 全局注释气泡层 — fixed 定位，渲染在最顶层 */}
      {globalAnnotations.length > 0 && (
        <GlobalAnnotationLayer
          annotations={globalAnnotations}
          nodes={nodes}
          viewport={viewport}
          isDark={isDark}
          onUpdate={updateGlobalAnnotation}
          onRemove={removeGlobalAnnotation}
        />
      )}

    </div>
  );
}

// ── 全局注释层组件 ──
function GlobalAnnotationLayer({
  annotations, nodes, viewport, isDark, onUpdate, onRemove
}: {
  annotations: (Annotation & { nodeId: string; screenX?: number; screenY?: number })[];
  nodes: Node[];
  viewport: { x: number; y: number; zoom: number };
  isDark: boolean;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onRemove: (id: string) => void;
}) {
  // 将注释的节点内百分比坐标转换为屏幕坐标
  // 公式: screenX = viewport.x + node.position.x * viewport.zoom + (xPct/100) * nodeWidth * viewport.zoom
  const getScreenPos = (ann: Annotation & { nodeId: string }) => {
    const node = nodes.find(n => n.id === ann.nodeId);
    if (!node) return null;
    // 节点宽度：取 node.width 或默认 240
    const nw = (node.width as number) || 240;
    const nh = (node.height as number) || 280;
    const sx = viewport.x + (node.position.x + (ann.x / 100) * nw) * viewport.zoom;
    const sy = viewport.y + (node.position.y + (ann.y / 100) * nh) * viewport.zoom;
    return { x: sx, y: sy };
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    >
      {annotations.map(ann => {
        const pos = getScreenPos(ann);
        if (!pos) return null;
        return (
          <div
            key={ann.id}
            className="absolute pointer-events-auto"
            style={{ left: pos.x, top: pos.y, transform: "translateX(-50%)" }}
          >
            <AnnotationBubble
              ann={ann}
              isDark={isDark}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          </div>
        );
      })}
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
