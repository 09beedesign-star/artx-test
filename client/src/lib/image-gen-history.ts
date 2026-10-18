/**
 * 生成历史记录（电商画布 / 智能产品共用）- localStorage 持久化
 *
 * 规则：
 * - 按「作用域 + 账号」隔离，游客用 "guest"
 * - 每个作用域最多保留 HISTORY_LIMIT 条
 * - ⚠️ 只存图片 URL：图本身在服务端 /uploads，按文件 mtime 保留 retentionDays 天后被清理。
 *   记录的过期口径必须跟服务端同源 —— retentionDays 由调用方从 /api/uploads/expiry 取，
 *   本模块**不写死天数**（兜底值只在接口没返回时用，见 shared/upload-retention.ts）。
 */

import type { EcommerceHistoryEntry } from "../components/ecommerce/EcommerceHistory";

export type ImageHistoryScope = "ecommerce-canvas" | "smart-commerce";

export const HISTORY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function getStorageKey(accountId: string | null, scope: ImageHistoryScope): string {
  return `artx:${scope}-history:${accountId || "guest"}`;
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is EcommerceHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EcommerceHistoryEntry>;
  return typeof item.id === "string" && Array.isArray(item.images) && typeof item.createdAt === "number";
}

export function readEcommerceHistory(
  accountId: string | null,
  scope: ImageHistoryScope = "ecommerce-canvas",
): EcommerceHistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(getStorageKey(accountId, scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function writeEcommerceHistory(
  accountId: string | null,
  entries: EcommerceHistoryEntry[],
  scope: ImageHistoryScope = "ecommerce-canvas",
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(getStorageKey(accountId, scope), JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // 配额满等：历史是辅助功能，写失败不打断生成。
  }
}

/**
 * 追加一条（最新在前），返回写入后的完整列表，调用方直接 setState，避免内存与存储两份口径。
 * 同 id 已存在则不重复写（后台轮询恢复时会对同一任务再发一次 completed）。
 */
export function addEcommerceHistoryEntry(
  accountId: string | null,
  entry: EcommerceHistoryEntry,
  scope: ImageHistoryScope = "ecommerce-canvas",
): EcommerceHistoryEntry[] {
  const existing = readEcommerceHistory(accountId, scope);
  if (existing.some(e => e.id === entry.id)) return existing;
  const updated = [entry, ...existing].slice(0, HISTORY_LIMIT);
  writeEcommerceHistory(accountId, updated, scope);
  return updated;
}

/** 智能产品在画布里发出的完成事件 style 标识（InfiniteCanvas smart-commerce-product-create）。 */
export const SMART_COMMERCE_RESULT_STYLE = "智能产品图结果";

type ImageTaskEventDetail = {
  style?: string;
  status?: string;
  generationId?: string;
  model?: string;
  prompt?: string;
  count?: number;
  images?: Array<{ src?: string } | null | undefined>;
};

/**
 * 把画布的 image-generator-submit 事件转成智能产品历史条目；不是智能产品的完成事件返回 null。
 *
 * ⚠️ 判定只认 style + completed + 有图三件事：pending / failed 也走同一个事件，
 *    不过滤会把「生成中」的空记录写进历史。
 */
export function smartCommerceEntryFromTask(
  detail: ImageTaskEventDetail | null | undefined,
  now: number = Date.now(),
): EcommerceHistoryEntry | null {
  if (!detail || detail.style !== SMART_COMMERCE_RESULT_STYLE || detail.status !== "completed") return null;
  const images = (detail.images || [])
    .map(image => (image && typeof image.src === "string" ? image.src : ""))
    .filter(Boolean);
  if (images.length === 0) return null;
  return {
    id: detail.generationId || `smart-${now}`,
    mode: "product",
    model: detail.model || "",
    count: images.length,
    credits: 0,
    templateName: "",
    backgroundName: "",
    prompt: detail.prompt || "",
    images,
    createdAt: now,
  };
}

export function deleteEcommerceHistoryEntry(
  accountId: string | null,
  entryId: string,
  scope: ImageHistoryScope = "ecommerce-canvas",
): EcommerceHistoryEntry[] {
  const updated = readEcommerceHistory(accountId, scope).filter(e => e.id !== entryId);
  writeEcommerceHistory(accountId, updated, scope);
  return updated;
}

export function clearEcommerceHistory(
  accountId: string | null,
  scope: ImageHistoryScope = "ecommerce-canvas",
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(getStorageKey(accountId, scope));
  } catch {
    // ignore
  }
}

/**
 * 记录是否已超过服务端保留期（图已被清理）。
 *
 * 📌 记录的 createdAt 是生成完成时刻，服务端文件 mtime 是落盘时刻，两者相差秒级；
 *    按 createdAt 判会比服务端**略早**认定过期，宁早勿晚——晚了用户看到的是一排坏图。
 */
export function isHistoryEntryExpired(
  entry: Pick<EcommerceHistoryEntry, "createdAt">,
  retentionDays: number,
  now: number = Date.now(),
): boolean {
  if (!(retentionDays > 0)) return false;
  return now - entry.createdAt >= retentionDays * DAY_MS;
}

/** 剩余天数（向上取整，与服务端 daysLeft 同口径），已过期返回 0。 */
export function getHistoryEntryDaysLeft(
  entry: Pick<EcommerceHistoryEntry, "createdAt">,
  retentionDays: number,
  now: number = Date.now(),
): number {
  const left = entry.createdAt + retentionDays * DAY_MS - now;
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/** 删掉已过保留期的记录并写回；返回剩余列表。 */
export function pruneExpiredHistory(
  accountId: string | null,
  retentionDays: number,
  scope: ImageHistoryScope = "ecommerce-canvas",
  now: number = Date.now(),
): EcommerceHistoryEntry[] {
  const existing = readEcommerceHistory(accountId, scope);
  const kept = existing.filter(entry => !isHistoryEntryExpired(entry, retentionDays, now));
  if (kept.length !== existing.length) writeEcommerceHistory(accountId, kept, scope);
  return kept;
}
