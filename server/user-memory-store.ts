import { PostgresJsonDocumentStore } from "./postgres-json-store";
import {
  appendPromptMemory,
  createEmptyUserMemoryDocument,
  normalizeUserMemoryPayload,
  upsertProjectMemory,
  STORAGE_MEMORY_LIMITS,
  type UserMemoryDocument,
  type UserProjectMemory,
  type UserPromptMemory,
  type MemoryLimits,
} from "../shared/user-memory";

/**
 * 按账号的长期记忆存储。
 *
 * ⚠️⚠️⚠️ **独立 document key，绝不塞进 `admin-data`。**
 * `PostgresJsonDocumentStore.save()` 是整文档 UPSERT、无行级锁，
 * admin-data 里已经装着全站用户、订单、AI 任务 ——
 * 往那份文档里再加一条每次生成都要写的记忆，等于让每次出图
 * 都去 read-modify-write 全站数据，**并发时后写的整份抹掉先写的且零报错**。
 * 📌 这不是"以后优化"，是上线当天就会丢订单。
 */
const DOCUMENT_KEY = "user-memory";

type UserMemoryDatabase = {
  users: Record<string, UserMemoryDocument>;
};

const store = process.env.DATABASE_URL
  ? new PostgresJsonDocumentStore<UserMemoryDatabase>(process.env.DATABASE_URL, DOCUMENT_KEY)
  : null;

/**
 * 没有 DATABASE_URL 时的内存兜底（本地 dev / 测试）。
 *
 * ⚠️ 兜底的**语义必须和真身一致** —— load 返回深拷贝、save 整份覆盖。
 *    若 load 直接返回同一个对象引用，调用方就是在原地改共享对象，
 *    竞态在内存路径下永远不会发生，针对并发的测试于是**恒绿**，
 *    等于把生产上真实存在的丢数据缺陷从测试里屏蔽掉。
 *    （与 server/workspace-sync-store.ts 同一条教训，2026-09-17 实测。）
 */
const memoryFallback: UserMemoryDatabase = { users: {} };

/**
 * ⚠️⚠️⚠️ 串行写队列 —— 本文件存在的核心理由，理由同 workspace-sync-store.ts。
 *
 * 记忆的写入路径是「load → 改一条 → save」，比画布同步更频繁
 * （每次出图都可能追加一条提示词），不串行化必然互相覆盖。
 *
 * ⚠️ 只能防住**同一个 Node 进程内**的竞态。ArtX 生产是单机单进程，够用；
 *    📌 但凡扩到多实例，这个队列**立刻失效**，必须换 PG 行级锁或 CAS 版本号。
 */
let writeChain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task, task);
  // 吞掉链上的异常，避免一次失败让后续所有写入都被拒绝。
  writeChain = result.catch(() => undefined);
  return result;
}

async function loadDatabase(): Promise<UserMemoryDatabase> {
  if (!store) {
    return { users: JSON.parse(JSON.stringify(memoryFallback.users)) };
  }
  const stored = await store.load();
  if (!stored || typeof stored !== "object" || !stored.users) return { users: {} };
  return { users: stored.users };
}

async function saveDatabase(db: UserMemoryDatabase) {
  if (!store) {
    memoryFallback.users = JSON.parse(JSON.stringify(db.users));
    return;
  }
  await store.save(db);
}

function documentFor(db: UserMemoryDatabase, userId: string): UserMemoryDocument {
  const existing = db.users[userId];
  if (!existing) return createEmptyUserMemoryDocument();
  return {
    // ⚠️⚠️ 读取用「全档最大值」：用 Free 上限会在每次读取时把付费用户已存内容截掉。
    ...normalizeUserMemoryPayload(existing, STORAGE_MEMORY_LIMITS),
    revision: typeof existing.revision === "number" ? existing.revision : 0,
    updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : new Date(0).toISOString(),
  };
}

/** 读取某个用户的记忆文档。 */
export async function getUserMemoryDocument(userId: string): Promise<UserMemoryDocument> {
  if (!userId) return createEmptyUserMemoryDocument();
  const db = await loadDatabase();
  return documentFor(db, userId);
}

