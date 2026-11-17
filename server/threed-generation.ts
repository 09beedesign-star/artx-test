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
 * 上游 AI：腾讯云 VOD 混元生 3D（2026-11-17 接入，生产实测 147s 出 GLB）。
 * tripo3d / meshy / stability3d 未签约，选择器已隐藏，旧 id 一律走混元。
 */

import { PostgresJsonDocumentStore } from "./postgres-json-store";
import { DEFAULT_THREED_GEN_MODEL_ID, isThreeDGenModelId } from "../shared/model3d";
import { generateHunyuan3DWithVod, isVodAigcConfigured } from "./tencent-vod-aigc";

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
  /**
   * 模型已转存到用户的 3D 模型存储（/api/models3d/:modelId，带鉴权、保留 48h）。
   * 前端画布 3D 容器只认 modelId —— 浏览器不直连外部 URL（国内网络常拉不到）。
   */
  modelId?: string;
  modelName?: string;
  expiresAt?: number;
  /** 用户选的模型失效后自动切到混元 3D 兜底时，记录原模型 id 与失效原因 */
  fallbackFrom?: string;
  fallbackReason?: string;
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
// AI 上游调用：腾讯云 VOD 混元生 3D（CreateAigcHunyuan3DTask）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 生成器签名。所有 3D 模型 id 目前都落到混元 3D 真实上游（其他三家未签约，
 * 选择器里也已只展示混元）；VOD 未配置时（本地 dev / 测试）走演示 GLB。
 */
type ThreeDGenerator = (
  prompt: string,
  model: string,
  referenceImageUrl?: string
) => Promise<{ modelUrl: string }>;

/** 混元 3D 是全站 3D 兜底模型：任何其他 3D 模型失效时立即切到它 */
export const THREED_FALLBACK_MODEL_ID = "hunyuan3d-2.5";

/** 本地 dev（无 VOD 凭据）用的演示模型，仅为跑通 UI 链路。 */
const DEV_DEMO_GLB =
  "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@main/2.0/Duck/glTF-Binary/Duck.glb";

let generatorImpl: ThreeDGenerator = runThreeDGeneration;

/** 仅供测试：替换上游生成函数，模拟某个模型失效 */
export function __setThreeDGeneratorForTests(fn: ThreeDGenerator | null) {
  generatorImpl = fn ?? runThreeDGeneration;
}

/**
 * 参考图 → 腾讯云能拉取的公网 https 地址。
 * - 画布图多为站内相对路径 /uploads/...、/api/images/...：拼 PUBLIC_APP_URL；
 * - data:/blob: 等腾讯拉不到的地址直接丢弃（退回纯文字生成，不报错）；
 * - localhost / 内网地址同样丢弃。
 */
export function resolvePublicReferenceImageUrl(
  raw: string | undefined,
  publicBase = process.env.PUBLIC_APP_URL || process.env.SITE_URL || ""
): string | undefined {
  const value = (raw || "").trim();
  if (!value) return undefined;
  let url: URL;
  try {
    if (/^https?:\/\//i.test(value)) url = new URL(value);
    else if (value.startsWith("/") && !value.startsWith("//") && /^https:\/\//i.test(publicBase)) {
      url = new URL(value, publicBase);
    } else return undefined;
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/i.test(url.hostname)) return undefined;
  return url.toString();
}

async function runThreeDGeneration(
  prompt: string,
  model: string,
  referenceImageUrl?: string
): Promise<{ modelUrl: string }> {
  const resolvedModel = isThreeDGenModelId(model) ? model : DEFAULT_THREED_GEN_MODEL_ID;
  if (!isVodAigcConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("3D 生成服务未配置，请联系管理员");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log(`[threed-gen] VOD 未配置，返回演示模型（仅本地开发）：model=${resolvedModel}`);
    return { modelUrl: DEV_DEMO_GLB };
  }
  const imageUrl = resolvePublicReferenceImageUrl(referenceImageUrl);
  const { modelUrl, taskId } = await generateHunyuan3DWithVod({
    prompt,
    imageUrl,
    // Normal = 带纹理的完整模型（≈20–25 混元积分/次 ≈ ¥2.4–3.0）
    generateType: "Normal",
  });
  console.log(
    `[threed-gen] hunyuan3d completed: model=${resolvedModel} vodTask=${taskId} image=${imageUrl ? "yes" : "no"} prompt="${prompt.slice(0, 60)}"`
  );
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
  onFailed: (task: ThreeDGenerationTask) => Promise<void>,
  /** 把生成结果转存成画布可加载的 modelId。转存失败 = 任务失败（不扣费，前端也加载不了）。 */
  persist?: (
    modelUrl: string,
    task: ThreeDGenerationTask
  ) => Promise<{ modelId: string; modelName: string; expiresAt: number }>
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

  /** 一次完整尝试 = 上游生成 + 转存。任一步失败都算该模型失效。 */
  const attempt = async (attemptModel: string) => {
    const { modelUrl } = await generatorImpl(prompt, attemptModel, referenceImageUrl);
    const stored = persist ? await persist(modelUrl, { ...task, model: attemptModel }) : undefined;
    return { modelUrl, stored };
  };

  void (async () => {
    try {
      let usedModel = model;
      let fallbackInfo: Pick<ThreeDGenerationTask, "fallbackFrom" | "fallbackReason"> = {};
      let result: Awaited<ReturnType<typeof attempt>>;
      try {
        result = await attempt(model);
      } catch (primaryErr) {
        // 用户选的模型失效 → 立即切混元 3D 兜底（选的本来就是混元则不重试，直接失败）
        if (model === THREED_FALLBACK_MODEL_ID) throw primaryErr;
        const reason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        console.warn(`[threed-gen] ${model} 失效，切换 ${THREED_FALLBACK_MODEL_ID} 兜底：${reason}`);
        result = await attempt(THREED_FALLBACK_MODEL_ID);
        usedModel = THREED_FALLBACK_MODEL_ID;
        fallbackInfo = { fallbackFrom: model, fallbackReason: reason.slice(0, 200) };
      }
      const { modelUrl, stored } = result;
      const completed: ThreeDGenerationTask = {
        ...task,
        status: "completed",
        model: usedModel,
        ...fallbackInfo,
        modelUrl,
        ...(stored || {}),
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
