import { PostgresJsonDocumentStore } from "./postgres-json-store";
import {
  createEmptyWorkspaceSyncDocument,
  enforceSyncDocumentBudget,
  mergeWorkspaceSync,
  normalizeWorkspaceSyncPayload,
  stripInlineImagesForSync,
  type WorkspaceSyncDocument,
  type WorkspaceSyncPayload,
} from "../shared/workspace-sync";

const DOCUMENT_KEY = "workspace-sync";

type WorkspaceSyncDatabase = {
  users: Record<string, WorkspaceSyncDocument>;
};

const store = process.env.DATABASE_URL
  ? new PostgresJsonDocumentStore<WorkspaceSyncDatabase>(process.env.DATABASE_URL, DOCUMENT_KEY)
  : null;

/**
 * 没有 DATABASE_URL 时的内存兜底（本地 dev / 测试）。
 *
 * ⚠️ 刻意**不**写文件：同步数据是纯派生数据，本地开发丢了无所谓，
 *    而落地文件反而会让 dev 环境里出现一份和生产不一致的"幽灵状态"。
 */
const memoryFallback: WorkspaceSyncDatabase = { users: {} };

/**
 * ⚠️⚠️⚠️ 串行写队列 —— 本文件存在的**核心理由**。
 *
 * server/postgres-json-store.ts 的 save() 是整文档 UPSERT 覆盖，
 * 既没有部分更新也没有行级锁。两个请求同时进来会这样：
 *
 *   请求A: load(rev=5) ──────────→ save(rev=6, 只含A的改动)
 *   请求B:      load(rev=5) ──────────→ save(rev=6, 只含B的改动)  ← 把A抹了
 *
 * 这是典型的 read-modify-write 竞态。**用户的现象是「我在另一台电脑
 * 新建的画布过一会儿自己没了」，而且服务端零报错、日志里什么都看不到。**
 *
 * ✅ 解法：所有写操作串到同一条 Promise 链上，保证
 *    「load → merge → save」是一个不可分割的整体。
 *
 * ⚠️ 这只能防住**同一个 Node 进程内**的竞态。ArtX 生产是单机单进程
 *    （CVM 43.161.241.133 上一个 Node :3002），所以够用。
 *    📌 但凡以后扩到多实例，这个队列就**立刻失效** ——
 *    那时必须换成 PG 行级锁（SELECT ... FOR UPDATE）或 CAS 版本号写回。
 *    这不是"以后优化"，是"扩容当天就会丢数据"。
 */
let writeChain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task, task);
  // 吞掉链上的异常，避免一次失败让后续所有写入都被拒绝。
  writeChain = result.catch(() => undefined);
  return result;
}

async function loadDatabase(): Promise<WorkspaceSyncDatabase> {
  if (!store) {
    /*
     * ⚠️⚠️ 必须返回**深拷贝**，不能返回 memoryFallback 本身。
     *
     * 真实的 PG 路径拿到的是一份序列化快照，调用方改它不影响库里那份，
     * 要等 save 才整份写回去 —— 正是这个「快照 → 改 → 整份覆盖」的语义
     * 制造了 read-modify-write 竞态。
     *
     * 📌 如果内存兜底返回同一个对象引用，调用方就是在原地改共享对象，
     *    **竞态在内存路径下永远不会发生**。后果不是「内存路径更安全」，
     *    而是：任何针对并发的测试在内存路径下都**恒绿**，
     *    等于把生产上真实存在的丢数据缺陷从测试里彻底屏蔽掉。
     *    （2026-09-17 实测：拆掉串行队列后 9 条测试依然全绿。）
     *
     * ✅ 判据：兜底实现的**语义**必须和真身一致，否则它是个测不出问题的假人。
     */
    return { users: JSON.parse(JSON.stringify(memoryFallback.users)) };
  }
  const stored = await store.load();
  if (!stored || typeof stored !== "object" || !stored.users) return { users: {} };
  return { users: stored.users };
}

