/**
 * WorkspaceDashboard — 工作台（三级结构：工作台 → 项目 → 画板）
 *
 * - 根层 `/workspace`：项目卡片网格 + 「未归类画板」
 * - 项目内 `/workspace?p=<folderId>`：该项目的画板网格 / 列表
 * - 画板点击进 `/project/<boardId>`（画布本身）
 *
 * 层级事实源：
 * - 项目（文件夹）→ `@/lib/project-folders`
 * - 画板 → `@/lib/project-history`（记录自带 folderId / folderName）
 *
 * ⚠️ 新建入口：根层放「新建项目」，项目内放「新建画布 / 导入文件」。
 *    侧边栏「新创作」是全局入口，创建画板时若已在某个项目内则直接落在该项目。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useSearch } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import {
  ChevronRight, Copy, FolderOpen, FolderPlus, Image as ImageIcon,
  LayoutGrid, List, MoreHorizontal, Pencil, Plus, Star, Trash2, Upload, X,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  assignWorkspaceProjectsToFolder,
  createWorkspaceHistoryProject,
  removeWorkspaceProjectHistory,
  setWorkspaceProjectCover,
  setWorkspaceProjectStarred,
  touchWorkspaceProjectHistory,
  updateWorkspaceProjectHistory,
  upsertWorkspaceProjectHistory,
  type WorkspaceHistoryProject,
} from "@/lib/project-history";
import {
  createWorkspaceFolder,
  deleteWorkspaceFolders,
  listUnfiledBoards,
  listWorkspaceFolders,
  renameWorkspaceFolder,
  touchWorkspaceFolder,
  WORKSPACE_FOLDERS_UPDATED_EVENT,
  type WorkspaceFolderSummary,
} from "@/lib/project-folders";
import { resolveProjectCoverUrl, WORKSPACE_PROJECTS_UPDATED_EVENT } from "@/lib/workspace-sync";
import { fileToDataUrl } from "@/lib/feedback-submit";
import { writeHomePromptHandoff } from "@/lib/home-prompt-handoff";

// ── Design tokens ──────────────────────────────────────────────
const COVER_ASPECT_RATIO = "3 / 2";
const BOARD_GRID_COLUMNS = "repeat(auto-fill, minmax(196px, 1fr))";
const FOLDER_GRID_COLUMNS = "repeat(auto-fill, minmax(232px, 1fr))";
const MAX_IMPORT_FILES = 6;

function useTokens() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return useMemo(() => ({
    isDark,
    page: isDark ? "#0f0f0f" : "#ffffff",
    text: isDark ? "#f2f2f4" : "#161616",
    sub: isDark ? "#8a8a90" : "#82807d",
    faint: isDark ? "#6a6a70" : "#a4a4a4",
    card: isDark ? "#191919" : "#ffffff",
    cardHover: isDark ? "#202020" : "#fbfbfa",
    border: isDark ? "rgba(255,255,255,0.10)" : "rgba(22,22,22,0.10)",
    borderHover: isDark ? "rgba(255,255,255,0.22)" : "rgba(22,22,22,0.22)",
    raised: isDark ? "rgba(255,255,255,0.05)" : "rgba(22,22,22,0.04)",
    raisedHover: isDark ? "rgba(255,255,255,0.09)" : "rgba(22,22,22,0.07)",
    placeholder: isDark ? "#141414" : "#f4f4f2",
    popover: isDark ? "#1e1e1e" : "#ffffff",
    danger: "#c0392b",
  }), [isDark]);
}

type Tokens = ReturnType<typeof useTokens>;

function formatDate(value?: string) {
  if (!value) return "—";
  return value.slice(0, 10);
}

function boardMeta(board: WorkspaceHistoryProject) {
  const size = board.nodeCount > 0 ? `${board.nodeCount} 个元素` : "空白画板";
  return `${size} · 最近修改 ${formatDate(board.updatedAt)}`;
}

// ── Dropdown menu (轻量，自绘，保证卡片内定位) ──────────────────
interface MenuItem {
  icon: React.ElementType;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * 卡片「…」菜单 —— 挂到 document.body，浮在容器上层。
 *
 * ⚠️⚠️ 原来菜单是卡片内的 `absolute` + `bottom: calc(100% + 6px)`：
 * 画板卡片、封面缩略图、外层滚动区全都带 `overflow:hidden/auto`，
 * 菜单一往上展开就被最近那层裁掉顶部（截图里「重命名」只剩半行）。
 * 单纯的 z-index 救不了裁剪 —— **overflow 裁剪不看 z-index**。
 * ✅ portal 到 body + `position: fixed` 按触发按钮的视口坐标定位。
 *
 * ⚠️ 换 portal 后必须一起处理三件事，否则会静默坏掉：
 *   1. 点外部关闭要同时认「触发按钮」和「菜单本体」（DOM 上已不是父子）；
 *   2. 滚动 / resize 时重新定位（fixed 不跟随滚动）；
 *   3. 菜单里每项 stopPropagation —— portal 的事件沿 **React 树**冒泡，
 *      仍会冒到画板卡片的 onClick 上，不拦就会「点删除顺带打开了画板」。
 */
