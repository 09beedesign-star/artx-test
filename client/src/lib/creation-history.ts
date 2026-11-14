/**
 * 创作历史 —— 本地存储层。
 *
 * 🔒🔒 2026-11-14 用户硬性要求：**所有历史记录存在用户本地，不能创建在云端**。
 *   - 记录：浏览器 IndexedDB（库名 artx-creation-history）。
 *     ⚠️ 不要把它挪进浏览器 LS 的 `artx:` 键 —— 那一片里有走云同步模块的数据，
 *        混进去迟早有人把它加进同步清单。也**不要**调任何 /api 上传。
 *   - 图片：写进用户用 showDirectoryPicker 选的本地文件夹（File System Access API）。
 *     目录句柄同样存 IndexedDB，刷新后只需重新授权，不用重新选。
 *   - 浏览器不支持选文件夹（Safari / Firefox）时，记录照常存本地，只是不落盘。
 */

import {
  buildLocalFileName,
  formatFromMime,
  type CreationHistoryRecord,
} from "./creation-history-core";
import {
  normalizeTagNames,
  type TagNames,
} from "./creation-history-tags";

export * from "./creation-history-core";

const DB_NAME = "artx-creation-history";
const DB_VERSION = 1;
const RECORD_STORE = "records";
const SETTINGS_STORE = "settings";
export const CREATION_HISTORY_CHANGED_EVENT = "artx-creation-history-changed";
/** 单账号最多保留的记录数（只存元数据 + 远端地址，几 KB 一条）。 */
export const CREATION_HISTORY_LIMIT = 2000;

type DirPermission = "granted" | "denied" | "prompt";

/** 目录里的文件句柄（只读 getFile 用于「打开文件夹」列表）。 */
export interface LocalFileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

/** File System Access API 的最小类型（TS DOM lib 里还没有 showDirectoryPicker）。 */
export interface LocalDirectoryHandle {
  kind: "directory";
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
  /** 遍历目录条目；浏览器从 IndexedDB 取回的句柄同样支持。 */
  values?(): AsyncIterable<LocalFileHandleLike | { kind: "directory"; name: string }>;
  queryPermission?(descriptor: { mode: "readwrite" }): Promise<DirPermission>;
  requestPermission?(descriptor: { mode: "readwrite" }): Promise<DirPermission>;
}

/** 「快速打开本地文件夹」视图里的一张图片。url 是 objectURL，关闭视图时须 revoke。 */
export interface LocalFolderFile {
  name: string;
  size: number;
  lastModified: number;
  url: string;
}

export function isLocalFolderSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          const store = db.createObjectStore(RECORD_STORE, { keyPath: "id" });
          store.createIndex("ownerId", "ownerId", { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CREATION_HISTORY_CHANGED_EVENT));
}

export async function readCreationHistory(ownerId: string): Promise<CreationHistoryRecord[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(RECORD_STORE, "readonly");
    const all = await reqToPromise(tx.objectStore(RECORD_STORE).index("ownerId").getAll(ownerId));
    return (all as CreationHistoryRecord[]).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function putRecords(records: CreationHistoryRecord[]): Promise<void> {
  if (!records.length) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(RECORD_STORE, "readwrite");
    const store = tx.objectStore(RECORD_STORE);
    records.forEach(r => store.put(r));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 历史是辅助功能，写失败不打断生成
  } finally {
    db.close();
  }
}

/** 追加记录（同 id 已存在的跳过）；超上限删最旧的。返回真正新增的记录。 */
export async function addCreationHistoryRecords(records: CreationHistoryRecord[]): Promise<CreationHistoryRecord[]> {
  if (!records.length) return [];
  const ownerId = records[0].ownerId;
  const existing = await readCreationHistory(ownerId);
  const seen = new Set(existing.map(r => r.id));
  const fresh = records.filter(r => !seen.has(r.id));
  if (!fresh.length) return [];
  await putRecords(fresh);
  const overflow = existing.length + fresh.length - CREATION_HISTORY_LIMIT;
  if (overflow > 0) {
    await deleteCreationHistoryRecords(existing.slice(-overflow).map(r => r.id), { silent: true });
  }
  notifyChanged();
  return fresh;
}

