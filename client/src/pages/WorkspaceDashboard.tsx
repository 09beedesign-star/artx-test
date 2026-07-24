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
import CreateProjectDialog, { type CreateProjectPayload } from "@/components/workspace/CreateProjectDialog";
import {
  Plus, MoreHorizontal, Pencil, Copy, Trash2,
  FolderOpen, Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  createWorkspaceHistoryProject,
  readWorkspaceProjectHistory,
  removeWorkspaceProjectHistory,
  touchWorkspaceProjectHistory,
  updateWorkspaceProjectHistory,
  upsertWorkspaceProjectHistory,
  type WorkspaceHistoryProject,
} from "@/lib/project-history";

// ── Types ──────────────────────────────────────────────────────
interface WsProject {
  id: string;
  title: string;
  cover: string | null;
  updatedAt: string;
  nodeCount: number;
  createdAt?: string;
  deliveryAt?: string;
  owner?: string;
  note?: string;
  socialPresetId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

const WORKSPACE_CARD_COVER_ASPECT_RATIO = "4/3";
const WORKSPACE_CARD_INFO_HEIGHT = 96;
const WORKSPACE_PROJECT_GRID_COLUMNS = "repeat(auto-fit, minmax(320px, 1fr))";

function fromHistoryProject(project: WorkspaceHistoryProject): WsProject {
  return {
    id: project.id,
    title: project.title,
    cover: project.cover,
    updatedAt: project.updatedAt,
    nodeCount: project.nodeCount,
    createdAt: project.createdAt,
    socialPresetId: project.socialPresetId,
    canvasWidth: project.canvasWidth,
    canvasHeight: project.canvasHeight,
  };
}

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