const CARD_MENU_WIDTH = 156;
const CARD_MENU_GAP = 6;
const CARD_MENU_VIEWPORT_PADDING = 8;

function CardMenu({ t, items, align = "right" }: { t: Tokens; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight || items.length * 36 + 8;
    // 上方放得下就往上弹（原行为），放不下就翻到按钮下方，再夹进视口。
    const fitsAbove = rect.top - height - CARD_MENU_GAP >= CARD_MENU_VIEWPORT_PADDING;
    const top = fitsAbove
      ? rect.top - height - CARD_MENU_GAP
      : Math.min(
          rect.bottom + CARD_MENU_GAP,
          window.innerHeight - height - CARD_MENU_VIEWPORT_PADDING
        );
    const rawLeft = align === "right" ? rect.right - CARD_MENU_WIDTH : rect.left;
    const left = Math.max(
      CARD_MENU_VIEWPORT_PADDING,
      Math.min(rawLeft, window.innerWidth - CARD_MENU_WIDTH - CARD_MENU_VIEWPORT_PADDING)
    );
    setPosition({ top: Math.max(CARD_MENU_VIEWPORT_PADDING, top), left });
  }, [align, items.length]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // capture=true：卡片列表在内部滚动容器里，冒泡监听收不到 scroll。
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    // 延迟挂载：否则触发菜单的那一次点击会立刻被判定为「点在外面」
    const timer = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const menu = open && typeof document !== "undefined" ? (
    <div
      ref={menuRef}
      data-card-menu=""
      className="overflow-hidden rounded-xl py-1"
      style={{
        position: "fixed",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        minWidth: CARD_MENU_WIDTH,
        // 首帧还没量到高度，先藏起来，避免菜单从 (0,0) 闪一下
        visibility: position ? "visible" : "hidden",
        zIndex: 9999,
        background: t.popover,
        border: `1px solid ${t.border}`,
        boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
      }}
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
    >
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          onClick={event => { event.stopPropagation(); item.onSelect(); setOpen(false); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
          style={{ color: item.danger ? t.danger : t.text, fontSize: 12.5 }}
          onMouseEnter={event => { event.currentTarget.style.background = t.raised; }}
          onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}
        >
          <item.icon size={13.5} strokeWidth={1.6} />
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="relative" onClick={event => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="更多操作"
        onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
        style={{
          background: open ? t.raisedHover : "transparent",
          color: t.sub,
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

// ── 空画板缩略图（一张淡淡的空白页，和参考站点的线框占位一致）────
function EmptyCover({ t }: { t: Tokens }) {
  const line = t.isDark ? "rgba(255,255,255,0.10)" : "rgba(22,22,22,0.07)";
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: t.placeholder }}>
      <div
        className="flex flex-col justify-start gap-[5px] rounded-[4px] px-3 pt-3"
        style={{
          width: "56%",
          aspectRatio: "4 / 3",
          background: t.isDark ? "rgba(255,255,255,0.045)" : "#ffffff",
          border: `1px solid ${t.border}`,
        }}
      >
        <div className="rounded-[2px]" style={{ height: 5, width: "46%", background: line }} />
        <div className="rounded-[2px]" style={{ height: 4, width: "100%", background: line }} />
        <div className="rounded-[2px]" style={{ height: 4, width: "72%", background: line }} />
      </div>
    </div>
  );
}

// ── 画板卡片（网格） ───────────────────────────────────────────
function BoardCard({
  t, board, renaming, onOpen, onRename, onRenameSubmit, menuItems,
}: {
  t: Tokens;
  board: WorkspaceHistoryProject;
  renaming: boolean;
  onOpen: () => void;
  onRename: () => void;
  onRenameSubmit: (name: string) => void;
  menuItems: MenuItem[];
}) {
  const [draft, setDraft] = useState(board.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(board.title);
    const timer = window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    return () => window.clearTimeout(timer);
  }, [renaming, board.title]);

  return (
    <div
      data-board-id={board.id}
      onClick={onOpen}
      className="group relative cursor-pointer overflow-hidden rounded-[10px] transition-all"
      style={{ background: t.card, border: `1px solid ${t.border}` }}
      onMouseEnter={event => { event.currentTarget.style.borderColor = t.borderHover; }}
      onMouseLeave={event => { event.currentTarget.style.borderColor = t.border; }}
    >
      {/* 封面 */}
      <div className="relative overflow-hidden" style={{ aspectRatio: COVER_ASPECT_RATIO }}>
        {board.cover ? (
          <img
            src={resolveProjectCoverUrl(board.cover) ?? undefined}
            alt={board.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <EmptyCover t={t} />
        )}

        {/* 收藏星标：收藏后常驻，未收藏 hover 才出现 */}
        <button
          type="button"
          aria-label={board.starred ? "取消收藏" : "收藏画板"}
          onClick={event => {
            event.stopPropagation();
            setWorkspaceProjectStarred(board.id, !board.starred);
          }}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition-all ${
            board.starred ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{
            background: t.isDark ? "rgba(20,20,20,0.72)" : "rgba(255,255,255,0.92)",
            border: `1px solid ${t.border}`,
            color: board.starred ? t.text : t.sub,
          }}
        >
          <Star size={14} strokeWidth={1.6} fill={board.starred ? "currentColor" : "none"} />
        </button>
      </div>

      {/* 信息 */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => {
                  if (event.key === "Enter") onRenameSubmit(draft.trim() || board.title);
                  if (event.key === "Escape") onRenameSubmit(board.title);
                }}
                onBlur={() => onRenameSubmit(draft.trim() || board.title)}
                className="w-full bg-transparent outline-none"
                style={{ color: t.text, fontSize: 13, borderBottom: `1px solid ${t.text}` }}
              />
            ) : (
              <p
                className="truncate"
                style={{ color: t.text, fontSize: 13, fontWeight: 550, letterSpacing: "-0.01em" }}
                onDoubleClick={event => { event.stopPropagation(); onRename(); }}
                title="双击重命名画板"
              >
                {board.title}
              </p>
            )}
          </div>
          <div className="-mr-1 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <CardMenu t={t} items={menuItems} />
          </div>
        </div>
        {/* ⚠️ 元信息单独占一行：和「...」同一行时会被挤成「最近修改 2026-1…」，日期永远看不全 */}
        <p className="mt-0.5 truncate" style={{ color: t.sub, fontSize: 11, letterSpacing: "-0.005em" }}>
          {boardMeta(board)}
        </p>
      </div>
    </div>
  );
}

// ── 画板行（列表视图） ────────────────────────────────────────
function BoardRow({
  t, board, renaming, onOpen, onRename, onRenameSubmit, menuItems,
}: {
  t: Tokens;
  board: WorkspaceHistoryProject;
  renaming: boolean;
  onOpen: () => void;
  onRename: () => void;
  onRenameSubmit: (name: string) => void;
  menuItems: MenuItem[];
}) {
  const [draft, setDraft] = useState(board.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(board.title);
    const timer = window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    return () => window.clearTimeout(timer);
  }, [renaming, board.title]);

  return (
    <div
      data-board-id={board.id}
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 transition-colors"
      style={{ border: `1px solid ${t.border}`, background: t.card }}
      onMouseEnter={event => { event.currentTarget.style.borderColor = t.borderHover; }}
      onMouseLeave={event => { event.currentTarget.style.borderColor = t.border; }}
    >
      <div className="h-10 w-14 flex-shrink-0 overflow-hidden rounded-md" style={{ border: `1px solid ${t.border}` }}>
        {board.cover
          ? <img src={resolveProjectCoverUrl(board.cover) ?? undefined} alt="" className="h-full w-full object-cover" />
          : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: t.placeholder }}>
              <ImageIcon size={13} strokeWidth={1.4} style={{ color: t.faint }} />
            </div>
          )}
      </div>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === "Enter") onRenameSubmit(draft.trim() || board.title);
              if (event.key === "Escape") onRenameSubmit(board.title);
            }}
            onBlur={() => onRenameSubmit(draft.trim() || board.title)}
            className="w-full bg-transparent outline-none"
            style={{ color: t.text, fontSize: 13, borderBottom: `1px solid ${t.text}` }}
          />
        ) : (
          <p className="truncate" style={{ color: t.text, fontSize: 13, fontWeight: 550 }}>{board.title}</p>
        )}
        <p className="truncate" style={{ color: t.sub, fontSize: 11 }}>{boardMeta(board)}</p>
      </div>
      <button
        type="button"
        aria-label={board.starred ? "取消收藏" : "收藏画板"}
        onClick={event => { event.stopPropagation(); setWorkspaceProjectStarred(board.id, !board.starred); }}
        className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
        style={{ color: board.starred ? t.text : t.faint }}
      >
        <Star size={14} strokeWidth={1.6} fill={board.starred ? "currentColor" : "none"} />
      </button>
      <CardMenu t={t} items={menuItems} />
    </div>
  );
}

