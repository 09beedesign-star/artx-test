import { recordWorkspaceProjectDeletion, scheduleWorkspaceSync, uploadProjectCover } from "./workspace-sync";

export interface WorkspaceHistoryProject {
  id: string;
  title: string;
  cover: string | null;
  /** 用户右键「设为封面」手动指定的图片节点 id；为空时封面自动取画布第一张图。 */
  coverNodeId?: string | null;
  /** 封面最后改写时间（ISO 毫秒）。跨设备同步时封面按它单独合并。 */
  coverUpdatedAt?: string;
  updatedAt: string;
  nodeCount: number;
  createdAt: string;
  initialPrompt?: string;
  socialPresetId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

const STORAGE_KEY = "artx:workspace-project-history";
const SESSION_FALLBACK_KEY = "artx:workspace-project-history:fallback";
const AUTH_STORAGE_KEY = "artx-auth-session";
const SYSTEM_BLANK_WORKSPACE_ID = "__blank-workspace__";
const MAX_HISTORY_PROJECTS = 40;
const MAX_COVER_LENGTH = 180_000;

function formatTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timestampToTime(value?: string) {
  if (!value) return 0;
  const normalized = value.replace(/-/g, "/");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortWorkspaceProjectHistory(projects: WorkspaceHistoryProject[]) {
  return [...projects].sort((a, b) => {
    const bTime = timestampToTime(b.updatedAt) || timestampToTime(b.createdAt);
    const aTime = timestampToTime(a.updatedAt) || timestampToTime(a.createdAt);
    return bTime - aTime;
  });
}

function shouldPersistWorkspaceProject(id: string) {
  return id !== SYSTEM_BLANK_WORKSPACE_ID;
}

function getCurrentWorkspaceOwnerId() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as { user?: { id?: unknown } } : null;
    return typeof parsed?.user?.id === "string" && parsed.user.id.trim()
      ? parsed.user.id.trim()
      : "";
  } catch {
    return "";
  }
}

function storageKeyForCurrentUser(baseKey: string) {
  const ownerId = getCurrentWorkspaceOwnerId();
  return ownerId ? `${baseKey}:${ownerId}` : baseKey;
}

export function readWorkspaceProjectHistory(): WorkspaceHistoryProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKeyForCurrentUser(STORAGE_KEY)) || window.sessionStorage.getItem(storageKeyForCurrentUser(SESSION_FALLBACK_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const projects = parsed.filter((item): item is WorkspaceHistoryProject => {
      return Boolean(
        item &&
        typeof item.id === "string" &&
        shouldPersistWorkspaceProject(item.id) &&
        typeof item.title === "string"
      );
    }).map(normalizeWorkspaceHistoryProject);
    return sortWorkspaceProjectHistory(projects);
  } catch {
    return [];
  }
}

function normalizeCover(cover: unknown) {
  if (typeof cover !== "string" || !cover) return null;
  return cover.length <= MAX_COVER_LENGTH ? cover : null;
}

function normalizeWorkspaceHistoryProject(project: WorkspaceHistoryProject): WorkspaceHistoryProject {
  return {
    ...project,
    cover: normalizeCover(project.cover),
  };
}

function compactWorkspaceProjectHistory(projects: WorkspaceHistoryProject[], keepCovers: boolean) {
  return projects.slice(0, MAX_HISTORY_PROJECTS).map(project => ({
    ...normalizeWorkspaceHistoryProject(project),
    cover: keepCovers ? normalizeCover(project.cover) : null,
  }));
}

function writeWorkspaceProjectHistory(projects: WorkspaceHistoryProject[]) {
  if (typeof window === "undefined") return;
  const storageKey = storageKeyForCurrentUser(STORAGE_KEY);
  const sessionFallbackKey = storageKeyForCurrentUser(SESSION_FALLBACK_KEY);
  const sortedProjects = sortWorkspaceProjectHistory(projects);
  const attempts = [
    compactWorkspaceProjectHistory(sortedProjects, true),
    compactWorkspaceProjectHistory(sortedProjects, false),
    compactWorkspaceProjectHistory(sortedProjects.slice(0, 20), false),
    compactWorkspaceProjectHistory(sortedProjects.slice(0, 8), false),
  ];
  for (const attempt of attempts) {
    const serialized = JSON.stringify(attempt);
    try {
      window.localStorage.setItem(storageKey, serialized);
      window.sessionStorage.removeItem(sessionFallbackKey);
      scheduleWorkspaceSync();
      return;
    } catch {
      try {
        window.sessionStorage.setItem(sessionFallbackKey, serialized);
        scheduleWorkspaceSync();
      } catch {
        /* try a smaller history payload */
      }
    }
  }
}

export function upsertWorkspaceProjectHistory(project: WorkspaceHistoryProject) {
  if (!shouldPersistWorkspaceProject(project.id)) return;
  const projects = readWorkspaceProjectHistory().filter(item => item.id !== project.id);
  writeWorkspaceProjectHistory([normalizeWorkspaceHistoryProject(project), ...projects]);
}

