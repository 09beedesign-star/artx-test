/**
 * WorkspaceDashboard — 工作台页面
 * Design: Neo-Studio Dark
 * Features:
 * - 历史项目缩略图网格
 * - 创建项目（自定义封面）
 * - 右下角 ... 菜单：重命名 / 副本 / 删除
 * - 鼠标框选批量删除（二次确认）
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import TopBar from "@/components/workspace/TopBar";
import {
  Plus, MoreHorizontal, Pencil, Copy, Trash2,
  FolderOpen, Clock, Image as ImageIcon, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { POSTER_1, POSTER_2, BRAND_KIT, SOCIAL_AD } from "@/lib/workspace-data";

// ── Types ──────────────────────────────────────────────────────
interface WsProject {
  id: string;
  title: string;
  cover: string | null;
  updatedAt: string;
  nodeCount: number;
}

const INITIAL_PROJECTS: WsProject[] = [
  { id: "p1", title: "跑鞋产品页", cover: POSTER_2, updatedAt: "2 小时前", nodeCount: 8 },
  { id: "p2", title: "咖啡品牌系统", cover: BRAND_KIT, updatedAt: "昨天", nodeCount: 12 },
  { id: "p3", title: "时尚大片海报", cover: POSTER_1, updatedAt: "3 天前", nodeCount: 5 },
  { id: "p4", title: "科技产品广告", cover: SOCIAL_AD, updatedAt: "上周", nodeCount: 7 },
  { id: "p5", title: "登山品牌视频", cover: null, updatedAt: "2 周前", nodeCount: 3 },
];

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Inline Dropdown Menu ───────────────────────────────────────
function CardMenu({
  isDark,
  onRename,
  onDuplicate,
  onDelete,
}: {
  isDark: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const bg = isDark ? "rgba(18,18,26,0.97)" : "rgba(248,248,252,0.97)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.20 0.008 270)";
  const hoverBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        className="w-5 h-5 rounded-[var(--radius-md-design)] flex items-center justify-center transition-all active:scale-90"
        style={{
          background: open
            ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)")
            : "transparent",
          color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.012 255)",
        }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          className="absolute rounded-[var(--radius-lg-design)] overflow-hidden z-[9999]"
          style={{
            background: bg,
            border: `1px solid ${border}`,
            minWidth: 160,
            boxShadow: "0 16px 48px rgba(0,0,0,0.40)",
            backdropFilter: "blur(20px)",
            bottom: "calc(100% + 8px)",
            right: 0,
          }}
        >
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: textColor }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { onRename(); setOpen(false); }}
          >
            <Pencil size={13} />
            重命名
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: textColor }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { onDuplicate(); setOpen(false); }}
          >
            <Copy size={13} />
            创建副本
          </button>
          <div style={{ height: 1, background: border, margin: "2px 0" }} />
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2.5 type-caption text-left transition-colors"
            style={{ color: "oklch(0.65 0.22 25)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.65 0.22 25 / 0.10)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => { onDelete(); setOpen(false); }}
          >
            <Trash2 size={13} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete Confirm Dialog ──────────────────────────────────────
function DeleteConfirmDialog({
  count, onConfirm, onCancel, isDark,
}: { count: number; onConfirm: () => void; onCancel: () => void; isDark: boolean }) {
  const bg = isDark ? "oklch(0.13 0.012 270)" : "oklch(0.97 0.004 270)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "oklch(0.85 0.008 270)" : "oklch(0.18 0.008 270)";
  const sub = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onCancel}>
      <div className="rounded-[var(--radius-lg-design)] p-6 w-80" style={{ background: bg, border: `1px solid ${border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-[var(--radius-lg-design)] flex items-center justify-center" style={{ background: "oklch(0.65 0.22 25 / 0.15)" }}>
            <Trash2 size={17} color="oklch(0.65 0.22 25)" />
          </div>
          <p className="type-body-sm" style={{ color: text, fontWeight: 540 }}>删除 {count} 个项目？</p>
        </div>
        <p className="type-caption mb-5 leading-relaxed" style={{ color: sub }}>
          此操作不可撤销，项目内的所有画布节点和素材将被永久删除。
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-[var(--radius-lg-design)] type-caption transition-opacity hover:opacity-80"
            style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", color: text }}>
            取消
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-[var(--radius-lg-design)] type-caption transition-opacity hover:opacity-90"
            style={{ background: "oklch(0.65 0.22 25)", color: "white" }}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Card ───────────────────────────────────────────────
function ProjectCard({
  project, selected, renaming, isDark,
  onOpen, onRename, onDuplicate, onDelete, onRenameSubmit, onSelect,
}: {
  project: WsProject;
  selected: boolean;
  renaming: boolean;
  isDark: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRenameSubmit: (name: string) => void;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const [editVal, setEditVal] = useState(project.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) { setEditVal(project.title); setTimeout(() => inputRef.current?.select(), 50); }
  }, [renaming, project.title]);

  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const cardBorder = selected
    ? "oklch(0.52 0.22 290)"
    : isDark ? "rgba(255,255,255,0.07)" : "oklch(0.88 0.006 255)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.50 0.012 255)";

  return (
    <div
      className="group relative rounded-[var(--radius-lg-design)] overflow-hidden cursor-pointer transition-all"
      style={{
        background: cardBg,
        border: `1.5px solid ${cardBorder}`,
        boxShadow: selected ? `0 0 0 2px oklch(0.62 0.22 290 / 0.3)` : "0 2px 12px rgba(0,0,0,0.15)",
        transform: selected ? "scale(0.98)" : "scale(1)",
        transition: "all 0.18s ease",
      }}
      onDoubleClick={onOpen}
      onClick={onSelect}
    >
      {/* Cover */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "4/3" }}>
        {project.cover ? (
          <img src={project.cover} alt={project.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.92 0.005 270)" }}>
            <FolderOpen size={32} style={{ color: sub }} />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.40)" }}>
          <span className="type-caption text-white px-3 py-1.5 rounded-[var(--radius-pill)]"
            style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
            双击打开
          </span>
        </div>
        {/* Selection checkbox */}
        {selected && (
          <div className="absolute top-2 left-2 w-5 h-5 rounded-[var(--radius-md-design)] flex items-center justify-center"
            style={{ background: "oklch(0.62 0.22 290)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            <Check size={12} color="white" strokeWidth={2.5} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        {renaming ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === "Enter") onRenameSubmit(editVal.trim() || project.title);
              if (e.key === "Escape") onRenameSubmit(project.title);
            }}
            onBlur={() => onRenameSubmit(editVal.trim() || project.title)}
            className="w-full bg-transparent type-caption outline-none border-b"
            style={{ color: text, borderColor: "oklch(0.62 0.22 290)" }}
          />
        ) : (
          <p className="type-caption truncate" style={{ color: text, textTransform: "none", letterSpacing: "0.02em" }}>{project.title}</p>
        )}
        {/* Time row + ... menu aligned */}
        <div className="flex items-center gap-1.5 mt-1">
          <Clock size={10} style={{ color: sub }} />
          <span className="type-caption" style={{ color: sub, fontSize: 11 }}>{project.updatedAt}</span>
          <span className="type-caption" style={{ color: sub, fontSize: 11 }}>· {project.nodeCount} 个节点</span>
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <CardMenu
              isDark={isDark}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Project Card ────────────────────────────────────────
function CreateProjectCard({ isDark, onCreate }: { isDark: boolean; onCreate: () => void }) {
  const bg = isDark ? "oklch(0.13 0.012 270)" : "oklch(0.97 0.004 270)";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)";
  return (
    <button
      onClick={onCreate}
      className="rounded-[var(--radius-lg-design)] overflow-hidden transition-all group"
      style={{ background: bg, border: `1.5px dashed ${border}` }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.62 0.22 290 / 0.5)";
        (e.currentTarget as HTMLElement).style.background = isDark ? "oklch(0.15 0.015 270)" : "oklch(0.95 0.006 270)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = border;
        (e.currentTarget as HTMLElement).style.background = bg;
      }}
    >
      <div className="flex flex-col items-center justify-center gap-2 py-10 px-4">
        <div className="w-10 h-10 rounded-[var(--radius-lg-design)] flex items-center justify-center transition-all group-hover:scale-110"
          style={{ background: "oklch(0.62 0.22 290 / 0.12)", color: "oklch(0.62 0.22 290)" }}>
          <Plus size={20} />
        </div>
        <span className="type-caption" style={{ color: text, textTransform: "none", letterSpacing: "0.02em" }}>新建项目</span>
      </div>
    </button>
  );
}