async function saveDatabase(db: WorkspaceSyncDatabase) {
  if (!store) {
    // 同上：整份覆盖，与 PostgresJsonDocumentStore.save 的 UPSERT 语义一致。
    memoryFallback.users = JSON.parse(JSON.stringify(db.users));
    return;
  }
  await store.save(db);
}

function documentFor(db: WorkspaceSyncDatabase, userId: string): WorkspaceSyncDocument {
  const existing = db.users[userId];
  if (!existing) return createEmptyWorkspaceSyncDocument();
  return {
    ...normalizeWorkspaceSyncPayload(existing),
    revision: typeof existing.revision === "number" ? existing.revision : 0,
    updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : new Date(0).toISOString(),
  };
}

/** 读取某个用户的同步文档。 */
export async function getWorkspaceSyncDocument(userId: string): Promise<WorkspaceSyncDocument> {
  if (!userId) return createEmptyWorkspaceSyncDocument();
  const db = await loadDatabase();
  return documentFor(db, userId);
}

/**
 * 把客户端上行的载荷合并进云端文档。
 *
 * 返回**合并后的完整文档**，客户端据此回写本地 —— 这样一次往返就能
 * 完成「我的改动上去了 + 别的设备的改动下来了」，不需要再拉一次。
 */
export async function mergeWorkspaceSyncDocument(
  userId: string,
  incoming: unknown
): Promise<WorkspaceSyncDocument> {
  if (!userId) return createEmptyWorkspaceSyncDocument();

  return runExclusive(async () => {
    const db = await loadDatabase();
    const current = documentFor(db, userId);

    /*
     * ⚠️⚠️ 必须在服务端**再剥一次**内联 base64 图。
     *    客户端已经剥过了，但服务端不能信任客户端 ——
     *    一个旧版本前端、或者改过的请求，就能往 PG 的一行 jsonb 里
     *    塞进几十 MB 的 base64，把整个用户的同步文档搞到再也 load 不动。
     *
     * 📌 判据：凡是"体积会决定服务能不能用"的约束，
     *    校验点必须在服务端，客户端那次只是省流量的优化。
     */
    const sanitized = stripInlineImagesForSync(normalizeWorkspaceSyncPayload(incoming));
    const merged: WorkspaceSyncPayload = enforceSyncDocumentBudget(
      mergeWorkspaceSync(
        {
          projects: current.projects,
          canvases: current.canvases,
          deletions: current.deletions,
          // ⚠️ 漏掉 reactions 这一项，合并的 base 侧就永远是空数组 ——
          //    表现为「另一台设备的点赞永远同步不过来」，且零报错。
          reactions: current.reactions,
          /*
           * ⚠️⚠️ 同上，而且会话漏了后果更重：base 侧为空 = 云端已有的对话
           *    每次都被客户端载荷**整份替换**。用户在 A 电脑的对话会在
           *    B 电脑同步一次之后消失，且服务端日志里什么都看不到。
           *
           * 📌 这里漏字段 TypeScript 会报错（形参类型是 WorkspaceSyncPayload，
           *    对象字面量必须补齐）—— 但**写成 `...current` 展开就静默了**，
           *    因为 current 是 WorkspaceSyncDocument，多带 revision/updatedAt
           *    反而能过编译，将来新增字段也就永远不会有人想起来加。
           *    所以刻意逐字段列出，让「加了新字段忘了接」变成编译错误。
           */
          conversations: current.conversations,
        },
        sanitized
      )
    );

    const next: WorkspaceSyncDocument = {
      ...merged,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };

    db.users[userId] = next;
    await saveDatabase(db);
    return next;
  });
}

/** 仅供测试：重置内存兜底与写队列。 */
export function __resetWorkspaceSyncForTests() {
  memoryFallback.users = {};
  writeChain = Promise.resolve();
}
