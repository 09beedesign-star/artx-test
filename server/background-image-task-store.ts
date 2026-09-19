import { PostgresJsonDocumentStore } from "./postgres-json-store";

const DOCUMENT_KEY = "background-image-tasks";

export type PersistedBackgroundImageTask = {
  taskId: string;
  status: "pending" | "completed" | "failed";
  input: Record<string, unknown>;
  ownerUserId: string;
  images?: Array<{ src: string; width: number; height: number }>;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type BackgroundImageTaskDatabase = {
  tasks: Record<string, PersistedBackgroundImageTask>;
};

const store = process.env.DATABASE_URL
  ? new PostgresJsonDocumentStore<BackgroundImageTaskDatabase>(process.env.DATABASE_URL, DOCUMENT_KEY)
  : null;

/**
 * 没有 DATABASE_URL 时的内存兜底（本地 dev / 测试）。
 *
 * ⚠️ 兜底的**语义**必须和 PG 路径一致（load 返回深拷贝、save 整份覆盖），
 *    否则并发相关的测试会在内存路径下恒绿，等于屏蔽掉生产真实存在的缺陷。
 *    详见 workspace-sync-store.ts 里的同款注释。
 */
const memoryFallback: BackgroundImageTaskDatabase = { tasks: {} };

/**
 * ⚠️⚠️⚠️ 串行写队列 —— 与 workspace-sync-store 同源的理由。
 *
 * PostgresJsonDocumentStore.save() 是整文档 UPSERT 覆盖，没有部分更新、
 * 没有行级锁。两个出图任务同时写回状态会互相整份抹掉，且零报错。
 *
 * ⚠️ 只防同一个 Node 进程内的竞态。ArtX 生产是单机单进程，够用；
 *    扩多实例当天就必须换成 PG 行级锁或 CAS 版本号写回。
 */
let writeChain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task, task);
  writeChain = result.catch(() => undefined);
  return result;
}

async function loadDatabase(): Promise<BackgroundImageTaskDatabase> {
  if (!store) {
    return { tasks: JSON.parse(JSON.stringify(memoryFallback.tasks)) };
  }
  const stored = await store.load();
  if (!stored || typeof stored !== "object" || !stored.tasks) return { tasks: {} };
  return { tasks: stored.tasks };
}

async function saveDatabase(db: BackgroundImageTaskDatabase) {
  if (!store) {
    memoryFallback.tasks = JSON.parse(JSON.stringify(db.tasks));
    return;
  }
  await store.save(db);
}

/** 任务保留时长：超过这个时间的任务会在下一次写入时被顺手清掉。 */
const TASK_RETENTION_MS = 24 * 60 * 60 * 1000;

function pruneExpired(tasks: Record<string, PersistedBackgroundImageTask>) {
  const now = Date.now();
  Object.keys(tasks).forEach((taskId) => {
    const task = tasks[taskId];
    if (!task || now - task.updatedAt > TASK_RETENTION_MS) {
      delete tasks[taskId];
    }
  });
  return tasks;
}

/** 读取单个任务。查不到返回 undefined。 */
export async function getBackgroundImageTask(
  taskId: string
): Promise<PersistedBackgroundImageTask | undefined> {
  if (!taskId) return undefined;
  const db = await loadDatabase();
  return db.tasks[taskId];
}

/**
 * 写入/更新单个任务。
 *
 * ⚠️ 必须走串行队列：这是 load→改→save，天然带 read-modify-write 竞态。
 */
export async function saveBackgroundImageTask(task: PersistedBackgroundImageTask): Promise<void> {
  if (!task?.taskId) return;
  await runExclusive(async () => {
    const db = await loadDatabase();
    pruneExpired(db.tasks);
    db.tasks[task.taskId] = task;
    await saveDatabase(db);
  });
}

/** 删除单个任务。 */
export async function deleteBackgroundImageTask(taskId: string): Promise<void> {
  if (!taskId) return;
  await runExclusive(async () => {
    const db = await loadDatabase();
    pruneExpired(db.tasks);
    delete db.tasks[taskId];
    await saveDatabase(db);
  });
}

/**
 * 进程启动时把仍是 pending 的历史任务标记为失败。
 *
 * ⚠️⚠️⚠️ 这是本模块存在的**核心理由**。
 *
 * 出图任务的执行体活在进程内存里（`runBackgroundImageTask` 的那个
 * async 调用栈）。进程一旦重启——哪怕是正常部署触发的重启——那些正在跑的
 * 任务就**永远不会再有人去写回结果**，它们会以 pending 状态永远挂在库里，
 * 前端一直轮询到超时。
 *
 * 📌 光把任务表持久化是不够的：持久化解决的是"查得到"，
 *    这个函数解决的是"查到的状态是对的"。少了它，用户等 8 分钟
 *    才拿到超时，而不是立刻知道任务被重启打断了。
 *
 * 返回被标记的任务数，方便启动日志打印。
 */
export async function failInterruptedBackgroundImageTasks(): Promise<number> {
  return runExclusive(async () => {
    const db = await loadDatabase();
    pruneExpired(db.tasks);
    let count = 0;
    Object.keys(db.tasks).forEach((taskId) => {
      const task = db.tasks[taskId];
      if (task.status !== "pending") return;
      db.tasks[taskId] = {
        ...task,
        status: "failed",
        error: "服务重启导致任务中断，请重新生成",
        updatedAt: Date.now(),
      };
      count += 1;
    });
    if (count > 0) await saveDatabase(db);
    return count;
  });
}

/** 仅供测试使用：清空内存兜底。 */
export function __resetBackgroundImageTaskStoreForTests() {
  memoryFallback.tasks = {};
  writeChain = Promise.resolve();
}
