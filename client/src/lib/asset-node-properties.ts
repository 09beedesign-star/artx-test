/**
 * 画布图片节点「属性」的唯一事实源（2026-11-14 用户要求右键查看）。
 *
 * ⚠️ 只按节点里**真实存在**的属性判定，不猜：
 *   - 来源优先读显式 assetSource；旧节点没有这个字段时，按节点里真实存在的
 *     证据判定（generationId / sourceUrl / id 前缀），判不出就是「未记录」。
 *   - 分辨率由弹窗加载图片后读 naturalWidth/naturalHeight 传入，
 *     节点上的 imgW/imgH 只是画布显示尺寸，不能冒充原始分辨率。
 *   - 时间优先 assetCreatedAt，否则从 generationStartedAt / id 内嵌的
 *     13 位时间戳读取；都没有就显示「未记录」。
 */
import { detectImageFormat, FORMAT_LABELS } from "./creation-history-core";

export type AssetSource = "ai" | "upload" | "web" | "unknown";

export const ASSET_SOURCE_LABELS: Record<AssetSource, string> = {
  ai: "AI 生成",
  upload: "本地上传",
  web: "网页加载",
  unknown: "未记录",
};

export interface AssetProperties {
  source: AssetSource;
  sourceLabel: string;
  /** 原始像素分辨率；读不到给「未记录」 */
  resolution: string;
  format: string;
  createdAt: string;
  /** 有真实像素时为 true；只是画布显示尺寸时为 false */
  exactResolution: boolean;
}

type NodeData = Record<string, unknown> | null | undefined;

function str(data: NodeData, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * 从 id 里取内嵌的 13 位毫秒时间戳（本项目 id 形如
 * upload-1730000000000-0 / external-image-... / ec-post-...）。
 * ⚠️ 只认 13 位且落在合理年份区间，别把随机串当时间。
 */
export function timestampFromNodeId(id: string): number | null {
  const match = /(?:^|-)(\d{13})(?:-|$)/.exec(id);
  if (!match) return null;
  const ts = Number(match[1]);
  if (!Number.isFinite(ts) || ts < 1_400_000_000_000 || ts > 4_100_000_000_000) return null;
  return ts;
}

export function resolveAssetSource(data: NodeData): AssetSource {
  const explicit = str(data, "assetSource");
  if (explicit === "ai" || explicit === "upload" || explicit === "web") return explicit;

  // 旧节点：以下都是节点里真实写入过的字段/前缀，不是猜的。
  if (str(data, "generationId") || str(data, "assetType") === "AI 生成") return "ai";
  if (str(data, "sourceUrl") || str(data, "id").startsWith("external-image-")) return "web";
  const id = str(data, "id");
  if (
    id.startsWith("upload-") ||
    id.startsWith("local-") ||
    id.startsWith("clipboard-image-")
  ) {
    // 粘贴的网页图带 sourceUrl，已在上面拦掉；剩下的都是本地文件。
    return "upload";
  }
  return "unknown";
}

function resolveCreatedAt(data: NodeData): string {
  const direct = data?.assetCreatedAt;
  const ts =
    typeof direct === "number" && direct > 0
      ? direct
      : typeof data?.generationStartedAt === "number"
        ? (data.generationStartedAt as number)
        : timestampFromNodeId(str(data, "id")) ??
          timestampFromNodeId(str(data, "generationId"));
  if (!ts) return "未记录";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "未记录";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveFormat(data: NodeData): string {
  const fileName = str(data, "fileName");
  const localSrc = str(data, "localSrc");
  const src = str(data, "sourceUrl") || localSrc;
  const fmt = detectImageFormat(fileName || localSrc || src);
  if (fileName) {
    const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
    if (ext) return ext.toUpperCase();
  }
  return fmt === "other" ? "未知格式" : FORMAT_LABELS[fmt];
}

export function resolveAssetProperties(
  data: NodeData,
  imageSize?: { naturalWidth: number; naturalHeight: number },
): AssetProperties {
  const source = resolveAssetSource(data);
  const width = Number(data?.imgW) || 0;
  const height = Number(data?.imgH) || 0;
  // 新节点在入口就写入了真实像素；旧节点由弹窗加载图片后回传。
  const exactW = imageSize?.naturalWidth || Number(data?.naturalWidth) || 0;
  const exactH = imageSize?.naturalHeight || Number(data?.naturalHeight) || 0;
  const exact = exactW > 0 && exactH > 0;
  return {
    source,
    sourceLabel: ASSET_SOURCE_LABELS[source],
    resolution: exact
      ? `${exactW} × ${exactH} px`
      : width > 0 && height > 0
        ? `${Math.round(width)} × ${Math.round(height)}（画布显示尺寸）`
        : "未记录",
    exactResolution: exact,
    format: resolveFormat(data),
    createdAt: resolveCreatedAt(data),
  };
}
