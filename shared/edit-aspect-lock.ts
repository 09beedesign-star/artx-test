/**
 * 局部重绘 / 图生图的「画幅锁」唯一事实源。
 *
 * 【2026-09-13 新建】用户反馈：引用一张竖版实拍图 + 提示词改颜色，
 * 生成结果内容一致但**比例被改了**（肉眼可见的轻微拉伸）。
 *
 * ── 根因（三处叠加，任何一处单独存在都会变形）──────────────────
 *
 * ① 前端 InfiniteCanvas.tsx 的 payload 里写死 `ratio: "1:1"`：
 *    `ratio: shouldEditTargetReference ? "1:1" : resolveImageRatio(...)`
 *    这是多图融合时代留下的写法，语义是"贴合底图"，但 1:1 只在底图恰好是
 *    方图时才等于贴合。底图是 3:4 竖图时，这行就是在主动要求上游出方图。
 *
 * ② 画布节点尺寸带 `Math.max(minNodeSide, ...)` 下限钳制（120px）：
 *    窄边被抬到 120 而长边不动 → **宽高比在源头就被改掉了**。
 *    引用图携带的 width/height 来自画布显示尺寸而非原图真实像素，
 *    于是这个被污染的比例被当成"目标比例"一路传到上游。
 *
 * ③ 后端 getEditSizeForAspect 只有三档吸附（1536x1024 / 1024x1536 / 1024x1024）：
 *    上游只接受这几种 size，所以任何原始比例都会被吸附到最近的一档。
 *    3:4（0.75）和 2:3（0.667）都会落到同一个 1024x1536（0.667），
 *    3:4 的图因此被拉长。
 *
 * ── 修复口径 ────────────────────────────────────────────────
 *
 * 上游能出的尺寸档位是有限的、改不了的，所以**不能指望上游直接出对比例**。
 * 正确做法是「上游随便出 → 落库前按原图真实宽高做一次等比归一化」。
 * 后端已有 __testNormalizeGeneratedImagesToTargetAspect 做这件事，
 * 但它此前拿到的 targetWidth/targetHeight 本身就是被污染的值（见②），
 * 所以归一化归到了错的目标上。
 *
 * ⚠️⚠️ 关键判据：**「传了尺寸」≠「传了正确的尺寸」**。
 * 这条链路全程零报错，因为每一环都拿到了"一个看起来合法的数字"。
 *
 * ⚠️ 本模块只负责「该用哪个比例」的裁决，不负责实际缩放（那是 sharp 的活）。
 * 任何新增的重绘入口都必须调用 resolveEditAspectLock，不要再自己写
 * `ratio: "1:1"` 或 `ratio: someRatio || "1:1"`。
 */

/** 归一化后允许的最小边长，避免原图过小导致结果糊。 */
export const MIN_EDIT_LOCK_LONG_SIDE = 1536;

/**
 * 用户在提示词里显式指定画幅比的解析正则。
 *
 * ⚠️⚠️ 只匹配「比例」本身，不匹配任意数字对——否则用户写
 * 「把价格从 3:4 折扣改成…」这种也会被误判。
 * 因此要求比例前后是词边界，且两个数字都在 1..32 的合理范围内。
 *
 * ⚠️ 刻意**不**在这里扫「竖版 / 横版 / 方图」这类自然语言：
 * 那是意图，不是精确画幅；用户说"竖版"时他要的是"别给我变横"，
 * 而原图本来就是竖的 —— 锁原图比例已经满足了他，不需要再改成 9:16。
 * 📌 判据：只有用户给出**具体数字比例**，才算"他要一个跟原图不同的画幅"。
 */
const EXPLICIT_RATIO_PATTERN = /(?<![\d:：])([1-9]\d?)\s*[:：]\s*([1-9]\d?)(?![\d:：])/;

/** 比例的数值上限，超过即视为不是画幅比（比如 99:1）。 */
const MAX_RATIO_COMPONENT = 32;

/**
 * 从提示词中解析用户显式写出的画幅比。
 *
 * @returns 形如 "16:9" 的归一化字符串；没写则返回 undefined。
 */
export function parseExplicitRatioFromPrompt(
  prompt?: string | null
): string | undefined {
  if (!prompt) return undefined;
  const match = prompt.match(EXPLICIT_RATIO_PATTERN);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width < 1 || height < 1) return undefined;
  if (width > MAX_RATIO_COMPONENT || height > MAX_RATIO_COMPONENT) {
    return undefined;
  }
  return `${width}:${height}`;
}

