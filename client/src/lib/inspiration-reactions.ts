/**
 * 灵感卡片的「点赞 / 收藏」状态——**唯一事实源**。
 *
 * 【为什么必须收口成一个文件】
 * 这份状态同时被四处消费：
 *   1. 首页灵感推荐卡片的爱心（需求 1）
 *   2. 专题页卡片
 *   3. 专题页详情浮窗的点赞 / 五角星收藏（需求 5）
 *   4. 个人中心「我赞过的 / 我的收藏」两个 tab（需求 2、5）
 * 用户明确要求「取消点赞或取消收藏，个人中心对应内容同步消失」，
 * 📌 **只要状态有第二个出口，就必然出现「这边取消了那边还在」**，而且零报错。
 *
 * 【为什么要存整条内容而不只是 id】
 * 个人中心要把沉淀的内容**用专题页的卡片样式完整渲染出来**（含标题、分类、
 * 提示词、图片、右上角一键导入画布 icon）。
 * ⚠️ 如果只存 id，个人中心就得反查列表 —— 但专题页的数据来自远程接口的分页结果，
 * 用户赞过的那条**未必在当前已加载的页里**，会出现「赞了却查不到、卡片空白」。
 * 所以这里存快照。
 *
 * 【按用户隔离】
 * key 带 userId。⚠️ 不带的话换账号后会看到上一个人的收藏夹。
 */

export type InspirationReactionKind = "like" | "favorite";

/**
 * 沉淀到个人中心的内容快照。
 *
 * 字段刻意与专题页 PromptItem 对齐 —— 个人中心要「所有信息保持一致」，
 * 缺字段就会渲染出和专题页不一样的卡片。
 */
export type InspirationReactionItem = {
  /** 跨页面稳定的身份键（标题归一化后的值） */
  id: string;
  title: string;
  field: string;
  group: string;
  subcategory: string;
  description: string;
  prompt: string;
  imageUrl: string;
  /** 记录时间，用于个人中心按最近优先排序 */
  reactedAt: number;
};

/**
 * 取消点赞 / 取消收藏的墓碑。
 *
 * ⚠️⚠️ 跨设备同步上线后，「取消」**必须**表示成一条带时间戳的记录，
 *    不能表示成「数组里少了一条」。理由见 toggleInspirationReaction 注释：
 *    没有墓碑，取消这个动作根本传不出去，云端会把它合并回来。
 */
export type InspirationReactionTombstone = {
  kind: InspirationReactionKind;
  id: string;
  removedAt: number;
};

export type InspirationReactionState = {
  like: InspirationReactionItem[];
  favorite: InspirationReactionItem[];
  tombstones: InspirationReactionTombstone[];
};

const STORAGE_PREFIX = "artx:inspiration-reactions:";

/**
 * 状态变更广播事件名。
 *
 * ⚠️ 必须广播：首页、专题页、个人中心是三个独立挂载的组件树，
 * 只写 localStorage 的话**同一个标签页内**另外两处根本不会重渲染
 * （`storage` 事件只在跨标签页触发，本标签页写入自己收不到）。
 * 📌 这正是「取消收藏了但个人中心还挂着」最常见的成因。
 */
export const INSPIRATION_REACTIONS_EVENT = "artx:inspiration-reactions-change";

function storageKey(userId: string | null | undefined) {
  // 未登录也允许本地记录，落在 anonymous 桶里；登录后自然切到自己的桶。
  return `${STORAGE_PREFIX}${userId || "anonymous"}`;
}

function emptyState(): InspirationReactionState {
  return { like: [], favorite: [], tombstones: [] };
}

function sanitizeTombstone(raw: unknown): InspirationReactionTombstone | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind === "like" || record.kind === "favorite" ? record.kind : null;
  const id = typeof record.id === "string" ? record.id : "";
  if (!kind || !id) return null;
  return {
    kind,
    id,
    removedAt: typeof record.removedAt === "number" ? record.removedAt : Date.now(),
  };
}

function sanitizeItem(raw: unknown): InspirationReactionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;
  return {
    id,
    title: typeof record.title === "string" ? record.title : "",
    field: typeof record.field === "string" ? record.field : "",
    group: typeof record.group === "string" ? record.group : "",
    subcategory: typeof record.subcategory === "string" ? record.subcategory : "",
    description: typeof record.description === "string" ? record.description : "",
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
    reactedAt: typeof record.reactedAt === "number" ? record.reactedAt : Date.now(),
  };
}

