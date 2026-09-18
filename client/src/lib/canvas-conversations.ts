/**
 * 画布对话「多会话」数据层 —— 唯一事实源。
 *
 * 【2026-09-18 新增】在此之前，画布对话是**完全扁平**的：
 * 一个项目对应一条消息流，存在 `artx:canvas-assistant-messages:${projectId}`，
 * 全项目搜 `conversationId|sessionId|threadId` 零命中 —— 没有任何「会话」概念。
 *
 * 用户要的是 Lovart / Miora 那种「新建对话 + 历史对话」：
 * 同一个画布下可以开多条互不干扰的对话，随时切回去看历史。
 *
 * ⚠️⚠️ 为什么单独开一个文件，而不是往 InfiniteCanvas.tsx 里加：
 *    那个文件已经 22000 行，且 `setMessages` 有 17 个调用点。
 *    把「当前是哪条会话」的判断分散进去，必然出现「改了一个出口漏了另一个」
 *    —— 本项目最高频的事故模式。
 *    ✅ 收敛成：所有出口都只管改 messages，**存哪个 key 由这里唯一决定**。
 */

export type CanvasConversationMeta = {
  id: string;
  /** 会话标题。取首条用户消息前 20 字；没有用户消息时为空串，由 UI 兜底显示。 */
  title: string;
  createdAt: string;
  updatedAt: string;
  /** 仅用于历史列表展示，不参与任何逻辑判断。 */
  messageCount: number;
};

export type CanvasConversationIndex = {
  activeId: string;
  conversations: CanvasConversationMeta[];
};

const INDEX_PREFIX = "artx:canvas-conversations:";
const MESSAGES_PREFIX = "artx:canvas-assistant-messages:";

/**
 * 单个画布最多保留多少条会话。
 *
 * ⚠️ 必须有上限：localStorage 是 5MB 硬配额，而本项目**已经因为画布图片
 *    撑爆过配额**（2026-09-15 三层存储图片丢失事故）。会话无限增长会重演。
 * ⚠️⚠️ 【2026-09-18 用户拍板改为 20】必须与 shared/workspace-sync.ts 的
 *    MAX_SYNCED_CONVERSATIONS_PER_PROJECT **完全相等**。
 *    本地存 40 条而云端只收 20 条，会让用户在另一台设备上
 *    「对话少了一半」，本机看着却是好的 —— 不对称且零报错，极难排查。
 *    📌 改一个必须同时改另一个；
 *       server/workspace-sync-conversations.test.ts 有测试盯着两者相等。
 */
export const MAX_CANVAS_CONVERSATIONS = 20;

/** 标题截取长度。用户确认「取首条用户消息前 20 字」。 */
export const CONVERSATION_TITLE_MAX_LENGTH = 20;

/** 历史列表里没有标题时显示的兜底文案。 */
export const CONVERSATION_FALLBACK_TITLE = "新对话";

export function canvasConversationIndexKey(projectId: string) {
  return `${INDEX_PREFIX}${projectId || "p1"}`;
}

/**
 * 某条会话的消息存储 key。
 *
 * ⚠️⚠️ `conversationId` 为空时**必须**退回老 key（不带会话后缀）。
 *    老用户的历史消息就躺在 `artx:canvas-assistant-messages:p1` 里，
 *    如果新代码一律写成 `...:p1:xxx`，老数据不会报错、不会提示，
 *    只是**一打开画布发现对话全没了** —— 静默丢数据是最坏的一种。
 *    ✅ 迁移策略见 `ensureConversationIndex`：把老 key 直接认作第一条会话。
 */
export function canvasConversationMessagesKey(
  projectId: string,
  conversationId: string
) {
  const base = `${MESSAGES_PREFIX}${projectId || "p1"}`;
  return conversationId ? `${base}:${conversationId}` : base;
}

export function createCanvasConversationId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `c${Date.now().toString(36)}${random}`;
}

/**
 * 从消息列表里推导标题。
 *
 * ⚠️ 只认 role === "user" 的消息：助手的种子问候语
 *    （「你好，请直接告诉我你想生成什么内容…」）每条会话开头都有，
 *    拿它当标题会让历史列表里所有会话**长得一模一样**，等于没有标题。
 */
