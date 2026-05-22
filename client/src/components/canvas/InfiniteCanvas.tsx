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
  ReactFlowProvider,
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
  ChevronLeft, Home, LayoutGrid,
} from "lucide-react";
import { useLocation } from "wouter";
import { GENERATED_ASSETS, AI_MODELS } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

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
              style={{ color: text }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
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
        className="p-1 rounded transition-colors hover:opacity-80"
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
    ? "0 0 0 2px oklch(0.65 0.22 290 / 0.4), 0 8px 32px oklch(0 0 0 / 0.4)"
    : "0 4px 24px oklch(0 0 0 / 0.25)";

  return (
    <div
      className="relative flex flex-col rounded-xl overflow-visible"
      style={{ background: bg, border: `1.5px solid ${border}`, boxShadow: shadow, transition: "border-color 0.15s, box-shadow 0.15s", ...style }}
      onContextMenu={onContextMenu}
    >
      <Handle type="target" position={Position.Left} id="left"
        className="!w-3 !h-3 !rounded-full !border-2 hover:!scale-125 transition-all"
        style={{
          left: -1,
          backgroundColor: isDark ? "rgba(255,255,255,0.80)" : "oklch(0.28 0.01 270)",
          borderColor: isDark ? "rgba(255,255,255,0.60)" : "oklch(0.20 0.01 270)",
        }} />
      <Handle type="source" position={Position.Right} id="right"
        className="!w-3 !h-3 !rounded-full !border-2 hover:!scale-125 transition-all"
        style={{
          right: -1,
          backgroundColor: isDark ? "rgba(255,255,255,0.80)" : "oklch(0.28 0.01 270)",
          borderColor: isDark ? "rgba(255,255,255,0.60)" : "oklch(0.20 0.01 270)",
        }} />
      <div className="flex flex-col flex-1 overflow-hidden rounded-xl">
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
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-white/70 text-[13px] font-medium">{title}</span>
          <div className="flex-1" />
          <button
            onClick={() => toast("下载", { description: "功能即将上线" })}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <Download size={14} color="white" />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <X size={14} color="white" />
          </button>
        </div>
        {/* Image */}
        <img
          src={src}
          alt={title}
          style={{ maxWidth: "85vw", maxHeight: "80vh", borderRadius: 12, boxShadow: "0 24px 80px rgba(0,0,0,0.7)", objectFit: "contain" }}
        />
        <p className="text-white/30 text-[11px] mt-3">按 Esc 关闭 · 点击背景关闭</p>
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
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-2 py-1.5 rounded-2xl nodrag nopan"
      style={{ top: -52, background: toolBg, border: `1px solid ${toolBorder}`, backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.35)", zIndex: 50, whiteSpace: "nowrap" }}
    >
      {tools.map((t) => (
        <button key={t.action} title={t.label}
          onClick={(e) => { e.stopPropagation(); handleClick(t.action); }}
          className="relative w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ color: iconColor }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          {t.icon}
          {(t as any).dot && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.60 0.22 260)" }} />}
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: dividerColor, margin: "0 4px", flexShrink: 0 }} />
      {actions.map((t) => (
        <button key={t.action} title={t.label}
          onClick={(e) => { e.stopPropagation(); handleClick(t.action); }}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ color: iconColor }}
          onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          {t.icon}
        </button>
      ))}
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
      style={{ top: "calc(100% + 12px)", width: 380, background: panelBg, border: `1px solid ${panelBorder}`, borderRadius: 16, backdropFilter: "blur(20px)", boxShadow: "0 16px 48px rgba(0,0,0,0.4)", zIndex: 50 }}>
      <div className="flex items-center gap-2 p-3">
        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ border: `1.5px solid ${panelBorder}` }}>
          <img src={assetSrc} alt="ref" className="w-full h-full object-cover" />
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{ border: `1.5px dashed ${panelBorder}`, color: chipText }}
          onClick={() => toast("添加参考图")}>
          <PlusSquare size={14} />
        </div>
        <div className="flex-1" />
        <button onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ color: chipText }}>
          <Maximize2 size={13} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="描述你想对这张图片做什么..."
          rows={3} className="w-full bg-transparent text-[13px] leading-relaxed resize-none outline-none"
          style={{ color: textColor }}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (prompt.trim()) { toast("AI 正在处理图片", { description: prompt.slice(0, 50) }); setPrompt(""); } } }} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderTop: `1px solid ${divider}` }}>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-opacity hover:opacity-80"
          style={{ background: chipBg, color: chipText }}
          onClick={e => { e.stopPropagation(); toast("尺寸设置"); }}>
          <RefreshCw size={10} /> 自适应 · 1K
        </button>
        <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-opacity hover:opacity-80"
          style={{ background: chipBg, color: chipText }}
          onClick={e => { e.stopPropagation(); toast("风格设置"); }}>风格</button>
        <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-opacity hover:opacity-80"
          style={{ background: chipBg, color: chipText }}
          onClick={e => { e.stopPropagation(); toast("摄影机控制"); }}>摄影机控制</button>
        <div className="flex-1" />
        <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-opacity hover:opacity-80"
          style={{ color: chipText }}
          onClick={e => { e.stopPropagation(); toast("语音输入"); }}>
          <Mic size={12} />
        </button>
        <span className="text-[11px]" style={{ color: chipText }}>1×</span>
        <button className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-90"
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
  const [model, setModel] = useState("flux-pro");
  const [preview, setPreview] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const { deleteElements } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";

  const asset = GENERATED_ASSETS.find(a => a.id === (data.assetId as string)) || GENERATED_ASSETS[0];
  const text = isDark ? "oklch(0.75 0.01 270)" : "oklch(0.30 0.01 270)";
  const subtext = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.55 0.01 270)";
  const tagBg = isDark ? "oklch(0.18 0.02 270)" : "oklch(0.92 0.005 270)";

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
        style={{ width: 240 }}
        onContextMenu={handleNodeCtxMenu}
      >
        {/* Floating top toolbar — visible when selected */}
        {selected && (
          <AssetFloatingToolbar
            isDark={isDark}
            onPreview={() => setPreview(true)}
            onDownload={() => toast("下载", { description: "功能即将上线" })}
          />
        )}

        <div
          className="relative overflow-hidden cursor-pointer"
          style={{ aspectRatio: "16/10" }}
          onClick={(e) => { e.stopPropagation(); setShowPanel(p => !p); }}
          onDoubleClick={(e) => { e.stopPropagation(); setPreview(true); }}
        >
          <img src={asset.src} alt={asset.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.35)" }}>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <ZoomIn size={12} />
              双击预览
            </div>
          </div>
          <div className="absolute top-2 left-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: tagBg, color: subtext }}>
              {asset.type}
            </span>
          </div>
          <div className="absolute top-2 right-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: "oklch(0 0 0 / 0.5)", color: "oklch(0.85 0 0)" }}>
              {asset.width}×{asset.height}
            </span>
          </div>
        </div>
        <div className="px-3 py-2">
          <p className="text-[12px] font-semibold truncate" style={{ color: text }}>{asset.title}</p>
          <p className="text-[10px] mt-0.5" style={{ color: subtext }}>{(asset.tags || []).join(" · ")}</p>
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
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "oklch(0.58 0.22 290 / 0.2)" }}>
          <MessageSquare size={11} style={{ color: "oklch(0.72 0.22 290)" }} />
        </div>
        <span className="text-[12px] font-semibold" style={{ color: text }}>AI 对话</span>
      </div>
      <div className="flex flex-col gap-2 p-3 overflow-y-auto nodrag nopan" style={{ maxHeight: 260 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="rounded-lg px-3 py-2 text-[11px] leading-relaxed max-w-[85%] whitespace-pre-line"
              style={{ background: msg.role === "user" ? aiBg : msgBg, border: msg.role === "user" ? `1px solid ${aiBorder}` : "none", color: text }}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3 nodrag nopan">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: inputBg, border: `1px solid ${inputBorder}` }}>
          <input className="flex-1 bg-transparent text-[11px] outline-none" style={{ color: text }}
            placeholder="继续对话..." onClick={e => e.stopPropagation()} />
          <button className="p-1 rounded" style={{ color: subtext }}><Send size={11} /></button>
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
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "oklch(0.78 0.18 50 / 0.2)" }}>
          <Wand2 size={11} style={{ color: "oklch(0.78 0.18 50)" }} />
        </div>
        <span className="text-[12px] font-semibold" style={{ color: text }}>提示词</span>
      </div>
      <div className="p-3 nodrag nopan">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-[11px] leading-relaxed resize-none outline-none"
          style={{ background: inputBg, border: `1px solid ${inputBorder}`, color: text, minHeight: 80 }}
          placeholder="输入提示词..." rows={4} onClick={e => e.stopPropagation()} />
      </div>
      <div className="px-3 pb-3 nodrag nopan">
        <button className="w-full py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
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
        <span className="text-[11px] font-semibold" style={{ color: textColor }}>备注</span>
      </div>
      <div className="p-3 nodrag nopan">
        <textarea value={text2} onChange={e => setText2(e.target.value)}
          className="w-full bg-transparent text-[11px] leading-relaxed resize-none outline-none"
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
              className="w-5 h-5 rounded-full flex items-center justify-center shadow-lg hover:opacity-80"
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
  chat: ChatNodeComponent as unknown as NodeTypes["chat"],
  prompt: PromptNodeComponent as unknown as NodeTypes["prompt"],
  text: TextNodeComponent as unknown as NodeTypes["text"],
};
const edgeTypes: EdgeTypes = {
  tapnow: TapnowEdge as unknown as EdgeTypes["tapnow"],
};

