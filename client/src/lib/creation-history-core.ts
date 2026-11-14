/**
 * 创作历史 —— 纯函数部分（无 IndexedDB / 文件系统依赖，便于单测）。
 *
 * 🔒 2026-11-14 用户硬性要求：**所有创作历史只存在用户本地，不能进云端**。
 *    记录存浏览器 IndexedDB（不在 workspace-sync 的同步范围内），
 *    图片文件写进用户自己选的本地文件夹。
 */

import type { TagColorId } from "./creation-history-tags";

export type CreationImageFormat = "png" | "jpg" | "webp" | "gif" | "svg" | "other";

export interface CreationHistoryRecord {
  /** `${generationId}#${index}` —— 同一批次的恢复事件会再发一次 completed，按它去重。 */
  id: string;
  ownerId: string;
  generationId: string;
  /** 画板 id（= 用户口中的「项目」） */
  projectId: string;
  projectName: string;
  /** 画板所属项目（文件夹）；空 = 未归类 */
  folderName: string;
  prompt: string;
  model: string;
  style: string;
  /** 生成时的远端地址（服务端只保留 15 天，本地文件才是长期副本） */
  src: string;
  width: number;
  height: number;
  format: CreationImageFormat;
  createdAt: number;
  /** 已写入本地文件夹的文件名；空 = 还没落盘 */
  localFileName?: string;
  /**
   * 色彩标签 id（🔒 2026-11-14）。⚠️ 只在创作历史界面渲染，
   * 画布 / 社区 / 其他页面不得读取；标签名称配置存在本库的 settings store。
   * 删除记录时标签随之消失，不需要额外的映射表。
   */
  tagIds?: TagColorId[];
}

export type CreationHistorySortKey = "history" | "project" | "format" | "folder" | "time";

export const CREATION_HISTORY_SORT_OPTIONS: Array<{ key: CreationHistorySortKey; label: string }> = [
  { key: "history", label: "历史" },
  { key: "project", label: "项目" },
  { key: "format", label: "图片格式" },
  { key: "folder", label: "所属项目" },
  { key: "time", label: "时间" },
];

export const FORMAT_LABELS: Record<CreationImageFormat, string> = {
  png: "PNG",
  jpg: "JPG",
  webp: "WEBP",
  gif: "GIF",
  svg: "SVG",
  other: "其他格式",
};

const MIME_TO_FORMAT: Record<string, CreationImageFormat> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function formatFromMime(mime: string | null | undefined): CreationImageFormat | null {
  if (!mime) return null;
  return MIME_TO_FORMAT[mime.split(";")[0].trim().toLowerCase()] || null;
}

/** 从 data URL 的 mime 或 URL 路径后缀推断格式；推不出返回 "other"（落盘时再用真实 blob.type 修正）。 */
export function detectImageFormat(src: string): CreationImageFormat {
  const dataMatch = /^data:([^;,]+)/i.exec(src);
  if (dataMatch) return formatFromMime(dataMatch[1]) || "other";
  let path = src;
  try {
    const url = new URL(src, "http://local");
    // 代理地址：真实图片地址在 url 参数里
    const inner = url.searchParams.get("url");
    path = inner ? new URL(inner, "http://local").pathname : url.pathname;
    const fmt = url.searchParams.get("format") || (inner ? new URL(inner, "http://local").searchParams.get("format") : null);
    if (fmt) {
      const f = fmt.toLowerCase();
      if (f === "jpeg" || f === "jpg") return "jpg";
      if (f === "png" || f === "webp" || f === "gif" || f === "svg") return f;
    }
  } catch {
    // 不是合法 URL 就按原串匹配后缀
  }
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  if (ext === "jpeg" || ext === "jpg") return "jpg";
  if (ext === "png" || ext === "webp" || ext === "gif" || ext === "svg") return ext;
  return "other";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 本地文件名：`ArtX_20261114-130512_<画板名>_<短id>.png`，非法字符替换掉。 */
export function buildLocalFileName(record: Pick<CreationHistoryRecord, "id" | "createdAt" | "projectName" | "format">): string {
  const d = new Date(record.createdAt);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const name = (record.projectName || "未命名画板").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 24);
  const shortId = record.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "img";
  const ext = record.format === "other" ? "png" : record.format;
  return `ArtX_${stamp}_${name}_${shortId}.${ext}`;
}

