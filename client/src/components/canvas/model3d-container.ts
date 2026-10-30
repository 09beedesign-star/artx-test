/**
 * 3D 画布容器（model3d 节点）的数据模型与纯函数。
 *
 * 2026-10-30 交互改版：
 * - 「创建 3D 画布」先在画布上放一个**空的 3D 容器**（带网格地面和轨道视角），不再直接弹出文件选择框；
 * - 模型拖进容器 → 上传后加载到**这个**容器里；
 * - 模型拖到画布空白处（没有落在任何 3D 容器上）→ 在落点自动新建一个 3D 容器，再把模型放进去。
 */

/**
 * 模型在 3D 画布里的摆放（位移 / 旋转四元数 / 缩放）。
 * 存进节点 data，才能走画布统一的 pushHistory / undoCanvas —— 不另开 3D 回退分支。
 * 缺省 = 加载时自动摆放的初始位置。
 */
export type Model3DTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
};

export type Model3DItem = {
  modelId: string;
  modelName: string;
  uploadedAt: number;
  expiresAt: number;
  transform?: Model3DTransform;
};

export type Model3DTransformMode = "translate" | "rotate" | "scale";

export type Model3DNodeData = {
  models: Model3DItem[];
  /** 正在上传的模型数量；只用来显示上传进度。 */
  uploadingCount?: number;
  /** 本轮上传的开始时间。刷新页面后上传已经中断，超过时限就当作没有上传。 */
  uploadingSince?: number;
  /** 最近一次因超过保留期被自动清除的信息；容器里常驻提示，直到再放入新模型。 */
  expiredCleared?: { count: number; at: number };
  // ── 旧版（单模型节点）字段，只读兼容 ──
  modelId?: string;
  modelName?: string;
  uploadedAt?: number;
  expiresAt?: number;
};

export const MODEL3D_CONTAINER_WIDTH = 560;
export const MODEL3D_CONTAINER_HEIGHT = 420;
export const MODEL3D_CONTAINER_MIN_WIDTH = 320;
export const MODEL3D_CONTAINER_MIN_HEIGHT = 260;

/**
 * 3D 视口的 class。原始画布挂在根节点上的捕获阶段监听器（中键平移、Ctrl/⌘+滚轮缩放）
 * 遇到这个 class 必须直接放行：鼠标在 3D 视口里时，所有操作只作用于 3D 场景。
 */
export const MODEL3D_VIEWPORT_CLASS = "model3d-viewport";

export function isInsideModel3DViewport(target: EventTarget | null): boolean {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    Boolean(target.closest(`.${MODEL3D_VIEWPORT_CLASS}`))
  );
}

/** 3D 场景配色。浅色模式用深灰背景，深色模式用黑色背景，网格线统一用浅灰。 */
export function getModel3DSceneColors(isDark: boolean) {
  return {
    background: isDark ? 0x000000 : 0x3a3a3f,
    gridLine: 0xbdbdc2,
    gridCenter: 0xe4e4e8,
  };
}
const UPLOADING_STALE_MS = 10 * 60 * 1000;

/** 兼容旧的单模型节点：把顶层的 modelId 字段转换成 models 列表。 */
export function getContainerModels(data: Record<string, unknown> | undefined): Model3DItem[] {
  if (!data) return [];
  const list = Array.isArray(data.models) ? (data.models as Model3DItem[]) : [];
  const valid = list.filter(m => m && typeof m.modelId === "string" && m.modelId);
  if (valid.length > 0) return valid;
  if (typeof data.modelId === "string" && data.modelId) {
    return [
      {
        modelId: data.modelId,
        modelName: String(data.modelName || "3D 模型"),
        uploadedAt: Number(data.uploadedAt || 0),
        expiresAt: Number(data.expiresAt || 0),
      },
    ];
  }
  return [];
}

export function getActiveUploadingCount(
  data: Record<string, unknown> | undefined,
  now = Date.now()
): number {
  const count = Number(data?.uploadingCount || 0);
  const since = Number(data?.uploadingSince || 0);
  if (count <= 0 || !since || now - since > UPLOADING_STALE_MS) return 0;
  return count;
}

export type ContainerRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 找出落点所在的 3D 容器。
 * 多个容器重叠时，返回列表里最后一个（渲染在最上层的那个）。
 */
export function findModel3DContainerAt(
  point: { x: number; y: number },
  rects: ContainerRect[]
): string | null {
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (
      point.x >= r.x &&
      point.x <= r.x + r.width &&
      point.y >= r.y &&
      point.y <= r.y + r.height
    ) {
      return r.id;
    }
  }
  return null;
}

/** 追加模型时按 modelId 去重。 */
export function appendContainerModels(
  data: Record<string, unknown> | undefined,
  added: Model3DItem[]
): Model3DItem[] {
  const current = getContainerModels(data);
  const seen = new Set(current.map(m => m.modelId));
  return [...current, ...added.filter(m => !seen.has(m.modelId))];
}