// ── Initial data ───────────────────────────────────────────────
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
  { id: "e1", source: "chat-1",   target: "asset-1",  type: "tapnow" },
  { id: "e2", source: "chat-1",   target: "asset-2",  type: "tapnow" },
  { id: "e3", source: "prompt-1", target: "asset-3",  type: "tapnow" },
  { id: "e4", source: "asset-1",  target: "prompt-1", type: "tapnow" },
];


// ── Bottom AI Prompt Bar ───────────────────────────────────────
function BottomPromptBar({ isDark }: { isDark: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [rows, setRows] = useState(1);
  const bg = isDark ? "oklch(0.13 0.015 270 / 0.95)" : "oklch(0.98 0.004 270 / 0.95)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
  const text = isDark ? "oklch(0.80 0.008 270)" : "oklch(0.20 0.008 270)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) { toast("AI 正在生成节点", { description: prompt.slice(0, 60) }); setPrompt(""); setRows(1); }
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl shadow-2xl overflow-hidden"
      style={{ background: bg, border: `1.5px solid ${border}`, backdropFilter: "blur(20px)", width: "min(680px, calc(100% - 48px))", zIndex: 50 }}>
      <div className="px-4 pt-3 pb-2">
        <textarea value={prompt} onChange={e => { setPrompt(e.target.value); setRows(Math.min(e.target.value.split("\n").length, 5)); }}
          onKeyDown={handleKeyDown} rows={rows}
          className="w-full bg-transparent text-[13px] leading-relaxed resize-none outline-none"
          style={{ color: text }} placeholder="描述你想创作的内容，AI 将在画布上生成节点..." />
      </div>
      <div className="flex items-center gap-2 px-3 pb-3" style={{ borderTop: `1px solid ${divider}`, paddingTop: 8 }}>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] hover:opacity-80"
          style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)" }}
          onClick={() => toast("参考图", { description: "功能即将上线" })}>
          <Paperclip size={12} /><span>参考图</span>
        </button>
        <div className="flex-1" />
        <span className="text-[10px]" style={{ color: isDark ? "oklch(0.38 0.008 270)" : "oklch(0.62 0.008 270)" }}>
          Enter 发送 · Shift+Enter 换行
        </span>
        <button onClick={() => { if (prompt.trim()) { toast("AI 正在生成节点", { description: prompt.slice(0, 60) }); setPrompt(""); setRows(1); } }}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-80"
          style={{ background: prompt.trim() ? "oklch(0.58 0.22 290)" : (isDark ? "oklch(0.22 0.015 270)" : "oklch(0.88 0.005 270)") }}>
          <Send size={13} color={prompt.trim() ? "white" : (isDark ? "oklch(0.40 0.01 270)" : "oklch(0.65 0.01 270)")} />
        </button>
      </div>
    </div>
  );
}

