/**
 * 项目（文件夹）登记表 —— 工作台三级结构的中间层
 *
 *   工作台 → 项目（本文件的 WorkspaceFolder） → 画板（project-history 的 record）
 *
 * 设计取舍（2026-11-10）：
 * - **项目名不放在画板上做主键**：画板上只有 folderId（+ 冗余 folderName），
 *   项目实体存本文件。否则「新建一个还没放画板的空项目」根本存不下来。
 * - **画板必须自带 folderId**：这样分组能跟着既有的工作台云同步走。
 *   如果分组只存在这份本机登记表，换台设备看到的会是一堆「未归类画板」。
 * - 登记表本身目前**只存本机**（不同步）：跨设备时靠画板上的 folderName
 *   反推项目，空项目不会出现在另一台设备 —— 这是已知的、可接受的缺口，
 *   比「同步不全导致画板整块丢失」轻得多。
 */
import {
  assignWorkspaceProjectsToFolder,
  readWorkspaceProjectHistory,
  workspaceScopedStorageKey,
  type WorkspaceHistoryProject,
} from "./project-history";

export interface WorkspaceFolder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** 工作台根层卡片用的项目摘要（登记表 + 画板聚合）。 */
export interface WorkspaceFolderSummary extends WorkspaceFolder {
  boards: WorkspaceHistoryProject[];
  boardCount: number;
  /** 最多 4 张封面，给卡片拼九宫格缩略图。 */
  covers: string[];
}

const STORAGE_KEY = "artx:workspace-folders";
const MAX_FOLDERS = 60;

export const WORKSPACE_FOLDERS_UPDATED_EVENT = "artx:workspace-folders-updated";

function nowTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timestampToTime(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value.replace(/-/g, "/")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function makeFolderId() {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function broadcastFoldersUpdated() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(WORKSPACE_FOLDERS_UPDATED_EVENT));
  } catch {
    /* 广播失败不影响数据 */
  }
}

export function readWorkspaceFolders(): WorkspaceFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(workspaceScopedStorageKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const folders = parsed.filter((item): item is WorkspaceFolder => {
      const record = item as WorkspaceFolder | null;
      return Boolean(record && typeof record.id === "string" && typeof record.name === "string");
    });
    return folders.sort((a, b) => timestampToTime(b.updatedAt) - timestampToTime(a.updatedAt));
  } catch {
    return [];
  }
}

function writeWorkspaceFolders(folders: WorkspaceFolder[]) {
  if (typeof window === "undefined") return;
  const sorted = [...folders]
    .sort((a, b) => timestampToTime(b.updatedAt) - timestampToTime(a.updatedAt))
    .slice(0, MAX_FOLDERS);
  try {
    window.localStorage.setItem(workspaceScopedStorageKey(STORAGE_KEY), JSON.stringify(sorted));
  } catch {
    /* 写不进去只影响本机项目栏，画板数据不受影响 */
  }
  broadcastFoldersUpdated();
}

