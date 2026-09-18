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

/**
 * 画布里的一条对话（索引元信息 + 完整消息正文）。
 *
 * 【2026-09-18 新增，跨设备同步第二步】
 * 第一步只落了本地 localStorage（提交 200ed26 / 968af71 / 45ce02e），
 * 本类型负责把它接上云端。用户明确选了「索引 + 消息正文全同步」——
 * 只同步索引会让另一台设备「看得见标题、点进去是空的」。
 *
 * ⚠️⚠️ key 必须是 `${projectId}::${conversationId}` 而**不能只用 conversationId**。
 *    conversationId 由 createCanvasConversationId() 生成（时间戳 + 8 位随机），
 *    同一毫秒内在两个画布各新建一条，理论上可以撞；更要命的是**老会话的
 *    conversationId 是空串**（迁移用的合法值，见 canvas-conversations.ts 的
 *    LEGACY_CONVERSATION_ID）—— 所有画布的老会话 id 全都是 ""，
 *    只用它做 key，N 个画布的老对话会在云端合并成同一条，
 *    **用户现象是「打开任意画布，历史里都是别的画布的对话」**。
 *    📌 判据：合并键必须覆盖「这条数据在本地的完整寻址路径」，
 *       本地是 `<projectId>` + `<conversationId>` 两级，键就得是两级。
 *
 * ⚠️ 用 `::` 而不是单个 `:` 作分隔：projectId 本身可能带 `:`（路由里是自由字符串），
 *    单冒号会让 `a:b` + `c` 和 `a` + `b:c` 撞成同一个 key。
 *
 * 【为什么 active 布尔而不是单独的墓碑数组】
 * 与 SyncedInspirationReaction 同一套理由：删除就是同一条记录的一次更新，
 * last-write-wins 天然成立。**不能表示成「把记录从数组里删掉」** ——
 * A 机器删掉后上行的载荷里没有这条，服务端合并时 B 机器那条 active:true
 * 原样保留，下一次 A 下行又把它捡回来 → 「删了又自己回来了」。
 */
export type SyncedCanvasConversation = {
  /** `${projectId}::${conversationId}`，全局唯一 */
  key: string;
  projectId: string;
  /** 空串是合法值：代表迁移过来的老会话（读写不带后缀的老 key）。 */
  conversationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** false = 已删除的墓碑。 */
  active: boolean;
  /**
   * 消息正文。
   * ⚠️ 里面的 timestamp 已经是 ISO 字符串（serializeCanvasAssistantMessages 的产物），
   *    不是 Date —— JSON 往返本来也存不住 Date。
   * active 为 false 时置空数组（删了就不需要正文了，省体积）。
   */
  messages: unknown[];
};

