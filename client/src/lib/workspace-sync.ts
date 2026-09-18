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
  canvasConversationSyncKey,
  mergeWorkspaceSync,
  normalizeWorkspaceSyncPayload,
  parseSyncTimestamp,
  stripInlineImagesForSync,
  type SyncedCanvasConversation,
  type SyncedCanvasState,
  type SyncedInspirationReaction,
  type SyncedWorkspaceProject,
  type WorkspaceSyncDocument,
  type WorkspaceSyncPayload,
} from "../../../shared/workspace-sync";
import {
  canvasConversationIndexKey,
  canvasConversationMessagesKey,
  parseConversationIndex,
  sortConversations,
  type CanvasConversationIndex,
  type CanvasConversationMeta,
} from "./canvas-conversations";
import {
  readInspirationReactions,
  replaceInspirationReactions,
  type InspirationReactionItem,
  type InspirationReactionKind,
  type InspirationReactionState,
} from "./inspiration-reactions";

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

/* ------------------------------------------------------------------ *
 * 画布会话 <-> 同步载荷
 * ------------------------------------------------------------------ */

/**
 * 会话删除墓碑的本地台账。
 *
 * ⚠️⚠️ 为什么需要单独一份，而不能直接从「索引里没有了」推导：
 *    索引里没有 = 「删了」和「这台设备还没同步到」**长得一模一样**。
 *    靠推导，另一台设备新建的会话会在本机第一次上行时被当成"已删除"清掉。
 *    📌 判据：删除是一个**事件**，必须被显式记录，不能从状态差异反推。
 */
const CONVERSATION_DELETION_LOG_KEY = "artx:canvas-conversation-deletions";

type ConversationDeletionEntry = {
  projectId: string;
  conversationId: string;
  deletedAt: string;
};

