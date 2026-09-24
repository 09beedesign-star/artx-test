/**
 * 图片过期提醒的前端数据层。
 *
 * ⚠️⚠️⚠️ 为什么单独开一个文件，而不是写进 InfiniteCanvas.tsx：
 * 那个文件已经 3.9 万行，任何塞进去的逻辑都只能靠「源码文本断言」来测，
 * 而源码断言测的是「代码长什么样」不是「行为对不对」。这里的匹配口径
 * （把画布节点的图源和接口下发的 src 对齐）是整个功能最容易零报错失效的
 * 一环，必须能被真正的行为测试覆盖。
 *
 * 职责边界：
 * - 只负责「拉数据」和「把 src 归一成可比较的键」；
 * - 不负责渲染、不负责判断该不该提醒（该不该提醒由服务端下发的 entries 决定）。
 */

import type {
  UploadExpiryEntry,
  UploadExpiryResponse,
} from "../../../shared/upload-retention";
import {
  FALLBACK_RETENTION_DAYS,
  FALLBACK_WARNING_DAYS,
} from "../../../shared/upload-retention";

export type { UploadExpiryEntry, UploadExpiryResponse };

/** 接口失败时的空结果。刻意不抛错：提醒功能失效应当表现为「不提醒」。 */
export const EMPTY_UPLOAD_EXPIRY: UploadExpiryResponse = {
  retentionDays: FALLBACK_RETENTION_DAYS,
  warningDays: FALLBACK_WARNING_DAYS,
  entries: [],
  warningCount: 0,
  minDaysLeft: null,
};

/**
 * 把任意形态的图片地址归一成可比较的键。
 *
 * ⚠️⚠️⚠️ 这是本功能最容易静默失效的地方，三个必须处理的差异：
 *
 * 1. **绝对 vs 相对**：画布里的 localSrc 在生产环境是
 *    `https://backstage.artxsd.com/uploads/images/u/a.png`，
 *    而接口下发的是 `/uploads/images/u/a.png`。直接字符串比必然全不匹配，
 *    表现为「一张图都不提醒」且零报错。
 *
 * 2. **URL 编码**：服务端用 encodeURIComponent 拼 src，所以中文用户名会变成
 *    `%E5%BC%A0%E4%B8%89`；画布里的地址可能是已解码的原文。两边都解码后再比。
 *
 * 3. **缓存键**：画布会给地址挂 `?artxv=xxx`，必须剥掉 query 再比。
 *
 * 📌 返回空串代表「这个地址没法参与匹配」（base64 / blob / 非 uploads 路径），
 *    调用方必须把空串当作「不匹配任何东西」，而不是「匹配所有空串」——
 *    否则所有本地 data: 图会互相匹配上，全部挂上别人的倒计时。
 */
export function toUploadExpiryKey(src: string): string {
  const trimmed = (src || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return "";

  let pathname = "";
  try {
    // 相对路径需要一个 base 才能被 URL 解析；base 本身不参与比较。
    const url = new URL(trimmed, "https://artx.invalid");
    pathname = url.pathname;
  } catch {
    // URL 解析失败时退回手工截断 query/hash，别直接放弃 —— 放弃等于不提醒。
    pathname = trimmed.split("#")[0].split("?")[0];
  }

  if (!pathname.startsWith("/uploads/")) return "";

  // 逐段解码：整串 decodeURIComponent 会把已经是原文的 `%` 字符打成异常。
  const decodedSegments = pathname
    .split("/")
    .map(segment => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  return decodedSegments.join("/");
}

/**
 * 把接口返回的 entries 建成 key -> entry 的索引，供画布逐节点 O(1) 查询。
 * 空 key 一律丢弃（见 toUploadExpiryKey 的说明）。
 */
export function buildUploadExpiryIndex(
  entries: UploadExpiryEntry[],
): Map<string, UploadExpiryEntry> {
  const index = new Map<string, UploadExpiryEntry>();
  for (const entry of entries) {
    const key = toUploadExpiryKey(entry.src);
    if (!key) continue;
    index.set(key, entry);
  }
  return index;
}

/** 从索引里查一张图的过期状态；查不到返回 null（正常情况，说明还没进提醒窗口）。 */
export function lookupUploadExpiry(
  index: Map<string, UploadExpiryEntry>,
  src: string,
): UploadExpiryEntry | null {
  const key = toUploadExpiryKey(src);
  if (!key) return null;
  return index.get(key) || null;
}

function readAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? (JSON.parse(raw) as { token?: string }) : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

/**
 * 拉取当前用户的图片过期状态。
 *
 * ⚠️ 未登录时直接返回空结果，不要发请求 —— 接口会 401，白白在控制台刷红，
 *    而未登录用户本来也没有云端图片可提醒。
 *
 * ⚠️ 任何失败都吞成空结果。这是提醒类功能：拉不到数据的正确表现是「安静」，
 *    而不是弹一个「无法获取过期信息」的错误框去打扰用户。
 */
export async function fetchUploadExpiry(options: {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<UploadExpiryResponse> {
  const token = readAuthToken();
  if (!token) return EMPTY_UPLOAD_EXPIRY;

  const fetchImpl = options.fetchImpl
    || (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) return EMPTY_UPLOAD_EXPIRY;

  const base = (options.apiBaseUrl || "").replace(/\/+$/, "");
  const url = `${base}/api/uploads/expiry`;

  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options.signal,
    });
    // 📌 判 status 必须早于判 body：非 2xx 时 body 可能是一整页 HTML，
    //    直接 .json() 会抛一个和真实原因毫无关系的解析错误。
    if (!response.ok) return EMPTY_UPLOAD_EXPIRY;
    const payload = (await response.json()) as Partial<UploadExpiryResponse>;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    return {
      retentionDays: Number(payload.retentionDays) > 0
        ? Number(payload.retentionDays)
        : FALLBACK_RETENTION_DAYS,
      warningDays: Number(payload.warningDays) > 0
        ? Number(payload.warningDays)
        : FALLBACK_WARNING_DAYS,
      entries,
      warningCount: entries.length,
      minDaysLeft: entries.length > 0 ? entries[0].daysLeft : null,
    };
  } catch {
    return EMPTY_UPLOAD_EXPIRY;
  }
}