export function deriveConversationTitle(
  messages: Array<{ role: string; content: string }>
): string {
  const firstUser = messages.find(
    message => message.role === "user" && message.content.trim()
  );
  if (!firstUser) return "";
  const normalized = firstUser.content.replace(/\s+/g, " ").trim();
  if (normalized.length <= CONVERSATION_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}…`;
}

/**
 * ⚠️⚠️ 这里刻意**只要求 id 是 string，不要求非空**。
 *
 * 空串 id 是迁移用的合法值 —— 它代表「这条会话读写不带后缀的老 key」
 * （见 canvasConversationMessagesKey / ensureConversationIndex）。
 *
 * 📌 如果这里写成 `record.id.length > 0`，迁移出来的那条老会话会在
 *    「写进索引 → 下次读出来」这一轮被静默过滤掉，表现为
 *    **老用户刷新一次后历史对话凭空少一条**，而且没有任何报错。
 *    这类「写得进、读不出」的不对称校验极难排查，故单独注明。
 */
const LEGACY_CONVERSATION_ID = "";

function isConversationMeta(value: unknown): value is CanvasConversationMeta {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string";
}

function normalizeMeta(value: CanvasConversationMeta): CanvasConversationMeta {
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    messageCount:
      typeof value.messageCount === "number" && Number.isFinite(value.messageCount)
        ? value.messageCount
        : 0,
  };
}

/**
 * 按 updatedAt 倒序排列（最近的在最前），并截断到上限。
 *
 * ⚠️ 时间戳解析必须**先直接 new Date**，失败了才退化 —— 与
 *    shared/workspace-sync.ts:121 的 parseSyncTimestamp 保持同一口径。
 *    反过来先 replace 会把 ISO 串解析成 NaN，导致排序结果看似随机。
 */
function parseTime(value?: string): number {
  if (!value || typeof value !== "string") return 0;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;
  const normalized = new Date(value.replace(/-/g, "/")).getTime();
  return Number.isFinite(normalized) ? normalized : 0;
}

export function sortConversations(
  conversations: CanvasConversationMeta[]
): CanvasConversationMeta[] {
  return [...conversations]
    .sort((a, b) => parseTime(b.updatedAt) - parseTime(a.updatedAt))
    .slice(0, MAX_CANVAS_CONVERSATIONS);
}

export function parseConversationIndex(raw: string | null): CanvasConversationIndex | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const list = Array.isArray((parsed as Record<string, unknown>).conversations)
      ? ((parsed as Record<string, unknown>).conversations as unknown[])
      : [];
    const conversations = list.filter(isConversationMeta).map(normalizeMeta);
    if (conversations.length === 0) return null;
    /*
      ⚠️ 判据是「activeId 是否指向一条真实存在的会话」，
         **不是**「activeId 是否非空」—— 空串是合法的老会话 id。
         写成 `rawActive ? ... : ...` 会让老用户每次刷新都跳回列表首条。
    */
    const rawActive = (parsed as Record<string, unknown>).activeId;
    const activeId =
      typeof rawActive === "string" &&
      conversations.some(item => item.id === rawActive)
        ? rawActive
        : conversations[0].id;
    return { activeId, conversations: sortConversations(conversations) };
  } catch {
    return null;
  }
}

export function createConversationMeta(
  id = createCanvasConversationId()
): CanvasConversationMeta {
  const now = new Date().toISOString();
  return { id, title: "", createdAt: now, updatedAt: now, messageCount: 0 };
}

/**
 * 应用某条会话的最新消息：更新标题、时间、条数，并把它提到最前。
 *
 * ⚠️ 标题一旦推导出来就**不再覆盖**：用户可能已经重命名过，
 *    每次发消息都重算会把用户改的名字冲掉。
 */
export function touchConversation(
  index: CanvasConversationIndex,
  conversationId: string,
  messages: Array<{ role: string; content: string }>
): CanvasConversationIndex {
  const now = new Date().toISOString();
  let found = false;
  const conversations = index.conversations.map(item => {
    if (item.id !== conversationId) return item;
    found = true;
    return {
      ...item,
      title: item.title || deriveConversationTitle(messages),
      updatedAt: now,
      messageCount: messages.length,
    };
  });
  if (!found) {
    conversations.push({
      ...createConversationMeta(conversationId),
      title: deriveConversationTitle(messages),
      updatedAt: now,
      messageCount: messages.length,
    });
  }
  return { activeId: index.activeId, conversations: sortConversations(conversations) };
}

/**
 * 删除一条会话，返回新索引与「需要清理的消息 key」。
 *
 * ⚠️⚠️ 删到只剩 0 条时必须**立刻补一条空会话**，不能返回空列表。
 *    空列表会让 activeId 指向不存在的会话，UI 拿不到消息流，
 *    表现为「删完最后一条对话后面板一片空白且再也点不动」。
 */
export function removeConversation(
  index: CanvasConversationIndex,
  conversationId: string
): { index: CanvasConversationIndex; removedId: string } {
  const remaining = index.conversations.filter(item => item.id !== conversationId);
  if (remaining.length === 0) {
    const fresh = createConversationMeta();
    return {
      index: { activeId: fresh.id, conversations: [fresh] },
      removedId: conversationId,
    };
  }
  const activeId =
    index.activeId === conversationId ? remaining[0].id : index.activeId;
  return { index: { activeId, conversations: remaining }, removedId: conversationId };
}

/**
 * 读取（必要时创建）某个画布的会话索引，并完成**老数据迁移**。
 *
 * ⚠️⚠️⚠️ 这是整个改动风险最高的一处。老用户的消息躺在不带会话后缀的
 *    `artx:canvas-assistant-messages:${projectId}` 里。三种情况必须分清：
 *
 *    1. 已有新索引 → 直接用，什么都不做。
 *    2. 没索引、但老 key 有消息 → **认作第一条会话**，且这条会话的
 *       conversationId 记为空串，让它继续读写老 key。
 *       📌 刻意**不搬运数据**：搬运要先读全量再写新 key 再删老 key，
 *          中间任何一步触发 localStorage 配额失败，老数据就没了。
 *          原地认领是零风险的。
 *    3. 全新用户 → 建一条空会话。
 *
 * 📌 判据：迁移的正确性不能靠「跑一次看着没事」，要靠
 *    「老 key 的字节从头到尾没被改写过」。
 *
 * ⚠️⚠️⚠️ 【2026-09-18 线上实测修复】必须传 `write` 并在新建索引后**立刻落盘**。
 *    不落盘会出现这个零报错的 bug：本函数走 2、3 两条分支时会 `createConversationMeta()`
 *    生成**随机 id**，而调用方（InfiniteCanvas）会调它两次
 *    —— useState 初值一次 + `[projectId]` effect 一次 ——
 *    两次拿到两个**不同**的 id，消息落盘 effect 便给每个 id 各写一份种子消息。
 *    线上抓到的现场：localStorage 里躺着两条
 *    `artx:canvas-assistant-messages:<pid>:<随机id>`，而索引 key 压根不存在；
 *    索引的写入 effect 又要求「至少有一条用户消息」才写，
 *    于是**只要用户还没说话，索引就永远不存在** → 每刷新一次多一条空会话，
 *    历史列表恒为空。
 *
 * 📌⭐⭐⭐ 判据：**名字叫 `ensureX` 就等于承诺幂等**。内部一旦有随机源
 *    （id / 时间戳），就必须在产出的同一次调用里落盘，
 *    否则「ensure」是假的 —— 它每次都在 create。
 *
 * ⚠️ `write` 保持可选：SSR 和只读探测场景仍可只读调用，不能崩。
 */
export function ensureConversationIndex(
  projectId: string,
  read: (key: string) => string | null,
  write?: (key: string, value: string) => void
): CanvasConversationIndex {
  const existing = parseConversationIndex(read(canvasConversationIndexKey(projectId)));
  if (existing) return existing;

  const persist = (index: CanvasConversationIndex): CanvasConversationIndex => {
    if (!write) return index;
    try {
      write(canvasConversationIndexKey(projectId), JSON.stringify(index));
    } catch {
      /* 配额失败也要返回可用索引：宁可这次不落盘，也不能让画布打不开。 */
    }
    return index;
  };

  const legacyRaw = read(
    canvasConversationMessagesKey(projectId, LEGACY_CONVERSATION_ID)
  );
  let legacyCount = 0;
  let legacyMessages: Array<{ role: string; content: string }> = [];
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        legacyMessages = parsed.filter(
          (item): item is { role: string; content: string } =>
            Boolean(item) &&
            typeof item.role === "string" &&
            typeof item.content === "string"
        );
        legacyCount = legacyMessages.length;
      }
    } catch {
      legacyCount = 0;
    }
  }

  if (legacyCount > 0) {
    const now = new Date().toISOString();
    const legacy: CanvasConversationMeta = {
      // 空 id = 继续读写老 key，见 canvasConversationMessagesKey 的注释。
      id: LEGACY_CONVERSATION_ID,
      title: deriveConversationTitle(legacyMessages),
      createdAt: now,
      updatedAt: now,
      messageCount: legacyCount,
    };
    return persist({
      activeId: LEGACY_CONVERSATION_ID,
      conversations: [legacy],
    });
  }

  const fresh = createConversationMeta();
  return persist({ activeId: fresh.id, conversations: [fresh] });
}

/** 相对时间展示，用于历史列表。 */
export function formatConversationTime(value: string, now = Date.now()): string {
  const time = parseTime(value);
  if (!time) return "";
  const diff = now - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const date = new Date(time);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}