function readConversationDeletionLog(): ConversationDeletionEntry[] {
  const raw = safeGetItem(window?.localStorage, ownedKey(CONVERSATION_DELETION_LOG_KEY));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is ConversationDeletionEntry =>
            Boolean(item) &&
            typeof item.projectId === "string" &&
            typeof item.conversationId === "string" &&
            typeof item.deletedAt === "string"
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * 记录一次会话删除。画布侧删除对话时必须调它。
 *
 * ⚠️ 不调等于删除同步不过去：另一台设备那条 active:true 会在下一次
 *    合并里原样保留，本机下行又把它捡回来 —— 「删了又自己回来了」。
 */
export function recordCanvasConversationDeletion(projectId: string, conversationId: string) {
  if (typeof window === "undefined" || !projectId) return;
  const deletedAt = new Date().toISOString();
  const key = canvasConversationSyncKey(projectId, conversationId);
  const existing = readConversationDeletionLog().filter(
    item => canvasConversationSyncKey(item.projectId, item.conversationId) !== key
  );
  safeSetItem(
    window.localStorage,
    ownedKey(CONVERSATION_DELETION_LOG_KEY),
    JSON.stringify([...existing, { projectId, conversationId, deletedAt }])
  );
}

function readLocalConversationIndex(projectId: string): CanvasConversationIndex | null {
  /*
   * ⚠️ 这里刻意**只读不建**，不能调 ensureConversationIndex。
   *    那个函数在没有索引时会 create 一条新会话并落盘 ——
   *    同步流程每 60 秒跑一次，等于每分钟给每个项目凭空造一条空对话。
   *    📌 判据：后台流程只能观察状态，绝不能制造状态。
   */
  return parseConversationIndex(
    safeGetItem(window?.localStorage, canvasConversationIndexKey(projectId))
  );
}

function readLocalConversationMessages(projectId: string, conversationId: string): unknown[] {
  const raw = safeGetItem(
    window?.localStorage,
    canvasConversationMessagesKey(projectId, conversationId)
  );
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 本地会话 → 同步载荷。
 *
 * ⚠️⚠️ 只遍历「本地项目历史里还在的项目」。扫全量 localStorage key 会把
 *    已删项目的残留会话也捞上去，在云端复活成孤儿数据。
 */
function collectLocalConversations(projects: SyncedWorkspaceProject[]): SyncedCanvasConversation[] {
  const rows: SyncedCanvasConversation[] = [];
  for (const project of projects) {
    const index = readLocalConversationIndex(project.id);
    if (!index) continue;
    for (const meta of index.conversations) {
      rows.push({
        key: canvasConversationSyncKey(project.id, meta.id),
        projectId: project.id,
        conversationId: meta.id,
        title: meta.title,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        active: true,
        messages: readLocalConversationMessages(project.id, meta.id),
      });
    }
  }

  /*
   * 墓碑一起上行。
   *
   * ⚠️ 墓碑必须排在 active 条目**之后**推进数组，且这里不去重 ——
   *    mergeById 会按 updatedAt 取胜者。若一条会话既在索引里（active）
   *    又在墓碑台账里（被删），谁的时间晚谁赢，这正是我们要的语义：
   *    删完又新建同 id 是不可能的（id 带时间戳+随机），
   *    所以晚的一定是真实的最后一次操作。
   */
  for (const tomb of readConversationDeletionLog()) {
    rows.push({
      key: canvasConversationSyncKey(tomb.projectId, tomb.conversationId),
      projectId: tomb.projectId,
      conversationId: tomb.conversationId,
      title: "",
      createdAt: "",
      updatedAt: tomb.deletedAt,
      active: false,
      messages: [],
    });
  }

  return rows;
}

/**
 * 同步载荷 → 本地会话（索引 + 消息）。
 *
 * ⚠️⚠️⚠️ 这里是本次改动风险最高的一处：写错就是**静默覆盖用户的对话**。
 *    三条保护，缺一不可：
 *    1. 只写「云端比本地新」的会话，本地更新时原样跳过；
 *    2. 云端会话的 messages 为空数组时**绝不回写消息 key** ——
 *       空数组可能是服务端 enforceSyncDocumentBudget 削正文的结果，
 *       照写会把本机完整的对话清空；
 *    3. 墓碑要真的删掉本地的索引条目与消息 key，否则删除同步只做了一半。
 */
function applyConversationsToLocal(conversations: SyncedCanvasConversation[]) {
  const byProject = new Map<string, SyncedCanvasConversation[]>();
  for (const row of conversations) {
    const bucket = byProject.get(row.projectId);
    if (bucket) bucket.push(row);
    else byProject.set(row.projectId, [row]);
  }

  // ⚠️ Array.from 见 shared/workspace-sync.ts 同处注释：tsconfig 不带 downlevelIteration。
  for (const [projectId, rows] of Array.from(byProject.entries())) {
    const localIndex = readLocalConversationIndex(projectId);
    const metaById = new Map<string, CanvasConversationMeta>(
      (localIndex?.conversations ?? []).map(item => [item.id, item])
    );

    for (const row of rows) {
      if (!row.active) {
        metaById.delete(row.conversationId);
        try {
          window.localStorage.removeItem(
            canvasConversationMessagesKey(projectId, row.conversationId)
          );
        } catch {
          /* 清理失败不影响同步主流程 */
        }
        continue;
      }

      const local = metaById.get(row.conversationId);
      const localTime = local ? parseSyncTimestamp(local.updatedAt) : 0;
      const remoteTime = parseSyncTimestamp(row.updatedAt) || parseSyncTimestamp(row.createdAt);
      // 本地更新才是权威时不回写，避免把用户刚说的话退回旧版本。
      if (local && localTime >= remoteTime) continue;

      metaById.set(row.conversationId, {
        id: row.conversationId,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        messageCount: row.messages.length || local?.messageCount || 0,
      });

      /*
       * ⚠️⚠️ 空 messages 一律跳过，见函数头注释第 2 条。
       *    「云端这条被削过正文」和「云端这条真的是空对话」在数据上
       *    分不出来 —— 分不出来时必须选不破坏本地数据的那一边。
       */
      if (row.messages.length === 0) continue;
      safeSetItem(
        window.localStorage,
        canvasConversationMessagesKey(projectId, row.conversationId),
        JSON.stringify(row.messages)
      );
    }

    const merged = sortConversations(Array.from(metaById.values()));
    if (merged.length === 0) continue;
    /*
     * ⚠️ activeId 必须尽量保持本地当前值：同步是后台行为，
     *    把用户正在看的对话切走是不可接受的打扰。
     *    只有本地 activeId 指向的会话已经不存在了（被另一台设备删了）
     *    才退回列表首条。
     */
    const activeId =
      localIndex && merged.some(item => item.id === localIndex.activeId)
        ? localIndex.activeId
        : merged[0].id;
    safeSetItem(
      window.localStorage,
      canvasConversationIndexKey(projectId),
      JSON.stringify({ activeId, conversations: merged })
    );
  }
}

/* ------------------------------------------------------------------ *
 * 灵感点赞 / 收藏 <-> 同步载荷
 * ------------------------------------------------------------------ */

/**
 * 本地点赞状态 → 同步载荷。
 *
 * ⚠️⚠️ **墓碑必须一起上行**。只传"还赞着的"那些，取消动作就传不出去：
 *    云端另一台设备那条 active:true 会被原样保留，下一次下行再合并回本地，
 *    用户看到的就是「我取消了，刷新一下又赞回来了」。
 */
function collectLocalReactions(): SyncedInspirationReaction[] {
  const { userId } = readAuthSession();
  const state = readInspirationReactions(userId);
  const rows: SyncedInspirationReaction[] = [];

  for (const kind of ["like", "favorite"] as InspirationReactionKind[]) {
    for (const item of state[kind]) {
      rows.push({
        key: `${kind}:${item.id}`,
        kind,
        id: item.id,
        active: true,
        updatedAt: new Date(item.reactedAt).toISOString(),
        item: item as unknown as Record<string, unknown>,
      });
    }
  }

  for (const tomb of state.tombstones) {
    rows.push({
      key: `${tomb.kind}:${tomb.id}`,
      kind: tomb.kind,
      id: tomb.id,
      active: false,
      updatedAt: new Date(tomb.removedAt).toISOString(),
      item: null,
    });
  }

  return rows;
}

/**
 * 同步载荷 → 本地点赞状态。
 *
 * ⚠️ 不在这里做"谁新留谁"的判断 —— 合并已经在
 *    shared/workspace-sync.ts 的 mergeWorkspaceSync 里做完了，
 *    这里只负责把合并结果翻译回本地的数据形状。
 *    再合一次就是第二套合并逻辑，必然与第一套产生分歧。
 */
function reactionsToLocalState(rows: SyncedInspirationReaction[]): InspirationReactionState {
  const next: InspirationReactionState = { like: [], favorite: [], tombstones: [] };
  for (const row of rows) {
    if (!row.active) {
      next.tombstones.push({
        kind: row.kind,
        id: row.id,
        removedAt: parseSyncTimestamp(row.updatedAt) || Date.now(),
      });
      continue;
    }
    // active 但没带快照的条目直接丢弃：渲染不出卡片，留着只会是个空壳。
    if (!row.item) continue;
    next[row.kind].push({
      ...(row.item as unknown as InspirationReactionItem),
      id: row.id,
      reactedAt: parseSyncTimestamp(row.updatedAt) || Date.now(),
    });
  }
  // 个人中心按"最近优先"展示，排序在这里做掉，消费方不用各自再排一遍。
  next.like.sort((a, b) => b.reactedAt - a.reactedAt);
  next.favorite.sort((a, b) => b.reactedAt - a.reactedAt);
  return next;
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
    reactions: collectLocalReactions(),
    /*
     * ⚠️ 会话也必须过 stripInlineImagesForSync（靠外层这一次整体调用覆盖）。
     *    消息里的 imageBackup.src / contextImages[].src 在「本机粘贴、
     *    还没上云」时是 base64 data URI，一张就能几 MB，
     *    直接撑爆 PG 那一行 jsonb。
     *    📌 服务端还会再剥一次 —— 那次才是闸门，这次只是省流量。
     */
    conversations: collectLocalConversations(projects),
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
    {
      projects: document.projects,
      canvases: document.canvases,
      deletions: document.deletions,
      reactions: document.reactions,
      conversations: document.conversations,
    },
    local
  );

  writeLocalProjects(merged.projects);

  /*
   * 回写点赞 / 收藏。
   *
   * ⚠️ replaceInspirationReactions 内部会广播 INSPIRATION_REACTIONS_EVENT，
   *    首页 / 专题页 / 个人中心三棵独立组件树才会跟着重渲染。
   *    少了这次广播，云端数据虽然进了 localStorage，
   *    但界面要等用户手动刷新才变 —— 表现为「同步了个寂寞」。
   */
  const { userId } = readAuthSession();
  replaceInspirationReactions(userId, reactionsToLocalState(merged.reactions));

  /*
   * 回写画布会话。
   *
   * ⚠️ 必须放在 writeLocalProjects 之后：会话是挂在项目下的，
   *    项目还没落地就写会话，下一次 collectLocalConversations
   *    （它只遍历本地项目历史）会捞不到这些会话，
   *    表现为「同步下来的对话过一分钟自己没了」。
   */
  applyConversationsToLocal(merged.conversations);

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
      /*
       * ⚠️ 项目被删时，它名下的会话索引与消息也必须清掉。
       *    只清画布状态会留下一堆再也打不开的对话数据，
       *    白占 localStorage 那 5MB 配额 —— 本项目已经因为配额被撑爆
       *    丢过一次图（2026-09-15 三层存储事故）。
       *    消息 key 逐条按索引里的 id 删，不扫全量 key（扫全量容易误删别的项目）。
       */
      const index = readLocalConversationIndex(id);
      for (const meta of index?.conversations ?? []) {
        window.localStorage.removeItem(canvasConversationMessagesKey(id, meta.id));
      }
      window.localStorage.removeItem(canvasConversationIndexKey(id));
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