export interface CreationHistoryGroup {
  key: string;
  label: string;
  records: CreationHistoryRecord[];
}

function dayLabel(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDay) / 86_400_000);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 按右侧选中的维度分组 + 排序。
 * - history：不分组，按生成时间倒序平铺
 * - project：按画板分组（组按最近一次生成排序）
 * - format：按图片格式分组
 * - folder：按画板所属项目分组（空 = 未归类，排最后）
 * - time：按天分组；`ascending` 控制时间正序/倒序
 * 组内永远按时间排序（与 ascending 同向）。
 */
export function groupCreationHistory(
  records: CreationHistoryRecord[],
  sortKey: CreationHistorySortKey,
  options: { ascending?: boolean; now?: number } = {},
): CreationHistoryGroup[] {
  const ascending = Boolean(options.ascending);
  const now = options.now ?? Date.now();
  const byTime = (a: CreationHistoryRecord, b: CreationHistoryRecord) =>
    ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
  const sorted = [...records].sort(byTime);

  if (sortKey === "history") {
    return sorted.length ? [{ key: "all", label: "全部记录", records: sorted }] : [];
  }

  const keyOf = (r: CreationHistoryRecord): [string, string] => {
    switch (sortKey) {
      case "project":
        return [`p:${r.projectId}`, r.projectName || "未命名画板"];
      case "format":
        return [`f:${r.format}`, FORMAT_LABELS[r.format] || "其他格式"];
      case "folder":
        return r.folderName ? [`d:${r.folderName}`, r.folderName] : ["d:", "未归类"];
      case "time":
      default: {
        const label = dayLabel(r.createdAt, now);
        return [`t:${label}`, label];
      }
    }
  };

  const map = new Map<string, CreationHistoryGroup>();
  for (const r of sorted) {
    const [key, label] = keyOf(r);
    let group = map.get(key);
    if (!group) {
      group = { key, label, records: [] };
      map.set(key, group);
    }
    group.records.push(r);
  }
  const groups = Array.from(map.values());

  if (sortKey === "format") {
    groups.sort((a, b) => a.label.localeCompare(b.label));
  } else if (sortKey === "folder") {
    // 未归类排最后，其余按最近活跃
    groups.sort((a, b) => {
      if (a.key === "d:") return 1;
      if (b.key === "d:") return -1;
      return 0;
    });
  }
  // project / time / folder(非未归类)：Map 插入顺序已经是「组内第一条」的时间顺序
  return groups;
}

/** 把一次 image-generator-submit(completed) 事件转成若干条本地记录；非 completed / 无图返回空数组。 */
export function recordsFromImageTask(
  detail: {
    status?: string;
    generationId?: string;
    projectId?: string;
    prompt?: string;
    model?: string;
    style?: string;
    images?: Array<{ src?: string; width?: number; height?: number } | null | undefined>;
  } | null | undefined,
  context: { ownerId: string; projectName: string; folderName: string; now?: number },
): CreationHistoryRecord[] {
  if (!detail || detail.status !== "completed" || !Array.isArray(detail.images)) return [];
  const now = context.now ?? Date.now();
  const generationId = detail.generationId || `gen-${now}`;
  const out: CreationHistoryRecord[] = [];
  detail.images.forEach((image, index) => {
    const src = image && typeof image.src === "string" ? image.src : "";
    if (!src) return;
    out.push({
      id: `${generationId}#${index}`,
      ownerId: context.ownerId,
      generationId,
      projectId: detail.projectId || "p1",
      projectName: context.projectName,
      folderName: context.folderName,
      prompt: detail.prompt || "",
      model: detail.model || "",
      style: detail.style || "",
      src,
      width: Number(image?.width) || 0,
      height: Number(image?.height) || 0,
      format: detectImageFormat(src),
      createdAt: now,
    });
  });
  return out;
}
