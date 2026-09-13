/**
 * 图片比例的唯一事实源。
 *
 * 【2026-09-13 新建】此前全站比例散落在前后端至少 8 处，且 shared/ 下没有任何
 * 比例常量 —— 这正是"同一份数据的多个出口"的根因：
 *   - 前端 InfiniteCanvas.tsx 有两处 `assistantImageRatio === "auto" ? "1:1" : ...`
 *   - 前端 ai.ts / ai-intent.ts 有四处 `ratio = "1:1"` 默认参数
 *   - 后端 image-generation.ts `ratioToSize[input.ratio || "1:1"] || ratioToSize["1:1"]`
 *   - 后端 tencent-vod-aigc.ts resolveAspectRatio 白名单不含 "auto"，未命中回 "1:1"
 *
 * ⚠️ 关键风险：后端对 "auto" 是**静默兜底**而非报错 —— 一旦 auto 透传到后端，
 * 会无声无息地变成 1024×1024 方图，全程零报错。所以 auto 必须在前端就被解析掉。
 *
 * 任何新增的比例消费点都必须引用本模块，不要再写字面量 "1:1"。
 */

/**
 * 用户选择"自动"时实际采用的比例。
 *
 * 2026-09-13 由用户拍板从 1:1 改为 9:16（竖屏）：
 * ArtX 的主要产出是手机端 UI 样机、海报、直播间界面等竖版物料，
 * 方图是更差的默认值。
 */
export const DEFAULT_AUTO_RATIO = "9:16";

/** 比例选择器里代表"自动"的值。 */
export const AUTO_RATIO_VALUE = "auto";

/**
 * 全站支持的比例白名单（不含 auto）。
 * 顺序即 UI 展示顺序。
 */
export const SUPPORTED_IMAGE_RATIOS = [
  "1:1",
  "4:5",
  "5:4",
  "3:4",
  "4:3",
  "3:2",
  "16:9",
  "9:16",
  "21:9",
] as const;

export type SupportedImageRatio = (typeof SUPPORTED_IMAGE_RATIOS)[number];

const SUPPORTED_RATIO_SET = new Set<string>(SUPPORTED_IMAGE_RATIOS);

/**
 * 把任意比例输入解析成确定可用的比例。
 *
 * 用于所有"可能拿到 auto / undefined / 脏值"的位置，替代原先散落各处的
 * `ratio === "auto" ? "1:1" : ratio` 和 `ratio || "1:1"`。
 *
 * @param ratio 用户选择或上游透传的比例，可能是 "auto" / undefined / 非法值
 * @param fallback 当 ratio 为 auto 或非法时采用的比例，默认 DEFAULT_AUTO_RATIO。
 *                 传 fallback 的典型场景：技能自带画布尺寸时优先用技能的。
 */
export function resolveImageRatio(
  ratio?: string | null,
  fallback: string = DEFAULT_AUTO_RATIO
): string {
  if (!ratio) return fallback;
  const normalized = ratio.trim().toLowerCase();
  if (!normalized || normalized === AUTO_RATIO_VALUE) return fallback;
  // 白名单外的脏值同样回落，避免把无效比例透传给上游 API。
  if (!SUPPORTED_RATIO_SET.has(normalized)) return fallback;
  return normalized;
}

/** 判断一个比例值是否代表"自动"。 */
export function isAutoRatio(ratio?: string | null): boolean {
  return !ratio || ratio.trim().toLowerCase() === AUTO_RATIO_VALUE;
}