/**
 * 读取当前用户的点赞 / 收藏状态。
 *
 * ⚠️ 任何异常都返回空状态而不是抛错：这份数据只是锦上添花，
 * 它坏掉不应该让整个灵感页白屏。
 */
export function readInspirationReactions(
  userId: string | null | undefined
): InspirationReactionState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pick = (key: InspirationReactionKind) =>
      (Array.isArray(parsed[key]) ? (parsed[key] as unknown[]) : [])
        .map(sanitizeItem)
        .filter((item): item is InspirationReactionItem => item !== null);
    const tombstones = (Array.isArray(parsed.tombstones) ? (parsed.tombstones as unknown[]) : [])
      .map(sanitizeTombstone)
      .filter((item): item is InspirationReactionTombstone => item !== null);
    return { like: pick("like"), favorite: pick("favorite"), tombstones };
  } catch {
    return emptyState();
  }
}

function writeInspirationReactions(
  userId: string | null | undefined,
  state: InspirationReactionState
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch (error) {
    // 配额超了不该打断用户操作，但必须留痕，否则「赞了刷新就没」无从排查。
    console.warn("[inspiration-reactions] persist failed", error);
  }
  window.dispatchEvent(
    new CustomEvent(INSPIRATION_REACTIONS_EVENT, { detail: { userId } })
  );
}

export function isInspirationReacted(
  state: InspirationReactionState,
  kind: InspirationReactionKind,
  id: string
): boolean {
  return state[kind].some(item => item.id === id);
}

/**
 * 切换点赞 / 收藏，返回切换后的最新状态。
 *
 * ⚠️ 返回**新状态**而不是 void：调用方要据此播放点亮动画，
 * 如果让调用方自己再读一次 localStorage，会和写入形成竞态。
 */
export function toggleInspirationReaction(
  userId: string | null | undefined,
  kind: InspirationReactionKind,
  item: Omit<InspirationReactionItem, "reactedAt">
): { state: InspirationReactionState; active: boolean } {
  const current = readInspirationReactions(userId);
  const exists = current[kind].some(entry => entry.id === item.id);
  const now = Date.now();
  const nextList = exists
    ? current[kind].filter(entry => entry.id !== item.id)
    : [{ ...item, reactedAt: now }, ...current[kind]];
  const next: InspirationReactionState = {
    ...current,
    [kind]: nextList,
    /*
     * ⚠️⚠️ 取消时必须**留一条墓碑**，不能只是把它从数组里删掉。
     *    本地删干净 → 上行的载荷里没有这条 → 云端另一台设备那条
     *    active:true 原样保留 → 下一次下行又把它合并回本地。
     *    **用户现象：在这台电脑取消了，刷新一下又赞回来了。**
     *    墓碑的 removedAt 就是 last-write-wins 的时间凭据。
     */
    tombstones: [
      ...current.tombstones.filter(entry => !(entry.kind === kind && entry.id === item.id)),
      ...(exists ? [{ kind, id: item.id, removedAt: now }] : []),
    ],
  };
  writeInspirationReactions(userId, next);
  return { state: next, active: !exists };
}

/**
 * 用云端下行的记录整体替换本地状态。
 *
 * ⚠️ 这里不做合并 —— 合并已经由 shared/workspace-sync.ts 的
 *    mergeWorkspaceSync 在**前后端唯一事实源**里做完了。
 *    在这里再合一次会出现两套语义不一致的合并逻辑，
 *    是「同一份逻辑多个出口」的经典起点。
 */
export function replaceInspirationReactions(
  userId: string | null | undefined,
  state: InspirationReactionState
) {
  writeInspirationReactions(userId, state);
}

/**
 * 计算展示用的点赞数。
 *
 * 【为什么不是把 baseCount 直接 +1 存起来】
 * 卡片上的赞数是**展示用的随机基数**（`randomInspirationMetric()`），
 * 不是真实累计值。用户点赞只影响「我赞没赞」这一件事。
 * 📌 若把它当真实计数持久化，刷新后基数重随机，就会出现
 * 「我赞过的那张，赞数比昨天少了 3000」这种明显穿帮。
 * 所以这里只做「基数 + 我这一票」的纯展示叠加。
 */
export function getDisplayLikeCount(baseCount: number, liked: boolean): number {
  const safeBase = Number.isFinite(baseCount) && baseCount > 0 ? Math.floor(baseCount) : 0;
  return liked ? safeBase + 1 : safeBase;
}