export type WorkspaceSyncPayload = {
  projects: SyncedWorkspaceProject[];
  canvases: SyncedCanvasState[];
  deletions: SyncedDeletion[];
  reactions: SyncedInspirationReaction[];
  conversations: SyncedCanvasConversation[];
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
 * 每个画布最多同步多少条会话。
 *
 * ⚠️⚠️ 必须与 canvas-conversations.ts 的 MAX_CANVAS_CONVERSATIONS **完全相等**
 *    （2026-09-18 用户拍板：两边都是 20）。
 *    本地存 40 条、云端只收 20 条，会让用户在另一台设备上「对话少了一半」，
 *    而本机看着是好的 —— 这种不对称最难排查，且不会报任何错。
 *    📌 改其中一个数字时**必须同时改另一个**，
 *       server/workspace-sync-conversations.test.ts 有一条测试在盯着它们相等。
 * ⚠️ 截断是**按画布**而不是全局：全局截断会让「某个不常用画布的对话
 *    被常用画布挤没」，用户完全无法预期。
 */
export const MAX_SYNCED_CONVERSATIONS_PER_PROJECT = 20;

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

/**
 * 会话条目归一化。
 *
 * ⚠️⚠️ 判据是 **projectId 非空**，而**不是** conversationId 非空。
 *    空 conversationId 是迁移用的合法值（老会话读写不带后缀的 key）。
 *    要求它非空，老用户的历史对话会在「写得进云端、读不出来」这一轮
 *    被静默过滤掉 —— 与 canvas-conversations.ts:98 记录的是同一个坑，
 *    那次是本地版，这里是云端版。
 */
function normalizeConversation(value: unknown): SyncedCanvasConversation | null {
  if (!isPlainRecord(value)) return null;
  const projectId = typeof value.projectId === "string" ? value.projectId.trim() : "";
  if (!projectId) return null;
  const conversationId =
    typeof value.conversationId === "string" ? value.conversationId : "";
  return {
    key: canvasConversationSyncKey(projectId, conversationId),
    projectId,
    conversationId,
    title: typeof value.title === "string" ? value.title : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    /*
     * ⚠️ 默认必须是 true —— 与 normalizeReaction 同一条理由。
     *    旧版本前端发上来的载荷没有 active 字段，默认成 false
     *    会把用户**所有对话在升级瞬间集体变成墓碑**，
     *    下一次下行就把本地也清空了，而且看不出是谁干的。
     */
    active: value.active === false ? false : true,
    messages: Array.isArray(value.messages) ? value.messages : [],
  };
}

/** 会话在同步载荷里的合并键。前后端必须共用本函数，绝不能各拼各的。 */
export function canvasConversationSyncKey(projectId: string, conversationId: string) {
  return `${projectId}::${conversationId}`;
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
  const conversations = Array.isArray(record.conversations)
    ? record.conversations
        .map(normalizeConversation)
        .filter((item): item is SyncedCanvasConversation => Boolean(item))
    : [];
  return { projects, canvases, deletions, reactions, conversations };
}

function mergeById<T>(
  base: T[],
  incoming: T[],
  getId: (item: T) => string,
  getTime: (item: T) => number
): T[] {
  const merged = new Map<string, T>();
  /*
   * ⚠️⚠️ 必须容忍 undefined。
   *
   * 【2026-09-18 实测踩到】给载荷新增 conversations 字段后，老测试与
   * **线上旧版本前端**传进来的 payload 都没有这一项，`[...undefined]`
   * 直接抛 `base is not iterable` —— 服务端 PUT 变成 500，
   * 用户的现象是「同步突然全挂了」，而且是在发版那一刻全量发生。
   *
   * 📌 判据：给一个**已经在线上跑着**的数据结构加字段时，
   *    新字段在老载荷里一定是 undefined。类型标注是编译期的，
   *    拦不住运行时从网络进来的老格式。
   *    ✅ 兜底做在最底层的公共函数里，而不是指望每个调用点都记得传。
   */
  for (const item of [...(base ?? []), ...(incoming ?? [])]) {
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

  /*
   * 画布会话。
   *
   * ⚠️⚠️ **不能整条会话按 updatedAt 覆盖就算完** —— 那正是 last-write-wins
   *    在这里唯一说得通的语义，但前提是「消息只会追加、不会被另一台设备
   *    并行改写同一条会话」。画布对话满足这个前提：一条会话就是一个
   *    线性的聊天记录，两台设备同时往**同一条**会话里说话是极端场景，
   *    此时留晚的那份（用户在那台设备上看到的就是自己刚说的）。
   *    📌 逐条消息合并反而更糟：两边消息交错插入会产生一份
   *       谁都没说过的对话。宁可整条留新的。
   *
   * ⚠️ 项目被删（墓碑）时，它名下的会话必须一起清掉；
   *    留着就是永远读不到、却一直占着同步体积的垃圾。
   *    与 canvases 的 keptProjectIds 过滤同一口径。
   */
  const conversations = mergeById(
    base.conversations,
    incoming.conversations,
    item => item.key,
    item => parseSyncTimestamp(item.updatedAt) || parseSyncTimestamp(item.createdAt)
  )
    .filter(item => !isDeleted(item.projectId, item.updatedAt))
    .filter(
      item =>
        // 墓碑到期后彻底消失，与 deletions / reactions 同一套 30 天口径。
        item.active || now - parseSyncTimestamp(item.updatedAt) <= DELETION_TOMBSTONE_TTL_MS
    );

  /*
   * 按画布分桶截断。
   *
   * ⚠️⚠️ 截断必须**只作用于 active 的会话**，墓碑不参与名额竞争也不被截掉。
   *    墓碑被截掉 = 删除事件消失 = 另一台设备下次上行又把它复活。
   *    而墓碑很小（没有 messages），占不了多少体积。
   */
  const conversationsByProject = new Map<string, SyncedCanvasConversation[]>();
  for (const item of conversations) {
    const bucket = conversationsByProject.get(item.projectId);
    if (bucket) bucket.push(item);
    else conversationsByProject.set(item.projectId, [item]);
  }
  const cappedConversations: SyncedCanvasConversation[] = [];
  /*
   * ⚠️ 用 Array.from 而不是直接 for...of 迭代 Map —— 本项目 tsconfig 的
   *    target 不带 downlevelIteration，直接迭代是编译错误（TS2802）。
   *    与本文件 mergeById 里 `Array.from(merged.values())` 同一口径。
   */
  for (const bucket of Array.from(conversationsByProject.values())) {
    const tombstones = bucket.filter(item => !item.active);
    const alive = bucket
      .filter(item => item.active)
      .sort(
        (a, b) =>
          (parseSyncTimestamp(b.updatedAt) || parseSyncTimestamp(b.createdAt)) -
          (parseSyncTimestamp(a.updatedAt) || parseSyncTimestamp(a.createdAt))
      )
      .slice(0, MAX_SYNCED_CONVERSATIONS_PER_PROJECT);
    cappedConversations.push(...alive, ...tombstones);
  }

  return { projects, canvases, deletions, reactions, conversations: cappedConversations };
}

/**
 * 体积兜底：合并结果仍然超限时，按「损失从小到大」逐级削。
 *
 * 削的顺序（每一级都削到不能再削才进下一级）：
 *   1. 最旧会话的**消息正文**（会话条目本身保留，标题/时间还在）
 *   2. 最旧的**画布**内容
 *   3. 项目封面
 *
 * 📌 判据：先削「重新打开就能恢复的」，再削「彻底没了的」。
 *    会话正文被削后，条目还在列表里，用户看得见标题，
 *    只是点进去内容要回原设备看 —— 比整条对话凭空消失好得多。
 *    画布同理：丢了最多是「在新设备上要重新打开一次」。
 *    项目条目很小（标题 + 封面），丢了用户直接觉得「我的画布不见了」，
 *    所以放最后且只削封面。
 *
 * ⚠️ 削正文时**不能改 updatedAt**：改了会让这份被削过的残缺数据
 *    在下一轮合并里赢过另一台设备的完整数据 —— 用户的完整对话
 *    会被服务端削出来的空壳覆盖掉，且零报错。
 */
export function enforceSyncDocumentBudget(
  payload: WorkspaceSyncPayload,
  maxBytes = MAX_SYNC_DOCUMENT_BYTES
): WorkspaceSyncPayload {
  const oversized = (value: WorkspaceSyncPayload) => JSON.stringify(value).length > maxBytes;

  let next: WorkspaceSyncPayload = { ...payload };
  if (!oversized(next)) return next;

  /* ---- 第 1 级：从最旧的会话开始，清空消息正文 ---- */
  /*
   * ⚠️ 同 mergeById 的注释：本函数也会收到**没有 conversations 字段**的
   *    老载荷（线上旧前端 + 既有测试），`[...undefined]` 会直接抛。
   */
  const sourceConversations = payload.conversations ?? [];
  const conversationOrder = [...sourceConversations]
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (parseSyncTimestamp(a.item.updatedAt) || parseSyncTimestamp(a.item.createdAt)) -
        (parseSyncTimestamp(b.item.updatedAt) || parseSyncTimestamp(b.item.createdAt))
    );
  const strippedIndexes = new Set<number>();
  for (const entry of conversationOrder) {
    if (!oversized(next)) break;
    if (entry.item.messages.length === 0) continue;
    strippedIndexes.add(entry.index);
    next = {
      ...next,
      conversations: payload.conversations.map((item, index) =>
        strippedIndexes.has(index) ? { ...item, messages: [] } : item
      ),
    };
  }
  if (!oversized(next)) return next;

  /* ---- 第 2 级：从最旧的画布开始整条丢 ---- */
  let canvases = [...next.canvases].sort(
    (a, b) => parseSyncTimestamp(b.updatedAt) - parseSyncTimestamp(a.updatedAt)
  );
  next = { ...next, canvases };
  while (canvases.length > 0 && oversized(next)) {
    canvases = canvases.slice(0, -1);
    next = { ...next, canvases };
  }
  if (!oversized(next)) return next;

  /* ---- 第 3 级：削项目封面（封面是项目条目里唯一的大字段） ---- */
  return {
    ...next,
    projects: next.projects.map(project => ({ ...project, cover: null })),
  };
}

export function createEmptyWorkspaceSyncDocument(): WorkspaceSyncDocument {
  return {
    projects: [],
    canvases: [],
    deletions: [],
    reactions: [],
    conversations: [],
    revision: 0,
    updatedAt: new Date(0).toISOString(),
  };
}
