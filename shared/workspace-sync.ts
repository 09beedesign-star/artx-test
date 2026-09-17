/**
 * 工作台 / 画布的跨设备云端同步 —— 数据模型与合并算法的**唯一事实源**。
 *
 * 前端（client/src/lib/workspace-sync.ts）与服务端
 * （server/workspace-sync-store.ts）**必须**共用本文件的 merge 实现。
 *
 * ⚠️⚠️ 为什么不能让服务端直接把客户端传来的整份文档存进去？
 *    server/postgres-json-store.ts 的 save() 是**整文档 UPSERT 覆盖**，
 *    既没有部分更新也没有并发控制。两台电脑各自 PUT 一次，
 *    后到的那次会把先到的那次**整个抹掉** —— 用户在 A 机器新建的画布
 *    会因为 B 机器保存了一次而凭空消失，而且**零报错**。
 *
 * ✅ 正确做法是本文件的 mergeWorkspaceSync：
 *    **按条目 id 逐项比较 updatedAt**，谁新留谁。
 *    两台电脑改的是不同画布 → 两份都留下；改的是同一个 → 留晚的那份。
 */

/** 工作台里的一个项目（字段与 client/src/lib/project-history.ts 的 WorkspaceHistoryProject 对齐）。 */
export type SyncedWorkspaceProject = {
  id: string;
  title: string;
  cover: string | null;
  updatedAt: string;
  nodeCount: number;
  createdAt: string;
  initialPrompt?: string;
  socialPresetId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
};

/** 单个项目的画布内容。 */
export type SyncedCanvasState = {
  projectId: string;
  nodes: unknown[];
  edges: unknown[];
  updatedAt: string;
};

/**
 * 删除墓碑。
 *
 * ⚠️ 没有墓碑，删除就**永远同步不过去**：A 机器删掉一个画布后上行，
 *    B 机器那份还在，下一次 B 上行又把它合并回来 —— 用户看到的现象是
 *    「删了又自己回来了」。墓碑是删除语义能跨设备成立的前提。
 */
export type SyncedDeletion = {
  id: string;
  deletedAt: string;
};

/**
 * 灵感卡片的点赞 / 收藏（跨设备）。
 *
 * 【为什么用 active 布尔而不是单独的墓碑列表】
 * 项目/画布的删除用的是 `deletions` 墓碑数组，那是因为「项目」和「删除记录」
 * 是两种不同形状的数据。但点赞的「取消」本质上就是**同一条记录的一次更新**：
 *   赞了 → { active: true,  updatedAt: T1 }
 *   取消 → { active: false, updatedAt: T2 }
 * 📌 这样一来 last-write-wins 天然成立，不需要额外的墓碑比对逻辑。
 *
 * ⚠️⚠️ 取消**绝不能**表示成「把记录从数组里删掉」。
 *    A 机器删掉记录上行 → 服务端合并时 B 机器那条 active:true 还在 →
 *    合并结果仍然是"赞着的" → **用户看到「我取消了，另一台电脑上还赞着，
 *    而且过一会儿这台也变回赞了」**。这与画布「删了又自己回来」是同一个坑。
 */
export type SyncedInspirationReaction = {
  /** `${kind}:${id}`，全局唯一 */
  key: string;
  kind: "like" | "favorite";
  /** 归一化后的标题——跨页面稳定的身份键 */
  id: string;
  /** false 表示「已取消」，即墓碑 */
  active: boolean;
  updatedAt: string;
  /**
   * 内容快照。
   * ⚠️ 必须带快照而不是只带 id：个人中心要用专题页卡片样式完整渲染，
   *    而专题页数据是远程分页的，另一台设备上未必加载到了那一页。
   *    只存 id 会出现「赞了却查不到、卡片空白」。
   * active 为 false 时可以为 null（取消了就不需要内容了，省体积）。
   */
  item: Record<string, unknown> | null;
};

export type WorkspaceSyncPayload = {
  projects: SyncedWorkspaceProject[];
  canvases: SyncedCanvasState[];
  deletions: SyncedDeletion[];
  reactions: SyncedInspirationReaction[];
};