  const bg = isDark ? "#222222" : "rgba(248,248,252,0.97)";
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
          color: isDark ? "oklch(0.69 0.010 270)" : "oklch(0.65 0.010 255)",
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
  const bg = isDark ? "#222222" : "oklch(0.97 0.004 270)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "oklch(0.85 0.008 270)" : "oklch(0.18 0.008 270)";
  const sub = isDark ? "oklch(0.69 0.010 270)" : "oklch(0.65 0.010 270)";

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
  project, renaming, isDark,
  onOpen, onRename, onDuplicate, onDelete, onRenameSubmit,
}: {
  project: WsProject;
  renaming: boolean;
  isDark: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRenameSubmit: (name: string) => void;
}) {
  const [editVal, setEditVal] = useState(project.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) { setEditVal(project.title); setTimeout(() => inputRef.current?.select(), 50); }
  }, [renaming, project.title]);

  const cardBg = isDark ? "#222222" : "oklch(1 0 0)";
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "oklch(0.88 0.006 255)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.65 0.010 270)" : "oklch(0.65 0.010 255)";

  return (
    <div
      className="group relative rounded-[var(--radius-lg-design)] overflow-hidden cursor-pointer transition-all"
      style={{
        width: "100%",
        background: cardBg,
        border: `1.5px solid ${cardBorder}`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        transition: "all 0.18s ease",
      }}
      onClick={onOpen}
    >
      {/* Cover */}
      <div className="relative overflow-hidden" style={{ aspectRatio: WORKSPACE_CARD_COVER_ASPECT_RATIO }}>
        {project.cover ? (
          <img
            src={project.cover}
            alt={project.title}
            className="w-full h-auto origin-top object-contain object-top transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: isDark ? "#222222" : "oklch(0.92 0.005 270)" }}>
            <FolderOpen size={32} style={{ color: sub }} />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.40)" }}>
          <span className="type-caption text-white px-3 py-1.5 rounded-[var(--radius-pill)]"
            style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
            单击打开
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5" style={{ height: WORKSPACE_CARD_INFO_HEIGHT }}>
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
  const bg = isDark ? "#222222" : "oklch(0.97 0.004 270)";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "oklch(0.69 0.010 270)" : "oklch(0.65 0.010 270)";
  return (
    <button
      onClick={onCreate}
      className="rounded-[var(--radius-lg-design)] overflow-hidden transition-all group"
      style={{
        width: "100%",
        background: bg,
        border: `1.5px dashed ${border}`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.62 0.22 290 / 0.5)";
        (e.currentTarget as HTMLElement).style.background = isDark ? "#222222" : "oklch(0.95 0.006 270)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = border;
        (e.currentTarget as HTMLElement).style.background = bg;
      }}
    >
      <div className="flex items-center justify-center" style={{ aspectRatio: WORKSPACE_CARD_COVER_ASPECT_RATIO }}>
        <div className="w-10 h-10 rounded-[var(--radius-lg-design)] flex items-center justify-center transition-all group-hover:scale-110"
          style={{ background: "oklch(0.62 0.22 290 / 0.12)", color: "oklch(0.62 0.22 290)" }}>
          <Plus size={20} />
        </div>
      </div>
      <div className="px-3 py-2.5" style={{ height: WORKSPACE_CARD_INFO_HEIGHT }}>
        <span className="type-caption" style={{ color: text, textTransform: "none", letterSpacing: "0.02em" }}>新建画板</span>
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function WorkspaceDashboard() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [projects, setProjects] = useState<WsProject[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);

  const bg = isDark ? "#222222" : "oklch(0.975 0.004 80)";
  const text = isDark ? "oklch(0.82 0.008 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.65 0.010 270)" : "oklch(0.65 0.010 255)";

  useEffect(() => {
    const historyProjects = readWorkspaceProjectHistory().map(fromHistoryProject);
    setProjects(historyProjects);
  }, []);

  const handleCreate = useCallback((payload: CreateProjectPayload) => {
    const historyProject = createWorkspaceHistoryProject(payload.name);
    const newP: WsProject = {
      ...fromHistoryProject({
        ...historyProject,
        cover: payload.cover,
      }),
      deliveryAt: payload.deliveryAt,
      owner: payload.owner,
      note: payload.note,
    };
    upsertWorkspaceProjectHistory({
      id: newP.id,
      title: newP.title,
      cover: newP.cover,
      updatedAt: newP.updatedAt,
      nodeCount: newP.nodeCount,
      createdAt: newP.createdAt || newP.updatedAt,
      socialPresetId: newP.socialPresetId,
      canvasWidth: newP.canvasWidth,
      canvasHeight: newP.canvasHeight,
    });
    setProjects(ps => [newP, ...ps]);
    setShowCreate(false);
    toast("项目已创建", { description: payload.name });
    navigate(`/project/${newP.id}`);
  }, [navigate]);

  const handleRename = useCallback((id: string, name: string) => {
    setProjects(ps => ps.map(p => p.id === id ? { ...p, title: name } : p));
    updateWorkspaceProjectHistory(id, { title: name });
    setRenamingId(null);
  }, []);

  const handleDuplicate = useCallback((id: string) => {
    setProjects(ps => {
      const src = ps.find(p => p.id === id);
      if (!src) return ps;
      const historyProject = createWorkspaceHistoryProject(`${src.title} 副本`);
      const copy: WsProject = { ...src, id: historyProject.id, title: historyProject.title, updatedAt: historyProject.updatedAt, createdAt: historyProject.createdAt };
      upsertWorkspaceProjectHistory({
        id: copy.id,
        title: copy.title,
        cover: copy.cover,
        updatedAt: copy.updatedAt,
        nodeCount: copy.nodeCount,
        createdAt: copy.createdAt || copy.updatedAt,
      });
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
    removeWorkspaceProjectHistory(deleteConfirm);
    setDeleteConfirm(null);
    toast(`已删除 ${deleteConfirm.length} 个项目`);
  }, [deleteConfirm]);

  const handleOpenProject = useCallback((id: string) => {
    touchWorkspaceProjectHistory(id);
    setProjects(readWorkspaceProjectHistory().map(fromHistoryProject));
    navigate(`/project/${id}`);
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, transition: "background 0.25s ease" }}>
      <TopBar credits={0} onNewProjectClick={() => setShowCreate(true)} onCreateProject={handleCreate} glass />

      <div className="flex-1 overflow-y-auto px-8 py-6 select-none" style={{ position: "relative" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="type-headline" style={{ color: text }}>工作台</h1>
            <p className="type-caption mt-0.5" style={{ color: sub }}>{projects.length} 个项目</p>
          </div>
        </div>

        {/* Project Grid */}
        <div className="grid gap-7" style={{ gridTemplateColumns: WORKSPACE_PROJECT_GRID_COLUMNS }}>
          <div className="project-card">
            <CreateProjectCard isDark={isDark} onCreate={() => setShowCreate(true)} />
          </div>
          {projects.map(project => (
            <div key={project.id} data-project-id={project.id} className="project-card">
              <ProjectCard
                project={project}
                renaming={renamingId === project.id}
                isDark={isDark}
                onOpen={() => handleOpenProject(project.id)}
                onRename={() => setRenamingId(project.id)}
                onDuplicate={() => handleDuplicate(project.id)}
                onDelete={() => handleDelete([project.id])}
                onRenameSubmit={name => handleRename(project.id, name)}
              />
            </div>
          ))}
        </div>

      </div>

      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} onCreate={handleCreate} title="新建画布" />
      {deleteConfirm && <DeleteConfirmDialog count={deleteConfirm.length} onConfirm={confirmDelete} onCancel={() => setDeleteConfirm(null)} isDark={isDark} />}
    </div>
  );
}