/**
 * 按 expiresAt 拆分出已过期的模型。
 * expiresAt 缺失（0）视为未知，不在前端判过期 —— 交给服务端 404 + expired 兜底。
 */
export function partitionExpiredModels(
  models: Model3DItem[],
  now = Date.now()
): { alive: Model3DItem[]; expired: Model3DItem[] } {
  const alive: Model3DItem[] = [];
  const expired: Model3DItem[] = [];
  for (const m of models) {
    if (m.expiresAt > 0 && m.expiresAt <= now) expired.push(m);
    else alive.push(m);
  }
  return { alive, expired };
}

/** 从容器数据里移除指定模型，并记下「已自动清除」的提示信息。 */
export function removeExpiredContainerModels(
  data: Record<string, unknown> | undefined,
  modelIds: string[],
  now = Date.now()
): Record<string, unknown> {
  const drop = new Set(modelIds);
  const current = getContainerModels(data);
  const kept = current.filter(m => !drop.has(m.modelId));
  const removed = current.length - kept.length;
  if (removed === 0) return { ...(data || {}) };
  const prev = (data?.expiredCleared as { count?: number } | undefined)?.count || 0;
  const next: Record<string, unknown> = {
    ...(data || {}),
    models: kept,
    expiredCleared: { count: prev + removed, at: now },
  };
  // 旧版单模型字段也要清掉，否则 getContainerModels 会把它“复活”。
  if (typeof next.modelId === "string" && drop.has(next.modelId)) {
    delete next.modelId;
    delete next.modelName;
    delete next.uploadedAt;
    delete next.expiresAt;
  }
  return next;
}

/** 删除模型二次确认里的说明：只移出画布，不动用户本地的原始文件。 */
export const MODEL3D_DELETE_CONFIRM_NOTICE_ZH = "删除只会把模型从 3D 画布中移除，不会影响你本地原本的模型文件。";

/** 写回单个模型的摆放（拖完一次操作轴时调用）。 */
export function setContainerModelTransform(
  data: Record<string, unknown> | undefined,
  modelId: string,
  transform: Model3DTransform
): Record<string, unknown> {
  const models = getContainerModels(data).map(m => (m.modelId === modelId ? { ...m, transform } : m));
  return { ...(data || {}), models };
}

/** 从容器中删除一个模型（只改画布数据，不删服务器/本地文件）。 */
export function removeContainerModel(
  data: Record<string, unknown> | undefined,
  modelId: string
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(data || {}),
    models: getContainerModels(data).filter(m => m.modelId !== modelId),
  };
  if (next.modelId === modelId) {
    delete next.modelId;
    delete next.modelName;
    delete next.uploadedAt;
    delete next.expiresAt;
  }
  return next;
}

export function isSameModel3DTransform(a?: Model3DTransform, b?: Model3DTransform): boolean {
  if (!a || !b) return a === b;
  const eq = (x: number[], y: number[]) => x.every((v, i) => Math.abs(v - y[i]) < 1e-6);
  return eq(a.position, b.position) && eq(a.quaternion, b.quaternion) && eq(a.scale, b.scale);
}

export type Model3DShortcut = Model3DTransformMode | "delete" | null;

/** 3D 画布里有选中模型时的单键快捷键：W 位移 / R 旋转 / S 缩放 / Delete·Backspace 删除。 */
export function resolveModel3DShortcut(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): Model3DShortcut {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key.toLowerCase()) {
    case "w":
      return "translate";
    case "r":
      return "rotate";
    case "s":
      return "scale";
    case "delete":
    case "backspace":
      return "delete";
    default:
      return null;
  }
}

/** 距离删除不足 1 小时（且尚未过期）的模型，按剩余时间升序。 */
export function getModelsExpiringSoon(
  models: Model3DItem[],
  now = Date.now(),
  windowMs = 60 * 60 * 1000
): { item: Model3DItem; remainingMs: number }[] {
  return models
    .filter(m => m.expiresAt > 0)
    .map(item => ({ item, remainingMs: item.expiresAt - now }))
    .filter(x => x.remainingMs > 0 && x.remainingMs <= windowMs)
    .sort((a, b) => a.remainingMs - b.remainingMs);
}

/** 倒计时文案：59:08；不足 0 显示 00:00。 */
export function formatModel3DCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 下载用的文件名：保证带上原始扩展名。 */
export function getModel3DDownloadName(item: Pick<Model3DItem, "modelId" | "modelName">): string {
  const ext = item.modelId.split(".").pop()?.toLowerCase() || "glb";
  const base = (item.modelName || "model").replace(/[\\/:*?"<>|]+/g, "_").trim() || "model";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}