// ── 项目卡片（根层） ──────────────────────────────────────────
function FolderCard({
  t, folder, renaming, onOpen, onRename, onRenameSubmit, menuItems,
}: {
  t: Tokens;
  folder: WorkspaceFolderSummary;
  renaming: boolean;
  onOpen: () => void;
  onRename: () => void;
  onRenameSubmit: (name: string) => void;
  menuItems: MenuItem[];
}) {
  const [draft, setDraft] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(folder.name);
    const timer = window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    return () => window.clearTimeout(timer);
  }, [renaming, folder.name]);

  const covers = folder.covers.filter(Boolean).slice(0, 4);

  return (
    <div
      data-folder-id={folder.id}
      onClick={onOpen}
      className="group relative cursor-pointer overflow-hidden rounded-[10px] transition-all"
      style={{ background: t.card, border: `1px solid ${t.border}` }}
      onMouseEnter={event => { event.currentTarget.style.borderColor = t.borderHover; }}
      onMouseLeave={event => { event.currentTarget.style.borderColor = t.border; }}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: COVER_ASPECT_RATIO }}>
        {covers.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center" style={{ background: t.placeholder }}>
            <FolderOpen size={26} strokeWidth={1.2} style={{ color: t.faint }} />
          </div>
        ) : covers.length === 1 ? (
          <img
            src={resolveProjectCoverUrl(covers[0]) ?? undefined}
            alt={folder.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px" style={{ background: t.border }}>
            {[0, 1, 2, 3].map(index => (
              <div key={index} className="overflow-hidden" style={{ background: t.placeholder }}>
                {covers[index] ? (
                  <img src={resolveProjectCoverUrl(covers[index]) ?? undefined} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
          <CardMenu t={t} items={menuItems} />
        </div>
      </div>

      <div className="px-3 py-2.5">
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === "Enter") onRenameSubmit(draft.trim() || folder.name);
              if (event.key === "Escape") onRenameSubmit(folder.name);
            }}
            onBlur={() => onRenameSubmit(draft.trim() || folder.name)}
            className="w-full bg-transparent outline-none"
            style={{ color: t.text, fontSize: 13, borderBottom: `1px solid ${t.text}` }}
          />
        ) : (
          <p
            className="truncate"
            style={{ color: t.text, fontSize: 13, fontWeight: 550, letterSpacing: "-0.01em" }}
            onDoubleClick={event => { event.stopPropagation(); onRename(); }}
          >
            {folder.name}
          </p>
        )}
        <p className="mt-1 truncate" style={{ color: t.sub, fontSize: 11 }}>
          {folder.boardCount} 块画板 · 更新于 {formatDate(folder.updatedAt)}
        </p>
      </div>
    </div>
  );
}