async function mutate(
  userId: string,
  mutator: (current: UserMemoryDocument) => UserMemoryDocument,
  limits: MemoryLimits = STORAGE_MEMORY_LIMITS
): Promise<UserMemoryDocument> {
  if (!userId) return createEmptyUserMemoryDocument();
  return runExclusive(async () => {
    const db = await loadDatabase();
    const current = documentFor(db, userId);
    const mutated = mutator(current);
    const next: UserMemoryDocument = {
      ...normalizeUserMemoryPayload(mutated, limits),
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    db.users[userId] = next;
    await saveDatabase(db);
    return next;
  });
}

/**
 * 保存个人中心提交的「长期记忆 + 开关」。
 *
 * ⚠️ 这里是 **patch 语义而非整份替换**：个人中心只管长期记忆文本，
 *    画布开关只管开关，二者是两个独立界面。
 *    若按整份替换，用户在个人中心按一次保存就会把
 *    项目记忆和历史提示词全部清空 —— 且零报错。
 *
 * 2026-10-17 扩展：支持四维度长期记忆（projectMemory、skill、generalRules、regularMemory）。
 * 向后兼容旧版 longTerm 字段。
 */
export async function updateUserMemorySettings(
  userId: string,
  patch: {
    longTerm?: unknown;
    projectMemory?: unknown;
    skill?: unknown;
    generalRules?: unknown;
    regularMemory?: unknown;
    contextEnabled?: unknown;
    ecommerceMemoryEnabled?: unknown;
  },
  /** 该用户会员档位的容量（getMemoryLimitsForPlan）。不传 = 全档最大值，仅供测试/内部调用。 */
  limits: MemoryLimits = STORAGE_MEMORY_LIMITS
): Promise<UserMemoryDocument> {
  /*
   * ⚠️ 档位上限只在「改了记忆文本」时生效。
   *    只拨开关（contextEnabled / ecommerceMemoryEnabled）也按档位归一化的话，
   *    降级用户拨一下开关就会把付费期写的内容永久截掉，且零报错。
   */
  const touchesText = [patch.longTerm, patch.projectMemory, patch.skill, patch.generalRules, patch.regularMemory]
    .some(value => value !== undefined);
  return mutate(userId, current => ({
    ...current,
    ...(patch.longTerm !== undefined ? { longTerm: String(patch.longTerm) } : {}),
    ...(patch.projectMemory !== undefined ? { projectMemory: String(patch.projectMemory) } : {}),
    ...(patch.skill !== undefined ? { skill: String(patch.skill) } : {}),
    ...(patch.generalRules !== undefined ? { generalRules: String(patch.generalRules) } : {}),
    ...(patch.regularMemory !== undefined ? { regularMemory: String(patch.regularMemory) } : {}),
    ...(patch.contextEnabled !== undefined
      ? { contextEnabled: patch.contextEnabled === true }
      : {}),
    ...(patch.ecommerceMemoryEnabled !== undefined
      ? { ecommerceMemoryEnabled: patch.ecommerceMemoryEnabled === true }
      : {}),
  }), touchesText ? limits : STORAGE_MEMORY_LIMITS);
}

/** 记一条项目记忆（同 projectId 覆盖，空 note 等于删除）。 */
export async function saveProjectMemory(
  userId: string,
  entry: UserProjectMemory
): Promise<UserMemoryDocument> {
  return mutate(userId, current => ({
    ...current,
    projects: upsertProjectMemory(current.projects, entry),
  }));
}

/**
 * 追加一条历史提示词（记到某个对话 / 电商画布的作用域下）。
 *
 * ⚠️ 只在**该作用域的记忆开关开着**时才写入 —— 开关关着却偷偷记录，
 *    等于用户以为没开记忆、实际一直在被记录。
 * ⚠️ 2026-10-17 起开关按对话绑定：没有 conversationId（作用域）一律不记，
 *    否则这条会变成不属于任何对话的「孤儿」，永远用不上还占配额。
 * `scopeEnabled` 由调用方从请求体读出（readMemoryScope）。
 */
export async function recordPromptMemory(
  userId: string,
  entry: UserPromptMemory,
  scopeEnabled: boolean
): Promise<UserMemoryDocument | null> {
  if (!userId || !scopeEnabled || !entry.conversationId) return null;
  return mutate(userId, latest => ({
    ...latest,
    recentPrompts: appendPromptMemory(latest.recentPrompts, entry),
  }));
}

/** 仅供测试：重置内存兜底与写队列。 */
export function __resetUserMemoryForTests() {
  memoryFallback.users = {};
  writeChain = Promise.resolve();
}