// ── Node Context Menu (right-click on node) ────────────────────
interface NodeCtxState { x: number; y: number; nodeId: string; nodeType: string; }

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

  const items = [
    { icon: <PlusSquare size={13} />, label: "添加节点", action: "add-node", color: iconColor },
    { icon: <ImageIcon size={13} />, label: "添加素材", action: "add-asset", color: iconColor },
    { icon: <Edit3 size={13} />, label: "编辑素材", action: "edit-asset", color: iconColor },
    null, // divider
    { icon: <Copy size={13} />, label: "复制", action: "copy", color: iconColor },
    { icon: <Clipboard size={13} />, label: "粘贴", action: "paste", color: iconColor },
    null, // divider
    { icon: <FileText size={13} />, label: "添加文本备注", action: "add-text", color: iconColor },
    null, // divider
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
      className="absolute rounded-xl overflow-hidden shadow-2xl"
      style={{ left: menu.x, top: menu.y, background: bg, border: `1px solid ${border}`, minWidth: 196, zIndex: 2000 }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${divider}` }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: isDark ? "oklch(0.42 0.01 270)" : "oklch(0.58 0.01 270)" }}>
          节点操作
        </span>
      </div>
      {items.map((item, i) =>
        item === null ? (
          <div key={`div-${i}`} style={{ height: 1, background: divider, margin: "2px 0" }} />
        ) : (
          <button
            key={item.action}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] transition-colors"
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
      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-[11px] font-medium pointer-events-none"
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
            borderRadius: 4,
          }}
        />
      )}
    </div>
  );
}

// ── Back Button ───────────────────────────────────────────────
function BackButton({ isDark }: { isDark: boolean }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const bg = isDark ? "oklch(0.13 0.015 270 / 0.95)" : "oklch(0.98 0.004 270 / 0.95)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0 0 0 / 12%)";
  const text = isDark ? "oklch(0.78 0.01 270)" : "oklch(0.25 0.01 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    const t = setTimeout(() => window.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", handler); };
  }, [open]);

  return (
    <div className="absolute" style={{ top: 12, left: 12, zIndex: 101 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium shadow-lg transition-all hover:opacity-90 active:scale-95"
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
          className="absolute top-full mt-1.5 left-0 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: bg, border: `1px solid ${border}`, minWidth: 148, backdropFilter: "blur(16px)" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[12px] transition-colors"
            style={{ color: text }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { navigate("/"); setOpen(false); }}
          >
            <Home size={13} />
            返回首页
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[12px] transition-colors"
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
    { icon: <MessageSquare size={13} />, label: "AI 对话节点", type: "chat" },
    { icon: <ImageIcon size={13} />, label: "素材节点", type: "asset" },
    { icon: <Wand2 size={13} />, label: "提示词节点", type: "prompt" },
    { icon: <Type size={13} />, label: "文本备注", type: "text" },
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
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold shadow-lg transition-all hover:opacity-90 active:scale-95"
        style={{
          background: open
            ? (isDark ? "oklch(0.55 0.18 280)" : "oklch(0.50 0.18 280)")
            : (isDark ? "oklch(0.18 0.02 270 / 0.95)" : "oklch(0.97 0.004 270 / 0.95)"),
          border: `1.5px solid ${open ? "oklch(0.65 0.20 280 / 0.6)" : border}`,
          color: open ? "white" : text,
          backdropFilter: "blur(12px)",
        }}
      >
        <PlusSquare size={14} />
        创建节点
        <ChevronDown size={11} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1.5 left-0 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: bg, border: `1px solid ${border}`, minWidth: 168, backdropFilter: "blur(16px)" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-2" style={{ borderBottom: `1px solid ${divider}` }}>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: isDark ? "oklch(0.42 0.01 270)" : "oklch(0.58 0.01 270)" }}>选择节点类型</span>
          </div>
          {nodeOptions.map((opt) => (
            <button
              key={opt.type}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[12px] transition-colors"
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

// ── Inner Canvas ───────────────────────────────────────────────
function InnerCanvas({ projectId = "p1" }: { projectId?: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { screenToFlowPosition, getEdges, getNodes } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeCtxMenu, setNodeCtxMenu] = useState<NodeCtxState | null>(null);
  const [clipboard, setClipboard] = useState<Node | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, type: "tapnow" }, eds));
  }, [setEdges]);

  // ── Right-click: blank canvas → NO menu; node → handled via custom event ──
  const handlePaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    // Blank canvas: do nothing (no menu)
  }, []);

  // ── Node right-click via custom event ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number; nodeId: string; nodeType: string };
      setNodeCtxMenu({ x: detail.x, y: detail.y, nodeId: detail.nodeId, nodeType: detail.nodeType });
    };
    window.addEventListener("node-contextmenu", handler);
    return () => window.removeEventListener("node-contextmenu", handler);
  }, []);

  // ── Node context menu actions ──
  const handleNodeAction = useCallback((action: string, nodeId: string) => {
    if (action === "delete") {
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    } else if (action === "copy") {
      const node = nodes.find(n => n.id === nodeId);
      if (node) { setClipboard(node); toast("已复制节点"); }
    } else if (action === "paste") {
      if (clipboard) {
        const id = `${clipboard.type}-${Date.now()}`;
        setNodes(nds => [...nds, { ...clipboard, id, position: { x: clipboard.position.x + 40, y: clipboard.position.y + 40 }, data: { ...clipboard.data, id } }]);
        toast("已粘贴节点");
      } else { toast("剪贴板为空"); }
    } else if (action === "add-node") {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const id = `chat-${Date.now()}`;
        setNodes(nds => [...nds, { id, type: "chat", position: { x: node.position.x + 360, y: node.position.y }, data: { id } }]);
      }
    } else if (action === "add-asset") {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const id = `asset-${Date.now()}`;
        setNodes(nds => [...nds, { id, type: "asset", position: { x: node.position.x + 280, y: node.position.y }, data: { id, assetId: `a${Math.ceil(Math.random() * 4)}` } }]);
      }
    } else if (action === "add-text") {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const id = `text-${Date.now()}`;
        setNodes(nds => [...nds, { id, type: "text", position: { x: node.position.x, y: node.position.y + 200 }, data: { id, text: "", colorIdx: 0 } }]);
      }
    } else if (action === "edit-asset") {
      toast("编辑素材", { description: "功能即将上线" });
    }
  }, [nodes, clipboard, setNodes, setEdges]);

  // ── Add node from position ──
  const addNode = useCallback((type: string, x: number, y: number) => {
    const id = `${type}-${Date.now()}`;
    setNodes(nds => [...nds, {
      id, type, position: { x, y },
      data: { id, assetId: type === "asset" ? `a${Math.ceil(Math.random() * 4)}` : undefined, prompt: type === "prompt" ? "" : undefined, text: type === "text" ? "" : undefined, colorIdx: type === "text" ? Math.floor(Math.random() * 3) : undefined },
    }]);
  }, [setNodes]);

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
      setEdges(eds => eds.filter(e => !cutIds.includes(e.id)));
      toast(`已切断 ${cutIds.length} 条连线`, { description: "松开 C 键退出切割模式" });
    } else {
      toast("未选中任何连线", { description: "请框选连线经过的区域" });
    }
  }, [screenToFlowPosition, getNodes, getEdges, setEdges]);

  const canvasBg = isDark ? "#0d0d14" : "#eeeef2";
  const dotColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.28)";

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
        onPaneContextMenu={handlePaneContextMenu as any}
        onClick={() => setNodeCtxMenu(null)}
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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color={dotColor} />
        <MiniMap
          style={{ background: isDark ? "oklch(0.11 0.015 270)" : "oklch(0.95 0.004 270)", border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}`, borderRadius: 8 }}
          maskColor={isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)"}
          nodeColor={isDark ? "oklch(0.35 0.02 270)" : "oklch(0.75 0.005 270)"}
        />
        <Controls style={{ background: isDark ? "oklch(0.13 0.015 270)" : "oklch(0.97 0.004 270)", border: `1px solid ${isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"}`, borderRadius: 8 }} />
      </ReactFlow>

      {/* Back button — top-left */}
      <BackButton isDark={isDark} />

      {/* Top-left node creation toolbar — offset to avoid overlap with back button */}
      <div style={{ position: "absolute", top: 12, left: 100, zIndex: 100 }}>
        <TopLeftToolbar isDark={isDark} onAdd={addNode} />
      </div>

      {/* C-key lasso eraser */}
      <LassoEraser isDark={isDark} onCut={handleLassoCut} />

      {/* Node context menu */}
      {nodeCtxMenu && (
        <NodeContextMenu menu={nodeCtxMenu} onClose={() => setNodeCtxMenu(null)} onAction={handleNodeAction} isDark={isDark} />
      )}

      {/* Bottom AI prompt bar */}
      <BottomPromptBar isDark={isDark} />

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
