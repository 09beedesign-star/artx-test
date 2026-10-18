/**
 * 电商画布任务持久化
 * 
 * 与工作台的 canvas-image-gen-persistence 类似,但作用域是电商画布(产品模式和带货图文模式)。
 * 每个账号独立存储,限制60个任务。
 */

const STORAGE_KEY_PREFIX = "artx:ecommerce-canvas-tasks:";
const TASK_LIMIT = 60;

export interface EcommerceTaskInput {
  mode: "product" | "post";
  prompt: string;
  model: string;
  count: number;
  sourceImageSrc?: string;
  backgroundTaskInput?: {
    capability: string;
    operation?: string;
    model: string;
    count: number;
    prompt: string;
    sourceImageDataUrl?: string;
  };
}

export interface EcommercePersistedTask {
  generationId: string;
  accountId: string | null;
  mode: "product" | "post";
  status: "pending" | "completed" | "failed";
  prompt: string;
  model: string;
  count: number;
  sourceImageSrc?: string;
  backgroundTaskInput?: {
    capability: string;
    operation?: string;
    model: string;
    count: number;
    prompt: string;
    sourceImageDataUrl?: string;
  };
  images?: string[];
  error?: string;
  createdAt: number;
  generationStartedAt?: number;
  backgroundStartedAt?: number;
  consumedAt?: number;
  updatedAt: number;
}

function getStorageKey(accountId: string | null): string {
  return `${STORAGE_KEY_PREFIX}${accountId || "guest"}`;
}

export function readEcommerceTasks(accountId: string | null): EcommercePersistedTask[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeEcommerceTasks(
  accountId: string | null,
  tasks: EcommercePersistedTask[]
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const limited = tasks.slice(-TASK_LIMIT);
    localStorage.setItem(getStorageKey(accountId), JSON.stringify(limited));
  } catch {
    // 静默失败
  }
}

export function persistEcommerceTask(
  accountId: string | null,
  input: EcommerceTaskInput & { generationId: string }
): void {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const newTask: EcommercePersistedTask = {
    generationId: input.generationId,
    accountId,
    mode: input.mode,
    status: "pending",
    prompt: input.prompt,
    model: input.model,
    count: input.count,
    sourceImageSrc: input.sourceImageSrc,
    backgroundTaskInput: input.backgroundTaskInput,
    createdAt: now,
    updatedAt: now,
  };
  writeEcommerceTasks(accountId, [...tasks, newTask]);
}

export function markEcommerceTaskBackgroundStarted(
  accountId: string | null,
  generationId: string
): void {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const updated = tasks.map(t =>
    t.generationId === generationId && !t.backgroundStartedAt
      ? { ...t, backgroundStartedAt: now, updatedAt: now }
      : t
  );
  writeEcommerceTasks(accountId, updated);
}

export function markEcommerceTaskCompleted(
  accountId: string | null,
  generationId: string,
  images: string[]
): void {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const updated = tasks.map(t =>
    t.generationId === generationId
      ? { ...t, status: "completed" as const, images, updatedAt: now }
      : t
  );
  writeEcommerceTasks(accountId, updated);
}

export function markEcommerceTaskFailed(
  accountId: string | null,
  generationId: string,
  error: string
): void {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const updated = tasks.map(t =>
    t.generationId === generationId
      ? { ...t, status: "failed" as const, error, updatedAt: now }
      : t
  );
  writeEcommerceTasks(accountId, updated);
}

export function markEcommerceTaskConsumed(
  accountId: string | null,
  generationId: string
): void {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const updated = tasks.map(t =>
    t.generationId === generationId && !t.consumedAt
      ? { ...t, consumedAt: now, updatedAt: now }
      : t
  );
  writeEcommerceTasks(accountId, updated);
}

export function cancelPendingEcommerceTaskRecovery(accountId: string | null): void {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const updated = tasks.map(t =>
    !t.consumedAt && (t.status === "pending" || t.status === "completed")
      ? { ...t, consumedAt: now, updatedAt: now }
      : t
  );
  writeEcommerceTasks(accountId, updated);
}

export function readPendingEcommerceTasks(
  accountId: string | null
): EcommercePersistedTask[] {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  /**
   * ⚠️ 客户端超时 5 分钟 vs 服务端 10 分钟：带货图文模式出很多张图时，
   * 客户端可能已标超时但服务端仍在跑。该窗口是防守底线，正常应走 2 分钟恢复窗口。
   */
  const TIMEOUT_MS = 300_000; // 5分钟,与工作台一致
  
  let changed = false;
  const checked = tasks.map(task => {
    if (
      task.status === "pending" &&
      !task.consumedAt &&
      task.backgroundStartedAt &&
      now - task.backgroundStartedAt > TIMEOUT_MS
    ) {
      changed = true;
      return {
        ...task,
        status: "failed" as const,
        error: "对不起，网络开了个小差，请稍后重试",
        updatedAt: now,
      };
    }
    return task;
  });
  
  if (changed) {
    writeEcommerceTasks(accountId, checked);
  }
  
  return checked.filter(t => t.status === "pending" && !t.consumedAt);
}

export function consumeCompletedEcommerceTasks(
  accountId: string | null
): EcommercePersistedTask[] {
  const tasks = readEcommerceTasks(accountId);
  const now = Date.now();
  const completedTasks = tasks.filter(
    t => t.status === "completed" && !t.consumedAt
  );
  
  if (completedTasks.length > 0) {
    const updated = tasks.map(t =>
      completedTasks.some(ct => ct.generationId === t.generationId)
        ? { ...t, consumedAt: now, updatedAt: now }
        : t
    );
    writeEcommerceTasks(accountId, updated);
  }
  
  return completedTasks;
}
