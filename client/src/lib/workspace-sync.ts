/**
 * 工作台 / 画布的跨设备云端同步 —— 客户端。
 *
 * 设计要点：
 * 1. **本地优先**。所有读写仍然先落本地 localStorage / sessionStorage /
 *    IndexedDB，同步是叠在上面的一层。离线、后端挂掉、没登录，
 *    画布都必须照常能用 —— 同步失败**绝不能**阻断用户操作。
 * 2. **一次往返同时完成上行与下行**。PUT 会把合并后的完整文档返回，
 *    客户端据此回写本地。
 * 3. **逐项合并**，冲突按 updatedAt 谁新留谁，合并算法在
 *    shared/workspace-sync.ts（前后端唯一事实源）。
 */

import { ART_X_TEST_API_BASE_URL, normalizeApiBaseUrl } from "./api-base-url";
import {
  mergeWorkspaceSync,
  normalizeWorkspaceSyncPayload,
  parseSyncTimestamp,
  stripInlineImagesForSync,
  type SyncedCanvasState,
  type SyncedWorkspaceProject,
  type WorkspaceSyncDocument,
  type WorkspaceSyncPayload,
} from "../../../shared/workspace-sync";

const AUTH_STORAGE_KEY = "artx-auth-session";
const CANVAS_STATE_STORAGE_PREFIX = "artx:canvas-state:";
const CANVAS_STATE_SESSION_PREFIX = "artx:canvas-state:fallback:";
const PROJECT_HISTORY_KEY = "artx:workspace-project-history";
const DELETION_LOG_KEY = "artx:workspace-sync-deletions";
const LAST_SYNC_KEY = "artx:workspace-sync-last";

/**
 * 上行防抖。
 *
 * ⚠️ 不能太短：safeWriteCanvasState 在**每次 nodes 变化**时都会跑，
 *    拖动一个节点就是几十次。直接透传等于把后端当鼓点敲。
 * ⚠️ 也不能太长：用户在 A 机器改完随手切到 B 机器，等太久就是
 *    「说好的同步呢」。3 秒是「停手就传」的手感。
 */
const SYNC_DEBOUNCE_MS = 3000;

/** 轮询拉取间隔：另一台设备的改动多久能自动出现在本机。 */
export const SYNC_POLL_INTERVAL_MS = 60_000;

function getApiBaseUrl() {
  const configured = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return ART_X_TEST_API_BASE_URL;
  }
  return "";
}

function readAuthSession(): { token: string; userId: string } {
  if (typeof window === "undefined") return { token: "", userId: "" };
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { token?: string; user?: { id?: string } }) : null;
    return {
      token: typeof parsed?.token === "string" ? parsed.token : "",
      userId: typeof parsed?.user?.id === "string" ? parsed.user.id : "",
    };
  } catch {
    return { token: "", userId: "" };
  }
}

/**
 * 同步是否可用。
 *
 * ⚠️ 没登录就**没有云端身份**，同步无从谈起 —— 此时必须安静地什么都不做，
 *    不能报错、不能弹 toast。未登录本来就是完全合法的使用方式。
 */
export function isWorkspaceSyncAvailable() {
  return Boolean(readAuthSession().token);
}