// ── Cover Picker Dialog ────────────────────────────────────────
function CoverPickerDialog({
  isDark, onPick, onClose,
}: { isDark: boolean; onPick: (cover: string | null) => void; onClose: () => void }) {
  const covers = [POSTER_1, POSTER_2, BRAND_KIT, SOCIAL_AD];
  const bg = isDark ? "oklch(0.13 0.012 270)" : "oklch(0.97 0.004 270)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "oklch(0.85 0.008 270)" : "oklch(0.18 0.008 270)";
  const [title, setTitle] = useState("未命名项目");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="rounded-[var(--radius-lg-design)] p-6 w-96" style={{ background: bg, border: `1px solid ${border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="type-body-sm" style={{ color: text, fontWeight: 540 }}>新建项目</p>
          <button onClick={onClose} className="w-7 h-7 rounded-[var(--radius-md-design)] flex items-center justify-center hover:opacity-70" style={{ color: text }}>
            <X size={15} />
          </button>
        </div>
        <div className="mb-4">
          <label className="type-caption mb-1.5 block" style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)" }}>项目名称</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-[var(--radius-lg-design)] type-caption outline-none"
            style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${border}`, color: text }}
            placeholder="输入项目名称..."
            autoFocus
          />
        </div>
        <div className="mb-5">
          <label className="type-caption mb-1.5 block" style={{ color: isDark ? "oklch(0.55 0.01 270)" : "oklch(0.50 0.01 270)" }}>选择封面（可选）</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSelected(null)}
              className="aspect-video rounded-[var(--radius-md-design)] flex items-center justify-center transition-all"
              style={{ background: isDark ? "oklch(0.16 0.015 270)" : "oklch(0.92 0.005 270)", border: `1.5px solid ${selected === null ? "oklch(0.62 0.22 290)" : border}` }}
            >
              <ImageIcon size={14} style={{ color: isDark ? "oklch(0.45 0.01 270)" : "oklch(0.55 0.01 270)" }} />
            </button>
            {covers.map(src => (
              <button key={src} onClick={() => setSelected(src)} className="aspect-video rounded-[var(--radius-md-design)] overflow-hidden transition-all"
                style={{ border: `1.5px solid ${selected === src ? "oklch(0.62 0.22 290)" : border}` }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-[var(--radius-lg-design)] type-caption hover:opacity-80 transition-opacity"
            style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", color: text }}>
            取消
          </button>
          <button onClick={() => onPick(selected)} className="flex-1 py-2 rounded-[var(--radius-lg-design)] type-caption hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))", color: "white" }}>
            创建项目
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function WorkspaceDashboard() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [projects, setProjects] = useState<WsProject[]>(INITIAL_PROJECTS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lassoRef = useRef<{ startX: number; startY: number; active: boolean }>({ startX: 0, startY: 0, active: false });
  const [lasso, setLasso] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const bg = isDark ? "oklch(0.09 0.012 270)" : "oklch(0.975 0.004 80)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.50 0.012 255)";

  const handleCreate = useCallback((cover: string | null) => {
    const newP: WsProject = { id: uid(), title: "未命名项目", cover, updatedAt: "刚刚", nodeCount: 0 };
    setProjects(ps => [newP, ...ps]);
    setShowCreate(false);
    setRenamingId(newP.id);
    toast("项目已创建", { description: "点击名称可重命名" });
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    setProjects(ps => ps.map(p => p.id === id ? { ...p, title: name } : p));
    setRenamingId(null);
  }, []);

  const handleDuplicate = useCallback((id: string) => {
    setProjects(ps => {
      const src = ps.find(p => p.id === id);
      if (!src) return ps;
      const copy: WsProject = { ...src, id: uid(), title: `${src.title} 副本`, updatedAt: "刚刚" };
      const idx = ps.findIndex(p => p.id === id);
      const next = [...ps];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    toast("副本已创建");
  }, []);

  const handleDelete = useCallback((ids: string[]) => {
    setDeleteConfirm(ids);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    setProjects(ps => ps.filter(p => !deleteConfirm!.includes(p.id)));
    setSelectedIds(new Set());
    setDeleteConfirm(null);
    toast(`已删除 ${deleteConfirm.length} 个项目`);
  }, [deleteConfirm]);

  const handleCardSelect = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        next.has(id) ? next.delete(id) : next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.clear();
        else { next.clear(); next.add(id); }
      }
      return next;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".project-card")) return;
    if (e.button !== 0) return;
    const rect = containerRef.current!.getBoundingClientRect();
    lassoRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, active: true };
    setSelectedIds(new Set());
    setLasso(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!lassoRef.current.active) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { startX, startY } = lassoRef.current;
    setLasso({ x: Math.min(cx, startX), y: Math.min(cy, startY), w: Math.abs(cx - startX), h: Math.abs(cy - startY) });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!lassoRef.current.active || !lasso) { lassoRef.current.active = false; setLasso(null); return; }
    lassoRef.current.active = false;
    const cards = containerRef.current?.querySelectorAll("[data-project-id]");
    const selected = new Set<string>();
    cards?.forEach(card => {
      const id = (card as HTMLElement).dataset.projectId!;
      const r = card.getBoundingClientRect();
      const cr = containerRef.current!.getBoundingClientRect();
      const cx = r.left - cr.left; const cy = r.top - cr.top;
      if (cx < lasso.x + lasso.w && cx + r.width > lasso.x && cy < lasso.y + lasso.h && cy + r.height > lasso.y) selected.add(id);
    });
    if (selected.size > 0) setSelectedIds(selected);
    setLasso(null);
  }, [lasso]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, transition: "background 0.25s ease" }}>
      <TopBar credits={75} />

      <div className="flex-1 overflow-y-auto px-8 py-6 select-none" ref={containerRef}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        style={{ position: "relative" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="type-headline" style={{ color: text }}>工作台</h1>
            <p className="type-caption mt-0.5" style={{ color: sub }}>{projects.length} 个项目</p>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="type-caption" style={{ color: sub }}>已选 {selectedIds.size} 个</span>
              <button
                onClick={() => handleDelete(Array.from(selectedIds))}
                className="type-caption flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-lg-design)] transition-opacity hover:opacity-80"
                style={{ background: "oklch(0.65 0.22 25 / 0.15)", color: "oklch(0.65 0.22 25)" }}
              >
                <Trash2 size={13} />
                删除所选
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="type-caption flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-lg-design)] transition-opacity hover:opacity-80"
                style={{ background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", color: sub }}
              >
                <X size={13} />
                取消选择
              </button>
            </div>
          )}
        </div>

        {/* Project Grid */}
        <div className="grid gap-7" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <CreateProjectCard isDark={isDark} onCreate={() => setShowCreate(true)} />
          {projects.map(project => (
            <div key={project.id} data-project-id={project.id} className="project-card">
              <ProjectCard
                project={project}
                selected={selectedIds.has(project.id)}
                renaming={renamingId === project.id}
                isDark={isDark}
                onOpen={() => navigate(`/project/${project.id}`)}
                onRename={() => setRenamingId(project.id)}
                onDuplicate={() => handleDuplicate(project.id)}
                onDelete={() => handleDelete([project.id])}
                onRenameSubmit={name => handleRename(project.id, name)}
                onSelect={e => handleCardSelect(e, project.id)}
              />
            </div>
          ))}
        </div>

        {/* Lasso box */}
        {lasso && lasso.w > 4 && lasso.h > 4 && (
          <div className="absolute pointer-events-none rounded-[var(--radius-md-design)]"
            style={{ left: lasso.x, top: lasso.y, width: lasso.w, height: lasso.h, border: "1.5px solid oklch(0.62 0.22 290)", background: "oklch(0.62 0.22 290 / 0.08)", zIndex: 20 }}
          />
        )}
      </div>

      {showCreate && <CoverPickerDialog isDark={isDark} onPick={handleCreate} onClose={() => setShowCreate(false)} />}
      {deleteConfirm && <DeleteConfirmDialog count={deleteConfirm.length} onConfirm={confirmDelete} onCancel={() => setDeleteConfirm(null)} isDark={isDark} />}
    </div>
  );
}