/**
 * 批量更新记录：一次事务写完整批，只广播一次变更。
 * ⚠️ 打标签 / 取消标签必须走这里 —— 逐条调 updateCreationHistoryRecord 会并发开 N 个
 *    事务并触发 N 次 refresh，页面读到中间态（多出口事故 A 的变体）。
 */
export async function updateCreationHistoryRecords(
  records: CreationHistoryRecord[],
  options: { silent?: boolean } = {},
): Promise<void> {
  await putRecords(records);
  if (!options.silent) notifyChanged();
}

export async function updateCreationHistoryRecord(record: CreationHistoryRecord): Promise<void> {
  await updateCreationHistoryRecords([record]);
}

export async function deleteCreationHistoryRecords(ids: string[], options: { silent?: boolean } = {}): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(RECORD_STORE, "readwrite");
    ids.forEach(id => tx.objectStore(RECORD_STORE).delete(id));
    await new Promise<void>(resolve => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
  if (!options.silent) notifyChanged();
}

// ── 本地文件夹 ───────────────────────────────────────────────

function dirKey(ownerId: string) {
  return `dir:${ownerId}`;
}

function tagNamesKey(ownerId: string) {
  return `tags:${ownerId}`;
}

async function readSetting<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const value = await reqToPromise(tx.objectStore(SETTINGS_STORE).get(key));
    return (value as T) ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function writeSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put(value, key);
    await new Promise<void>(resolve => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

/**
 * 六种颜色标签的名称。⚠️ 只存在创作历史自己的 IndexedDB settings store，
 * 不进 workspace-sync、不进云端；只有创作历史界面会读它。
 */
export async function readTagNames(ownerId: string): Promise<TagNames> {
  return normalizeTagNames(await readSetting<unknown>(tagNamesKey(ownerId)));
}

export async function writeTagNames(ownerId: string, names: TagNames): Promise<void> {
  await writeSetting(tagNamesKey(ownerId), normalizeTagNames(names));
}

export async function getSavedDirectory(ownerId: string): Promise<LocalDirectoryHandle | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const handle = await reqToPromise(tx.objectStore(SETTINGS_STORE).get(dirKey(ownerId)));
    return (handle as LocalDirectoryHandle) || null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function saveDirectory(ownerId: string, handle: LocalDirectoryHandle | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    if (handle) tx.objectStore(SETTINGS_STORE).put(handle, dirKey(ownerId));
    else tx.objectStore(SETTINGS_STORE).delete(dirKey(ownerId));
    await new Promise<void>(resolve => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** 弹系统文件夹选择框（必须在点击事件里调）。用户取消返回 null。 */
export async function pickLocalDirectory(ownerId: string): Promise<LocalDirectoryHandle | null> {
  if (!isLocalFolderSupported()) return null;
  try {
    const picker = (window as unknown as {
      showDirectoryPicker: (options?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<LocalDirectoryHandle>;
    }).showDirectoryPicker;
    const handle = await picker({ id: "artx-creation-history", mode: "readwrite", startIn: "pictures" });
    await saveDirectory(ownerId, handle);
    notifyChanged();
    return handle;
  } catch {
    return null; // AbortError = 用户取消
  }
}

export async function forgetLocalDirectory(ownerId: string): Promise<void> {
  await saveDirectory(ownerId, null);
  notifyChanged();
}

export async function getDirectoryPermission(handle: LocalDirectoryHandle): Promise<DirPermission> {
  try {
    return handle.queryPermission ? await handle.queryPermission({ mode: "readwrite" }) : "granted";
  } catch {
    return "denied";
  }
}

/** 重新授权（刷新后浏览器会把权限降回 prompt，必须在点击事件里调）。 */
export async function requestDirectoryPermission(handle: LocalDirectoryHandle): Promise<boolean> {
  try {
    const state = handle.requestPermission ? await handle.requestPermission({ mode: "readwrite" }) : "granted";
    notifyChanged();
    return state === "granted";
  } catch {
    return false;
  }
}

async function fetchImageBlob(src: string): Promise<Blob | null> {
  const tryFetch = async (url: string) => {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!blob.size) throw new Error("empty");
    return blob;
  };
  try {
    return await tryFetch(src);
  } catch {
    // 跨域图（上游直链）走站内代理再试一次
    if (/^https?:\/\//i.test(src) && !src.includes("/api/images/proxy")) {
      try {
        return await tryFetch(`/api/images/proxy?url=${encodeURIComponent(src)}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 图片扩展名：文件夹视图只列图片，忽略目录与非图片文件。 */
const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;

/**
 * 列出本地文件夹里的图片（🔒 2026-11-14「快速打开保存的本地文件夹」）。
 * ⚠️ 浏览器不允许网页直接唤起 Finder / 资源管理器，所以这里在页面内把文件夹内容读出来展示；
 *    另有 openLocalFolderInSystemPicker 用系统文件窗口定位到该目录。
 * ⚠️ 没权限 / 不支持 values() 时返回空数组，不抛 —— 页面据此显示提示而不是白屏。
 */
export async function readLocalFolderImages(handle: LocalDirectoryHandle): Promise<LocalFolderFile[]> {
  if (!handle.values || (await getDirectoryPermission(handle)) !== "granted") return [];
  const out: LocalFolderFile[] = [];
  try {
    for await (const entry of handle.values()) {
      if (entry.kind !== "file" || !IMAGE_FILE_RE.test(entry.name)) continue;
      const file = await (entry as LocalFileHandleLike).getFile();
      out.push({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        url: URL.createObjectURL(file),
      });
    }
  } catch {
    return out;
  }
  return out.sort((a, b) => b.lastModified - a.lastModified).slice(0, 200);
}

export type SystemPickerResult = "opened" | "cancelled" | "unsupported";

/** 在系统文件窗口里定位到已保存的文件夹（startIn 接受目录句柄）。必须在点击事件里调。 */
export async function openLocalFolderInSystemPicker(handle: LocalDirectoryHandle): Promise<SystemPickerResult> {
  const picker = (window as unknown as {
    showOpenFilePicker?: (options?: {
      startIn?: unknown;
      multiple?: boolean;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<unknown[]>;
  }).showOpenFilePicker;
  if (typeof picker !== "function") return "unsupported";
  try {
    await picker({
      startIn: handle,
      multiple: false,
      types: [{ description: "图片", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"] } }],
    });
    return "opened";
  } catch {
    return "cancelled";
  }
}

/**
 * 把记录对应的图片写进本地文件夹，成功返回带 localFileName 的新记录。
 * 📌 没授权 / 不支持 / 下载失败一律返回 null，不抛 —— 调用方据此显示「未保存到本地」。
 */
export async function saveRecordToDirectory(
  record: CreationHistoryRecord,
  handle: LocalDirectoryHandle,
): Promise<CreationHistoryRecord | null> {
  if ((await getDirectoryPermission(handle)) !== "granted") return null;
  const blob = await fetchImageBlob(record.src);
  if (!blob) return null;
  const realFormat = formatFromMime(blob.type) || record.format;
  const next: CreationHistoryRecord = { ...record, format: realFormat };
  const fileName = buildLocalFileName(next);
  try {
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch {
    return null;
  }
  const saved = { ...next, localFileName: fileName };
  await putRecords([saved]);
  return saved;
}

/** 把还没落盘的记录补写进文件夹（换文件夹 / 重新授权后调用）。返回成功条数。 */
export async function syncPendingRecordsToDirectory(ownerId: string, handle: LocalDirectoryHandle): Promise<number> {
  const records = await readCreationHistory(ownerId);
  let ok = 0;
  for (const record of records.filter(r => !r.localFileName)) {
    if (await saveRecordToDirectory(record, handle)) ok += 1;
  }
  if (ok) notifyChanged();
  return ok;
}