function ownedKey(baseKey: string) {
  const { userId } = readAuthSession();
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function safeGetItem(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 删除墓碑
 * ------------------------------------------------------------------ */

type DeletionLogEntry = { id: string; deletedAt: string };

function readDeletionLog(): DeletionLogEntry[] {
  const raw = safeGetItem(window?.localStorage, ownedKey(DELETION_LOG_KEY));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is DeletionLogEntry =>
            Boolean(item) && typeof item.id === "string" && typeof item.deletedAt === "string"
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * 记录一次删除。
 *
 * ⚠️⚠️ 这一步**不能省**。没有墓碑，删除同步不过去：
 *    A 机器删掉画布并上行 → 服务端合并后把 B 机器那份仍然返回 →
 *    A 机器又把它写回本地。**用户的现象是「删了又自己回来了」。**
 */
export function recordWorkspaceProjectDeletion(ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) return;
  const deletedAt = new Date().toISOString();
  const existing = readDeletionLog().filter(item => !ids.includes(item.id));
  const next = [...existing, ...ids.map(id => ({ id, deletedAt }))];
  safeSetItem(window.localStorage, ownedKey(DELETION_LOG_KEY), JSON.stringify(next));
}

/* ------------------------------------------------------------------ *
 * 本地 <-> 同步载荷
 * ------------------------------------------------------------------ */

function readLocalProjects(): SyncedWorkspaceProject[] {
  const raw =
    safeGetItem(window?.localStorage, ownedKey(PROJECT_HISTORY_KEY)) ||
    safeGetItem(window?.sessionStorage, ownedKey(`${PROJECT_HISTORY_KEY}:fallback`));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeWorkspaceSyncPayload({ projects: parsed }).projects : [];
  } catch {
    return [];
  }
}

function writeLocalProjects(projects: SyncedWorkspaceProject[]) {
  safeSetItem(window.localStorage, ownedKey(PROJECT_HISTORY_KEY), JSON.stringify(projects));
}

function canvasKeysForProject(projectId: string) {
  return {
    local: `${CANVAS_STATE_STORAGE_PREFIX}${projectId || "p1"}`,
    session: `${CANVAS_STATE_SESSION_PREFIX}${projectId || "p1"}`,
  };
}

function readLocalCanvas(projectId: string): SyncedCanvasState | null {
  const keys = canvasKeysForProject(projectId);
  /*
   * ⚠️ 读取顺序必须与 InfiniteCanvas.safeReadCanvasState 一致：
   *    **session 优先于 local**。session 存的是完整状态（含内联图），
   *    local 存的是剥离大图的轻量版。反过来读会拿到残缺数据，
   *    然后把这份残缺数据同步到云端，把另一台设备的完整数据覆盖掉。
   */
  const raw = safeGetItem(window?.sessionStorage, keys.session) || safeGetItem(window?.localStorage, keys.local);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { nodes?: unknown; edges?: unknown; updatedAt?: unknown };
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      projectId,
      nodes: parsed.nodes,
      edges: parsed.edges,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function writeLocalCanvas(canvas: SyncedCanvasState) {
  const keys = canvasKeysForProject(canvas.projectId);
  const serialized = JSON.stringify({
    nodes: canvas.nodes,
    edges: canvas.edges,
    updatedAt: canvas.updatedAt,
  });
  /*
   * 只写 localStorage，**不动 sessionStorage**。
   *
   * ⚠️ sessionStorage 里那份是「本标签页正在编辑的完整状态（含内联图）」，
   *    云端下来的这份是剥过大图的。覆盖过去会让用户**当前正在看的画布
   *    里的图凭空消失** —— 这比不同步严重得多。
   *    本标签页读取时 session 优先，本地编辑中的内容因此得到保护。
   */
  safeSetItem(window.localStorage, keys.local, serialized);
}

function collectLocalPayload(): WorkspaceSyncPayload {
  const projects = readLocalProjects();
  const canvases = projects
    .map(project => readLocalCanvas(project.id))
    .filter((item): item is SyncedCanvasState => Boolean(item));
  return stripInlineImagesForSync({
    projects,
    canvases,
    deletions: readDeletionLog(),
  });
}

function applyDocumentToLocal(document: WorkspaceSyncDocument) {
  const local = collectLocalPayload();
  /*
   * ⚠️⚠️ 回写前必须**再合并一次本地**，不能拿服务端返回的文档直接盖掉本地。
   *    从发起请求到收到响应之间，用户可能又改了几笔；
   *    直接盖掉 = 那几笔改动凭空消失（而且用户完全无从察觉）。
   */
  const merged = mergeWorkspaceSync(
    { projects: document.projects, canvases: document.canvases, deletions: document.deletions },
    local
  );

  writeLocalProjects(merged.projects);

  const deletedIds = merged.deletions.map(item => item.id);
  for (const canvas of merged.canvases) {
    const localCanvas = readLocalCanvas(canvas.projectId);
    // 本地更新才是权威时不回写，避免把用户刚改的内容退回旧版本。
    if (localCanvas && parseSyncTimestamp(localCanvas.updatedAt) >= parseSyncTimestamp(canvas.updatedAt)) {
      continue;
    }
    writeLocalCanvas(canvas);
  }

  for (const id of deletedIds) {
    const keys = canvasKeysForProject(id);
    try {
      window.localStorage.removeItem(keys.local);
      window.sessionStorage.removeItem(keys.session);
    } catch {
      /* 清理失败不影响同步主流程 */
    }
  }

  safeSetItem(
    window.localStorage,
    ownedKey(LAST_SYNC_KEY),
    JSON.stringify({ revision: document.revision, syncedAt: new Date().toISOString() })
  );
}

/* ------------------------------------------------------------------ *
 * 网络
 * ------------------------------------------------------------------ */

async function requestSync(method: "GET" | "PUT", body?: unknown): Promise<WorkspaceSyncDocument | null> {
  const { token } = readAuthSession();
  if (!token) return null;
  const endpoint = `${getApiBaseUrl()}/api/workspace/sync`;
  const response = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Workspace sync ${method} failed: ${response.status}`);
  }
  const text = await response.text();
  /*
   * ⚠️ 必须验证是不是 JSON。后端没起来 / 路由没命中时，
   *    返回的是 index.html，JSON.parse 会抛一个和真实故障
   *    毫无关系的语法错误，排查时会被带到沟里去。
   *    📌 判据同 REF-ops：返回业务 JSON = 进了业务代码，HTML = 根本没进。
   */
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    throw new Error("Workspace sync received a non-JSON response (backend not reachable?)");
  }
  const parsed = JSON.parse(trimmed) as { document?: unknown };
  if (!parsed.document) return null;
  const payload = normalizeWorkspaceSyncPayload(parsed.document);
  const raw = parsed.document as { revision?: unknown; updatedAt?: unknown };
  return {
    ...payload,
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let rerunRequested = false;

async function runSyncOnce(): Promise<void> {
  const document = await requestSync("PUT", collectLocalPayload());
  if (document) applyDocumentToLocal(document);
}

/**
 * 立即执行一次同步（上行 + 下行）。
 *
 * ⚠️⚠️ **永不抛错**。同步是锦上添花，任何失败都不能冒泡到画布的
 *    保存路径上去 —— 那会让「网络抖一下」变成「画布存不了」。
 *    ✅ 但也不能完全静默：失败要留 console.warn，
 *    否则排查时连"到底有没有跑"都看不出来。
 *    📌 判据：「没跑」和「跑了但没数据」不能长得一样。
 */
export async function syncWorkspaceNow(): Promise<boolean> {
  if (typeof window === "undefined" || !isWorkspaceSyncAvailable()) return false;
  if (inFlight) {
    rerunRequested = true;
    await inFlight;
    return true;
  }
  const task = runSyncOnce()
    .catch(error => {
      console.warn("[workspace-sync] 同步失败，已保留本地数据", error);
    })
    .finally(() => {
      inFlight = null;
      if (rerunRequested) {
        rerunRequested = false;
        void syncWorkspaceNow();
      }
    });
  inFlight = task;
  await task;
  return true;
}

/** 防抖调度一次同步。画布 / 工作台的每次本地写入都会调它。 */
export function scheduleWorkspaceSync() {
  if (typeof window === "undefined" || !isWorkspaceSyncAvailable()) return;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void syncWorkspaceNow();
  }, SYNC_DEBOUNCE_MS);
}

/**
 * 启动自动同步：登录后立刻拉一次，之后定时轮询 + 页面重新可见时补一次。
 *
 * 返回停止函数。
 */
export function startWorkspaceAutoSync(): () => void {
  if (typeof window === "undefined") return () => undefined;

  void syncWorkspaceNow();
  const timer = setInterval(() => {
    void syncWorkspaceNow();
  }, SYNC_POLL_INTERVAL_MS);

  /*
   * 切回标签页时补一次。
   *
   * 📌 这是"两台电脑"场景里最关键的一次触发：用户在 A 机器改完，
   *    切到 B 机器的浏览器窗口 —— 这个动作必然伴随 visibilitychange。
   *    只靠 60 秒轮询，用户会盯着旧数据干等，然后得出"没同步"的结论。
   */
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncWorkspaceNow();
  };
  document.addEventListener("visibilitychange", onVisible);

  /*
   * 关页面前最后推一次。
   *
   * ⚠️ 用 sendBeacon 而不是 fetch：页面卸载时普通 fetch 会被浏览器掐断。
   * ⚠️ 但 sendBeacon **带不了 Authorization 头**，所以 token 只能进 body，
   *    服务端不认 —— 因此这里仍用 keepalive fetch，它能带自定义头。
   */
  const onBeforeUnload = () => {
    const { token } = readAuthSession();
    if (!token) return;
    try {
      void fetch(`${getApiBaseUrl()}/api/workspace/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(collectLocalPayload()),
        keepalive: true,
      });
    } catch {
      /* 卸载阶段失败无从补救，忽略 */
    }
  };
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("beforeunload", onBeforeUnload);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };
}