function nextUntitledName(existing: WorkspaceFolder[]) {
  const base = "未命名项目";
  if (!existing.some(folder => folder.name === base)) return base;
  let index = 2;
  while (existing.some(folder => folder.name === `${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

/**
 * 新建项目。
 * ⚠️ 必须**先落登记表再返回**：调用方拿到 id 会立刻 navigate 进项目内，
 *    晚一步写盘就会进入一个「查不到项目名」的空壳页。
 */
export function createWorkspaceFolder(name?: string): WorkspaceFolder {
  const existing = readWorkspaceFolders();
  const timestamp = nowTimestamp();
  const folder: WorkspaceFolder = {
    id: makeFolderId(),
    name: name?.trim() || nextUntitledName(existing),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  writeWorkspaceFolders([folder, ...existing]);
  return folder;
}

/**
 * 重命名项目。
 * ⚠️⚠️ 两处一起改：登记表 + 所有画板上的冗余 folderName。
 *    只改登记表时，另一台设备（拿不到登记表）会继续显示旧的冗余名。
 */
export function renameWorkspaceFolder(id: string, name: string) {
  const nextName = name.trim();
  if (!nextName) return;
  const folders = readWorkspaceFolders().map(folder =>
    folder.id === id ? { ...folder, name: nextName, updatedAt: nowTimestamp() } : folder
  );
  writeWorkspaceFolders(folders);
  const boardIds = readWorkspaceProjectHistory()
    .filter(board => board.folderId === id)
    .map(board => board.id);
  if (boardIds.length > 0) assignWorkspaceProjectsToFolder(boardIds, id, nextName);
}

export function touchWorkspaceFolder(id: string) {
  const folders = readWorkspaceFolders();
  if (!folders.some(folder => folder.id === id)) return;
  writeWorkspaceFolders(folders.map(folder =>
    folder.id === id ? { ...folder, updatedAt: nowTimestamp() } : folder
  ));
}

/**
 * 删除项目。
 *
 * `mode = "detach"`：只删项目，画板退到「未归类」，不丢东西（默认）。
 * `mode = "delete-boards"`：连项目内画板一起删 —— 调用方必须先二次确认。
 *
 * ⚠️ 画板删除**不能**在这里直接调 removeWorkspaceProjectHistory：
 *    那个函数要记墓碑（跨设备删除同步），漏了会「删了又自己回来」。
 *    所以这里返回待删画板 id，由调用方走统一的删除出口。
 */
export function deleteWorkspaceFolders(ids: string[], mode: "detach" | "delete-boards" = "detach") {
  if (ids.length === 0) return { deletedBoardIds: [] as string[] };
  const idSet = new Set(ids);
  const boards = readWorkspaceProjectHistory();
  const affected = boards.filter(board => board.folderId && idSet.has(board.folderId));

  writeWorkspaceFolders(readWorkspaceFolders().filter(folder => !idSet.has(folder.id)));

  if (mode === "detach" && affected.length > 0) {
    assignWorkspaceProjectsToFolder(affected.map(board => board.id), null);
  }

  return {
    deletedBoardIds: mode === "delete-boards" ? affected.map(board => board.id) : [],
  };
}

/**
 * 项目列表（登记表 ∪ 画板反推），按最近改动倒序。
 *
 * 为什么要 union：换设备 / 清了本机存储之后登记表可能是空的，
 * 但画板上还带着 folderId + folderName。只读登记表会让这些画板
 * 凭空变成「未归类」，用户以为项目全没了。
 */
export function listWorkspaceFolders(): WorkspaceFolderSummary[] {
  const registered = readWorkspaceFolders();
  const boards = readWorkspaceProjectHistory();
  const byId = new Map<string, WorkspaceFolderSummary>();

  for (const folder of registered) {
    byId.set(folder.id, { ...folder, boards: [], boardCount: 0, covers: [] });
  }

  for (const board of boards) {
    const folderId = board.folderId;
    if (!folderId) continue;
    let summary = byId.get(folderId);
    if (!summary) {
      // 登记表里没有：靠画板上的冗余字段反推一个项目
      summary = {
        id: folderId,
        name: board.folderName?.trim() || "未命名项目",
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        boards: [],
        boardCount: 0,
        covers: [],
      };
      byId.set(folderId, summary);
    }
    summary.boards.push(board);
    summary.boardCount += 1;
    if (board.cover && summary.covers.length < 4) summary.covers.push(board.cover);
    if (timestampToTime(board.updatedAt) > timestampToTime(summary.updatedAt)) {
      summary.updatedAt = board.updatedAt;
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => timestampToTime(b.updatedAt) - timestampToTime(a.updatedAt)
  );
}

/** 没有归入任何项目的画板（老数据、或项目被删后 detach 出来的）。 */
export function listUnfiledBoards(): WorkspaceHistoryProject[] {
  return readWorkspaceProjectHistory().filter(board => !board.folderId);
}