export type EditAspectLockInput = {
  /** 被引用那张图的真实像素宽（不是画布显示宽）。 */
  sourceWidth?: number | null;
  /** 被引用那张图的真实像素高（不是画布显示高）。 */
  sourceHeight?: number | null;
  /** 用户提示词，用于解析显式画幅比。 */
  prompt?: string | null;
  /**
   * 用户在 UI 比例选择器里选的值。
   * "auto" / 空 表示他没选，此时才轮到锁原图比例。
   */
  selectedRatio?: string | null;
};

export type EditAspectLock = {
  /** 最终应当下发的宽（像素）。 */
  width: number;
  /** 最终应当下发的高（像素）。 */
  height: number;
  /** 最终比例的字符串形式，便于传给只收比例的上游。 */
  ratio: string;
  /** 本次比例的来源，便于排查与断言。 */
  source: "prompt" | "selector" | "source-image" | "fallback";
};

/** 用最大公约数把宽高约成最简比。 */
function toSimplifiedRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = Math.max(1, gcd(Math.round(width), Math.round(height)));
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

/** 把 "16:9" 解析成数值对；非法返回 undefined。 */
export function parseRatioToDimensions(
  ratio?: string | null
): { width: number; height: number } | undefined {
  if (!ratio) return undefined;
  const match = ratio.trim().match(/^([1-9]\d?)\s*[:：]\s*([1-9]\d?)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width < 1 || height < 1) return undefined;
  return { width, height };
}

/**
 * 把一组宽高等比放大到长边不低于 MIN_EDIT_LOCK_LONG_SIDE。
 *
 * ⚠️⚠️ 宽高必须乘**同一个系数**，否则就是在制造变形——
 * 这正是本次 bug 要根治的东西，别为了凑整数分别取整再相乘。
 */
export function scaleToMinLongSide(
  width: number,
  height: number,
  minLongSide: number = MIN_EDIT_LOCK_LONG_SIDE
): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const longSide = Math.max(safeWidth, safeHeight);
  if (longSide >= minLongSide) {
    return { width: Math.round(safeWidth), height: Math.round(safeHeight) };
  }
  const scale = minLongSide / longSide;
  return {
    width: Math.round(safeWidth * scale),
    height: Math.round(safeHeight * scale),
  };
}

/**
 * 局部重绘的画幅裁决：默认锁原图比例，显式指定才改。
 *
 * 优先级（高 → 低），**顺序不能调**：
 *   1. 提示词里显式写的比例   —— 最强的即时意图
 *   2. UI 比例选择器的非 auto 值 —— 用户手动设过
 *   3. 引用图的真实宽高        —— 默认行为：原样锁住
 *   4. 1:1                     —— 兜底，仅在完全拿不到尺寸时
 *
 * ⚠️ 第 3 条是本次修复的核心：以前这里直接写死 "1:1"。
 */
export function resolveEditAspectLock(
  input: EditAspectLockInput
): EditAspectLock {
  const explicitRatio = parseExplicitRatioFromPrompt(input.prompt);
  if (explicitRatio) {
    const dimensions = parseRatioToDimensions(explicitRatio);
    if (dimensions) {
      const scaled = scaleToMinLongSide(dimensions.width, dimensions.height);
      return { ...scaled, ratio: explicitRatio, source: "prompt" };
    }
  }

  const selected = input.selectedRatio?.trim().toLowerCase();
  if (selected && selected !== "auto") {
    const dimensions = parseRatioToDimensions(selected);
    if (dimensions) {
      const scaled = scaleToMinLongSide(dimensions.width, dimensions.height);
      return { ...scaled, ratio: selected, source: "selector" };
    }
  }

  const sourceWidth = Number(input.sourceWidth);
  const sourceHeight = Number(input.sourceHeight);
  const hasUsableSource =
    Number.isFinite(sourceWidth) &&
    Number.isFinite(sourceHeight) &&
    sourceWidth > 0 &&
    sourceHeight > 0;

  if (hasUsableSource) {
    const scaled = scaleToMinLongSide(sourceWidth, sourceHeight);
    return {
      ...scaled,
      ratio: toSimplifiedRatio(sourceWidth, sourceHeight),
      source: "source-image",
    };
  }

  const fallback = scaleToMinLongSide(1, 1);
  return { ...fallback, ratio: "1:1", source: "fallback" };
}