export function updateWorkspaceProjectHistory(id: string, patch: Partial<WorkspaceHistoryProject>) {
  if (!shouldPersistWorkspaceProject(id)) return;
  const projects = readWorkspaceProjectHistory();
  const existingIndex = projects.findIndex(item => item.id === id);
  if (existingIndex >= 0) {
    projects[existingIndex] = normalizeWorkspaceHistoryProject({ ...projects[existingIndex], ...patch });
    writeWorkspaceProjectHistory(projects);
    return;
  }

  const createdAt = patch.createdAt || formatTimestamp();
  const project: WorkspaceHistoryProject = {
    id,
    title: patch.title || `新建画布 ${createdAt}`,
    cover: normalizeCover(patch.cover),
    coverNodeId: patch.coverNodeId || null,
    updatedAt: patch.updatedAt || createdAt,
    nodeCount: patch.nodeCount ?? 0,
    createdAt,
    initialPrompt: patch.initialPrompt,
    socialPresetId: patch.socialPresetId,
    canvasWidth: patch.canvasWidth,
    canvasHeight: patch.canvasHeight,
  };
  writeWorkspaceProjectHistory([project, ...projects]);
}

/* ------------------------------------------------------------------ *
 * 封面写入 + 上云（跨设备可见，2026-10-31）
 * ------------------------------------------------------------------ */

const COVER_UPLOAD_CACHE_KEY = "artx:project-cover-uploads";

type CoverUploadCache = Record<string, { fp: string; url: string }>;

const pendingCoverUploads = new Map<string, string>();

/** 封面内容指纹（FNV-1a），用来判断「这张缩略图是不是已经传过了」。 */
export function fingerprintCover(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function readCoverUploadCache(): CoverUploadCache {
  try {
    const raw = window.localStorage.getItem(storageKeyForCurrentUser(COVER_UPLOAD_CACHE_KEY));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCoverUploadCache(cache: CoverUploadCache) {
  try {
    window.localStorage.setItem(storageKeyForCurrentUser(COVER_UPLOAD_CACHE_KEY), JSON.stringify(cache));
  } catch {
    /* 缓存写不进去只会导致重复上传（服务端按内容去重），不影响功能 */
  }
}

/**
 * 写入项目封面：本机立即生效，同时后台传到服务端，成功后把封面换成
 * /uploads/covers/... 地址 —— 这个地址会随工作台同步到同账号的所有设备。
 *
 * ⚠️⚠️ 画布里所有改封面的地方都必须走这里，而不是直接 updateWorkspaceProjectHistory({cover})，
 *    否则 base64 封面会在同步时被剥掉，别的设备永远只看到文件夹图标。
 */
export function setWorkspaceProjectCover(
  id: string,
  cover: string,
  patch: Partial<WorkspaceHistoryProject> = {}
) {
  if (typeof window === "undefined" || !shouldPersistWorkspaceProject(id) || !cover) return;
  const current = readWorkspaceProjectHistory().find(item => item.id === id);
  const isInline = cover.startsWith("data:");
  const fp = isInline ? fingerprintCover(cover) : "";

  // 同一张缩略图已经传过、本机存的就是那个云端地址 → 封面没变，只更新其它字段。
  const known = isInline ? readCoverUploadCache()[id] : undefined;
  if (known && known.fp === fp && current?.cover === known.url) {
    if (Object.keys(patch).length > 0) updateWorkspaceProjectHistory(id, patch);
    return;
  }

  const changed = current?.cover !== cover;
  const coverUpdatedAt =
    changed || !current?.coverUpdatedAt ? new Date().toISOString() : current.coverUpdatedAt;
  updateWorkspaceProjectHistory(id, { ...patch, cover, coverUpdatedAt });

  if (!isInline) return;
  // 画布每次节点变化都会触发一次（450ms 防抖），上传还没回来时不要重复发。
  if (pendingCoverUploads.get(id) === fp) return;
  pendingCoverUploads.set(id, fp);
  void uploadProjectCover(id, cover).then(url => {
    if (pendingCoverUploads.get(id) === fp) pendingCoverUploads.delete(id);
    if (!url) return;
    const cache = readCoverUploadCache();
    cache[id] = { fp, url };
    writeCoverUploadCache(cache);
    // 上传期间用户可能又换了封面：只有本机封面仍是这一张时才替换成云端地址。
    const latest = readWorkspaceProjectHistory().find(item => item.id === id);
    if (latest?.cover !== cover) return;
    updateWorkspaceProjectHistory(id, { cover: url, coverUpdatedAt });
  });
}

export function touchWorkspaceProjectHistory(id: string) {
  updateWorkspaceProjectHistory(id, { updatedAt: formatTimestamp() });
}

export function removeWorkspaceProjectHistory(ids: string[]) {
  const idSet = new Set(ids);
  /*
   * ⚠️⚠️ 必须先记墓碑再写本地。
   *    没有墓碑，删除同步不过去：本机删掉后上行，服务端合并时看到
   *    另一台设备那份还在，会把它原样返回，本机又写回来 ——
   *    用户看到的是「删了又自己回来了」。
   */
  recordWorkspaceProjectDeletion(ids);
  writeWorkspaceProjectHistory(readWorkspaceProjectHistory().filter(item => !idSet.has(item.id)));
}

export function createWorkspaceHistoryProject(title?: string, initialPrompt?: string): WorkspaceHistoryProject {
  const createdAt = formatTimestamp();
  const project: WorkspaceHistoryProject = {
    id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: title || `新建画布 ${createdAt}`,
    cover: null,
    updatedAt: createdAt,
    nodeCount: 0,
    createdAt,
    initialPrompt,
  };
  upsertWorkspaceProjectHistory(project);
  return project;
}
