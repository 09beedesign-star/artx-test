/**
 * server/threed-generation.ts
 *
 * 3D 生成任务：存储层 + 路由处理器。
 *
 * 架构与 background-image-task-store.ts 保持一致：
 * - PostgresJsonDocumentStore 持久化，本地 dev 内存兜底。
 * - 串行写队列（runExclusive）防止 load→改→save 竞态。
 * - 进程启动时把残留 pending 任务标记为 failed。
 * - POST /api/threed/generate  → 立即返回 taskId，后台异步生成。
 * - GET  /api/threed/tasks/:id → 查询任务状态。
 *
 * 上游 AI（v1 阶段）：
 * - hunyuan3d-2.5 → 腾讯混元 3D 2.5（占位：返回演示 GLB URL，待接真实 API）
 * - tripo3d-v2.5  → Tripo3D API（占位）
 * - meshy-4       → Meshy API（占位）
 * - stability3d-fast → Stability3D API（占位）
 *
 * ⚠️ v1 只做 mock（返回开源演示模型 URL），UI 和计费链路全部真实。
 *    真实上游接入在各自独立 PR 里完成，不阻塞流程落地。
 */

import { PostgresJsonDocumentStore } from "./postgres-json-store";
import { DEFAULT_THREED_GEN_MODEL_ID, isThreeDGenModelId } from "../shared/model3d";

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

export type ThreeDGenerationTask = {
  taskId: string;
  status: "pending" | "completed" | "failed";
  prompt: string;
  model: string;
  referenceImageUrl?: string;
  ownerUserId: string;
  /** 生成成功后的 GLB/GLTF URL（相对路径 /uploads/... 或绝对 URL） */
  modelUrl?: string;
  /** 生成失败原因 */
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type ThreeDTaskDatabase = {
  tasks: Record<string, ThreeDGenerationTask>;
};

// ─────────────────────────────────────────────────────────────────────────────
// 持久化层
// ─────────────────────────────────────────────────────────────────────────────

const DOCUMENT_KEY = "threed-generation-tasks";

const store = process.env.DATABASE_URL
  ? new PostgresJsonDocumentStore<ThreeDTaskDatabase>(process.env.DATABASE_URL, DOCUMENT_KEY)
  : null;

const memoryFallback: ThreeDTaskDatabase = { tasks: {} };

/** 任务保留 24 小时（3D 模型文件自身是 48 小时，任务记录更短） */
const TASK_RETENTION_MS = 24 * 60 * 60 * 1000;

let writeChain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task, task);
  writeChain = result.catch(() => undefined);
  return result;
}

async function loadDatabase(): Promise<ThreeDTaskDatabase> {
  if (!store) {
    return { tasks: JSON.parse(JSON.stringify(memoryFallback.tasks)) };
  }
  const stored = await store.load();
  if (!stored || typeof stored !== "object" || !stored.tasks) return { tasks: {} };
  return { tasks: stored.tasks };
}

async function saveDatabase(db: ThreeDTaskDatabase) {
  if (!store) {
    memoryFallback.tasks = JSON.parse(JSON.stringify(db.tasks));
    return;
  }
  await store.save(db);
}