export type WorkspaceSyncDocument = WorkspaceSyncPayload & {
  /** 服务端每次成功写入自增，客户端用它判断「云端有没有比我新的数据」。 */
  revision: number;
  updatedAt: string;
};

/** 墓碑保留时长。必须远长于一台设备可能离线的时间，否则删除会「复活」。 */
export const DELETION_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 单个用户同步文档的体积上限。PG 单行 jsonb 塞太大会拖垮 load/save。 */
export const MAX_SYNC_DOCUMENT_BYTES = 2_000_000;

/** 同步载荷里最多保留多少个项目 / 画布。 */
export const MAX_SYNCED_PROJECTS = 40;
export const MAX_SYNCED_CANVASES = 40;

/**
 * 解析同步用的时间戳。
 *
 * ⚠️⚠️ 这里必须**先直接 new Date**，失败了才退化到 replace(/-/g, "/")。
 *    顺序反过来是个真实的坑：project-history.ts 里的写法是
 *    `new Date(value.replace(/-/g, "/"))`，那是为 "2026-09-17 09:52"
 *    这种非标准格式服务的；可画布存的是 ISO "2026-09-17T01:52:13.000Z"，
 *    先 replace 会变成 "2026/09/17T01:52:13.000Z" —— **解析结果是 NaN**。
 *
 * 📌 NaN 会让后面所有的 `a > b` 比较**恒为 false**，
 *    表现就是「云端数据永远不被采纳」，而且一声不吭。
 */
export function parseSyncTimestamp(value?: string): number {
  if (!value || typeof value !== "string") return 0;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;
  const normalized = new Date(value.replace(/-/g, "/")).getTime();
  return Number.isFinite(normalized) ? normalized : 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 内联大图的判据：base64 data URI。 */
function isInlineImagePayload(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:") && value.length > 512;
}

/**
 * 剥掉画布节点里的内联 base64 图。
 *
 * ⚠️⚠️ 不剥会直接撑爆同步：一张 base64 图动辄几 MB，
 *    而整份同步文档要塞进 PG 的一行 jsonb 里。画布本地存储正是因为
 *    内联大图撑爆过 5MB 配额（2026-09-15 三层存储图片丢失事故）。
 *
 * 📌 服务端生成的图本来就落盘在 <uploadsRoot>/images/ 并返回 http URL，
 *    那种图**不带 data: 前缀**，会被原样保留，跨设备能正常显示。
 *    只有「本机粘贴/上传、还没上云」的图会被剥掉 ——
 *    这类图的事实源是本机 IndexedDB，本来也没法跨设备。
 *
 * ✅ 剥掉时打上 inlineImageOmittedForSync 标记，让 UI 有机会告诉用户
 *    「这张图只存在本机」，而不是显示一个破图还让人莫名其妙。
 */
export function stripInlineImagesForSync<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map(item => stripInlineImagesForSync(item, depth + 1)) as unknown as T;
  }
  if (!isPlainRecord(value)) return value;

  let omitted = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isInlineImagePayload(entry)) {
      omitted = true;
      continue;
    }
    next[key] = stripInlineImagesForSync(entry, depth + 1);
  }
  if (omitted) next.inlineImageOmittedForSync = true;
  return next as unknown as T;
}