// ── 删除确认 ──────────────────────────────────────────────────
function DeleteConfirmDialog({
  t, title, description, confirmLabel, onConfirm, onCancel,
}: {
  t: Tokens;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.42)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      <div
        className="w-[360px] rounded-2xl p-6"
        style={{ background: t.popover, border: `1px solid ${t.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
        onClick={event => event.stopPropagation()}
      >
        <p style={{ color: t.text, fontSize: 15, fontWeight: 600 }}>{title}</p>
        <p className="mt-2 leading-6" style={{ color: t.sub, fontSize: 12.5 }}>{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-full px-4 transition-colors"
            style={{ border: `1px solid ${t.border}`, color: t.text, fontSize: 12.5 }}
            onMouseEnter={event => { event.currentTarget.style.background = t.raised; }}
            onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-full px-4 transition-opacity hover:opacity-85"
            style={{ background: t.danger, color: "#ffffff", fontSize: 12.5, fontWeight: 550 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 移动画板到项目 ────────────────────────────────────────────
function MoveBoardDialog({
  t, board, folders, onClose, onMove,
}: {
  t: Tokens;
  board: WorkspaceHistoryProject;
  folders: WorkspaceFolderSummary[];
  onClose: () => void;
  onMove: (folder: WorkspaceFolderSummary | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.42)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-[380px] overflow-hidden rounded-2xl"
        style={{ background: t.popover, border: `1px solid ${t.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <p style={{ color: t.text, fontSize: 14, fontWeight: 600 }}>移动到项目</p>
            <p className="mt-1 truncate" style={{ color: t.sub, fontSize: 11.5 }}>{board.title}</p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: t.sub, border: `1px solid ${t.border}` }}
          >
            <X size={13} />
          </button>
        </div>
        <div className="max-h-[300px] overflow-y-auto px-2 pb-2">
          {folders.length === 0 && (
            <p className="px-3 py-6 text-center" style={{ color: t.sub, fontSize: 12 }}>
              还没有项目，先在根层新建一个项目
            </p>
          )}
          {folders.map(folder => (
            <button
              key={folder.id}
              type="button"
              onClick={() => onMove(folder)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors"
              style={{ color: t.text, fontSize: 12.5 }}
              onMouseEnter={event => { event.currentTarget.style.background = t.raised; }}
              onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}
            >
              <FolderOpen size={14} strokeWidth={1.6} style={{ color: t.sub }} />
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto flex-shrink-0" style={{ color: t.faint, fontSize: 11 }}>
                {folder.boardCount}
              </span>
            </button>
          ))}
        </div>
        {board.folderId && (
          <div className="px-2 pb-3">
            <button
              type="button"
              onClick={() => onMove(null)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors"
              style={{ color: t.sub, fontSize: 12.5 }}
              onMouseEnter={event => { event.currentTarget.style.background = t.raised; }}
              onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}
            >
              <X size={14} strokeWidth={1.6} />
              移出项目（变成未归类）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
type SortKey = "recent" | "created" | "name";
type TypeFilter = "all" | "filled" | "empty";
type PendingDelete =
  | { kind: "folder"; id: string; name: string; boardCount: number }
  | { kind: "board"; id: string; name: string };

export default function WorkspaceDashboard() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const t = useTokens();

  const activeFolderId = useMemo(() => new URLSearchParams(search).get("p"), [search]);

  const [folders, setFolders] = useState<WorkspaceFolderSummary[]>([]);
  const [unfiled, setUnfiled] = useState<WorkspaceHistoryProject[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [movingBoard, setMovingBoard] = useState<WorkspaceHistoryProject | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setFolders(listWorkspaceFolders());
    setUnfiled(listUnfiledBoards());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(WORKSPACE_PROJECTS_UPDATED_EVENT, refresh);
    window.addEventListener(WORKSPACE_FOLDERS_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(WORKSPACE_PROJECTS_UPDATED_EVENT, refresh);
      window.removeEventListener(WORKSPACE_FOLDERS_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  // 别的设备同步回来的收藏态、画板增删都要反映到卡片上
  useEffect(() => { refresh(); }, [activeFolderId, refresh]);

  const activeFolder = useMemo(
    () => (activeFolderId ? folders.find(folder => folder.id === activeFolderId) ?? null : null),
    [folders, activeFolderId]
  );

  const visibleBoards = useMemo(() => {
    if (!activeFolder) return [];
    const list = activeFolder.boards.filter(board => {
      if (typeFilter === "filled") return board.nodeCount > 0;
      if (typeFilter === "empty") return board.nodeCount === 0;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.title.localeCompare(b.title, "zh-Hans-CN");
      if (sortKey === "created") return (b.createdAt || "").localeCompare(a.createdAt || "");
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }, [activeFolder, typeFilter, sortKey]);

  // ── 项目操作 ────────────────────────────────────────────────
  const handleCreateFolder = useCallback(() => {
    const folder = createWorkspaceFolder();
    refresh();
    navigate(`/workspace?p=${folder.id}`);
  }, [navigate, refresh]);

  const handleRenameFolder = useCallback((id: string, name: string) => {
    renameWorkspaceFolder(id, name);
    setRenamingId(null);
    refresh();
  }, [refresh]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "board") {
      removeWorkspaceProjectHistory([pendingDelete.id]);
      toast("画板已删除");
    } else {
      const { deletedBoardIds } = deleteWorkspaceFolders([pendingDelete.id], "delete-boards");
      if (deletedBoardIds.length > 0) removeWorkspaceProjectHistory(deletedBoardIds);
      toast("项目已删除", {
        description: deletedBoardIds.length > 0 ? `同时删除了 ${deletedBoardIds.length} 块画板` : undefined,
      });
      if (activeFolderId === pendingDelete.id) navigate("/workspace");
    }
    setPendingDelete(null);
    refresh();
  }, [pendingDelete, activeFolderId, navigate, refresh]);

  // ── 画板操作 ────────────────────────────────────────────────
  const openBoard = useCallback((id: string) => {
    touchWorkspaceProjectHistory(id);
    if (activeFolderId) touchWorkspaceFolder(activeFolderId);
    navigate(`/project/${id}`);
  }, [navigate, activeFolderId]);

  const handleRenameBoard = useCallback((id: string, name: string) => {
    updateWorkspaceProjectHistory(id, { title: name });
    setRenamingId(null);
    refresh();
  }, [refresh]);

  const handleDuplicateBoard = useCallback((board: WorkspaceHistoryProject) => {
    const copy = createWorkspaceHistoryProject(
      `${board.title} 副本`,
      undefined,
      board.folderId ? { id: board.folderId, name: board.folderName || activeFolder?.name || "" } : null
    );
    upsertWorkspaceProjectHistory({
      ...copy,
      cover: board.cover,
      nodeCount: board.nodeCount,
      socialPresetId: board.socialPresetId,
      canvasWidth: board.canvasWidth,
      canvasHeight: board.canvasHeight,
    });
    refresh();
    toast("副本已创建", { description: copy.title });
  }, [activeFolder, refresh]);

  const handleMoveBoard = useCallback((board: WorkspaceHistoryProject, folder: WorkspaceFolderSummary | null) => {
    assignWorkspaceProjectsToFolder([board.id], folder?.id ?? null, folder?.name);
    setMovingBoard(null);
    refresh();
    toast(folder ? `已移动到「${folder.name}」` : "已移出项目");
  }, [refresh]);

  const handleCreateBoard = useCallback(() => {
    if (!activeFolder) return;
    const board = createWorkspaceHistoryProject(
      undefined,
      undefined,
      { id: activeFolder.id, name: activeFolder.name }
    );
    refresh();
    navigate(`/project/${board.id}`);
  }, [activeFolder, navigate, refresh]);

  /**
   * 导入文件 = 每个图片生成一块画板，图片作为封面并交给画布的引用图通道。
   * ⚠️ 不用「只写封面」的糊弄做法：那样打开画板是空画布 + 一张对不上的封面。
   *    走 writeHomePromptHandoff 后，画布会把图接成引用图（和首页带图进画布同一条链路）。
   * ⚠️⚠️ 交接载荷在 sessionStorage 里只有**一个槽**：循环里每写一次就会覆盖前一次。
   *    所以先建完所有画板、最后只给要打开的那一块写载荷，否则导入 3 张只有最后一张进得了画布。
   */
  const handleImportFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!activeFolder || files.length === 0) return;

    const images = files.filter(file => file.type.startsWith("image/")).slice(0, MAX_IMPORT_FILES);
    if (images.length === 0) {
      toast.error("只支持图片文件");
      return;
    }
    if (images.length < files.length) {
      toast(`一次最多导入 ${MAX_IMPORT_FILES} 张图片，其余已跳过`);
    }

    setImporting(true);
    try {
      let firstBoardId = "";
      let firstReference: { id: string; title: string; src: string } | null = null;

      for (const file of images) {
        const board = createWorkspaceHistoryProject(
          file.name.replace(/\.[^.]+$/, "") || undefined,
          undefined,
          { id: activeFolder.id, name: activeFolder.name }
        );
        if (!firstBoardId) firstBoardId = board.id;
        try {
          const dataUrl = await fileToDataUrl(file);
          setWorkspaceProjectCover(board.id, dataUrl);
          if (!firstReference) {
            firstReference = { id: board.id, title: file.name, src: dataUrl };
          }
        } catch {
          // 缩略图失败不影响画板本身，至少卡片是建出来的
        }
      }

      refresh();
      toast(`已导入 ${images.length} 个文件`);
      if (firstBoardId) {
        if (firstReference) {
          writeHomePromptHandoff({ projectId: firstBoardId, references: [firstReference] });
        }
        navigate(`/project/${firstBoardId}`);
      }
    } finally {
      setImporting(false);
    }
  }, [activeFolder, navigate, refresh]);

  const boardMenuItems = useCallback((board: WorkspaceHistoryProject): MenuItem[] => [
    { icon: Pencil, label: "重命名", onSelect: () => setRenamingId(board.id) },
    {
      icon: Star,
      label: board.starred ? "取消收藏" : "收藏",
      onSelect: () => { setWorkspaceProjectStarred(board.id, !board.starred); refresh(); },
    },
    { icon: Copy, label: "创建副本", onSelect: () => handleDuplicateBoard(board) },
    { icon: FolderOpen, label: "移动到项目", onSelect: () => setMovingBoard(board) },
    {
      icon: Trash2,
      label: "删除",
      danger: true,
      onSelect: () => setPendingDelete({ kind: "board", id: board.id, name: board.title }),
    },
  ], [handleDuplicateBoard, refresh]);

  const renderBoard = (board: WorkspaceHistoryProject) => {
    const props = {
      t,
      board,
      renaming: renamingId === board.id,
      onOpen: () => openBoard(board.id),
      onRename: () => setRenamingId(board.id),
      onRenameSubmit: (name: string) => handleRenameBoard(board.id, name),
      menuItems: boardMenuItems(board),
    };
    return view === "grid"
      ? <BoardCard key={board.id} {...props} />
      : <BoardRow key={board.id} {...props} />;
  };

  // ── Header ─────────────────────────────────────────────────
  const header = activeFolder ? (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5" style={{ color: t.faint, fontSize: 11.5 }}>
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="rounded transition-colors hover:underline"
            style={{ color: t.faint }}
          >
            工作台
          </button>
          <ChevronRight size={11} />
          <span className="truncate" style={{ color: t.sub }}>{activeFolder.name}</span>
        </div>
        {renamingId === activeFolder.id ? (
          <input
            autoFocus
            defaultValue={activeFolder.name}
            onClick={event => event.stopPropagation()}
            onBlur={event => handleRenameFolder(activeFolder.id, event.target.value.trim() || activeFolder.name)}
            onKeyDown={event => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              if (event.key === "Escape") handleRenameFolder(activeFolder.id, activeFolder.name);
            }}
            className="mt-1 w-[320px] max-w-full bg-transparent outline-none"
            style={{ color: t.text, fontSize: 19, fontWeight: 620, borderBottom: `1px solid ${t.text}` }}
          />
        ) : (
          <h1
            className="mt-0.5 truncate"
            style={{ color: t.text, fontSize: 19, fontWeight: 620, letterSpacing: "-0.02em" }}
            onDoubleClick={() => setRenamingId(activeFolder.id)}
            title="双击重命名项目"
          >
            {activeFolder.name}
          </h1>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <input
          ref={importInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleImportFiles}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => importInputRef.current?.click()}
          className="flex h-8 items-center gap-1.5 rounded-full px-3 transition-colors disabled:opacity-60"
          style={{ border: `1px solid ${t.border}`, color: t.text, fontSize: 12.5 }}
          onMouseEnter={event => { event.currentTarget.style.background = t.raised; }}
          onMouseLeave={event => { event.currentTarget.style.background = "transparent"; }}
        >
          <Upload size={13.5} strokeWidth={1.7} />
          {importing ? "导入中…" : "导入文件"}
        </button>
        <button
          type="button"
          onClick={handleCreateBoard}
          className="flex h-8 items-center gap-1.5 rounded-full px-3.5 transition-colors"
          style={{ background: t.isDark ? "#ffffff" : "#161616", color: t.isDark ? "#161616" : "#ffffff", fontSize: 12.5, fontWeight: 550 }}
          onMouseEnter={event => { event.currentTarget.style.opacity = "0.86"; }}
          onMouseLeave={event => { event.currentTarget.style.opacity = "1"; }}
        >
          <Plus size={13.5} strokeWidth={2} />
          新建画布
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 style={{ color: t.text, fontSize: 19, fontWeight: 620, letterSpacing: "-0.02em" }}>工作台</h1>
        <p className="mt-0.5" style={{ color: t.sub, fontSize: 11.5 }}>
          {folders.length} 个项目 · {folders.reduce((sum, folder) => sum + folder.boardCount, 0) + unfiled.length} 块画板
        </p>
      </div>
      <button
        type="button"
        onClick={handleCreateFolder}
        className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 transition-colors"
        style={{ background: t.isDark ? "#ffffff" : "#161616", color: t.isDark ? "#161616" : "#ffffff", fontSize: 12.5, fontWeight: 550 }}
        onMouseEnter={event => { event.currentTarget.style.opacity = "0.86"; }}
        onMouseLeave={event => { event.currentTarget.style.opacity = "1"; }}
      >
        <FolderPlus size={13.5} strokeWidth={2} />
        新建项目
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: t.page }}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1180px] px-8 pb-16 pt-6">
          {header}

          {/* ── 工具栏（仅项目内） ── */}
          {activeFolder && (
            <div className="mt-5 flex items-center gap-2">
              <Select value={typeFilter} onValueChange={value => setTypeFilter(value as TypeFilter)}>
                <SelectTrigger size="sm" className="gap-1.5 rounded-lg" aria-label="按类型筛选">
                  <span style={{ color: t.sub, fontSize: 11.5 }}>类型</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有类型</SelectItem>
                  <SelectItem value="filled">有内容的画板</SelectItem>
                  <SelectItem value="empty">空白画板</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortKey} onValueChange={value => setSortKey(value as SortKey)}>
                <SelectTrigger size="sm" className="gap-1.5 rounded-lg" aria-label="排序方式">
                  <span style={{ color: t.sub, fontSize: 11.5 }}>排序</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">最近修改</SelectItem>
                  <SelectItem value="created">创建时间</SelectItem>
                  <SelectItem value="name">名称</SelectItem>
                </SelectContent>
              </Select>

              <div className="ml-auto flex items-center gap-1 rounded-lg p-0.5" style={{ border: `1px solid ${t.border}` }}>
                {([
                  { key: "grid", icon: LayoutGrid, label: "网格视图" },
                  { key: "list", icon: List, label: "列表视图" },
                ] as const).map(item => (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={item.label}
                    aria-pressed={view === item.key}
                    onClick={() => setView(item.key)}
                    className="flex h-6 w-7 items-center justify-center rounded-md transition-colors"
                    style={{
                      background: view === item.key ? t.raisedHover : "transparent",
                      color: view === item.key ? t.text : t.faint,
                    }}
                  >
                    <item.icon size={14} strokeWidth={1.7} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 项目内：画板 ── */}
          {activeFolder ? (
            visibleBoards.length === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: t.placeholder }}>
                  <ImageIcon size={22} strokeWidth={1.3} style={{ color: t.faint }} />
                </div>
                <p style={{ color: t.text, fontSize: 13, fontWeight: 520 }}>
                  {activeFolder.boardCount === 0 ? "这个项目还没有画板" : "没有符合条件的画板"}
                </p>
                <p style={{ color: t.sub, fontSize: 12 }}>
                  {activeFolder.boardCount === 0 ? "点右上角「新建画布」开始，或直接导入图片" : "换个筛选条件试试"}
                </p>
              </div>
            ) : (
              <div
                className={view === "grid" ? "mt-4 grid gap-4" : "mt-4 flex flex-col gap-2"}
                style={view === "grid" ? { gridTemplateColumns: BOARD_GRID_COLUMNS } : undefined}
              >
                {visibleBoards.map(renderBoard)}
              </div>
            )
          ) : (
            <>
              {/* ── 根层：项目网格 ── */}
              {folders.length === 0 ? (
                <div className="mt-16 flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: t.placeholder }}>
                    <FolderOpen size={22} strokeWidth={1.3} style={{ color: t.faint }} />
                  </div>
                  <p style={{ color: t.text, fontSize: 13, fontWeight: 520 }}>还没有项目</p>
                  <p style={{ color: t.sub, fontSize: 12 }}>新建一个项目，把同类画板收在一起</p>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    className="mt-1 flex h-8 items-center gap-1.5 rounded-full px-3.5"
                    style={{ background: t.isDark ? "#ffffff" : "#161616", color: t.isDark ? "#161616" : "#ffffff", fontSize: 12.5 }}
                  >
                    <FolderPlus size={13.5} strokeWidth={2} />
                    新建项目
                  </button>
                </div>
              ) : (
                <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: FOLDER_GRID_COLUMNS }}>
                  {folders.map(folder => (
                    <FolderCard
                      key={folder.id}
                      t={t}
                      folder={folder}
                      renaming={renamingId === folder.id}
                      onOpen={() => navigate(`/workspace?p=${folder.id}`)}
                      onRename={() => setRenamingId(folder.id)}
                      onRenameSubmit={name => handleRenameFolder(folder.id, name)}
                      menuItems={[
                        { icon: FolderOpen, label: "打开项目", onSelect: () => navigate(`/workspace?p=${folder.id}`) },
                        { icon: Pencil, label: "重命名", onSelect: () => setRenamingId(folder.id) },
                        {
                          icon: Trash2,
                          label: "删除项目",
                          danger: true,
                          onSelect: () => setPendingDelete({
                            kind: "folder",
                            id: folder.id,
                            name: folder.name,
                            boardCount: folder.boardCount,
                          }),
                        },
                      ]}
                    />
                  ))}
                </div>
              )}

              {/* ── 根层：未归类画板 ── */}
              {unfiled.length > 0 && (
                <div className="mt-10">
                  <div className="flex items-baseline gap-2">
                    <h2 style={{ color: t.text, fontSize: 13, fontWeight: 600 }}>未归类画板</h2>
                    <span style={{ color: t.faint, fontSize: 11.5 }}>
                      {unfiled.length} 块 · 可移动到某个项目
                    </span>
                  </div>
                  <div
                    className={view === "grid" ? "mt-3 grid gap-4" : "mt-3 flex flex-col gap-2"}
                    style={view === "grid" ? { gridTemplateColumns: BOARD_GRID_COLUMNS } : undefined}
                  >
                    {unfiled.map(renderBoard)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {pendingDelete && (
        <DeleteConfirmDialog
          t={t}
          title={
            pendingDelete.kind === "folder"
              ? `删除项目「${pendingDelete.name}」？`
              : `删除画板「${pendingDelete.name}」？`
          }
          description={
            pendingDelete.kind === "folder"
              ? pendingDelete.boardCount > 0
                ? `项目里的 ${pendingDelete.boardCount} 块画板会一起删除，此操作不可撤销。`
                : "这是一个空项目，删除后不可撤销。"
              : "画板内的所有内容将被删除，此操作不可撤销。"
          }
          confirmLabel="删除"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {movingBoard && (
        <MoveBoardDialog
          t={t}
          board={movingBoard}
          folders={folders}
          onClose={() => setMovingBoard(null)}
          onMove={folder => handleMoveBoard(movingBoard, folder)}
        />
      )}
    </div>
  );
}