function pruneExpired(tasks: Record<string, ThreeDGenerationTask>) {
  const now = Date.now();
  Object.keys(tasks).forEach((id) => {
    const t = tasks[id];
    if (!t || now - t.updatedAt > TASK_RETENTION_MS) delete tasks[id];
  });
  return tasks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 公开 CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getThreeDTask(taskId: string): Promise<ThreeDGenerationTask | undefined> {
  if (!taskId) return undefined;
  const db = await loadDatabase();
  return db.tasks[taskId];
}

export async function saveThreeDTask(task: ThreeDGenerationTask): Promise<void> {
  if (!task?.taskId) return;
  await runExclusive(async () => {
    const db = await loadDatabase();
    pruneExpired(db.tasks);
    db.tasks[task.taskId] = task;
    await saveDatabase(db);
  });
}

/**
 * 进程启动时把上一次进程里仍是 pending 的任务标记为 failed，
 * 防止前端永远轮询到超时。
 */
export async function failInterruptedThreeDTasks(): Promise<number> {
  return runExclusive(async () => {
    const db = await loadDatabase();
    pruneExpired(db.tasks);
    let count = 0;
    Object.keys(db.tasks).forEach((id) => {
      const t = db.tasks[id];
      if (t.status !== "pending") return;
      db.tasks[id] = {
        ...t,
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

/** 仅供测试使用 */
export function __resetThreeDTaskStoreForTests() {
  memoryFallback.tasks = {};
  writeChain = Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────────────
// AI 上游调用（v1 mock，返回公开演示 GLB）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 演示用 GLB URL —— 来自 Khronos glTF Sample Models 仓库，公开可访问。
 * 真实上游接入后替换此函数。
 */
const DEMO_GLB_BY_MODEL: Record<string, string> = {
  "hunyuan3d-2.5":
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb",
  "tripo3d-v2.5":
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/BoomBox/glTF-Binary/BoomBox.glb",
  "meshy-4":
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/FlightHelmet/glTF-Binary/FlightHelmet.glb",
  "stability3d-fast":
    "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Avocado/glTF-Binary/Avocado.glb",
};

const FALLBACK_DEMO_GLB = DEMO_GLB_BY_MODEL["hunyuan3d-2.5"];

/**
 * 核心生成函数 —— v1 只做 mock（模拟 2–4 秒延迟后返回演示 GLB URL）。
 * 真实上游接入时只需替换这个函数，存储层和路由不动。
 */
async function runThreeDGeneration(
  prompt: string,
  model: string,
  _referenceImageUrl?: string
): Promise<{ modelUrl: string }> {
  // 模拟真实上游的网络延迟（2–4 秒）
  const delay = 2000 + Math.random() * 2000;
  await new Promise((resolve) => setTimeout(resolve, delay));

  const resolvedModel = isThreeDGenModelId(model) ? model : DEFAULT_THREED_GEN_MODEL_ID;
  const modelUrl = DEMO_GLB_BY_MODEL[resolvedModel] ?? FALLBACK_DEMO_GLB;

  console.log(`[threed-gen] mock completed: model=${resolvedModel} prompt="${prompt.slice(0, 60)}" url=${modelUrl}`);
  return { modelUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由处理器（供 server/index.ts 调用）
// ─────────────────────────────────────────────────────────────────────────────

export type ThreeDGenerateRequest = {
  prompt?: unknown;
  model?: unknown;
  referenceImageUrl?: unknown;
  taskId?: unknown;
};

/**
 * POST /api/threed/generate
 *
 * body: { prompt, model?, referenceImageUrl?, taskId? }
 * 立即返回 task（status: "pending"），后台异步生成。
 */
export async function handleThreeDGenerate(
  body: ThreeDGenerateRequest,
  ownerUserId: string,
  onComplete: (task: ThreeDGenerationTask) => Promise<void>,
  onFailed: (task: ThreeDGenerationTask) => Promise<void>
): Promise<ThreeDGenerationTask> {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("prompt 不能为空");

  const rawModel = typeof body.model === "string" ? body.model.trim() : "";
  const model = isThreeDGenModelId(rawModel) ? rawModel : DEFAULT_THREED_GEN_MODEL_ID;
  const referenceImageUrl =
    typeof body.referenceImageUrl === "string" && body.referenceImageUrl.trim()
      ? body.referenceImageUrl.trim()
      : undefined;

  const taskId =
    typeof body.taskId === "string" && body.taskId.trim()
      ? body.taskId.trim()
      : `threed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const task: ThreeDGenerationTask = {
    taskId,
    status: "pending",
    prompt,
    model,
    referenceImageUrl,
    ownerUserId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // ⚠️ 先落库再异步触发，防止"刚创建就查不到"窗口。
  await saveThreeDTask(task);

  void (async () => {
    try {
      const { modelUrl } = await runThreeDGeneration(prompt, model, referenceImageUrl);
      const completed: ThreeDGenerationTask = {
        ...task,
        status: "completed",
        modelUrl,
        updatedAt: Date.now(),
      };
      await saveThreeDTask(completed);
      await onComplete(completed);
    } catch (err) {
      const error = err instanceof Error ? err.message : "3D generation failed";
      const failed: ThreeDGenerationTask = {
        ...task,
        status: "failed",
        error,
        updatedAt: Date.now(),
      };
      await saveThreeDTask(failed);
      await onFailed(failed);
    }
  })();

  return task;
}