function normalizeProject(value: unknown): SyncedWorkspaceProject | null {
  if (!isPlainRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;
  return {
    id,
    title: typeof value.title === "string" ? value.title : "",
    cover: typeof value.cover === "string" ? value.cover : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    nodeCount: typeof value.nodeCount === "number" ? value.nodeCount : 0,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    initialPrompt: typeof value.initialPrompt === "string" ? value.initialPrompt : undefined,
    socialPresetId: typeof value.socialPresetId === "string" ? value.socialPresetId : undefined,
    canvasWidth: typeof value.canvasWidth === "number" ? value.canvasWidth : undefined,
    canvasHeight: typeof value.canvasHeight === "number" ? value.canvasHeight : undefined,
  };
}

function normalizeCanvas(value: unknown): SyncedCanvasState | null {
  if (!isPlainRecord(value)) return null;
  const projectId = typeof value.projectId === "string" ? value.projectId.trim() : "";
  if (!projectId) return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  return {
    projectId,
    nodes: value.nodes,
    edges: value.edges,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function normalizeDeletion(value: unknown): SyncedDeletion | null {
  if (!isPlainRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;
  return {
    id,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : "",
  };
}

function normalizeReaction(value: unknown): SyncedInspirationReaction | null {
  if (!isPlainRecord(value)) return null;
  const kind = value.kind === "like" || value.kind === "favorite" ? value.kind : null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!kind || !id) return null;
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    /*
     * ⚠️ 默认必须是 true。
     *    旧版本前端发上来的载荷没有 active 字段，若默认成 false
     *    会把用户**已有的点赞在升级瞬间全部清空**，而且看不出是谁干的。
     */
    active: value.active === false ? false : true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    item: isPlainRecord(value.item) ? value.item : null,
  };
}

export function normalizeWorkspaceSyncPayload(value: unknown): WorkspaceSyncPayload {
  const record = isPlainRecord(value) ? value : {};
  const projects = Array.isArray(record.projects)
    ? record.projects.map(normalizeProject).filter((item): item is SyncedWorkspaceProject => Boolean(item))
    : [];
  const canvases = Array.isArray(record.canvases)
    ? record.canvases.map(normalizeCanvas).filter((item): item is SyncedCanvasState => Boolean(item))
    : [];
  const deletions = Array.isArray(record.deletions)
    ? record.deletions.map(normalizeDeletion).filter((item): item is SyncedDeletion => Boolean(item))
    : [];
  const reactions = Array.isArray(record.reactions)
    ? record.reactions.map(normalizeReaction).filter((item): item is SyncedInspirationReaction => Boolean(item))
    : [];
  return { projects, canvases, deletions, reactions };
}

function mergeById<T>(
  base: T[],
  incoming: T[],
  getId: (item: T) => string,
  getTime: (item: T) => number
): T[] {
  const merged = new Map<string, T>();
  for (const item of [...base, ...incoming]) {
    const id = getId(item);
    const existing = merged.get(id);
    // ⚠️ 用 `>` 而不是 `>=`：时间相同时保留先放进去的（base 侧），
    //    保证合并结果与输入顺序无关，可重复、可测试。
    if (!existing || getTime(item) > getTime(existing)) {
      merged.set(id, item);
    }
  }
  return Array.from(merged.values());
}

/**
 * 合并两份同步载荷。
 *
 * 语义（逐项 last-write-wins，**不是**整体覆盖）：
 * - 同 id 的项目 / 画布：留 updatedAt 晚的那份。
 * - 墓碑：留 deletedAt 晚的那份；被墓碑覆盖的条目排除。
 * - ⚠️ 若某条目的 updatedAt **晚于**墓碑的 deletedAt，说明用户在另一台
 *   设备上又继续用了它 —— 此时应当「复活」，这是正确语义，不是 bug。
 */
export function mergeWorkspaceSync(
  base: WorkspaceSyncPayload,
  incoming: WorkspaceSyncPayload,
  now = Date.now()
): WorkspaceSyncPayload {
  const deletions = mergeById(
    base.deletions,
    incoming.deletions,
    item => item.id,
    item => parseSyncTimestamp(item.deletedAt)
  ).filter(item => now - parseSyncTimestamp(item.deletedAt) <= DELETION_TOMBSTONE_TTL_MS);

  const deletedAtById = new Map(deletions.map(item => [item.id, parseSyncTimestamp(item.deletedAt)]));
  const isDeleted = (id: string, updatedAt: string) => {
    const deletedAt = deletedAtById.get(id);
    if (deletedAt === undefined) return false;
    return parseSyncTimestamp(updatedAt) <= deletedAt;
  };

  const projects = mergeById(
    base.projects,
    incoming.projects,
    item => item.id,
    item => parseSyncTimestamp(item.updatedAt) || parseSyncTimestamp(item.createdAt)
  )
    .filter(item => !isDeleted(item.id, item.updatedAt))
    .sort(
      (a, b) =>
        (parseSyncTimestamp(b.updatedAt) || parseSyncTimestamp(b.createdAt)) -
        (parseSyncTimestamp(a.updatedAt) || parseSyncTimestamp(a.createdAt))
    )
    .slice(0, MAX_SYNCED_PROJECTS);

  const keptProjectIds = new Set(projects.map(item => item.id));

  const canvases = mergeById(
    base.canvases,
    incoming.canvases,
    item => item.projectId,
    item => parseSyncTimestamp(item.updatedAt)
  )
    .filter(item => !isDeleted(item.projectId, item.updatedAt))
    /*
     * ⚠️ 只保留仍有对应项目的画布。
     *    项目被删掉而画布留着，就是一份永远不会被读到、
     *    却一直占着同步体积的垃圾数据。
     */
    .filter(item => keptProjectIds.has(item.projectId))
    .sort((a, b) => parseSyncTimestamp(b.updatedAt) - parseSyncTimestamp(a.updatedAt))
    .slice(0, MAX_SYNCED_CANVASES);

  /*
   * 点赞 / 收藏。
   *
   * ⚠️⚠️ 这里**刻意保留 active:false 的条目**（即墓碑），不能顺手 filter 掉。
   *    过滤掉等于「取消这个动作没有被同步出去」：
   *    A 机器取消 → 上行的载荷里干脆没有这条 → 服务端合并时
   *    B 机器那条 active:true 原样保留 → A 机器下行又把它捡回来。
   *    **用户现象：取消了，刷新一下又赞上了。**
   *    真正的清理靠 TTL（与删除墓碑同一套 30 天口径）。
   *
   * ⚠️ 与项目/画布不同，这里**不做数量上限截断**：
   *    截断会让"我赞过的"里最早那些条目在某天悄悄消失。
   *    体积风险由 enforceSyncDocumentBudget 统一兜底。
   */
  const reactions = mergeById(
    base.reactions,
    incoming.reactions,
    item => item.key,
    item => parseSyncTimestamp(item.updatedAt)
  ).filter(
    item => item.active || now - parseSyncTimestamp(item.updatedAt) <= DELETION_TOMBSTONE_TTL_MS
  );

  return { projects, canvases, deletions, reactions };
}

/**
 * 体积兜底：合并结果仍然超限时，**从最旧的画布开始丢**。
 *
 * 📌 判据：丢画布不丢项目。项目条目很小（标题 + 封面），
 *    丢了用户会觉得「我的画布不见了」；画布内容大，丢了最多是
 *    「这个画布在新设备上要重新打开一次」，损失小得多。
 */
export function enforceSyncDocumentBudget(
  payload: WorkspaceSyncPayload,
  maxBytes = MAX_SYNC_DOCUMENT_BYTES
): WorkspaceSyncPayload {
  let canvases = [...payload.canvases].sort(
    (a, b) => parseSyncTimestamp(b.updatedAt) - parseSyncTimestamp(a.updatedAt)
  );
  let next: WorkspaceSyncPayload = { ...payload, canvases };
  while (canvases.length > 0 && JSON.stringify(next).length > maxBytes) {
    canvases = canvases.slice(0, -1);
    next = { ...payload, canvases };
  }
  if (JSON.stringify(next).length > maxBytes) {
    // 画布全丢光还超限 —— 只能再削项目封面（封面是项目条目里唯一的大字段）。
    return {
      ...next,
      projects: next.projects.map(project => ({ ...project, cover: null })),
    };
  }
  return next;
}

export function createEmptyWorkspaceSyncDocument(): WorkspaceSyncDocument {
  return {
    projects: [],
    canvases: [],
    deletions: [],
    reactions: [],
    revision: 0,
    updatedAt: new Date(0).toISOString(),
  };
}
