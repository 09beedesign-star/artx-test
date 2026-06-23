/**
 * InfiniteCanvas — React Flow based canvas
 * Features:
 * 1. C-key lasso: hold C + drag to draw a selection box that cuts all edges it intersects
 * 2. Right-click on blank canvas: NO menu (dismiss only)
 * 3. Right-click on node: context menu with icon commands
 * 4. Asset node double-click zoom is disabled; image download is available from the node context menu
 */
import { useCallback, useState, useRef, useEffect, useMemo, type ReactNode, Fragment } from "react";
import { createPortal } from "react-dom";
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
  ZoomIn, Download, Crop, Box, Eraser,
  MoreHorizontal, FolderOutput, Maximize2, Mic, RefreshCw,
  ChevronLeft, Home, LayoutGrid, Lock, Unlock, Plus, Minus,
  Search, ArrowRight, Share2, MousePointer2, CircleDot, Grid3X3,
  Square, PenLine, ImagePlus, Video, Captions, Repeat2, LogOut, FolderDown,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Boxes,
  Triangle, Pencil, MessageCircle, Star, Minus as MinusIcon,
  BadgeCheck, ScanSearch, Move, PanelTopOpen, ImageOff, Check,
  WandSparkles,
  Shirt, Expand, Frame, RotateCw, MapPin, PlusCircle, GalleryVerticalEnd, Droplets,
} from "lucide-react";

// 「井号 + 方框」图标 — 创建画板专用
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

function HdIcon({ size = 15 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 5,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.62)),
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      HD
    </span>
  );
}

function AiAnnotationIcon({ size = 17, cutoutBg = "rgba(22,22,30,0.96)" }: { size?: number; cutoutBg?: string }) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MessageCircle size={size} />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -2,
          top: -3,
          width: Math.max(10, Math.round(size * 0.64)),
          height: Math.max(10, Math.round(size * 0.64)),
          borderRadius: "50%",
          background: cutoutBg,
          boxShadow: `0 0 0 1px ${cutoutBg}`,
          pointerEvents: "none",
        }}
      />
      <Sparkles
        size={Math.max(7, Math.round(size * 0.52))}
        strokeWidth={2.4}
        style={{
          position: "absolute",
          right: -1,
          top: -3,
          color: "oklch(0.74 0.20 290)",
          filter: "drop-shadow(0 0 5px oklch(0.64 0.22 290 / 0.55))",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

function AiDecoratedIcon({
  children,
  size = 15,
  cutoutBg = "rgba(22,22,30,0.96)",
}: {
  children: ReactNode;
  size?: number;
  cutoutBg?: string;
}) {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -3,
          top: -4,
          width: Math.max(9, Math.round(size * 0.62)),
          height: Math.max(9, Math.round(size * 0.62)),
          borderRadius: "50%",
          background: cutoutBg,
          boxShadow: `0 0 0 1px ${cutoutBg}`,
          pointerEvents: "none",
        }}
      />
      <Sparkles
        size={Math.max(6, Math.round(size * 0.46))}
        strokeWidth={2.4}
        style={{
          position: "absolute",
          right: -2,
          top: -3,
          color: "oklch(0.74 0.20 290)",
          filter: "drop-shadow(0 0 5px oklch(0.64 0.22 290 / 0.48))",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

function FontDesignIcon({
  size = 17,
  cutoutBg = "rgba(22,22,30,0.96)",
}: {
  size?: number;
  cutoutBg?: string;
}) {
  return (
    <AiDecoratedIcon size={size} cutoutBg={cutoutBg}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          fontSize: Math.max(13, Math.round(size * 0.9)),
          fontWeight: 900,
          lineHeight: 1,
          fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: 0,
        }}
      >
        A
      </span>
    </AiDecoratedIcon>
  );
}
import { useLocation } from "wouter";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { ALL_AI_MODEL_OPTIONS, AUTO_AI_MODEL, GENERATED_ASSETS, IMAGE_AI_MODELS, IMAGE_AI_MODEL_OPTIONS, PROJECTS, TEXT_AI_MODELS, type AiModelOption, type GeneratedAsset, type Project } from "@/lib/workspace-data";
import { SOCIAL_MEDIA_SIZE_PRESETS, SocialPlatformIcon, type SocialMediaExportPayload, type SocialMediaSizePreset } from "@/lib/social-media-presets";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import CropEditor from "@/components/canvas/CropEditor";
import RotateEditor from "@/components/canvas/RotateEditor";
import { callLLM, createProductBackground, editImageWithPrompt, enhanceImageToHd, eraseImageObjects, expandImageWithMask, extractImageText, generateImages as generateAiImages, getBackgroundImageGenerationTask, removeImageBackground, removeImageWatermark, requestAiAuth, searchReferenceImages, startBackgroundImageGeneration, type ReferenceImageResult } from "@/lib/ai";
import { routeCreativeIntent } from "@/lib/ai-intent";
import { createWorkspaceHistoryProject, readWorkspaceProjectHistory, touchWorkspaceProjectHistory, updateWorkspaceProjectHistory, type WorkspaceHistoryProject } from "@/lib/project-history";
import { buildSkillPromptContext, createPendingSkillLoad, PENDING_SKILL_LOAD_KEY, skillStoreItems, type PendingSkillLoad } from "@/lib/skill-store";
import generationMark from "@/assets/generation/ai-generation-mark.svg";

const ENABLE_NODE_CONNECTIONS = false;

const CANVAS_FRAME_BACKGROUND_ALPHA = 0.5;

function withCanvasFrameAlpha(color: unknown, alpha = CANVAS_FRAME_BACKGROUND_ALPHA) {
  const fallback = `rgba(42,42,48,${alpha})`;
  if (typeof color !== "string" || !color.trim()) return fallback;
  const value = color.trim();
  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const raw = hexMatch[1].length === 3
      ? hexMatch[1].split("").map(char => char + char).join("")
      : hexMatch[1];
    const intValue = parseInt(raw, 16);
    const r = (intValue >> 16) & 255;
    const g = (intValue >> 8) & 255;
    const b = intValue & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map(part => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    }
  }
  return value.startsWith("oklch(") && !value.includes("/")
    ? value.replace(/\)$/, ` / ${alpha})`)
    : value;
}

// ── Model Selector ─────────────────────────────────────────────
function ModelSelector({
  model,
  onChange,
  isDark,
  models = IMAGE_AI_MODEL_OPTIONS,
}: {
  model: string;
  onChange: (m: string) => void;
  isDark: boolean;
  models?: AiModelOption[];
}) {
  const [open, setOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const current = models.find(m => m.id === model) || AUTO_AI_MODEL;
  const bg = isDark ? "oklch(0.13 0.015 270)" : "oklch(0.96 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.75 0.01 270)" : "oklch(0.35 0.01 270)";
  const popBg = isDark ? "oklch(0.16 0.018 270)" : "oklch(0.99 0.004 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";
  const rowHeight = 40;
  const panelHeight = Math.min(models.length * rowHeight, 320);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (modelRef.current && event.target instanceof globalThis.Node && !modelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  return (
    <div ref={modelRef} className="relative nodrag nopan" style={{ zIndex: open ? 1200 : 100 }}>
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
          style={{
            background: popBg,
            border: `1px solid ${border}`,
            minWidth: 160,
            zIndex: 1201,
            maxHeight: panelHeight,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="model-selector-scroll"
            style={{
              maxHeight: panelHeight,
              overflowY: "auto",
              overscrollBehavior: "contain",
              scrollbarWidth: "thin",
              scrollbarColor: `${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"} transparent`,
            }}
            onWheel={e => e.stopPropagation()}
          >
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 text-left type-caption transition-colors"
                style={{ height: rowHeight, color: text }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0, display: "inline-block" }} />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="type-caption" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{m.label}</span>
                  {"description" in m && m.description ? (
                    <span className="truncate" style={{ fontSize: 10, opacity: 0.58, letterSpacing: 0 }}>{m.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillPointSelector({
  activeSkill,
  onChange,
  isDark,
}: {
  activeSkill: PendingSkillLoad | null;
  onChange: (skill: PendingSkillLoad | null) => void;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | null>(null);
  const groupedSkills = useMemo(() => {
    const groups = new Map<string, typeof skillStoreItems>();
    skillStoreItems.forEach(skill => {
      const key = skill.subcategory || skill.category;
      groups.set(key, [...(groups.get(key) || []), skill]);
    });
    return Array.from(groups.entries());
  }, []);
  const bg = isDark ? "oklch(0.13 0.015 270)" : "oklch(0.96 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.75 0.01 270)" : "oklch(0.35 0.01 270)";
  const popBg = isDark ? "oklch(0.16 0.018 270)" : "oklch(0.99 0.004 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";
  const activeBg = isDark ? "oklch(0.58 0.22 290 / 0.18)" : "oklch(0.58 0.22 290 / 0.12)";
  const activeText = isDark ? "oklch(0.82 0.16 290)" : "oklch(0.46 0.18 290)";
  const updatePopoverPosition = useCallback(() => {
    const trigger = selectorRef.current;
    if (!trigger) return;
    const margin = 12;
    const gap = 8;
    const width = Math.min(288, Math.max(220, window.innerWidth - margin * 2));
    const maxHeight = Math.max(180, Math.min(360, window.innerHeight - margin * 2));
    const rect = trigger.getBoundingClientRect();
    const spaceAbove = rect.top - margin - gap;
    const spaceBelow = window.innerHeight - rect.bottom - margin - gap;
    const openAbove = spaceAbove >= Math.min(maxHeight, 260) || spaceAbove >= spaceBelow;
    const availableHeight = Math.max(160, Math.min(maxHeight, openAbove ? spaceAbove : spaceBelow));
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    const top = openAbove
      ? Math.max(margin, rect.top - gap - availableHeight)
      : Math.min(window.innerHeight - margin - availableHeight, rect.bottom + gap);
    setPopoverStyle({
      position: "fixed",
      left,
      top,
      width,
      maxHeight: availableHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!selectorRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    updatePopoverPosition();
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition]);

  return (
    <div ref={selectorRef} className="relative nodrag nopan" style={{ zIndex: open ? 1200 : 100 }}>
      <button
        type="button"
        title="极点选择器 / Skill"
        onClick={() => {
          setOpen(value => !value);
          requestAnimationFrame(updatePopoverPosition);
        }}
        className="flex h-8 max-w-[74px] items-center gap-1 rounded-[var(--radius-md-design)] px-2 transition-colors"
        style={{
          background: activeSkill ? activeBg : bg,
          border: `1px solid ${activeSkill ? "oklch(0.62 0.22 290 / 45%)" : border}`,
          color: activeSkill ? activeText : text,
          fontSize: 11,
          lineHeight: "14px",
          letterSpacing: 0,
        }}
      >
        <CircleDot size={12} style={{ flex: "0 0 auto" }} />
        <span className="min-w-0 max-w-[38px] truncate">{activeSkill ? activeSkill.name : "Skill"}</span>
        <ChevronDown size={10} style={{ opacity: 0.65 }} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="model-selector-scroll overflow-y-auto rounded-[var(--radius-md-design)] p-1 shadow-2xl"
          style={{
            ...(popoverStyle || {}),
            background: popBg,
            border: `1px solid ${border}`,
            color: text,
            zIndex: 9999,
          }}
        >
          {activeSkill && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
                toast("已取消 Skill", { description: "输入框恢复为普通 AI 创作模式" });
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm-design)] px-2.5 py-2 text-left type-caption"
              style={{ color: isDark ? "rgba(255,255,255,0.58)" : "rgba(20,20,36,0.58)" }}
              onMouseEnter={event => { event.currentTarget.style.background = hoverBg; }}
              onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}
            >
              <X size={13} />
              取消当前 Skill
            </button>
          )}
          {groupedSkills.map(([group, skills]) => (
            <div key={group}>
              <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold" style={{ color: isDark ? "rgba(255,255,255,0.42)" : "rgba(20,20,36,0.42)" }}>
                {group}
              </div>
              {skills.map(skill => {
                const Icon = skill.icon;
                const active = activeSkill?.id === skill.id;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => {
                      const pendingSkill = createPendingSkillLoad(skill);
                      onChange(pendingSkill);
                      setOpen(false);
                      toast("Skill 已加载到画布", { description: pendingSkill.name });
                    }}
                    className="flex w-full items-start gap-2 rounded-[var(--radius-sm-design)] px-2.5 py-2 text-left transition-colors"
                    style={{ background: active ? activeBg : "transparent", color: active ? activeText : text }}
                    onMouseEnter={event => { if (!active) event.currentTarget.style.background = hoverBg; }}
                    onMouseLeave={event => { event.currentTarget.style.background = active ? activeBg : "transparent"; }}
                  >
                    <Icon size={15} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{skill.name}</span>
                      <span className="mt-0.5 block line-clamp-2 text-[11px]" style={{ color: isDark ? "rgba(255,255,255,0.46)" : "rgba(20,20,36,0.50)" }}>
                        {skill.summary}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
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
      className="fixed inset-x-0 flex justify-center"
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

// ── Text Floating Toolbar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 文字节点选中时显示的底部浮动工具栏
const FONT_FAMILIES = [
  "Inter", "Roboto", "Helvetica", "Arial", "Georgia",
  "Times New Roman", "Courier New", "Playfair Display", "Lato", "Montserrat",
  "Open Sans", "Noto Sans SC", "PingFang SC",
];
const FONT_WEIGHTS = [
  { label: "Thin", value: 100 },
  { label: "ExtraLight", value: 200 },
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "SemiBold", value: 600 },
  { label: "Bold", value: 700 },
  { label: "ExtraBold", value: 800 },
  { label: "Black", value: 900 },
];
const PRESET_COLORS_TEXT = ["", "#000000", "#ffffff", "#22c55e", "#a855f7", "#d8b4fe"];

function isValidHexColor(c: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(c);
}

// 颜色拾取器组件
function ColorPickerPanel({
  title, color, onColorChange, onClose, isDark,
}: {
  title: string;
  color: string;
  onColorChange: (c: string) => void;
  onClose: () => void;
  isDark: boolean;
}) {
  const bg = isDark ? "oklch(0.14 0.018 270)" : "oklch(0.99 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
  const textC = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.18 0.008 270)";
  const inputBg = isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 5%)";
  const inputBorder = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return { r, g, b };
  };
  const rgbToHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const rgbToHsv = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  };
  const hsvToRgb = (h: number, s: number, v: number) => {
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  };

  const safeColor = isValidHexColor(color) ? color : "#000000";
  const rgb0 = hexToRgb(safeColor);
  const hsv0 = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);

  const [hue, setHue] = useState(hsv0.h);
  const [sat, setSat] = useState(hsv0.s);
  const [val, setVal] = useState(hsv0.v);
  const [alpha, setAlpha] = useState(100);
  const [hexInput, setHexInput] = useState(safeColor.slice(1).toUpperCase());

  const gradientColor = (() => {
    const { r, g, b } = hsvToRgb(hue, 1, 1);
    return `rgb(${r},${g},${b})`;
  })();

  const updateFromHsv = useCallback((h: number, s: number, v: number) => {
    const { r, g, b } = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setHexInput(hex.slice(1).toUpperCase());
    onColorChange(hex);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onColorChange]);

  const satValRef = useRef<HTMLDivElement>(null);
  const isDraggingSV = useRef(false);
  const hueRef = useRef<HTMLDivElement>(null);
  const isDraggingHue = useRef(false);
  const alphaRef = useRef<HTMLDivElement>(null);
  const isDraggingAlpha = useRef(false);

  const handleSVMove = useCallback((e: MouseEvent) => {
    if (!satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    setSat(s); setVal(v);
    updateFromHsv(hue, s, v);
  }, [hue, updateFromHsv]);

  const handleHueMove = useCallback((e: MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    setHue(h);
    updateFromHsv(h, sat, val);
  }, [sat, val, updateFromHsv]);

  const handleAlphaMove = useCallback((e: MouseEvent) => {
    if (!alphaRef.current) return;
    const rect = alphaRef.current.getBoundingClientRect();
    const a = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    setAlpha(a);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDraggingSV.current) handleSVMove(e);
      if (isDraggingHue.current) handleHueMove(e);
      if (isDraggingAlpha.current) handleAlphaMove(e);
    };
    const onUp = () => {
      isDraggingSV.current = false;
      isDraggingHue.current = false;
      isDraggingAlpha.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [handleSVMove, handleHueMove, handleAlphaMove]);

  const thumbX = sat * 100;
  const thumbY = (1 - val) * 100;

  return (
    <div
      style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 12, padding: "16px", width: 260,
        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        color: textC, fontSize: 12,
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textC, opacity: 0.6, padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      <div
        ref={satValRef}
        style={{
          width: "100%", height: 140, borderRadius: 6, marginBottom: 10,
          position: "relative", cursor: "crosshair", userSelect: "none",
          background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${gradientColor})`,
        }}
        onMouseDown={e => { isDraggingSV.current = true; handleSVMove(e.nativeEvent); }}
      >
        <div style={{
          position: "absolute",
          left: `${thumbX}%`, top: `${thumbY}%`,
          transform: "translate(-50%, -50%)",
          width: 14, height: 14, borderRadius: "50%",
          border: "2px solid white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          pointerEvents: "none",
          background: safeColor,
        }} />
      </div>
      <div
        ref={hueRef}
        style={{
          width: "100%", height: 12, borderRadius: 6, marginBottom: 8,
          background: "linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
          position: "relative", cursor: "pointer", userSelect: "none",
        }}
        onMouseDown={e => { isDraggingHue.current = true; handleHueMove(e.nativeEvent); }}
      >
        <div style={{
          position: "absolute",
          left: `${(hue / 360) * 100}%`, top: "50%",
          transform: "translate(-50%, -50%)",
          width: 16, height: 16, borderRadius: "50%",
          border: "2px solid white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          background: gradientColor,
          pointerEvents: "none",
        }} />
      </div>
      <div
        ref={alphaRef}
        style={{
          width: "100%", height: 12, borderRadius: 6, marginBottom: 12,
          position: "relative", cursor: "pointer", userSelect: "none",
          background: `linear-gradient(to right, transparent, ${safeColor})`,
          backgroundImage: `linear-gradient(to right, transparent, ${safeColor}), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)`,
          backgroundSize: "auto, 8px 8px",
        }}
        onMouseDown={e => { isDraggingAlpha.current = true; handleAlphaMove(e.nativeEvent); }}
      >
        <div style={{
          position: "absolute",
          left: `${alpha}%`, top: "50%",
          transform: "translate(-50%, -50%)",
          width: 16, height: 16, borderRadius: "50%",
          border: "2px solid white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          background: safeColor,
          pointerEvents: "none",
        }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        {PRESET_COLORS_TEXT.map((pc, i) => (
          <button
            key={i}
            onClick={() => {
              if (pc === "") { onColorChange("transparent"); return; }
              const rgb2 = hexToRgb(pc);
              const hsv2 = rgbToHsv(rgb2.r, rgb2.g, rgb2.b);
              setHue(hsv2.h); setSat(hsv2.s); setVal(hsv2.v);
              setHexInput(pc.slice(1).toUpperCase());
              onColorChange(pc);
            }}
            style={{
              width: 24, height: 24, borderRadius: "50%",
              border: `2px solid ${pc === safeColor ? "oklch(0.65 0.22 290)" : "transparent"}`,
              background: pc === "" ? "none" : pc,
              cursor: "pointer", flexShrink: 0, padding: 0,
              backgroundImage: pc === "" ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)" : "none",
              backgroundSize: "8px 8px",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 6, padding: "4px 8px" }}>
          <span style={{ opacity: 0.5, fontSize: 11 }}>#</span>
          <input
            value={hexInput}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              setHexInput(v);
              if (v.length === 6) {
                const hex = "#" + v;
                const rgb3 = hexToRgb(hex);
                const hsv3 = rgbToHsv(rgb3.r, rgb3.g, rgb3.b);
                setHue(hsv3.h); setSat(hsv3.s); setVal(hsv3.v);
                onColorChange(hex);
              }
            }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: textC, fontSize: 11, fontFamily: "monospace", width: 0 }}
            spellCheck={false}
          />
        </div>
        <div style={{ width: 72, display: "flex", alignItems: "center", gap: 4, background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 6, padding: "4px 8px" }}>
          <input
            type="number" min={0} max={100} value={alpha}
            onChange={e => setAlpha(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: textC, fontSize: 11, width: 0 }}
          />
          <span style={{ opacity: 0.5, fontSize: 11 }}>%</span>
        </div>
      </div>
    </div>
  );
}

// 高级排版面板
function TypographyAdvancedPanel({
  data, onUpdate, onClose, isDark,
}: {
  data: Record<string, unknown>;
  onUpdate: (patch: Record<string, unknown>) => void;
  onClose: () => void;
  isDark: boolean;
}) {
  const bg = isDark ? "oklch(0.14 0.018 270)" : "oklch(0.99 0.004 270)";
  const border = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
  const textC = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.18 0.008 270)";
  const inputBg = isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 5%)";
  const inputBorder = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
  const btnBg = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 6%)";
  const btnActiveBg = "oklch(0.65 0.22 290 / 0.25)";
  const btnActiveColor = "oklch(0.72 0.18 290)";

  const lineHeight = (data.lineHeight as number) || 1.4;
  const letterSpacing = (data.letterSpacing as number) || 0;
  const textDecoration = (data.textDecoration as string) || "none";
  const textTransform = (data.textTransform as string) || "none";

  const inputStyle: React.CSSProperties = {
    background: inputBg, border: `1px solid ${inputBorder}`,
    borderRadius: 6, padding: "4px 8px",
    color: textC, fontSize: 11, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    background: active ? btnActiveBg : btnBg,
    color: active ? btnActiveColor : textC,
    border: "none", borderRadius: 6, cursor: "pointer",
    padding: "5px 10px", fontSize: 11, fontWeight: active ? 600 : 400,
    transition: "all 0.12s",
  });

  return (
    <div
      style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 12, padding: "14px 16px", width: 280,
        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        color: textC, fontSize: 12,
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>高级排版</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textC, opacity: 0.6, padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ opacity: 0.55, marginBottom: 4, fontSize: 11 }}>行高</div>
          <input type="number" step={0.1} min={0.5} max={5}
            value={lineHeight}
            onChange={e => onUpdate({ lineHeight: parseFloat(e.target.value) || 1.4 })}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ opacity: 0.55, marginBottom: 4, fontSize: 11 }}>字间距 (em)</div>
          <input type="number" step={0.01} min={-0.2} max={1}
            value={letterSpacing}
            onChange={e => onUpdate({ letterSpacing: parseFloat(e.target.value) || 0 })}
            style={inputStyle}
          />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ opacity: 0.55, marginBottom: 6, fontSize: 11 }}>文字装饰</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={toggleBtn(textDecoration === "underline")} onClick={() => onUpdate({ textDecoration: textDecoration === "underline" ? "none" : "underline" })}>
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <button style={toggleBtn(textDecoration === "line-through")} onClick={() => onUpdate({ textDecoration: textDecoration === "line-through" ? "none" : "line-through" })}>
            <span style={{ textDecoration: "line-through" }}>S</span>
          </button>
          <button style={toggleBtn(textDecoration === "overline")} onClick={() => onUpdate({ textDecoration: textDecoration === "overline" ? "none" : "overline" })}>
            <span style={{ textDecoration: "overline" }}>O</span>
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ opacity: 0.55, marginBottom: 6, fontSize: 11 }}>大小写转换</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "Aa", value: "none" },
            { label: "AA", value: "uppercase" },
            { label: "aa", value: "lowercase" },
            { label: "Aa·", value: "capitalize" },
          ].map(item => (
            <button key={item.value} style={toggleBtn(textTransform === item.value)} onClick={() => onUpdate({ textTransform: item.value })}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 文字工具底部浮动工具栏
function TextFloatingToolbar({
  isDark, nodeData, position, onUpdate, onDownload,
}: {
  isDark: boolean;
  nodeData: Record<string, unknown>;
  position: { left: number; top: number };
  onUpdate: (patch: Record<string, unknown>) => void;
  onDownload: () => void;
}) {
  const bg = isDark ? "rgba(22,22,30,0.92)" : "rgba(255,255,255,0.92)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const textC = isDark ? "rgba(255,255,255,0.82)" : "rgba(28,28,40,0.82)";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const divider = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const inputBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const activeColor = "oklch(0.65 0.22 290)";
  const activeBg = "oklch(0.65 0.22 290 / 0.18)";

  const fontFamily = (nodeData.fontFamily as string) || "Inter";
  const fontSize = (nodeData.fontSize as number) || 32;
  const fontWeight = (nodeData.fontWeight as number) || 400;
  const color = (nodeData.color as string) || "#ffffff";
  const textAlign = (nodeData.textAlign as string) || "left";
  const strokeColor = (nodeData.strokeColor as string) || "";
  const strokeWidth = (nodeData.strokeWidth as number) || 0;

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showWeightMenu, setShowWeightMenu] = useState(false);
  const [fontSizeInput, setFontSizeInput] = useState(String(fontSize));
  const [strokeWidthInput, setStrokeWidthInput] = useState(String(strokeWidth));

  useEffect(() => { setFontSizeInput(String(fontSize)); }, [fontSize]);
  useEffect(() => { setStrokeWidthInput(String(strokeWidth)); }, [strokeWidth]);

  const weightLabel = FONT_WEIGHTS.find(w => w.value === fontWeight)?.label || "Regular";

  const btnBase: React.CSSProperties = {
    background: "transparent", border: "none", cursor: "pointer",
    color: textC, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 6, transition: "all 0.12s", flexShrink: 0,
  };

  const alignIcons: Record<string, React.ReactNode> = {
    left: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="7.5" x2="10" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    center: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="4" y1="7.5" x2="11" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    right: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="5" y1="7.5" x2="13" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  };

  return (
    <div
      className="absolute nodrag nopan"
      style={{ left: position.left, top: position.top, transform: "translate(-50%, 0)", zIndex: 90 }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {showColorPicker && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 2300 }}>
          <ColorPickerPanel
            title="填充"
            color={isValidHexColor(color) ? color : "#000000"}
            onColorChange={c => onUpdate({ color: c })}
            onClose={() => setShowColorPicker(false)}
            isDark={isDark}
          />
        </div>
      )}
      {showStrokePicker && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 36, zIndex: 2300 }}>
          <ColorPickerPanel
            title="描边颜色"
            color={isValidHexColor(strokeColor) ? strokeColor : "#000000"}
            onColorChange={c => onUpdate({ strokeColor: c, strokeWidth: strokeWidth > 0 ? strokeWidth : 1 })}
            onClose={() => setShowStrokePicker(false)}
            isDark={isDark}
          />
        </div>
      )}
      {showAdvanced && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 2300 }}>
          <TypographyAdvancedPanel
            data={nodeData}
            onUpdate={onUpdate}
            onClose={() => setShowAdvanced(false)}
            isDark={isDark}
          />
        </div>
      )}
      {showAlignMenu && (
        <div
          style={{
            position: "absolute", bottom: "calc(100% + 8px)",
            left: "50%", transform: "translateX(-50%)",
            background: isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.96)",
            border: `1px solid ${border}`,
            borderRadius: 8, padding: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            display: "flex", gap: 2, zIndex: 2300,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {(["left", "center", "right"] as const).map(a => (
            <button
              key={a}
              style={{
                ...btnBase,
                width: 32, height: 32,
                background: textAlign === a ? activeBg : "transparent",
                color: textAlign === a ? activeColor : textC,
              }}
              onClick={() => { onUpdate({ textAlign: a }); setShowAlignMenu(false); }}
              onMouseEnter={e => { if (textAlign !== a) (e.currentTarget as HTMLElement).style.background = hover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = textAlign === a ? activeBg : "transparent"; }}
            >
              {alignIcons[a]}
            </button>
          ))}
        </div>
      )}
      {showFontMenu && (
        <div
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: 0,
            background: isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.96)",
            border: `1px solid ${border}`,
            borderRadius: 8, padding: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            maxHeight: 240, overflowY: "auto", minWidth: 160, zIndex: 2300,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {FONT_FAMILIES.map(f => (
            <button
              key={f}
              style={{
                display: "block", width: "100%", padding: "6px 12px",
                background: fontFamily === f ? activeBg : "transparent",
                color: fontFamily === f ? activeColor : textC,
                border: "none", cursor: "pointer", textAlign: "left",
                fontSize: 12, fontFamily: f, borderRadius: 4,
              }}
              onClick={() => { onUpdate({ fontFamily: f }); setShowFontMenu(false); }}
              onMouseEnter={e => { if (fontFamily !== f) (e.currentTarget as HTMLElement).style.background = hover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = fontFamily === f ? activeBg : "transparent"; }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      {showWeightMenu && (
        <div
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: 160,
            background: isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.96)",
            border: `1px solid ${border}`,
            borderRadius: 8, padding: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            maxHeight: 240, overflowY: "auto", minWidth: 120, zIndex: 2300,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {FONT_WEIGHTS.map(w => (
            <button
              key={w.value}
              style={{
                display: "block", width: "100%", padding: "6px 12px",
                background: fontWeight === w.value ? activeBg : "transparent",
                color: fontWeight === w.value ? activeColor : textC,
                border: "none", cursor: "pointer", textAlign: "left",
                fontSize: 12, fontWeight: w.value, borderRadius: 4,
              }}
              onClick={() => { onUpdate({ fontWeight: w.value }); setShowWeightMenu(false); }}
              onMouseEnter={e => { if (fontWeight !== w.value) (e.currentTarget as HTMLElement).style.background = hover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = fontWeight === w.value ? activeBg : "transparent"; }}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 0,
          background: bg, border: `1px solid ${border}`,
          borderRadius: 10, padding: "4px 6px",
          backdropFilter: "blur(16px)",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.12)",
          height: 44,
        }}
      >
        <button
          title="文字颜色"
          style={{ ...btnBase, width: 28, height: 28, padding: 0, position: "relative" }}
          onClick={() => { setShowColorPicker(v => !v); setShowStrokePicker(false); setShowAdvanced(false); setShowAlignMenu(false); setShowFontMenu(false); setShowWeightMenu(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            background: isValidHexColor(color) ? color : "#000",
            border: `2px solid ${isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"}`,
          }} />
        </button>
        {/* 描边颜色圆点 */}
        <button
          title="描边颜色"
          style={{ ...btnBase, width: 28, height: 28, padding: 0, position: "relative", marginLeft: 2 }}
          onClick={() => { setShowStrokePicker(v => !v); setShowColorPicker(false); setShowAdvanced(false); setShowAlignMenu(false); setShowFontMenu(false); setShowWeightMenu(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            background: isValidHexColor(strokeColor) ? strokeColor : "transparent",
            border: `2px solid ${isValidHexColor(strokeColor) ? strokeColor : (isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)")}`,
            backgroundImage: isValidHexColor(strokeColor) ? "none" : "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)",
            backgroundSize: "8px 8px",
          }} />
        </button>
        {/* 描边粗细输入 */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 4px" }}>
          <input
            type="number" min={0} max={40} step={0.5}
            value={strokeWidthInput}
            onChange={e => setStrokeWidthInput(e.target.value)}
            onBlur={() => {
              const v = parseFloat(strokeWidthInput);
              if (!isNaN(v) && v >= 0 && v <= 40) onUpdate({ strokeWidth: v });
              else setStrokeWidthInput(String(strokeWidth));
            }}
            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{
              width: 36, background: inputBg, border: `1px solid ${divider}`,
              borderRadius: 5, padding: "3px 5px", color: textC,
              fontSize: 11, outline: "none", textAlign: "center",
            }}
          />
          <span style={{ fontSize: 10, opacity: 0.45, flexShrink: 0 }}>px</span>
        </div>
        <div style={{ width: 1, height: 20, background: divider, margin: "0 6px", flexShrink: 0 }} />
        <button
          title="字体"
          style={{ ...btnBase, padding: "0 8px", height: 32, gap: 4, fontSize: 12, minWidth: 100 }}
          onClick={() => { setShowFontMenu(v => !v); setShowColorPicker(false); setShowStrokePicker(false); setShowAdvanced(false); setShowAlignMenu(false); setShowWeightMenu(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ fontFamily, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fontFamily}</span>
          <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
        </button>
        <div style={{ width: 1, height: 20, background: divider, margin: "0 2px", flexShrink: 0 }} />
        <button
          title="字重"
          style={{ ...btnBase, padding: "0 8px", height: 32, gap: 4, fontSize: 12, minWidth: 80 }}
          onClick={() => { setShowWeightMenu(v => !v); setShowColorPicker(false); setShowStrokePicker(false); setShowAdvanced(false); setShowAlignMenu(false); setShowFontMenu(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ fontWeight }}>{weightLabel}</span>
          <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
        </button>
        <div style={{ width: 1, height: 20, background: divider, margin: "0 2px", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
          <input
            type="number" min={6} max={400}
            value={fontSizeInput}
            onChange={e => setFontSizeInput(e.target.value)}
            onBlur={() => {
              const v = parseInt(fontSizeInput);
              if (!isNaN(v) && v >= 6 && v <= 400) onUpdate({ fontSize: v });
              else setFontSizeInput(String(fontSize));
            }}
            onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
            style={{
              width: 44, background: inputBg, border: `1px solid ${divider}`,
              borderRadius: 5, padding: "3px 6px", color: textC,
              fontSize: 12, outline: "none", textAlign: "center",
            }}
          />
          <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
        </div>
        <div style={{ width: 1, height: 20, background: divider, margin: "0 2px", flexShrink: 0 }} />
        <button
          title="对齐方式"
          style={{ ...btnBase, padding: "0 8px", height: 32, gap: 4 }}
          onClick={() => { setShowAlignMenu(v => !v); setShowColorPicker(false); setShowStrokePicker(false); setShowAdvanced(false); setShowFontMenu(false); setShowWeightMenu(false); }}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {alignIcons[textAlign] || alignIcons["left"]}
          <ChevronDown size={10} style={{ opacity: 0.5 }} />
        </button>
        <div style={{ width: 1, height: 20, background: divider, margin: "0 2px", flexShrink: 0 }} />
        <button
          title="高级排版"
          style={{
            ...btnBase, width: 32, height: 32,
            background: showAdvanced ? activeBg : "transparent",
            color: showAdvanced ? activeColor : textC,
          }}
          onClick={() => { setShowAdvanced(v => !v); setShowColorPicker(false); setShowStrokePicker(false); setShowAlignMenu(false); setShowFontMenu(false); setShowWeightMenu(false); }}
          onMouseEnter={e => { if (!showAdvanced) (e.currentTarget as HTMLElement).style.background = hover; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = showAdvanced ? activeBg : "transparent"; }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="9" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="2" y1="7.5" x2="13" y2="7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="5" cy="7.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="2" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="11" cy="11" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
        <div style={{ width: 1, height: 20, background: divider, margin: "0 2px", flexShrink: 0 }} />
        <button
          title="下载 PNG / SVG"
          style={{ ...btnBase, width: 32, height: 32 }}
          onClick={onDownload}
          onMouseEnter={e => (e.currentTarget.style.background = hover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Download size={15} />
        </button>
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
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const toolBg = isDark ? "rgba(22,22,30,0.88)" : "rgba(255,255,255,0.86)";
  const toolBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const iconColor = isDark ? "rgba(255,255,255,0.76)" : "rgba(28,28,40,0.82)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const tooltipBg = isDark ? "rgba(18,18,26,0.96)" : "rgba(30,30,40,0.92)";
  const moreBg = isDark ? "rgba(24,24,34,0.98)" : "rgba(255,255,255,0.98)";
  const moreText = isDark ? "rgba(255,255,255,0.88)" : "rgba(28,28,40,0.88)";
  const moreSub = isDark ? "rgba(255,255,255,0.48)" : "rgba(28,28,40,0.45)";
  const dividerColor = isDark ? "rgba(255,255,255,0.28)" : "rgba(28,28,40,0.22)";
  const tools = [
    { icon: <Move size={15} />, label: "移动对象", action: "move-object" },
    { icon: <RotateCw size={15} />, label: "旋转与反转", action: "flip-rotate" },
    { icon: <Crop size={15} />, label: "裁切", action: "crop" },
    { type: "divider" as const, key: "after-transform" },
    { icon: <AiDecoratedIcon cutoutBg={toolBg}><BadgeCheck size={15} /></AiDecoratedIcon>, label: "智能编辑", action: "quick-edit" },
    { icon: <AiDecoratedIcon cutoutBg={toolBg}><ImageOff size={15} /></AiDecoratedIcon>, label: "去背景", action: "remove-background" },
    { icon: <AiDecoratedIcon cutoutBg={toolBg}><Eraser size={15} /></AiDecoratedIcon>, label: "橡皮工具", action: "erase" },
    { icon: <AiDecoratedIcon cutoutBg={toolBg}><PanelTopOpen size={15} /></AiDecoratedIcon>, label: "编辑元素", action: "edit-elements" },
    { icon: <AiDecoratedIcon cutoutBg={toolBg}><Type size={15} /></AiDecoratedIcon>, label: "智能文案", action: "edit-text" },
    { icon: <HdIcon size={15} />, label: "HD 4K", action: "upscale" },
    { icon: <AiDecoratedIcon cutoutBg={toolBg}><Droplets size={15} /></AiDecoratedIcon>, label: "去水印", action: "remove-watermark" },
    { icon: <Expand size={15} />, label: "扩展", action: "expand" },
    { type: "divider" as const, key: "after-expand" },
    { icon: <MoreHorizontal size={15} />, label: "更多", action: "more" },
    { icon: <Download size={15} />, label: "下载", action: "download" },
  ];
  const moreItems = [
    { icon: <Shirt size={18} />, label: "多平台封面", action: "mockup" },
    { icon: <ImageIcon size={18} />, label: "调整", action: "adjust" },
    { icon: <Frame size={18} />, label: "矢量", action: "vector", cost: 9 },
  ];
  useEffect(() => {
    if (!moreOpen) return;
    const handler = () => setMoreOpen(false);
    const t = window.setTimeout(() => window.addEventListener("mousedown", handler), 40);
    return () => { window.clearTimeout(t); window.removeEventListener("mousedown", handler); };
  }, [moreOpen]);
  const buttonClass = "relative w-8 h-8 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all active:scale-90";
  const renderDivider = (key: string) => (
    <div
      key={key}
      aria-hidden="true"
      style={{
        width: 22,
        height: 2,
        borderRadius: 999,
        background: dividerColor,
        margin: "5px 0",
        flex: "0 0 auto",
      }}
    />
  );
  const renderButton = (item: { icon: ReactNode; label: string; action: string }) => (
    <div key={item.action} className="relative">
      {hoveredAction === item.action && (
        <div
          className="absolute left-full ml-2 top-1/2 pointer-events-none"
          style={{
            transform: "translateY(-50%)",
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
          <div style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderRight: `4px solid ${tooltipBg}` }} />
          {item.label}
        </div>
      )}
      <button
        aria-label={item.label}
        onClick={(e) => {
          e.stopPropagation();
          if (item.action === "more") {
            setMoreOpen(value => !value);
            return;
          }
          setMoreOpen(false);
          onAction(item.action);
        }}
        className={buttonClass}
        style={{ color: iconColor, background: item.action === "more" && moreOpen ? hoverBg : "transparent" }}
        onMouseEnter={e => { e.currentTarget.style.background = hoverBg; setHoveredAction(item.action); }}
        onMouseLeave={e => { e.currentTarget.style.background = item.action === "more" && moreOpen ? hoverBg : "transparent"; setHoveredAction(null); }}
      >
        {item.icon}
      </button>
    </div>
  );

  return (
    <div
      className="absolute nodrag nopan"
      style={{ left: position.left, top: position.top, transform: "translate(-100%, -50%)", zIndex: 1600 }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {moreOpen && (
        <div
          className="absolute left-full ml-2 top-1/2 overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
          style={{
            transform: "translateY(-50%)",
            width: 190,
            background: moreBg,
            border: `1px solid ${toolBorder}`,
            backdropFilter: "blur(18px)",
            boxShadow: isDark ? "0 18px 56px rgba(0,0,0,0.48)" : "0 12px 40px rgba(0,0,0,0.14)",
            padding: "8px 6px",
            zIndex: 20,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {moreItems.map(item => (
            <button
              key={item.action}
              className="relative flex w-full items-center gap-3 rounded-[var(--radius-md-design)] px-3 py-2.5 text-left transition-colors"
              style={{ color: moreText, fontSize: 14 }}
              onClick={() => { setMoreOpen(false); onAction(item.action); }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className="relative flex h-5 w-5 items-center justify-center" style={{ color: moreText, flexShrink: 0 }}>
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.cost && (
                <span className="flex items-center gap-1" style={{ color: moreSub, fontSize: 13 }}>
                  <Sparkles size={12} fill="currentColor" />
                  {item.cost}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
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
        {tools.map(item => item.type === "divider" ? renderDivider(item.key) : renderButton(item))}
      </div>
    </div>
  );
}


type AssetAdjustmentValues = {
  color: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
};

const DEFAULT_ASSET_ADJUSTMENTS: AssetAdjustmentValues = {
  color: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
};

function normalizeAssetAdjustments(value: unknown): AssetAdjustmentValues {
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const read = (key: keyof AssetAdjustmentValues, fallback = DEFAULT_ASSET_ADJUSTMENTS[key]) => {
    const raw = source[key];
    return typeof raw === "number" && Number.isFinite(raw) ? Math.max(-100, Math.min(100, raw)) : fallback;
  };
  const legacyTemperature = typeof source.temperature === "number" ? source.temperature : 0;
  const legacyTint = typeof source.tint === "number" ? source.tint : 0;
  return {
    color: read("color", Math.max(-100, Math.min(100, (legacyTemperature + legacyTint) / 2))),
    brightness: read("brightness", typeof source.exposure === "number" ? source.exposure : 0),
    contrast: read("contrast"),
    saturation: read("saturation"),
    sharpness: read("sharpness"),
  };
}

function areAssetAdjustmentsEqual(a: AssetAdjustmentValues, b: AssetAdjustmentValues) {
  return a.color === b.color
    && a.brightness === b.brightness
    && a.contrast === b.contrast
    && a.saturation === b.saturation
    && a.sharpness === b.sharpness;
}

function createAssetAdjustmentFilter(adjustments: AssetAdjustmentValues) {
  const brightness = Math.max(0.25, Math.min(2, 1 + adjustments.brightness / 130));
  const contrast = Math.max(0.25, Math.min(2.2, 1 + adjustments.contrast / 150));
  const saturation = Math.max(0, Math.min(2.6, 1 + adjustments.saturation / 120));
  const hueRotate = adjustments.color * 1.8;
  const softness = adjustments.sharpness < 0 ? ` blur(${Math.abs(adjustments.sharpness) * 0.025}px)` : "";
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)}) hue-rotate(${hueRotate.toFixed(1)}deg)${softness}`;
}

function loadImageForCanvas(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

type BrowserDirectoryHandle = {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<BrowserDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

type BrowserWindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
};

function sharpenCanvasImage(ctx: CanvasRenderingContext2D, width: number, height: number, sharpness: number) {
  if (sharpness <= 0 || width < 3 || height < 3) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const amount = Math.min(2.2, sharpness / 45);
  const center = 1 + 4 * amount;
  const side = -amount;
  const idx = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = idx(x, y);
      const top = idx(x, y - 1);
      const bottom = idx(x, y + 1);
      const left = idx(x - 1, y);
      const right = idx(x + 1, y);
      for (let c = 0; c < 3; c += 1) {
        out[i + c] = Math.max(0, Math.min(255,
          src[i + c] * center +
          src[top + c] * side +
          src[bottom + c] * side +
          src[left + c] * side +
          src[right + c] * side
        ));
      }
      out[i + 3] = src[i + 3];
    }
  }
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}

async function applyAssetAdjustmentsToImage(src: string, adjustments: AssetAdjustmentValues) {
  const image = await loadImageForCanvas(src);
  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("当前浏览器不支持图片处理");
  ctx.filter = createAssetAdjustmentFilter({ ...adjustments, sharpness: Math.min(0, adjustments.sharpness) });
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = "none";
  sharpenCanvasImage(ctx, width, height, adjustments.sharpness);
  return canvas.toDataURL("image/png");
}

async function createSocialMediaSizedImage(src: string, size: { width: number; height: number }, crop: SocialMediaExportPayload["crop"]) {
  const image = await loadImageForCanvas(src);
  const naturalW = Math.max(1, image.naturalWidth || image.width);
  const naturalH = Math.max(1, image.naturalHeight || image.height);
  const cropX = Math.max(0, Math.min(1, crop.x));
  const cropY = Math.max(0, Math.min(1, crop.y));
  const cropW = Math.max(0.02, Math.min(1 - cropX, crop.width));
  const cropH = Math.max(0.02, Math.min(1 - cropY, crop.height));
  const sx = Math.round(cropX * naturalW);
  const sy = Math.round(cropY * naturalH);
  const sw = Math.max(1, Math.round(cropW * naturalW));
  const sh = Math.max(1, Math.round(cropH * naturalH));
  const sourceRatio = sw / sh;
  const targetRatio = size.width / size.height;
  let nextSx = sx;
  let nextSy = sy;
  let nextSw = sw;
  let nextSh = sh;
  if (sourceRatio > targetRatio) {
    nextSw = Math.max(1, Math.round(sh * targetRatio));
    nextSx = sx + Math.round((sw - nextSw) / 2);
  } else if (sourceRatio < targetRatio) {
    nextSh = Math.max(1, Math.round(sw / targetRatio));
    nextSy = sy + Math.round((sh - nextSh) / 2);
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持图片处理");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, nextSx, nextSy, nextSw, nextSh, 0, 0, size.width, size.height);
  return canvas.toDataURL("image/png");
}

async function createMultiPlatformCoverBlob(
  src: string,
  size: { width: number; height: number },
  transform: NonNullable<SocialMediaExportPayload["transform"]>,
  format: NonNullable<SocialMediaExportPayload["format"]>,
) {
  const image = await loadImageForCanvas(src);
  const naturalW = Math.max(1, image.naturalWidth || image.width);
  const naturalH = Math.max(1, image.naturalHeight || image.height);
  const targetRatio = size.width / size.height;
  const baseScale = naturalW / naturalH > targetRatio
    ? size.height / naturalH
    : size.width / naturalW;
  const drawScale = baseScale * Math.max(1, transform.scale || 1);
  const drawW = naturalW * drawScale;
  const drawH = naturalH * drawScale;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持图片处理");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
  } else {
    ctx.clearRect(0, 0, size.width, size.height);
  }
  ctx.drawImage(
    image,
    (size.width - drawW) / 2 + transform.offsetX * size.width,
    (size.height - drawH) / 2 + transform.offsetY * size.height,
    drawW,
    drawH,
  );
  const mimeType = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, format === "png" ? undefined : 0.94));
  if (!blob) throw new Error("图片导出失败");
  return blob;
}

function SocialMediaSizePanel({
  isDark,
  imageSrc,
  onClose,
  onGenerate,
}: {
  isDark: boolean;
  imageSrc?: string;
  onClose: () => void;
  onGenerate: (payload: SocialMediaExportPayload) => void;
}) {
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const [exportFormat, setExportFormat] = useState<"png" | "jpg" | "webp">("png");
  const [coverTransform, setCoverTransform] = useState({ offsetX: 0, offsetY: 0, scale: 1 });
  const dragRef = useRef<null | {
    startX: number;
    startY: number;
    startTransform: { offsetX: number; offsetY: number; scale: number };
    bounds: DOMRect;
  }>(null);
  const bg = isDark ? "rgba(24,24,34,0.98)" : "rgba(255,255,255,0.98)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(28,28,40,0.88)";
  const sub = isDark ? "rgba(255,255,255,0.50)" : "rgba(28,28,40,0.48)";
  const field = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const selectedPresets = SOCIAL_MEDIA_SIZE_PRESETS.filter(item => selectedPresetIds.includes(item.id));
  const validCustom = customEnabled && customWidth >= 64 && customHeight >= 64;
  const canGenerate = selectedPresets.length > 0 || validCustom;
  const previewPreset = selectedPresets[0] || (validCustom ? {
    id: "custom",
    platform: "自定义",
    title: "自定义封面",
    width: customWidth,
    height: customHeight,
    tone: "oklch(0.62 0.22 290)",
  } : SOCIAL_MEDIA_SIZE_PRESETS[0]);
  const previewRatio = Math.max(0.2, Math.min(3.2, previewPreset.width / previewPreset.height));

  const togglePreset = (id: string) => {
    setSelectedPresetIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const selectAllPresets = () => {
    setSelectedPresetIds(SOCIAL_MEDIA_SIZE_PRESETS.map(preset => preset.id));
  };

  const clearSelectedPresets = () => {
    setSelectedPresetIds([]);
    setCustomEnabled(false);
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: event.clientX, startY: event.clientY, startTransform: coverTransform, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / Math.max(1, drag.bounds.width);
    const dy = (event.clientY - drag.startY) / Math.max(1, drag.bounds.height);
    setCoverTransform({
      ...drag.startTransform,
      offsetX: Math.max(-1, Math.min(1, drag.startTransform.offsetX + dx)),
      offsetY: Math.max(-1, Math.min(1, drag.startTransform.offsetY + dy)),
    });
  };

  const handleCropPointerUp = () => {
    dragRef.current = null;
  };

  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCoverTransform(prev => ({
      ...prev,
      scale: Math.max(1, Math.min(4, Number((prev.scale + (event.deltaY > 0 ? -0.08 : 0.08)).toFixed(2)))),
    }));
  };

  return (
    <div
      className="absolute nodrag nopan rounded-[var(--radius-lg-design)] shadow-2xl"
      style={{
        right: 24,
        top: "max(8px, 64px - 200px)",
        width: 420,
        height: "min(820px, calc(100vh - 92px))",
        minHeight: "min(600px, calc(100vh - 92px))",
        display: "flex",
        flexDirection: "column",
        background: bg,
        border: `1px solid ${border}`,
        backdropFilter: "blur(20px)",
        zIndex: 2300,
        overflow: "hidden",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
        <div>
          <p style={{ color: text, fontSize: 14, fontWeight: 650 }}>多平台封面</p>
          <p style={{ color: sub, fontSize: 11, marginTop: 2 }}>可多选平台尺寸，统一调节后一次性批量保存。</p>
        </div>
        <button className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md-design)]" style={{ color: sub }} onClick={onClose} aria-label="关闭">
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
        <div
          className="relative mx-auto mb-3 overflow-hidden rounded-[var(--radius-md-design)]"
          style={{
            aspectRatio: `${previewPreset.width}/${previewPreset.height}`,
            width: previewRatio < 0.82 ? "58%" : "100%",
            maxHeight: 300,
            background: field,
            border: `1px solid ${border}`,
            cursor: "grab",
          }}
          onPointerDown={handleCropPointerDown}
          onPointerMove={handleCropPointerMove}
          onPointerUp={handleCropPointerUp}
          onPointerCancel={handleCropPointerUp}
          onWheel={handlePreviewWheel}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="多平台封面裁取预览"
              draggable={false}
              className="absolute h-full w-full object-cover"
              style={{
                left: `${coverTransform.offsetX * 100}%`,
                top: `${coverTransform.offsetY * 100}%`,
                transform: `scale(${coverTransform.scale})`,
                transformOrigin: "center",
              }}
            />
          ) : null}
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.26)" }} />
          <div className="absolute bottom-2 left-2 rounded-[var(--radius-md-design)] px-2 py-1" style={{ background: "rgba(0,0,0,0.42)", color: "white", fontSize: 11 }}>
            拖拽调整位置，滚轮缩放内容
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {(["png", "jpg", "webp"] as const).map(format => {
            const active = exportFormat === format;
            return (
              <button
                key={format}
                className="h-8 rounded-[var(--radius-md-design)] text-[11px] font-semibold uppercase transition-all active:scale-95"
                style={{
                  background: active ? "oklch(0.58 0.22 290 / 0.18)" : field,
                  border: `1px solid ${active ? "oklch(0.62 0.22 290 / 0.56)" : border}`,
                  color: active ? "oklch(0.78 0.18 290)" : text,
                }}
                onClick={() => setExportFormat(format)}
              >
                {format === "jpg" ? "JPG" : format.toUpperCase()}
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className="rounded-[var(--radius-md-design)] px-2 py-1"
            style={{ background: field, border: `1px solid ${border}`, color: sub, fontSize: 11 }}
          >
            已选 {selectedPresets.length + (validCustom ? 1 : 0)} 个封面尺寸
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-7 rounded-[var(--radius-md-design)] px-2 text-[11px] font-semibold active:scale-95"
              style={{ background: field, border: `1px solid ${border}`, color: text }}
              onClick={selectAllPresets}
            >
              全选
            </button>
            <button
              type="button"
              className="h-7 rounded-[var(--radius-md-design)] px-2 text-[11px] font-semibold active:scale-95"
              style={{ background: field, border: `1px solid ${border}`, color: text }}
              onClick={clearSelectedPresets}
            >
              清空
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SOCIAL_MEDIA_SIZE_PRESETS.map(preset => {
            const active = selectedPresetIds.includes(preset.id);
            return (
              <button
                key={preset.id}
                className="flex items-center gap-2 rounded-[var(--radius-md-design)] p-2 text-left transition-all active:scale-[0.98]"
                style={{
                  background: active ? "oklch(0.58 0.22 290 / 0.18)" : field,
                  border: `1px solid ${active ? "oklch(0.62 0.22 290 / 0.56)" : border}`,
                  color: text,
                }}
                onClick={() => togglePreset(preset.id)}
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md-design)]" style={{ background: preset.tone }}>
                  <SocialPlatformIcon platform={preset.platform} />
                  <div
                    className="absolute bottom-1 right-1"
                    style={{
                      width: preset.width >= preset.height ? 14 : Math.max(7, Math.round(14 * preset.width / preset.height)),
                      height: preset.height >= preset.width ? 14 : Math.max(7, Math.round(14 * preset.height / preset.width)),
                      borderRadius: 2,
                      border: "1.5px solid rgba(255,255,255,0.9)",
                      background: "rgba(255,255,255,0.16)",
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <p style={{ fontSize: 12, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preset.platform}</p>
                  <p style={{ color: sub, fontSize: 10, marginTop: 2 }}>{preset.width} × {preset.height}</p>
                  <p style={{ color: sub, fontSize: 10, marginTop: 1 }}>{preset.title}</p>
                </div>
                {active && <Check size={14} className="ml-auto shrink-0" style={{ color: "oklch(0.72 0.20 290)" }} />}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-[var(--radius-md-design)] p-3" style={{ background: field, border: `1px solid ${border}` }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2" style={{ color: text, fontSize: 12, fontWeight: 650 }}>
              <input type="checkbox" checked={customEnabled} onChange={event => setCustomEnabled(event.target.checked)} />
              自定义尺寸
            </label>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-95"
              title="重置预览"
              aria-label="重置预览"
              style={{
                background: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)",
                color: text,
                border: `1px solid ${border}`,
              }}
              onClick={() => setCoverTransform({ offsetX: 0, offsetY: 0, scale: 1 })}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label style={{ color: sub, fontSize: 11 }}>
              宽度
              <input
                type="number"
                min={64}
                max={8192}
                value={customWidth}
                disabled={!customEnabled}
                onChange={event => setCustomWidth(Math.max(64, Math.min(8192, Number(event.target.value) || 64)))}
                className="mt-1 h-8 w-full rounded-[var(--radius-md-design)] px-2 outline-none"
                style={{ background: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)", color: text, border: `1px solid ${border}` }}
              />
            </label>
            <label style={{ color: sub, fontSize: 11 }}>
              高度
              <input
                type="number"
                min={64}
                max={8192}
                value={customHeight}
                disabled={!customEnabled}
                onChange={event => setCustomHeight(Math.max(64, Math.min(8192, Number(event.target.value) || 64)))}
                className="mt-1 h-8 w-full rounded-[var(--radius-md-design)] px-2 outline-none"
                style={{ background: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)", color: text, border: `1px solid ${border}` }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 px-3 py-3" style={{ borderTop: `1px solid ${border}`, background: bg }}>
        <button className="h-9 flex-1 rounded-[var(--radius-md-design)] active:scale-95" style={{ background: field, color: text, fontSize: 13, border: `1px solid ${border}` }} onClick={onClose}>
          取消
        </button>
        <button
          className="h-9 flex-1 rounded-[var(--radius-md-design)] active:scale-95 disabled:cursor-not-allowed"
          disabled={!canGenerate}
          style={{
            background: canGenerate ? "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))" : field,
            color: canGenerate ? "white" : sub,
            fontSize: 13,
            fontWeight: 650,
            opacity: canGenerate ? 1 : 0.58,
          }}
          onClick={() => onGenerate({
            presets: selectedPresets,
            customSize: validCustom ? { width: customWidth, height: customHeight } : undefined,
            crop: { x: 0, y: 0, width: 1, height: 1 },
            transform: coverTransform,
            format: exportFormat,
          })}
        >
          {canGenerate ? `批量导出 ${selectedPresets.length + (validCustom ? 1 : 0)} 张` : "批量导出"}
        </button>
      </div>
    </div>
  );
}

function AssetMoreCommandPanel({ isDark, command, initialAdjustments, imageSrc, onClose, onApply, onPreviewChange }: {
  isDark: boolean;
  command: string;
  initialAdjustments?: AssetAdjustmentValues;
  onClose: () => void;
  onApply: (action: string, adjustments?: AssetAdjustmentValues) => void;
  imageSrc?: string;
  onPreviewChange?: (adjustments: AssetAdjustmentValues) => void;
}) {
  const [adjustments, setAdjustments] = useState<AssetAdjustmentValues>(initialAdjustments || DEFAULT_ASSET_ADJUSTMENTS);
  const [renderedPreview, setRenderedPreview] = useState("");
  const onPreviewChangeRef = useRef(onPreviewChange);
  const didPublishPreviewRef = useRef(false);
  const previewFilter = createAssetAdjustmentFilter(adjustments);
  const bg = isDark ? "rgba(24,24,34,0.98)" : "rgba(255,255,255,0.98)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(28,28,40,0.88)";
  const sub = isDark ? "rgba(255,255,255,0.50)" : "rgba(28,28,40,0.48)";
  const field = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const hover = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)";
  const config: Record<string, { title: string; description: string; actions: string[] }> = {
    mockup: { title: "多平台封面", description: "选择平台封面规格并导出本地图片。", actions: [] },
    expand: { title: "扩展", description: "按比例扩展画面边界，保留主体视觉。", actions: ["1:1", "4:5", "16:9"] },
    adjust: { title: "调整", description: "实时调整图片色彩、亮度、对比度、饱和度和锐利度。", actions: [] },
    crop: { title: "裁切", description: "选择裁切比例，图片节点会更新为新的尺寸。", actions: ["自由", "1:1", "3:4", "4:3", "16:9", "9:16"] },
    vector: { title: "矢量", description: "将图片轮廓转为可编辑矢量元素。", actions: ["提取轮廓", "扁平化", "高清矢量"] },
  };
  const current = config[command] || config.adjust;
  const adjustItems: Array<{ key: keyof AssetAdjustmentValues; label: string }> = [
    { key: "color", label: "色彩" },
    { key: "brightness", label: "亮度" },
    { key: "contrast", label: "对比度" },
    { key: "saturation", label: "饱和度" },
    { key: "sharpness", label: "锐利度" },
  ];

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  useEffect(() => {
    if (command !== "adjust") return;
    if (!didPublishPreviewRef.current) {
      didPublishPreviewRef.current = true;
      return;
    }
    onPreviewChangeRef.current?.(adjustments);
  }, [adjustments, command]);

  useEffect(() => {
    if (command !== "adjust" || !imageSrc) {
      setRenderedPreview("");
      return;
    }
    let cancelled = false;
    applyAssetAdjustmentsToImage(imageSrc, adjustments)
      .then(result => {
        if (!cancelled) setRenderedPreview(result);
      })
      .catch(() => {
        if (!cancelled) setRenderedPreview("");
      });
    return () => {
      cancelled = true;
    };
  }, [adjustments, command, imageSrc]);

  return (
    <div
      className="absolute nodrag nopan rounded-[var(--radius-lg-design)] shadow-2xl"
      style={{
        right: 24,
        top: 82,
        width: 280,
        background: bg,
        border: `1px solid ${border}`,
        backdropFilter: "blur(20px)",
        zIndex: 2300,
        overflow: "hidden",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
        <div>
          <p style={{ color: text, fontSize: 14, fontWeight: 650 }}>{current.title}</p>
          <p style={{ color: sub, fontSize: 11, marginTop: 2 }}>{current.description}</p>
        </div>
        <button className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md-design)]" style={{ color: sub }} onClick={onClose} aria-label="关闭">
          <X size={14} />
        </button>
      </div>
      <div className="p-3">
        {command === "adjust" ? (
          <div className="flex flex-col gap-3 py-1">
            {imageSrc && (
              <div
                className="relative overflow-hidden rounded-[var(--radius-md-design)]"
                style={{
                  aspectRatio: "16/10",
                  background: field,
                  border: `1px solid ${border}`,
                }}
              >
                <img
                  src={renderedPreview || imageSrc}
                  alt="调整预览"
                  draggable={false}
                  className="h-full w-full object-contain"
                  style={{ filter: renderedPreview ? "none" : previewFilter }}
                />
              </div>
            )}
            {adjustItems.map(item => (
              <label key={item.key} className="grid items-center gap-3" style={{ gridTemplateColumns: "94px 1fr" }}>
                <span
                  style={{
                    color: text,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.label}
                </span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={adjustments[item.key]}
                  aria-label={item.label}
                  onChange={event => setAdjustments(prev => ({ ...prev, [item.key]: Number(event.target.value) }))}
                  style={{
                    width: "100%",
                    accentColor: "white",
                  }}
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {current.actions.map(action => (
              <button
                key={action}
                className="rounded-[var(--radius-md-design)] px-2 py-2 transition-colors active:scale-95"
                style={{ background: field, border: `1px solid ${border}`, color: text, fontSize: 12 }}
                onClick={() => onApply(`${current.title} · ${action}`)}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = field)}
              >
                {action}
              </button>
            ))}
          </div>
        )}
        <button
          className="mt-3 flex h-9 w-full items-center justify-center rounded-[var(--radius-md-design)] active:scale-95"
          style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white", fontSize: 13, fontWeight: 650 }}
          onClick={() => onApply(current.title, command === "adjust" ? adjustments : undefined)}
        >
          {command === "adjust" ? "应用图片" : command === "vector" ? "生成新图片" : "应用到当前图片"}
        </button>
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
  const [model, setModel] = useState("auto");
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
  color?: string;
}

type GlobalAnnotation = Annotation & { nodeId: string };

type AnnotationReference = {
  id: string;
  nodeId: string;
  title: string;
  src: string;
  x: number;
  y: number;
  text: string;
};

// ── AnnotationBubble 组件 ──
function AnnotationBubble({
  ann, isDark, onUpdate, onRemove, onAiEdit, onAddReference, isReferenceActive
}: {
  ann: Annotation;
  isDark: boolean;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onRemove: (id: string) => void;
  onAiEdit: (id: string, text: string) => void;
  onAddReference: (id: string, text: string) => void;
  isReferenceActive?: boolean;
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
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [ann.open, ann.id, ann.text, onUpdate, onRemove]);

  const bubbleBg = isDark ? "rgba(22,22,34,0.97)" : "rgba(255,255,255,0.98)";
  const bubbleBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,30,0.90)";
  const subColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";
  const iconBtnColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  const iconBtnHover = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)";
  const annotationColors = [
    "oklch(0.72 0.19 48)",
    "oklch(0.66 0.22 290)",
    "oklch(0.68 0.18 150)",
    "oklch(0.70 0.16 225)",
    "oklch(0.72 0.18 25)",
  ];
  const accentColor = ann.color || annotationColors[0];
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
          <span
            style={{
              transform: "rotate(45deg)",
              color: "white",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: 1,
              fontFamily: "Inter, sans-serif",
            }}
          >
            C
          </span>
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            borderBottom: `1px solid ${ann.done ? doneBorder : bubbleBorder}`,
          }}
        >
          {annotationColors.map(color => {
            const selected = accentColor === color;
            return (
              <button
                key={color}
                aria-label="选择注释颜色"
                title="选择注释颜色"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: color,
                  border: selected ? "2px solid rgba(255,255,255,0.96)" : "2px solid transparent",
                  boxShadow: selected
                    ? `0 0 0 2px ${color}, 0 2px 8px rgba(0,0,0,0.24)`
                    : "0 1px 4px rgba(0,0,0,0.18)",
                  cursor: "pointer",
                }}
                onClick={() => onUpdate(ann.id, { color })}
              />
            );
          })}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 10px 10px",
            borderTop: `1px solid ${ann.done ? doneBorder : bubbleBorder}`,
          }}
        >
          <button
            type="button"
            className="type-caption"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              borderRadius: 6,
              border: `1px solid ${bubbleBorder}`,
              background: isReferenceActive ? `${accentColor}22` : "transparent",
              color: isReferenceActive ? accentColor : textColor,
              padding: "5px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onClick={() => {
              const nextText = (ann.editing ? draft : ann.text).trim();
              onUpdate(ann.id, { text: nextText, editing: false });
              onAddReference(ann.id, nextText);
            }}
          >
            <PlusCircle size={12} />
            {isReferenceActive ? "已引用" : "加入引用"}
          </button>
          <button
            type="button"
            className="type-caption"
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              borderRadius: 6,
              border: "none",
              background: `linear-gradient(135deg, ${accentColor}, oklch(0.70 0.18 205))`,
              color: "white",
              padding: "5px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 8px 18px rgba(0,0,0,0.16)",
            }}
            onClick={() => {
              const nextText = (ann.editing ? draft : ann.text).trim();
              onUpdate(ann.id, { text: nextText, editing: false });
              onAiEdit(ann.id, nextText);
            }}
          >
            <WandSparkles size={12} />
            AI 修改
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetInlineNote({
  text,
  open,
  editing,
  isDark,
  onUpdate,
}: {
  text: string;
  open: boolean;
  editing: boolean;
  isDark: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    if (editing || open) setDraft(text);
  }, [editing, open, text]);

  if (!open) return null;

  const bubbleBg = isDark ? "rgba(18,18,28,0.96)" : "rgba(255,255,255,0.98)";
  const bubbleBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const textColor = isDark ? "rgba(255,255,255,0.86)" : "rgba(24,24,36,0.86)";
  const subColor = isDark ? "rgba(255,255,255,0.48)" : "rgba(24,24,36,0.48)";
  const iconBtnHover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const accentColor = "oklch(0.62 0.22 290)";

  const removeNote = () => onUpdate({ note: "", noteOpen: false, noteEditing: false });
  const closeLikeAnnotation = () => {
    const nextText = (editing ? draft : text).trim();
    if (nextText) {
      onUpdate({ note: nextText, noteOpen: false, noteEditing: false });
    } else {
      removeNote();
    }
  };
  const cancelEdit = () => {
    if (text.trim()) {
      setDraft(text);
      onUpdate({ noteEditing: false });
    } else {
      removeNote();
    }
  };
  const saveNote = () => {
    const nextText = draft.trim();
    if (!nextText) {
      removeNote();
      return;
    }
    onUpdate({ note: nextText, noteOpen: true, noteEditing: false });
  };

  return (
    <div
      className="absolute nodrag nopan"
      style={{
        top: "calc(100% + 10px)",
        left: "50%",
        width: "min(320px, max(220px, 100%))",
        transform: "translateX(-50%)",
        zIndex: 5000,
        color: textColor,
      }}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        style={{
          background: bubbleBg,
          border: `1px solid ${bubbleBorder}`,
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          backdropFilter: "blur(16px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 6px 6px 10px",
            borderBottom: `1px solid ${bubbleBorder}`,
          }}
        >
          <span style={{ fontSize: 10, color: subColor, letterSpacing: "0.03em" }}>文本备注</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              title={text.trim() || draft.trim() ? "折叠备注" : "撤销备注"}
              style={{ width: 22, height: 22, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: subColor, background: "transparent", border: "none", cursor: "pointer" }}
              onClick={closeLikeAnnotation}
              onMouseEnter={e => (e.currentTarget.style.background = iconBtnHover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <X size={12} />
            </button>
            <button
              title="完成并删除备注"
              style={{
                width: 34,
                height: 22,
                borderRadius: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: subColor,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 600,
              }}
              onClick={removeNote}
              onMouseEnter={e => (e.currentTarget.style.background = iconBtnHover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Done
            </button>
          </div>
        </div>

        {editing ? (
          <div style={{ padding: "8px 10px 10px" }}>
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="输入图片备注..."
              rows={3}
              autoFocus
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
              onKeyDown={event => {
                if (event.key === "Escape") cancelEdit();
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) saveNote();
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
              <button
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, background: "transparent", border: `1px solid ${bubbleBorder}`, color: subColor, cursor: "pointer" }}
                onClick={cancelEdit}
              >
                取消
              </button>
              <button
                style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, background: accentColor, border: "none", color: "white", cursor: "pointer" }}
                onClick={saveNote}
              >
                备注
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{ padding: "9px 10px 10px", fontSize: 12, lineHeight: 1.6, color: textColor, minHeight: 34, cursor: "text", whiteSpace: "pre-wrap" }}
            onClick={() => {
              setDraft(text);
              onUpdate({ noteEditing: true });
            }}
          >
            {text || <span style={{ color: subColor, fontStyle: "italic" }}>点击编辑备注...</span>}
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
  const { setNodes: setFlowNodes, getNode } = useReactFlow();
  const nodeId = (data as { id?: string }).id || "";
  const [toolMode, setToolMode] = useState<string>("move");
  // 图片尺寸状态（支持拖拽缩放）
  const [imgW, setImgW] = useState<number>((data.imgW as number) || 0);
  const [imgH, setImgH] = useState<number>((data.imgH as number) || 0);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startClientX: number; startClientY: number; startNodeX: number; startNodeY: number; startW: number; startH: number; direction: "nw" | "ne" | "se" | "sw" } | null>(null);
  const resizingNodeRef = useRef(false);
  const [cropRect, setCropRect] = useState({ x: 10, y: 10, w: 80, h: 80 });
  const cropDragRef = useRef<null | { edge: "left" | "right" | "top" | "bottom"; startClientX: number; startClientY: number; startRect: { x: number; y: number; w: number; h: number } }>(null);
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
  const asset = GENERATED_ASSETS.find(a => a.id === (data.assetId as string));
  const isGeneratingImage = Boolean((data as { isGeneratingImage?: boolean }).isGeneratingImage);
  const isGenerationFailed = Boolean((data as { isGenerationFailed?: boolean }).isGenerationFailed);
  const isRemovingBackground = Boolean((data as { isRemovingBackground?: boolean }).isRemovingBackground);
  const isErasingImage = Boolean((data as { isErasingImage?: boolean }).isErasingImage);
  const isExtractingText = Boolean((data as { isExtractingText?: boolean }).isExtractingText);
  const isAiProcessingImage = isGeneratingImage || isGenerationFailed || isRemovingBackground || isErasingImage;
  const processingLabel = ((data as { processingTitle?: string }).processingTitle || (isGenerationFailed ? AI_GENERATION_NETWORK_ERROR_MESSAGE : isGeneratingImage ? "正在开足马力为您生成图片" : isErasingImage ? "AI 擦除中" : isRemovingBackground ? "AI 去背景中" : "AI 处理中")) as string;
  const processingSubtitle = ((data as { processingSubtitle?: string }).processingSubtitle || "") as string;
  const processingLines = (() => {
    if (isGenerationFailed) return ["生成图片失败", AI_GENERATION_NETWORK_ERROR_MESSAGE];
    if (isGeneratingImage) return ["正在开足马力", "为您生成图片"];
    if (processingSubtitle) return [processingLabel, processingSubtitle];
    const midpoint = Math.ceil(processingLabel.length / 2);
    return [processingLabel.slice(0, midpoint), processingLabel.slice(midpoint)].filter(Boolean);
  })();
  const displaySrc = isAiProcessingImage ? "" : (localSrc || asset?.src || "");
  const sourceBackgroundSrc = (data as { sourceBackgroundSrc?: string }).sourceBackgroundSrc;
  const isEditing = !!(data as { isEditing?: boolean }).isEditing;
  const isCropping = !!(data as { isCropping?: boolean }).isCropping;
  const isErasing = !!(data as { isErasing?: boolean }).isErasing;
  const isExpanding = !!(data as { isExpanding?: boolean }).isExpanding;
  const extractedText = ((data as { extractedText?: string }).extractedText || "") as string;
  const extractedTextPanelOpen = Boolean((data as { extractedTextPanelOpen?: boolean }).extractedTextPanelOpen);
  const isApplyingExtractedText = Boolean((data as { isApplyingExtractedText?: boolean }).isApplyingExtractedText);
  const noteText = ((data as { note?: string }).note || "") as string;
  const noteOpen = Boolean((data as { noteOpen?: boolean }).noteOpen);
  const noteEditing = Boolean((data as { noteEditing?: boolean }).noteEditing);
  const [eraseBrushSize, setEraseBrushSize] = useState<number>(Number((data as { eraseBrushSize?: number }).eraseBrushSize) || 42);
  const eraseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eraseMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eraseDrawingRef = useRef(false);
  const eraseLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const eraseHasPaintRef = useRef(false);
  const [extractedTextDraft, setExtractedTextDraft] = useState(extractedText);
  const extractedTextPanelRef = useRef<HTMLDivElement | null>(null);
  const displayTitle = (data.title as string) || asset?.title || "素材节点";
  const rotation = (data.rotation as number) || 0;
  const flipX = Boolean(data.flipX);
  const stableUiScale = 1 / Math.max(0.2, viewport.zoom || 1);
  const assetAdjustments = normalizeAssetAdjustments((data.assetAdjustmentPreview as AssetAdjustmentValues | undefined) || data.assetAdjustments);
  const assetAdjustmentFilter = createAssetAdjustmentFilter(assetAdjustments);
  const cropX = Math.max(0, Math.min(100, Number((data as { cropX?: number }).cropX ?? 0)));
  const cropY = Math.max(0, Math.min(100, Number((data as { cropY?: number }).cropY ?? 0)));
  const cropW = Math.max(1, Math.min(100 - cropX, Number((data as { cropW?: number }).cropW ?? 100)));
  const cropH = Math.max(1, Math.min(100 - cropY, Number((data as { cropH?: number }).cropH ?? 100)));
  const frameClipInsets = (data as {
    frameClipInsets?: { top: number; right: number; bottom: number; left: number };
  }).frameClipInsets;
  const frameClipStyle: React.CSSProperties | undefined = frameClipInsets
    ? {
        clipPath: `inset(${frameClipInsets.top}px ${frameClipInsets.right}px ${frameClipInsets.bottom}px ${frameClipInsets.left}px)`,
      }
    : undefined;
  const imgCropStyle: React.CSSProperties = isCropping || cropX > 0 || cropY > 0 || cropW < 100 || cropH < 100
    ? {
        position: "absolute",
        left: `${-(cropX / cropW) * 100}%`,
        top: `${-(cropY / cropH) * 100}%`,
        width: `${10000 / cropW}%`,
        height: `${10000 / cropH}%`,
      }
    : { width: "100%", height: "100%" };

  // 初始尺寸：以自然尺寸比例计算
  const naturalWidth = localSrc ? 720 : Math.max(1, asset?.width || (data.imgW as number) || 260);
  const naturalHeight = localSrc ? 960 : Math.max(1, asset?.height || (data.imgH as number) || 200);
  const maxNodeSide = 360;
  const minNodeSide = 120;
  const initScale = Math.min(1, maxNodeSide / Math.max(naturalWidth, naturalHeight));
  const initW = Math.max(minNodeSide, Math.round(naturalWidth * initScale));
  const initH = Math.max(minNodeSide, Math.round(naturalHeight * initScale));

  // 如果未初始化则设置初始尺寸
  useEffect(() => {
    if (!imgW || !imgH) {
      setImgW(initW);
      setImgH(initH);
      setFlowNodes(nds => nds.map(n =>
        n.id === nodeId
          ? { ...n, style: { ...n.style, width: initW, height: initH }, data: { ...(n.data as Record<string, unknown>), imgW: initW, imgH: initH } }
          : n
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const nextW = data.imgW as number | undefined;
    const nextH = data.imgH as number | undefined;
    if (typeof nextW === "number" && nextW > 0 && nextW !== imgW) setImgW(nextW);
    if (typeof nextH === "number" && nextH > 0 && nextH !== imgH) setImgH(nextH);
  }, [data.imgW, data.imgH, imgW, imgH]);

  const dispW = imgW || initW;
  const dispH = imgH || initH;
  const resetEraseCanvases = useCallback(() => {
    const overlay = eraseCanvasRef.current;
    const mask = eraseMaskCanvasRef.current;
    if (!overlay || !mask) return;
    [overlay, mask].forEach(canvas => {
      canvas.width = Math.max(1, Math.round(dispW));
      canvas.height = Math.max(1, Math.round(dispH));
    });
    overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    const maskCtx = mask.getContext("2d");
    if (maskCtx) {
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.fillStyle = "rgba(255,255,255,1)";
      maskCtx.fillRect(0, 0, mask.width, mask.height);
    }
    eraseHasPaintRef.current = false;
  }, [dispH, dispW]);

  useEffect(() => {
    if (isErasing) resetEraseCanvases();
  }, [isErasing, resetEraseCanvases]);

  useEffect(() => {
    if (isCropping) setCropRect({ x: 0, y: 0, w: 100, h: 100 });
  }, [isCropping]);
  useEffect(() => {
    if (isExpanding) setCropRect({ x: -18, y: -18, w: 136, h: 136 });
  }, [isExpanding]);
  useEffect(() => {
    if (extractedTextPanelOpen) setExtractedTextDraft(extractedText);
  }, [extractedText, extractedTextPanelOpen]);

  // 选中边框样式
  const borderColor = selected
    ? "oklch(0.65 0.22 290)"
    : "transparent";
  const shadow = selected
    ? "0 0 0 2px oklch(0.65 0.22 290 / 0.72), 0 0 0 6px oklch(0.65 0.22 290 / 0.18), 0 8px 24px rgba(0,0,0,0.3)"
    : "0 4px 16px rgba(0,0,0,0.22)";
  // 四角拖拽缩放：以对角锚点固定，拖动锚点作为伸缩方向
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, direction: "nw" | "ne" | "se" | "sw" = "se") => {
    e.preventDefault();
    e.stopPropagation();
    const startNode = getNode(nodeId);
    const startNodeX = startNode?.position.x ?? 0;
    const startNodeY = startNode?.position.y ?? 0;
    resizeDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startNodeX, startNodeY, startW: dispW, startH: dispH, direction };
    resizingNodeRef.current = true;
    window.dispatchEvent(new CustomEvent("asset-resize-active", { detail: { active: true } }));
    setIsResizing(true);
    // 等比缩放：使用当前显示尺寸计算宽高比
    const aspectRatio = dispH / Math.max(1, dispW);
    const getNextResize = (clientX: number, clientY: number) => {
      const drag = resizeDragRef.current;
      if (!drag) return null;
      const zoom = viewport.zoom || 1;
      const dx = (clientX - drag.startClientX) / zoom;
      const dy = (clientY - drag.startClientY) / zoom;
      const horizontalDelta = drag.direction.includes("w") ? -dx : dx;
      const verticalDelta = drag.direction.includes("n") ? -dy : dy;
      const delta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta / aspectRatio;
      const newW = Math.max(60, Math.round(drag.startW + delta));
      const newH = Math.max(60, Math.round(newW * aspectRatio));
      const nextX = drag.direction.includes("w") ? drag.startNodeX + drag.startW - newW : drag.startNodeX;
      const nextY = drag.direction.includes("n") ? drag.startNodeY + drag.startH - newH : drag.startNodeY;
      return { newW, newH, nextX, nextY, drag };
    };
    const onMove = (mv: MouseEvent) => {
      const next = getNextResize(mv.clientX, mv.clientY);
      if (!next) return;
      const { newW, newH, nextX, nextY } = next;
      setImgW(newW); setImgH(newH);
      setFlowNodes(nds => nds.map(n =>
        n.id === nodeId
          ? { ...n, position: { x: nextX, y: nextY }, style: { ...n.style, width: newW, height: newH }, data: { ...(n.data as Record<string, unknown>), imgW: newW, imgH: newH } }
          : n
      ));
    };
    const onUp = (mu: MouseEvent) => {
      const next = getNextResize(mu.clientX, mu.clientY);
      if (!next) return;
      const { newW, newH, nextX, nextY, drag } = next;
      resizeDragRef.current = null;
      resizingNodeRef.current = false;
      window.dispatchEvent(new CustomEvent("asset-resize-active", { detail: { active: false } }));
      setIsResizing(false);
      setImgW(newW); setImgH(newH);
      // 只派发事件，由 InnerCanvas 统一处理更新+历史记录（不再调用 setFlowNodes ，避免双重写入导致回退失效）
      window.dispatchEvent(new CustomEvent("asset-resize-end", { detail: { nodeId, newW, newH, nextX, nextY, startNodeX: drag.startNodeX, startNodeY: drag.startNodeY, startW: drag.startW, startH: drag.startH } }));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [dispW, dispH, getNode, nodeId, setFlowNodes, viewport.zoom]);

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
    if (toolMode === "annotate") return;
    if (isCropping || isExpanding) {
      e.stopPropagation();
      return;
    }
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
      const selectedVisualIds = new Set(nextSelectedIds.filter(id => {
        const node = nextNodes.find(item => item.id === id);
        return node?.type === "asset" || node?.type === "canvasFrame";
      }));
      if (selectedVisualIds.size === 0) return nextNodes;
      const topZ = Math.max(0, ...nextNodes.map(n => typeof n.zIndex === "number" ? n.zIndex : 0)) + 1;
      return [
        ...nextNodes.filter(n => !selectedVisualIds.has(n.id)),
        ...nextNodes.filter(n => selectedVisualIds.has(n.id)).map(n => ({ ...n, zIndex: topZ })),
      ];
    });
    window.dispatchEvent(new CustomEvent("asset-reference", {
      detail: { id: nodeId, title: displayTitle, src: displaySrc, ctrlKey: additive }
    }));
  }, [displaySrc, displayTitle, isCropping, isExpanding, nodeId, setFlowNodes, toolMode]);

  const handleImageAnnotateClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== "annotate") return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    window.dispatchEvent(new CustomEvent("annotation-create", { detail: { annotation: {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: xPct, y: yPct, screenX: e.clientX, screenY: e.clientY,
      text: "", done: false, open: true, editing: true, color: "oklch(0.72 0.19 48)", nodeId,
    } } }));
  }, [toolMode, nodeId]);

  const handleCropEdgeMouseDown = useCallback((e: React.MouseEvent, edge: "left" | "right" | "top" | "bottom") => {
    e.preventDefault();
    e.stopPropagation();
    cropDragRef.current = { edge, startClientX: e.clientX, startClientY: e.clientY, startRect: cropRect };
    const onMove = (event: MouseEvent) => {
      const drag = cropDragRef.current;
      if (!drag) return;
      const dx = ((event.clientX - drag.startClientX) / Math.max(1, dispW)) * 100;
      const dy = ((event.clientY - drag.startClientY) / Math.max(1, dispH)) * 100;
      const minSize = 12;
      setCropRect(() => {
        const next = { ...drag.startRect };
        if (isExpanding) {
          if (drag.edge === "left") {
            const newX = Math.max(-140, Math.min(0, drag.startRect.x + dx));
            next.w = Math.max(100 - newX, drag.startRect.w + drag.startRect.x - newX);
            next.x = newX;
          }
          if (drag.edge === "right") {
            next.w = Math.max(100 - drag.startRect.x, Math.min(260, drag.startRect.w + dx));
          }
          if (drag.edge === "top") {
            const newY = Math.max(-140, Math.min(0, drag.startRect.y + dy));
            next.h = Math.max(100 - newY, drag.startRect.h + drag.startRect.y - newY);
            next.y = newY;
          }
          if (drag.edge === "bottom") {
            next.h = Math.max(100 - drag.startRect.y, Math.min(260, drag.startRect.h + dy));
          }
          return next;
        }
        if (drag.edge === "left") {
          const newX = Math.max(0, Math.min(drag.startRect.x + drag.startRect.w - minSize, drag.startRect.x + dx));
          next.w = drag.startRect.w + drag.startRect.x - newX;
          next.x = newX;
        }
        if (drag.edge === "right") {
          next.w = Math.max(minSize, Math.min(100 - drag.startRect.x, drag.startRect.w + dx));
        }
        if (drag.edge === "top") {
          const newY = Math.max(0, Math.min(drag.startRect.y + drag.startRect.h - minSize, drag.startRect.y + dy));
          next.h = drag.startRect.h + drag.startRect.y - newY;
          next.y = newY;
        }
        if (drag.edge === "bottom") {
          next.h = Math.max(minSize, Math.min(100 - drag.startRect.y, drag.startRect.h + dy));
        }
        return next;
      });
    };
    const onUp = () => {
      cropDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [cropRect, dispH, dispW, isExpanding]);

  const applyCropRatio = useCallback((ratio: number | null) => {
    if (!ratio) {
      setCropRect({ x: 0, y: 0, w: 100, h: 100 });
      return;
    }
    const imageRatio = dispW / Math.max(1, dispH);
    let w = 82;
    let h = 82;
    if (ratio > imageRatio) {
      w = 86;
      h = Math.max(12, w * imageRatio / ratio);
    } else {
      h = 86;
      w = Math.max(12, h * ratio / imageRatio);
    }
    setCropRect({ x: (100 - w) / 2, y: (100 - h) / 2, w, h });
  }, [dispH, dispW]);

  const confirmCrop = useCallback(() => {
    window.dispatchEvent(new CustomEvent("asset-crop-commit", {
      detail: { nodeId, cropRect, startW: dispW, startH: dispH, sourceSrc: displaySrc },
    }));
  }, [cropRect, dispH, dispW, displaySrc, nodeId]);

  const cancelCrop = useCallback(() => {
    window.dispatchEvent(new CustomEvent("asset-crop-cancel", { detail: { nodeId } }));
  }, [nodeId]);

  const applyExpandRatio = useCallback((ratio: number | null) => {
    if (!ratio) {
      setCropRect({ x: -18, y: -18, w: 136, h: 136 });
      return;
    }
    const imageRatio = dispW / Math.max(1, dispH);
    let w = 148;
    let h = 148;
    if (ratio > imageRatio) {
      h = Math.max(100, Math.min(220, w * imageRatio / ratio));
    } else {
      w = Math.max(100, Math.min(220, h * ratio / imageRatio));
    }
    setCropRect({ x: (100 - w) / 2, y: (100 - h) / 2, w, h });
  }, [dispH, dispW]);

  const cancelExpand = useCallback(() => {
    window.dispatchEvent(new CustomEvent("asset-expand-cancel", { detail: { nodeId } }));
  }, [nodeId]);

  const getErasePoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = eraseCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  }, []);

  const drawEraseStroke = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const overlay = eraseCanvasRef.current;
    const mask = eraseMaskCanvasRef.current;
    if (!overlay || !mask) return;
    const draw = (ctx: CanvasRenderingContext2D, color: string) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = eraseBrushSize;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    };
    const overlayCtx = overlay.getContext("2d");
    const maskCtx = mask.getContext("2d");
    if (overlayCtx) draw(overlayCtx, "rgba(128, 70, 255, 0.72)");
    if (maskCtx) {
      maskCtx.save();
      maskCtx.globalCompositeOperation = "destination-out";
      draw(maskCtx, "rgba(0,0,0,1)");
      maskCtx.restore();
    }
    eraseHasPaintRef.current = true;
  }, [eraseBrushSize]);

  const handleErasePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isErasing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getErasePoint(event);
    if (!point) return;
    eraseDrawingRef.current = true;
    eraseLastPointRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawEraseStroke(point, point);
  }, [drawEraseStroke, getErasePoint, isErasing]);

  const handleErasePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!eraseDrawingRef.current || !isErasing) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getErasePoint(event);
    const previous = eraseLastPointRef.current;
    if (!point || !previous) return;
    drawEraseStroke(previous, point);
    eraseLastPointRef.current = point;
  }, [drawEraseStroke, getErasePoint, isErasing]);

  const handleErasePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    eraseDrawingRef.current = false;
    eraseLastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const getRenderedImageSource = useCallback(async () => {
    if (!displaySrc) return "";
    return new Promise<string>((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(dispW));
        canvas.height = Math.max(1, Math.round(dispH));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(displaySrc);
          return;
        }
        const sx = (cropX / 100) * image.naturalWidth;
        const sy = (cropY / 100) * image.naturalHeight;
        const sw = (cropW / 100) * image.naturalWidth;
        const sh = (cropH / 100) * image.naturalHeight;
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(displaySrc);
        }
      };
      image.onerror = () => resolve(displaySrc);
      image.src = displaySrc;
    });
  }, [cropH, cropW, cropX, cropY, dispH, dispW, displaySrc]);

  const confirmExpand = useCallback(async () => {
    const imageSrc = await getRenderedImageSource();
    if (!imageSrc) {
      toast("AI 扩展失败", { description: "当前图片没有可处理的图像来源" });
      return;
    }
    const expandedCanvas = document.createElement("canvas");
    const nextW = Math.max(1, Math.round(dispW * (cropRect.w / 100)));
    const nextH = Math.max(1, Math.round(dispH * (cropRect.h / 100)));
    expandedCanvas.width = nextW;
    expandedCanvas.height = nextH;
    const expandedCtx = expandedCanvas.getContext("2d");
    if (!expandedCtx) {
      toast("AI 扩展失败", { description: "无法创建扩展画布" });
      return;
    }
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = nextW;
    maskCanvas.height = nextH;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) {
      toast("AI 扩展失败", { description: "无法创建扩展蒙版" });
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const dx = Math.round((-cropRect.x / 100) * dispW);
      const dy = Math.round((-cropRect.y / 100) * dispH);
      expandedCtx.clearRect(0, 0, nextW, nextH);
      expandedCtx.drawImage(image, dx, dy, dispW, dispH);
      maskCtx.clearRect(0, 0, nextW, nextH);
      maskCtx.fillStyle = "black";
      maskCtx.fillRect(dx, dy, dispW, dispH);
      window.dispatchEvent(new CustomEvent("asset-expand-apply", {
        detail: {
          nodeId,
          imageSrc: expandedCanvas.toDataURL("image/png"),
          maskSrc: maskCanvas.toDataURL("image/png"),
          nextW,
          nextH,
        },
      }));
    };
    image.onerror = () => toast("AI 扩展失败", { description: "无法读取当前图片" });
    image.src = imageSrc;
  }, [cropRect, dispH, dispW, getRenderedImageSource, nodeId]);

  const applyErase = useCallback(async () => {
    if (!eraseHasPaintRef.current || !eraseMaskCanvasRef.current) {
      toast("请先涂抹需要去除的区域");
      return;
    }
    const imageSrc = await getRenderedImageSource();
    if (!imageSrc) {
      toast("AI 擦除失败", { description: "当前图片没有可处理的图像来源" });
      return;
    }
    const maskSrc = eraseMaskCanvasRef.current.toDataURL("image/png");
    window.dispatchEvent(new CustomEvent("asset-erase-apply", {
      detail: { nodeId, imageSrc, maskSrc },
    }));
  }, [getRenderedImageSource, nodeId]);

  const cancelErase = useCallback(() => {
    window.dispatchEvent(new CustomEvent("asset-erase-cancel", { detail: { nodeId } }));
  }, [nodeId]);

  const closeExtractedTextPanel = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setFlowNodes(nds => nds.map(n =>
      n.id === nodeId && n.type === "asset"
        ? { ...n, data: { ...(n.data as Record<string, unknown>), extractedTextPanelOpen: false, isExtractingText: false, isApplyingExtractedText: false } }
        : n
    ));
  }, [nodeId, setFlowNodes]);

  const updateInlineNote = useCallback((patch: Record<string, unknown>) => {
    setFlowNodes(nds => nds.map(n =>
      n.id === nodeId && n.type === "asset"
        ? { ...n, data: { ...(n.data as Record<string, unknown>), ...patch } }
        : n
    ));
  }, [nodeId, setFlowNodes]);

  const applyExtractedTextToNewImage = useCallback(async () => {
    const nextText = extractedTextDraft.trim();
    if (!nextText) {
      toast("请先输入需要替换的文案");
      return;
    }
    const imageSrc = await getRenderedImageSource();
    if (!imageSrc) {
      toast("文案应用失败", { description: "当前图片没有可处理的图像来源" });
      return;
    }
    setFlowNodes(nds => nds.map(n =>
      n.id === nodeId && n.type === "asset"
        ? {
            ...n,
            data: {
              ...(n.data as Record<string, unknown>),
              extractedText: nextText,
              extractedTextPanelOpen: true,
              isApplyingExtractedText: true,
            },
          }
        : n
    ));
    window.dispatchEvent(new CustomEvent("asset-text-edit-apply", {
      detail: {
        nodeId,
        imageSrc,
        originalText: extractedText,
        editedText: nextText,
        panelScreenRect: extractedTextPanelRef.current
          ? {
              left: extractedTextPanelRef.current.getBoundingClientRect().left,
              top: extractedTextPanelRef.current.getBoundingClientRect().top,
              right: extractedTextPanelRef.current.getBoundingClientRect().right,
              bottom: extractedTextPanelRef.current.getBoundingClientRect().bottom,
            }
          : undefined,
      },
    }));
  }, [extractedText, extractedTextDraft, getRenderedImageSource, nodeId, setFlowNodes]);

  return (
    <>
      <div
        className="relative"
        style={{
          width: dispW, height: dispH,
          borderRadius: 4,
          overflow: "visible",
          cursor: isResizing ? "nwse-resize" : isErasing || isExpanding ? "crosshair" : toolMode === "annotate" ? "crosshair" : "grab",
          userSelect: "none",
        }}
        onContextMenu={handleNodeCtxMenu}
        onClick={handleAssetClick}
        onClickCapture={handleImageAnnotateClick}
        onMouseDownCapture={handleAssetMouseDownCapture}
      >
        <div
          className="relative"
          style={{
            width: "100%",
            height: "100%",
            border: `2px solid ${borderColor}`,
            borderRadius: 4,
            boxShadow: shadow,
            overflow: isCropping || isExpanding || isErasing ? "visible" : "hidden",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
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
          {sourceBackgroundSrc && isAiProcessingImage && !isGenerationFailed && (
            <img
              src={sourceBackgroundSrc}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={{
                ...frameClipStyle,
                objectFit: "cover",
                filter: "blur(24px) saturate(1.12) brightness(0.78)",
                transform: "scale(1.14)",
                opacity: isAiProcessingImage ? 0.78 : 0.56,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}
          {isAiProcessingImage ? (
            <div
              className={isGeneratingImage && !isGenerationFailed ? "artx-ai-generation-loading absolute inset-0 flex flex-col items-center justify-center gap-3" : "absolute inset-0 flex flex-col items-center justify-center gap-3"}
              style={{
                ...frameClipStyle,
                background: isGenerationFailed
                  ? isDark ? "linear-gradient(135deg, #303038, #1d1d23)" : "linear-gradient(135deg, #d6d6da, #eeeeef)"
                  : isGeneratingImage
                  ? isDark ? "#050506" : "#101114"
                  : isDark ? "oklch(0.16 0.018 270)" : "oklch(0.96 0.006 270)",
                color: "rgba(255,255,255,0.30)",
                zIndex: 1,
              }}
            >
              {isGenerationFailed || isGeneratingImage ? (
                <div
                  className={isGenerationFailed ? "artx-ai-generation-mark-shell artx-ai-generation-mark-shell-failed" : "artx-ai-generation-mark-shell"}
                  aria-hidden="true"
                >
                  <img
                    src={generationMark}
                    alt=""
                    className={isGenerationFailed ? "artx-ai-generation-mark artx-ai-generation-mark-failed" : "artx-ai-generation-mark"}
                    draggable={false}
                  />
                </div>
              ) : (
                <div
                  className="animate-spin"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: `2px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(24,24,32,0.12)"}`,
                    borderTopColor: "oklch(0.64 0.22 285)",
                  }}
                />
              )}
              <div className="flex flex-col items-center px-5 text-center" style={{ gap: 2 }}>
                {processingLines.slice(0, 2).map((line, index) => (
                  <span
                    key={`${line}-${index}`}
                    style={{
                      maxWidth: 280,
                      color: "rgba(255,255,255,0.30)",
                      fontSize: 16,
                      fontWeight: 500,
                      lineHeight: "22px",
                      letterSpacing: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
	          ) : displaySrc ? (
	            <img
	              src={displaySrc}
	              alt={displayTitle}
              draggable={false}
              style={{
                ...frameClipStyle,
                ...imgCropStyle,
                display: "block",
                objectFit: "contain",
                pointerEvents: "none",
                transform: `scaleX(${flipX ? -1 : 1}) rotate(${rotation}deg)`,
                filter: assetAdjustmentFilter,
                transition: "transform 0.18s cubic-bezier(0.23,1,0.32,1)",
                position: imgCropStyle.position || "relative",
                zIndex: 1,
	              }}
	            />
	          ) : (
	            <div
	              className="absolute inset-0 flex items-center justify-center px-4 text-center type-caption"
	              style={{
                  ...frameClipStyle,
	                color: isDark ? "oklch(0.70 0.01 270)" : "oklch(0.42 0.012 255)",
	                background: isDark ? "oklch(0.16 0.012 270)" : "oklch(0.94 0.006 255)",
	              }}
	            >
	              图片未保存，请重新上传
	            </div>
	          )}
          {isCropping && (
            <div className="absolute inset-0 nodrag nopan" style={{ zIndex: 90 }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.34)" }} />
              <div
                className="absolute"
                style={{
                  left: `${cropRect.x}%`,
                  top: `${cropRect.y}%`,
                  width: `${cropRect.w}%`,
                  height: `${cropRect.h}%`,
                  border: "1.5px dashed rgba(255,255,255,0.95)",
                  boxShadow: "none",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "left")} style={{ position: "absolute", left: -6, top: 0, width: 12, height: "100%", cursor: "ew-resize" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "right")} style={{ position: "absolute", right: -6, top: 0, width: 12, height: "100%", cursor: "ew-resize" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "top")} style={{ position: "absolute", left: 0, top: -6, width: "100%", height: 12, cursor: "ns-resize" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "bottom")} style={{ position: "absolute", left: 0, bottom: -6, width: "100%", height: 12, cursor: "ns-resize" }} />
                {["nw", "ne", "se", "sw"].map(corner => (
                  <span
                    key={corner}
                    style={{
                      position: "absolute",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "white",
                      boxShadow: "0 1px 5px rgba(0,0,0,0.35)",
                      left: corner.includes("w") ? -4 : undefined,
                      right: corner.includes("e") ? -4 : undefined,
                      top: corner.includes("n") ? -4 : undefined,
                      bottom: corner.includes("s") ? -4 : undefined,
                    }}
                  />
                ))}
              </div>
              <div
                className="absolute left-1/2 flex items-center gap-1.5 rounded-[var(--radius-lg-design)] px-2 py-1 shadow-xl"
                style={{
                  top: `calc(100% + ${Math.round(12 / Math.max(0.2, viewport.zoom || 1))}px)`,
                  transform: `translateX(-50%) scale(${1 / Math.max(0.2, viewport.zoom || 1)})`,
                  transformOrigin: "top center",
                  background: "rgba(18,18,28,0.92)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: "white",
                  backdropFilter: "blur(14px)",
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                {[
                  { label: "自由", ratio: null },
                  { label: "1:1", ratio: 1 },
                  { label: "4:5", ratio: 4 / 5 },
                  { label: "16:9", ratio: 16 / 9 },
                ].map(item => (
                  <button key={item.label} type="button" className="type-caption rounded-[var(--radius-md-design)] px-2.5 py-1 hover:opacity-80" style={{ color: "white", background: "rgba(255,255,255,0.08)", whiteSpace: "nowrap", minWidth: 42 }} onClick={() => applyCropRatio(item.ratio)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div
                className="absolute left-1/2 flex items-center gap-2 rounded-[var(--radius-lg-design)] px-2 py-1.5 shadow-xl"
                style={{
                  top: `calc(100% + ${Math.round(48 / Math.max(0.2, viewport.zoom || 1))}px)`,
                  transform: `translateX(-50%) scale(${1 / Math.max(0.2, viewport.zoom || 1)})`,
                  transformOrigin: "top center",
                  background: "rgba(18,18,28,0.94)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(14px)",
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <button type="button" className="type-caption rounded-[var(--radius-md-design)] px-3 py-1.5" style={{ minWidth: 58, whiteSpace: "nowrap", wordBreak: "keep-all", color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.08)" }} onClick={cancelCrop}>取消</button>
                <button type="button" className="type-caption rounded-[var(--radius-md-design)] px-3 py-1.5" style={{ minWidth: 58, whiteSpace: "nowrap", wordBreak: "keep-all", color: "white", background: "linear-gradient(135deg, oklch(0.62 0.22 285), oklch(0.72 0.18 205))" }} onClick={confirmCrop}>确定</button>
              </div>
            </div>
          )}
          {isExpanding && !isAiProcessingImage && (
            <div className="absolute inset-0 nodrag nopan" style={{ zIndex: 92, overflow: "visible" }}>
              <div
                className="absolute"
                style={{
                  left: `${cropRect.x}%`,
                  top: `${cropRect.y}%`,
                  width: `${cropRect.w}%`,
                  height: `${cropRect.h}%`,
                  border: "1.5px dashed rgba(255,255,255,0.95)",
                  background: "rgba(255,255,255,0.04)",
                  boxShadow: "0 0 0 999px rgba(0,0,0,0.26)",
                }}
              >
                <div style={{ position: "absolute", left: `${(-cropRect.x / cropRect.w) * 100}%`, top: `${(-cropRect.y / cropRect.h) * 100}%`, width: `${(100 / cropRect.w) * 100}%`, height: `${(100 / cropRect.h) * 100}%`, border: "1px solid rgba(255,255,255,0.72)" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "left")} style={{ position: "absolute", left: -6, top: 0, width: 12, height: "100%", cursor: "ew-resize" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "right")} style={{ position: "absolute", right: -6, top: 0, width: 12, height: "100%", cursor: "ew-resize" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "top")} style={{ position: "absolute", left: 0, top: -6, width: "100%", height: 12, cursor: "ns-resize" }} />
                <div onMouseDown={e => handleCropEdgeMouseDown(e, "bottom")} style={{ position: "absolute", left: 0, bottom: -6, width: "100%", height: 12, cursor: "ns-resize" }} />
              </div>
              <div
                className="absolute left-1/2 flex items-center gap-1.5 rounded-[var(--radius-lg-design)] px-2 py-1.5 shadow-xl"
                style={{
                  top: `calc(100% + ${Math.round(12 / Math.max(0.2, viewport.zoom || 1))}px)`,
                  transform: `translateX(-50%) scale(${1 / Math.max(0.2, viewport.zoom || 1)})`,
                  transformOrigin: "top center",
                  background: "rgba(18,18,28,0.94)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: "white",
                  backdropFilter: "blur(14px)",
                  whiteSpace: "nowrap",
                  flexWrap: "nowrap",
                  maxWidth: "calc(100vw - 32px)",
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <Expand size={14} />
                {[
                  { label: "自由", ratio: null },
                  { label: "1:1", ratio: 1 },
                  { label: "4:5", ratio: 4 / 5 },
                  { label: "16:9", ratio: 16 / 9 },
                ].map(item => (
                  <button key={item.label} type="button" className="type-caption rounded-[var(--radius-md-design)] px-2.5 py-1 hover:opacity-80" style={{ color: "white", background: "rgba(255,255,255,0.08)", whiteSpace: "nowrap", minWidth: 42 }} onClick={() => applyExpandRatio(item.ratio)}>
                    {item.label}
                  </button>
                ))}
                <span style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.14)" }} />
                <button type="button" className="type-caption rounded-[var(--radius-md-design)] px-3 py-1.5" style={{ minWidth: 58, whiteSpace: "nowrap", wordBreak: "keep-all", color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.08)" }} onClick={cancelExpand}>取消</button>
                <button type="button" className="type-caption rounded-[var(--radius-md-design)] px-3 py-1.5" style={{ minWidth: 72, whiteSpace: "nowrap", wordBreak: "keep-all", color: "white", background: "linear-gradient(135deg, oklch(0.62 0.22 285), oklch(0.72 0.18 205))" }} onClick={() => { void confirmExpand(); }}>立即使用</button>
              </div>
            </div>
          )}
          {isErasing && !isAiProcessingImage && (
            <div className="absolute inset-0 nodrag nopan" style={{ zIndex: 95, overflow: "visible" }}>
              <canvas
                ref={eraseCanvasRef}
                className="absolute inset-0"
                style={{ width: "100%", height: "100%", cursor: "crosshair", touchAction: "none" }}
                onPointerDown={handleErasePointerDown}
                onPointerMove={handleErasePointerMove}
                onPointerUp={handleErasePointerUp}
                onPointerCancel={handleErasePointerUp}
                onClick={event => { event.preventDefault(); event.stopPropagation(); }}
              />
              <canvas ref={eraseMaskCanvasRef} style={{ display: "none" }} />
              <div
                className="absolute left-1/2 rounded-[var(--radius-lg-design)] shadow-xl"
                style={{
                  top: `calc(100% + ${12 * stableUiScale}px)`,
                  transform: `translateX(-50%) scale(${stableUiScale})`,
                  transformOrigin: "top center",
                  width: "max-content",
                  padding: 10,
                  background: "rgba(18,18,28,0.94)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: "white",
                  backdropFilter: "blur(14px)",
                  maxWidth: "calc(100vw - 32px)",
                }}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
              >
                <div className="flex items-center justify-center gap-2">
                  <Eraser size={12} />
                  <span className="type-caption" style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>橡皮工具</span>
                  <input
                    type="range"
                    min={12}
                    max={96}
                    step={2}
                    value={eraseBrushSize}
                    aria-label="橡皮尺寸"
                    onChange={event => setEraseBrushSize(Number(event.target.value))}
                    style={{ width: 146, accentColor: "oklch(0.66 0.23 290)" }}
                  />
                  <span className="type-caption" style={{ minWidth: 32, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>{eraseBrushSize}px</span>
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  {[
                    { label: "清空", onClick: resetEraseCanvases, primary: false },
                    { label: "取消", onClick: cancelErase, primary: false },
                    { label: "立即使用", onClick: applyErase, primary: true },
                  ].map(action => (
                    <button
                      key={action.label}
                      type="button"
                      className="type-caption rounded-[var(--radius-md-design)]"
                      style={{
                        width: action.primary ? 96 : 82,
                        height: 34,
                        color: action.primary ? "white" : "rgba(255,255,255,0.78)",
                        background: action.primary ? "linear-gradient(135deg, oklch(0.62 0.22 285), oklch(0.72 0.18 205))" : "rgba(255,255,255,0.08)",
                        whiteSpace: "nowrap",
                        wordBreak: "keep-all",
                        writingMode: "horizontal-tb",
                        textAlign: "center",
                        lineHeight: 1.2,
                        fontSize: 12,
                      }}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {isEditing && (
            <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(0,0,0,0.15)" }} />
          )}
        </div>
        {extractedTextPanelOpen && (
          <div
            ref={extractedTextPanelRef}
            className="absolute nodrag nopan shadow-2xl"
            style={{
              left: dispW + 14 * stableUiScale,
              top: 0,
              width: 292,
              maxHeight: 420,
              borderRadius: 8,
              overflow: "hidden",
              background: isDark ? "rgba(20,20,30,0.96)" : "rgba(255,255,255,0.98)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`,
              color: isDark ? "rgba(255,255,255,0.88)" : "rgba(28,28,40,0.88)",
              backdropFilter: "blur(16px)",
              zIndex: 110,
              pointerEvents: "all",
              transform: `scale(${stableUiScale})`,
              transformOrigin: "top left",
            }}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onWheel={event => event.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}` }}
            >
              <div className="flex items-center gap-2">
                {isExtractingText || isApplyingExtractedText ? <RefreshCw size={13} className="animate-spin" /> : <Type size={13} />}
                <span className="type-caption" style={{ fontWeight: 700 }}>画面文案</span>
              </div>
              <button
                type="button"
                aria-label="关闭文案窗口"
                className="flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors"
                style={{
                  width: 24,
                  height: 24,
                  color: isDark ? "rgba(255,255,255,0.68)" : "rgba(28,28,40,0.62)",
                  background: "transparent",
                }}
                onClick={closeExtractedTextPanel}
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              readOnly={isExtractingText || isApplyingExtractedText}
              value={isExtractingText ? EXTRACT_TEXT_LOADING_MESSAGE : extractedTextDraft}
              aria-label="提取出的画面文案"
              className="w-full nodrag nopan"
              style={{
                minHeight: 138,
                maxHeight: 336,
                padding: 12,
                resize: "none",
                outline: "none",
                border: "none",
                background: "transparent",
                color: "inherit",
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                userSelect: "text",
                cursor: "text",
                overflowY: "auto",
                overscrollBehavior: "contain",
              }}
              onChange={event => setExtractedTextDraft(event.target.value)}
              onMouseDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
              onWheel={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
            />
            <div
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}` }}
            >
              <button
                type="button"
                className="type-caption rounded-[var(--radius-md-design)] px-3 py-1.5 transition-opacity hover:opacity-80"
                style={{
                  color: isDark ? "rgba(255,255,255,0.84)" : "rgba(28,28,40,0.82)",
                  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                }}
                onClick={() => {
                  navigator.clipboard?.writeText(extractedTextDraft);
                  toast("已复制画面文案");
                }}
                disabled={isExtractingText}
              >
                复制文案
              </button>
              <button
                type="button"
                className="type-caption rounded-[var(--radius-md-design)] px-3 py-1.5 transition-opacity hover:opacity-80"
                style={{
                  color: "white",
                  background: "linear-gradient(135deg, oklch(0.62 0.22 285), oklch(0.72 0.18 205))",
                  opacity: isExtractingText || isApplyingExtractedText ? 0.72 : 1,
                }}
                onClick={() => { void applyExtractedTextToNewImage(); }}
                disabled={isExtractingText || isApplyingExtractedText}
              >
                {isApplyingExtractedText ? "正在生成新图..." : "应用到新图"}
              </button>
            </div>
          </div>
        )}
        <AssetInlineNote
          text={noteText}
          open={noteOpen}
          editing={noteEditing}
          isDark={isDark}
          onUpdate={updateInlineNote}
        />
        {/* 四角缩放锚点：固定 6px 圆环 */}
        {selected && (
          <>
            {(["nw", "ne", "se", "sw"] as const).map(direction => {
              const styleByDirection: Record<typeof direction, React.CSSProperties> = {
                nw: { left: -5, top: -5, cursor: "nwse-resize" },
                ne: { right: -5, top: -5, cursor: "nesw-resize" },
                se: { right: -5, bottom: -5, cursor: "nwse-resize" },
                sw: { left: -5, bottom: -5, cursor: "nesw-resize" },
              };
              return (
                <div
                  key={direction}
                  className="absolute nodrag nopan"
                  style={{
                    ...styleByDirection[direction],
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "transparent",
                    border: "2px solid white",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.20), 0 2px 6px rgba(0,0,0,0.45)",
                    zIndex: 80,
                  }}
                  onMouseDown={e => handleResizeMouseDown(e, direction)}
                />
              );
            })}
          </>
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
  const [model, setModel] = useState("auto");
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
  const [model, setModel] = useState("auto");
  const [prompt, setPrompt] = useState((data.prompt as string) || "");
  const [isGenerating, setIsGenerating] = useState(false);
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
        <button className="w-full py-1.5 rounded-[var(--radius-md-design)] type-caption flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "oklch(0.58 0.22 290)", color: "white" }}
          disabled={!prompt.trim() || isGenerating}
          onClick={async () => {
            if (!prompt.trim() || isGenerating) return;
            if (!requestAiAuth()) {
              toast("请先登录", { description: "登录后即可使用 AI 能力" });
              return;
            }
            setIsGenerating(true);
            try {
              const result = await callLLM({
                module: "prompt-node-generation",
                model,
                prompt: `请根据这个 Prompt 节点内容生成可执行的视觉创作说明和高质量提示词：${prompt}`,
              });
              toast("Prompt 节点已生成", { description: result.text.slice(0, 90) });
            } catch (error) {
              const message = error instanceof Error ? error.message : "请稍后重试";
              toast("Prompt 节点生成失败", { description: message });
            } finally {
              setIsGenerating(false);
            }
          }}>
          {isGenerating ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}{isGenerating ? "生成中" : "生成"}
        </button>
      </div>
    </NodeWrapper>
  );
}

// ── Text Node ──────────────────────────────────────────────────
// 富文本排版节点，支持字体、颜色、字重、字号、对齐等属性
function TextNodeComponent({ data, selected, id }: { data: Record<string, unknown>; selected: boolean; id: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nodeId = id || (data as { id?: string }).id || "";
  const { setNodes } = useReactFlow();

  // 从 data 中读取排版属性（带默认值）
  const textContent = (data.text as string) ?? "";
  const fontFamily = (data.fontFamily as string) || "Inter";
  const fontSize = (data.fontSize as number) || 32;
  const fontWeight = (data.fontWeight as number) || 400;
  const color = (data.color as string) || (isDark ? "#ffffff" : "#1a1a2e");
  const textAlign = (data.textAlign as string) || "left";
  const lineHeight = (data.lineHeight as number) || 1.4;
  const letterSpacing = (data.letterSpacing as number) || 0;
  const textDecoration = (data.textDecoration as string) || "none";
  const textTransform = (data.textTransform as string) || "none";
  const nodeWidth = (data.width as number) || 320;
  const nodeHeight = (data.height as number) || 120;
  const isEditing = (data.isEditing as boolean) || false;
  const strokeColorVal = (data.strokeColor as string) || "";
  const strokeWidthVal = (data.strokeWidth as number) || 0;
  const [isHovered, setIsHovered] = useState(false);

  // 描边效果：用 text-shadow 模拟文字描边
  const textStrokeShadow = (strokeWidthVal > 0 && isValidHexColor(strokeColorVal))
    ? Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dx = Math.round(Math.cos(angle) * strokeWidthVal * 10) / 10;
        const dy = Math.round(Math.sin(angle) * strokeWidthVal * 10) / 10;
        return `${dx}px ${dy}px 0 ${strokeColorVal}`;
      }).join(", ")
    : undefined;

  const selBorder = selected ? "oklch(0.65 0.22 290)" : "transparent";
  const selShadow = selected
    ? "0 0 0 2px oklch(0.65 0.22 290 / 0.72), 0 0 0 6px oklch(0.65 0.22 290 / 0.18)"
    : "none";
  // hover 时显示灰色外选框（未选中状态下）
  const hoverBorder = (!selected && isHovered) ? "rgba(160,160,180,0.55)" : "transparent";
  const hoverShadow = (!selected && isHovered) ? "0 0 0 1.5px rgba(160,160,180,0.45)" : "none";

  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("text-contextmenu-suppressed"));
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isEditing: true } } : n));
  }, [nodeId, setNodes]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, text: e.target.value } } : n));
  }, [nodeId, setNodes]);

  const handleBlur = useCallback(() => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isEditing: false } } : n));
  }, [nodeId, setNodes]);

  return (
    <div
      data-text-node-id={nodeId}
      style={{
        width: nodeWidth,
        minHeight: nodeHeight,
        position: "relative",
        border: `2px solid ${selected ? selBorder : hoverBorder}`,
        boxShadow: selected ? selShadow : hoverShadow,
        borderRadius: 4,
        transition: "border-color 0.15s, box-shadow 0.15s",
        cursor: isEditing ? "text" : "move",
        pointerEvents: "all",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleNodeCtxMenu}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          autoFocus
          value={textContent}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          className="nodrag nopan"
          style={{
            width: "100%",
            minHeight: nodeHeight,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily,
            fontSize,
            fontWeight,
            color,
            textAlign: textAlign as React.CSSProperties["textAlign"],
            lineHeight,
            letterSpacing: `${letterSpacing}em`,
            textDecoration,
            textTransform: textTransform as React.CSSProperties["textTransform"],
            textShadow: textStrokeShadow,
            padding: "4px 6px",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
          placeholder="输入文字..."
        />
      ) : (
        <div
          style={{
            width: "100%",
            minHeight: nodeHeight,
            fontFamily,
            fontSize,
            fontWeight,
            color,
            textAlign: textAlign as React.CSSProperties["textAlign"],
            lineHeight,
            letterSpacing: `${letterSpacing}em`,
            textDecoration,
            textTransform: textTransform as React.CSSProperties["textTransform"],
            textShadow: textStrokeShadow,
            padding: "4px 6px",
            boxSizing: "border-box",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            userSelect: "none",
          }}
        >
          {textContent || <span style={{ opacity: 0.35 }}>双击编辑文字...</span>}
        </div>
      )}
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    </div>
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
  const title = (data.title as string) || "画板";
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isCommittingTitleRef = useRef(false);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(title);
  }, [isEditingTitle, title]);

  useEffect(() => {
    if (!isEditingTitle) return;
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [isEditingTitle]);

  const startTitleEdit = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isCommittingTitleRef.current = false;
    setTitleDraft(title);
    setIsEditingTitle(true);
  }, [title]);

  const commitTitleEdit = useCallback(() => {
    if (isCommittingTitleRef.current) return;
    isCommittingTitleRef.current = true;
    const nextTitle = titleDraft.trim() || title || "画板";
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
    if (nextTitle === title) return;
    window.dispatchEvent(new CustomEvent("canvas-frame-title-change", {
      detail: { id, title: nextTitle },
    }));
  }, [id, title, titleDraft]);

  const cancelTitleEdit = useCallback(() => {
    isCommittingTitleRef.current = true;
    setTitleDraft(title);
    setIsEditingTitle(false);
  }, [title]);

  const borderColor = selected
    ? "oklch(0.65 0.22 290)"
    : isDark ? "oklch(1 0 0 / 20%)" : "oklch(0 0 0 / 18%)";
  // 使用用户选择的背景色，默认深灰色
  const bg = withCanvasFrameAlpha(data.bgColor || (data.originalBgColor as string) || "#2a2a30");
  const labelColor = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.52 0.01 270)";
  const handleColor = isDark ? "oklch(0.65 0.22 290 / 0.80)" : "oklch(0.50 0.20 290 / 0.80)";
  const handleNodeCtxMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent("node-contextmenu", {
      detail: { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0), nodeId: id, nodeType: "canvasFrame" },
    }));
  }, [id]);
  const handleCanvasFrameClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const additive = e.ctrlKey || e.metaKey;
    window.dispatchEvent(new CustomEvent("asset-click-selection", { detail: { selectedIds: [id] } }));
    window.dispatchEvent(new CustomEvent("visual-node-select-to-front", { detail: { nodeId: id, additive } }));
  }, [id]);
  const handleCanvasFrameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

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
      onContextMenu={handleNodeCtxMenu}
      onClick={handleCanvasFrameClick}
      onDoubleClick={handleCanvasFrameDoubleClick}
    >
      {/* 左上角标题 */}
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          className="nodrag nopan"
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={commitTitleEdit}
          onKeyDown={e => {
            if (e.key === "Enter") commitTitleEdit();
            if (e.key === "Escape") cancelTitleEdit();
          }}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -28,
            left: 0,
            width: Math.max(132, Math.min(260, w - 20)),
            height: 24,
            border: "1px solid oklch(0.65 0.22 290)",
            borderRadius: 6,
            background: isDark ? "rgba(20,20,24,0.92)" : "rgba(255,255,255,0.94)",
            boxShadow: isDark ? "0 8px 22px rgba(0,0,0,0.35)" : "0 8px 22px rgba(0,0,0,0.14)",
            color: isDark ? "#f6f3ff" : "#201a2b",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: "22px",
            outline: "none",
            padding: "0 8px",
            zIndex: 30,
          }}
          aria-label="编辑画板名称"
        />
      ) : (
        <div
          className="nodrag"
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onDoubleClick={startTitleEdit}
          title="双击重命名画板"
          style={{
            position: "absolute",
            top: -22,
            left: 0,
            maxWidth: Math.max(120, w - 16),
            fontSize: 11,
            fontWeight: 500,
            color: labelColor,
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
            userSelect: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: "text",
          }}
        >
          {title} · {w} × {h} px
        </div>
      )}

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
  const { zoom: vpZoom } = useViewport(); // 用于保持锚点固定屏幕像素大小
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
  // 参数菜单已移至 InnerCanvas 层统一管理，此处无需本地状态

  const draggingAnchorRef = useRef<number | null>(null);

  // 圆形锚点吸附辅助函数：只移动被拖拽的那个锚点，吸附到橙圆轮廓上
  // idx: 0=上 1=右 2=下 3=左
  // 圆形路径由 buildCirclePath 根据四个锚点推算橙圆，所以每个锚点可独立移动
  const snapCircleAnchor = useCallback((prev: { x: number; y: number }[], idx: number, rawX: number, rawY: number) => {
    const updated = [...prev];
    // 上/下锚点：锁定 X 到橙圆垂直轴（由左右锚点中点确定）
    if (idx === 0 || idx === 2) {
      const cx = (prev[3].x + prev[1].x) / 2;
      updated[idx] = { x: cx, y: rawY };
    } else {
      // 左/右锚点：锁定 Y 到橙圆水平轴（由上下锚点中点确定）
      const cy = (prev[0].y + prev[2].y) / 2;
      updated[idx] = { x: rawX, y: cy };
    }
    return updated;
  }, []);

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
      if (shapeType === "circle") {
        // 圆形锚点：吸附到橙圆轮廓
        setAnchors(prev => snapCircleAnchor(prev, idx, nx, ny));
      } else {
        setAnchors(prev => prev.map((a, i) => i === idx ? { x: nx, y: ny } : a));
      }
    };
    const onUp = (upEvent: MouseEvent) => {
      draggingAnchorRef.current = null;
      const rect = nodeEl?.getBoundingClientRect();
      if (rect) {
        const finalX = upEvent.clientX - rect.left;
        const finalY = upEvent.clientY - rect.top;
        setAnchors(prev => {
          const updated = shapeType === "circle"
            ? snapCircleAnchor(prev, idx, finalX, finalY)
            : prev.map((a, i) => i === idx ? { x: finalX, y: finalY } : a);
          // 重算包围盒，让选框始终包裹所有锚点
          const pad = 8; // 边距
          const minX = Math.min(...updated.map(a => a.x)) - pad;
          const minY = Math.min(...updated.map(a => a.y)) - pad;
          const maxX = Math.max(...updated.map(a => a.x)) + pad;
          const maxY = Math.max(...updated.map(a => a.y)) + pad;
          const newW = Math.max(maxX - minX, 20);
          const newH = Math.max(maxY - minY, 20);
          // 将锚点坐标转换为相对于新包围盒的坐标
          const rebasedAnchors = updated.map(a => ({ x: a.x - minX, y: a.y - minY }));
          // 派发事件由 InnerCanvas 统一处理节点位置偏移（需要 viewport.zoom 转换）
          window.dispatchEvent(new CustomEvent("shape-anchor-offset", {
            detail: { nodeId: id, dx: minX, dy: minY, newW, newH, anchors: rebasedAnchors }
          }));
          return rebasedAnchors;
        });
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [id, shapeType, snapCircleAnchor, setFlowNodes]);

  // 双击进入锚点编辑模式
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFlowNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, anchorEditMode: true, anchors } } : n));
  }, [anchors, id, setFlowNodes]);

  // 右键弹出参数菜单：派发事件由 InnerCanvas 统一渲染（避免 ReactFlow transform 干扰 position:fixed）
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    window.dispatchEvent(new CustomEvent("shape-ctx-open", {
      detail: { nodeId: id, fill, stroke, strokeWidth: strokeW, opacity }
    }));
  }, [id, fill, stroke, strokeW, opacity]);

  // 根据锚点计算圆形路径（用四个控制点拟合椭圆）
  // 上锚点(0)定义椭圆顶部，右锚点(1)定义右侧，下锚点(2)定义底部，左锚点(3)定义左侧
  // cx/cy 直接从四个锚点的实际坐标推算，不假设对称，确保路径始终跟锚点同步
  const buildCirclePath = (pts: { x: number; y: number }[]) => {
    const top    = pts[0] ?? { x: w/2, y: 0 };
    const right  = pts[1] ?? { x: w,   y: h/2 };
    const bottom = pts[2] ?? { x: w/2, y: h };
    const left   = pts[3] ?? { x: 0,   y: h/2 };
    // 水平轴：由左右锚点的 X 坐标确定中心和半径
    const cx = (left.x + right.x) / 2;
    const rx = Math.max(Math.abs(right.x - left.x) / 2, 1);
    // 垂直轴：由上下锚点的 Y 坐标确定中心和半径
    const cy = (top.y + bottom.y) / 2;
    const ry = Math.max(Math.abs(bottom.y - top.y) / 2, 1);
    // 用 SVG arc 绘制椭圆（两段半圆弧）
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
      {isEditMode && anchors.map((a, idx) => {
        // 锚点大小固定为屏幕 10px，通过 1/vpZoom 反向缩放补偿画布缩放
        const anchorScreenPx = 10;
        const anchorFlowPx = anchorScreenPx / vpZoom;
        const borderFlowPx = 2 / vpZoom;
        return (
          <div
            key={idx}
            className="nodrag"
            style={{
              position: "absolute",
              left: a.x - anchorFlowPx / 2,
              top: a.y - anchorFlowPx / 2,
              width: anchorFlowPx,
              height: anchorFlowPx,
              borderRadius: "50%",
              background: "white",
              border: `${borderFlowPx}px solid oklch(0.65 0.22 290)`,
              cursor: "move",
              zIndex: 20,
              boxShadow: `0 ${1/vpZoom}px ${4/vpZoom}px rgba(0,0,0,0.35)`,
            }}
            onMouseDown={e => handleAnchorMouseDown(e, idx)}
          />
        );
      })}
      {isEditMode && (
        <div style={{ position: "absolute", top: -24, left: 0, fontSize: 10, color: "oklch(0.65 0.22 290)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          锚点编辑模式 · 单击空白退出
        </div>
      )}
      {/* 右键参数菜单已移至 InnerCanvas 层统一渲染，此处无需渲染 */}
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    </div>
  );
}

// ── Pen Node Component ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 实现 Figma 风格的钢笔工具节点：贝塞尔曲线、直角/曲线锚点切换、手柄拖拽
// 锚点类型: "smooth" = 曲线 (Bezier)、"corner" = 直角、"asymmetric" = 非对称手柄
type PenAnchor = {
  x: number; y: number;
  type: "smooth" | "corner" | "asymmetric";
  // 入手柄偏移（相对于锚点）
  inDx: number; inDy: number;
  // 出手柄偏移（相对于锚点）
  outDx: number; outDy: number;
};

function PenNodeComponent({ id, data, selected }: { id: string; data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { setNodes: setFlowNodes } = useReactFlow();
  const { zoom: vpZoom } = useViewport();

  const w = (data.width as number) || 200;
  const h = (data.height as number) || 200;
  const stroke = (data.stroke as string) || (isDark ? "#a78bfa" : "#6366f1");
  const strokeW = (data.strokeWidth as number) || 2;
  const fill = (data.fill as string) || "none";
  const opacity = (data.opacity as number) ?? 1;
  const isClosed = !!(data.closed as boolean);
  const isEditMode = !!(data.anchorEditMode as boolean);

  const [anchors, setAnchors] = useState<PenAnchor[]>(() => {
    if (data.anchors) return data.anchors as PenAnchor[];
    return [];
  });

  // 当前选中的锚点索引
  const [selectedAnchorIdx, setSelectedAnchorIdx] = useState<number | null>(null);
  // 正在拖拽的对象: { type: "anchor" | "in" | "out", idx: number }
  const draggingRef = useRef<{ type: "anchor" | "in" | "out"; idx: number } | null>(null);
  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; anchorIdx: number } | null>(null);

  // 关闭右键菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".pen-ctx-menu")) setCtxMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  // 构建 SVG 路径
  const buildPath = (pts: PenAnchor[], closed: boolean): string => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cp1x = prev.x + prev.outDx;
      const cp1y = prev.y + prev.outDy;
      const cp2x = curr.x + curr.inDx;
      const cp2y = curr.y + curr.inDy;
      if (prev.outDx === 0 && prev.outDy === 0 && curr.inDx === 0 && curr.inDy === 0) {
        d += ` L ${curr.x} ${curr.y}`;
      } else {
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${curr.x} ${curr.y}`;
      }
    }
    if (closed && pts.length > 1) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      const cp1x = last.x + last.outDx;
      const cp1y = last.y + last.outDy;
      const cp2x = first.x + first.inDx;
      const cp2y = first.y + first.inDy;
      if (last.outDx === 0 && last.outDy === 0 && first.inDx === 0 && first.inDy === 0) {
        d += " Z";
      } else {
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${first.x} ${first.y} Z`;
      }
    }
    return d;
  };

  // 拖拽锚点 / 手柄
  const handleMouseDown = useCallback((e: React.MouseEvent, type: "anchor" | "in" | "out", idx: number) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedAnchorIdx(idx);
    draggingRef.current = { type, idx };
    const nodeEl = (e.currentTarget as HTMLElement).closest(".react-flow__node");
    const onMove = (mv: MouseEvent) => {
      const rect = nodeEl?.getBoundingClientRect();
      if (!rect || !draggingRef.current) return;
      const nx = mv.clientX - rect.left;
      const ny = mv.clientY - rect.top;
      const { type: dt, idx: di } = draggingRef.current;
      setAnchors(prev => prev.map((a, i) => {
        if (i !== di) return a;
        if (dt === "anchor") {
          return { ...a, x: nx, y: ny };
        } else if (dt === "out") {
          const newOutDx = nx - a.x;
          const newOutDy = ny - a.y;
          if (a.type === "smooth") {
            // 对称手柄
            const len = Math.sqrt(newOutDx*newOutDx + newOutDy*newOutDy);
            const inLen = Math.sqrt(a.inDx*a.inDx + a.inDy*a.inDy);
            return { ...a, outDx: newOutDx, outDy: newOutDy, inDx: len > 0 ? -newOutDx/len*inLen : a.inDx, inDy: len > 0 ? -newOutDy/len*inLen : a.inDy };
          }
          return { ...a, outDx: newOutDx, outDy: newOutDy };
        } else {
          const newInDx = nx - a.x;
          const newInDy = ny - a.y;
          if (a.type === "smooth") {
            const len = Math.sqrt(newInDx*newInDx + newInDy*newInDy);
            const outLen = Math.sqrt(a.outDx*a.outDx + a.outDy*a.outDy);
            return { ...a, inDx: newInDx, inDy: newInDy, outDx: len > 0 ? -newInDx/len*outLen : a.outDx, outDy: len > 0 ? -newInDy/len*outLen : a.outDy };
          }
          return { ...a, inDx: newInDx, inDy: newInDy };
        }
      }));
    };
    const onUp = () => {
      draggingRef.current = null;
      // 广播更新到节点 data
      setFlowNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, anchors: anchors } } : n));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [id, setFlowNodes, anchors]);

  // 切换锚点类型
  const toggleAnchorType = useCallback((idx: number) => {
    setAnchors(prev => prev.map((a, i) => {
      if (i !== idx) return a;
      if (a.type === "smooth") return { ...a, type: "corner" as const, inDx: 0, inDy: 0, outDx: 0, outDy: 0 };
      if (a.type === "corner") return { ...a, type: "asymmetric" as const };
      return { ...a, type: "smooth" as const };
    }));
    setCtxMenu(null);
  }, []);

  // 删除锚点
  const deleteAnchor = useCallback((idx: number) => {
    setAnchors(prev => prev.filter((_, i) => i !== idx));
    setCtxMenu(null);
    setSelectedAnchorIdx(null);
  }, []);

  // 切换开放/闭合
  const toggleClosed = useCallback(() => {
    setFlowNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, closed: !isClosed } } : n));
  }, [id, isClosed, setFlowNodes]);

  const anchorScreenPx = 8;
  const anchorFlowPx = anchorScreenPx / vpZoom;
  const handleScreenPx = 6;
  const handleFlowPx = handleScreenPx / vpZoom;
  const borderFlowPx = 1.5 / vpZoom;

  const borderColor = selected ? "oklch(0.65 0.22 290)" : "transparent";

  return (
    <div
      style={{ width: w, height: h, position: "relative", outline: `2px solid ${borderColor}`, outlineOffset: 3, opacity }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
    >
      <svg
        width={w} height={h}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        viewBox={`0 0 ${w} ${h}`}
      >
        {/* 路径本体 */}
        <path
          d={buildPath(anchors, isClosed)}
          fill={fill === "none" ? "none" : fill}
          stroke={stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 手柄连线（编辑模式下显示） */}
        {isEditMode && anchors.map((a, i) => {
          const showIn = i > 0 || isClosed;
          const showOut = i < anchors.length - 1 || isClosed;
          return (
            <g key={i}>
              {showIn && (a.inDx !== 0 || a.inDy !== 0) && (
                <line
                  x1={a.x} y1={a.y}
                  x2={a.x + a.inDx} y2={a.y + a.inDy}
                  stroke="oklch(0.65 0.22 290)" strokeWidth={1/vpZoom} strokeDasharray={`${3/vpZoom},${2/vpZoom}`}
                />
              )}
              {showOut && (a.outDx !== 0 || a.outDy !== 0) && (
                <line
                  x1={a.x} y1={a.y}
                  x2={a.x + a.outDx} y2={a.y + a.outDy}
                  stroke="oklch(0.65 0.22 290)" strokeWidth={1/vpZoom} strokeDasharray={`${3/vpZoom},${2/vpZoom}`}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* 手柄点（菱形） */}
      {isEditMode && anchors.map((a, i) => {
        const showIn = (i > 0 || isClosed) && (a.inDx !== 0 || a.inDy !== 0);
        const showOut = (i < anchors.length - 1 || isClosed) && (a.outDx !== 0 || a.outDy !== 0);
        return (
          <Fragment key={i}>
            {showIn && (
              <div
                className="nodrag"
                style={{
                  position: "absolute",
                  left: a.x + a.inDx - handleFlowPx / 2,
                  top: a.y + a.inDy - handleFlowPx / 2,
                  width: handleFlowPx, height: handleFlowPx,
                  background: "oklch(0.65 0.22 290)",
                  transform: "rotate(45deg)",
                  cursor: "move", zIndex: 19,
                }}
                onMouseDown={e => handleMouseDown(e, "in", i)}
              />
            )}
            {showOut && (
              <div
                className="nodrag"
                style={{
                  position: "absolute",
                  left: a.x + a.outDx - handleFlowPx / 2,
                  top: a.y + a.outDy - handleFlowPx / 2,
                  width: handleFlowPx, height: handleFlowPx,
                  background: "oklch(0.65 0.22 290)",
                  transform: "rotate(45deg)",
                  cursor: "move", zIndex: 19,
                }}
                onMouseDown={e => handleMouseDown(e, "out", i)}
              />
            )}
          </Fragment>
        );
      })}

      {/* 锚点点（圆形） */}
      {isEditMode && anchors.map((a, i) => (
        <div
          key={i}
          className="nodrag"
          style={{
            position: "absolute",
            left: a.x - anchorFlowPx / 2,
            top: a.y - anchorFlowPx / 2,
            width: anchorFlowPx, height: anchorFlowPx,
            borderRadius: a.type === "corner" ? `${1/vpZoom}px` : "50%",
            background: selectedAnchorIdx === i ? "oklch(0.65 0.22 290)" : "white",
            border: `${borderFlowPx}px solid oklch(0.65 0.22 290)`,
            cursor: "move", zIndex: 20,
            boxShadow: `0 ${1/vpZoom}px ${3/vpZoom}px rgba(0,0,0,0.3)`,
          }}
          onMouseDown={e => handleMouseDown(e, "anchor", i)}
          onDoubleClick={e => { e.stopPropagation(); toggleAnchorType(i); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, anchorIdx: i }); }}
        />
      ))}

      {/* 锚点右键菜单 */}
      {ctxMenu && (
        <div
          className="pen-ctx-menu"
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y,
            zIndex: 20000, background: isDark ? "#1e1e24" : "#fff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
            borderRadius: 8, padding: "6px 0", minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            color: isDark ? "#e8e8f0" : "#1a1a2e", fontSize: 12,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {[
            { label: "切换为光滑锚点", action: () => { setAnchors(prev => prev.map((a, i) => i === ctxMenu.anchorIdx ? { ...a, type: "smooth" as const } : a)); setCtxMenu(null); } },
            { label: "切换为直角锚点", action: () => { setAnchors(prev => prev.map((a, i) => i === ctxMenu.anchorIdx ? { ...a, type: "corner" as const, inDx: 0, inDy: 0, outDx: 0, outDy: 0 } : a)); setCtxMenu(null); } },
            { label: "切换为非对称手柄", action: () => { setAnchors(prev => prev.map((a, i) => i === ctxMenu.anchorIdx ? { ...a, type: "asymmetric" as const } : a)); setCtxMenu(null); } },
            { label: "删除锚点", action: () => deleteAnchor(ctxMenu.anchorIdx) },
          ].map(item => (
            <button
              key={item.label}
              style={{
                display: "block", width: "100%", padding: "6px 14px",
                background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left", color: "inherit", fontSize: 12,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              onClick={item.action}
            >{item.label}</button>
          ))}
          <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", margin: "4px 0" }} />
          <button
            style={{ display: "block", width: "100%", padding: "6px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: "inherit", fontSize: 12 }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={toggleClosed}
          >{isClosed ? "打开路径" : "闭合路径"}</button>
        </div>
      )}

      {isEditMode && (
        <div style={{ position: "absolute", top: -24, left: 0, fontSize: 10, color: "oklch(0.65 0.22 290)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          钢笔编辑 · 单击添加锚点 · 双击锚点切换类型 · Enter 完成
        </div>
      )}
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    </div>
  );
}

// ── Freehand Node Component ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 铅笔自由路径节点：存储一组屏幕坐标点并用 SVG polyline 渲染
function FreehandNodeComponent({ data, selected }: { data: Record<string, unknown>; selected: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const points = (data.points as { x: number; y: number }[]) || [];
  const stroke = (data.stroke as string) || (isDark ? "#c4b5fd" : "#4f46e5");
  const strokeW = (data.strokeWidth as number) || 2;
  const opacity = (data.opacity as number) ?? 1;
  const w = (data.width as number) || 1;
  const h = (data.height as number) || 1;

  // 将点转为 SVG polyline points 字符串
  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div
      style={{
        width: w, height: h, position: "relative", opacity,
        // 开启事件以支持选中和拖拽
        pointerEvents: "all",
        cursor: "move",
        // 选中时显示轮廓
        outline: selected ? "2px solid oklch(0.65 0.22 290)" : "none",
        outlineOffset: 3,
        borderRadius: 2,
      }}
    >
      <svg
        width={w} height={h}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
        viewBox={`0 0 ${w} ${h}`}
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
  pen: PenNodeComponent as unknown as NodeTypes["pen"],
  freehand: FreehandNodeComponent as unknown as NodeTypes["freehand"],
  text: TextNodeComponent as unknown as NodeTypes["text"],
};

const SELECT_TO_FRONT_NODE_TYPES = new Set(["asset", "shape", "freehand", "pen", "text"]);

function shouldSelectToFront(node: Node | undefined) {
  return Boolean(node?.type && SELECT_TO_FRONT_NODE_TYPES.has(node.type));
}

function nextCanvasTopZ(nodes: Node[]) {
  return Math.max(0, ...nodes.map(node => typeof node.zIndex === "number" ? node.zIndex : 0)) + 1;
}
const edgeTypes: EdgeTypes = {
  tapnow: TapnowEdge as unknown as EdgeTypes["tapnow"],
};

type ImageGeneratorPayload = {
  projectId?: string;
  prompt: string;
  model: string;
  ratio: string;
  count: number;
  style: string;
  referencesEnabled: boolean;
  generationId?: string;
  status?: "pending" | "completed" | "failed";
  error?: string;
  images?: Array<{ src: string; width: number; height: number }>;
  generationStartedAt?: number;
  placement?: { x: number; y: number };
  displaySize?: { w: number; h: number };
  titleBase?: string;
  sourceBackgroundSrc?: string;
  referencedAssets?: Array<{ src: string; title?: string; width?: number; height?: number }>;
  skillId?: string;
};

type ImageGeneratorReferenceAsset = {
  id: string;
  title: string;
  src: string;
  width?: number;
  height?: number;
};

type ElementLayerPlan = {
  foregroundPrompt: string;
  backgroundPrompt: string;
  extractedText: string;
  textStyleHint?: string;
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

function inferImageRatio(width: number, height: number) {
  const ratio = width / Math.max(1, height);
  const candidates = [
    { id: "1:1", value: 1 },
    { id: "4:5", value: 4 / 5 },
    { id: "16:9", value: 16 / 9 },
  ];
  return candidates.reduce((best, current) => (
    Math.abs(current.value - ratio) < Math.abs(best.value - ratio) ? current : best
  )).id;
}

function getImageDisplaySizeForRatio(ratio: string): { w: number; h: number } {
  const ratioSize: Record<string, { w: number; h: number }> = {
    "1:1": { w: 260, h: 260 },
    "4:5": { w: 240, h: 300 },
    "5:4": { w: 300, h: 240 },
    "3:4": { w: 240, h: 320 },
    "4:3": { w: 320, h: 240 },
    "16:9": { w: 320, h: 180 },
    "9:16": { w: 180, h: 320 },
    "21:9": { w: 360, h: 154 },
  };
  return ratioSize[ratio] || ratioSize["1:1"];
}

function buildSkillAppliedImagePrompt(input: {
  activeSkill: PendingSkillLoad | null;
  skillContext: string;
  userPrompt: string;
  imagePrompt: string;
}) {
  const imagePrompt = input.imagePrompt.trim();
  if (!input.activeSkill) return imagePrompt;
  return [
    input.skillContext,
    `用户原始提示：${input.userPrompt.trim() || "请按当前 Skill 能力生成视觉内容。"}`,
    "最终生图要求：必须优先遵守上方 Skill 的能力说明、执行规则、尺寸和关键词，再结合用户原始提示完成图片生成。",
    imagePrompt && imagePrompt !== input.userPrompt.trim() ? `路由优化后的图像提示：${imagePrompt}` : "",
  ].filter(Boolean).join("\n\n");
}

function getCanvasNodeSize(node: Node): CanvasNodeSize {
  if (node.type === "asset") {
    const nodeData = node.data as Record<string, unknown>;
    const dataW = nodeData.imgW as number | undefined;
    const dataH = nodeData.imgH as number | undefined;
    if (typeof dataW === "number" && dataW > 0 && typeof dataH === "number" && dataH > 0) {
      return { width: dataW, height: dataH };
    }
  }

  const nodeWithRuntimeSize = node as Node & { measured?: { width?: number; height?: number }; width?: number; height?: number };
  const styleWidth = typeof node.style?.width === "number" ? node.style.width : undefined;
  const styleHeight = typeof node.style?.height === "number" ? node.style.height : undefined;
  const measuredWidth = styleWidth ?? nodeWithRuntimeSize.measured?.width ?? nodeWithRuntimeSize.width;
  const measuredHeight = styleHeight ?? nodeWithRuntimeSize.measured?.height ?? nodeWithRuntimeSize.height;
  if (typeof measuredWidth === "number" && measuredWidth > 0 && typeof measuredHeight === "number" && measuredHeight > 0) {
    return { width: measuredWidth, height: measuredHeight };
  }

  if (node.type === "asset") {
    const nodeData = node.data as Record<string, unknown>;
    const assetId = nodeData.assetId as string;
	    const asset = GENERATED_ASSETS.find(a => a.id === assetId);
	    const naturalWidth = Math.max(1, asset?.width || 260);
	    const naturalHeight = Math.max(1, asset?.height || 200);
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

function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 28,
) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function resolveNonOverlappingCanvasPosition(
  nodes: Node[],
  desired: { x: number; y: number },
  size: { width: number; height: number },
  ignoreIds: string[] = [],
) {
  const ignored = new Set(ignoreIds);
  const occupied = nodes
    .filter(node => !ignored.has(node.id))
    .map(node => {
      const nodeSize = getCanvasNodeSize(node);
      return {
        x: node.position.x,
        y: node.position.y,
        width: nodeSize.width,
        height: nodeSize.height,
      };
    });

  const stepX = Math.max(120, size.width + 36);
  const stepY = Math.max(96, size.height + 36);
  const candidates = [{ ...desired }];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (row === 0 && col === 0) continue;
      candidates.push({
        x: desired.x + col * stepX,
        y: desired.y + row * stepY,
      });
    }
  }
  for (let col = 1; col <= 8; col += 1) {
    candidates.push({
      x: desired.x + col * stepX,
      y: desired.y - stepY,
    });
  }

  return candidates.find(candidate => {
    const rect = { x: candidate.x, y: candidate.y, width: size.width, height: size.height };
    return !occupied.some(item => rectanglesOverlap(rect, item));
  }) || candidates[candidates.length - 1] || desired;
}

function fitEmbeddedAssetInsideFrame(assetNode: Node, frameNode: Node, nextFrameWidth: number, nextFrameHeight: number, scaleX: number, scaleY: number) {
  const size = getCanvasNodeSize(assetNode);
  const frameOriginX = frameNode.position.x;
  const frameOriginY = frameNode.position.y;
  const relativeX = assetNode.position.x - frameOriginX;
  const relativeY = assetNode.position.y - frameOriginY;
  const uniformScale = Math.max(0.01, Math.min(scaleX, scaleY));
  let nextWidth = Math.max(1, Math.round(size.width * uniformScale));
  let nextHeight = Math.max(1, Math.round(size.height * uniformScale));

  if (nextWidth > nextFrameWidth || nextHeight > nextFrameHeight) {
    const containScale = Math.min(nextFrameWidth / nextWidth, nextFrameHeight / nextHeight);
    nextWidth = Math.max(1, Math.round(nextWidth * containScale));
    nextHeight = Math.max(1, Math.round(nextHeight * containScale));
  }

  const maxX = frameOriginX + Math.max(0, nextFrameWidth - nextWidth);
  const maxY = frameOriginY + Math.max(0, nextFrameHeight - nextHeight);
  const nextX = Math.min(Math.max(frameOriginX + relativeX * scaleX, frameOriginX), maxX);
  const nextY = Math.min(Math.max(frameOriginY + relativeY * scaleY, frameOriginY), maxY);

  return {
    ...assetNode,
    position: { x: nextX, y: nextY },
    style: { ...assetNode.style, width: nextWidth, height: nextHeight },
    data: {
      ...(assetNode.data as Record<string, unknown>),
      imgW: nextWidth,
      imgH: nextHeight,
    },
  };
}

function getAssetNodeImageSource(node: Node): string {
  if (node.type !== "asset") return "";
  const data = node.data as Record<string, unknown>;
  const localSrc = data.localSrc as string | undefined;
  if (localSrc) return localSrc;
  const asset = GENERATED_ASSETS.find(item => item.id === data.assetId);
  return asset?.src || "";
}

function getAssetNodeDisplayTitle(node: Node): string {
  const data = node.data as Record<string, unknown>;
  const asset = GENERATED_ASSETS.find(item => item.id === data.assetId);
  return (data.title as string | undefined) || asset?.title || "画布图片";
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

const initialNodes: Node[] = [];

const initialEdges: Edge[] = [];

function createInitialSocialArtboardNode(project?: WorkspaceHistoryProject | null): Node[] {
  if (!project?.canvasWidth || !project?.canvasHeight) return initialNodes;
  const width = Math.max(1, Math.round(project.canvasWidth));
  const height = Math.max(1, Math.round(project.canvasHeight));
  const originalBgColor = "#2a2a30";
  const bgColor = withCanvasFrameAlpha(originalBgColor);
  const id = `canvas-frame-${project.id}`;
  return [{
    id,
    type: "canvasFrame",
    position: { x: 160, y: 120 },
    style: { width, height, background: bgColor },
    selected: false,
    data: {
      id,
      title: project.title || "画板",
      width,
      height,
      bgColor,
      originalBgColor,
      socialPresetId: project.socialPresetId,
    },
  }];
}

const CANVAS_STATE_STORAGE_PREFIX = "artx:canvas-state:";
const CANVAS_STATE_SESSION_PREFIX = "artx:canvas-state:fallback:";
const TEST_CANVAS_STATE_RESET_KEY = "artx:canvas-state:reset-test-canvases-20260620";
const CANVAS_IMAGE_GENERATION_TASKS_STORAGE_KEY = "artx:canvas-image-generation-tasks";
const CANVAS_IMAGE_DB_NAME = "artx-canvas-images";
const CANVAS_IMAGE_STORE_NAME = "images";
const EXTRACT_TEXT_LOADING_MESSAGE = "正在提取文案中...";
const AI_GENERATION_NETWORK_ERROR_MESSAGE = "对不起，网络开了个小差，请稍后重试";
const AI_GENERATION_TIMEOUT_MS = 300_000;

type PersistedCanvasState = {
  nodes: Node[];
  edges: Edge[];
  updatedAt: string;
};

type PersistedImageGenerationTask = Omit<ImageGeneratorPayload, "generationId" | "status" | "images"> & {
  generationId: string;
  status: "pending" | "completed" | "failed";
  updatedAt: number;
  createdAt?: number;
  generationStartedAt?: number;
  backgroundStartedAt?: number;
  consumedAt?: number;
  images?: Array<{ src?: string; width: number; height: number; storedKey?: string }>;
};

function getTimestampFromGenerationId(generationId?: string) {
  const match = generationId?.match(/\d{13}/);
  if (!match) return undefined;
  const timestamp = Number(match[0]);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function getImageGenerationStartedAt(input: {
  generationId?: string;
  generationStartedAt?: unknown;
  createdAt?: unknown;
  backgroundStartedAt?: unknown;
  updatedAt?: unknown;
}) {
  const explicitStartedAt = typeof input.generationStartedAt === "number" ? input.generationStartedAt : undefined;
  const createdAt = typeof input.createdAt === "number" ? input.createdAt : undefined;
  const idTimestamp = getTimestampFromGenerationId(input.generationId);
  const backgroundStartedAt = typeof input.backgroundStartedAt === "number" ? input.backgroundStartedAt : undefined;
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : undefined;
  return explicitStartedAt || createdAt || idTimestamp || backgroundStartedAt || updatedAt || Date.now();
}

function isImageGenerationTimedOut(input: {
  generationId?: string;
  generationStartedAt?: unknown;
  createdAt?: unknown;
  backgroundStartedAt?: unknown;
  updatedAt?: unknown;
}, now = Date.now()) {
  return now - getImageGenerationStartedAt(input) >= AI_GENERATION_TIMEOUT_MS;
}

function isPendingImageGenerationNode(node: Node) {
  if (node.type !== "asset") return false;
  const data = node.data as Record<string, unknown>;
  if (data.isGenerationFailed === true) return false;
  const title = typeof data.title === "string" ? data.title : "";
  return (
    data.isGeneratingImage === true ||
    (typeof data.generationId === "string" && !data.localSrc) ||
    title.includes("正在全力生成中")
  );
}

function removePendingImageGenerationNodes(nodes: Node[]) {
  return nodes.filter(node => !isPendingImageGenerationNode(node));
}

function formatProjectHistoryTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function canvasStateStorageKey(projectId: string) {
  return `${CANVAS_STATE_STORAGE_PREFIX}${projectId || "p1"}`;
}

function canvasStateSessionKey(projectId: string) {
  return `${CANVAS_STATE_SESSION_PREFIX}${projectId || "p1"}`;
}

function isRealCanvasProjectId(projectId: string) {
  return projectId.startsWith("canvas-");
}

function ensureTestCanvasStateReset() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(TEST_CANVAS_STATE_RESET_KEY) === "1") return;
  const shouldRemoveCanvasKey = (key: string) => {
    if (!key.startsWith(CANVAS_STATE_STORAGE_PREFIX) && !key.startsWith(CANVAS_STATE_SESSION_PREFIX)) return false;
    const projectId = key
      .replace(CANVAS_STATE_SESSION_PREFIX, "")
      .replace(CANVAS_STATE_STORAGE_PREFIX, "");
    return Boolean(projectId && !isRealCanvasProjectId(projectId));
  };
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key && shouldRemoveCanvasKey(key)) window.localStorage.removeItem(key);
  }
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key && shouldRemoveCanvasKey(key)) window.sessionStorage.removeItem(key);
  }
  window.localStorage.setItem(TEST_CANVAS_STATE_RESET_KEY, "1");
}

function canvasImagePayloadKey(projectId: string, nodeId: string) {
  return `${projectId || "p1"}:${nodeId}`;
}

function imageGenerationTaskImageKey(projectId: string, generationId: string, index: number) {
  return `${projectId || "p1"}:image-task:${generationId}:${index}`;
}

function readPersistedImageGenerationTasks() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CANVAS_IMAGE_GENERATION_TASKS_STORAGE_KEY) || "[]") as PersistedImageGenerationTask[];
    if (!Array.isArray(parsed)) return [];
    const activeTasks = parsed.filter(task => task?.generationId);
    return activeTasks;
  } catch {
    return [];
  }
}

function writePersistedImageGenerationTasks(tasks: PersistedImageGenerationTask[]) {
  if (typeof window === "undefined") return;
  const pruned = tasks
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 60);
  try {
    window.localStorage.setItem(CANVAS_IMAGE_GENERATION_TASKS_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    const lightweight = pruned.map(task => task.status === "completed"
      ? { ...task, images: undefined, consumedAt: task.consumedAt || Date.now() }
      : task
    );
    try {
      window.localStorage.setItem(CANVAS_IMAGE_GENERATION_TASKS_STORAGE_KEY, JSON.stringify(lightweight.slice(0, 30)));
    } catch {
      /* ignore image task persistence quota errors */
    }
  }
}

function persistImageGenerationTask(detail: ImageGeneratorPayload, fallbackProjectId: string) {
  if (typeof window === "undefined" || !detail.prompt?.trim()) return;
  const generationId = detail.generationId || `image-gen-${Date.now()}`;
  const status = detail.status || "pending";
  const projectId = detail.projectId || fallbackProjectId || "p1";
  const tasks = readPersistedImageGenerationTasks();
  const previous = tasks.find(task => task.generationId === generationId && (task.projectId || "p1") === projectId);
  const now = Date.now();
  const lightweightImages = detail.images?.map((image, index) => ({
    width: image.width,
    height: image.height,
    src: image.src?.startsWith("data:") ? undefined : image.src,
    storedKey: image.src?.startsWith("data:") ? imageGenerationTaskImageKey(projectId, generationId, index) : undefined,
  }));
  const nextTask: PersistedImageGenerationTask = {
    ...(previous || {}),
    ...detail,
    projectId,
    generationId,
    status,
    images: lightweightImages || previous?.images,
    referencedAssets: undefined,
    createdAt: previous?.createdAt || detail.generationStartedAt || getTimestampFromGenerationId(generationId) || now,
    generationStartedAt: previous?.generationStartedAt || detail.generationStartedAt || getTimestampFromGenerationId(generationId) || now,
    backgroundStartedAt: previous?.backgroundStartedAt,
    updatedAt: now,
    consumedAt: previous?.consumedAt,
  };
  writePersistedImageGenerationTasks([
    nextTask,
    ...tasks.filter(task => !(task.generationId === generationId && (task.projectId || "p1") === projectId)),
  ]);
}

function markImageGenerationTaskBackgroundStarted(projectId: string, generationId: string) {
  const tasks = readPersistedImageGenerationTasks();
  let changed = false;
  const next = tasks.map(task => {
    if (task.generationId !== generationId || (task.projectId || "p1") !== (projectId || "p1")) return task;
    changed = true;
    return { ...task, backgroundStartedAt: task.backgroundStartedAt || Date.now(), updatedAt: Date.now() };
  });
  if (changed) writePersistedImageGenerationTasks(next);
}

function dispatchImageGenerationTask(detail: ImageGeneratorPayload, fallbackProjectId = "p1") {
  const nextDetail = {
    ...detail,
    projectId: detail.projectId || fallbackProjectId,
    generationId: detail.generationId || `image-gen-${Date.now()}`,
  };
  if (nextDetail.status === "completed" && nextDetail.images?.length) {
    void persistImageGenerationTaskImages(nextDetail.projectId, nextDetail.generationId, nextDetail.images)
      .then(() => persistImageGenerationTask(nextDetail, fallbackProjectId));
  } else {
    persistImageGenerationTask(nextDetail, fallbackProjectId);
  }
  window.dispatchEvent(new CustomEvent("image-generator-submit", { detail: nextDetail }));
}

function markImageGenerationTaskConsumed(projectId: string, generationId: string) {
  const tasks = readPersistedImageGenerationTasks();
  let changed = false;
  const next = tasks.map(task => {
    if (task.generationId !== generationId || (task.projectId || "p1") !== (projectId || "p1")) return task;
    changed = true;
    return { ...task, consumedAt: Date.now(), updatedAt: Date.now() };
  });
  if (changed) writePersistedImageGenerationTasks(next);
}

async function consumeCompletedImageGenerationTasks(projectId: string) {
  const tasks = readPersistedImageGenerationTasks();
  const matching = tasks.filter(task => (
    (task.projectId || "p1") === (projectId || "p1") &&
    task.status === "completed" &&
    !task.consumedAt &&
    Array.isArray(task.images) &&
    task.images.length > 0
  ));
  if (matching.length === 0) return [];
  const consumedAt = Date.now();
  writePersistedImageGenerationTasks(tasks.map(task => (
    matching.some(item => item.generationId === task.generationId && (item.projectId || "p1") === (task.projectId || "p1"))
      ? { ...task, consumedAt, updatedAt: consumedAt }
      : task
  )));
  return Promise.all(matching.map(async task => ({
    ...task,
    images: await hydrateImageGenerationTaskImages(projectId, task),
  })));
}

function readPendingImageGenerationTasks(projectId: string) {
  const now = Date.now();
  const tasks = readPersistedImageGenerationTasks();
  let changed = false;
  const nextTasks = tasks.map(task => {
    if (
      (task.projectId || "p1") === (projectId || "p1") &&
      task.status === "pending" &&
      !task.consumedAt &&
      isImageGenerationTimedOut(task, now)
    ) {
      changed = true;
      return {
        ...task,
        status: "failed" as const,
        error: AI_GENERATION_NETWORK_ERROR_MESSAGE,
        updatedAt: now,
      };
    }
    return task;
  });
  if (changed) writePersistedImageGenerationTasks(nextTasks);
  return nextTasks.filter(task => (
    (task.projectId || "p1") === (projectId || "p1") &&
    task.status === "pending" &&
    !task.consumedAt
  ));
}

function openCanvasImageDb() {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(CANVAS_IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANVAS_IMAGE_STORE_NAME)) {
        db.createObjectStore(CANVAS_IMAGE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function persistImageGenerationTaskImages(projectId: string, generationId: string, images: Array<{ src: string; width: number; height: number }>) {
  const imageEntries = images
    .map((image, index) => (
      image.src?.startsWith("data:")
        ? { key: imageGenerationTaskImageKey(projectId, generationId, index), localSrc: image.src }
        : null
    ))
    .filter(Boolean) as { key: string; localSrc: string }[];
  if (imageEntries.length === 0) return;
  const db = await openCanvasImageDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(CANVAS_IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CANVAS_IMAGE_STORE_NAME);
    imageEntries.forEach(entry => store.put(entry.localSrc, entry.key));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

async function hydrateImageGenerationTaskImages(projectId: string, task: PersistedImageGenerationTask) {
  const images = task.images || [];
  const missing = images.filter(image => image.storedKey && !image.src);
  if (missing.length === 0) {
    return images.filter((image): image is { src: string; width: number; height: number } => Boolean(image.src));
  }
  const db = await openCanvasImageDb();
  if (!db) {
    return images.filter((image): image is { src: string; width: number; height: number } => Boolean(image.src));
  }
  const restored = new Map<string, string>();
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(CANVAS_IMAGE_STORE_NAME, "readonly");
    const store = transaction.objectStore(CANVAS_IMAGE_STORE_NAME);
    missing.forEach(image => {
      if (!image.storedKey) return;
      const request = store.get(image.storedKey);
      request.onsuccess = () => {
        if (typeof request.result === "string" && image.storedKey) restored.set(image.storedKey, request.result);
      };
    });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
  return images
    .map(image => ({
      src: image.src || (image.storedKey ? restored.get(image.storedKey) : undefined) || "",
      width: image.width,
      height: image.height,
    }))
    .filter(image => Boolean(image.src));
}

async function persistCanvasNodeImagePayloads(projectId: string, nodes: Node[]) {
  const imageEntries = removePendingImageGenerationNodes(nodes)
    .filter(node => node.type === "asset")
    .map(node => {
      const data = node.data as Record<string, unknown>;
      const localSrc = typeof data.localSrc === "string" ? data.localSrc : "";
      return localSrc.startsWith("data:") ? { key: canvasImagePayloadKey(projectId, node.id), localSrc } : null;
    })
    .filter(Boolean) as { key: string; localSrc: string }[];
  if (imageEntries.length === 0) return;
  const db = await openCanvasImageDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(CANVAS_IMAGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(CANVAS_IMAGE_STORE_NAME);
    imageEntries.forEach(entry => store.put(entry.localSrc, entry.key));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

async function hydrateCanvasNodeImagePayloads(projectId: string, nodes: Node[]) {
  const missingAssetNodes = nodes.filter(node => {
    if (node.type !== "asset") return false;
    const data = node.data as Record<string, unknown>;
    return data.fullImageStoredInSession === true && typeof data.localSrc !== "string";
  });
  if (missingAssetNodes.length === 0) return nodes;
  const db = await openCanvasImageDb();
  if (!db) return nodes;
  const restored = new Map<string, string>();
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(CANVAS_IMAGE_STORE_NAME, "readonly");
    const store = transaction.objectStore(CANVAS_IMAGE_STORE_NAME);
    missingAssetNodes.forEach(node => {
      const request = store.get(canvasImagePayloadKey(projectId, node.id));
      request.onsuccess = () => {
        if (typeof request.result === "string") restored.set(node.id, request.result);
      };
    });
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
  if (restored.size === 0) return nodes;
  return nodes.map(node => {
    const localSrc = restored.get(node.id);
    if (!localSrc || node.type !== "asset") return node;
    const data = node.data as Record<string, unknown>;
    return {
      ...node,
      data: {
        ...data,
        localSrc,
        fullImageStoredInSession: undefined,
      },
    };
  });
}

function stripLargeCanvasNodePayloads(nodes: Node[]) {
  return nodes.map(node => {
    if (node.type !== "asset") return node;
    const data = node.data as Record<string, unknown>;
    const localSrc = typeof data.localSrc === "string" ? data.localSrc : "";
    if (!localSrc.startsWith("data:")) return node;
    return {
      ...node,
      data: {
        ...data,
        localSrc: undefined,
        fullImageStoredInSession: true,
      },
    };
  });
}

function normalizeCanvasFrameNode(node: Node): Node {
  if (node.type !== "canvasFrame") return node;
  const data = node.data as Record<string, unknown>;
  const rawBg = data.originalBgColor || data.bgColor || (node.style as Record<string, unknown> | undefined)?.background || "#2a2a30";
  const translucentBg = withCanvasFrameAlpha(rawBg);
  return {
    ...node,
    style: { ...node.style, background: translucentBg },
    data: {
      ...data,
      bgColor: translucentBg,
      originalBgColor: data.originalBgColor || rawBg,
    },
  };
}

function normalizeCanvasFrameNodes(nodes: Node[]) {
  return nodes.map(normalizeCanvasFrameNode);
}

function safeReadCanvasState(projectId: string): PersistedCanvasState | null {
  if (typeof window === "undefined") return null;
  ensureTestCanvasStateReset();
  const readRawState = (raw: string | null) => {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCanvasState;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    const nodes = normalizeCanvasFrameNodes(parsed.nodes);
    const nodeIds = new Set(nodes.map(node => node.id));
    const edges = parsed.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { ...parsed, nodes, edges };
  };
  try {
    return readRawState(window.sessionStorage.getItem(canvasStateSessionKey(projectId))) || readRawState(window.localStorage.getItem(canvasStateStorageKey(projectId)));
  } catch {
    try {
      window.sessionStorage.removeItem(canvasStateSessionKey(projectId));
    } catch {
      /* ignore storage cleanup errors */
    }
    return null;
  }
}

function safeWriteCanvasState(projectId: string, state: PersistedCanvasState) {
  if (typeof window === "undefined") return;
  ensureTestCanvasStateReset();
  const key = canvasStateStorageKey(projectId);
  const sessionKey = canvasStateSessionKey(projectId);
  const cleanedNodes = normalizeCanvasFrameNodes(state.nodes);
  const nodeIds = new Set(cleanedNodes.map(node => node.id));
  const cleanedState: PersistedCanvasState = {
    ...state,
    nodes: cleanedNodes,
    edges: state.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
  const serializedFullState = JSON.stringify(cleanedState);
  let sessionSaved = false;
  void persistCanvasNodeImagePayloads(projectId, cleanedState.nodes);

  try {
    window.sessionStorage.setItem(sessionKey, serializedFullState);
    sessionSaved = true;
  } catch {
    /* The persistent fallback below still keeps a lightweight canvas state. */
  }

  try {
    const persistedState = sessionSaved
      ? { ...cleanedState, nodes: stripLargeCanvasNodePayloads(cleanedState.nodes) }
      : cleanedState;
    window.localStorage.setItem(key, JSON.stringify(persistedState));
    if (!sessionSaved) window.sessionStorage.removeItem(sessionKey);
  } catch {
    if (!sessionSaved) {
      toast("画布自动保存受限", { description: "浏览器存储空间不足，本次编辑仍会保留在当前页面中" });
    }
  }
}

function getCanvasStateCoverSource(nodes: Node[]) {
  const imageNode = nodes.find(node => node.type === "asset" && typeof (node.data as Record<string, unknown>)?.localSrc === "string");
  return imageNode ? ((imageNode.data as Record<string, unknown>).localSrc as string) : null;
}

async function createCanvasCoverThumbnail(src: string) {
  if (!src.startsWith("data:") && src.length < 180_000) return src;
  const image = new Image();
  image.decoding = "async";
  if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  const maxSide = 520;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || maxSide, image.naturalHeight || maxSide));
  const width = Math.max(1, Math.round((image.naturalWidth || maxSide) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || maxSide) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function getCanvasProjectHistoryPatch(nodes: Node[], updatedAt: string) {
  return {
    nodeCount: nodes.length,
    updatedAt,
  };
}

function getImportedImageDisplaySize(naturalWidth: number, naturalHeight: number) {
  const width = Math.max(1, naturalWidth || 360);
  const height = Math.max(1, naturalHeight || 360);
  const maxSide = 360;
  const minSide = 120;
  const scale = Math.min(0.5, maxSide / Math.max(width, height));
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  if (Math.min(scaledWidth, scaledHeight) >= minSide) {
    return { width: scaledWidth, height: scaledHeight };
  }
  const minScale = minSide / Math.min(width, height);
  const finalScale = Math.min(minScale, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * finalScale)),
    height: Math.max(1, Math.round(height * finalScale)),
  };
}

function normalizeDroppedImageUrl(value: string) {
  const source = value.trim();
  if (!source || /^(javascript|mailto|tel):/i.test(source)) return "";
  if (/^(data:image\/|blob:|https?:\/\/)/i.test(source)) return source;
  return "";
}

function getFirstSrcsetCandidate(srcset: string | null) {
  const firstCandidate = srcset?.split(",")[0]?.trim();
  return firstCandidate?.split(/\s+/)[0] || "";
}

function extractImageSourcesFromDataTransfer(dataTransfer: DataTransfer | null | undefined) {
  const sources: string[] = [];
  const addSource = (value: string) => {
    const normalized = normalizeDroppedImageUrl(value);
    if (normalized) sources.push(normalized);
  };

  const html = dataTransfer?.getData("text/html") || "";
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    Array.from(doc.querySelectorAll("img")).forEach(img => {
      addSource(img.getAttribute("src") || img.src);
      addSource(getFirstSrcsetCandidate(img.getAttribute("srcset")));
      addSource(img.getAttribute("data-src") || "");
      addSource(img.getAttribute("data-original") || "");
    });
    Array.from(doc.querySelectorAll("source")).forEach(source => {
      addSource(source.getAttribute("src") || "");
      addSource(getFirstSrcsetCandidate(source.getAttribute("srcset")));
    });
  }

  const uriList = dataTransfer?.getData("text/uri-list") || "";
  uriList
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .forEach(addSource);

  const plain = dataTransfer?.getData("text/plain") || "";
  plain
    .split(/\r?\n/)
    .map(line => line.trim())
    .forEach(addSource);

  return Array.from(new Set(sources));
}

function dataTransferHasExternalImage(dataTransfer: DataTransfer | null | undefined) {
  const types = Array.from(dataTransfer?.types || []);
  if (types.includes("Files")) {
    return Array.from(dataTransfer?.items || []).some(item => item.kind === "file" && item.type.startsWith("image/"));
  }
  return types.some(type => type === "text/html" || type === "text/uri-list" || type === "text/plain");
}

// ── Bottom AI Prompt Bar ───────────────────────────────────────
function BottomPromptBar({
  isDark,
  projectId,
  activeSkill,
  onActiveSkillChange,
  referencedAssets,
  onRemoveReference,
  onClearAllReferences,
}: {
  isDark: boolean;
  projectId: string;
  activeSkill: PendingSkillLoad | null;
  onActiveSkillChange: (skill: PendingSkillLoad | null) => void;
  referencedAssets: ImageGeneratorReferenceAsset[];
  onRemoveReference: (id: string) => void;
  onClearAllReferences: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("auto");
  const [rows, setRows] = useState(1);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoRunPromptRef = useRef<string | null>(null);
  const autoRunModelRef = useRef<string | null>(null);
  const hasRefs = referencedAssets.length > 0;
  const skillContext = activeSkill ? buildSkillPromptContext(activeSkill) : "";
  const bg = isDark ? "rgba(22,22,30,0.80)" : "rgba(255,255,255,0.82)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const activeBorder = "oklch(0.62 0.22 290 / 60%)";
  const text = isDark ? "oklch(0.80 0.008 270)" : "oklch(0.20 0.008 270)";
  const divider = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)";
  const chipBg = isDark ? "oklch(0.58 0.22 290 / 0.18)" : "oklch(0.58 0.22 290 / 0.12)";
  const chipBorder = isDark ? "oklch(0.62 0.22 290 / 0.35)" : "oklch(0.58 0.22 290 / 0.30)";
  const chipText = isDark ? "oklch(0.80 0.18 290)" : "oklch(0.42 0.18 290)";
  const removeColor = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.58 0.01 270)";

  const resizePromptTextarea = useCallback((input: HTMLTextAreaElement | null) => {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(24, input.scrollHeight)}px`;
  }, []);

  // Auto-focus textarea when references change
  useEffect(() => {
    if (hasRefs) {
      setTimeout(() => {
        resizePromptTextarea(textareaRef.current);
        textareaRef.current?.focus();
      }, 60);
    }
  }, [hasRefs, resizePromptTextarea]);

  useEffect(() => {
    resizePromptTextarea(textareaRef.current);
  }, [prompt, rows, resizePromptTextarea]);

  const handleSend = async (overridePrompt?: string) => {
    const effectivePrompt = typeof overridePrompt === "string" ? overridePrompt : prompt.trim();
    if ((effectivePrompt || hasRefs) && !isSending) {
      if (!requestAiAuth()) {
        toast("请先登录", { description: "登录后即可使用 AI 能力" });
        return;
      }
      const submittedPrompt = activeSkill && effectivePrompt
        ? `${skillContext}\n\n用户提示：${effectivePrompt}`
        : effectivePrompt;
      const visiblePrompt = effectivePrompt;
      const submittedRefs = typeof overridePrompt === "string" ? [] : referencedAssets.map(asset => ({ ...asset }));
      if (activeSkill?.capability === "image_edit" && submittedRefs.length === 0) {
        toast("请先选择一张图片", { description: "「局部编辑改图」需要基于画布图片或参考图进行编辑。" });
        return;
      }
      const selectedGenerationModel = autoRunModelRef.current || model;
      const selectedTextModel = "gpt-5.4-mini";
      autoRunModelRef.current = null;
      setIsSending(true);
      setPrompt("");
      setRows(1);
      onClearAllReferences();
      resizePromptTextarea(textareaRef.current);
      try {
        const decision = await routeCreativeIntent({
          module: "bottom-global-prompt-router",
          model: "gpt-4o",
          prompt: submittedPrompt || "请基于引用素材继续创作。",
          referencedAssets: submittedRefs,
          preferImageWhenReferences: true,
        });
        if (decision.mode === "image") {
          const imagePrompt = decision.imagePrompt?.trim() || submittedPrompt || "基于引用素材生成一张视觉图像。";
          const targetReference = submittedRefs[submittedRefs.length - 1];
          const targetDisplaySize = targetReference?.width && targetReference?.height
            ? { w: targetReference.width, h: targetReference.height }
            : undefined;
          const finalImagePrompt = buildSkillAppliedImagePrompt({
            activeSkill,
            skillContext,
            userPrompt: visiblePrompt,
            imagePrompt,
          });
          const generationId = `bottom-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const payload: ImageGeneratorPayload = {
            projectId,
            prompt: finalImagePrompt,
            model: selectedGenerationModel,
            ratio: "1:1",
            count: 1,
            style: "智能判断",
            referencesEnabled: submittedRefs.length > 0,
            generationId,
            displaySize: targetDisplaySize,
            skillId: activeSkill?.id,
          };
          dispatchImageGenerationTask({ ...payload, status: "pending" }, projectId);
          toast("AI 判断为生成图片", { description: imagePrompt.slice(0, 90) });
          try {
            const result = activeSkill?.capability === "image_edit" && targetReference
              ? await editImageWithPrompt({
                  imageSrc: targetReference.src,
                  model: "gpt-image-2",
                  prompt: payload.prompt,
                  referencedAssets: submittedRefs.slice(0, -1),
                  skillId: activeSkill.id,
                  targetWidth: targetReference.width,
                  targetHeight: targetReference.height,
                })
              : await generateAiImages(payload);
            dispatchImageGenerationTask({ ...payload, status: "completed", images: result.images }, projectId);
          } catch (error) {
            const message = error instanceof Error ? error.message : "请稍后重试";
            dispatchImageGenerationTask({ ...payload, status: "failed", error: message }, projectId);
            throw error;
          }
          return;
        }

        const textResult = await callLLM({
          module: "bottom-global-prompt-chat",
          model: selectedTextModel,
          images: submittedRefs.map(asset => ({ src: asset.src, title: asset.title })),
          prompt: submittedPrompt || visiblePrompt || "请基于当前上下文回复用户。",
        });
        toast("AI 已回复", { description: (decision.reply || visiblePrompt || submittedPrompt).slice(0, 120) });
        window.dispatchEvent(new CustomEvent("canvas-assistant-external-message", {
          detail: {
            content: textResult.text || decision.reply || visiblePrompt || submittedPrompt,
          },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "请稍后重试";
        toast("全局提示词处理失败", { description: message });
      } finally {
        setIsSending(false);
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("artx:pending-home-prompt");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { projectId?: string; prompt?: string; model?: string };
      if (payload.projectId !== projectId || !payload.prompt?.trim()) return;
      window.sessionStorage.removeItem("artx:pending-home-prompt");
      const nextPrompt = payload.prompt.trim();
      setPrompt(nextPrompt);
      setRows(Math.max(1, nextPrompt.split("\n").length));
      window.setTimeout(() => resizePromptTextarea(textareaRef.current), 0);
      autoRunPromptRef.current = nextPrompt;
      autoRunModelRef.current = ALL_AI_MODEL_OPTIONS.some(model => model.id === payload.model) ? payload.model! : null;
      window.setTimeout(() => {
        const promptToRun = autoRunPromptRef.current;
        autoRunPromptRef.current = null;
        if (autoRunModelRef.current) {
          setModel(autoRunModelRef.current);
        }
        if (promptToRun) void handleSend(promptToRun);
      }, 360);
    } catch {
      window.sessionStorage.removeItem("artx:pending-home-prompt");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
    : activeSkill
      ? `已加载「${activeSkill.name}」，描述你想用它生成什么...`
      : "描述你想创作的内容，AI 将在画布上生成节点...";

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[var(--radius-lg-design)] shadow-2xl overflow-hidden"
      style={{
        background: bg,
        border: `1.5px solid ${hasRefs || activeSkill ? activeBorder : border}`,
        backdropFilter: "blur(20px)",
        width: "min(680px, calc(100% - 420px))",
        zIndex: 50,
        transition: "border-color 0.25s cubic-bezier(0.23,1,0.32,1), box-shadow 0.25s cubic-bezier(0.23,1,0.32,1)",
        boxShadow: hasRefs || activeSkill
          ? `0 0 0 3px oklch(0.62 0.22 290 / 0.12), 0 10px 34px rgba(210,214,224,0.10)`
          : `0 10px 34px rgba(210,214,224,0.10)`,
      }}
    >
      {/* Multi-reference chip row */}
      {(activeSkill || hasRefs) && (
        <div
          className="flex items-center gap-1.5 px-3 pt-2.5 pb-2 flex-wrap"
          style={{ borderBottom: `1px solid ${divider}` }}
        >
          {activeSkill && (
            <div
              className="relative flex items-center gap-1.5 pr-2 pl-2 py-1 rounded-[var(--radius-pill)] type-caption"
              style={{ background: chipBg, border: `1px solid ${chipBorder}`, color: chipText }}
            >
              <Sparkles size={11} />
              <span>已加载 Skill：{activeSkill.name}</span>
            </div>
          )}
          {referencedAssets.map(asset => (
            <div
              key={asset.id}
              className="relative flex items-center gap-1.5 pr-1 pl-1 py-0.5 rounded-[var(--radius-pill)] type-caption"
              style={{ background: chipBg, border: `1px solid ${chipBorder}`, color: chipText }}
            >
              <span className="flex items-center justify-center overflow-hidden" style={{ width: 18, height: 18, borderRadius: 3, background: isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)", flexShrink: 0 }}>
                {asset.src ? (
                  <img
                    src={asset.src}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon size={10} style={{ opacity: 0.75 }} />
                )}
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
          onChange={e => {
            setPrompt(e.target.value);
            setRows(Math.max(1, e.target.value.split("\n").length));
            resizePromptTextarea(e.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          rows={rows}
          className="w-full whitespace-pre-wrap break-words bg-transparent type-caption leading-relaxed resize-none outline-none"
          style={{
            color: text,
            maxHeight: "min(34vh, 220px)",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: `${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"} transparent`,
          }}
          placeholder={placeholderText}
        />
      </div>
      <div className="flex items-center gap-2 px-3 pb-3" style={{ paddingTop: 8 }}>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <SkillPointSelector activeSkill={activeSkill} onChange={onActiveSkillChange} isDark={isDark} />
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-md-design)] type-caption hover:opacity-80"
          style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.55 0.01 270)" }}
          onClick={() => toast("参考图", { description: "功能即将上线" })}
        >
          <Paperclip size={12} /><span>参考图</span>
        </button>
        <div className="flex-1" />
        <span className="type-caption" style={{ color: isDark ? "oklch(0.38 0.008 270)" : "oklch(0.62 0.008 270)" }}>
          {isSending ? "AI 处理中" : `${hasRefs ? "Ctrl+单击 多选 · " : ""}回车发送`}
        </span>
        <button
          onClick={() => void handleSend()}
          disabled={isSending}
          className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center hover:opacity-80"
          style={{ background: hasContent ? "oklch(0.58 0.22 290)" : (isDark ? "oklch(0.22 0.015 270)" : "oklch(0.88 0.005 270)") }}
        >
          {isSending ? <RefreshCw size={13} color="white" className="animate-spin" /> : <Send size={13} color={hasContent ? "white" : (isDark ? "oklch(0.40 0.01 270)" : "oklch(0.65 0.01 270)")} />}
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
  const isVisualNodeMenu = menu.nodeType === "asset" || menu.nodeType === "canvasFrame";

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
  onDragMove,
  onDragEnd,
  onLabelDoubleClick,
}: {
  groups: GroupInfo[];
  viewport: { x: number; y: number; zoom: number };
  isDark: boolean;
  enteringGroupId: string | null;
  onContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onDoubleClick: (groupId: string) => void;
  onDragMove: (groupId: string, dx: number, dy: number) => void;
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
            onDragMove={onDragMove}
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
  onContextMenu, onDoubleClick, onDragMove, onDragEnd, onLabelDoubleClick,
}: {
  groupId: string; name: string; left: number; top: number; width: number; height: number;
  isEntering: boolean; isDark: boolean;
  containerBg: string; containerBorder: string; labelBg: string; enteringBorder: string; enteringBg: string;
  onContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onDoubleClick: (groupId: string) => void;
  onDragMove: (groupId: string, dx: number, dy: number) => void;
  onDragEnd: (groupId: string, dx: number, dy: number) => void;
  onLabelDoubleClick: (groupId: string) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; lastDx: number; lastDy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastClickTime = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag on primary button, not on label area
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-group-label]")) return;
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, lastDx: 0, lastDy: 0 };
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      // compute incremental delta since last move
      const deltaDx = dx - dragRef.current.lastDx;
      const deltaDy = dy - dragRef.current.lastDy;
      dragRef.current.lastDx = dx;
      dragRef.current.lastDy = dy;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onDragMove(groupId, deltaDx, deltaDy);
      });
    };
    const onUp = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setDragging(false);
      dragRef.current = null;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        onDragEnd(groupId, dx, dy);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [groupId, onDragMove, onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTime.current < 300) {
      // Double click detected
      e.stopPropagation();
      onDoubleClick(groupId);
    }
    lastClickTime.current = now;
  }, [groupId, onDoubleClick]);

  return (
    <div
      className="absolute"
      style={{
        left,
        top,
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
  asset, isDark, canvasRightInset, onClose, onSubmit,
}: {
  asset: { id: string; title: string; src: string };
  isDark: boolean;
  canvasRightInset: number;
  onClose: () => void;
  onSubmit: (payload: { prompt: string; model: string; references: Array<{ id: string; title: string; src: string }> }) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [uploadedRefs, setUploadedRefs] = useState<Array<{ id: string; title: string; src: string }>>([]);
  const [model, setModel] = useState("auto");
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (prompt.trim() || uploadedRefs.length > 0) {
      const refText = uploadedRefs.length > 0 ? ` · ${uploadedRefs.length} 张参考图` : "";
      toast("AI 正在智能优化", { description: `${prompt.slice(0, 60)}${refText}`.trim() });
      onSubmit({
        prompt: prompt.trim(),
        model,
        references: uploadedRefs,
      });
      setPrompt("");
      setUploadedRefs([]);
      onClose();
    } else {
      toast("请先输入编辑指令或上传参考图");
    }
  };

  const handleUploadRefs = (files: FileList | null) => {
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast("请选择图片文件（JPG / PNG / GIF / WebP）");
      return;
    }
    imageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = event => {
        const src = event.target?.result;
        if (typeof src !== "string") return;
        setUploadedRefs(prev => [...prev, {
          id: `edit-ref-${Date.now()}-${index}`,
          title: file.name.replace(/\.[^.]+$/, ""),
          src,
        }]);
      };
      reader.readAsDataURL(file);
    });
    toast(`已加载 ${imageFiles.length} 张参考图`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 24,
        right: Math.max(136, canvasRightInset) + 32,
        maxWidth: "min(680px, calc(100% - 56px))",
        marginLeft: "auto",
        marginRight: "auto",
        zIndex: 106,
        background: isDark ? "rgba(18,18,28,0.97)" : "rgba(255,255,255,0.97)",
        backdropFilter: "blur(24px)",
        border: `1.5px solid oklch(0.62 0.22 290 / 55%)`,
        boxShadow: `0 0 0 3px oklch(0.62 0.22 290 / 0.12), 0 12px 48px rgba(0,0,0,0.28)`,
        borderRadius: "var(--radius-md-design)",
        overflow: "hidden",
        // Slide-up entrance, centered inside the visible canvas area only.
        transform: visible
          ? "translateY(0)"
          : "translateY(20px)",
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
        {uploadedRefs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {uploadedRefs.map(ref => (
              <div
                key={ref.id}
                className="relative h-12 w-12 overflow-hidden rounded-[var(--radius-md-design)]"
                style={{ border: `1px solid ${divider}`, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}
                title={ref.title}
              >
                <img src={ref.src} alt={ref.title} className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-[var(--radius-pill)]"
                  style={{ background: "rgba(0,0,0,0.55)", color: "white" }}
                  onClick={() => setUploadedRefs(prev => prev.filter(item => item.id !== ref.id))}
                  aria-label="移除参考图"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center gap-2 px-3 pb-3" style={{ borderTop: `1px solid ${divider}`, paddingTop: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={event => handleUploadRefs(event.target.files)}
        />
        <button
          type="button"
          className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center hover:opacity-80 active:scale-90 transition-all"
          style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: subtext }}
          title="上传参考图片"
          aria-label="上传参考图片"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={13} />
        </button>
        <ModelSelector model={model} onChange={setModel} isDark={isDark} />
        <div className="flex-1" />
        <span className="type-caption" style={{ color: subtext }}>回车发送</span>
        <button
          onClick={handleSend}
          className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center hover:opacity-80 active:scale-90 transition-all"
          style={{ background: prompt.trim() || uploadedRefs.length > 0 ? "oklch(0.58 0.22 290)" : (isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)") }}
        >
          <Send size={13} color={prompt.trim() || uploadedRefs.length > 0 ? "white" : (isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)")} />
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


function ImageGeneratorPopover({ isDark, projectId, onClose }: { isDark: boolean; projectId: string; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("auto");
  const [modelOpen, setModelOpen] = useState(false);
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(2);
  const [referencesEnabled, setReferencesEnabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  const bg = isDark ? "rgba(18,18,28,0.98)" : "rgba(255,255,255,0.98)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.86)" : "rgba(22,22,34,0.86)";
  const sub = isDark ? "rgba(255,255,255,0.46)" : "rgba(22,22,34,0.48)";
  const fieldBg = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.035)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const accent = "oklch(0.64 0.22 285)";
  const selectedModel = IMAGE_AI_MODEL_OPTIONS.find(item => item.id === model) || AUTO_AI_MODEL;
  const ratios = ["1:1", "4:5", "5:4", "3:4", "4:3", "16:9", "9:16", "21:9"];
  const counts = [1, 2, 3, 4];
  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (event: MouseEvent) => {
      if (modelRef.current && event.target instanceof globalThis.Node && !modelRef.current.contains(event.target)) setModelOpen(false);
    };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [modelOpen]);

  const controlButtonStyle = (active: boolean): React.CSSProperties => ({
    height: 30,
    minWidth: 52,
    padding: "0 10px",
    borderRadius: "var(--radius-md-design)",
    border: `1px solid ${active ? "oklch(0.64 0.22 285 / 0.52)" : border}`,
    background: active ? "oklch(0.64 0.22 285 / 0.16)" : fieldBg,
    color: active ? (isDark ? "white" : "oklch(0.38 0.18 285)") : text,
    fontSize: 12,
    transition: "background 0.16s ease, border-color 0.16s ease, transform 0.16s ease",
  });

  const requestCanvasReferences = useCallback(() => new Promise<ImageGeneratorReferenceAsset[]>((resolve) => {
    window.dispatchEvent(new CustomEvent("image-generator-reference-request", {
      detail: {
        resolve: (assets: ImageGeneratorReferenceAsset[]) => resolve(assets),
      },
    }));
    window.setTimeout(() => resolve([]), 120);
  }), []);

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast("请输入图像生成提示词");
      return;
    }
    if (!requestAiAuth()) {
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
    setIsGenerating(true);
    const generationId = `image-gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const canvasReferences = referencesEnabled ? await requestCanvasReferences() : [];
    const referenceSummary = canvasReferences.length
      ? [
          "参考当前画布图片生成。请结合参考图中的主体、构图、色彩、材质和视觉氛围，但不要直接复制画面。",
          ...canvasReferences.slice(0, 8).map((asset, index) => `参考图 ${index + 1}：${asset.title}`),
          `用户提示：${prompt.trim()}`,
        ].join("\n")
      : prompt.trim();
    const payload: ImageGeneratorPayload = {
      projectId,
      prompt: referenceSummary,
      model,
      ratio,
      count,
      style: "图像生成器",
      referencesEnabled: canvasReferences.length > 0,
      generationId,
      sourceBackgroundSrc: canvasReferences[0]?.src,
    };
    dispatchImageGenerationTask({ ...payload, status: "pending" }, projectId);
    try {
      let result: { images: Array<{ src: string; width: number; height: number }> };
      if (canvasReferences[0]?.src) {
        const ratioSize = getImageDisplaySizeForRatio(ratio);
        const images = await Promise.all(Array.from({ length: count }, async (_, index) => {
          const editResult = await editImageWithPrompt({
            imageSrc: canvasReferences[0].src,
            prompt: [
              referenceSummary,
              `生成第 ${index + 1} 张变体。`,
              "输出一张全新的图片，参考当前画布图片的视觉信息，并严格遵守用户提示。",
            ].join("\n"),
            model,
            targetWidth: ratioSize.w,
            targetHeight: ratioSize.h,
          });
          return editResult.images[0];
        }));
        result = { images: images.filter(Boolean) };
      } else {
        result = await generateAiImages(payload);
      }
      dispatchImageGenerationTask({ ...payload, status: "completed", images: result.images }, projectId);
      setIsGenerating(false);
      setPrompt("");
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      dispatchImageGenerationTask({ ...payload, status: "failed", error: message }, projectId);
      toast("图像生成失败", { description: message });
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="absolute top-full mt-2 overflow-hidden rounded-[var(--radius-xl-design)] shadow-2xl"
      style={{
        right: 0,
        width: 430,
        background: bg,
        border: `1px solid ${border}`,
        backdropFilter: "blur(22px)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.36)",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center" style={{ color: "oklch(0.72 0.18 205)" }}>
            <WandSparkles size={25} strokeWidth={1.85} />
          </span>
          <div>
            <p className="type-caption" style={{ color: text }}>图像生成器</p>
            <p className="type-caption" style={{ color: sub, fontSize: 11 }}>基于当前画布生成新图像节点</p>
          </div>
        </div>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md-design)] hover:opacity-75" style={{ color: sub }} onClick={onClose} aria-label="关闭图像生成器">
          <X size={14} />
        </button>
      </div>

      <div className="p-4">
        <div className="rounded-[var(--radius-lg-design)] p-3" style={{ background: fieldBg, border: `1px solid ${border}` }}>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            rows={4}
            className="w-full resize-none bg-transparent outline-none"
            style={{ color: text, fontSize: 14, lineHeight: 1.65 }}
            placeholder="描述要生成的图像，例如：未来感跑鞋产品海报，紫蓝霓虹光，干净电商主视觉..."
            autoFocus
          />
          <div className="mt-2 flex items-center justify-between" style={{ color: sub }}>
            <span className="type-caption">Enter 生成 · Shift+Enter 换行</span>
            <span className="type-caption">{prompt.trim().length}/500</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_1.45fr] gap-3">
          <div>
            <p className="mb-1.5 type-caption" style={{ color: sub }}>模型</p>
            <div ref={modelRef} className="relative">
              <button
                type="button"
                className="flex h-9 w-full items-center justify-between rounded-[var(--radius-lg-design)] px-3 type-caption transition-colors"
                style={{ background: fieldBg, border: `1px solid ${border}`, color: text }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = fieldBg)}
                onClick={() => setModelOpen(open => !open)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-4 rounded-[var(--radius-pill)] shrink-0" style={{ background: selectedModel.color }} />
                  <span className="truncate">{selectedModel.label}</span>
                </span>
                <ChevronDown size={12} style={{ opacity: 0.6, transform: modelOpen ? "rotate(180deg)" : "none", transition: "transform 0.16s ease" }} />
              </button>

              {modelOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
                  style={{
                    background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.97 0.004 270)",
                    border: `1px solid ${border}`,
                    minWidth: 220,
                    width: "max-content",
                    maxHeight: 132,
                    zIndex: 80,
                    backdropFilter: "blur(16px)",
                  }}
                >
                  <div
                    className="model-selector-scroll"
                    style={{
                      maxHeight: 132,
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      scrollbarWidth: "thin",
                      scrollbarColor: `${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"} transparent`,
                    }}
                    onWheel={e => e.stopPropagation()}
                  >
                    {IMAGE_AI_MODEL_OPTIONS.map(item => {
                      const active = selectedModel.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="flex h-9 w-full items-center justify-between px-3 text-left type-caption transition-colors"
                          style={{ color: text, background: active ? "oklch(0.64 0.22 285 / 0.12)" : "transparent" }}
                          onMouseEnter={e => (e.currentTarget.style.background = active ? "oklch(0.64 0.22 285 / 0.12)" : hoverBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = active ? "oklch(0.64 0.22 285 / 0.12)" : "transparent")}
                          onClick={() => {
                            setModel(item.id);
                            setModelOpen(false);
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="h-4 w-4 rounded-[var(--radius-pill)] shrink-0" style={{ background: item.color }} />
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span className="truncate type-caption" style={{ color: text, textTransform: "none", letterSpacing: "0.02em" }}>{item.label}</span>
                              {"description" in item && item.description ? (
                                <span className="truncate" style={{ color: sub, fontSize: 10, letterSpacing: 0 }}>{item.description}</span>
                              ) : null}
                            </span>
                          </span>
                          {active && <Check size={13} style={{ color: accent, flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1.5 type-caption" style={{ color: sub }}>画幅</p>
            <div className="grid grid-cols-4 gap-1.5">
              {ratios.map(item => (
                <button key={item} type="button" style={controlButtonStyle(ratio === item)} className="active:scale-95" onClick={() => setRatio(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-[var(--radius-lg-design)] px-3 py-2" style={{ background: fieldBg, border: `1px solid ${border}` }}>
          <div className="flex items-center gap-2" style={{ color: text }}>
            <ImageIcon size={14} />
            <div>
              <p className="type-caption">参考当前画布</p>
              <p className="type-caption" style={{ color: sub, fontSize: 11 }}>把选中对象和画布语境加入生成</p>
            </div>
          </div>
          <button
            type="button"
            className="relative h-6 w-11 rounded-[var(--radius-pill)] transition-colors"
            style={{ background: referencesEnabled ? accent : hoverBg }}
            onClick={() => setReferencesEnabled(v => !v)}
            aria-label="参考当前画布"
          >
            <span style={{ position: "absolute", top: 3, left: referencesEnabled ? 23 : 3, width: 18, height: 18, borderRadius: "var(--radius-md-design)", background: "white", transition: "left 0.16s ease", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="type-caption" style={{ color: sub }}>数量</span>
            <div className="flex items-center gap-1 rounded-[var(--radius-md-design)] p-1" style={{ background: fieldBg, border: `1px solid ${border}` }}>
              {counts.map(item => (
                <button key={item} type="button" style={controlButtonStyle(count === item)} className="h-7 min-w-8 active:scale-95" onClick={() => setCount(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={!canGenerate}
            className="flex h-10 items-center gap-2 rounded-[var(--radius-lg-design)] px-4 transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed"
            style={{
              background: canGenerate ? "#C5ED47" : hoverBg,
              color: canGenerate ? "#000" : sub,
              boxShadow: canGenerate ? "0 12px 30px rgba(197,237,71,0.24)" : "none",
            }}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <img
                src={generationMark}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="h-4 w-4 object-contain"
                style={{ filter: "brightness(0)" }}
              />
            )}
            <span className="type-caption">{isGenerating ? "生成中" : "生成图像"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type FontDesignPurpose = "Logo 字" | "海报标题" | "品牌标题" | "社媒封面" | "电商主标题" | "活动主视觉";
type FontDesignStyle = "高级极简" | "潮流酸性" | "国潮书法" | "科技未来" | "可爱软萌" | "奢华杂志" | "街头涂鸦" | "二次元标题" | "复古港风" | "欧美海报";

const FONT_DESIGN_PURPOSES: FontDesignPurpose[] = ["Logo 字", "海报标题", "品牌标题", "社媒封面", "电商主标题", "活动主视觉"];
const FONT_DESIGN_STYLES: FontDesignStyle[] = ["高级极简", "潮流酸性", "国潮书法", "科技未来", "可爱软萌", "奢华杂志", "街头涂鸦", "二次元标题", "复古港风", "欧美海报"];
const FONT_DESIGN_RATIOS = ["1:1", "4:5", "16:9", "9:16"];
const FONT_DESIGN_COUNTS = [1, 2, 3, 4];

const FONT_DESIGN_STYLE_PREVIEWS: Record<FontDesignStyle, { image: string; sample: string; description: string }> = {
  "高级极简": {
    image: new URL("../../../../inspiration-images/prompt-02.jpg", import.meta.url).href,
    sample: "MONO",
    description: "干净留白、现代字重、低噪声排版",
  },
  "潮流酸性": {
    image: new URL("../../../../inspiration-images/prompt-43.jpg", import.meta.url).href,
    sample: "ACID",
    description: "高饱和撞色、弯曲字体、潮流海报感",
  },
  "国潮书法": {
    image: new URL("../../../../inspiration-images/prompt-11.jpg", import.meta.url).href,
    sample: "山海",
    description: "书法笔势、金红氛围、东方品牌感",
  },
  "科技未来": {
    image: new URL("../../../../inspiration-images/prompt-24.jpg", import.meta.url).href,
    sample: "FUTURE",
    description: "冷光线框、锐利结构、数字科技气质",
  },
  "可爱软萌": {
    image: new URL("../../../../inspiration-images/prompt-48.jpg", import.meta.url).href,
    sample: "POP",
    description: "柔和色块、圆润字形、轻松亲和",
  },
  "奢华杂志": {
    image: new URL("../../../../inspiration-images/prompt-13.jpg", import.meta.url).href,
    sample: "VOGUE",
    description: "高级摄影、强对比标题、封面层级",
  },
  "街头涂鸦": {
    image: new URL("../../../../inspiration-images/prompt-45.jpg", import.meta.url).href,
    sample: "STREET",
    description: "街头图形、粗体字、贴纸拼贴感",
  },
  "二次元标题": {
    image: new URL("../../../../inspiration-images/prompt-33.jpg", import.meta.url).href,
    sample: "ANIME",
    description: "鲜亮渐变、动感边线、标题冲击力",
  },
  "复古港风": {
    image: new URL("../../../../inspiration-images/prompt-31.jpg", import.meta.url).href,
    sample: "RETRO",
    description: "暖色胶片、复古招牌、怀旧商业感",
  },
  "欧美海报": {
    image: new URL("../../../../inspiration-images/prompt-10.jpg", import.meta.url).href,
    sample: "POSTER",
    description: "编辑大片、粗体标题、国际海报版式",
  },
};

function detectFontDesignLanguage(text: string) {
  const hasChinese = /[\u3400-\u9fff]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasChinese && hasLatin) return "中英混排";
  if (hasChinese) return "中文";
  if (hasLatin) return "英文";
  return "通用文字";
}

function buildFontDesignPrompt(input: {
  text: string;
  purpose: FontDesignPurpose;
  style: FontDesignStyle;
  extraPrompt: string;
  transparentBackground: boolean;
}) {
  const language = detectFontDesignLanguage(input.text);
  return [
    "Create a polished typographic design image for ArtX canvas.",
    `Exact text to render: ${input.text}`,
    `Language mode: ${language}.`,
    `Use case: ${input.purpose}.`,
    `Visual style: ${input.style}.`,
    input.extraPrompt.trim() ? `Additional user direction: ${input.extraPrompt.trim()}` : "",
    "Critical text rules:",
    "- The rendered text must exactly match the user's text. Do not replace, translate, summarize, misspell, or add extra characters.",
    "- Chinese characters must be complete, legible, and not distorted into meaningless glyphs.",
    "- English letters must keep accurate spelling, spacing, and capitalization.",
    "- For mixed Chinese and English, make both scripts feel unified in rhythm, weight, layout, and visual hierarchy.",
    "Design rules:",
    "- Make it feel like intentional font design, not plain typed text.",
    "- Use strong composition, balanced negative space, title hierarchy, subtle decorative details, and professional layout rhythm.",
    "- Keep the main text clear enough for users to read at a glance.",
    input.transparentBackground
      ? "Output on a clean transparent or visually isolated background suitable for compositing; avoid busy backgrounds."
      : "Use a tasteful background treatment that supports the typography without overpowering readability.",
  ].filter(Boolean).join("\n");
}

function FontDesignDialog({ isDark, projectId, onClose }: { isDark: boolean; projectId: string; onClose: () => void }) {
  const [textValue, setTextValue] = useState("");
  const [purpose, setPurpose] = useState<FontDesignPurpose>("海报标题");
  const [stylePreset, setStylePreset] = useState<FontDesignStyle>("高级极简");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(2);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const bg = isDark ? "rgba(18,18,28,0.98)" : "rgba(255,255,255,0.98)";
  const panelBg = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.035)";
  const raisedBg = isDark ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.78)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.90)" : "rgba(22,22,34,0.90)";
  const sub = isDark ? "rgba(255,255,255,0.50)" : "rgba(22,22,34,0.52)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const accent = "#C5ED47";
  const aiAccent = "oklch(0.64 0.22 285)";
  const activeBorder = "oklch(0.64 0.22 285 / 0.54)";
  const activeStyle = FONT_DESIGN_STYLE_PREVIEWS[stylePreset];
  const canGenerate = textValue.trim().length > 0 && !isGenerating;
  const hasUnsavedInput = textValue.trim().length > 0 || extraPrompt.trim().length > 0;
  const requestClose = useCallback(() => {
    if (isGenerating) return;
    if (hasUnsavedInput && !window.confirm("确认退出字体设计吗？")) return;
    onClose();
  }, [hasUnsavedInput, isGenerating, onClose]);

  const optionButtonStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 32,
    borderRadius: "var(--radius-md-design)",
    border: `1px solid ${active ? activeBorder : border}`,
    background: active ? "oklch(0.64 0.22 285 / 0.15)" : panelBg,
    color: active ? (isDark ? "white" : "oklch(0.38 0.18 285)") : text,
    fontSize: 12,
    transition: "background 0.16s ease, border-color 0.16s ease, transform 0.16s ease, opacity 0.16s ease",
  });

  const handleGenerate = async () => {
    if (!textValue.trim()) {
      toast("请输入要设计的文字");
      return;
    }
    if (!requestAiAuth()) {
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
    setIsGenerating(true);
    const cleanText = textValue.trim();
    const generationId = `font-design-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const prompt = buildFontDesignPrompt({
      text: cleanText,
      purpose,
      style: stylePreset,
      extraPrompt,
      transparentBackground,
    });
    const size = getImageDisplaySizeForRatio(ratio);
    const payload: ImageGeneratorPayload = {
      projectId,
      prompt,
      model: "gpt-image-2",
      ratio,
      count,
      style: `字体设计 · ${stylePreset}`,
      referencesEnabled: false,
      generationId,
      displaySize: size,
      titleBase: `字体设计 · ${cleanText.slice(0, 12)}`,
    };
    dispatchImageGenerationTask({ ...payload, status: "pending" }, projectId);
    window.dispatchEvent(new CustomEvent("canvas-assistant-external-message", {
      detail: {
        content: [
          `字体设计请求：${cleanText}`,
          `用途：${purpose}`,
          `风格：${stylePreset}`,
          `画幅：${ratio}，数量：${count}`,
          transparentBackground ? "背景：透明底/便于合成" : "",
          extraPrompt.trim() ? `补充：${extraPrompt.trim()}` : "",
        ].filter(Boolean).join("\n"),
      },
    }));
    try {
      const result = await generateAiImages(payload);
      dispatchImageGenerationTask({ ...payload, status: "completed", images: result.images }, projectId);
      setIsGenerating(false);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      dispatchImageGenerationTask({ ...payload, status: "failed", error: message }, projectId);
      toast("字体设计生成失败", { description: message });
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 flex justify-center"
      style={{ zIndex: 20000, pointerEvents: "none", top: 88, padding: "0 28px" }}
    >
      <div
        className="flex max-h-[calc(100dvh-112px)] w-[min(1120px,calc(100vw-56px))] flex-col overflow-hidden rounded-[var(--radius-xl-design)] shadow-2xl"
        style={{
          pointerEvents: "auto",
          background: bg,
          border: `1px solid ${border}`,
          backdropFilter: "blur(26px)",
          boxShadow: "0 30px 100px rgba(0,0,0,0.46)",
        }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg-design)]" style={{ color: aiAccent, background: "oklch(0.64 0.22 285 / 0.14)" }}>
              <FontDesignIcon size={18} cutoutBg={bg} />
            </span>
            <div>
              <p className="type-caption" style={{ color: text, fontSize: 14, fontWeight: 750 }}>字体设计</p>
              <p className="mt-1 type-caption" style={{ color: sub, fontSize: 11 }}>输入中英文文字，选择用途与风格，生成可继续编辑的设计字图</p>
            </div>
          </div>
          <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md-design)] hover:opacity-75" style={{ color: sub }} onClick={requestClose} aria-label="关闭字体设计">
            <X size={15} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden p-4 lg:grid-cols-[315px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <div className="overflow-hidden rounded-[var(--radius-lg-design)]" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <div className="relative h-28 overflow-hidden">
                <img src={activeStyle.image} alt={`${stylePreset} 预览`} className="h-full w-full object-cover" draggable={false} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.70))" }} />
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="type-caption" style={{ color: "white", fontSize: 24, fontWeight: 900, letterSpacing: 0, textShadow: "0 8px 24px rgba(0,0,0,0.55)" }}>
                    {textValue.trim() || activeStyle.sample}
                  </div>
                  <div className="mt-1 type-caption" style={{ color: "rgba(255,255,255,0.68)" }}>{stylePreset} · {activeStyle.description}</div>
                </div>
              </div>
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="type-caption" style={{ color: sub }}>设计文字</p>
                  <span className="type-caption" style={{ color: sub }}>{detectFontDesignLanguage(textValue || "文字")} · {textValue.trim().length}/80</span>
                </div>
                <textarea
                  value={textValue}
                  onChange={event => setTextValue(event.target.value)}
                  rows={2}
                  maxLength={80}
                  className="w-full resize-none rounded-[var(--radius-md-design)] bg-transparent p-3 outline-none"
                  style={{ color: text, background: raisedBg, border: `1px solid ${border}`, fontSize: 21, lineHeight: 1.3, fontWeight: 800, letterSpacing: 0 }}
                  placeholder="山海计划 / FUTURE LAB / 星河 Studio"
                  autoFocus
                />
              </div>
            </div>

            <div className="rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <p className="mb-2 type-caption" style={{ color: sub }}>用途</p>
              <div className="grid grid-cols-2 gap-2">
                {FONT_DESIGN_PURPOSES.map(item => (
                  <button key={item} type="button" className="active:scale-95" style={optionButtonStyle(purpose === item)} onClick={() => setPurpose(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_0.9fr] gap-3">
              <div className="rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}` }}>
                <p className="mb-2 type-caption" style={{ color: sub }}>画幅</p>
                <div className="grid grid-cols-2 gap-2">
                  {FONT_DESIGN_RATIOS.map(item => (
                    <button key={item} type="button" className="active:scale-95" style={optionButtonStyle(ratio === item)} onClick={() => setRatio(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}` }}>
                <p className="mb-2 type-caption" style={{ color: sub }}>数量</p>
                <div className="grid grid-cols-2 gap-2">
                  {FONT_DESIGN_COUNTS.map(item => (
                    <button key={item} type="button" className="active:scale-95" style={optionButtonStyle(count === item)} onClick={() => setCount(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="type-caption" style={{ color: text, fontWeight: 750 }}>风格模板</p>
                  <p className="mt-1 type-caption" style={{ color: sub, fontSize: 11 }}>每张预览展示对应风格的大致视觉方向</p>
                </div>
                <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ color: aiAccent, background: "oklch(0.64 0.22 285 / 0.12)", border: `1px solid ${activeBorder}` }}>{stylePreset}</span>
              </div>
              <div className="grid max-h-[420px] grid-cols-[repeat(auto-fit,minmax(156px,1fr))] gap-2 overflow-y-auto overflow-x-hidden pr-1">
                {FONT_DESIGN_STYLES.map(item => {
                  const active = stylePreset === item;
                  const preview = FONT_DESIGN_STYLE_PREVIEWS[item];
                  return (
                    <button
                      key={item}
                      type="button"
                      className="group overflow-hidden rounded-[var(--radius-lg-design)] text-left transition-transform hover:scale-[1.01] active:scale-95"
                      style={{ background: active ? "oklch(0.64 0.22 285 / 0.14)" : raisedBg, border: `1px solid ${active ? activeBorder : border}`, color: text }}
                      onClick={() => setStylePreset(item)}
                    >
                      <span className="relative block h-20 overflow-hidden">
                        <img src={preview.image} alt={`${item} 风格预览`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" draggable={false} />
                        <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.58))" }} />
                        <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                          <span className="min-w-0 type-caption" style={{ color: "white", fontWeight: 850, letterSpacing: 0 }}>{preview.sample}</span>
                          {active && <Check size={14} style={{ color: accent, flexShrink: 0, filter: "drop-shadow(0 0 8px rgba(197,237,71,0.45))" }} />}
                        </span>
                      </span>
                      <span className="block p-2">
                        <span className="block type-caption" style={{ color: text, fontWeight: 750, whiteSpace: "normal" }}>{item}</span>
                        <span className="mt-0.5 block type-caption" style={{ color: sub, fontSize: 10, lineHeight: 1.35, whiteSpace: "normal" }}>{preview.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="type-caption" style={{ color: sub }}>补充提示词</p>
                <span className="type-caption" style={{ color: sub }}>{extraPrompt.trim().length}/260</span>
              </div>
              <textarea
                value={extraPrompt}
                onChange={event => setExtraPrompt(event.target.value)}
                rows={3}
                maxLength={260}
                className="w-full resize-none rounded-[var(--radius-md-design)] bg-transparent p-3 outline-none"
                style={{ background: raisedBg, border: `1px solid ${border}`, color: text, fontSize: 13, lineHeight: 1.6 }}
                placeholder="描述行业、颜色、情绪、材质或排版方向，例如：黑金配色，适合高端香氛品牌，文字要有杂志封面感..."
              />
            </div>

            <div className="flex items-center justify-between rounded-[var(--radius-lg-design)] px-3 py-2.5" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <div>
                <p className="type-caption" style={{ color: text, fontWeight: 750 }}>透明底</p>
                <p className="type-caption" style={{ color: sub, fontSize: 11 }}>适合叠加到海报、产品图和品牌视觉中</p>
              </div>
              <button
                type="button"
                className="relative h-6 w-11 rounded-[var(--radius-pill)] transition-colors"
                style={{ background: transparentBackground ? accent : hoverBg }}
                onClick={() => setTransparentBackground(value => !value)}
                aria-label="透明底"
              >
                <span style={{ position: "absolute", top: 3, left: transparentBackground ? 23 : 3, width: 18, height: 18, borderRadius: "var(--radius-md-design)", background: "white", transition: "left 0.16s ease", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: `1px solid ${border}` }}>
          <p className="type-caption" style={{ color: sub }}>生成后会在画布中创建新的图片节点，并在右侧对话区保留记录。</p>
          <button
            type="button"
            disabled={!canGenerate}
            className="flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md-design)] px-5 transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed"
            style={{
              minWidth: 148,
              background: canGenerate ? accent : hoverBg,
              color: canGenerate ? "#000" : sub,
              boxShadow: canGenerate ? "0 14px 34px rgba(197,237,71,0.30)" : "none",
              cursor: canGenerate ? "pointer" : "not-allowed",
              opacity: canGenerate ? 1 : 0.56,
              fontWeight: 750,
            }}
            onMouseEnter={event => {
              if (!canGenerate) return;
              event.currentTarget.style.background = "#D6FF59";
              event.currentTarget.style.boxShadow = "0 18px 42px rgba(197,237,71,0.38)";
            }}
            onMouseLeave={event => {
              event.currentTarget.style.background = canGenerate ? accent : hoverBg;
              event.currentTarget.style.boxShadow = canGenerate ? "0 14px 34px rgba(197,237,71,0.30)" : "none";
            }}
            onClick={handleGenerate}
          >
            {isGenerating ? <RefreshCw size={15} className="animate-spin" /> : <FontDesignIcon size={15} cutoutBg={accent} />}
            <span className="type-caption">{isGenerating ? "生成中" : "生成字体设计"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type ProductBackgroundDialogDetail = {
  imageSrc: string;
  fileName?: string;
  prompt: string;
  style: string;
  ratio: string;
  resolution: "2k" | "4k";
  customWidth?: number;
  customHeight?: number;
};

function ProductBackgroundDialog({ isDark, canvasRightInset, onClose }: { isDark: boolean; canvasRightInset: number; onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [imageSrc, setImageSrc] = useState("");
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("商务科技感");
  const [ratio, setRatio] = useState("1:1");
  const [resolution, setResolution] = useState<"2k" | "4k">("2k");
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const bg = isDark ? "rgba(18,18,28,0.98)" : "rgba(255,255,255,0.98)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(22,22,34,0.88)";
  const sub = isDark ? "rgba(255,255,255,0.48)" : "rgba(22,22,34,0.50)";
  const fieldBg = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.035)";
  const activeBorder = "rgba(197,237,71,0.55)";
  const accent = "#C5ED47";
  const ratios = ["1:1", "4:5", "5:4", "3:4", "4:3", "16:9", "9:16", "21:9"];
  const styles = [
    { name: "商务科技感", image: new URL("../../assets/smart-background/business-tech.jpg", import.meta.url).href, prompt: "clean premium technology showroom, cool lighting, glass and metal platform" },
    { name: "中国风", image: new URL("../../assets/smart-background/chinese-style.jpg", import.meta.url).href, prompt: "modern Chinese style, warm red and gold, subtle silk texture, elegant product stage" },
    { name: "欧美潮流", image: new URL("../../assets/smart-background/western-fashion.jpg", import.meta.url).href, prompt: "bold western fashion campaign, urban studio lighting, editorial composition" },
    { name: "日韩风", image: new URL("../../assets/smart-background/jk-pastel.jpg", import.meta.url).href, prompt: "soft Japanese Korean commercial background, clean pastel studio, fresh lifestyle mood" },
    { name: "赛博朋克", image: new URL("../../assets/smart-background/cyberpunk.jpg", import.meta.url).href, prompt: "cyberpunk neon commercial set, futuristic light strips, glossy reflective floor" },
    { name: "可爱呆萌系", image: new URL("../../assets/smart-background/cute-toy.jpg", import.meta.url).href, prompt: "cute playful commercial scene, rounded props, soft colorful lighting" },
    { name: "二次元系", image: new URL("../../assets/smart-background/anime-style.jpg", import.meta.url).href, prompt: "anime inspired product background, vibrant clean illustration style, dynamic lighting" },
  ];

  const clampPanelPosition = useCallback((left: number, top: number) => {
    if (typeof window === "undefined") return { left, top };
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth || Math.min(820, window.innerWidth - 56);
    const panelHeight = panel?.offsetHeight || Math.min(620, window.innerHeight - 112);
    const minLeft = 16;
    const maxLeft = Math.max(minLeft, window.innerWidth - panelWidth - 16);
    const minTop = 16;
    const maxTop = Math.max(minTop, window.innerHeight - panelHeight - 16);
    return {
      left: Math.min(Math.max(left, minLeft), maxLeft),
      top: Math.min(Math.max(top, minTop), maxTop),
    };
  }, []);

  const getDefaultPanelPosition = useCallback(() => {
    if (typeof window === "undefined") return { left: 28, top: 88 };
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth || Math.min(820, window.innerWidth - 56);
    const panelHeight = panel?.offsetHeight || Math.min(620, window.innerHeight - 112);
    const canvasWidth = Math.max(320, window.innerWidth - canvasRightInset);
    return clampPanelPosition(
      Math.round((canvasWidth - panelWidth) / 2),
      Math.round((window.innerHeight - panelHeight) / 2),
    );
  }, [canvasRightInset, clampPanelPosition]);

  useEffect(() => {
    const nextFrame = window.requestAnimationFrame(() => setPanelPosition(getDefaultPanelPosition()));
    return () => window.cancelAnimationFrame(nextFrame);
  }, [getDefaultPanelPosition]);

  useEffect(() => {
    const handleResize = () => {
      setPanelPosition(current => {
        if (!current) return getDefaultPanelPosition();
        return clampPanelPosition(current.left, current.top);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPanelPosition, getDefaultPanelPosition]);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,textarea,[data-no-panel-drag='true']")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPanelPosition(clampPanelPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY));
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const readFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = event => {
      const nextSrc = event.target?.result;
      if (typeof nextSrc !== "string") return;
      setImageSrc(nextSrc);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const stopFileDragEvent = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCreate = () => {
    if (!imageSrc) {
      toast("请先添加产品图");
      return;
    }
    const width = Number(customWidth);
    const height = Number(customHeight);
    const hasOnlyOneCustomSide = Boolean(customWidth) !== Boolean(customHeight);
    if (hasOnlyOneCustomSide) {
      toast("请同时填写自定义宽高");
      return;
    }
    const stylePrompt = styles.find(item => item.name === selectedStyle)?.prompt || "";
    const detail: ProductBackgroundDialogDetail = {
      imageSrc,
      fileName,
      prompt: [stylePrompt, prompt.trim()].filter(Boolean).join("\n"),
      style: selectedStyle,
      ratio,
      resolution,
      customWidth: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
      customHeight: Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
    };
    window.dispatchEvent(new CustomEvent<ProductBackgroundDialogDetail>("product-background-create", { detail }));
    onClose();
  };

  const dialog = (
    <div
      className="fixed inset-0"
      style={{ zIndex: 3500, pointerEvents: "none" }}
    >
      <div
        ref={panelRef}
        className="fixed flex max-h-[calc(100dvh-32px)] w-[min(820px,calc(100vw-56px))] flex-col overflow-hidden rounded-[var(--radius-xl-design)] shadow-2xl"
        style={{
          pointerEvents: "auto",
          left: panelPosition?.left ?? 28,
          top: panelPosition?.top ?? 88,
          background: bg,
          border: `1px solid ${border}`,
          backdropFilter: "blur(24px)",
          boxShadow: "0 30px 100px rgba(0,0,0,0.44)",
        }}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
        onDragEnter={stopFileDragEvent}
        onDragOver={stopFileDragEvent}
        onDragLeave={event => event.stopPropagation()}
        onDrop={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          className="flex cursor-grab touch-none items-start justify-between gap-4 px-5 py-4 active:cursor-grabbing"
          style={{ borderBottom: `1px solid ${border}` }}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg-design)]" style={{ color: accent, background: "rgba(197,237,71,0.14)" }}>
              <AiDecoratedIcon size={17} cutoutBg={bg}>
                <GalleryVerticalEnd size={17} />
              </AiDecoratedIcon>
            </span>
            <div>
              <p className="type-caption" style={{ color: text, fontSize: 14, fontWeight: 700 }}>智能创建背景</p>
              <p className="mt-1 type-caption leading-5" style={{ color: sub }}>
                上传产品图，输入或选择商业背景风格，生成新的产品商业化背景图。
              </p>
            </div>
          </div>
          <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md-design)] hover:opacity-75" style={{ color: sub }} onClick={onClose} aria-label="关闭智能创建背景">
            <X size={15} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden px-4 pb-2.5 pt-4 lg:grid-cols-[200px_minmax(0,1fr)_236px]">
          <button
            type="button"
            className="relative flex min-h-[200px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[var(--radius-lg-design)] px-4 text-center transition-transform hover:scale-[1.01] lg:min-h-[244px]"
            style={{ background: fieldBg, border: `1.5px dashed ${imageSrc ? activeBorder : border}`, color: text }}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={stopFileDragEvent}
            onDragOver={stopFileDragEvent}
            onDrop={event => {
              event.preventDefault();
              event.stopPropagation();
              const file = event.dataTransfer.files?.[0];
              if (file) readFile(file);
            }}
          >
            {imageSrc ? (
              <>
                <img src={imageSrc} alt={fileName || "产品图"} className="absolute inset-0 h-full w-full object-contain p-4" draggable={false} />
                <span className="absolute bottom-3 left-3 right-3 rounded-[var(--radius-md-design)] px-3 py-2 text-left" style={{ background: isDark ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.84)", border: `1px solid ${border}` }}>
                  <span className="block truncate type-caption" style={{ color: text, fontWeight: 700 }}>{fileName || "产品图"}</span>
                  <span className="block type-caption" style={{ color: sub }}>点击更换或拖入新图片</span>
                </span>
              </>
            ) : (
              <>
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg-design)]" style={{ background: "rgba(197,237,71,0.14)", color: accent }}>
                  <ImagePlus size={24} />
                </span>
                <span className="type-body-sm" style={{ fontWeight: 700 }}>将产品图拖到这里</span>
                <span className="mt-2 max-w-[220px] type-caption leading-5" style={{ color: sub }}>支持 PNG、JPG、WebP，也可以点击选择本地图片。</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                if (file) readFile(file);
                event.currentTarget.value = "";
              }}
            />
          </button>

          <div className="min-w-0 space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="type-caption" style={{ color: text, fontWeight: 750 }}>商业背景风格</span>
                <span className="type-caption" style={{ color: sub }}>选择一个方向，也可以继续补充关键词</span>
              </div>
              <div className="grid max-h-[232px] grid-cols-[repeat(auto-fit,minmax(136px,1fr))] gap-2 overflow-y-auto overflow-x-hidden pr-1">
                {styles.map(item => {
                  const active = selectedStyle === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      className="group min-w-0 overflow-hidden rounded-[var(--radius-lg-design)] text-left transition-transform hover:scale-[1.01] active:scale-95"
                      style={{ background: active ? "rgba(197,237,71,0.14)" : fieldBg, border: `1px solid ${active ? activeBorder : border}`, color: text }}
                      onClick={() => setSelectedStyle(item.name)}
                    >
                      <span className="relative block h-16 overflow-hidden">
                        <img src={item.image} alt={`${item.name} 背景风格预览`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" draggable={false} />
                        <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.66))" }} />
                        <span className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                          <span className="type-caption" style={{ color: "white", fontWeight: 850 }}>{item.name}</span>
                          {active && <Check size={14} style={{ color: accent, flexShrink: 0, filter: "drop-shadow(0 0 8px rgba(197,237,71,0.45))" }} />}
                        </span>
                      </span>
                      <span className="block p-1.5">
                        <span className="block type-caption" style={{ color: sub, fontSize: 10, lineHeight: 1.35 }}>{item.prompt.split(",")[0]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block type-caption" style={{ color: text, fontWeight: 750 }}>背景关键词</label>
              <textarea
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="例如：高端护肤品展台、冷白光、玻璃质感、商业广告海报背景"
                rows={2}
                className="w-full resize-none rounded-[var(--radius-lg-design)] p-3 outline-none"
                style={{ background: fieldBg, border: `1px solid ${border}`, color: text, fontSize: 13, lineHeight: 1.55 }}
              />
            </div>
          </div>

          <div className="min-w-0 space-y-2.5">
            <div className="rounded-[var(--radius-lg-design)] p-2.5" style={{ background: fieldBg, border: `1px solid ${border}` }}>
              <label className="mb-1.5 block type-caption" style={{ color: text, fontWeight: 750 }}>常用画幅</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ratios.map(item => (
                  <button
                    key={item}
                    type="button"
                    className="h-8 rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-85"
                    style={{ background: ratio === item ? "rgba(197,237,71,0.14)" : (isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.72)"), border: `1px solid ${ratio === item ? activeBorder : border}`, color: text }}
                    onClick={() => setRatio(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--radius-lg-design)] p-2.5" style={{ background: fieldBg, border: `1px solid ${border}` }}>
              <label className="mb-1.5 block type-caption" style={{ color: text, fontWeight: 750 }}>分辨率</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["2k", "4k"] as const).map(item => (
                  <button
                    key={item}
                    type="button"
                    className="h-8 rounded-[var(--radius-md-design)] type-caption uppercase transition-opacity hover:opacity-85"
                    style={{ background: resolution === item ? "rgba(197,237,71,0.14)" : (isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.72)"), border: `1px solid ${resolution === item ? activeBorder : border}`, color: text }}
                    onClick={() => setResolution(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--radius-lg-design)] p-2.5" style={{ background: fieldBg, border: `1px solid ${border}` }}>
              <label className="mb-1.5 block type-caption" style={{ color: text, fontWeight: 750 }}>自定义比例/尺寸</label>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                <input
                  value={customWidth}
                  onChange={event => setCustomWidth(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="宽，例如 2048"
                  className="h-8 min-w-0 rounded-[var(--radius-md-design)] px-2.5 outline-none"
                  style={{ background: fieldBg, border: `1px solid ${border}`, color: text, fontSize: 12 }}
                />
                <span className="type-caption" style={{ color: sub }}>×</span>
                <input
                  value={customHeight}
                  onChange={event => setCustomHeight(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="高，例如 3072"
                  className="h-8 min-w-0 rounded-[var(--radius-md-design)] px-2.5 outline-none"
                  style={{ background: fieldBg, border: `1px solid ${border}`, color: text, fontSize: 12 }}
                />
              </div>
            </div>

            <div className="rounded-[var(--radius-lg-design)] p-2.5" style={{ background: fieldBg, border: `1px solid ${border}` }}>
              <p className="type-caption" style={{ color: text, fontWeight: 750 }}>生成方式</p>
              <p className="mt-1 type-caption leading-4" style={{ color: sub }}>
                结果会以新的图片节点生成在画布中，不覆盖原图。自定义宽高为空时使用当前画幅和分辨率。
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-3 px-5 pb-4 pt-0.5">
          <button
            type="button"
            className="h-10 rounded-[var(--radius-md-design)] px-5 type-caption transition-opacity hover:opacity-85"
            style={{ background: fieldBg, border: `1px solid ${border}`, color: text }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-[var(--radius-md-design)] px-6 type-caption transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: accent, color: "#050607", boxShadow: "0 14px 34px rgba(197,237,71,0.34)" }}
            disabled={!imageSrc}
            onClick={handleCreate}
          >
            <WandSparkles size={15} />
            创建背景
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}

// ── Canvas Top Tool Palette ─────────────────────────────────────
function CanvasTopToolPalette({
  isDark,
  projectId,
  canvasRightInset,
  onImageGeneratorOpenChange,
}: {
  isDark: boolean;
  projectId: string;
  canvasRightInset: number;
  onImageGeneratorOpenChange?: (open: boolean) => void;
}) {
  const [active, setActive] = useState("move");
  const [shapeOpen, setShapeOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false); // 铅笔子菜单
  const [imageGeneratorOpen, setImageGeneratorOpen] = useState(false);
  const [productBackgroundOpen, setProductBackgroundOpen] = useState(false);
  const [drawColor, setDrawColor] = useState(isDark ? "#c4b5fd" : "#1a1a2e"); // 铅笔颜色
  const [drawWidth, setDrawWidth] = useState(2); // 铅笔粗细 px
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 点击画布空白处时关闭子菜单
  useEffect(() => {
    const handler = () => { setShapeOpen(false); setDrawOpen(false); setImageGeneratorOpen(false); setProductBackgroundOpen(false); };
    window.addEventListener("pane-click", handler);
    return () => window.removeEventListener("pane-click", handler);
  }, []);

  useEffect(() => {
    onImageGeneratorOpenChange?.(imageGeneratorOpen);
  }, [imageGeneratorOpen, onImageGeneratorOpenChange]);

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
  const toolbarDividerColor = isDark ? "rgba(255,255,255,0.28)" : "rgba(28,28,40,0.22)";

  // 工具列表
  const tools = [
    { id: "image-ai",     label: "智能生图",   icon: <Sparkles size={17} /> },
    { id: "annotate",     label: "智能注释",   icon: <AiAnnotationIcon size={17} cutoutBg={bg} /> },
    { id: "product-bg",   label: "智能创建背景", icon: <GalleryVerticalEnd size={17} /> },
    { id: "move",         label: "移动",       icon: <MousePointer2 size={17} /> },
    { id: "upload",       label: "上传图片",   icon: <ImagePlus size={17} /> },
    { id: "smart-canvas", label: "创建画板",   icon: <CreateCanvasIcon size={17} /> },
    { id: "shape",        label: "几何形",     icon: <Triangle size={17} /> },
    { id: "draw",         label: "铅笔",       icon: <Pencil size={17} /> },
    { id: "text",         label: "文字",       icon: <Type size={17} /> },
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
      setDrawOpen(false);
      setImageGeneratorOpen(false);
      setProductBackgroundOpen(false);
      setActive(id);
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: id } }));
      return;
    }
    if (id === "draw") {
      setDrawOpen(v => !v);
      setShapeOpen(false);
      setImageGeneratorOpen(false);
      setProductBackgroundOpen(false);
      setActive(id);
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: id } }));
      // 广播当前铅笔参数
      window.dispatchEvent(new CustomEvent("draw-params", { detail: { color: drawColor, width: drawWidth } }));
      return;
    }
    if (id === "image-ai") {
      setImageGeneratorOpen(v => !v);
      setShapeOpen(false);
      setDrawOpen(false);
      setProductBackgroundOpen(false);
      setActive(id);
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: id } }));
      return;
    }
    if (id === "product-bg") {
      setProductBackgroundOpen(v => !v);
      setImageGeneratorOpen(false);
      setShapeOpen(false);
      setDrawOpen(false);
      setActive(id);
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      return;
    }
    if (id === "upload") {
      setShapeOpen(false);
      setDrawOpen(false);
      setImageGeneratorOpen(false);
      setProductBackgroundOpen(false);
      setActive("move");
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      window.dispatchEvent(new CustomEvent("workspace-upload-request"));
      return;
    }
    setShapeOpen(false);
    setDrawOpen(false);
    setImageGeneratorOpen(false);
    setProductBackgroundOpen(false);
    setActive(id);
    // 向 InnerCanvas 广播工具模式变化
    window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: id } }));
    if (id === "pen") {
      toast("钢笔工具", { description: "单击添加锚点 · 拖拽创建手柄 · Enter/Esc 完成 · Alt+单击切换直角 · 双击关闭路径" });
    } else {
      toast(
        tools.find(t => t.id === id)?.label ?? "",
        { description: id === "upload" ? "点击选择图片文件" : "工具已切换" }
      );
    }
  };

  return (
    <div
      className="fixed nodrag nopan"
      style={{ top: 68, left: "50%", transform: "translateX(calc(-50% - 84px))", zIndex: 110, width: "max-content", maxWidth: "calc(100vw - 160px)" }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* 铅笔子命令菜单 */}
      {drawOpen && (
        <div
          className="absolute top-full mt-2 rounded-[var(--radius-lg-design)] shadow-2xl"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            backdropFilter: "blur(18px)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: "0 4px",
            height: 40,
            minWidth: 160,
          }}
        >
          {/* 颜色选择圆点 */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "0 8px" }}>
            <input
              type="color"
              value={drawColor}
              onChange={e => {
                setDrawColor(e.target.value);
                window.dispatchEvent(new CustomEvent("draw-params", { detail: { color: e.target.value, width: drawWidth } }));
              }}
              style={{
                position: "absolute", opacity: 0, width: "100%", height: "100%",
                cursor: "pointer", left: 0, top: 0, border: "none", padding: 0,
              }}
            />
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: drawColor,
              boxShadow: `0 0 0 2px ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
              cursor: "pointer",
              flexShrink: 0,
            }} />
          </div>
          {/* 分隔线 */}
          <div style={{ width: 1, height: 20, background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)", flexShrink: 0 }} />
          {/* 粗细图标 + 输入框 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px" }}>
            {/* 粗细图标（三条横线） */}
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none" style={{ flexShrink: 0, opacity: 0.55 }}>
              <line x1="0" y1="2" x2="16" y2="2" stroke={isDark ? "#fff" : "#1a1a2e"} strokeWidth="1.5" strokeLinecap="round" />
              <line x1="0" y1="7" x2="16" y2="7" stroke={isDark ? "#fff" : "#1a1a2e"} strokeWidth="2.5" strokeLinecap="round" />
              <line x1="0" y1="12" x2="16" y2="12" stroke={isDark ? "#fff" : "#1a1a2e"} strokeWidth="4" strokeLinecap="round" />
            </svg>
            <input
              type="number"
              min={1} max={60}
              value={drawWidth}
              onChange={e => {
                const v = Math.max(1, Math.min(60, Number(e.target.value) || 1));
                setDrawWidth(v);
                window.dispatchEvent(new CustomEvent("draw-params", { detail: { color: drawColor, width: v } }));
              }}
              style={{
                width: 36, background: "transparent", border: "none", outline: "none",
                color: isDark ? "rgba(255,255,255,0.75)" : "rgba(28,28,40,0.75)",
                fontSize: 13, fontWeight: 500, textAlign: "center",
                cursor: "text",
              }}
            />
            <span style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)", userSelect: "none" }}>Px</span>
          </div>
        </div>
      )}

      {imageGeneratorOpen && (
        <ImageGeneratorPopover isDark={isDark} projectId={projectId} onClose={() => setImageGeneratorOpen(false)} />
      )}

      {productBackgroundOpen && (
        <ProductBackgroundDialog isDark={isDark} canvasRightInset={canvasRightInset} onClose={() => setProductBackgroundOpen(false)} />
      )}

      {/* 主工具栏 */}
      <div
        className="flex w-max items-center rounded-[var(--radius-lg-design)] px-2 py-1 shadow-lg"
        style={{ background: bg, border: `1px solid ${border}`, backdropFilter: "blur(18px)" }}
      >
        {tools.map(tool => (
          <Fragment key={tool.id}>
            {tool.id === "move" && (
              <div
                aria-hidden="true"
                style={{
                  width: 2,
                  height: 24,
                  borderRadius: 999,
                  background: toolbarDividerColor,
                  margin: "0 6px",
                  flex: "0 0 auto",
                }}
              />
            )}
            <div className="relative">
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
              {tool.id === "shape" && shapeOpen && (
                <div
                  className="absolute left-1/2 top-full mt-2 rounded-[var(--radius-lg-design)] p-2 shadow-2xl"
                  style={{
                    background: popBg,
                    border: `1px solid ${border}`,
                    backdropFilter: "blur(18px)",
                    minWidth: 152,
                    transform: "translateX(-50%)",
                    zIndex: 20,
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
            </div>
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
      className="fixed inset-x-0 flex justify-center"
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


const CANVAS_ASSISTANT_IMAGE_MODEL_STORAGE_KEY = "artx:canvas-assistant-image-model";
const CANVAS_ASSISTANT_TEXT_MODEL_STORAGE_KEY = "artx:canvas-assistant-text-model";
const CANVAS_ASSISTANT_MODEL_TAB_STORAGE_KEY = "artx:canvas-assistant-model-tab";
const CANVAS_ASSISTANT_AUTO_MODE_STORAGE_KEY = "artx:canvas-assistant-auto-mode";
const CANVAS_ASSISTANT_AUTO_DEFAULT_VERSION_KEY = "artx:canvas-assistant-auto-default-version";
const CANVAS_ASSISTANT_AUTO_DEFAULT_VERSION = "2026-06-21-auto-default";
type CanvasAssistantModelTab = "image" | "text";
type AssistantComposerSegment =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; asset: ImageGeneratorReferenceAsset }
  | { id: string; type: "annotation"; annotation: AnnotationReference };

type CanvasAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  referenceOptions?: Array<ReferenceImageResult & { selected?: boolean }>;
  referenceSearchQuery?: string;
  followUpPrompt?: string;
  imageBackup?: {
    nodeId: string;
    generationId: string;
    generationIndex: number;
    src: string;
    width: number;
    height: number;
    title: string;
    prompt: string;
    model: string;
    ratio: string;
    style: string;
  };
};

function formatCanvasMessageTime(value: Date) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(" ");
}

const CANVAS_ASSISTANT_MESSAGES_STORAGE_PREFIX = "artx:canvas-assistant-messages:";
const CANVAS_ASSISTANT_MESSAGES_SESSION_PREFIX = "artx:canvas-assistant-messages:fallback:";

function canvasAssistantMessagesStorageKey(projectId: string) {
  return `${CANVAS_ASSISTANT_MESSAGES_STORAGE_PREFIX}${projectId || "p1"}`;
}

function canvasAssistantMessagesSessionKey(projectId: string) {
  return `${CANVAS_ASSISTANT_MESSAGES_SESSION_PREFIX}${projectId || "p1"}`;
}

function serializeCanvasAssistantMessages(messages: CanvasAssistantMessage[]) {
  return messages.map(message => ({
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date(message.timestamp).toISOString(),
  }));
}

function deserializeCanvasAssistantMessages(raw: string | null): CanvasAssistantMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item.id === "string" && typeof item.role === "string" && typeof item.content === "string" && typeof item.timestamp === "string")
      .map(item => ({
        ...item,
        timestamp: new Date(item.timestamp),
      })) as CanvasAssistantMessage[];
  } catch {
    return [];
  }
}

function createAssistantTextSegment(text = ""): AssistantComposerSegment {
  return { id: `seg-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: "text", text };
}

function isAssistantTokenSegment(segment: AssistantComposerSegment) {
  return segment.type === "image" || segment.type === "annotation";
}

function createAssistantImageSegment(asset: ImageGeneratorReferenceAsset): AssistantComposerSegment {
  return { id: `seg-image-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: "image", asset };
}

function createAssistantAnnotationSegment(annotation: AnnotationReference): AssistantComposerSegment {
  return { id: `seg-annotation-${annotation.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: "annotation", annotation };
}

function normalizeAssistantComposerSegments(segments: AssistantComposerSegment[]) {
  const normalized: AssistantComposerSegment[] = [];
  segments.forEach(segment => {
    if (segment.type === "text") {
      const previous = normalized[normalized.length - 1];
      if (previous?.type === "text" && (previous.text.length > 0 || segment.text.length > 0)) {
        normalized[normalized.length - 1] = { ...previous, text: previous.text + segment.text };
      } else {
        normalized.push({ ...segment });
      }
      return;
    }
    const previous = normalized[normalized.length - 1];
    if (previous && isAssistantTokenSegment(previous)) {
      normalized.push(createAssistantTextSegment(""));
    }
    normalized.push(segment);
  });
  if (normalized.length === 0 || normalized[normalized.length - 1].type !== "text") {
    normalized.push(createAssistantTextSegment(""));
  }
  return normalized;
}

function getAssistantComposerText(segments: AssistantComposerSegment[]) {
  return segments
    .map(segment => {
      if (segment.type === "text") return segment.text;
      if (segment.type === "image") return `引用图：${segment.asset.title}`;
      return `注释：${segment.annotation.text || segment.annotation.title}`;
    })
    .join("")
    .trim();
}

function getAssistantComposerPrompt(segments: AssistantComposerSegment[]) {
  let imageIndex = 0;
  let annotationIndex = 0;
  return segments
    .map(segment => {
      if (segment.type === "text") return segment.text.trim();
      if (segment.type === "image") {
        imageIndex += 1;
        return `引用图 ${imageIndex}：${segment.asset.title}`;
      }
      annotationIndex += 1;
      return `注释 ${annotationIndex}：来自「${segment.annotation.title}」，位置 x=${segment.annotation.x.toFixed(1)}%、y=${segment.annotation.y.toFixed(1)}%，描述：${segment.annotation.text || "未填写"}`;
    })
    .filter(Boolean)
    .join("\n");
}

function getAssistantComposerImages(segments: AssistantComposerSegment[]) {
  const seen = new Set<string>();
  return segments
    .filter((segment): segment is Extract<AssistantComposerSegment, { type: "image" }> => segment.type === "image")
    .filter(segment => {
      if (seen.has(segment.asset.id)) return false;
      seen.add(segment.asset.id);
      return true;
    })
    .map(segment => segment.asset);
}

function getAssistantComposerAnnotations(segments: AssistantComposerSegment[]) {
  const seen = new Set<string>();
  return segments
    .filter((segment): segment is Extract<AssistantComposerSegment, { type: "annotation" }> => segment.type === "annotation")
    .filter(segment => {
      if (seen.has(segment.annotation.id)) return false;
      seen.add(segment.annotation.id);
      return true;
    })
    .map(segment => segment.annotation);
}

function getAssistantComposerVisualReferences(segments: AssistantComposerSegment[]) {
  const seenImages = new Set<string>();
  const seenAnnotations = new Set<string>();
  let annotationIndex = 0;
  return segments.flatMap(segment => {
    if (segment.type === "image") {
      if (seenImages.has(segment.asset.id)) return [];
      seenImages.add(segment.asset.id);
      return [{ ...segment.asset }];
    }
    if (segment.type === "annotation") {
      if (seenAnnotations.has(segment.annotation.id)) return [];
      seenAnnotations.add(segment.annotation.id);
      annotationIndex += 1;
      return [{
        id: segment.annotation.id,
        src: segment.annotation.src,
        title: `注释 ${annotationIndex} · ${segment.annotation.title}`,
      }];
    }
    return [];
  });
}

function CanvasAssistantPanel({
  projectId,
  isDark,
  collapsed,
  panelWidth,
  onPanelResize,
  activeSkill,
  onActiveSkillChange,
  isAuthenticated,
  onToggleCollapsed,
  onLoginRequest,
  referencedAssets,
  annotationReferences,
  onRemoveReference,
  onRemoveAnnotationReference,
  onMergeReferences,
  selectedCount,
  helpPromptNonce,
}: {
  projectId: string;
  isDark: boolean;
  collapsed: boolean;
  panelWidth: number;
  onPanelResize: (width: number) => void;
  activeSkill: PendingSkillLoad | null;
  onActiveSkillChange: (skill: PendingSkillLoad | null) => void;
  isAuthenticated: boolean;
  onToggleCollapsed: () => void;
  onLoginRequest: () => void;
  referencedAssets: ImageGeneratorReferenceAsset[];
  annotationReferences: AnnotationReference[];
  onRemoveReference: (id: string) => void;
  onRemoveAnnotationReference: (id: string) => void;
  onMergeReferences: (assets: ImageGeneratorReferenceAsset[]) => void;
  selectedCount: number;
  helpPromptNonce: number;
}) {
  const [, navigate] = useLocation();
  const [inputFocused, setInputFocused] = useState(false);
  const [composerSegments, setComposerSegments] = useState<AssistantComposerSegment[]>(() => [createAssistantTextSegment("")]);
  const [draggingComposerSegmentId, setDraggingComposerSegmentId] = useState<string | null>(null);
  const [dragOverComposerSegmentId, setDragOverComposerSegmentId] = useState<string | null>(null);
  const composerInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const composerMeasureRef = useRef<HTMLSpanElement>(null);
  const [composerTextWidths, setComposerTextWidths] = useState<Record<string, number>>({});
  const activeComposerSegmentIdRef = useRef<string | null>(null);
  const activeComposerCursorRef = useRef(0);
  const syncedReferenceIdsRef = useRef<Set<string>>(new Set());
  const syncedAnnotationIdsRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const assistantModelRef = useRef<HTMLDivElement>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [netSearchEnabled, setNetSearchEnabled] = useState(false);
  const [assistantAutoMode, setAssistantAutoMode] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.localStorage.getItem(CANVAS_ASSISTANT_AUTO_DEFAULT_VERSION_KEY) !== CANVAS_ASSISTANT_AUTO_DEFAULT_VERSION) {
      window.localStorage.setItem(CANVAS_ASSISTANT_AUTO_DEFAULT_VERSION_KEY, CANVAS_ASSISTANT_AUTO_DEFAULT_VERSION);
      window.localStorage.setItem(CANVAS_ASSISTANT_AUTO_MODE_STORAGE_KEY, "1");
      return true;
    }
    return window.localStorage.getItem(CANVAS_ASSISTANT_AUTO_MODE_STORAGE_KEY) !== "0";
  });
  const [assistantModelTab, setAssistantModelTab] = useState<CanvasAssistantModelTab>(() => {
    if (typeof window === "undefined") return "image";
    const stored = window.localStorage.getItem(CANVAS_ASSISTANT_MODEL_TAB_STORAGE_KEY);
    return stored === "text" ? "text" : "image";
  });
  const [assistantImageModelId, setAssistantImageModelId] = useState(() => {
    if (typeof window === "undefined") return "gpt-image-2";
    const stored = window.localStorage.getItem(CANVAS_ASSISTANT_IMAGE_MODEL_STORAGE_KEY) || window.localStorage.getItem("artx:canvas-assistant-model");
    return IMAGE_AI_MODELS.some(model => model.id === stored) ? stored! : "gpt-image-2";
  });
  const [assistantTextModelId, setAssistantTextModelId] = useState(() => {
    if (typeof window === "undefined") return "gpt-5.4-mini";
    const stored = window.localStorage.getItem(CANVAS_ASSISTANT_TEXT_MODEL_STORAGE_KEY);
    return TEXT_AI_MODELS.some(model => model.id === stored) ? stored! : "gpt-5.4-mini";
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<CanvasAssistantMessage[]>(() => {
    const stored = typeof window === "undefined" ? [] : deserializeCanvasAssistantMessages(
      window.sessionStorage.getItem(canvasAssistantMessagesSessionKey(projectId)) ||
      window.localStorage.getItem(canvasAssistantMessagesStorageKey(projectId))
    );
    return stored.length > 0 ? stored : [
      { id: "assistant-seed-1", role: "assistant", content: "你好，下面开始你的创作吧！", timestamp: new Date() },
    ];
  });
  const pendingHomePromptHandledRef = useRef(false);
  const bg = isDark ? "oklch(0.125 0.014 270 / 0.98)" : "oklch(0.995 0.002 80 / 0.98)";
  const border = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 10%)";
  const text = isDark ? "oklch(0.84 0.008 270)" : "oklch(0.18 0.008 270)";
  const sub = isDark ? "oklch(0.56 0.01 270)" : "oklch(0.48 0.012 255)";
  const chipBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)";
  const elevatedBg = isDark ? "oklch(0.17 0.016 270 / 0.98)" : "oklch(1 0 0 / 0.98)";
  const hoverBg = isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 5%)";
  const activeGlow = "0 0 0 3px rgba(197,237,71,0.14), 0 18px 44px rgba(0,0,0,0.24)";
  const inputShadow = "0 16px 42px rgba(210,214,224,0.10), 0 0 0 1px rgba(210,214,224,0.10)";
  const collapsedPeekWidth = 112;
  const [splitterActive, setSplitterActive] = useState(false);
  const [splitterHover, setSplitterHover] = useState(false);
  const handleSplitterPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (collapsed) return;
    event.preventDefault();
    event.stopPropagation();
    setSplitterActive(true);
    const startX = event.clientX;
    const startWidth = panelWidth;
    const getBounds = () => {
      const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
      return {
        min: 280,
        max: Math.max(320, Math.min(560, viewportWidth - 360)),
      };
    };
    const handleMove = (moveEvent: PointerEvent) => {
      const bounds = getBounds();
      const nextWidth = Math.max(bounds.min, Math.min(bounds.max, startWidth + startX - moveEvent.clientX));
      onPanelResize(Math.round(nextWidth));
    };
    const handleUp = () => {
      setSplitterActive(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }, [collapsed, onPanelResize, panelWidth]);
  const handleCreateCanvasProject = () => {
    const project = createWorkspaceHistoryProject();
    toast("已新建画布", { description: project.title });
    navigate(`/project/${project.id}`);
  };

  const actionButtons = [
    { label: "新建画布", icon: <PlusSquare size={16} />, onClick: handleCreateCanvasProject },
    { label: "分享对话", icon: <Share2 size={16} />, onClick: () => toast("分享对话", { description: "分享能力准备中" }) },
    { label: collapsed ? "展开对话框" : "收起对话框", icon: <ChevronLeft size={16} style={{ transform: collapsed ? "none" : "rotate(180deg)", transition: "transform 0.2s ease" }} />, onClick: onToggleCollapsed },
  ];
  const handleUploadClick = () => {
    window.dispatchEvent(new CustomEvent("workspace-upload-request"));
    setCommandMenuOpen(false);
  };
  const handleSelectFromAssets = () => {
    setCommandMenuOpen(false);
    navigate("/workspace");
  };

  const focusComposerSegment = useCallback((segmentId?: string | null) => {
    window.setTimeout(() => {
      const id = segmentId || activeComposerSegmentIdRef.current || composerSegments.find(segment => segment.type === "text")?.id;
      const input = id ? composerInputRefs.current[id] : null;
      input?.focus();
      if (input) {
        const nextPosition = input.value.length;
        input.setSelectionRange(nextPosition, nextPosition);
      }
    }, 60);
  }, [composerSegments]);

  const focusLeadingComposerSegment = useCallback(() => {
    const firstTextSegment = composerSegments.find(segment => segment.type === "text");
    if (!firstTextSegment) {
      focusComposerSegment();
      return;
    }
    activeComposerSegmentIdRef.current = firstTextSegment.id;
    activeComposerCursorRef.current = 0;
    window.setTimeout(() => {
      const input = composerInputRefs.current[firstTextSegment.id];
      input?.focus();
      input?.setSelectionRange(0, 0);
    }, 60);
  }, [composerSegments, focusComposerSegment]);

  const setComposerTextSegment = useCallback((segmentId: string, value: string) => {
    const singleLineValue = value.replace(/\s*\n+\s*/g, " ");
    setComposerSegments(prev => normalizeAssistantComposerSegments(prev.map(segment => (
      segment.id === segmentId && segment.type === "text" ? { ...segment, text: singleLineValue } : segment
    ))));
  }, []);

  useEffect(() => {
    const measure = composerMeasureRef.current;
    if (!measure) return;
    const nextWidths: Record<string, number> = {};
    composerSegments.forEach(segment => {
      if (segment.type !== "text") return;
      if (!segment.text) {
        nextWidths[segment.id] = composerSegments.length === 1 ? 220 : 32;
        return;
      }
      measure.textContent = segment.text;
      nextWidths[segment.id] = Math.min(520, Math.max(32, Math.ceil(measure.scrollWidth) + 18));
    });
    setComposerTextWidths(previous => {
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(nextWidths);
      if (previousKeys.length === nextKeys.length && nextKeys.every(key => previous[key] === nextWidths[key])) return previous;
      return nextWidths;
    });
  }, [composerSegments]);

  const rememberComposerCursor = useCallback((segmentId: string, target: HTMLInputElement) => {
    activeComposerSegmentIdRef.current = segmentId;
    activeComposerCursorRef.current = target.selectionStart ?? target.value.length;
  }, []);

  const removeComposerImageSegment = useCallback((segmentId: string, assetId: string) => {
    setComposerSegments(prev => normalizeAssistantComposerSegments(prev.filter(segment => segment.id !== segmentId)));
    onRemoveReference(assetId);
    syncedReferenceIdsRef.current.delete(assetId);
  }, [onRemoveReference]);

  const removeComposerAnnotationSegment = useCallback((segmentId: string, annotationId: string) => {
    setComposerSegments(prev => normalizeAssistantComposerSegments(prev.filter(segment => segment.id !== segmentId)));
    onRemoveAnnotationReference(annotationId);
    syncedAnnotationIdsRef.current.delete(annotationId);
  }, [onRemoveAnnotationReference]);

  const moveComposerTokenSegment = useCallback((sourceId: string, targetId: string, placement: "before" | "after" = "before") => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setComposerSegments(prev => {
      const source = prev.find(segment => segment.id === sourceId);
      const target = prev.find(segment => segment.id === targetId);
      if (!source || !target || (source.type !== "image" && source.type !== "annotation")) return prev;
      const withoutSource = prev.filter(segment => segment.id !== sourceId);
      const targetIndex = withoutSource.findIndex(segment => segment.id === targetId);
      if (targetIndex < 0) return prev;
      const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
      return normalizeAssistantComposerSegments([
        ...withoutSource.slice(0, insertIndex),
        source,
        ...withoutSource.slice(insertIndex),
      ]);
    });
  }, []);

  const handleComposerTokenDragStart = useCallback((event: React.DragEvent<HTMLElement>, segmentId: string) => {
    setDraggingComposerSegmentId(segmentId);
    setDragOverComposerSegmentId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", segmentId);
  }, []);

  const handleComposerSegmentDragOver = useCallback((event: React.DragEvent<HTMLElement>, segmentId: string) => {
    if (!draggingComposerSegmentId || draggingComposerSegmentId === segmentId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverComposerSegmentId(segmentId);
  }, [draggingComposerSegmentId]);

  const handleComposerSegmentDrop = useCallback((event: React.DragEvent<HTMLElement>, targetId: string, placement: "before" | "after" = "before") => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingComposerSegmentId;
    if (sourceId) moveComposerTokenSegment(sourceId, targetId, placement);
    setDraggingComposerSegmentId(null);
    setDragOverComposerSegmentId(null);
  }, [draggingComposerSegmentId, moveComposerTokenSegment]);

  const handleComposerDragEnd = useCallback(() => {
    setDraggingComposerSegmentId(null);
    setDragOverComposerSegmentId(null);
  }, []);

  const handleComposerTextKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>, segmentId: string) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
      return;
    }
    if (event.key !== "Backspace") return;
    const target = event.currentTarget;
    if (target.selectionStart !== 0 || target.selectionEnd !== 0) return;
    const index = composerSegments.findIndex(segment => segment.id === segmentId);
    const previous = index > 0 ? composerSegments[index - 1] : null;
    if (!previous || (previous.type !== "image" && previous.type !== "annotation")) return;
    event.preventDefault();
    if (previous.type === "image") {
      removeComposerImageSegment(previous.id, previous.asset.id);
    } else {
      removeComposerAnnotationSegment(previous.id, previous.annotation.id);
    }
  }, [composerSegments, removeComposerAnnotationSegment, removeComposerImageSegment]);

  const composerText = getAssistantComposerText(composerSegments);
  const composerPrompt = getAssistantComposerPrompt(composerSegments);
  const composerImages = getAssistantComposerImages(composerSegments);
  const composerAnnotations = getAssistantComposerAnnotations(composerSegments);
  const hasPrompt = composerText.length > 0;
  const hasAnnotationReferences = composerAnnotations.length > 0;
  const totalReferenceCount = composerImages.length + composerAnnotations.length;
  const hasContext = selectedCount > 0 || totalReferenceCount > 0;
  const canSubmit = (hasPrompt || hasContext) && !isSubmitting;
  const contextLabel = selectedCount > 1
    ? `已选中 ${selectedCount} 个对象`
    : selectedCount === 1
      ? "已选中 1 个对象"
      : hasAnnotationReferences
        ? `注释引用 ${composerAnnotations.length} 个`
        : composerImages.length > 0
          ? `引用素材 ${composerImages.length} 个`
          : "";
  const assistantImageModel = IMAGE_AI_MODELS.find(model => model.id === assistantImageModelId) || IMAGE_AI_MODELS[0];
  const assistantTextModel = TEXT_AI_MODELS.find(model => model.id === assistantTextModelId) || TEXT_AI_MODELS[0];
  const assistantModelOptions = assistantModelTab === "image"
    ? IMAGE_AI_MODELS
    : TEXT_AI_MODELS;
  const assistantModel = assistantModelTab === "image" ? assistantImageModel : assistantTextModel;
  const activeSkillContext = activeSkill ? buildSkillPromptContext(activeSkill) : "";

  const handleReferenceSelectionToggle = useCallback((referenceId: string) => {
    setSelectedReferenceIds(prev => (
      prev.includes(referenceId)
        ? prev.filter(id => id !== referenceId)
        : [...prev, referenceId]
    ));
  }, []);

  const handleReferenceSelectionApply = useCallback((message: CanvasAssistantMessage) => {
    const selected = (message.referenceOptions || []).filter(item => selectedReferenceIds.includes(item.id));
    if (selected.length === 0) {
      toast("请先选择参考图");
      return;
    }
    const merged = new Map(referencedAssets.map(item => [item.id, item]));
    selected.forEach(item => merged.set(item.id, { id: item.id, title: item.title, src: item.src }));
    onMergeReferences(Array.from(merged.values()));
    setMessages(prev => [...prev, {
      id: `assistant-followup-${Date.now()}`,
      role: "assistant",
      content: message.followUpPrompt || "我已经记住你选中的参考图了。接下来告诉我你更想保留哪些特征，比如风格、构图、颜色、材质或主体姿态，我再决定继续追问还是直接出图。",
      timestamp: new Date(),
    }]);
    setSelectedReferenceIds([]);
  }, [onMergeReferences, referencedAssets, selectedReferenceIds]);

  const insertComposerToken = useCallback((createTokenSegment: () => AssistantComposerSegment) => {
    let nextFocusSegmentId: string | null = null;
    setComposerSegments(prev => {
      const next = [...prev];
      const activeId = activeComposerSegmentIdRef.current;
      const activeIndex = next.findIndex(segment => segment.id === activeId && segment.type === "text");
      if (activeIndex >= 0 && next[activeIndex].type === "text") {
        const activeText = next[activeIndex].text;
        const cursor = Math.max(0, Math.min(activeComposerCursorRef.current, activeText.length));
        const before = activeText.slice(0, cursor);
        const after = activeText.slice(cursor);
        const afterSegment = createAssistantTextSegment(after);
        nextFocusSegmentId = afterSegment.id;
        activeComposerSegmentIdRef.current = afterSegment.id;
        activeComposerCursorRef.current = after.length;
        return normalizeAssistantComposerSegments([
          ...next.slice(0, activeIndex),
          { ...next[activeIndex], text: before },
          createTokenSegment(),
          afterSegment,
          ...next.slice(activeIndex + 1),
        ]);
      }
      const textSegment = createAssistantTextSegment("");
      nextFocusSegmentId = textSegment.id;
      activeComposerSegmentIdRef.current = textSegment.id;
      activeComposerCursorRef.current = 0;
      return normalizeAssistantComposerSegments([
        ...next,
        createTokenSegment(),
        textSegment,
      ]);
    });
    focusComposerSegment(nextFocusSegmentId);
  }, [focusComposerSegment]);

  useEffect(() => {
    const newAssets = referencedAssets.filter(asset => !syncedReferenceIdsRef.current.has(asset.id));
    if (newAssets.length === 0) return;
    newAssets.forEach(asset => {
      syncedReferenceIdsRef.current.add(asset.id);
      insertComposerToken(() => createAssistantImageSegment(asset));
    });
  }, [insertComposerToken, referencedAssets]);

  useEffect(() => {
    const newAnnotations = annotationReferences.filter(annotation => !syncedAnnotationIdsRef.current.has(annotation.id));
    if (newAnnotations.length === 0) return;
    newAnnotations.forEach(annotation => {
      syncedAnnotationIdsRef.current.add(annotation.id);
      insertComposerToken(() => createAssistantAnnotationSegment(annotation));
    });
  }, [annotationReferences, insertComposerToken]);

  const runAssistantCapability = async (module: string, instruction: string) => {
    if (isSubmitting) return;
    if (!isAuthenticated) {
      onLoginRequest();
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: instruction,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsSubmitting(true);
    try {
      const result = await callLLM({
        module,
        model: assistantTextModel.id,
        images: referencedAssets.map(asset => ({ src: asset.src, title: asset.title })),
        messages: [
          ...messages.slice(-8).map(message => ({ role: message.role, content: message.content })),
          { role: "user", content: instruction },
        ],
      });
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.text,
        timestamp: new Date(),
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      toast("AI 助手请求失败", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };
  useEffect(() => {
    if (!commandMenuOpen) return;
    const handler = (event: PointerEvent) => {
      if (commandMenuRef.current && event.target instanceof globalThis.Node && !commandMenuRef.current.contains(event.target)) {
        setCommandMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [commandMenuOpen]);

  useEffect(() => {
    if (!agentMenuOpen) return;
    const handler = (event: PointerEvent) => {
      if (assistantModelRef.current && event.target instanceof globalThis.Node && !assistantModelRef.current.contains(event.target)) {
        setAgentMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [agentMenuOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CANVAS_ASSISTANT_AUTO_MODE_STORAGE_KEY, assistantAutoMode ? "1" : "0");
      window.localStorage.setItem(CANVAS_ASSISTANT_MODEL_TAB_STORAGE_KEY, assistantModelTab);
      window.localStorage.setItem(CANVAS_ASSISTANT_IMAGE_MODEL_STORAGE_KEY, assistantImageModel.id);
      window.localStorage.setItem(CANVAS_ASSISTANT_TEXT_MODEL_STORAGE_KEY, assistantTextModel.id);
    } catch {
      /* ignore storage quota errors */
    }
  }, [assistantAutoMode, assistantImageModel.id, assistantModelTab, assistantTextModel.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = deserializeCanvasAssistantMessages(
      window.sessionStorage.getItem(canvasAssistantMessagesSessionKey(projectId)) ||
      window.localStorage.getItem(canvasAssistantMessagesStorageKey(projectId))
    );
    setMessages(stored.length > 0 ? stored : [
      { id: "assistant-seed-1", role: "assistant", content: "你好，下面开始你的创作吧！", timestamp: new Date() },
    ]);
  }, [projectId]);

  useEffect(() => {
    if (!activeSkill || collapsed) return;
    const messageId = `skill-load-${activeSkill.id}-${activeSkill.loadedAt}`;
    setMessages(prev => {
      if (prev.some(message => message.id === messageId)) return prev;
      return [...prev, {
        id: messageId,
        role: "assistant",
        content: [
          `${activeSkill.name} 已开启。`,
          `你只需要输入想做什么，比如主题、产品、活动信息、目标平台或风格要求。`,
          `我会自动套用「${activeSkill.subcategory}」的生成能力，把你的提示词整理成可出图的方案，并在画布中生成图片。`,
          activeSkill.canvasSizes?.length ? `适合尺寸：${activeSkill.canvasSizes.slice(0, 4).join("、")}` : "",
          `试试输入：帮我做一张关于「新品发布」的${activeSkill.subcategory}，风格高级、有视觉冲击力。`,
        ].filter(Boolean).join("\n"),
        timestamp: new Date(),
      }];
    });
    setComposerSegments(prev => getAssistantComposerText(prev) ? prev : [createAssistantTextSegment(`帮我生成一张${activeSkill.subcategory}：`)]);
    focusComposerSegment();
  }, [activeSkill, collapsed, focusComposerSegment]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const serialized = JSON.stringify(serializeCanvasAssistantMessages(messages));
    try {
      window.localStorage.setItem(canvasAssistantMessagesStorageKey(projectId), serialized);
      window.sessionStorage.removeItem(canvasAssistantMessagesSessionKey(projectId));
    } catch {
      try {
        window.sessionStorage.setItem(canvasAssistantMessagesSessionKey(projectId), serialized);
      } catch {
        /* ignore storage quota errors */
      }
    }
  }, [messages, projectId]);

  useEffect(() => {
    if (collapsed) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CanvasAssistantMessage["imageBackup"]>).detail;
      if (!detail?.src || !detail.nodeId) return;
      setMessages(prev => {
        if (prev.some(message => message.imageBackup?.nodeId === detail.nodeId)) return prev;
        return [...prev, {
          id: `image-backup-${detail.nodeId}`,
          role: "assistant",
          content: `已生成图片备份：${detail.title}`,
          timestamp: new Date(),
          imageBackup: detail,
        }];
      });
    };
    window.addEventListener("ai-image-generated-backup", handler);
    return () => window.removeEventListener("ai-image-generated-backup", handler);
  }, [collapsed]);

  useEffect(() => {
    if (collapsed) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ content?: string }>).detail;
      const content = detail?.content?.trim();
      if (!content) return;
      setMessages(prev => [...prev, {
        id: `external-assistant-${Date.now()}`,
        role: "assistant",
        content,
        timestamp: new Date(),
      }]);
    };
    window.addEventListener("canvas-assistant-external-message", handler);
    return () => window.removeEventListener("canvas-assistant-external-message", handler);
  }, [collapsed]);

  const handleImageBackupDoubleClick = (backup: NonNullable<CanvasAssistantMessage["imageBackup"]>) => {
    window.dispatchEvent(new CustomEvent("ai-image-backup-activate", { detail: backup }));
  };

  const handleRegenerateImageFromMessage = async (message: CanvasAssistantMessage) => {
    if (regeneratingMessageId) return;
    if (!isAuthenticated) {
      onLoginRequest();
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
    const promptText = (message.imageBackup?.prompt || message.content).trim();
    if (!promptText) {
      toast("没有可用于生成图片的提示词");
      return;
    }
    const generationId = `chat-regenerate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const imagePayload: ImageGeneratorPayload = {
      projectId,
      prompt: promptText,
      model: message.imageBackup?.model || "gpt-image-2",
      ratio: message.imageBackup?.ratio || "1:1",
      count: 1,
      style: message.imageBackup?.style || "聊天气泡",
      referencesEnabled: false,
      generationId,
    };
    setRegeneratingMessageId(message.id);
    dispatchImageGenerationTask({ ...imagePayload, status: "pending" }, projectId);
    try {
      const result = await generateAiImages(imagePayload);
      dispatchImageGenerationTask({ ...imagePayload, status: "completed", images: result.images }, projectId);
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "请稍后重试";
      dispatchImageGenerationTask({ ...imagePayload, status: "failed", error: failureMessage }, projectId);
      toast("AI 生成失败", { description: failureMessage });
    } finally {
      setRegeneratingMessageId(null);
    }
  };

  useEffect(() => {
    if (pendingHomePromptHandledRef.current || collapsed) return;
    const raw = sessionStorage.getItem("artx:pending-home-prompt");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { projectId?: string; prompt?: string; model?: string };
      if (payload.projectId !== projectId || !payload.prompt?.trim()) return;
      pendingHomePromptHandledRef.current = true;
      sessionStorage.removeItem("artx:pending-home-prompt");
      if (!isAuthenticated) {
        onLoginRequest();
        toast("请先登录", { description: "登录后即可使用 AI 能力" });
        return;
      }
      const submittedText = payload.prompt.trim();
      const userMessage = {
        id: `home-user-${Date.now()}`,
        role: "user" as const,
        content: submittedText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setComposerSegments([createAssistantTextSegment(submittedText)]);
      setIsSubmitting(true);

      window.setTimeout(async () => {
        try {
          const decision = await routeCreativeIntent({
            module: "home-prompt-canvas-router",
            model: "gpt-4o",
            prompt: submittedText,
          });
          if (decision.mode === "image") {
            const imagePrompt = decision.imagePrompt?.trim() || submittedText;
            const generationId = `home-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const imagePayload: ImageGeneratorPayload = {
              projectId,
              prompt: imagePrompt,
              model: ALL_AI_MODEL_OPTIONS.some(model => model.id === payload.model) ? payload.model! : assistantImageModel.id,
              ratio: "1:1",
              count: 1,
              style: "首页创作",
              referencesEnabled: false,
              generationId,
            };
            dispatchImageGenerationTask({ ...imagePayload, status: "pending" }, projectId);
            const result = await generateAiImages(imagePayload);
            dispatchImageGenerationTask({ ...imagePayload, status: "completed", images: result.images }, projectId);
            setMessages(prev => [...prev, {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: `已根据你的首页提示词生成图片：${imagePrompt}`,
              timestamp: new Date(),
            }]);
            return;
          }
          setMessages(prev => [...prev, {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: decision.reply || submittedText,
            timestamp: new Date(),
          }]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "请稍后重试";
          toast("首页提示词自动处理失败", { description: message });
        } finally {
          setComposerSegments([createAssistantTextSegment("")]);
          setIsSubmitting(false);
        }
      }, 360);
    } catch {
      sessionStorage.removeItem("artx:pending-home-prompt");
    }
  }, [assistantImageModel.id, assistantTextModel.id, collapsed, isAuthenticated, onLoginRequest, projectId]);

  useEffect(() => {
    if (helpPromptNonce <= 0 || collapsed) return;
    setComposerSegments(prev => getAssistantComposerText(prev) ? prev : [createAssistantTextSegment("我需要帮助解决：")]);
    focusComposerSegment();
  }, [focusComposerSegment, helpPromptNonce, collapsed]);

  useEffect(() => {
    if (collapsed) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSubmitting, collapsed]);

  const iconButtonStyle = (active = false): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md-design)",
    background: active ? hoverBg : "transparent",
    color: active ? text : sub,
    border: "none",
    transition: "background 0.16s ease, color 0.16s ease, transform 0.16s ease",
  });

  async function handleSubmit() {
    if (!isAuthenticated) {
      onLoginRequest();
      toast("请先登录", { description: "登录后即可使用 AI 能力" });
      return;
    }
    if (!hasPrompt && !hasContext) {
      toast("请输入画布想法或选择对象");
      return;
    }
    const rawSubmittedComposerPrompt = composerPrompt || `请基于${contextLabel || "当前画布"}继续处理。`;
    const submittedComposerPrompt = activeSkill
      ? `${activeSkillContext}\n\n用户请求：${rawSubmittedComposerPrompt}`
      : rawSubmittedComposerPrompt;
    const submittedText = composerText || rawSubmittedComposerPrompt;
    const submittedImages = composerImages.map(asset => ({ ...asset }));
    const submittedAnnotations = composerAnnotations;
    const submittedVisualReferences = getAssistantComposerVisualReferences(composerSegments);
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: submittedText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setComposerSegments([createAssistantTextSegment("")]);
    syncedReferenceIdsRef.current.clear();
    syncedAnnotationIdsRef.current.clear();
    onMergeReferences([]);
    submittedAnnotations.forEach(annotation => onRemoveAnnotationReference(annotation.id));
    setIsSubmitting(true);
    const context = contextLabel || "当前画布";
    const hasVisualReferences = submittedImages.length > 0 || submittedAnnotations.length > 0;
    const annotationContext = submittedAnnotations.map((ann, index) => (
      `注释 ${index + 1}：来自「${ann.title}」，位置 x=${ann.x.toFixed(1)}%、y=${ann.y.toFixed(1)}%，描述：${ann.text || "未填写"}`
    )).join("\n");
    const routedPrompt = annotationContext
      ? [
          `上下文：${context}`,
          "用户选择了多个画面注释点，请根据这些注释点的图片、位置和文案组合生成一张全新的图片。",
          annotationContext,
          `用户请求：${submittedComposerPrompt}`,
        ].join("\n")
      : hasVisualReferences
        ? `上下文：${context}\n用户按顺序提供了图文混排提示词，请严格理解引用图与其前后描述之间的关系。\n用户请求：${submittedComposerPrompt}`
        : submittedComposerPrompt;
    const assistantImages: ImageGeneratorReferenceAsset[] = submittedVisualReferences;
    if (activeSkill?.capability === "image_edit" && assistantImages.length === 0) {
      setMessages(prev => [...prev, {
        id: `assistant-skill-reference-required-${Date.now()}`,
        role: "assistant",
        content: "「局部编辑改图」需要先选择一张画布图片或上传参考图。我会基于那张图片执行去背景、擦除、扩图、换风格或局部重绘。",
        timestamp: new Date(),
      }]);
      setIsSubmitting(false);
      return;
    }
    try {
      const shouldRouteIntent = assistantAutoMode || assistantModelTab === "image";
      const decision = shouldRouteIntent
        ? await routeCreativeIntent({
            module: "right-ai-assistant",
            model: assistantTextModel.id,
            prompt: routedPrompt,
            referencedAssets: assistantImages,
            recentMessages: messages.slice(-8).map(message => ({ role: message.role, content: message.content })),
            preferImageWhenReferences: true,
            allowReferenceSearch: !hasAnnotationReferences,
          })
        : null;

      const shouldReplyWithText = assistantModelTab === "text" && (!assistantAutoMode || decision?.mode !== "image" && decision?.mode !== "reference_search" && !hasAnnotationReferences);
      if (shouldReplyWithText) {
        const result = await callLLM({
          module: "right-ai-assistant-chat",
          model: assistantTextModel.id,
          images: assistantImages,
          messages: [
            ...messages.slice(-8).map(message => ({ role: message.role, content: message.content })),
            { role: "user", content: routedPrompt },
          ],
        });
        setMessages(prev => [...prev, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.text,
          timestamp: new Date(),
        }]);
        return;
      }

      if (decision?.mode === "reference_search" && !hasAnnotationReferences) {
        const searchQuery = decision.searchQuery?.trim() || submittedText;
        const result = await searchReferenceImages({ query: searchQuery, limit: 10 });
        setMessages(prev => [...prev, {
          id: `assistant-reference-${Date.now()}`,
          role: "assistant",
          content: decision.followUp || `我先帮你抓了 ${result.images.length} 张「${searchQuery}」参考图，你先选几张最接近你想法的方向，我再继续追问或直接出图。`,
          timestamp: new Date(),
          referenceOptions: result.images,
          referenceSearchQuery: searchQuery,
          followUpPrompt: `我已经记住你选中的「${searchQuery}」参考图了。接下来告诉我你最想保留的风格、构图、色彩或主体特征，我会继续判断是追问还是直接出图。`,
        }]);
      } else if (decision?.mode === "image" || hasAnnotationReferences) {
        const imagePrompt = decision?.imagePrompt?.trim() || routedPrompt;
        const finalImagePrompt = buildSkillAppliedImagePrompt({
          activeSkill,
          skillContext: activeSkillContext,
          userPrompt: rawSubmittedComposerPrompt,
          imagePrompt,
        });
        const generationId = `right-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const shouldEditTargetReference = activeSkill?.capability === "image_edit" ? assistantImages.length >= 1 : assistantImages.length >= 2;
        const targetReference = shouldEditTargetReference ? assistantImages[assistantImages.length - 1] : undefined;
        const sourceReferences = shouldEditTargetReference ? assistantImages.slice(0, -1) : assistantImages;
        const targetDisplaySize = targetReference?.width && targetReference?.height
          ? { w: targetReference.width, h: targetReference.height }
          : undefined;
        const payload: ImageGeneratorPayload = {
          projectId,
          prompt: shouldEditTargetReference
            ? [
                finalImagePrompt,
                "Use the last referenced image as the target canvas. Preserve the target person's identity, pose, composition, background, lighting, camera angle, and aspect ratio.",
                "Use the earlier referenced images only as visual references for the requested object, accessory, texture, pattern, color, or detail.",
                "Do not generate a new unrelated person or scene.",
              ].join("\n")
            : finalImagePrompt,
          model: shouldEditTargetReference ? "gpt-image-2" : (assistantAutoMode ? "auto" : assistantImageModel.id),
          ratio: "1:1",
          count: 1,
          style: shouldEditTargetReference ? "引用编辑结果" : "右侧 AI 助手",
          referencesEnabled: assistantImages.length > 0,
          referencedAssets: assistantImages,
          generationId,
          displaySize: targetDisplaySize,
          sourceBackgroundSrc: targetReference?.src || assistantImages[0]?.src,
          skillId: activeSkill?.id,
        };
        dispatchImageGenerationTask({ ...payload, status: "pending" }, projectId);
        const result = shouldEditTargetReference && targetReference
          ? await editImageWithPrompt({
              imageSrc: targetReference.src,
              model: "gpt-image-2",
              prompt: payload.prompt,
              referencedAssets: sourceReferences,
              skillId: activeSkill?.id,
              targetWidth: targetReference.width,
              targetHeight: targetReference.height,
            })
          : await generateAiImages(payload);
        dispatchImageGenerationTask({ ...payload, status: "completed", images: result.images }, projectId);
        setMessages(prev => [...prev, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `已根据你的请求生成图片：${imagePrompt}`,
          timestamp: new Date(),
        }]);
      } else {
        const result = await callLLM({
          module: "right-ai-assistant-chat",
          model: assistantTextModel.id,
          images: assistantImages,
          messages: [
            ...messages.slice(-8).map(message => ({ role: message.role, content: message.content })),
            { role: "user", content: routedPrompt },
          ],
        });
        setMessages(prev => [...prev, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.text || decision?.reply || submittedText,
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      toast("AI 助手请求失败", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

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
      {!collapsed && (
        <button
          type="button"
          aria-label="拖拽调整对话区宽度"
          title="拖拽调整对话区宽度"
          className="absolute inset-y-0 left-0 nodrag nopan cursor-ew-resize"
          style={{
            width: 14,
            transform: "translateX(-7px)",
            zIndex: 2,
            background: "transparent",
            border: 0,
            padding: 0,
          }}
          onPointerDown={handleSplitterPointerDown}
          onPointerEnter={() => setSplitterHover(true)}
          onPointerLeave={() => setSplitterHover(false)}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              insetBlock: 0,
              left: "50%",
              width: splitterActive ? 4 : splitterHover ? 3 : 1,
              transform: "translateX(-50%)",
              borderRadius: 999,
              background: (splitterHover || splitterActive)
                ? "oklch(0.62 0.22 290)"
                : border,
              boxShadow: (splitterHover || splitterActive)
                ? "0 0 0 1px rgba(144,88,252,0.18), 0 0 18px rgba(144,88,252,0.64)"
                : "none",
              transition: splitterActive
                ? "none"
                : "width 160ms ease, background 160ms ease, box-shadow 160ms ease",
            }}
          />
        </button>
      )}
      <div
        className="h-14 flex items-center px-4"
        style={{ gap: 12, justifyContent: collapsed ? "flex-start" : "flex-end" }}
      >
        {(collapsed ? actionButtons.slice(2) : actionButtons).map(item => (
          <button
            key={item.label}
            className="h-8 flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors hover:opacity-85"
            style={{
              width: collapsed ? "auto" : 32,
              padding: collapsed ? "0 10px" : 0,
              gap: collapsed ? 6 : 0,
              background: collapsed ? chipBg : "transparent",
              color: collapsed ? text : sub,
              border: collapsed ? `1px solid ${border}` : "none",
              boxShadow: collapsed ? "0 8px 20px rgba(0,0,0,0.16)" : "none",
            }}
            title={item.label}
            aria-label={item.label}
            onClick={item.onClick}
          >
            {item.icon}
            {collapsed && <span className="type-caption">展开</span>}
          </button>
        ))}
      </div>

      {!collapsed && (
        <>
          <div
            className="flex-1 min-h-0 px-5 py-6 overflow-y-auto"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: `${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"} transparent`,
            }}
          >
            <div className="flex flex-col gap-4">
              {messages.map(message => {
                const isUser = message.role === "user";
                const backup = message.imageBackup;
                return (
                <div key={message.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[86%]">
                    <p
                      className="type-caption mb-1.5"
                      style={{
                        color: sub,
                        fontSize: 11,
                        textAlign: isUser ? "right" : "left",
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                    >
                      {formatCanvasMessageTime(message.timestamp)}
                    </p>
                    <div
                      className="rounded-[var(--radius-lg-design)]"
                      style={{
                        background: isUser ? "#C5ED47" : chipBg,
                        border: `1px solid ${isUser ? "rgba(197,237,71,0.48)" : border}`,
                        color: isUser ? "#000" : text,
                        boxShadow: isUser ? "0 10px 24px rgba(197,237,71,0.16)" : "none",
                        padding: "8px",
                      }}
                      onDoubleClick={backup ? () => handleImageBackupDoubleClick(backup) : undefined}
                      title={backup ? "双击可在画布中定位或找回这张图片" : undefined}
                    >
                      {backup ? (
                        <div className="flex flex-col gap-2">
                          <img
                            src={backup.src}
                            alt={backup.title}
                            draggable={false}
                            className="w-full rounded-[var(--radius-md-design)]"
                            style={{
                              aspectRatio: `${Math.max(1, backup.width)} / ${Math.max(1, backup.height)}`,
                              objectFit: "cover",
                              border: `1px solid ${border}`,
                              cursor: "zoom-in",
                            }}
                          />
                          <p className="type-caption" style={{ color: text, fontWeight: 600, lineHeight: "16px" }}>{backup.title}</p>
                          <p className="type-caption" style={{ color: sub, lineHeight: "16px" }}>双击气泡可定位或找回图片</p>
                        </div>
                      ) : (
                        <div className="flex flex-col" style={{ gap: 8 }}>
                          <p
                            className="type-caption whitespace-pre-wrap"
                            style={{
                              color: isUser ? "#000" : text,
                              fontSize: 12,
                              lineHeight: "16px",
                              letterSpacing: "0.6px",
                            }}
                          >
                            {message.content}
                          </p>
                          {message.referenceOptions && message.referenceOptions.length > 0 && (
                            <div className="flex flex-col gap-3">
                              <div className="grid grid-cols-2 gap-2">
                                {message.referenceOptions.map((item) => {
                                  const active = selectedReferenceIds.includes(item.id);
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className="overflow-hidden rounded-[var(--radius-md-design)] text-left transition-all"
                                      style={{
                                        border: `1px solid ${active ? "rgba(197,237,71,0.58)" : border}`,
                                        background: active ? "rgba(197,237,71,0.12)" : "transparent",
                                        boxShadow: active ? "0 0 0 2px rgba(197,237,71,0.14)" : "none",
                                      }}
                                      onClick={() => handleReferenceSelectionToggle(item.id)}
                                    >
                                      <img
                                        src={item.src}
                                        alt={item.title}
                                        draggable={false}
                                        className="w-full"
                                        style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                                      />
                                      <div className="px-2 py-2">
                                        <p className="type-caption truncate" style={{ color: text, fontWeight: 600 }}>{item.title}</p>
                                        <p className="type-caption truncate" style={{ color: sub }}>{item.source}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="type-caption" style={{ color: sub }}>
                                  已选 {selectedReferenceIds.length} 张参考图
                                </span>
                                <button
                                  type="button"
                                  className="rounded-[var(--radius-md-design)] px-3 py-1.5 type-caption transition-opacity hover:opacity-85"
                                  style={{
                                    background: "#C5ED47",
                                    color: "#000",
                                    opacity: selectedReferenceIds.length > 0 ? 1 : 0.5,
                                  }}
                                  disabled={selectedReferenceIds.length === 0}
                                  onClick={() => handleReferenceSelectionApply(message)}
                                >
                                  确认参考图
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2" style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}>
                      {!backup && (
                        <>
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-75 disabled:opacity-50"
                            style={{
                              color: regeneratingMessageId === message.id ? "#C5ED47" : sub,
                              background: "transparent",
                            }}
                            title="再次生成"
                            aria-label="再次生成"
                            disabled={Boolean(regeneratingMessageId)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRegenerateImageFromMessage(message);
                            }}
                          >
                            {regeneratingMessageId === message.id ? <RefreshCw size={13} className="animate-spin" /> : <Repeat2 size={13} />}
                          </button>
                          <button className="h-7 w-7 flex items-center justify-center rounded-[var(--radius-md-design)] transition-opacity hover:opacity-75" style={{ color: sub, background: "transparent" }} title="复制" aria-label="复制" onClick={() => { navigator.clipboard?.writeText(message.content); toast("已复制对话内容"); }}>
                            <Copy size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="max-w-[86%] rounded-[var(--radius-lg-design)] px-4 py-3" style={{ background: chipBg, border: `1px solid ${border}`, color: sub }}>
              <span className="type-caption">AI 正在回复中...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="shrink-0 p-4 mt-auto">
            <div
              className="relative rounded-[var(--radius-xl-design)] px-3 py-3 transition-all duration-200"
              style={{
                background: isDark ? "oklch(0.105 0.012 270 / 0.94)" : chipBg,
                border: `1px solid ${inputFocused ? "rgba(197,237,71,0.42)" : border}`,
                boxShadow: inputFocused ? activeGlow : inputShadow,
              }}
            >
              {contextLabel && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span
                    className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-pill)] px-2 py-1 type-caption"
                    style={{
                      background: isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)",
                      border: `1px solid ${border}`,
                      color: text,
                    }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: "#C5ED47", display: "inline-block" }} />
                    <span className="truncate">{contextLabel}</span>
                  </span>
                </div>
              )}
              <div
                className="mb-2 flex min-h-[86px] flex-wrap items-start gap-[1px] overflow-y-auto rounded-[var(--radius-md-design)] px-1 py-1"
                style={{
                  color: text,
                  maxHeight: "min(42vh, 280px)",
                  scrollbarWidth: "thin",
                  scrollbarColor: `${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"} transparent`,
                }}
                onMouseDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("[data-composer-token], input")) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (event.clientX - rect.left <= 44) {
                    focusLeadingComposerSegment();
                    return;
                  }
                  focusComposerSegment();
                }}
              >
                <span
                  ref={composerMeasureRef}
                  aria-hidden="true"
                  className="pointer-events-none invisible absolute whitespace-pre"
                  style={{
                    fontSize: 12,
                    lineHeight: "24px",
                    fontFamily: "inherit",
                    letterSpacing: 0,
                  }}
                />
                {composerSegments.map(segment => {
                  if (segment.type === "image") {
                    return (
                      <span
                        key={segment.id}
                        draggable
                        onDragStart={event => handleComposerTokenDragStart(event, segment.id)}
                        onDragOver={event => handleComposerSegmentDragOver(event, segment.id)}
                        onDrop={event => handleComposerSegmentDrop(event, segment.id, "before")}
                        onDragEnd={handleComposerDragEnd}
                        data-composer-token="image"
                        className="inline-flex max-w-[82px] items-center gap-1 rounded-[var(--radius-md-design)] px-1.5 py-0.5 align-middle"
                        style={{
                          background: isDark ? "rgba(197,237,71,0.16)" : "rgba(197,237,71,0.10)",
                          border: `1px solid ${dragOverComposerSegmentId === segment.id ? "rgba(197,237,71,0.86)" : isDark ? "rgba(197,237,71,0.36)" : "rgba(138,170,40,0.30)"}`,
                          color: isDark ? "oklch(0.82 0.012 270)" : "oklch(0.28 0.012 270)",
                          cursor: "grab",
                          opacity: draggingComposerSegmentId === segment.id ? 0.42 : 1,
                          boxShadow: dragOverComposerSegmentId === segment.id ? "0 0 0 2px rgba(197,237,71,0.18)" : "none",
                        }}
                        title="拖拽调整引用顺序"
                      >
                        <img src={segment.asset.src} alt={segment.asset.title} style={{ width: 18, height: 18, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />
                        <span className="type-caption truncate" style={{ maxWidth: 44, fontSize: 11 }}>{segment.asset.title}</span>
                        <button
                          type="button"
                          onMouseDown={event => event.stopPropagation()}
                          onClick={() => removeComposerImageSegment(segment.id, segment.asset.id)}
                          className="flex items-center justify-center flex-shrink-0 rounded-full transition-opacity hover:opacity-70"
                          style={{ color: isDark ? "oklch(0.62 0.008 270)" : "oklch(0.50 0.008 270)", background: "transparent", border: "none", padding: 0, lineHeight: 1 }}
                          title="移除引用"
                          aria-label="移除引用"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    );
                  }
                  if (segment.type === "annotation") {
                    return (
                      <span
                        key={segment.id}
                        draggable
                        onDragStart={event => handleComposerTokenDragStart(event, segment.id)}
                        onDragOver={event => handleComposerSegmentDragOver(event, segment.id)}
                        onDrop={event => handleComposerSegmentDrop(event, segment.id, "before")}
                        onDragEnd={handleComposerDragEnd}
                        data-composer-token="annotation"
                        className="inline-flex max-w-[92px] items-center gap-1 rounded-[var(--radius-md-design)] px-1.5 py-0.5 align-middle"
                        style={{
                          background: isDark ? "oklch(0.62 0.20 145 / 0.16)" : "oklch(0.62 0.17 145 / 0.10)",
                          border: `1px solid ${dragOverComposerSegmentId === segment.id ? "oklch(0.72 0.16 145 / 0.78)" : isDark ? "oklch(0.72 0.16 145 / 0.32)" : "oklch(0.48 0.15 145 / 0.26)"}`,
                          color: isDark ? "oklch(0.82 0.012 270)" : "oklch(0.25 0.012 270)",
                          cursor: "grab",
                          opacity: draggingComposerSegmentId === segment.id ? 0.42 : 1,
                          boxShadow: dragOverComposerSegmentId === segment.id ? "0 0 0 2px rgba(52,211,153,0.16)" : "none",
                        }}
                        title={`注释：${segment.annotation.text || segment.annotation.title}`}
                      >
                        <MapPin size={12} style={{ color: "oklch(0.62 0.18 145)", flexShrink: 0 }} />
                        <span className="type-caption truncate" style={{ maxWidth: 56, fontSize: 11 }}>
                          {segment.annotation.text || segment.annotation.title}
                        </span>
                        <button
                          type="button"
                          onMouseDown={event => event.stopPropagation()}
                          onClick={() => removeComposerAnnotationSegment(segment.id, segment.annotation.id)}
                          className="flex items-center justify-center flex-shrink-0 rounded-full transition-opacity hover:opacity-70"
                          style={{ color: isDark ? "oklch(0.62 0.008 270)" : "oklch(0.50 0.008 270)", background: "transparent", border: "none", padding: 0, lineHeight: 1 }}
                          title="移除注释引用"
                          aria-label="移除注释引用"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    );
                  }
                  const isSingleEmptyTextSegment = composerSegments.length === 1 && segment.text.length === 0;
                  const textWidth = composerTextWidths[segment.id] ?? (segment.text
                    ? Math.min(520, Math.max(32, segment.text.length * 13 + 18))
                    : isSingleEmptyTextSegment
                      ? 320
                      : 32);
                  return (
                    <input
                      key={segment.id}
                      type="text"
                      ref={node => {
                        composerInputRefs.current[segment.id] = node;
                      }}
                      value={segment.text}
                      onChange={event => {
                        rememberComposerCursor(segment.id, event.currentTarget);
                        setComposerTextSegment(segment.id, event.target.value);
                      }}
                      onClick={event => rememberComposerCursor(segment.id, event.currentTarget)}
                      onDragOver={event => handleComposerSegmentDragOver(event, segment.id)}
                      onDrop={event => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
                        handleComposerSegmentDrop(event, segment.id, placement);
                      }}
                      onKeyUp={event => rememberComposerCursor(segment.id, event.currentTarget)}
                      onKeyDown={event => handleComposerTextKeyDown(event, segment.id)}
                      onFocus={() => {
                        activeComposerSegmentIdRef.current = segment.id;
                        const input = composerInputRefs.current[segment.id];
                        activeComposerCursorRef.current = input?.selectionStart ?? segment.text.length;
                        setInputFocused(true);
                      }}
                      onBlur={() => setInputFocused(false)}
                      placeholder={composerSegments.length === 1 && segment.text.length === 0
                        ? composerAnnotations.length > 0
                          ? `基于 ${composerAnnotations.length} 个注释点，描述组合生成意图...`
                          : "输入对当前画布的想法，可在文字之间插入引用图片..."
                        : ""}
                      className="min-w-0 whitespace-nowrap border-0 bg-transparent px-1.5 py-1 outline-none disabled:cursor-not-allowed"
                      style={{
                        color: text,
                        opacity: 1,
                        fontSize: 12,
                        lineHeight: "20px",
                        height: 28,
                        minHeight: 28,
                        overflow: "hidden",
                        width: isSingleEmptyTextSegment ? "100%" : `${textWidth}px`,
                        minWidth: isSingleEmptyTextSegment ? 0 : `${textWidth}px`,
                        maxWidth: isSingleEmptyTextSegment ? "100%" : `${textWidth}px`,
                        flex: isSingleEmptyTextSegment ? "1 1 100%" : "0 0 auto",
                        flexBasis: isSingleEmptyTextSegment ? "100%" : `${textWidth}px`,
                        wordBreak: "keep-all",
                        overflowWrap: "normal",
                        margin: 0,
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-2" style={{ gap: 6 }}>
                <div className="flex min-w-0 items-center" style={{ gap: 6 }}>
                  <div ref={assistantModelRef} className="relative flex min-w-0 items-center" style={{ color: sub }}>
                    <button
                      type="button"
                      className="flex h-8 max-w-[126px] items-center gap-1 rounded-[var(--radius-lg-design)] px-2 transition-colors active:scale-95"
                      style={{
                        background: agentMenuOpen ? hoverBg : "transparent",
                        color: agentMenuOpen ? text : sub,
                        fontSize: 11,
                        lineHeight: "14px",
                        letterSpacing: 0,
                      }}
                      onClick={() => { setAgentMenuOpen(v => !v); setCommandMenuOpen(false); }}
                      onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                      onMouseLeave={e => (e.currentTarget.style.background = agentMenuOpen ? hoverBg : "transparent")}
                      title="选择模型"
                      aria-label="选择模型"
                    >
                      <span className="min-w-0 max-w-[100px] truncate">
                        {assistantAutoMode ? "auto" : `${assistantModelTab === "image" ? "生图" : "对话"} · ${assistantModel.label}`}
                      </span>
                      <ChevronDown size={10} style={{ flex: "0 0 auto", opacity: 0.6, transform: agentMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.16s ease" }} />
                    </button>
                    {agentMenuOpen && (
                      <div
                        className="absolute bottom-full left-0 mb-2 overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
                        style={{
                          background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.97 0.004 270)",
                          border: `1px solid ${border}`,
                          minWidth: 200,
                          backdropFilter: "blur(16px)",
                          zIndex: 130,
                        }}
                      >
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                        <div>
                          <p className="type-caption" style={{ color: text, fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>auto</p>
                          <p className="type-caption" style={{ color: sub, fontSize: 10, lineHeight: "13px", letterSpacing: 0 }}>根据提示词自动选择对话或生图</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={assistantAutoMode}
                          className="relative shrink-0 rounded-[var(--radius-pill)] transition-all"
                          style={{
                            width: 38,
                            height: 22,
                            background: assistantAutoMode ? "#C5ED47" : (isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)"),
                            border: `1px solid ${assistantAutoMode ? "rgba(197,237,71,0.60)" : border}`,
                          }}
                          onClick={() => setAssistantAutoMode(value => !value)}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: 3,
                              left: assistantAutoMode ? 19 : 3,
                              width: 16,
                              height: 16,
                              borderRadius: 999,
                              background: assistantAutoMode ? "#111827" : (isDark ? "oklch(0.68 0.01 270)" : "#fff"),
                              boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
                              transition: "left 0.16s ease, background 0.16s ease",
                            }}
                          />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 p-1.5" style={{ borderBottom: `1px solid ${border}` }}>
                        {([
                          { id: "image" as const, label: "生图" },
                          { id: "text" as const, label: "对话" },
                        ]).map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            className="h-7 rounded-[var(--radius-md-design)] type-caption transition-colors"
                            style={{
                              color: assistantModelTab === tab.id ? text : sub,
                              background: assistantModelTab === tab.id ? "rgba(197,237,71,0.14)" : "transparent",
                              border: `1px solid ${assistantModelTab === tab.id ? "rgba(197,237,71,0.40)" : "transparent"}`,
                            }}
                            onClick={() => setAssistantModelTab(tab.id)}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      {assistantModelOptions.map(model => (
                          <button
                            key={model.id}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2.5 text-left type-caption transition-colors"
                            style={{ color: text, background: assistantModel.id === model.id ? "rgba(197,237,71,0.12)" : "transparent" }}
                            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                            onMouseLeave={e => (e.currentTarget.style.background = assistantModel.id === model.id ? "rgba(197,237,71,0.12)" : "transparent")}
                            onClick={() => {
                              if (assistantModelTab === "image") {
                                setAssistantImageModelId(model.id);
                              } else {
                                setAssistantTextModelId(model.id);
                              }
                              setAssistantAutoMode(false);
                              setAgentMenuOpen(false);
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-4 h-4 rounded-[var(--radius-pill)]" style={{ background: model.color }} />
                              <div>
                                <p className="type-caption" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{model.label}</p>
                                {"description" in model && model.description ? (
                                  <p className="truncate" style={{ color: sub, fontSize: 10, letterSpacing: 0, maxWidth: 150 }}>{model.description}</p>
                                ) : null}
                              </div>
                            </div>
                            {assistantModel.id === model.id && (
                              <Check size={13} style={{ color: "#C5ED47" }} />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <SkillPointSelector activeSkill={activeSkill} onChange={onActiveSkillChange} isDark={isDark} />
                </div>
                <div className="flex shrink-0 items-center" style={{ gap: 6 }}>
                  <button
                    disabled={!canSubmit}
                    className="h-8 w-8 rounded-[var(--radius-lg-design)] flex items-center justify-center disabled:cursor-not-allowed transition-all hover:scale-[1.03] active:scale-95"
                    style={{
                      background: canSubmit || isSubmitting ? "#C5ED47" : (isDark ? "oklch(1 0 0 / 8%)" : "oklch(0 0 0 / 8%)"),
                      color: canSubmit || isSubmitting ? "#000" : sub,
                      opacity: isAuthenticated ? 1 : 0.65,
                      boxShadow: canSubmit ? "0 12px 30px rgba(197,237,71,0.24)" : "none",
                    }}
                    onClick={handleSubmit}
                    title={isSubmitting ? "处理中" : "发送"}
                    aria-label={isSubmitting ? "处理中" : "发送"}
                  >
                    {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
              {isSubmitting && (
                <div className="mt-2 flex items-center justify-between rounded-[var(--radius-md-design)] px-2 py-1.5" style={{ background: hoverBg, color: sub }}>
                  <span className="type-caption">正在处理当前画布...</span>
                  <button type="button" className="type-caption hover:opacity-75" style={{ color: text }} onClick={() => setIsSubmitting(false)}>停止</button>
                </div>
              )}
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
    <div ref={ref} className="absolute nodrag nopan" style={{ top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 110, width: 320 }}>
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
  const restoredCanvasState = useMemo(() => safeReadCanvasState(projectId), [projectId]);
  const initialProjectMeta = useMemo(() => {
    if (typeof window === "undefined") return null;
    return readWorkspaceProjectHistory().find(project => project.id === projectId) || null;
  }, [projectId]);
  const projectInitialNodes = useMemo(
    () => normalizeCanvasFrameNodes(restoredCanvasState?.nodes || createInitialSocialArtboardNode(initialProjectMeta)),
    [initialProjectMeta, restoredCanvasState?.nodes]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(projectInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(restoredCanvasState?.edges || initialEdges);
  const [canvasRestoreTick, setCanvasRestoreTick] = useState(0);
  // 始终跟踪最新的 nodes/edges，供 pushHistory 读取（避免闭包捕获旧值）
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ resolve?: (assets: ImageGeneratorReferenceAsset[]) => void }>).detail;
      const selectedAssetIds = new Set(nodesRef.current.filter(node => node.selected && node.type === "asset").map(node => node.id));
      const assets = nodesRef.current
        .filter(node => node.type === "asset")
        .sort((a, b) => {
          const aSelected = selectedAssetIds.has(a.id) ? 0 : 1;
          const bSelected = selectedAssetIds.has(b.id) ? 0 : 1;
          return aSelected - bSelected;
        })
        .map(node => ({
          id: node.id,
          title: getAssetNodeDisplayTitle(node),
          src: getAssetNodeImageSource(node),
        }))
        .filter(asset => Boolean(asset.src))
        .slice(0, 8);
      detail?.resolve?.(assets);
    };
    window.addEventListener("image-generator-reference-request", handler);
    return () => window.removeEventListener("image-generator-reference-request", handler);
  }, []);
  const didHydrateCanvasStateRef = useRef(false);
  const [nodeCtxMenu, setNodeCtxMenu] = useState<NodeCtxState | null>(null);
  const [clipboard, setClipboard] = useState<Node[]>([]);
  const pasteEventSeenAtRef = useRef(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(() => {
    if (typeof window === "undefined") return 372;
    return Math.max(280, Math.min(372, Math.round(window.innerWidth * 0.32)));
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setAssistantPanelWidth(width => {
        const maxWidth = Math.max(320, Math.min(560, window.innerWidth - 360));
        return Math.max(280, Math.min(maxWidth, width));
      });
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [helpPromptNonce, setHelpPromptNonce] = useState(0);
  const [activeSkill, setActiveSkill] = useState<PendingSkillLoad | null>(null);
  const [imageGeneratorModalOpen, setImageGeneratorModalOpen] = useState(false);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  // ── Edit-asset state: zoom in on canvas then show editing prompt bar ──
  const [editAsset, setEditAsset] = useState<{ id: string; title: string; src: string; nodeId: string } | null>(null);
  const [cropEditorState, setCropEditorState] = useState<{ nodeId: string; imageSrc: string } | null>(null);
  const [rotateEditorState, setRotateEditorState] = useState<{ nodeId: string; imageSrc: string } | null>(null);
  const [isZoomingToEdit, setIsZoomingToEdit] = useState(false);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  // ── Referenced assets: auto-populated from selected image nodes ──
  const [referencedAssets, setReferencedAssets] = useState<ImageGeneratorReferenceAsset[]>([]);
  const [annotationReferences, setAnnotationReferences] = useState<AnnotationReference[]>([]);
  const mergeReferencedAssets = useCallback((assets: ImageGeneratorReferenceAsset[]) => {
    setReferencedAssets(assets);
  }, []);
  const getLatestAssetNode = useCallback((nodeId: string) => (
    nodesRef.current.find(node => node.id === nodeId && node.type === "asset") || null
  ), []);
  const getLatestAssetImageSource = useCallback((nodeId: string) => {
    const latestNode = getLatestAssetNode(nodeId);
    return latestNode ? getAssetNodeImageSource(latestNode) : "";
  }, [getLatestAssetNode]);
  const ensureBackgroundImageGeneration = useCallback((task: PersistedImageGenerationTask | ImageGeneratorPayload) => {
    const generationId = task.generationId;
    const taskProjectId = task.projectId || projectId;
    if (!generationId || !task.prompt?.trim()) return;
    if ((task as PersistedImageGenerationTask).status && (task as PersistedImageGenerationTask).status !== "pending") return;
    const startedAt = getImageGenerationStartedAt(task);
    const failTimedOutTask = () => {
      dispatchImageGenerationTask({
        ...(task as ImageGeneratorPayload),
        generationId,
        projectId: taskProjectId,
        status: "failed",
        error: AI_GENERATION_NETWORK_ERROR_MESSAGE,
        generationStartedAt: startedAt,
      }, taskProjectId);
    };
    if (Date.now() - startedAt >= AI_GENERATION_TIMEOUT_MS) {
      failTimedOutTask();
      return;
    }

    const startTask = async () => {
      try {
        if (!(task as PersistedImageGenerationTask).backgroundStartedAt) {
          markImageGenerationTaskBackgroundStarted(taskProjectId, generationId);
          await startBackgroundImageGeneration({
            taskId: generationId,
            prompt: task.prompt,
            model: task.model,
            ratio: task.ratio,
            count: task.count,
            style: task.style,
            referencesEnabled: task.referencesEnabled,
            referencedAssets: task.referencedAssets,
            skillId: task.skillId,
          });
        }
      } catch {
        /* The foreground request may still finish; polling below handles eventual state. */
      }
    };

    const pollTask = async () => {
      while (Date.now() - startedAt < AI_GENERATION_TIMEOUT_MS) {
        try {
          const result = await getBackgroundImageGenerationTask(generationId);
          if (result.status === "completed" && result.images?.length) {
            dispatchImageGenerationTask({ ...(task as ImageGeneratorPayload), generationId, projectId: taskProjectId, status: "completed", images: result.images }, taskProjectId);
            return;
          }
          if (result.status === "failed") {
            dispatchImageGenerationTask({ ...(task as ImageGeneratorPayload), generationId, projectId: taskProjectId, status: "failed", error: result.error || AI_GENERATION_NETWORK_ERROR_MESSAGE }, taskProjectId);
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!/not found/i.test(message)) {
            console.warn("Background image generation polling failed", error);
          }
        }
        await new Promise(resolve => window.setTimeout(resolve, 3000));
      }
      failTimedOutTask();
    };

    void startTask();
    void pollTask();
  }, [projectId]);
  const requireAiAccess = useCallback(() => {
    if (isAuthenticated) return true;
    openLoginModal();
    toast("请先登录", { description: "登录后即可使用 AI 能力" });
    return false;
  }, [isAuthenticated, openLoginModal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_SKILL_LOAD_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as PendingSkillLoad;
      if (!payload?.id || !payload?.name) return;
      window.sessionStorage.removeItem(PENDING_SKILL_LOAD_KEY);
      setActiveSkill(payload);
      setIsAssistantCollapsed(false);
      toast("Skill 已加载到画布", { description: payload.name });
    } catch {
      window.sessionStorage.removeItem(PENDING_SKILL_LOAD_KEY);
    }
  }, [projectId]);

  useEffect(() => {
    const saved = safeReadCanvasState(projectId);
    const projectMeta = readWorkspaceProjectHistory().find(project => project.id === projectId) || null;
    const restoredNodes = normalizeCanvasFrameNodes(saved?.nodes || createInitialSocialArtboardNode(projectMeta));
    const restoredEdges = saved?.edges || initialEdges;
    const updatedAt = saved?.updatedAt || formatProjectHistoryTimestamp();
    let cancelled = false;
    isRestoringRef.current = true;
    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setSelectedNodeIds(restoredNodes.filter(node => node.selected).map(node => node.id));
    updateWorkspaceProjectHistory(projectId, getCanvasProjectHistoryPatch(restoredNodes, updatedAt));
    const coverSource = getCanvasStateCoverSource(restoredNodes);
    if (coverSource) {
      createCanvasCoverThumbnail(coverSource)
        .then(cover => updateWorkspaceProjectHistory(projectId, { cover, nodeCount: restoredNodes.length, updatedAt }))
        .catch(() => {});
    }
    hydrateCanvasNodeImagePayloads(projectId, restoredNodes).then(hydratedNodes => {
      if (cancelled || hydratedNodes === restoredNodes) return;
      isRestoringRef.current = true;
      setNodes(hydratedNodes);
      const hydratedCoverSource = getCanvasStateCoverSource(hydratedNodes);
      if (hydratedCoverSource) {
        createCanvasCoverThumbnail(hydratedCoverSource)
          .then(cover => updateWorkspaceProjectHistory(projectId, { cover, nodeCount: hydratedNodes.length, updatedAt }))
          .catch(() => {});
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        isRestoringRef.current = false;
      }));
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      isRestoringRef.current = false;
      didHydrateCanvasStateRef.current = true;
      setCanvasRestoreTick(value => value + 1);
    }));
    return () => {
      cancelled = true;
    };
  }, [projectId, setEdges, setNodes]);

  useEffect(() => {
    touchWorkspaceProjectHistory(projectId);
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined" || !didHydrateCanvasStateRef.current || isRestoringRef.current) return;
    const updatedAt = formatProjectHistoryTimestamp();
    const state: PersistedCanvasState = { nodes, edges, updatedAt };
    safeWriteCanvasState(projectId, state);
    updateWorkspaceProjectHistory(projectId, getCanvasProjectHistoryPatch(nodes, updatedAt));
  }, [edges, nodes, projectId]);

  useEffect(() => {
    if (typeof window === "undefined" || !didHydrateCanvasStateRef.current || isRestoringRef.current) return;
    const coverSource = getCanvasStateCoverSource(nodes);
    if (!coverSource) return;
    let cancelled = false;
    const updatedAt = formatProjectHistoryTimestamp();
    const timer = window.setTimeout(() => {
      createCanvasCoverThumbnail(coverSource)
        .then(cover => {
          if (!cancelled) updateWorkspaceProjectHistory(projectId, { cover, nodeCount: nodes.length, updatedAt });
        })
        .catch(() => {});
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nodes, projectId]);
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
  const [assetMorePanel, setAssetMorePanel] = useState<{ command: string; nodeId: string } | null>(null);
  const closeAssetMorePanel = useCallback(() => {
    const previewNodeId = assetMorePanel?.nodeId;
    setAssetMorePanel(null);
    if (!previewNodeId) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== previewNodeId || n.type !== "asset") return n;
      const data = n.data as Record<string, unknown>;
      if (!data.assetAdjustmentPreview) return n;
      const { assetAdjustmentPreview, ...restData } = data;
      return { ...n, data: restData };
    }));
  }, [assetMorePanel?.nodeId, setNodes]);
  const containerRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ clientX: number; clientY: number; viewport: { x: number; y: number; zoom: number } } | null>(null);
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const MAX_HISTORY_STEPS = 50;

  useEffect(() => {
    const handleHelpPrompt = () => {
      sessionStorage.removeItem("artx:activate-help-prompt");
      setIsAssistantCollapsed(false);
      setHelpPromptNonce(value => value + 1);
    };
    window.addEventListener("artx:activate-help-prompt", handleHelpPrompt);
    if (sessionStorage.getItem("artx:activate-help-prompt") === "1" || new URLSearchParams(window.location.search).get("help") === "1") {
      window.setTimeout(handleHelpPrompt, 120);
    }
    return () => window.removeEventListener("artx:activate-help-prompt", handleHelpPrompt);
  }, []);
  const isRestoringRef = useRef(false); // undo 过程中屏蔽副作用
  const isAssetResizingRef = useRef(false);
  // ── Local file drag-drop state ──
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragCounterRef = useRef(0);
  // ── Alt + drag 复制状态 ──
  // key: nodeId, value: { x, y } 记录按下 Alt 时节点的原始位置
  const altDragOriginRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isAltDragRef = useRef(false);
  const dragStartPositionRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // ── 工具模式 ──
  const [activeToolMode, setActiveToolMode] = useState<string>("move");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const getDerivedImagePlacement = useCallback((sourceNode: Node, displayW: number, displayH: number) => {
    const sourceSize = getCanvasNodeSize(sourceNode);
    const desired = {
      x: sourceNode.position.x + sourceSize.width + 36,
      y: sourceNode.position.y + Math.max(0, (sourceSize.height - displayH) / 2),
    };
    return resolveNonOverlappingCanvasPosition(
      nodesRef.current,
      desired,
      { width: displayW, height: displayH },
      [sourceNode.id],
    );
  }, []);

  const runDerivedImageGeneration = useCallback(async ({
    sourceNode,
    prompt,
    style,
    nextW,
    nextH,
    preserveSourceDisplaySize = true,
    displayW,
    displayH,
    placement,
    run,
  }: {
    sourceNode: Node;
    prompt: string;
    style: string;
    nextW: number;
    nextH: number;
    preserveSourceDisplaySize?: boolean;
    displayW?: number;
    displayH?: number;
    placement?: { x: number; y: number };
    run: () => Promise<{ images: Array<{ src: string; width: number; height: number }> }>;
  }) => {
    const latestSourceNode = sourceNode.type === "asset" ? (getLatestAssetNode(sourceNode.id) || sourceNode) : sourceNode;
    const sourceDisplaySize = getCanvasNodeSize(latestSourceNode);
    const resolvedDisplayW = Math.max(1, Math.round(preserveSourceDisplaySize ? sourceDisplaySize.width : (displayW ?? sourceDisplaySize.width)));
    const resolvedDisplayH = Math.max(1, Math.round(preserveSourceDisplaySize ? sourceDisplaySize.height : (displayH ?? sourceDisplaySize.height)));
    const generationId = `${style}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const transparentLayerStyles = new Set(["去背景结果", "主体层", "中景层", "扩展结果"]);
    const sourceBackgroundSrc = transparentLayerStyles.has(style)
      ? ""
      : latestSourceNode.type === "asset"
        ? getAssetNodeImageSource(latestSourceNode)
        : "";
    const payload: ImageGeneratorPayload = {
      projectId,
      prompt,
      model: "gpt-image-2",
      ratio: inferImageRatio(resolvedDisplayW, resolvedDisplayH),
      count: 1,
      style,
      referencesEnabled: false,
      generationId,
      placement: placement || getDerivedImagePlacement(latestSourceNode, resolvedDisplayW, resolvedDisplayH),
      displaySize: { w: resolvedDisplayW, h: resolvedDisplayH },
      titleBase: style,
      sourceBackgroundSrc: sourceBackgroundSrc || undefined,
    };
    dispatchImageGenerationTask({ ...payload, status: "pending" }, projectId);
    try {
      const result = await run();
      dispatchImageGenerationTask({ ...payload, status: "completed", images: result.images }, projectId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      dispatchImageGenerationTask({ ...payload, status: "failed", error: message }, projectId);
      toast(`${style}失败`, { description: message });
      return false;
    }
  }, [getDerivedImagePlacement, getLatestAssetNode, projectId]);

  const createGeneratedImageNode = useCallback((backup: NonNullable<CanvasAssistantMessage["imageBackup"]>, position: { x: number; y: number }): Node => ({
    id: backup.nodeId,
    type: "asset" as const,
    position,
    style: { width: backup.width, height: backup.height },
    data: {
      id: backup.nodeId,
      assetId: "default",
      generationId: backup.generationId,
      generationIndex: backup.generationIndex,
      localSrc: backup.src,
      isGeneratingImage: false,
      title: backup.title,
      assetType: "AI 生成",
      tags: [backup.model, backup.ratio, "聊天备份找回"],
      imgW: backup.width,
      imgH: backup.height,
    },
  }), []);

  const createExtractedTextNode = useCallback((sourceNode: Node, text: string, placement?: { x: number; y: number }, styleHint?: string): Node => {
    const sourceSize = getCanvasNodeSize(sourceNode);
    const lines = text.split(/\r?\n/).filter(Boolean);
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const compactHint = (styleHint || "").toLowerCase();
    const fontSize = compactHint.includes("small") ? 22 : compactHint.includes("headline") ? 36 : 28;
    const width = Math.min(Math.max(280, longestLine * Math.max(14, fontSize * 0.72)), Math.max(360, sourceSize.width));
    const height = Math.max(120, Math.min(sourceSize.height, lines.length * Math.round(fontSize * 1.7) + 40));
    const nextPosition = placement || {
      x: sourceNode.position.x + sourceSize.width + 36,
      y: sourceNode.position.y,
    };
    const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      id,
      type: "text" as const,
      position: nextPosition,
      style: { width, minHeight: height },
      data: {
        id,
        text,
        fontFamily: "Inter",
        fontSize,
        fontWeight: compactHint.includes("bold") || compactHint.includes("headline") ? 600 : 400,
        color: isDark ? "#ffffff" : "#151522",
        textAlign: "left",
        lineHeight: 1.35,
        letterSpacing: 0,
        textDecoration: "none",
        textTransform: "none",
        strokeColor: "",
        strokeWidth: 0,
        width,
        height,
        isEditing: false,
      },
      selected: false,
    };
  }, [isDark]);

  const focusGeneratedImageNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));
    setSelectedNodeIds([nodeId]);
    requestAnimationFrame(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.28 });
    });
  }, [fitView, setNodes]);

  useEffect(() => {
    const handleWorkspaceUploadRequest = () => {
      uploadInputRef.current?.click();
    };
    window.addEventListener("workspace-upload-request", handleWorkspaceUploadRequest);
    return () => window.removeEventListener("workspace-upload-request", handleWorkspaceUploadRequest);
  }, []);

  // ── 创建画板工具：拖拽绘制矩形状态 ──
  type DrawRect = { startX: number; startY: number; endX: number; endY: number };
  const [drawingRect, setDrawingRect] = useState<DrawRect | null>(null);
  const [pendingRect, setPendingRect] = useState<DrawRect | null>(null); // 松开鼠标后待确认
  const [canvasInputW, setCanvasInputW] = useState("");
  const [canvasInputH, setCanvasInputH] = useState("");
  const [canvasNameInput, setCanvasNameInput] = useState("");
  const [canvasSocialPresetId, setCanvasSocialPresetId] = useState("");
  const [canvasBgColor, setCanvasBgColor] = useState("#2a2a30"); // 默认深灰色
  const [presetOpen, setPresetOpen] = useState(false); // 预设尺寸下拉展开状态
  const [socialPresetOpen, setSocialPresetOpen] = useState(false);
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

  // ── 钢笔工具绘制状态 ──
  // 正在绘制的钢笔路径节点 ID（null 表示未开始）
  const [penNodeId, setPenNodeId] = useState<string | null>(null);
  // 预览鼠标位置（用于显示待确认的连线）
  const [penCursorPos, setPenCursorPos] = useState<{ x: number; y: number } | null>(null);
  // 当前正在拖拽的手柄信息
  const penDragHandleRef = useRef<{ startX: number; startY: number; anchorIdx: number } | null>(null);

  // ── 铅笔工具绘制状态 ──
  // 正在绘制中的铅笔节点 ID
  const [freehandNodeId, setFreehandNodeId] = useState<string | null>(null);
  // 铅笔是否正在按下（拖拽中）
  const freehandActiveRef = useRef(false);
  // 铅笔路径起始屏幕坐标（用于 shift 直线模式）
  const freehandStartRef = useRef<{ x: number; y: number } | null>(null);
  // 铅笔节点的 flow 坐标起点（用于计算相对坐标）
  const freehandNodeOriginRef = useRef<{ x: number; y: number } | null>(null);
  // 铅笔参数：颜色和粗细（由工具栏子菜单广播）
  const drawParamsRef = useRef<{ color: string; width: number }>({ color: isDark ? "#c4b5fd" : "#4f46e5", width: 2 });

  // 监听铅笔参数变化
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ color: string; width: number }>).detail;
      if (detail?.color) drawParamsRef.current = { color: detail.color, width: detail.width };
    };
    window.addEventListener("draw-params", handler);
    return () => window.removeEventListener("draw-params", handler);
  }, [isDark]);

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
      // 切换离开钢笔模式时，如果正在绘制中则完成当前路径
      if (mode !== "pen") {
        setPenNodeId(null);
        setPenCursorPos(null);
        penDragHandleRef.current = null;
      }
      // 切换离开铅笔模式时结束绘制
      if (mode !== "draw") {
        freehandActiveRef.current = false;
        freehandStartRef.current = null;
        freehandNodeOriginRef.current = null;
        setFreehandNodeId(null);
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
  const [globalAnnotations, setGlobalAnnotations] = useState<GlobalAnnotation[]>([]);
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
    setAnnotationReferences(prev => prev.filter(reference => reference.id !== id));
  }, []);

  const getAnnotationReferenceFromId = useCallback((id: string, textOverride?: string): AnnotationReference | null => {
    const ann = globalAnnotations.find(item => item.id === id);
    if (!ann) return null;
    const node = nodesRef.current.find(item => item.id === ann.nodeId && item.type === "asset");
    if (!node) return null;
    const data = node.data as Record<string, unknown>;
    const asset = GENERATED_ASSETS.find(item => item.id === data.assetId) || GENERATED_ASSETS[0];
    const src = getAssetNodeImageSource(node);
    if (!src) return null;
    return {
      id: ann.id,
      nodeId: ann.nodeId,
      title: (data.title as string | undefined) || asset?.title || "选中图片",
      src,
      x: ann.x,
      y: ann.y,
      text: (typeof textOverride === "string" ? textOverride : ann.text).trim(),
    };
  }, [globalAnnotations]);

  const handleAnnotationAddReference = useCallback((id: string, text: string) => {
    const reference = getAnnotationReferenceFromId(id, text);
    if (!reference) {
      toast("注释引用失败", { description: "当前注释没有可用的图片来源" });
      return;
    }
    setAnnotationReferences(prev => {
      const next = prev.filter(item => item.id !== reference.id);
      return [...next, reference];
    });
    setIsAssistantCollapsed(false);
    toast("已加入注释引用", { description: reference.text || reference.title });
  }, [getAnnotationReferenceFromId]);

  const handleAnnotationAiEdit = useCallback(async (id: string, text: string) => {
    if (!requireAiAccess()) return;
    const reference = getAnnotationReferenceFromId(id, text);
    if (!reference) {
      toast("AI 修改失败", { description: "当前注释没有可用的图片来源" });
      return;
    }
    if (!reference.text.trim()) {
      toast("请先输入注释修改建议");
      return;
    }
    const sourceNode = nodesRef.current.find(item => item.id === reference.nodeId && item.type === "asset");
    if (!sourceNode) {
      toast("AI 修改失败", { description: "找不到对应图片节点" });
      return;
    }
    const latestImageSrc = getLatestAssetImageSource(reference.nodeId) || reference.src;
    const sourceSize = getCanvasNodeSize(sourceNode);
    const prompt = [
      "基于原图生成一张新的局部修改结果图。",
      `只重点修改注释点附近区域：x=${reference.x.toFixed(1)}%、y=${reference.y.toFixed(1)}%。`,
      "除该注释点相关区域外，尽量保持原图主体、构图、比例、风格、光影、颜色和其他未提及内容不变。",
      "不要覆盖或改变原始图片节点，输出完整新图。",
      `用户修改建议：${reference.text}`,
    ].join("\n");
    toast("注释 AI 修改中", { description: "将在原图旁生成新的修改结果" });
    await runDerivedImageGeneration({
      sourceNode,
      prompt,
      style: "注释修改结果",
      nextW: sourceSize.width,
      nextH: sourceSize.height,
      run: async () => editImageWithPrompt({
        imageSrc: latestImageSrc,
        model: "gpt-image-2",
        prompt,
        targetWidth: sourceSize.width,
        targetHeight: sourceSize.height,
      }),
    });
  }, [getAnnotationReferenceFromId, getLatestAssetImageSource, requireAiAccess, runDerivedImageGeneration]);

  const cloneNodesForHistory = useCallback((items: Node[]) => items.map(node => ({
    ...node,
    position: { ...node.position },
    style: node.style ? { ...node.style } : node.style,
    data: { ...(node.data as Record<string, unknown>) },
  })), []);

  const normalizeAssetNodeSize = useCallback((node: Node): Node => {
    if (node.type !== "asset") return node;
    const data = node.data as Record<string, unknown>;
    const imgW = data.imgW as number | undefined;
    const imgH = data.imgH as number | undefined;
    if (!(typeof imgW === "number" && imgW > 0 && typeof imgH === "number" && imgH > 0)) return node;
    return { ...node, style: { ...node.style, width: imgW, height: imgH } };
  }, []);

  const clearAssetCommandState = useCallback((data: Record<string, unknown>) => ({
    ...data,
    isCropping: false,
    isErasing: false,
    isExpanding: false,
    isEditing: false,
    isExtractingText: false,
    isApplyingExtractedText: false,
  }), []);

  const clearInactiveAssetCommands = useCallback((keepIds: string[] = []) => {
    const keep = new Set(keepIds);
    setNodes(nds => nds.map(n => {
      if (n.type !== "asset" || keep.has(n.id)) return n;
      const data = n.data as Record<string, unknown>;
      if (!data.isCropping && !data.isErasing && !data.isExpanding && !data.isEditing && !data.isExtractingText && !data.isApplyingExtractedText) return n;
      return { ...n, data: clearAssetCommandState(data) };
    }));
    setAssetMorePanel(current => current && keep.has(current.nodeId) ? current : null);
    setEditAsset(current => current && keep.has(current.nodeId) ? current : null);
  }, [clearAssetCommandState, setNodes]);

  useEffect(() => {
    if (!imageGeneratorModalOpen) return;
    setNodeCtxMenu(null);
    setShapeCtxMenu(null);
    setAssetMorePanel(null);
    setEditAsset(null);
    setPendingProject(null);
    setDownloadDialogOpen(false);
    setPendingRect(null);
    setDrawingRect(null);
    setPresetOpen(false);
    clearInactiveAssetCommands([]);
  }, [clearInactiveAssetCommands, imageGeneratorModalOpen]);

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

  useEffect(() => {
    const handler = (event: Event) => {
      const backup = (event as CustomEvent<NonNullable<CanvasAssistantMessage["imageBackup"]>>).detail;
      if (!backup?.nodeId || !backup.src) return;
      const existing = nodesRef.current.find(n => n.id === backup.nodeId);
      if (existing) {
        focusGeneratedImageNode(backup.nodeId);
        toast("已定位到画布中的图片", { description: backup.title });
        return;
      }
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 120, y: 80 };
      const position = resolveNonOverlappingCanvasPosition(
        nodesRef.current,
        { x: center.x - backup.width / 2, y: center.y - backup.height / 2 },
        { width: backup.width, height: backup.height },
      );
      pushHistory(nodesRef.current, edgesRef.current);
      setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), { ...createGeneratedImageNode(backup, position), selected: true }]);
      setSelectedNodeIds([backup.nodeId]);
      requestAnimationFrame(() => {
        fitView({ nodes: [{ id: backup.nodeId }], duration: 600, padding: 0.28 });
      });
      toast("已从聊天备份找回图片", { description: backup.title });
    };
    window.addEventListener("ai-image-backup-activate", handler);
    return () => window.removeEventListener("ai-image-backup-activate", handler);
  }, [createGeneratedImageNode, fitView, focusGeneratedImageNode, pushHistory, screenToFlowPosition, setNodes]);

  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent<ProductBackgroundDialogDetail>).detail;
      if (!detail?.imageSrc) return;
      if (!requireAiAccess()) return;
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 160, y: 120 };
      const ratioSize = getImageDisplaySizeForRatio(detail.ratio || "1:1");
      const displayW = detail.customWidth && detail.customHeight
        ? Math.min(560, Math.max(220, Math.round(detail.customWidth / 5)))
        : ratioSize.w;
      const displayH = detail.customWidth && detail.customHeight
        ? Math.min(560, Math.max(220, Math.round(detail.customHeight / 5)))
        : ratioSize.h;
      const sourceId = `product-bg-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const sourcePosition = resolveNonOverlappingCanvasPosition(
        nodesRef.current,
        { x: center.x - displayW / 2, y: center.y - displayH / 2 },
        { width: displayW, height: displayH },
      );
      const sourceNode: Node = {
        id: sourceId,
        type: "asset",
        position: sourcePosition,
        style: { width: displayW, height: displayH },
        selected: true,
        data: {
          id: sourceId,
          assetId: "default",
          localSrc: detail.imageSrc,
          title: detail.fileName || "产品图",
          assetType: "产品图",
          tags: ["智能创建背景", detail.style],
          imgW: displayW,
          imgH: displayH,
        },
      };
      pushHistory(nodesRef.current, edgesRef.current);
      setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), sourceNode]);
      setSelectedNodeIds([sourceId]);
      toast("智能创建背景中", { description: "已创建产品图节点，结果会在旁边生成" });
      await runDerivedImageGeneration({
        sourceNode,
        prompt: [
          detail.style ? `背景风格：${detail.style}` : "",
          detail.prompt || "智能创建商业化产品背景",
          `输出规格：${detail.customWidth && detail.customHeight ? `${detail.customWidth}x${detail.customHeight}` : `${detail.ratio} ${detail.resolution.toUpperCase()}`}`,
        ].filter(Boolean).join("\n"),
        style: "智能背景结果",
        nextW: detail.customWidth || ratioSize.w,
        nextH: detail.customHeight || ratioSize.h,
        preserveSourceDisplaySize: false,
        displayW,
        displayH,
        run: async () => createProductBackground({
          imageSrc: detail.imageSrc,
          prompt: detail.prompt,
          style: detail.style,
          ratio: detail.ratio,
          resolution: detail.resolution,
          customWidth: detail.customWidth,
          customHeight: detail.customHeight,
        }),
      });
    };
    window.addEventListener("product-background-create", handler);
    return () => window.removeEventListener("product-background-create", handler);
  }, [edgesRef, pushHistory, requireAiAccess, runDerivedImageGeneration, screenToFlowPosition, setNodes]);

  const undoCanvas = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) {
      toast("暂无可回退的画布操作");
      return;
    }
    // 屏蔽副作用，防止 undo 期间被事件监听器覆写状态
    isRestoringRef.current = true;
    setNodes(cloneNodesForHistory(previous.nodes).map(normalizeAssetNodeSize));
    setEdges(cloneEdgesForHistory(previous.edges));
    setSelectedNodeIds(previous.nodes.filter(n => n.selected).map(n => n.id));
    setNodeCtxMenu(null);
    // 如果当前工具是「创建画板」，保持工具不变，用户可直接继续拖拽
    // （activeToolMode 通过闭包读取，无需额外处理）
    // 用双帧 rAF 确保 ReactFlow 内部的所有 onNodesChange 均在屏蔽窗口内完成
    requestAnimationFrame(() => requestAnimationFrame(() => { isRestoringRef.current = false; }));
    toast("已回退一步", { description: `还可回退 ${historyRef.current.length} 步` });
  }, [cloneEdgesForHistory, cloneNodesForHistory, normalizeAssetNodeSize, setEdges, setNodes]);

  // ── 监听画布帧节点的拖拽调整尺寸事件 ──
  useEffect(() => {
    const handler = (e: Event) => {
      isAssetResizingRef.current = Boolean((e as CustomEvent<{ active: boolean }>).detail?.active);
    };
    window.addEventListener("asset-resize-active", handler);
    return () => window.removeEventListener("asset-resize-active", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; width: number; height: number }>).detail;
      if (!detail?.id || isRestoringRef.current) return;
      // 尺寸调整前先入历史（传入当前快照）
      pushHistory(nodesRef.current, edgesRef.current);
      setNodes(nds => {
        const frame = nds.find(n => n.id === detail.id && n.type === "canvasFrame");
        if (!frame) return nds;
        const previousSize = getCanvasNodeSize(frame);
        const scaleX = detail.width / Math.max(1, previousSize.width);
        const scaleY = detail.height / Math.max(1, previousSize.height);
        const normalizedFrame = normalizeCanvasFrameNode(frame);
        const normalizedData = normalizedFrame.data as Record<string, unknown>;
        const resizedFrame = {
          ...normalizedFrame,
          style: { ...normalizedFrame.style, width: detail.width, height: detail.height },
          data: { ...normalizedData, width: detail.width, height: detail.height },
        };
        return nds.map(n => {
          if (n.id === detail.id) return resizedFrame;
          const data = n.data as Record<string, unknown>;
          if (n.type === "asset" && data.embeddedInFrame === detail.id) {
            return fitEmbeddedAssetInsideFrame(n, frame, detail.width, detail.height, scaleX, scaleY);
          }
          return n;
        });
      });
    };
    window.addEventListener("canvas-frame-resize", handler);
    return () => window.removeEventListener("canvas-frame-resize", handler);
  }, [pushHistory, setNodes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; title: string }>).detail;
      const nextTitle = detail?.title?.trim();
      if (!detail?.id || !nextTitle || isRestoringRef.current) return;
      const target = nodesRef.current.find(n => n.id === detail.id && n.type === "canvasFrame");
      if (!target) return;
      const currentTitle = ((target.data as Record<string, unknown>).title as string | undefined) || "画板";
      if (currentTitle === nextTitle) return;
      pushHistory(nodesRef.current, edgesRef.current);
      setNodes(nds => nds.map(n => {
        if (n.id !== detail.id || n.type !== "canvasFrame") return n;
        return {
          ...n,
          data: {
            ...(n.data as Record<string, unknown>),
            title: nextTitle,
          },
        };
      }));
      toast("画板名称已更新", { description: nextTitle });
    };
    window.addEventListener("canvas-frame-title-change", handler);
    return () => window.removeEventListener("canvas-frame-title-change", handler);
  }, [pushHistory, setNodes]);

  // 监听图片节点缩放结束事件，将操作纳入历史记录
  useEffect(() => {
    const handler = (e: Event) => {
      if (isRestoringRef.current) return;
      const detail = (e as CustomEvent<{ nodeId: string; newW: number; newH: number; nextX?: number; nextY?: number; startNodeX?: number; startNodeY?: number; startW?: number; startH?: number }>).detail;
      if (!detail?.nodeId) return;
      // 屏蔽 handleNodesChangeWithHistory 的干扰，防止它在 setNodes 触发的 onNodesChange 中再次压入历史
      isRestoringRef.current = true;
      setNodes(nds => {
        // 在 updater 内保存操作前快照（nds 是 React 保证的当前真实状态）
        const historyNodes = nds.map(n =>
          n.id === detail.nodeId && typeof detail.startNodeX === "number" && typeof detail.startNodeY === "number" && typeof detail.startW === "number" && typeof detail.startH === "number"
            ? { ...n, position: { x: detail.startNodeX, y: detail.startNodeY }, style: { ...n.style, width: detail.startW, height: detail.startH }, data: { ...(n.data as Record<string, unknown>), imgW: detail.startW, imgH: detail.startH } }
            : n
        );
        pushHistory(historyNodes, edgesRef.current);
        return nds.map(n =>
          n.id === detail.nodeId
            ? { ...n, position: typeof detail.nextX === "number" && typeof detail.nextY === "number" ? { x: detail.nextX, y: detail.nextY } : n.position, style: { ...n.style, width: detail.newW, height: detail.newH }, data: { ...n.data, imgW: detail.newW, imgH: detail.newH } }
            : n
        );
      });
      // 双帧 rAF 后解除屏蔽，确保 ReactFlow 内部所有 onNodesChange 均在屏蔽窗口内完成
      requestAnimationFrame(() => requestAnimationFrame(() => { isRestoringRef.current = false; }));
    };
    window.addEventListener("asset-resize-end", handler);
    return () => window.removeEventListener("asset-resize-end", handler);
  }, [pushHistory, setNodes, edgesRef]);

  useEffect(() => {
    const commitHandler = (e: Event) => {
      if (isRestoringRef.current) return;
      const detail = (e as CustomEvent<{ nodeId: string; cropRect: { x: number; y: number; w: number; h: number }; startW: number; startH: number; sourceSrc?: string }>).detail;
      if (!detail?.nodeId) return;
      const fallbackW = Math.max(1, Math.round(detail.startW * (detail.cropRect.w / 100)));
      const fallbackH = Math.max(1, Math.round(detail.startH * (detail.cropRect.h / 100)));
      const applyCrop = (croppedSrc?: string, nextW = fallbackW, nextH = fallbackH) => {
        pushHistory(nodesRef.current, edgesRef.current);
        setNodes(nds => nds.map(n => {
          if (n.id !== detail.nodeId || n.type !== "asset") return n;
          const data = n.data as Record<string, unknown>;
          return {
            ...n,
            style: { ...n.style, width: nextW, height: nextH },
            data: {
              ...data,
              localSrc: croppedSrc || (data.localSrc as string | undefined),
              imgW: nextW,
              imgH: nextH,
              cropX: 0,
              cropY: 0,
              cropW: croppedSrc ? 100 : Number(data.cropW ?? 100),
              cropH: croppedSrc ? 100 : Number(data.cropH ?? 100),
              isCropping: false,
              isEditing: false,
            },
          };
        }));
        window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
        toast("已完成裁切", { description: `${nextW} × ${nextH}px` });
      };

      if (!detail.sourceSrc) {
        applyCrop();
        return;
      }

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const sx = Math.max(0, Math.round((detail.cropRect.x / 100) * image.naturalWidth));
        const sy = Math.max(0, Math.round((detail.cropRect.y / 100) * image.naturalHeight));
        const sw = Math.max(1, Math.round((detail.cropRect.w / 100) * image.naturalWidth));
        const sh = Math.max(1, Math.round((detail.cropRect.h / 100) * image.naturalHeight));
        const displayScale = Math.min(
          detail.startW / Math.max(1, image.naturalWidth),
          detail.startH / Math.max(1, image.naturalHeight)
        );
        const nextW = Math.max(1, Math.round(sw * displayScale));
        const nextH = Math.max(1, Math.round(sh * displayScale));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          applyCrop();
          return;
        }
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        try {
          applyCrop(canvas.toDataURL("image/png"), nextW, nextH);
        } catch {
          applyCrop(undefined, nextW, nextH);
        }
      };
      image.onerror = () => applyCrop(undefined, fallbackW, fallbackH);
      image.src = detail.sourceSrc;
    };
    const cancelHandler = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (!nodeId) return;
      setNodes(nds => nds.map(n => n.id === nodeId && n.type === "asset" ? { ...n, data: { ...(n.data as Record<string, unknown>), isCropping: false, isEditing: false } } : n));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    };
    window.addEventListener("asset-crop-commit", commitHandler);
    window.addEventListener("asset-crop-cancel", cancelHandler);
    return () => {
      window.removeEventListener("asset-crop-commit", commitHandler);
      window.removeEventListener("asset-crop-cancel", cancelHandler);
    };
  }, [edgesRef, pushHistory, setNodes]);

  useEffect(() => {
    const applyHandler = async (e: Event) => {
      if (isRestoringRef.current) return;
      const detail = (e as CustomEvent<{ nodeId: string; imageSrc: string; maskSrc: string }>).detail;
      if (!detail?.nodeId || !detail.imageSrc || !detail.maskSrc) return;
      const sourceNode = nodesRef.current.find(n => n.id === detail.nodeId && n.type === "asset");
      if (!sourceNode) return;
      setNodes(nds => nds.map(n => n.id === detail.nodeId && n.type === "asset"
        ? { ...n, data: { ...(n.data as Record<string, unknown>), isErasing: false, isCropping: false, isEditing: false } }
        : n));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      toast("AI 擦除中", { description: "正在移除涂抹区域并修复背景" });
      const sourceSize = getCanvasNodeSize(sourceNode);
      await runDerivedImageGeneration({
        sourceNode,
        prompt: "局部擦除",
        style: "橡皮工具结果",
        nextW: sourceSize.width,
        nextH: sourceSize.height,
        run: async () => eraseImageObjects({
          imageSrc: detail.imageSrc,
          maskSrc: detail.maskSrc,
          model: "gpt-image-2",
          targetWidth: sourceSize.width,
          targetHeight: sourceSize.height,
          prompt: "Remove only the objects or scene elements covered by the mask. Reconstruct the background naturally, keep lighting, texture, perspective, and surrounding details consistent, and preserve all unmasked areas.",
        }),
      });
    };
    const cancelHandler = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (!nodeId) return;
      setNodes(nds => nds.map(n => n.id === nodeId && n.type === "asset" ? { ...n, data: { ...(n.data as Record<string, unknown>), isErasing: false } } : n));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    };
    window.addEventListener("asset-erase-apply", applyHandler);
    window.addEventListener("asset-erase-cancel", cancelHandler);
    return () => {
      window.removeEventListener("asset-erase-apply", applyHandler);
      window.removeEventListener("asset-erase-cancel", cancelHandler);
    };
  }, [runDerivedImageGeneration, setNodes]);

  useEffect(() => {
    const applyHandler = async (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId: string; imageSrc: string; maskSrc: string; nextW: number; nextH: number }>).detail;
      if (!detail?.nodeId || !detail.imageSrc || !detail.maskSrc) return;
      const sourceNode = nodesRef.current.find(n => n.id === detail.nodeId && n.type === "asset");
      if (!sourceNode) return;
      setNodes(nds => nds.map(n => n.id === detail.nodeId && n.type === "asset"
        ? { ...n, data: { ...(n.data as Record<string, unknown>), isExpanding: false, isCropping: false, isEditing: false } }
        : n));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      toast("AI 扩展中", { description: "正在根据新边界自然延展画面" });
      await runDerivedImageGeneration({
        sourceNode,
        prompt: "图片扩展",
        style: "扩展结果",
        nextW: detail.nextW,
        nextH: detail.nextH,
        preserveSourceDisplaySize: false,
        displayW: detail.nextW,
        displayH: detail.nextH,
        run: async () => expandImageWithMask({
          imageSrc: detail.imageSrc,
          maskSrc: detail.maskSrc,
          model: "gpt-image-2",
          targetWidth: detail.nextW,
          targetHeight: detail.nextH,
          prompt: "Outpaint only the blank transparent extension area outside the original image. Preserve the original unmasked image pixels exactly. Generate new surrounding scene content that naturally continues the background, floor, wall, light, shadows, colors, texture, perspective, and edge details. Do not enlarge, duplicate, mirror, repeat, or redraw the original subject/person/object. Do not paste a scaled copy of the original image into the extension. The extension must look like new matching environment around the original image, not a zoomed or repeated version of the original.",
        }),
      });
    };
    const cancelHandler = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId;
      if (!nodeId) return;
      setNodes(nds => nds.map(n => n.id === nodeId && n.type === "asset" ? { ...n, data: { ...(n.data as Record<string, unknown>), isExpanding: false } } : n));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    };
    window.addEventListener("asset-expand-apply", applyHandler);
    window.addEventListener("asset-expand-cancel", cancelHandler);
    return () => {
      window.removeEventListener("asset-expand-apply", applyHandler);
      window.removeEventListener("asset-expand-cancel", cancelHandler);
    };
  }, [runDerivedImageGeneration, setNodes]);

  useEffect(() => {
    const applyHandler = async (e: Event) => {
      const detail = (e as CustomEvent<{
        nodeId: string;
        imageSrc: string;
        originalText: string;
        editedText: string;
        panelScreenRect?: { left: number; top: number; right: number; bottom: number };
      }>).detail;
      if (!detail?.nodeId || !detail.imageSrc || !detail.editedText.trim()) return;
      const sourceNode = nodesRef.current.find(n => n.id === detail.nodeId && n.type === "asset");
      if (!sourceNode) return;
      const sourceSize = getCanvasNodeSize(sourceNode);
      const textPanelPlacement = detail.panelScreenRect
        ? screenToFlowPosition({
            x: detail.panelScreenRect.right + 12,
            y: detail.panelScreenRect.top,
          })
        : undefined;
      try {
        const fallbackPrompt = `将图片中的文案替换为：${detail.editedText}`;
        await runDerivedImageGeneration({
          sourceNode,
          prompt: fallbackPrompt,
          style: "文案编辑结果",
          nextW: sourceSize.width,
          nextH: sourceSize.height,
          placement: textPanelPlacement,
          run: async () => {
            const optimizedPrompt = await callLLM({
              module: "image-text-relayout",
              model: "gpt-4o",
              images: [{ src: detail.imageSrc, title: "原始图片" }],
              prompt: [
                "请根据原始图片，生成一段给图片模型使用的中文编辑提示词。",
                "目标：把图片中原有的文案替换成用户编辑后的文案，并同步微调排版。",
                "流程背景：原始文案已通过 OCR/多模态识别提取，用户已在编辑窗口中完成修改。",
                "要求：输出必须是一张新的结果图，不能影响原图。",
                "要求：新图画布比例必须与原图完全一致，不允许变成方图、不允许拉伸或改变构图比例。",
                "要求：尽量保留原始画面主体、风格、色彩、背景、构图和品牌识别特征。",
                "要求：优先定位并清除原文案所在区域，只修改文字区域和为了新文案适配所必须发生的细微版式调整。",
                "要求：不要改动人物、产品、背景、Logo、非文字装饰元素和整体构图。",
                "要求：新文案必须准确可读，不允许乱码，不允许替换成无关文字。",
                "要求：如果新文案更长或更短，自动优化字号、行距、字重、留白、对齐和文字区块位置，让画面自然、专业、无明显修补痕迹。",
                "要求：保持商业设计输出品质，文字层级、视觉重心、品牌感和排版节奏都要像真实设计稿。",
                "只输出可直接给图片模型使用的提示词，不要解释。",
                `原图文案：${detail.originalText || "未识别到可读文案"}`,
                `替换后的新文案：${detail.editedText}`,
              ].join("\n"),
            });
            const finalPrompt = optimizedPrompt.text.trim() || fallbackPrompt;
            return editImageWithPrompt({
              imageSrc: detail.imageSrc,
              prompt: finalPrompt,
              model: "gpt-image-2",
              targetWidth: sourceSize.width,
              targetHeight: sourceSize.height,
            });
          },
        });
        setNodes(nds => nds.map(n =>
          n.id === detail.nodeId && n.type === "asset"
            ? {
                ...n,
                data: {
                  ...(n.data as Record<string, unknown>),
                  extractedTextPanelOpen: true,
                  isApplyingExtractedText: false,
                  extractedText: detail.editedText,
                },
              }
            : n
        ));
        toast("文案已应用到新图", { description: "AI 已在原图旁生成新的排版结果图" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "请稍后重试";
        setNodes(nds => nds.map(n =>
          n.id === detail.nodeId && n.type === "asset"
            ? {
                ...n,
                data: {
                  ...(n.data as Record<string, unknown>),
                  extractedTextPanelOpen: true,
                  isApplyingExtractedText: false,
                },
              }
            : n
        ));
        toast("文案应用失败", { description: message });
      }
    };
    window.addEventListener("asset-text-edit-apply", applyHandler);
    return () => window.removeEventListener("asset-text-edit-apply", applyHandler);
  }, [runDerivedImageGeneration, screenToFlowPosition, setNodes]);

  // ── 几何形参数面板（全局渲染，紧贴节点选框右侧 +6px） ──
  const [shapeCtxMenu, setShapeCtxMenu] = useState<{
    nodeId: string;
    fill: string; stroke: string; strokeWidth: number; opacity: number;
    menuFill: string; menuStroke: string; menuStrokeW: string; menuOpacity: string;
  } | null>(null);

  // 监听 ShapeNodeComponent 派发的 shape-ctx-open 事件
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ nodeId: string; fill: string; stroke: string; strokeWidth: number; opacity: number }>).detail;
      if (!d?.nodeId) return;
      setShapeCtxMenu({
        nodeId: d.nodeId,
        fill: d.fill, stroke: d.stroke, strokeWidth: d.strokeWidth, opacity: d.opacity,
        menuFill: d.fill,
        menuStroke: d.stroke,
        menuStrokeW: String(d.strokeWidth),
        menuOpacity: String(Math.round(d.opacity * 100)),
      });
    };
    window.addEventListener("shape-ctx-open", handler);
    return () => window.removeEventListener("shape-ctx-open", handler);
  }, []);

  // 监听几何形锚点拖拽后的包围盒偏移，更新节点 position 使选框始终包裹图形
  useEffect(() => {
    const handler = (e: Event) => {
      if (isRestoringRef.current) return;
      const detail = (e as CustomEvent<{ nodeId: string; dx: number; dy: number; newW: number; newH: number; anchors: {x:number;y:number}[] }>).detail;
      if (!detail?.nodeId) return;
      isRestoringRef.current = true;
      setNodes(nds => {
        pushHistory(nds, edgesRef.current);
        return nds.map(n => {
          if (n.id !== detail.nodeId) return n;
          // 将节点 position 向 offset 方向偏移，保持图形在画布中的绝对位置不变
          const vp = getViewport();
          const offsetXFlow = detail.dx / vp.zoom;
          const offsetYFlow = detail.dy / vp.zoom;
          return {
            ...n,
            position: { x: n.position.x + offsetXFlow, y: n.position.y + offsetYFlow },
            style: { ...n.style, width: detail.newW, height: detail.newH },
            data: { ...n.data, width: detail.newW, height: detail.newH, anchors: detail.anchors, _anchorOffset: undefined },
          };
        });
      });
      requestAnimationFrame(() => requestAnimationFrame(() => { isRestoringRef.current = false; }));
    };
    window.addEventListener("shape-anchor-offset", handler);
    return () => window.removeEventListener("shape-anchor-offset", handler);
  }, [pushHistory, setNodes, edgesRef, getViewport]);

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
          const { width: nodeWidth, height: nodeHeight } = getImportedImageDisplaySize(img.naturalWidth, img.naturalHeight);
          setNodes(nds => [...nds, {
            id,
            type: "asset",
            position: { x: flowPos.x - nodeWidth / 2, y: flowPos.y - nodeHeight / 2 },
            style: { width: nodeWidth, height: nodeHeight },
            data: {
              id,
              assetId: "default",
              localSrc: dataUrl,
              title: file.name.replace(/\.[^.]+$/, ""),
              assetType: "图片",
              tags: DEFAULT_ASSET_TAGS,
              imgW: nodeWidth,
              imgH: nodeHeight,
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
    const effectiveChanges = isAssetResizingRef.current
      ? changes.filter(change => change.type !== "dimensions")
      : changes;
    if (effectiveChanges.length === 0) return;
    const isOnlyAssetSizeSync = effectiveChanges.every(change => change.type === "dimensions");
    if (isOnlyAssetSizeSync) {
      onNodesChange(effectiveChanges);
      return;
    }
    // undo 恢复过程中不入历史，防止 undo 被 onNodesChange 立即覆写
    if (!isRestoringRef.current && !isAssetResizingRef.current) {
      const hasNonDragChange = effectiveChanges.some(change =>
        change.type !== "select" &&
        !(change.type === "position" && isDraggingRef.current)
      );
      if (hasNonDragChange) pushHistory();
    }
    onNodesChange(effectiveChanges);
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
      clearInactiveAssetCommands(actionIds);
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
  }, [areNodesGrouped, clearInactiveAssetCommands, selectedNodeIds, setNodes]);

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
      const selectedFrameNodes = nodes.filter(n => actionIds.includes(n.id) && n.type === "canvasFrame");
      if (selectedAssetNodes.length === 0) {
        if (selectedFrameNodes.length > 0) {
          toast("画布下载即将上线", { description: "当前画布节点已接入图片同款命令入口，导出画布内容会后续接入" });
          return;
        }
        toast("没有可下载的图片节点");
        return;
      }
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
      setNodes(nds => {
        const topZ = Math.max(0, ...nds.map(n => typeof n.zIndex === "number" ? n.zIndex : 0)) + 1;
        const actionIdSet = new Set(actionIds);
        const updated = nds.map(n => actionIdSet.has(n.id) ? {
          ...n,
          zIndex: topZ,
          data: { ...(n.data as Record<string, unknown>), note: ((n.data as Record<string, unknown>).note as string) || "", noteOpen: true, noteEditing: true }
        } : n);
        return [
          ...updated.filter(n => !actionIdSet.has(n.id)),
          ...updated.filter(n => actionIdSet.has(n.id)),
        ];
      });
      toast("已打开文本备注", { description: "备注框已显示在图片节点下方" });
    } else if (action === "edit-asset") {
      const node = getLatestAssetNode(nodeId) || nodes.find(n => n.id === nodeId);
      if (node && node.type === "asset") {
        const nodeData = node.data as Record<string, unknown>;
        const assetId = nodeData.assetId as string;
        const nodeTitle = (nodeData.title as string) || "图片";
        const asset = GENERATED_ASSETS.find(a => a.id === assetId) || GENERATED_ASSETS[0];
        const src = getAssetNodeImageSource(node);
        const title = nodeTitle || asset?.title || "图片";
        setSelectedNodeIds([]);
        setNodes(nds => nds.map(item => ({ ...item, selected: false })));
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
  }, [nodes, clipboard, getActionNodeIds, getLatestAssetNode, pushHistory, setNodes, setEdges]);

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

  useEffect(() => {
    const handleImageGenerate = (event: Event) => {
      const detail = (event as CustomEvent<ImageGeneratorPayload>).detail;
      if (!detail?.prompt?.trim()) return;
      persistImageGenerationTask(detail, projectId);
      if (detail.projectId && detail.projectId !== projectId) return;
      const generationId = detail.generationId || `image-gen-${Date.now()}`;
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 120, y: 80 };
      const size = detail.displaySize || getImageDisplaySizeForRatio(detail.ratio);
      const anchor = detail.placement || {
        x: center.x - size.w / 2,
        y: center.y - size.h / 2,
      };
      if (detail.status === "pending") {
        const generationStartedAt = detail.generationStartedAt || getTimestampFromGenerationId(generationId) || Date.now();
        ensureBackgroundImageGeneration({ ...detail, projectId, generationId, status: "pending", generationStartedAt });
        setNodes(nds => {
          pushHistory(nds, edgesRef.current);
          const placedNodes: Node[] = [];
          const placeholderNodes = Array.from({ length: Math.max(1, detail.count || 1) }, (_, index) => {
            const id = `generated-${generationId}-${index}`;
            const desired = {
              x: anchor.x + index * (size.w + 24),
              y: anchor.y,
            };
            const position = resolveNonOverlappingCanvasPosition(
              [...nds, ...placedNodes],
              desired,
              { width: size.w, height: size.h },
            );
            const placeholderNode = {
              id,
              type: "asset" as const,
              position,
              style: { width: size.w, height: size.h },
              data: {
                id,
                assetId: "default",
                generationId,
                generationStartedAt,
                generationIndex: index,
                isGeneratingImage: true,
                title: `正在全力生成中${detail.count > 1 ? ` ${index + 1}` : ""}`,
                assetType: "AI 生成",
                tags: [detail.model, detail.ratio, "生成中", detail.referencesEnabled ? "参考画布" : "无参考"],
                imgW: size.w,
                imgH: size.h,
                sourceBackgroundSrc: detail.sourceBackgroundSrc,
              },
            };
            placedNodes.push(placeholderNode);
            return placeholderNode;
          });
          return [...nds, ...placeholderNodes];
        });
        toast("正在生成图像", { description: detail.prompt.slice(0, 58) });
        window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
        return;
      }

      if (detail.status === "failed") {
        setNodes(nds => nds.map(n => {
          const data = n.data as Record<string, unknown>;
          if (data.generationId !== generationId) return n;
          if (data.isGeneratingImage !== true || typeof data.localSrc === "string") return n;
          return {
            ...n,
            data: {
              ...data,
              isGeneratingImage: false,
              isGenerationFailed: true,
              processingTitle: AI_GENERATION_NETWORK_ERROR_MESSAGE,
              processingSubtitle: "",
              title: AI_GENERATION_NETWORK_ERROR_MESSAGE,
              sourceBackgroundSrc: undefined,
            },
          };
        }));
        markImageGenerationTaskConsumed(projectId, generationId);
        return;
      }

      const images = detail.images?.length
        ? detail.images
        : [GENERATED_ASSETS[Math.abs(detail.prompt.length + detail.count) % GENERATED_ASSETS.length]].map(asset => ({
            src: asset.src,
            width: asset.width,
            height: asset.height,
          }));
      const backupItems = images.map((image, index) => ({
        nodeId: `generated-${generationId}-${index}`,
        generationId,
        generationIndex: index,
        src: image.src,
        width: size.w,
        height: size.h,
        title: `生成图像 · ${detail.style}${images.length > 1 ? ` ${index + 1}` : ""}`,
        prompt: detail.prompt,
        model: detail.model,
        ratio: detail.ratio,
        style: detail.style,
      }));
      setNodes(nds => {
        const existingPlaceholders = nds.filter(n => (n.data as Record<string, unknown>)?.generationId === generationId);
        if (existingPlaceholders.length > 0) {
          return nds.map(n => {
            const data = n.data as Record<string, unknown>;
            if (data.generationId !== generationId) return n;
            const index = typeof data.generationIndex === "number" ? data.generationIndex : 0;
            const image = images[index] || images[0];
            if (!image) return n;
            return {
              ...n,
              data: {
                ...data,
                localSrc: image.src,
                isGeneratingImage: false,
                isGenerationFailed: false,
                title: detail.titleBase ? `${detail.titleBase}${images.length > 1 ? ` ${index + 1}` : ""}` : `生成图像 · ${detail.style}${images.length > 1 ? ` ${index + 1}` : ""}`,
                assetType: "AI 生成",
                tags: [detail.model, detail.ratio, `${images.length}张`, detail.referencesEnabled ? "参考画布" : "无参考"],
                imgW: size.w,
                imgH: size.h,
                sourceBackgroundSrc: undefined,
              },
            };
          });
        }
        pushHistory(nds, edgesRef.current);
        const placedNodes: Node[] = [];
        const generatedNodes = images.map((image, index) => {
          const id = `generated-${generationId}-${index}`;
          const desired = {
            x: anchor.x + index * (size.w + 24),
            y: anchor.y,
          };
          const position = resolveNonOverlappingCanvasPosition(
            [...nds, ...placedNodes],
            desired,
            { width: size.w, height: size.h },
          );
          const generatedNode = {
            id,
            type: "asset" as const,
            position,
            data: {
              id,
              assetId: "default",
              generationId,
              generationIndex: index,
              localSrc: image.src,
              isGeneratingImage: false,
              isGenerationFailed: false,
              title: detail.titleBase ? `${detail.titleBase}${images.length > 1 ? ` ${index + 1}` : ""}` : `生成图像 · ${detail.style}${images.length > 1 ? ` ${index + 1}` : ""}`,
              assetType: "AI 生成",
              tags: [detail.model, detail.ratio, `${images.length}张`, detail.referencesEnabled ? "参考画布" : "无参考"],
              imgW: size.w,
              imgH: size.h,
              sourceBackgroundSrc: undefined,
            },
          };
          placedNodes.push(generatedNode);
          return generatedNode;
        });
        return [...nds, ...generatedNodes];
      });
      backupItems.forEach(item => {
        window.dispatchEvent(new CustomEvent("ai-image-generated-backup", { detail: item }));
      });
      markImageGenerationTaskConsumed(projectId, generationId);
      toast("图像已生成到画布", { description: detail.prompt.slice(0, 58) });
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    };
    window.addEventListener("image-generator-submit", handleImageGenerate);
    return () => window.removeEventListener("image-generator-submit", handleImageGenerate);
  }, [edgesRef, ensureBackgroundImageGeneration, projectId, pushHistory, screenToFlowPosition, setNodes]);

  useEffect(() => {
    if (typeof window === "undefined" || !didHydrateCanvasStateRef.current || isRestoringRef.current) return;
    let cancelled = false;
    readPendingImageGenerationTasks(projectId).forEach(task => {
      ensureBackgroundImageGeneration(task);
    });
    consumeCompletedImageGenerationTasks(projectId).then(completedTasks => {
      if (cancelled || completedTasks.length === 0) return;
      completedTasks.forEach(task => {
        window.dispatchEvent(new CustomEvent("image-generator-submit", {
          detail: {
            ...task,
            projectId,
            status: "completed",
          },
        }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [canvasRestoreTick, ensureBackgroundImageGeneration, projectId]);

  const failTimedOutImageGenerationNodes = useCallback(() => {
    const now = Date.now();
    let timedOutGenerationIds: string[] = [];
    setNodes(nds => {
      let changed = false;
      const nextNodes = nds.map(node => {
        if (node.type !== "asset") return node;
        const data = node.data as Record<string, unknown>;
        if (data.isGeneratingImage !== true || data.isGenerationFailed === true) return node;
        if (!isImageGenerationTimedOut({
          generationId: typeof data.generationId === "string" ? data.generationId : undefined,
          generationStartedAt: data.generationStartedAt,
        }, now)) {
          return node;
        }
        changed = true;
        if (typeof data.generationId === "string") timedOutGenerationIds.push(data.generationId);
        return {
          ...node,
          data: {
            ...data,
            isGeneratingImage: false,
            isGenerationFailed: true,
            processingTitle: AI_GENERATION_NETWORK_ERROR_MESSAGE,
            processingSubtitle: "",
            title: AI_GENERATION_NETWORK_ERROR_MESSAGE,
            sourceBackgroundSrc: undefined,
          },
        };
      });
      return changed ? nextNodes : nds;
    });
    timedOutGenerationIds = Array.from(new Set(timedOutGenerationIds));
    timedOutGenerationIds.forEach(generationId => {
      dispatchImageGenerationTask({
        projectId,
        generationId,
        prompt: AI_GENERATION_NETWORK_ERROR_MESSAGE,
        model: "timeout",
        ratio: "1:1",
        count: 1,
        style: "超时失败",
        referencesEnabled: false,
        status: "failed",
        error: AI_GENERATION_NETWORK_ERROR_MESSAGE,
      }, projectId);
    });
  }, [projectId, setNodes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    failTimedOutImageGenerationNodes();
    const interval = window.setInterval(failTimedOutImageGenerationNodes, 5000);
    return () => window.clearInterval(interval);
  }, [failTimedOutImageGenerationNodes]);

  const handleProjectSaveAndNavigate = useCallback(() => {
    if (!pendingProject) return;
    toast("当前项目已保存", { description: "正在跳转到目标项目" });
    navigate(`/project/${pendingProject.id}`);
    setPendingProject(null);
  }, [navigate, pendingProject]);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const nextSelectedIds = selectedNodes.map(n => n.id);
    clearInactiveAssetCommands(nextSelectedIds);
    const selectedVisualIds = new Set(
      selectedNodes
        .filter(shouldSelectToFront)
        .map(node => node.id)
    );
    if (selectedVisualIds.size > 0) {
      setNodes(nds => {
        const selectedVisualNodes = nds.filter(node => selectedVisualIds.has(node.id));
        if (selectedVisualNodes.length === 0) return nds;
        const topZ = nextCanvasTopZ(nds);
        const raisedVisualNodes = selectedVisualNodes.map(node => ({ ...node, zIndex: topZ }));
        const selectedVisualOrder = selectedVisualNodes.map(node => node.id).join(",");
        const currentTopOrder = nds.slice(-selectedVisualNodes.length).map(node => node.id).join(",");
        if (selectedVisualOrder === currentTopOrder && selectedVisualNodes.every(node => (node.zIndex || 0) >= topZ - 1)) return nds;
        return [
          ...nds.filter(node => !selectedVisualIds.has(node.id)),
          ...raisedVisualNodes,
        ];
      });
    }
    setSelectedNodeIds(nextSelectedIds);
  }, [clearInactiveAssetCommands, setNodes]);

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
  // Called on every mousemove frame (incremental delta) — no history push to avoid spam
  const handleGroupContainerDragMove = useCallback((groupId: string, deltaDx: number, deltaDy: number) => {
    if (deltaDx === 0 && deltaDy === 0) return;
    setNodes(nds => nds.map(n => {
      const gid = (n.data as Record<string, unknown>).groupId as string | undefined;
      if (gid !== groupId) return n;
      return { ...n, position: { x: n.position.x + deltaDx / viewport.zoom, y: n.position.y + deltaDy / viewport.zoom } };
    }));
  }, [setNodes, viewport.zoom]);

  // Called once on mouseup — push history for undo support
  const handleGroupContainerDragEnd = useCallback((groupId: string, _dx: number, _dy: number) => {
    // Position already updated by DragMove; just push history snapshot
    pushHistory();
    void groupId; void _dx; void _dy;
  }, [pushHistory]);

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
    // 创建画板模式：点击不触发 paneClick 的其他逻辑
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
    // 文字工具：点击画布创建文字节点，创建后自动切换回移动工具
    if (activeToolMode === "text") {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `text-${Date.now()}`;
      const newNode = {
        id,
        type: "text" as const,
        position: { x: flowPos.x - 160, y: flowPos.y - 30 },
        data: {
          id,
          text: "",
          fontFamily: "Inter",
          fontSize: 32,
          fontWeight: 400,
          color: isDark ? "#ffffff" : "#1a1a2e",
          textAlign: "left",
          lineHeight: 1.4,
          letterSpacing: 0,
          textDecoration: "none",
          textTransform: "none",
          strokeColor: "",
          strokeWidth: 0,
          width: 320,
          height: 80,
          isEditing: true,
        },
      };
      pushHistory();
      setNodes(nds => {
        const topZ = nextCanvasTopZ(nds);
        return [
          ...nds.map(n => ({ ...n, selected: false })),
          { ...newNode, selected: true, zIndex: topZ },
        ];
      });
      setSelectedNodeIds([id]);
      // 创建完成后自动切换回移动工具
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    }
  }, [activeToolMode, editAsset, enteringGroupId, setNodes, screenToFlowPosition, isDark, pushHistory]);

  // ── 铅笔工具：鼠标事件处理 ──
  // 按下开始记录路径，拖拽收集点，松开完成节点
  const handleFreehandMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeToolMode !== "draw") return;
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    // 将屏幕坐标转为 flow 坐标作为节点起点
    const flowOrigin = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const nid = `freehand-${Date.now()}`;
    freehandActiveRef.current = true;
    freehandStartRef.current = { x: screenX, y: screenY };
    freehandNodeOriginRef.current = flowOrigin;
    setNodes(nds => {
      pushHistory(nds, edgesRef.current);
      const topZ = nextCanvasTopZ(nds);
      return [...nds.map(n => ({ ...n, selected: false })), {
        id: nid,
        type: "freehand",
        position: flowOrigin,
        style: { width: 1, height: 1 },
        selected: true,
        zIndex: topZ,
        data: {
          id: nid,
          width: 1, height: 1,
          points: [{ x: 0, y: 0 }],
          stroke: drawParamsRef.current.color,
          strokeWidth: drawParamsRef.current.width,
          opacity: 1,
        },
      }];
    });
    setFreehandNodeId(nid);
    setSelectedNodeIds([nid]);
  }, [activeToolMode, edgesRef, pushHistory, screenToFlowPosition, setNodes]);

  const handleFreehandMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeToolMode !== "draw" || !freehandActiveRef.current || !freehandNodeId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const origin = freehandNodeOriginRef.current;
    if (!origin) return;
    const isShift = e.shiftKey;
    const start = freehandStartRef.current;

    setNodes(nds => nds.map(n => {
      if (n.id !== freehandNodeId) return n;
      const existingPoints = (n.data.points as { x: number; y: number }[]) || [];
      let newPoint: { x: number; y: number };
      if (isShift && start) {
        // Shift 模式：计算从起始点到当前点的直线，将终点对齐到最近的 45° 角度
        const dx = screenX - start.x;
        const dy = screenY - start.y;
        const angle = Math.atan2(dy, dx);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const snappedX = start.x + Math.cos(snapAngle) * dist;
        const snappedY = start.y + Math.sin(snapAngle) * dist;
        // 转换为 flow 坐标相对节点起点的偏移
        const flowSnapped = screenToFlowPosition({ x: snappedX + rect.left, y: snappedY + rect.top });
        newPoint = { x: flowSnapped.x - origin.x, y: flowSnapped.y - origin.y };
        // Shift 模式只保留起始点和当前点（实现直线预览）
        return { ...n, data: { ...n.data, points: [{ x: 0, y: 0 }, newPoint] } };
      } else {
        // 自由模式：每隔一定距离采样一个点（过滤过于密集的点）
        const flowCurrent = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        newPoint = { x: flowCurrent.x - origin.x, y: flowCurrent.y - origin.y };
        const last = existingPoints[existingPoints.length - 1];
        const distSq = last ? (newPoint.x - last.x) ** 2 + (newPoint.y - last.y) ** 2 : Infinity;
        // 至少相隔 2px（flow 坐标）才采样
        if (distSq < 4 / (viewport.zoom * viewport.zoom)) return n;
        return { ...n, data: { ...n.data, points: [...existingPoints, newPoint] } };
      }
    }));
  }, [activeToolMode, freehandNodeId, screenToFlowPosition, setNodes, viewport.zoom]);

  const handleFreehandMouseUp = useCallback(() => {
    if (!freehandActiveRef.current) return;
    freehandActiveRef.current = false;
    freehandStartRef.current = null;
    const origin = freehandNodeOriginRef.current;
    freehandNodeOriginRef.current = null;
    const nid = freehandNodeId;
    setFreehandNodeId(null);

    // 完成时计算路径包围盒，更新节点 position + style.width/height
    // 这样 ReactFlow 才能正确显示选中框并支持拖拽移动
    if (nid && origin) {
      setNodes(nds => nds.map(n => {
        if (n.id !== nid) return n;
        const pts = (n.data.points as { x: number; y: number }[]) || [];
        if (pts.length < 2) return n;
        const minX = Math.min(...pts.map(p => p.x));
        const minY = Math.min(...pts.map(p => p.y));
        const maxX = Math.max(...pts.map(p => p.x));
        const maxY = Math.max(...pts.map(p => p.y));
        const pad = (n.data.strokeWidth as number || 2) + 4; // 描边外边距
        const bx = minX - pad; const by = minY - pad;
        const bw = Math.max(maxX - minX + pad * 2, 1);
        const bh = Math.max(maxY - minY + pad * 2, 1);
        // 将点坐标相对于新包围盒左上角进行偏移
        const shiftedPts = pts.map(p => ({ x: p.x - bx, y: p.y - by }));
        return {
          ...n,
          selected: true,
          position: { x: origin.x + bx, y: origin.y + by },
          style: { ...n.style, width: bw, height: bh },
          data: { ...n.data, points: shiftedPts, width: bw, height: bh },
        };
      }));
      setSelectedNodeIds([nid]);
    }

    // 完成后切回移动工具
    window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
    // 广播工具栏同步
    window.dispatchEvent(new CustomEvent("freehand-done"));
  }, [freehandNodeId, setNodes]);

  // ── 钢笔工具：鼠标事件处理 ──
  // 单击添加锚点，拖拽创建手柄，双击关闭路径，Enter/Esc 完成
  const handlePenMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeToolMode !== "pen") return;
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX;
    const screenY = e.clientY;
    const flowPos = screenToFlowPosition({ x: screenX, y: screenY });
    const isAlt = e.altKey;

    if (!penNodeId) {
      // 开始新路径：创建钢笔节点
      const nid = `pen-${Date.now()}`;
      const newAnchor: PenAnchor = { x: 0, y: 0, type: isAlt ? "corner" : "smooth", inDx: 0, inDy: 0, outDx: 0, outDy: 0 };
      setNodes(nds => {
        pushHistory(nds, edgesRef.current);
        const topZ = nextCanvasTopZ(nds);
        return [...nds.map(n => ({ ...n, selected: false })), {
          id: nid,
          type: "pen",
          position: flowPos,
          style: { width: 1, height: 1 },
          selected: true,
          zIndex: topZ,
          data: { id: nid, width: 1, height: 1, anchors: [newAnchor], closed: false, anchorEditMode: true, stroke: "#6366f1", strokeWidth: 2, fill: "none", opacity: 1 },
        }];
      });
      setPenNodeId(nid);
      setSelectedNodeIds([nid]);
      // 记录拖拽手柄起始信息
      penDragHandleRef.current = { startX: screenX, startY: screenY, anchorIdx: 0 };
    } else {
      // 已有路径：添加新锚点
      setNodes(nds => nds.map(n => {
        if (n.id !== penNodeId) return n;
        const existingAnchors = (n.data.anchors as PenAnchor[]) || [];
        // 检查是否点击了第一个锚点（关闭路径）
        if (existingAnchors.length > 1) {
          const firstAnchor = existingAnchors[0];
          // 简化判断：直接用 flow 坐标计算距离
          const nodePos = n.position;
          const firstAbsX = (nodePos.x + firstAnchor.x) * viewport.zoom + viewport.x;
          const firstAbsY = (nodePos.y + firstAnchor.y) * viewport.zoom + viewport.y;
          const dist = Math.sqrt((e.clientX - (rect.left + firstAbsX)) ** 2 + (e.clientY - (rect.top + firstAbsY)) ** 2);
          if (dist < 12) {
            // 关闭路径
            const updated = { ...n, data: { ...n.data, closed: true, anchorEditMode: true } };
            setPenNodeId(null);
            setPenCursorPos(null);
            return updated;
          }
        }
        const newAnchor: PenAnchor = {
          x: flowPos.x - n.position.x,
          y: flowPos.y - n.position.y,
          type: isAlt ? "corner" : "smooth",
          inDx: 0, inDy: 0, outDx: 0, outDy: 0,
        };
        const newAnchors = [...existingAnchors, newAnchor];
        penDragHandleRef.current = { startX: screenX, startY: screenY, anchorIdx: newAnchors.length - 1 };
        return { ...n, data: { ...n.data, anchors: newAnchors } };
      }));
    }
  }, [activeToolMode, edgesRef, penNodeId, pushHistory, screenToFlowPosition, setNodes, viewport]);

  const handlePenMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeToolMode !== "pen") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPenCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    // 拖拽手柄
    if (penDragHandleRef.current) {
      const { startX, startY, anchorIdx } = penDragHandleRef.current;
      const dx = (e.clientX - startX) / viewport.zoom;
      const dy = (e.clientY - startY) / viewport.zoom;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // 过滤微小移动
      setNodes(nds => nds.map(n => {
        if (n.id !== penNodeId) return n;
        const anchors = [...((n.data.anchors as PenAnchor[]) || [])];
        if (anchorIdx >= anchors.length) return n;
        const a = anchors[anchorIdx];
        anchors[anchorIdx] = { ...a, outDx: dx, outDy: dy, inDx: -dx, inDy: -dy };
        return { ...n, data: { ...n.data, anchors } };
      }));
    }
  }, [activeToolMode, penNodeId, setNodes, viewport.zoom]);

  const handlePenMouseUp = useCallback(() => {
    penDragHandleRef.current = null;
  }, []);

  // 钢笔工具快捷键：Enter/Esc 完成路径
  useEffect(() => {
    if (activeToolMode !== "pen") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        setPenNodeId(null);
        setPenCursorPos(null);
        penDragHandleRef.current = null;
        // 切换回移动工具
        window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeToolMode]);

  // ── 创建画板：鼠标事件处理 ──
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
        const topZ = nextCanvasTopZ(nds);
        return [...nds.map(n => ({ ...n, selected: false })), {
          id: nodeId,
          type: "shape",
          position: flowPos,
          style: { width: fw, height: fh },
          selected: true,
          zIndex: topZ,
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
      setSelectedNodeIds([nodeId]);
      return;
    }

    // 创建画板：显示弹窗
    setPendingRect(dr);
    setCanvasInputW(String(Math.round(rawW / viewport.zoom)));
    setCanvasInputH(String(Math.round(rawH / viewport.zoom)));
  }, [activeToolMode, edgesRef, pushHistory, screenToFlowPosition, setNodes, shapeFill, shapeOpacity, shapeStroke, shapeStrokeW, shapeCornerRadius, viewport.zoom]);

  const handleCreateCanvasConfirm = useCallback(() => {
    if (!pendingRect) return;
    const w = parseInt(canvasInputW) || 800;
    const h = parseInt(canvasInputH) || 600;
    const selectedSocialPreset = SOCIAL_MEDIA_SIZE_PRESETS.find(preset => preset.id === canvasSocialPresetId);
    const title = canvasNameInput.trim() || (selectedSocialPreset ? `${selectedSocialPreset.platform} ${selectedSocialPreset.title}` : "画板");
    const minX = Math.min(pendingRect.startX, pendingRect.endX);
    const minY = Math.min(pendingRect.startY, pendingRect.endY);
    // 将屏幕坐标转换为 flow 坐标
    const flowPos = screenToFlowPosition({ x: (containerRef.current?.getBoundingClientRect().left || 0) + minX, y: (containerRef.current?.getBoundingClientRect().top || 0) + minY });
    const id = `canvas-frame-${Date.now()}`;
    const originalBgColor = canvasBgColor;
    const bgColor = withCanvasFrameAlpha(originalBgColor);
    setNodes(nds => {
      // 在 updater 内调用，传入 prev 快照，确保记录的是添加节点前的真实状态
      pushHistory(nds, edgesRef.current);
      return [...nds, {
        id,
        type: "canvasFrame",
        position: flowPos,
        style: { width: w, height: h, background: bgColor },
        data: { id, title, width: w, height: h, bgColor, originalBgColor, socialPresetId: selectedSocialPreset?.id },
      }];
    });
    setPendingRect(null);
    setCanvasInputW("");
    setCanvasInputH("");
    setCanvasNameInput("");
    setCanvasSocialPresetId("");
    // 保持当前工具为「创建画板」，用户可继续拖拽创建新画板
    toast("画板已创建，可继续拖拽创建", { description: `${title} · ${w} × ${h} px` });
  }, [canvasBgColor, canvasInputH, canvasInputW, canvasNameInput, canvasSocialPresetId, pendingRect, pushHistory, screenToFlowPosition, setNodes]);

  const handleCreateCanvasCancel = useCallback(() => {
    setPendingRect(null);
    setCanvasInputW("");
    setCanvasInputH("");
    setCanvasNameInput("");
    setCanvasSocialPresetId("");
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
      const topZ = nextCanvasTopZ(nds);
      return [...nds.map(n => ({ ...n, selected: false })), {
        id,
        type: "shape",
        position: flowPos,
        style: { width: w, height: h },
        selected: true,
        zIndex: topZ,
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
    setSelectedNodeIds([id]);
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

  const createDroppedImageSourceNode = useCallback((src: string, index: number, origin: { x: number; y: number }) => new Promise<Node>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const id = `external-image-${Date.now()}-${index}`;
      const { width: nodeWidth, height: nodeHeight } = getImportedImageDisplaySize(img.naturalWidth || img.width, img.naturalHeight || img.height);
      resolve({
        id,
        type: "asset",
        selected: true,
        position: {
          x: origin.x - nodeWidth / 2 + index * 32,
          y: origin.y - nodeHeight / 2 + index * 32,
        },
        style: { width: nodeWidth, height: nodeHeight },
        data: {
          id,
          assetId: "default",
          localSrc: src,
          title: `拖入图片 ${index + 1}`,
          assetType: "图片",
          tags: DEFAULT_ASSET_TAGS,
          imgW: nodeWidth,
          imgH: nodeHeight,
        },
      });
    };
    img.onerror = () => reject(new Error("外部图片链接加载失败"));
    img.src = src;
  }), []);

  const addDroppedImageSources = useCallback(async (sources: string[], origin: { x: number; y: number }) => {
    const uniqueSources = Array.from(new Set(sources.map(normalizeDroppedImageUrl).filter(Boolean)));
    if (uniqueSources.length === 0) return false;
    try {
      const droppedNodes = await Promise.all(uniqueSources.map((src, index) => createDroppedImageSourceNode(src, index, origin)));
      if (droppedNodes.length === 0) return false;
      pushHistory();
      setNodes(nds => [...nds.map(node => ({ ...node, selected: false })), ...droppedNodes]);
      setSelectedNodeIds(droppedNodes.map(node => node.id));
      toast(`已拖入 ${droppedNodes.length} 张图片`, { description: "外部网页图片已添加到画布" });
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "请确认该网站允许图片跨站加载，或先复制图片后粘贴";
      toast("拖入图片失败", { description: message });
      return false;
    }
  }, [createDroppedImageSourceNode, pushHistory, setNodes]);

  // ── Local/external image drag-drop handlers ──
  const handleCanvasDragEnter = useCallback((e: React.DragEvent) => {
    if (!dataTransferHasExternalImage(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (!dataTransferHasExternalImage(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    if (!dataTransferHasExternalImage(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
      setDragPos(null);
    }
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    if (!dataTransferHasExternalImage(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setDragPos(null);
    const rect = containerRef.current?.getBoundingClientRect();
    const baseX = e.clientX - (rect?.left || 0);
    const baseY = e.clientY - (rect?.top || 0);
    const origin = screenToFlowPosition({ x: (rect?.left || 0) + baseX, y: (rect?.top || 0) + baseY });
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) {
      const sources = extractImageSourcesFromDataTransfer(e.dataTransfer);
      if (sources.length > 0) {
        void addDroppedImageSources(sources, origin);
        return;
      }
      toast("请拖入图片文件或网页图片", { description: "支持 JPG、PNG、GIF、WebP 文件，也支持从网页直接拖入图片" });
      return;
    }
    pushHistory();
    const pendingIds = files.map((_, index) => `local-${Date.now()}-${index}`);
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        const img = new window.Image();
        img.onload = () => {
          const dropPos = screenToFlowPosition({ x: (rect?.left || 0) + baseX + index * 32, y: (rect?.top || 0) + baseY + index * 32 });
          const id = pendingIds[index];
          const { width: nodeWidth, height: nodeHeight } = getImportedImageDisplaySize(img.naturalWidth, img.naturalHeight);
          const nextNode: Node = {
            id,
            type: "asset",
            selected: true,
            position: { x: dropPos.x - nodeWidth / 2, y: dropPos.y - nodeHeight / 2 },
            style: { width: nodeWidth, height: nodeHeight },
            data: {
              id,
              assetId: "default",
              localSrc: dataUrl,
              title: file.name.replace(/\.[^.]+$/, ""),
              assetType: "图片",
              tags: DEFAULT_ASSET_TAGS,
              imgW: nodeWidth,
              imgH: nodeHeight,
            },
          };
          setNodes(nds => [...nds.map(node => ({ ...node, selected: false })), nextNode]);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    setSelectedNodeIds(pendingIds);
    toast(`已导入 ${files.length} 张图片`, { description: "本地图片已成功添加到画布" });
  }, [addDroppedImageSources, pushHistory, screenToFlowPosition, setNodes]);

  const createClipboardImageNode = useCallback((blob: Blob, index: number, origin: { x: number; y: number }) => new Promise<Node>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("剪贴板图片读取失败"));
    reader.onload = event => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        reject(new Error("剪贴板图片为空"));
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        const id = `clipboard-image-${Date.now()}-${index}`;
        const { width: nodeWidth, height: nodeHeight } = getImportedImageDisplaySize(img.naturalWidth, img.naturalHeight);
        resolve({
          id,
          type: "asset",
          position: {
            x: origin.x - nodeWidth / 2 + index * 32,
            y: origin.y - nodeHeight / 2 + index * 32,
          },
          style: { width: nodeWidth, height: nodeHeight },
          data: {
            id,
            assetId: "default",
            localSrc: dataUrl,
            title: `粘贴图片 ${index + 1}`,
            assetType: "图片",
            tags: DEFAULT_ASSET_TAGS,
            imgW: nodeWidth,
            imgH: nodeHeight,
          },
        });
      };
      img.onerror = () => reject(new Error("剪贴板图片加载失败"));
      img.src = dataUrl;
    };
    reader.readAsDataURL(blob);
  }), []);

  const createClipboardImageSourceNode = useCallback((src: string, index: number, origin: { x: number; y: number }) => new Promise<Node>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const id = `clipboard-image-${Date.now()}-${index}`;
      const { width: nodeWidth, height: nodeHeight } = getImportedImageDisplaySize(img.naturalWidth || img.width, img.naturalHeight || img.height);
      resolve({
        id,
        type: "asset",
        position: {
          x: origin.x - nodeWidth / 2 + index * 32,
          y: origin.y - nodeHeight / 2 + index * 32,
        },
        style: { width: nodeWidth, height: nodeHeight },
        data: {
          id,
          assetId: "default",
          localSrc: src,
          title: `粘贴图片 ${index + 1}`,
          assetType: "图片",
          tags: DEFAULT_ASSET_TAGS,
          imgW: nodeWidth,
          imgH: nodeHeight,
        },
      });
    };
    img.onerror = () => reject(new Error("剪贴板图片链接加载失败"));
    img.src = src;
  }), []);

  const pasteClipboardImages = useCallback(async (blobs: Blob[]) => {
    if (blobs.length === 0) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    const origin = screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
    });
    try {
      const nodesToPaste = await Promise.all(blobs.map((blob, index) => createClipboardImageNode(blob, index, origin)));
      if (nodesToPaste.length === 0) return false;
      pushHistory();
      setNodes(nds => nds.map(node => ({ ...node, selected: false })).concat(nodesToPaste.map(node => ({ ...node, selected: true }))));
      setSelectedNodeIds(nodesToPaste.map(node => node.id));
      toast(`已粘贴 ${nodesToPaste.length} 张图片`, { description: "剪贴板图片已添加到画布" });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "请重新复制图片后再试";
      toast("粘贴图片失败", { description: message });
      return false;
    }
  }, [createClipboardImageNode, pushHistory, screenToFlowPosition, setNodes]);

  const pasteClipboardImageSources = useCallback(async (sources: string[]) => {
    const uniqueSources = Array.from(new Set(sources.map(src => src.trim()).filter(Boolean)));
    if (uniqueSources.length === 0) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    const origin = screenToFlowPosition({
      x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
      y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
    });
    try {
      const nodesToPaste = await Promise.all(uniqueSources.map((src, index) => createClipboardImageSourceNode(src, index, origin)));
      if (nodesToPaste.length === 0) return false;
      pushHistory();
      setNodes(nds => nds.map(node => ({ ...node, selected: false })).concat(nodesToPaste.map(node => ({ ...node, selected: true }))));
      setSelectedNodeIds(nodesToPaste.map(node => node.id));
      toast(`已粘贴 ${nodesToPaste.length} 张图片`, { description: "浏览器复制的图片已添加到画布" });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "请重新复制图片后再试";
      toast("粘贴图片失败", { description: message });
      return false;
    }
  }, [createClipboardImageSourceNode, pushHistory, screenToFlowPosition, setNodes]);

  const pasteClipboardPayload = useCallback(async (clipboardData: DataTransfer | null | undefined) => {
    const items = Array.from(clipboardData?.items || []);
    const imageBlobs = items
      .filter(item => item.kind === "file" && item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (imageBlobs.length > 0) {
      return pasteClipboardImages(imageBlobs);
    }

    const html = clipboardData?.getData("text/html") || "";
    const plain = clipboardData?.getData("text/plain") || "";
    const sources: string[] = [];
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      sources.push(...Array.from(doc.querySelectorAll("img")).map(img => img.src).filter(Boolean));
    }
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(plain.trim())) {
      sources.push(plain.trim());
    }
    return pasteClipboardImageSources(sources);
  }, [pasteClipboardImages, pasteClipboardImageSources]);

  const pasteClipboardFromNavigator = useCallback(async () => {
    if (!navigator.clipboard?.read) return false;
    try {
      const items = await navigator.clipboard.read();
      const imageBlobs: Blob[] = [];
      const sources: string[] = [];
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith("image/"));
        if (imageType) {
          imageBlobs.push(await item.getType(imageType));
          continue;
        }
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          sources.push(...Array.from(doc.querySelectorAll("img")).map(img => img.src).filter(Boolean));
        }
        if (item.types.includes("text/plain")) {
          const plain = (await (await item.getType("text/plain")).text()).trim();
          if (/^(data:image\/|blob:|https?:\/\/)/i.test(plain)) sources.push(plain);
        }
      }
      if (imageBlobs.length > 0) return pasteClipboardImages(imageBlobs);
      return pasteClipboardImageSources(sources);
    } catch {
      return false;
    }
  }, [pasteClipboardImages, pasteClipboardImageSources]);

  // ── 获取节点的图片源 (localSrc 优先，其次 GENERATED_ASSETS) ──
  const getNodeImageSrc = useCallback((node: Node): string => {
    const data = node.data as Record<string, unknown>;
    if (data.localSrc) return data.localSrc as string;
    const assetId = data.assetId as string;
    const asset = GENERATED_ASSETS.find(a => a.id === assetId);
    return asset?.src || "";
  }, []);

  const sanitizeDownloadName = useCallback((value: string) => value.replace(/[/\\:*?"<>|]/g, "_").trim() || "artx-image", []);

  const imageSrcToFormatBlob = useCallback((src: string, format: "jpg" | "png" | "webp") => new Promise<Blob | null>((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const mimeType = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width || 800;
        canvas.height = image.naturalHeight || image.height || 600;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        if (format === "jpg") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(image, 0, 0);
        canvas.toBlob(blob => resolve(blob), mimeType, format === "jpg" ? 0.92 : undefined);
      } catch {
        fetch(src).then(response => response.blob()).then(blob => resolve(blob)).catch(() => resolve(null));
      }
    };
    image.onerror = () => {
      fetch(src).then(response => response.blob()).then(blob => resolve(blob)).catch(() => resolve(null));
    };
    image.src = src;
  }), []);

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

        const blob = await imageSrcToFormatBlob(src, format);

        if (blob) {
          // 清洁文件名，去除非法字符
          const safeName = sanitizeDownloadName(title);
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
  }, [getNodeImageSrc, imageSrcToFormatBlob, sanitizeDownloadName]);

  // ── Alt + drag 复制节点 ──
  // 拖拽开始时：若按下 Alt，记录被拖节点的原始位置
  const handleAltDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    // 拖拽开始：记录历史
    pushHistory();
    isDraggingRef.current = true;
    dragStartPositionRef.current = new Map(
      nodesRef.current.map(item => [item.id, { x: item.position.x, y: item.position.y }])
    );

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
  }, [nodes, nodesRef, pushHistory, selectedNodeIds, setNodes]);

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

  // ── 普通拖拽结束：检测图片是否进入画布帧并嵌入/脱离 ──
  const handleNormalDragStop = useCallback((_event: MouseEvent, node: Node) => {
    isDraggingRef.current = false;
    // 从最新的 nodesRef 中读取当前所有节点
    const allNodes = nodesRef.current;
    const draggedNode = allNodes.find(n => n.id === node.id);
    if (!draggedNode) return;
    if (draggedNode.type === "canvasFrame") {
      const dragStart = dragStartPositionRef.current.get(draggedNode.id);
      if (!dragStart) return;
      const dx = draggedNode.position.x - dragStart.x;
      const dy = draggedNode.position.y - dragStart.y;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
      setNodes(nds => nds.map(n => {
        if (n.type !== "asset") return n;
        const data = n.data as Record<string, unknown>;
        if (data.embeddedInFrame !== draggedNode.id) return n;
        const start = dragStartPositionRef.current.get(n.id);
        return {
          ...n,
          position: start
            ? { x: start.x + dx, y: start.y + dy }
            : { x: n.position.x + dx, y: n.position.y + dy },
        };
      }));
      return;
    }
    if (draggedNode.type !== "asset") return;
    const frame = checkAndEmbedIntoFrame(draggedNode, allNodes);
    const currentFrameId = (draggedNode.data as Record<string, unknown>).embeddedInFrame as string | undefined;
    if (!frame && !currentFrameId) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== node.id) return n;
      const data = n.data as Record<string, unknown>;
      if (!frame) {
        return {
          ...n,
          data: { ...data, embeddedInFrame: undefined, frameClipInsets: undefined },
          parentId: undefined,
          extent: undefined,
        };
      }
      return {
        ...n,
        data: { ...data, embeddedInFrame: frame.id },
        zIndex: (frame.zIndex || 0) + 1,
        parentId: undefined,
        extent: undefined,
      };
    }));
    if (frame && frame.id !== currentFrameId) {
      toast("图片已放入画板", { description: "图片可在画板内自由移动" });
    } else if (!frame && currentFrameId) {
      toast("图片已脱离画板", { description: "图片恢复为自由节点" });
    }
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
      const title = ((node.data as Record<string, unknown>).title as string) || nodeId;
      const size = getCanvasNodeSize(node);
      return { id: nodeId, title, src: getAssetNodeImageSource(node), width: size.width, height: size.height };
    }).filter(Boolean) as ImageGeneratorReferenceAsset[];
    setReferencedAssets(refs);
  }, [selectedNodeIds, nodes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { selectedIds?: string[] };
      if (Array.isArray(detail.selectedIds)) {
        clearInactiveAssetCommands(detail.selectedIds);
        setSelectedNodeIds(detail.selectedIds);
      }
    };
    window.addEventListener("asset-click-selection", handler);
    return () => window.removeEventListener("asset-click-selection", handler);
  }, [clearInactiveAssetCommands]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string; additive?: boolean }>).detail;
      if (!detail?.nodeId) return;
      const additive = Boolean(detail.additive);
      setNodes(nds => {
        const target = nds.find(node => node.id === detail.nodeId && (shouldSelectToFront(node) || node.type === "canvasFrame"));
        if (!target) return nds;
        const selectedIds = new Set(additive ? nds.filter(node => node.selected).map(node => node.id) : []);
        selectedIds.add(target.id);
        const shouldRaise = shouldSelectToFront(target);
        const topZ = shouldRaise ? nextCanvasTopZ(nds) : undefined;
        setSelectedNodeIds(Array.from(selectedIds));
        const nextNodes = nds.map(node => {
          const selected = selectedIds.has(node.id);
          if (node.id !== target.id) return { ...node, selected };
          return { ...target, selected: true, ...(shouldRaise ? { zIndex: topZ } : {}) };
        });
        if (!shouldRaise) return nextNodes;
        return [
          ...nextNodes.filter(node => node.id !== target.id),
          nextNodes.find(node => node.id === target.id)!,
        ];
      });
    };
    window.addEventListener("visual-node-select-to-front", handler);
    return () => window.removeEventListener("visual-node-select-to-front", handler);
  }, [setNodes]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping) return;
      pasteEventSeenAtRef.current = Date.now();
      event.preventDefault();
      void pasteClipboardPayload(event.clipboardData).then(pasted => {
        if (!pasted) {
          void pasteClipboardFromNavigator().then(fallbackPasted => {
            if (!fallbackPasted) toast("未读取到可粘贴图片", { description: "请在浏览器中复制图片本身，或复制图片地址后再粘贴" });
          });
        }
      });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping) return;
      // 支持复制/删除/粘贴的节点类型
      const deletableTypes = ["asset", "shape", "freehand", "pen", "canvasFrame", "text"];
      const selectedDeletableIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && deletableTypes.includes(n.type ?? "")));
      if ((e.key === "Delete" || e.key === "Backspace") && selectedDeletableIds.length > 0) {
        e.preventDefault();
        pushHistory();
        setNodes(nds => nds.filter(n => !selectedDeletableIds.includes(n.id)));
        setEdges(eds => eds.filter(e => !selectedDeletableIds.includes(e.source) && !selectedDeletableIds.includes(e.target)));
        const assetCount = selectedDeletableIds.filter(id => nodes.some(n => n.id === id && n.type === "asset")).length;
        const otherCount = selectedDeletableIds.length - assetCount;
        const desc = assetCount > 0 && otherCount > 0
          ? `已删除 ${assetCount} 个图片、${otherCount} 个图形元素`
          : assetCount > 0 ? `已删除 ${assetCount} 个图片节点` : `已删除 ${otherCount} 个图形元素`;
        toast("已删除", { description: desc });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoCanvas();
        return;
      }
      // 全选图片与画板：Ctrl+A (Windows) / Cmd+A (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        const selectableIds = nodes
          .filter(n => n.type === "asset" || n.type === "canvasFrame")
          .map(n => n.id);
        if (selectableIds.length > 0) {
          e.preventDefault();
          const selectableSet = new Set(selectableIds);
          setNodes(nds => nds.map(n => ({ ...n, selected: selectableSet.has(n.id) })));
          setSelectedNodeIds(selectableIds);
          const assetCount = nodes.filter(n => n.type === "asset").length;
          const frameCount = nodes.filter(n => n.type === "canvasFrame").length;
          toast(`已选中 ${selectableIds.length} 个对象`, {
            description: `图片 ${assetCount} 个，画板 ${frameCount} 个`,
          });
        }
        return;
      }
      // 复制：Ctrl+C (Windows) / Cmd+C (Mac) — 支持所有节点类型
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const toCopy = selectedNodeIds
          .map(id => nodes.find(n => n.id === id && deletableTypes.includes(n.type ?? "")))
          .filter(Boolean) as Node[];
        if (toCopy.length > 0) {
          e.preventDefault();
          setClipboard(toCopy);
          const isMac = navigator.platform.toUpperCase().includes("MAC") || navigator.userAgent.includes("Mac");
          toast(`已复制 ${toCopy.length} 个元素`, {
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
          toast(`已粘贴 ${pasted.length} 个元素`, { description: "新节点已选中，可直接拖动定位" });
        } else {
          const requestedAt = Date.now();
          window.setTimeout(() => {
            if (pasteEventSeenAtRef.current >= requestedAt) return;
            void pasteClipboardFromNavigator().then(pasted => {
              if (!pasted) toast("未读取到可粘贴图片", { description: "请在浏览器中复制图片本身，或复制图片地址后再粘贴" });
            });
          }, 120);
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
    window.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [nodes, clipboard, setClipboard, pasteClipboardFromNavigator, pasteClipboardPayload, pushHistory, selectedNodeIds, setEdges, setNodes, undoCanvas]);

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
  const selectedVisualNodeIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && (n.type === "asset" || n.type === "canvasFrame")));
  const multiImageSelectionActive = selectedImageNodeIds.length > 1;
  const multiVisualSelectionActive = selectedVisualNodeIds.length > 1;

  // 文字节点选中状态
  const selectedTextNodeIds = selectedNodeIds.filter(id => nodes.some(n => n.id === id && n.type === "text"));
  const selectedTextNode = selectedTextNodeIds.length === 1 ? nodes.find(n => n.id === selectedTextNodeIds[0]) : null;
  const selectedTextBounds = selectedTextNode ? getCanvasNodesBounds(nodes, [selectedTextNode.id]) : null;
  const textToolbarPosition = selectedTextBounds
    ? {
        left: selectedTextBounds.centerX * viewport.zoom + viewport.x,
        top: (selectedTextBounds.bottom * viewport.zoom + viewport.y) + 16,
      }
    : { left: 0, top: 0 };
  const handleTextNodeUpdate = useCallback((patch: Record<string, unknown>) => {
    if (!selectedTextNode) return;
    setNodes(nds => nds.map(n => n.id === selectedTextNode.id ? { ...n, data: { ...n.data, ...patch } } : n));
  }, [selectedTextNode, setNodes]);
  const handleTextNodeDownload = useCallback(() => {
    if (!selectedTextNode) return;
    const nodeData = selectedTextNode.data as Record<string, unknown>;
    const text = (nodeData.text as string) || "";
    const fontFamily = (nodeData.fontFamily as string) || "Inter";
    const fontSize = (nodeData.fontSize as number) || 32;
    const fontWeight = (nodeData.fontWeight as number) || 400;
    const color = (nodeData.color as string) || "#ffffff";
    const textAlign = (nodeData.textAlign as string) || "left";
    const lineHeight = (nodeData.lineHeight as number) || 1.4;
    const letterSpacing = (nodeData.letterSpacing as number) || 0;
    const textDecoration = (nodeData.textDecoration as string) || "none";
    const textTransform = (nodeData.textTransform as string) || "none";
    const nodeWidth = (nodeData.width as number) || 320;
    const nodeHeight = (nodeData.height as number) || 80;
    const padding = 12;
    const canvasW = nodeWidth + padding * 2;
    const canvasH = nodeHeight + padding * 2;
    // 创建离屏 Canvas 用于 PNG 导出
    const offscreen = document.createElement("canvas");
    offscreen.width = canvasW * 2; offscreen.height = canvasH * 2;
    const ctx2d = offscreen.getContext("2d");
    if (!ctx2d) { toast("导出失败"); return; }
    ctx2d.scale(2, 2);
    ctx2d.clearRect(0, 0, canvasW, canvasH);
    ctx2d.font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
    ctx2d.fillStyle = color;
    ctx2d.textBaseline = "top";
    const lines = text.split("\n");
    const lh = fontSize * lineHeight;
    lines.forEach((line, i) => {
      let x = padding;
      if (textAlign === "center") x = canvasW / 2;
      else if (textAlign === "right") x = canvasW - padding;
      ctx2d.textAlign = textAlign as CanvasTextAlign;
      if (letterSpacing !== 0) {
        let cx = x;
        for (const ch of line) {
          ctx2d.fillText(ch, cx, padding + i * lh);
          cx += ctx2d.measureText(ch).width + letterSpacing * fontSize;
        }
      } else {
        ctx2d.fillText(line, x, padding + i * lh);
      }
      if (textDecoration === "underline") {
        const tw = ctx2d.measureText(line).width;
        const ux = textAlign === "center" ? x - tw/2 : textAlign === "right" ? x - tw : x;
        ctx2d.fillRect(ux, padding + i * lh + fontSize + 2, tw, 1);
      }
    });
    // PNG 下载
    offscreen.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `artx-text-${Date.now()}.png`;
      a.click(); URL.revokeObjectURL(url);
    }, "image/png");
    // SVG 下载
    const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svgLines = lines.map((line, i) => {
      const y = padding + i * (fontSize * lineHeight) + fontSize;
      const x = textAlign === "center" ? canvasW/2 : textAlign === "right" ? canvasW - padding : padding;
      const anchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
      const dec = textDecoration !== "none" ? ` text-decoration="${textDecoration}"` : "";
      const transform2 = textTransform === "uppercase" ? line.toUpperCase() : textTransform === "lowercase" ? line.toLowerCase() : textTransform === "capitalize" ? line.replace(/(^|\s)\S/g, c => c.toUpperCase()) : line;
      return `<text x="${x}" y="${y}" font-family="${fontFamily}, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${letterSpacing * fontSize}"${dec}>${transform2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`;
    }).join("\n");
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">${svgLines}</svg>`;
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const b = document.createElement("a");
    b.href = svgUrl; b.download = `artx-text-${Date.now()}.svg`;
    b.click(); URL.revokeObjectURL(svgUrl);
    toast("已下载 PNG 和 SVG", { description: "文字已导出为两种格式" });
  }, [selectedTextNode]);
  const handleAssetEditSubmit = useCallback(async (payload: { prompt: string; model: string; references: Array<{ id: string; title: string; src: string }> }) => {
    if (!editAsset) return;
    if (!requireAiAccess()) return;
    const sourceNode = nodesRef.current.find(n => n.id === editAsset.nodeId && n.type === "asset");
    if (!sourceNode) return;
    const latestImageSrc = getLatestAssetImageSource(editAsset.nodeId) || editAsset.src;
    try {
      const sourceSize = getCanvasNodeSize(sourceNode);
      const optimizedPrompt = await callLLM({
        module: "image-quick-edit-prompt",
        model: "gpt-4o",
        images: [{ src: latestImageSrc, title: editAsset.title }, ...payload.references],
        prompt: [
          "请理解主图和可选参考图，为图片模型生成一段中文生图提示词。",
          "目标是基于原图内容做快捷编辑，但输出必须是一张新的结果图。",
          "保留原图主体、构图和关键识别特征，只根据用户要求修改。",
          "只输出可直接给图片模型使用的提示词，不要解释。",
          `用户要求：${payload.prompt || "请智能优化这张图片，保持主体识别一致。"}`,
        ].join("\n"),
      });
      await runDerivedImageGeneration({
        sourceNode,
        prompt: optimizedPrompt.text.trim() || payload.prompt || `基于原图优化：${editAsset.title}`,
        style: "快捷编辑结果",
        nextW: sourceSize.width,
        nextH: sourceSize.height,
        run: async () => generateAiImages({
          prompt: optimizedPrompt.text.trim() || payload.prompt || `基于原图优化：${editAsset.title}`,
          model: "gpt-image-2",
          ratio: inferImageRatio(sourceSize.width, sourceSize.height),
          count: 1,
          style: "快捷编辑",
          referencesEnabled: payload.references.length > 0,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请稍后重试";
      toast("快捷编辑失败", { description: message });
    }
  }, [editAsset, getLatestAssetImageSource, nodesRef, requireAiAccess, runDerivedImageGeneration]);
  const handleSingleImageToolbarAction = useCallback(async (action: string) => {
    const nodeId = selectedVisualNodeIds[0];
    if (!nodeId) return;
    const aiToolbarActions = new Set(["quick-edit", "upscale", "remove-background", "remove-watermark", "erase", "edit-text", "edit-elements", "expand", "vector"]);
    if (aiToolbarActions.has(action) && !requireAiAccess()) return;
    setNodes(nds => nds.map(n => n.id === nodeId && n.type === "asset" ? { ...n, data: clearAssetCommandState(n.data as Record<string, unknown>) } : n));
    clearInactiveAssetCommands([nodeId]);
    const targetNode = nodesRef.current.find(n => n.id === nodeId && (n.type === "asset" || n.type === "canvasFrame"));
    const isCanvasFrame = targetNode?.type === "canvasFrame";
    if (isCanvasFrame) {
      if (["quick-edit", "edit-elements", "edit-text", "multi-angle", "move-object"].includes(action)) {
        toast("画布命令", { description: "画布节点已复用图片节点命令框架，可拖动、缩放、复制、删除与调整层级" });
        return;
      }
      if (["upscale", "remove-background", "remove-watermark", "erase"].includes(action)) {
        toast("画布节点暂不支持该 AI 图片处理", { description: "请选择具体图片节点后使用此命令" });
        return;
      }
    }
    if (action === "quick-edit") {
      handleNodeAction("edit-asset", nodeId);
      return;
    }
    if (action === "upscale") {
      if (!targetNode || targetNode.type !== "asset") return;
      const imageSrc = getLatestAssetImageSource(nodeId);
      if (!imageSrc) {
        toast("高清化失败", { description: "当前图片没有可处理的图像来源" });
        return;
      }
      const sourceSize = getCanvasNodeSize(targetNode);
      toast("HD 高清化中", { description: "正在生成 4K 高清图片，新图会出现在原图旁边" });
      await runDerivedImageGeneration({
        sourceNode: targetNode,
        prompt: "HD 高清化 4K",
        style: "HD 高清结果",
        nextW: sourceSize.width,
        nextH: sourceSize.height,
        run: async () => {
          try {
            return await enhanceImageToHd({
              imageSrc,
              level: "4k",
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const shouldFallbackToImageEdit = /Cannot POST|non-JSON|网页内容|404|not found|未正确连接/i.test(message);
            if (!shouldFallbackToImageEdit) throw error;
            return editImageWithPrompt({
              imageSrc,
              model: "gpt-image-2",
              prompt: [
                "Enhance this image to a crisp 4K-quality result.",
                "Preserve the original composition, aspect ratio, subject identity, colors, layout, and all visible content.",
                "Do not add new objects, do not crop, do not change the design. Improve clarity, edge detail, texture fidelity, and perceived resolution only.",
              ].join("\n"),
              targetWidth: sourceSize.width,
              targetHeight: sourceSize.height,
            });
          }
        },
      });
      return;
    }
    if (action === "remove-background") {
      if (!targetNode) return;
      const data = targetNode.data as Record<string, unknown>;
      const imageSrc = getLatestAssetImageSource(nodeId);
      if (!imageSrc) {
        toast("去背景失败", { description: "当前图片没有可处理的图像来源" });
        return;
      }
      toast("AI 去背景中", { description: "正在处理当前选中图片" });
      await runDerivedImageGeneration({
        sourceNode: targetNode,
        prompt: "去除背景",
        style: "去背景结果",
        nextW: Number(data.imgW || getCanvasNodeSize(targetNode).width),
        nextH: Number(data.imgH || getCanvasNodeSize(targetNode).height),
        run: async () => removeImageBackground({
          imageSrc,
          model: "gpt-image-2",
          prompt: "Remove the background from this image. Keep the foreground subject sharp and return a PNG with the background fully transparent and alpha set to 0.",
        }),
      });
      return;
    }
    if (action === "remove-watermark") {
      if (!targetNode || targetNode.type !== "asset") return;
      const imageSrc = getLatestAssetImageSource(nodeId);
      if (!imageSrc) {
        toast("去水印失败", { description: "当前图片没有可处理的图像来源" });
        return;
      }
      const sourceSize = getCanvasNodeSize(targetNode);
      toast("AI 去水印中", { description: "正在移除图片水印，新图会出现在原图旁边" });
      await runDerivedImageGeneration({
        sourceNode: targetNode,
        prompt: "去水印",
        style: "去水印结果",
        nextW: sourceSize.width,
        nextH: sourceSize.height,
        run: async () => removeImageWatermark({ imageSrc }),
      });
      return;
    }
    if (action === "erase") {
      if (!targetNode) return;
      setNodes(nds => nds.map(n =>
        n.id === nodeId && n.type === "asset"
          ? {
              ...n,
              selected: true,
              data: {
                ...(n.data as Record<string, unknown>),
                isErasing: true,
                isCropping: false,
                isExpanding: false,
                isEditing: false,
              },
            }
          : n
      ));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "erase" } }));
      toast("橡皮工具", { description: "涂抹需要移除的区域，调整橡皮尺寸后点击立即使用" });
      return;
    }
    if (action === "edit-text") {
      const targetNode = nodesRef.current.find(n => n.id === nodeId && n.type === "asset");
      if (!targetNode) return;
      const data = targetNode.data as Record<string, unknown>;
      const imageSrc = getLatestAssetImageSource(nodeId);
      if (!imageSrc) {
        toast("文案提取失败", { description: "当前图片没有可识别的图像来源" });
        return;
      }

      setNodes(nds => nds.map(n =>
        n.id === nodeId && n.type === "asset"
          ? {
              ...n,
              selected: true,
              data: {
                ...(n.data as Record<string, unknown>),
                extractedTextPanelOpen: true,
                isExtractingText: true,
                isCropping: false,
                isErasing: false,
                isEditing: false,
                extractedText: EXTRACT_TEXT_LOADING_MESSAGE,
              },
            }
          : n
      ));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      toast("正在提取画面文案", { description: "识别完成后会显示在图片右侧" });
      try {
        let ocrText = "";
        try {
          const ocrResult = await extractImageText({ imageSrc });
          ocrText = ocrResult.text.trim();
        } catch (ocrError) {
          console.warn("PicWish OCR failed; falling back to multimodal text extraction", ocrError);
        }
        const result = ocrText
          ? await callLLM({
              module: "commercial-ocr-copy-structure",
              model: "gpt-4o",
              images: [{ src: imageSrc, title: typeof data.title === "string" ? data.title : "选中图片" }],
              prompt: [
                "你是商业设计图片的文案结构整理助手。",
                "下面是 OCR 从图片中识别出的文字，请结合图片画面理解它们在商业设计中的层级。",
                "把文案整理成用户可直接编辑的文本，保持原有语言、大小写、标点和换行顺序。",
                "不要解释，不要添加项目符号，不要输出 JSON。",
                "如果能判断层级，可以用自然换行保留主标题、副标题、卖点、按钮文案的阅读顺序。",
                "如果 OCR 有明显重复或无意义碎片，请轻度去重和清理，但不要改写用户原文。",
                `OCR 识别结果：\n${ocrText}`,
              ].join("\n"),
            })
          : await callLLM({
              module: "multimodal-text-extraction",
              model: "gpt-4o",
              images: [{ src: imageSrc, title: typeof data.title === "string" ? data.title : "选中图片" }],
              prompt: [
                "请提取图片画面中所有可见文字文案。",
                "只输出提取到的文字内容，保持原有语言、大小写、标点和换行顺序。",
                "不要添加解释、标题、项目符号或额外说明。",
                "如果画面中没有可读文字，只输出：未识别到可读文案",
              ].join("\n"),
            });
        const text = result.text.trim() || ocrText || "未识别到可读文案";
        setNodes(nds => nds.map(n =>
          n.id === nodeId && n.type === "asset"
            ? {
                ...n,
                data: {
                  ...(n.data as Record<string, unknown>),
                  extractedTextPanelOpen: true,
                  isExtractingText: false,
                  extractedText: text,
                },
              }
            : n
        ));
        toast("文案提取完成", { description: text.slice(0, 80) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "请稍后重试";
        setNodes(nds => nds.map(n =>
          n.id === nodeId && n.type === "asset"
            ? {
                ...n,
                data: {
                  ...(n.data as Record<string, unknown>),
                  extractedTextPanelOpen: true,
                  isExtractingText: false,
                  extractedText: `提取失败：${message}`,
                },
              }
            : n
        ));
        toast("文案提取失败", { description: message });
      }
      return;
    }
    if (action === "edit-elements") {
      const assetNode = nodesRef.current.find(n => n.id === nodeId && n.type === "asset");
      if (!assetNode) return;
      const data = assetNode.data as Record<string, unknown>;
      const imageSrc = getLatestAssetImageSource(nodeId);
      if (!imageSrc) {
        toast("编辑元素失败", { description: "当前图片没有可处理的图像来源" });
        return;
      }

      const sourceSize = getCanvasNodeSize(assetNode);
      const baseX = assetNode.position.x + sourceSize.width + 36;
      const baseY = assetNode.position.y;
      const splittingNodeId = `element-split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const splittingDisplayW = Math.max(220, Math.round(sourceSize.width));
      const splittingDisplayH = Math.max(160, Math.round(sourceSize.height));
      const splittingPosition = resolveNonOverlappingCanvasPosition(
        nodesRef.current,
        { x: baseX, y: baseY },
        { width: splittingDisplayW, height: splittingDisplayH },
        [assetNode.id],
      );

      pushHistory();
      setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), {
        id: splittingNodeId,
        type: "asset" as const,
        position: splittingPosition,
        style: { width: splittingDisplayW, height: splittingDisplayH },
        data: {
          id: splittingNodeId,
          assetId: "default",
          title: "图层拆分中",
          assetType: "AI 生成",
          tags: ["编辑元素", "图层拆分", "生成中"],
          imgW: splittingDisplayW,
          imgH: splittingDisplayH,
          isGeneratingImage: true,
          processingTitle: "正在进行图层拆分请稍候...",
          processingSubtitle: "(tips：视图片大小，计算时间可能会稍微延长，谢谢)",
          sourceBackgroundSrc: imageSrc,
        },
        selected: true,
      }]);
      setSelectedNodeIds([splittingNodeId]);

      toast("AI 编辑元素中", { description: "正在拆分主体层、背景层和占位层" });
      try {
        const planner = await callLLM({
          module: "image-edit-elements-plan",
          model: "gpt-4o",
          images: [{ src: imageSrc, title: typeof data.title === "string" ? data.title : "选中图片" }],
          prompt: [
            "你正在为设计画布生成图片分层计划。",
            "请把图像拆成接近专业设计软件的图层：主体整体层、背景场景层、可编辑文案信息。",
            "主体整体层必须包含最前景完整主体以及与主体绑定的座椅/道具/服装/鞋子/手部，不要把人体和座椅拆碎。",
            "背景场景层必须移除主体整体层，保留并补全后方背景、地面、墙面、品牌符号、阴影和被主体遮挡的区域。",
            "不要生成碎片化的中景残渣层，不要输出人物、裤子、椅子或鞋子的残片。",
            "返回严格 JSON，不要使用代码块，不要附加解释。",
            "JSON 结构：",
            "{\"foregroundPrompt\":\"...\",\"backgroundPrompt\":\"...\",\"extractedText\":\"...\",\"textStyleHint\":\"...\"}",
            "foregroundPrompt：用于生成主体整体层，只保留完整人物/产品/座椅/手脚/服装等绑定主体，其它区域完全透明 alpha=0。",
            "backgroundPrompt：用于生成背景场景层，完整保留后方 W 标志、蓝色背景、地面透视和光影；移除主体整体层并自然补齐被遮挡区域，输出不透明背景图。",
            "extractedText：把画面中的全部可读文案按原顺序输出；若没有则输出空字符串。",
            "textStyleHint：简要描述文案层适合的排版气质，比如 headline、small、bold。",
          ].join("\n"),
        });

        let parsedPlan: ElementLayerPlan | null = null;
        try {
          parsedPlan = JSON.parse(planner.text) as ElementLayerPlan;
        } catch {
          parsedPlan = null;
        }

        const fallbackPlan: ElementLayerPlan = {
          foregroundPrompt: "Create a transparent PNG subject layer from this image. Keep the complete main subject group as one intact layer, including the person, chair/seat, hands, shoes, clothes, beard, glasses, and all objects physically attached to the subject. Do not cut holes in the body, pants, chair, hands, shoes, or clothing. Remove only the background, wall, floor, and rear logo. Every non-subject pixel must be fully transparent alpha=0. Preserve full original canvas size.",
          backgroundPrompt: "Create the opaque background plate from this image. Remove the complete main subject group including person, chair, hands, shoes, clothes, and foreground shadows. Preserve the rear blue wall, large W logo, floor, perspective, lighting, gradient, texture, and shadow logic. Reconstruct the areas hidden behind the subject naturally, with no subject fragments, no black holes, no transparent pixels, and no retouch artifacts. Output the full original canvas size.",
          extractedText: "",
          textStyleHint: "headline",
        };
        const resolvedPlan: ElementLayerPlan = {
          ...fallbackPlan,
          ...(parsedPlan || {}),
          foregroundPrompt: parsedPlan?.foregroundPrompt?.trim() || fallbackPlan.foregroundPrompt,
          backgroundPrompt: parsedPlan?.backgroundPrompt?.trim() || fallbackPlan.backgroundPrompt,
          extractedText: parsedPlan?.extractedText?.trim() || "",
          textStyleHint: parsedPlan?.textStyleHint?.trim() || fallbackPlan.textStyleHint,
        };

        await runDerivedImageGeneration({
          sourceNode: assetNode,
          prompt: resolvedPlan.foregroundPrompt,
          style: "主体层",
          nextW: Number(data.imgW || sourceSize.width),
          nextH: Number(data.imgH || sourceSize.height),
          placement: splittingPosition,
          run: async () => removeImageBackground({
            imageSrc,
            model: "gpt-image-2",
            prompt: `${resolvedPlan.foregroundPrompt}\n\nLayer alpha requirement: keep the complete subject group as one intact foreground layer. Do not remove any interior subject pixels. All non-subject background pixels must be fully transparent alpha=0. Preserve the original full canvas size.`,
          }),
        });

        await runDerivedImageGeneration({
          sourceNode: assetNode,
          prompt: resolvedPlan.backgroundPrompt,
          style: "背景层",
          nextW: Number(data.imgW || sourceSize.width),
          nextH: Number(data.imgH || sourceSize.height),
          placement: resolveNonOverlappingCanvasPosition(
            nodesRef.current,
            { x: splittingPosition.x, y: splittingPosition.y + sourceSize.height + 28 },
            { width: sourceSize.width, height: sourceSize.height },
            [assetNode.id],
          ),
          run: async () => editImageWithPrompt({
            imageSrc,
            model: "gpt-image-2",
            prompt: `${resolvedPlan.backgroundPrompt}\n\nCritical layer instruction: this output is the bottom background plate only. It must contain no visible person, chair, clothes, shoes, hands, face, skin, beard, glasses, or subject fragments. It should look like the original blue background and W logo existed behind the removed subject.`,
            targetWidth: sourceSize.width,
            targetHeight: sourceSize.height,
          }),
        });

        pushHistory();
        const frameNodeId = `element-frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const framePosition = resolveNonOverlappingCanvasPosition(
          nodesRef.current,
          { x: splittingPosition.x, y: splittingPosition.y + (sourceSize.height + 28) * 2 },
          { width: sourceSize.width, height: sourceSize.height },
          [assetNode.id],
        );
        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), {
          id: frameNodeId,
          type: "canvasFrame" as const,
          position: framePosition,
          style: { width: sourceSize.width, height: sourceSize.height },
          data: {
            id: frameNodeId,
            title: "Frame",
            frameW: sourceSize.width,
            frameH: sourceSize.height,
            backgroundColor: "transparent",
          },
          selected: true,
        }]);
        setSelectedNodeIds([frameNodeId]);

        if (resolvedPlan.extractedText) {
          pushHistory();
          const textNode = createExtractedTextNode(
            assetNode,
            resolvedPlan.extractedText,
            resolveNonOverlappingCanvasPosition(
              nodesRef.current,
              { x: framePosition.x, y: framePosition.y + sourceSize.height + 28 },
              { width: sourceSize.width, height: Math.max(120, Math.min(sourceSize.height, 220)) },
              [assetNode.id],
            ),
            resolvedPlan.textStyleHint,
          );
          setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), { ...textNode, selected: true }]);
          setSelectedNodeIds([textNode.id]);
        }

        toast("编辑元素完成", {
          description: resolvedPlan.extractedText
            ? "已生成主体层、背景层、Frame 和可编辑文案层，原图保持不变"
            : "已生成主体层、背景层和 Frame，原图保持不变",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "请稍后重试";
        toast("编辑元素失败", { description: message });
      } finally {
        setNodes(nds => nds.filter(n => n.id !== splittingNodeId));
      }
      return;
    }
    if (action === "move-object") {
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
      toast("移动对象", { description: "拖动画布中的选中图片即可移动位置" });
      return;
    }
    if (action === "expand") {
      setNodes(nds => nds.map(n =>
        n.id === nodeId && n.type === "asset"
          ? {
              ...n,
              selected: true,
              data: {
                ...(n.data as Record<string, unknown>),
                isExpanding: true,
                isCropping: false,
                isErasing: false,
                isEditing: false,
              },
            }
          : n
      ));
      window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "expand" } }));
      toast("扩展", { description: "拖拽边界框扩大需要延展的范围，空白区域就是 AI 扩展区域" });
      return;
    }
    if (["mockup", "adjust", "vector"].includes(action)) {
      setAssetMorePanel({ command: action, nodeId });
      return;
    }
    if (action === "flip-rotate") {
      if (!targetNode || targetNode.type !== "asset") return;
      const imageSrc = getLatestAssetImageSource(nodeId);
      if (!imageSrc) {
        toast("旋转失败", { description: "当前图片没有可旋转的图像来源" });
        return;
      }
      clearInactiveAssetCommands([nodeId]);
      setRotateEditorState({ nodeId, imageSrc });
      return;
    }
    const labels: Record<string, string> = {
      "remove-background": "去背景",
      "remove-watermark": "去水印",
      upscale: "HD 4K",
      erase: "橡皮工具",
      "edit-elements": "编辑元素",
      "edit-text": "智能文案",
      mockup: "多平台封面",
      expand: "扩展",
      adjust: "调整",
      crop: "裁剪",
      vector: "矢量",
      "flip-rotate": "旋转与反转",
      more: "更多",
    };
    toast(labels[action] || "功能即将上线", { description: "已保留 Lovart 命令入口，后续可接入对应 AI 处理能力" });
  }, [clearAssetCommandState, clearInactiveAssetCommands, createExtractedTextNode, getLatestAssetImageSource, handleNodeAction, nodesRef, pushHistory, requireAiAccess, runDerivedImageGeneration, selectedVisualNodeIds, setNodes]);
  const handleSocialMediaSizeGenerate = useCallback(async (payload: SocialMediaExportPayload) => {
    if (!assetMorePanel) return;
    const imageSrc = getLatestAssetImageSource(assetMorePanel.nodeId);
    if (!imageSrc) {
      toast("导出失败", { description: "当前图片没有可处理的图像来源" });
      setAssetMorePanel(null);
      return;
    }
    const outputSizes = [
      ...payload.presets.map(preset => ({
        id: preset.id,
        platform: preset.platform,
        label: `${preset.platform} ${preset.title}`,
        width: preset.width,
        height: preset.height,
      })),
      ...(payload.customSize ? [{
        id: "custom",
        platform: "自定义",
        label: "自定义尺寸",
        width: payload.customSize.width,
        height: payload.customSize.height,
      }] : []),
    ];
    if (outputSizes.length === 0) return;

    const toastId = toast.loading(`正在导出 ${outputSizes.length} 张多平台封面...`);
    try {
      const zip = new JSZip();
      const format = payload.format || "png";
      const exportedFiles = await Promise.all(outputSizes.map(async item => {
        const blob = await createMultiPlatformCoverBlob(
          imageSrc,
          { width: item.width, height: item.height },
          payload.transform || { offsetX: 0, offsetY: 0, scale: 1 },
          format,
        );
        const ext = format === "jpg" ? "jpeg" : format;
        const fileName = `${sanitizeDownloadName(`${item.platform} ${item.width}×${item.height}`)}.${ext}`;
        zip.file(fileName, blob);
        return { fileName, blob };
      }));
      const picker = (window as BrowserWindowWithDirectoryPicker).showDirectoryPicker;
      if (picker) {
        const rootHandle = await picker();
        const folderHandle = await rootHandle.getDirectoryHandle("ArtX 多平台封面", { create: true });
        for (const file of exportedFiles) {
          const fileHandle = await folderHandle.getFileHandle(file.fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(file.blob);
          await writable.close();
        }
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `ArtX 多平台封面-${Date.now()}.zip`);
      }
      toast.dismiss(toastId);
      toast("多平台封面已导出", { description: `已保存 ${outputSizes.length} 张 ${format.toUpperCase()} 图片` });
    } catch (error) {
      toast.dismiss(toastId);
      const message = error instanceof Error ? error.message : "请稍后重试";
      toast("导出失败", { description: message });
    } finally {
      setAssetMorePanel(null);
    }
  }, [assetMorePanel, getLatestAssetImageSource, sanitizeDownloadName]);
  const handleAssetMorePanelApply = useCallback(async (label: string, adjustments?: AssetAdjustmentValues) => {
    if (!assetMorePanel) return;
    if (assetMorePanel.command === "vector") {
      const sourceNode = nodesRef.current.find(n => n.id === assetMorePanel.nodeId && n.type === "asset");
      if (!sourceNode) {
        setAssetMorePanel(null);
        return;
      }
      const imageSrc = getLatestAssetImageSource(assetMorePanel.nodeId);
      if (!imageSrc) {
        toast("矢量化失败", { description: "当前图片没有可处理的图像来源" });
        setAssetMorePanel(null);
        return;
      }
      const sourceSize = getCanvasNodeSize(sourceNode);
      setAssetMorePanel(null);
      const vectorPromptMap: Record<string, string> = {
        "提取轮廓": "将图片转换为清晰的矢量轮廓风格结果。保留主体完整外形、关键边缘、比例和识别特征，使用干净线条与透明或简洁背景，不要改变主体姿态。",
        "扁平化": "将图片转换为扁平化矢量插画风格结果。保留原图主体、构图比例、主要色块和品牌识别特征，减少真实纹理，使用简洁可编辑的形状语言。",
        "高清矢量": "将图片转换为高清矢量海报风格结果。保留主体完整性、构图比例和关键细节，边缘锐利、色块干净、适合继续设计编辑。",
      };
      await runDerivedImageGeneration({
        sourceNode,
        prompt: vectorPromptMap[label] || vectorPromptMap["高清矢量"],
        style: "矢量化结果",
        nextW: sourceSize.width,
        nextH: sourceSize.height,
        run: async () => editImageWithPrompt({
          imageSrc,
          model: "gpt-image-2",
          prompt: vectorPromptMap[label] || vectorPromptMap["高清矢量"],
          targetWidth: sourceSize.width,
          targetHeight: sourceSize.height,
        }),
      });
      return;
    }
    if (assetMorePanel.command === "adjust") {
      const sourceNode = nodesRef.current.find(n => n.id === assetMorePanel.nodeId && n.type === "asset");
      if (!sourceNode) {
        closeAssetMorePanel();
        return;
      }
      const data = sourceNode.data as Record<string, unknown>;
      const imageSrc = getLatestAssetImageSource(assetMorePanel.nodeId);
      if (!imageSrc) {
        toast("调整失败", { description: "当前图片没有可处理的图像来源" });
        closeAssetMorePanel();
        return;
      }
      const nextAdjustments = adjustments || normalizeAssetAdjustments(data.assetAdjustmentPreview || data.assetAdjustments);
      try {
        const adjustedDataUrl = await applyAssetAdjustmentsToImage(imageSrc, nextAdjustments);
        pushHistory();
        setNodes(nds => nds.map(n => {
          if (n.id !== assetMorePanel.nodeId || n.type !== "asset") return n;
          const nodeData = n.data as Record<string, unknown>;
          const { assetAdjustmentPreview, ...restData } = nodeData;
          return {
            ...n,
            data: {
              ...restData,
              // Bake the adjusted pixels into localSrc so every later AI/edit command starts from this image.
              localSrc: adjustedDataUrl,
              assetAdjustments: DEFAULT_ASSET_ADJUSTMENTS,
              lastLovartCommand: label,
              isEditing: false,
            },
          };
        }));
        toast("已应用图片调整", { description: "最终调试结果已写入当前图片" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "请稍后重试";
        toast("调整失败", { description: message });
      } finally {
        setAssetMorePanel(null);
      }
      return;
    }
    pushHistory();
    setNodes(nds => nds.map(n => {
      if (n.id !== assetMorePanel.nodeId || n.type !== "asset") return n;
      const data = n.data as Record<string, unknown>;
      if (assetMorePanel.command === "crop") {
        const size = getCanvasNodeSize(n);
        const ratioLabel = label.split("·").pop()?.trim() || "自由";
        const ratioMap: Record<string, number> = {
          "1:1": 1,
          "3:4": 3 / 4,
          "4:3": 4 / 3,
          "16:9": 16 / 9,
          "9:16": 9 / 16,
        };
        const ratio = ratioMap[ratioLabel];
        let nextW = size.width;
        let nextH = size.height;
        if (ratio) {
          const currentRatio = size.width / Math.max(1, size.height);
          if (currentRatio > ratio) {
            nextH = size.height;
            nextW = Math.max(60, Math.round(nextH * ratio));
          } else {
            nextW = size.width;
            nextH = Math.max(60, Math.round(nextW / ratio));
          }
        } else {
          nextW = Math.max(60, Math.round(size.width * 0.86));
          nextH = Math.max(60, Math.round(size.height * 0.86));
        }
        return {
          ...n,
          style: { ...n.style, width: nextW, height: nextH },
          data: {
            ...data,
            imgW: nextW,
            imgH: nextH,
            cropRatio: ratioLabel,
            lastLovartCommand: label,
            isEditing: false,
          },
        };
      }
      return {
        ...n,
        data: {
          ...data,
          lastLovartCommand: label,
          isEditing: assetMorePanel.command === "crop",
        },
      };
    }));
    toast(label, { description: "已应用到当前图片节点" });
    setAssetMorePanel(null);
  }, [assetMorePanel, closeAssetMorePanel, getLatestAssetImageSource, nodesRef, pushHistory, runDerivedImageGeneration, setNodes]);
  const selectedImageNode = selectedVisualNodeIds.length === 1 ? nodes.find(n => n.id === selectedVisualNodeIds[0] && (n.type === "asset" || n.type === "canvasFrame")) : null;
  const assetMorePanelNode = assetMorePanel ? nodes.find(n => n.id === assetMorePanel.nodeId && n.type === "asset") : null;
  const assetMorePanelData = assetMorePanelNode?.data as Record<string, unknown> | undefined;
  const assetMorePanelImageSrc = assetMorePanel ? getLatestAssetImageSource(assetMorePanel.nodeId) : "";
  const selectedImageBounds = selectedImageNode ? getCanvasNodeBounds(selectedImageNode) : getCanvasNodesBounds(nodes, selectedVisualNodeIds);
  const selectedImageData = selectedImageNode?.data as Record<string, unknown> | undefined;
  const selectedImageHasBottomPanel = Boolean(
    selectedImageNode?.type === "asset" && (
      selectedImageData?.isErasing ||
      selectedImageData?.isExpanding ||
      selectedImageData?.isCropping ||
      selectedImageData?.isEditing
    )
  );
  const imageToolbarScreenHeight = 436;
  const imageToolbarGap = 14;
  const imageToolbarBottomPanelReserve = selectedImageHasBottomPanel ? 96 : 0;
  const attachedImageToolbarPosition = selectedImageBounds
    ? (() => {
        const screenTop = selectedImageBounds.y * viewport.zoom + viewport.y;
        const screenBottom = selectedImageBounds.bottom * viewport.zoom + viewport.y - imageToolbarBottomPanelReserve;
        const minTop = screenTop + imageToolbarGap + imageToolbarScreenHeight / 2;
        const maxTop = screenBottom - imageToolbarGap - imageToolbarScreenHeight / 2;
        const desiredTop = selectedImageBounds.centerY * viewport.zoom + viewport.y;
        const top = maxTop >= minTop
          ? Math.min(Math.max(desiredTop, minTop), maxTop)
          : Math.min(desiredTop, Math.max(screenTop + imageToolbarGap + imageToolbarScreenHeight / 2, screenBottom - imageToolbarGap));
        return {
          left: selectedImageBounds.x * viewport.zoom + viewport.x - 8,
          top,
        };
      })()
    : { left: 31, top: 0 };
  const displayNodesBase = nodes.map(n => {
    const nodeData = n.data as Record<string, unknown>;
    const embeddedFrameId = n.type === "asset" ? nodeData.embeddedInFrame as string | undefined : undefined;
    const embeddedFrame = embeddedFrameId
      ? nodes.find(item => item.id === embeddedFrameId && item.type === "canvasFrame")
      : null;
    const frameClipInsets = embeddedFrame
      ? (() => {
          const assetBounds = getCanvasNodeBounds(n);
          const frameBounds = getCanvasNodeBounds(embeddedFrame);
          const left = Math.max(0, Math.round(frameBounds.x - assetBounds.x));
          const top = Math.max(0, Math.round(frameBounds.y - assetBounds.y));
          const right = Math.max(0, Math.round(assetBounds.right - frameBounds.right));
          const bottom = Math.max(0, Math.round(assetBounds.bottom - frameBounds.bottom));
          return { top, right, bottom, left };
        })()
      : undefined;
    const data = {
      ...n.data,
      multiSelectionActive: n.type === "asset" && multiImageSelectionActive && selectedImageNodeIds.includes(n.id),
      frameClipInsets,
    };
    return n.type === "asset" && editAsset && n.id === editAsset.nodeId
      ? { ...n, data: { ...data, isEditing: true } }
      : { ...n, data };
  });
  const displayNodes = [
    ...displayNodesBase.filter(n => !(n.type === "asset" && Boolean((n.data as Record<string, unknown>).noteOpen))),
    ...displayNodesBase
      .filter(n => n.type === "asset" && Boolean((n.data as Record<string, unknown>).noteOpen))
      .map(n => ({ ...n, zIndex: Math.max(10000, typeof n.zIndex === "number" ? n.zIndex : 0) })),
  ];

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{ height: "100%", cursor: (activeToolMode === "smart-canvas" || activeToolMode.startsWith("shape-draw:") || activeToolMode === "pen" || activeToolMode === "draw") ? "crosshair" : undefined }}
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      onMouseDown={e => { handleFreehandMouseDown(e); handlePenMouseDown(e); handleCreateCanvasMouseDown(e); }}
      onMouseMove={e => { handleFreehandMouseMove(e); handlePenMouseMove(e); handleCreateCanvasMouseMove(e); }}
      onMouseUp={e => { handleFreehandMouseUp(); handlePenMouseUp(); handleCreateCanvasMouseUp(e); }}
    >
      {assetMorePanel && (
        assetMorePanel.command === "mockup" ? (
          <SocialMediaSizePanel
            isDark={isDark}
            imageSrc={assetMorePanelImageSrc}
            onClose={closeAssetMorePanel}
            onGenerate={handleSocialMediaSizeGenerate}
          />
        ) : (
          <AssetMoreCommandPanel
            isDark={isDark}
            command={assetMorePanel.command}
            initialAdjustments={normalizeAssetAdjustments(assetMorePanelData?.assetAdjustmentPreview || assetMorePanelData?.assetAdjustments)}
            imageSrc={assetMorePanelImageSrc}
            onClose={closeAssetMorePanel}
            onApply={handleAssetMorePanelApply}
            onPreviewChange={(adjustments) => {
              if (assetMorePanel.command !== "adjust") return;
              setNodes(nds => nds.map(n => {
                if (n.id !== assetMorePanel.nodeId || n.type !== "asset") return n;
                const data = n.data as Record<string, unknown>;
                const currentPreview = normalizeAssetAdjustments(data.assetAdjustmentPreview);
                if (areAssetAdjustmentsEqual(currentPreview, adjustments)) return n;
                return { ...n, data: { ...data, assetAdjustmentPreview: adjustments } };
              }));
            }}
          />
        )
      )}

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
        style={{ background: canvasBg, width: isAssistantCollapsed ? "calc(100% - 112px)" : `calc(100% - ${assistantPanelWidth}px)`, transition: "width 160ms ease" }}
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
        zoomOnScroll={false}
        panOnScroll={!isCanvasLocked}
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

      <CropEditor
        isOpen={!!cropEditorState}
        imageSrc={cropEditorState?.imageSrc ?? ""}
        isDark={isDark}
        onClose={() => setCropEditorState(null)}
        onConfirm={(croppedDataUrl, size) => {
          if (!cropEditorState) return;
          pushHistory(nodesRef.current, edgesRef.current);
          setNodes(nds => nds.map(n => {
            if (n.id !== cropEditorState.nodeId || n.type !== "asset") return n;
            const data = n.data as Record<string, unknown>;
            const currentSize = getCanvasNodeSize(n);
            const nextW = Math.max(1, Math.round(currentSize.width * (size.width / Math.max(1, size.naturalWidth))));
            const nextH = Math.max(1, Math.round(currentSize.height * (size.height / Math.max(1, size.naturalHeight))));
            return {
              ...n,
              style: { ...n.style, width: nextW, height: nextH },
              data: {
                ...data,
                localSrc: croppedDataUrl,
                imgW: nextW,
                imgH: nextH,
                cropX: 0,
                cropY: 0,
                cropW: 100,
                cropH: 100,
                isCropping: false,
                isEditing: false,
              },
            };
          }));
          setCropEditorState(null);
          window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
          toast("已完成裁切", { description: `${size.width} × ${size.height}px` });
        }}
      />

      <RotateEditor
        isOpen={!!rotateEditorState}
        imageSrc={rotateEditorState?.imageSrc ?? ""}
        isDark={isDark}
        onClose={() => setRotateEditorState(null)}
        onConfirm={(rotatedDataUrl, size) => {
          if (!rotateEditorState) return;
          pushHistory(nodesRef.current, edgesRef.current);
          setNodes(nds => nds.map(n => {
            if (n.id !== rotateEditorState.nodeId || n.type !== "asset") return n;
            const data = n.data as Record<string, unknown>;
            const currentSize = getCanvasNodeSize(n);
            const nextW = Math.max(1, Math.round(currentSize.width * (size.width / Math.max(1, size.naturalWidth))));
            const nextH = Math.max(1, Math.round(currentSize.height * (size.height / Math.max(1, size.naturalHeight))));
            return {
              ...n,
              style: { ...n.style, width: nextW, height: nextH },
              data: {
                ...data,
                localSrc: rotatedDataUrl,
                imgW: nextW,
                imgH: nextH,
                rotation: 0,
                flipX: false,
                flipY: false,
                isCropping: false,
                isErasing: false,
                isEditing: false,
              },
            };
          }));
          setRotateEditorState(null);
          window.dispatchEvent(new CustomEvent("tool-mode-change", { detail: { mode: "move" } }));
          toast("已完成旋转", { description: `${size.width} × ${size.height}px` });
        }}
      />

      <CanvasAssistantPanel
        projectId={projectId}
        isDark={isDark}
        collapsed={isAssistantCollapsed}
        panelWidth={assistantPanelWidth}
        onPanelResize={setAssistantPanelWidth}
        activeSkill={activeSkill}
        onActiveSkillChange={setActiveSkill}
        isAuthenticated={isAuthenticated}
        onLoginRequest={openLoginModal}
        onToggleCollapsed={() => setIsAssistantCollapsed(value => !value)}
        referencedAssets={referencedAssets}
        annotationReferences={annotationReferences}
        onRemoveReference={(id) => setReferencedAssets(prev => prev.filter(r => r.id !== id))}
        onRemoveAnnotationReference={(id) => setAnnotationReferences(prev => prev.filter(r => r.id !== id))}
        onMergeReferences={mergeReferencedAssets}
        selectedCount={selectedNodeIds.length}
        helpPromptNonce={helpPromptNonce}
      />

      {selectedVisualNodeIds.length === 1 && !multiVisualSelectionActive && (
        <AssetFloatingToolbar
          isDark={isDark}
          position={attachedImageToolbarPosition}
          onAction={handleSingleImageToolbarAction}
        />
      )}

      {selectedTextNode && (
        <TextFloatingToolbar
          isDark={isDark}
          nodeData={selectedTextNode.data as Record<string, unknown>}
          position={textToolbarPosition}
          onUpdate={handleTextNodeUpdate}
          onDownload={handleTextNodeDownload}
        />
      )}

      {multiVisualSelectionActive && (
        <MultiSelectionFloatingToolbar
          isDark={isDark}
          count={selectedVisualNodeIds.length}
          grouped={areNodesGrouped(selectedVisualNodeIds)}
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
        onDragMove={handleGroupContainerDragMove}
        onDragEnd={handleGroupContainerDragEnd}
        onLabelDoubleClick={handleGroupLabelDoubleClick}
      />

      {/* Rename group dialog */}
      {renamingGroupId && (
        <div
          className="fixed inset-x-0 flex justify-center"
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

      {imageGeneratorModalOpen && (
        <div
          className="absolute inset-0 nodrag nopan"
          style={{ zIndex: 105, background: "rgba(0,0,0,0.08)", cursor: "default" }}
          onMouseDown={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onContextMenu={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      )}

      {/* Canvas top tool palette — centered above the canvas area */}
      <CanvasTopToolPalette
        isDark={isDark}
        projectId={projectId}
        canvasRightInset={isAssistantCollapsed ? 112 : assistantPanelWidth}
        onImageGeneratorOpenChange={setImageGeneratorModalOpen}
      />

      {/* Back button — top-left */}
      {!imageGeneratorModalOpen && <BackButton isDark={isDark} />}


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

      {/* 几何形参数面板（全局渲染，紧贴节点选框右侧 +6px） */}
      {shapeCtxMenu && (() => {
        const shapeNode = nodes.find(n => n.id === shapeCtxMenu.nodeId);
        if (!shapeNode) return null;
        const nw = (shapeNode.style?.width as number) || (shapeNode.data as Record<string,unknown>).width as number || 100;
        const nh = (shapeNode.style?.height as number) || (shapeNode.data as Record<string,unknown>).height as number || 100;
        // flow 坐标转屏幕坐标（相对 containerRef）
        const screenX = shapeNode.position.x * viewport.zoom + viewport.x;
        const screenY = shapeNode.position.y * viewport.zoom + viewport.y;
        const screenW = nw * viewport.zoom;
        const screenH = nh * viewport.zoom;
        const panelLeft = screenX + screenW + 6;
        const panelTop = screenY + screenH / 2;
        const bg = isDark ? "oklch(0.14 0.018 270)" : "oklch(0.99 0.004 270)";
        const border = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
        const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.18 0.008 270)";
        const inputBg = isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 5%)";
        const inputBorder = isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)";
        const applyShapeParams = () => {
          const newOpacity = Math.max(0, Math.min(1, parseFloat(shapeCtxMenu.menuOpacity) / 100 || 1));
          const newStrokeW = parseFloat(shapeCtxMenu.menuStrokeW) || 0;
          setNodes(nds => nds.map(n => n.id === shapeCtxMenu.nodeId ? {
            ...n, data: { ...n.data, fill: shapeCtxMenu.menuFill, stroke: shapeCtxMenu.menuStroke, strokeWidth: newStrokeW, opacity: newOpacity }
          } : n));
          setShapeCtxMenu(null);
        };
        return (
          <div
            className="shape-ctx-menu"
            style={{
              position: "absolute", left: panelLeft, top: panelTop,
              transform: "translateY(-50%)",
              zIndex: 3000, background: bg,
              border: `1px solid ${border}`,
              borderRadius: 10, padding: "14px 16px", minWidth: 220,
              boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
              color: text, fontSize: 12, pointerEvents: "all",
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>图形参数</p>
            <div style={{ marginBottom: 8 }}>
              <p style={{ opacity: 0.6, marginBottom: 4 }}>填充色</p>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={shapeCtxMenu.menuFill.startsWith("#") ? shapeCtxMenu.menuFill : "#6366f1"}
                  onChange={e => setShapeCtxMenu(s => s ? { ...s, menuFill: e.target.value } : s)}
                  style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer", borderRadius: 4, background: "transparent" }} />
                <input type="text" value={shapeCtxMenu.menuFill}
                  onChange={e => setShapeCtxMenu(s => s ? { ...s, menuFill: e.target.value } : s)}
                  style={{ flex: 1, background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11, fontFamily: "monospace" }} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <p style={{ opacity: 0.6, marginBottom: 4 }}>描边色</p>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={shapeCtxMenu.menuStroke.startsWith("#") ? shapeCtxMenu.menuStroke : "#000000"}
                  onChange={e => setShapeCtxMenu(s => s ? { ...s, menuStroke: e.target.value } : s)}
                  style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer", borderRadius: 4, background: "transparent" }} />
                <input type="text" value={shapeCtxMenu.menuStroke}
                  onChange={e => setShapeCtxMenu(s => s ? { ...s, menuStroke: e.target.value } : s)}
                  style={{ flex: 1, background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11, fontFamily: "monospace" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ opacity: 0.6, marginBottom: 4 }}>描边宽度</p>
                <input type="number" min={0} value={shapeCtxMenu.menuStrokeW}
                  onChange={e => setShapeCtxMenu(s => s ? { ...s, menuStrokeW: e.target.value } : s)}
                  style={{ width: "100%", background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11 }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ opacity: 0.6, marginBottom: 4 }}>不透明度 %</p>
                <input type="number" min={0} max={100} value={shapeCtxMenu.menuOpacity}
                  onChange={e => setShapeCtxMenu(s => s ? { ...s, menuOpacity: e.target.value } : s)}
                  style={{ width: "100%", background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 5, padding: "4px 8px", color: "inherit", fontSize: 11 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={applyShapeParams}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: "oklch(0.55 0.22 290)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                应用
              </button>
              <button onClick={() => setShapeCtxMenu(null)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${border}`, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 }}>
                取消
              </button>
            </div>
          </div>
        );
      })()}

      {/* Edit-asset prompt bar — shown after zoom-in animation, overlays bottom */}
      {editAsset && (
        <AssetEditPromptBar
          asset={editAsset}
          isDark={isDark}
          canvasRightInset={isAssistantCollapsed ? 112 : assistantPanelWidth}
          onSubmit={(payload) => { void handleAssetEditSubmit(payload); }}
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
          className="fixed inset-x-0 flex justify-center"
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
                    const safeName = sanitizeDownloadName(singleDl.title);
                    const blob = await imageSrcToFormatBlob(singleDl.src, downloadFormat);
                    if (!blob) {
                      toast("下载失败", { description: "当前图片暂时无法保存，请稍后重试" });
                    } else {
                      saveAs(blob, `${safeName}.${downloadFormat}`);
                    }
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

      {/* 创建画板：拖拽矩形预览 */}
      {drawingRect && (() => {
        const rx = Math.min(drawingRect.startX, drawingRect.endX);
        const ry = Math.min(drawingRect.startY, drawingRect.endY);
        const rw = Math.abs(drawingRect.endX - drawingRect.startX);
        const rh = Math.abs(drawingRect.endY - drawingRect.startY);
        // 根据当前工具模式渲染对应几何形轮廓
        const shapePreviewType = activeToolMode.startsWith("shape-draw:") ? activeToolMode.replace("shape-draw:", "") : null;
        const buildPreviewPath = (type: string, w: number, h: number) => {
          if (type === "circle") {
            const cx = w/2, cy = h/2, rx2 = w/2, ry2 = h/2;
            return `M ${cx-rx2} ${cy} A ${rx2} ${ry2} 0 1 0 ${cx+rx2} ${cy} A ${rx2} ${ry2} 0 1 0 ${cx-rx2} ${cy} Z`;
          }
          if (type === "triangle") return `M ${w/2} 0 L ${w} ${h} L 0 ${h} Z`;
          if (type === "star") {
            const pts: string[] = [];
            for (let i = 0; i < 10; i++) {
              const angle = (i * Math.PI) / 5 - Math.PI / 2;
              const r = i % 2 === 0 ? Math.min(w, h) / 2 : Math.min(w, h) / 4;
              pts.push(`${i===0?"M":"L"} ${w/2 + r*Math.cos(angle)} ${h/2 + r*Math.sin(angle)}`);
            }
            return pts.join(" ") + " Z";
          }
          if (type === "line") return `M 0 ${h/2} L ${w} ${h/2}`;
          if (type === "arrow") {
            const hl = 12, ha = 0.4;
            const angle = 0;
            return `M 0 ${h/2} L ${w} ${h/2} M ${w-hl*Math.cos(angle-ha)} ${h/2-hl*Math.sin(angle-ha)} L ${w} ${h/2} L ${w-hl*Math.cos(angle+ha)} ${h/2+hl*Math.sin(angle+ha)}`;
          }
          // rectangle / square / default
          return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
        };
        return (
          <div
            className="absolute pointer-events-none"
            style={{ left: rx, top: ry, width: rw, height: rh, zIndex: 9800 }}
          >
            {shapePreviewType ? (
              <svg width={rw} height={rh} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                <path
                  d={buildPreviewPath(shapePreviewType, rw, rh)}
                  fill={shapePreviewType === "line" || shapePreviewType === "arrow" ? "none" : "oklch(0.65 0.22 290 / 0.15)"}
                  stroke="oklch(0.65 0.22 290)"
                  strokeWidth={2}
                  strokeDasharray={shapePreviewType === "line" || shapePreviewType === "arrow" ? "none" : "none"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div style={{
                width: "100%", height: "100%",
                border: "2px solid oklch(0.65 0.22 290)",
                background: "oklch(0.65 0.22 290 / 0.08)",
                borderRadius: 4,
                boxSizing: "border-box",
              }} />
            )}
          </div>
        );
      })()}

      {/* 钢笔工具：预览连线（最后一个锚点到鼠标位置） */}
      {activeToolMode === "pen" && penNodeId && penCursorPos && (() => {
        const penNode = nodes.find(n => n.id === penNodeId);
        if (!penNode) return null;
        const anchors = (penNode.data.anchors as PenAnchor[]) || [];
        if (anchors.length === 0) return null;
        const lastAnchor = anchors[anchors.length - 1];
        // 将 flow 坐标转换为屏幕坐标
        const lastScreenX = (penNode.position.x + lastAnchor.x) * viewport.zoom + viewport.x;
        const lastScreenY = (penNode.position.y + lastAnchor.y) * viewport.zoom + viewport.y;
        return (
          <svg
            className="absolute pointer-events-none"
            style={{ left: 0, top: 0, width: "100%", height: "100%", zIndex: 9700, overflow: "visible" }}
          >
            <line
              x1={lastScreenX} y1={lastScreenY}
              x2={penCursorPos.x} y2={penCursorPos.y}
              stroke="oklch(0.65 0.22 290)"
              strokeWidth={1.5}
              strokeDasharray="5,3"
              strokeLinecap="round"
            />
            {/* 鼠标位置小圆点 */}
            <circle cx={penCursorPos.x} cy={penCursorPos.y} r={4} fill="white" stroke="oklch(0.65 0.22 290)" strokeWidth={1.5} />
          </svg>
        );
      })()}

      {/* 创建画板：宽高输入弹窗 */}
      {pendingRect && (() => {
        const rx = Math.min(pendingRect.startX, pendingRect.endX);
        const ry = Math.min(pendingRect.startY, pendingRect.endY);
        const rw = Math.abs(pendingRect.endX - pendingRect.startX);
        const rh = Math.abs(pendingRect.endY - pendingRect.startY);
        // 弹窗宽度
        const popW = 360;
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
            {/* 创建确认期间锁住画布交互，避免未确认前继续操作其他对象 */}
            <div
              className="absolute inset-0 nodrag nopan"
              style={{ zIndex: 9700, cursor: "default", background: "transparent" }}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
              onMouseMove={e => { e.preventDefault(); e.stopPropagation(); }}
              onMouseUp={e => { e.preventDefault(); e.stopPropagation(); }}
              onClick={e => { e.preventDefault(); e.stopPropagation(); }}
              onWheel={e => { e.preventDefault(); e.stopPropagation(); }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
            />
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
              <p style={{ color: text, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>设置画板</p>

              <div style={{ marginBottom: 10 }}>
                <p style={{ color: sub, fontSize: 10, marginBottom: 4, letterSpacing: "0.04em" }}>画板名称</p>
                <input
                  autoFocus
                  type="text"
                  value={canvasNameInput}
                  onChange={e => setCanvasNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateCanvasConfirm(); if (e.key === "Escape") handleCreateCanvasCancel(); }}
                  placeholder="例如：小红书笔记封面"
                  style={{
                    width: "100%",
                    background: inputBg,
                    border: `1px solid ${inputBorder}`,
                    borderRadius: 6,
                    outline: "none",
                    color: text,
                    fontSize: 12,
                    padding: "7px 8px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

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

              {/* 多平台封面——复用图片命令中的规格库 */}
              {(() => {
                const selectedSocialPreset = SOCIAL_MEDIA_SIZE_PRESETS.find(preset => preset.id === canvasSocialPresetId);
                const groupedPlatforms = Array.from(new Set(SOCIAL_MEDIA_SIZE_PRESETS.map(preset => preset.platform)));
                return (
                  <div style={{ marginBottom: 10, borderRadius: 7, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, overflow: "hidden" }}>
                    <button
                      onClick={() => setSocialPresetOpen(v => !v)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", padding: "7px 10px",
                        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                        border: "none", cursor: "pointer", color: text,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <Sparkles size={13} />
                        <span>多平台封面</span>
                        {selectedSocialPreset && (
                          <span style={{ color: "oklch(0.65 0.22 290)", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {selectedSocialPreset.platform} · {selectedSocialPreset.title}
                          </span>
                        )}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                        style={{ transform: socialPresetOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s", flexShrink: 0 }}>
                        <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {socialPresetOpen && (
                      <div style={{ maxHeight: 236, overflowY: "auto", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, scrollbarWidth: "thin" }}>
                        {groupedPlatforms.map(platform => (
                          <div key={platform}>
                            <div style={{
                              position: "sticky", top: 0, zIndex: 1,
                              display: "flex", alignItems: "center", gap: 7,
                              padding: "7px 10px 5px",
                              background: isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.96)",
                              color: sub, fontSize: 11, fontWeight: 650,
                            }}>
                              <SocialPlatformIcon platform={platform} size={15} />
                              {platform}
                            </div>
                            {SOCIAL_MEDIA_SIZE_PRESETS.filter(preset => preset.platform === platform).map(preset => {
                              const active = preset.id === canvasSocialPresetId;
                              return (
                                <button
                                  key={preset.id}
                                  onClick={() => {
                                    setCanvasSocialPresetId(preset.id);
                                    setCanvasInputW(String(preset.width));
                                    setCanvasInputH(String(preset.height));
                                    if (!canvasNameInput.trim()) setCanvasNameInput(`${preset.platform} ${preset.title}`);
                                  }}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr auto",
                                    gap: 8,
                                    alignItems: "center",
                                    width: "100%",
                                    padding: "7px 10px",
                                    background: active ? (isDark ? "rgba(147,108,255,0.16)" : "rgba(147,108,255,0.10)") : "transparent",
                                    border: "none",
                                    borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.045)"}`,
                                    color: text,
                                    cursor: "pointer",
                                    textAlign: "left",
                                  }}
                                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.035)"; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? (isDark ? "rgba(147,108,255,0.16)" : "rgba(147,108,255,0.10)") : "transparent"; }}
                                >
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preset.title}</span>
                                    <span style={{ display: "block", marginTop: 1, color: sub, fontSize: 10 }}>{Math.round((preset.width / preset.height) * 100) / 100}:1</span>
                                  </span>
                                  <span style={{ color: active ? "oklch(0.74 0.18 290)" : sub, fontSize: 11, fontWeight: 650, whiteSpace: "nowrap" }}>
                                    {preset.width} × {preset.height}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
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
          onAiEdit={handleAnnotationAiEdit}
          onAddReference={handleAnnotationAddReference}
          referencedAnnotationIds={new Set(annotationReferences.map(reference => reference.id))}
        />
      )}

    </div>
  );
}

// ── 全局注释层组件 ──
function GlobalAnnotationLayer({
  annotations, nodes, viewport, isDark, onUpdate, onRemove, onAiEdit, onAddReference, referencedAnnotationIds
}: {
  annotations: (GlobalAnnotation & { screenX?: number; screenY?: number })[];
  nodes: Node[];
  viewport: { x: number; y: number; zoom: number };
  isDark: boolean;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onRemove: (id: string) => void;
  onAiEdit: (id: string, text: string) => void;
  onAddReference: (id: string, text: string) => void;
  referencedAnnotationIds: Set<string>;
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
              onAiEdit={onAiEdit}
              onAddReference={onAddReference}
              isReferenceActive={referencedAnnotationIds.has(ann.id)}
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
