/**
 * 局部重绘前后 A|B 对比滑杆（2026-09-28）。
 *
 * 需求原文（用户）：
 *   「给所有的在原图基础上进行局部重绘之后的图片都增加一个纵向的对比滑杆……
 *     在图片的左上角通过一个名为 A|B 的小 icon 点击激活对比滑竿，再次点击关闭。
 *     打开之后默认出现在图片正中间。关闭之后默认展示局部重绘之后的图片。
 *     如果此时用户要保存图片，则默认保存局部重绘之后的图片。」
 *
 * 口径：A = 重绘前（滑杆左侧），B = 重绘后（滑杆右侧，也是节点本身的像素）。
 *
 * ⚠️ 本文件保持纯函数、零 React、零 DOM —— vitest 跑在 node 环境，
 *    只有纯函数能被真正断言。
 *
 * ⚠️⚠️ 为什么「保存 = 重绘后」不需要额外代码：
 *    对比滑杆只是**叠在节点上的一层 UI**，节点的 localSrc 始终是重绘后那张；
 *    下载 / 预览 / 引用全部读 localSrc。只要这里**永远不写回节点 data**，
 *    保存就天然是 B。任何「把滑杆位置或 A 图写进节点」的改法都会破坏这条。
 */
import { isRepaintSnapshotLive } from "./in-place-repaint-confirm";

/** 打开滑杆时的默认位置：图片正中间（百分比）。 */
export const DEFAULT_REPAINT_COMPARE_POSITION = 50;

/** 节点 data 上的标记位：该节点是一次「局部重绘」落出来的新图。 */
export const LOCAL_REPAINT_RESULT_FLAG = "localRepaintResult";

/**
 * 「在原图基础上局部改」的出图风格。它们都会在原图旁落一张新节点，
 * 原图地址记在 generationSourceImageSrc 里。
 *
 * ⚠️ 这里只收**局部修改**，不收 HD 高清 / 去背景 / 矢量化 / 视角调整 ——
 *    那些是整图变换，用户没说要对比，塞进来会让滑杆到处都是。
 */
export const LOCAL_REPAINT_STYLES: ReadonlySet<string> = new Set([
  "注释修改结果",
  "橡皮工具结果",
  "文案编辑结果",
]);

const LOCAL_REPAINT_OPERATIONS: ReadonlySet<string> = new Set([
  "annotation_edit",
  "erase",
]);

export type LocalRepaintPayloadLike = {
  /** 调用方显式声明（框选局部重绘多张时 style 是 Skill 名，只能靠它）。 */
  localRepaint?: unknown;
  style?: unknown;
  inPlaceRepaintNodeId?: unknown;
  backgroundTaskInput?: unknown;
};

/**
 * 这次出图是不是「落成新节点的局部重绘」。
 *
 * ⚠️ 就地重绘（inPlaceRepaintNodeId 有值）**必须返回 false**：
 *    它的「重绘前」来自撤销快照，撤销后快照清空、滑杆应随之消失。
 *    若这里也给它打标，撤销之后会回落到 generationSourceImageSrc，
 *    变成「左右两张一模一样」的假对比 —— 零报错。
 */
export function isLocalRepaintPayload(
  payload: LocalRepaintPayloadLike | null | undefined
): boolean {
  if (!payload) return false;
  if (
    typeof payload.inPlaceRepaintNodeId === "string" &&
    payload.inPlaceRepaintNodeId
  )
    return false;
  if (payload.localRepaint === true) return true;
  if (typeof payload.style === "string" && LOCAL_REPAINT_STYLES.has(payload.style))
    return true;
  const task = payload.backgroundTaskInput;
  if (task && typeof task === "object") {
    const record = task as Record<string, unknown>;
    if (record.regionSelectEdit === true) return true;
    if (
      typeof record.operation === "string" &&
      LOCAL_REPAINT_OPERATIONS.has(record.operation)
    )
      return true;
  }
  return false;
}

export type RepaintCompareNodeData = {
  localSrc?: unknown;
  inPlaceRepaintUndo?: unknown;
  localRepaintResult?: unknown;
  generationSourceImageSrc?: unknown;
};

/**
 * 取「重绘前」那张图；没有可对比的就返回 null（A|B 按钮不出现）。
 *
 * @param fallbackAssetSrc 节点没有 localSrc、直接引用内置素材图时的原图地址。
 *   就地重绘的快照里此时存的是 undefined（重绘前本来就没有 localSrc）。
 *
 * ⚠️ 就地重绘与「撤销」共用 isRepaintSnapshotLive 这一个判据：
 *    撤销后、或重绘完又换了图，对比按钮必须和撤销按钮一起消失。
 */
export function resolveRepaintCompareBeforeSrc(
  data: RepaintCompareNodeData | null | undefined,
  fallbackAssetSrc?: string
): string | null {
  if (!data) return null;
  const afterSrc = typeof data.localSrc === "string" ? data.localSrc : "";
  if (isRepaintSnapshotLive(data)) {
    const undo = data.inPlaceRepaintUndo as { localSrc?: unknown };
    const before =
      typeof undo.localSrc === "string" && undo.localSrc
        ? undo.localSrc
        : fallbackAssetSrc || "";
    return before && before !== afterSrc ? before : null;
  }
  if (data.localRepaintResult === true) {
    const before =
      typeof data.generationSourceImageSrc === "string"
        ? data.generationSourceImageSrc
        : "";
    return before && before !== afterSrc ? before : null;
  }
  return null;
}

/** 把任意数值夹进 [0, 100]；NaN 回到正中间，免得滑杆消失在画面外。 */
export function clampComparePosition(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REPAINT_COMPARE_POSITION;
  return Math.min(100, Math.max(0, value));
}

/**
 * 指针位置 → 滑杆百分比。
 *
 * ⚠️ 必须用 getBoundingClientRect 的屏幕宽度，而不是节点的 CSS 宽度：
 *    画布有缩放，CSS 宽 300 的节点在 0.5 倍下屏幕上只有 150，
 *    用 CSS 宽算会让滑杆只跟到鼠标的一半。
 */
export function comparePositionFromPointer(
  clientX: number,
  rect: { left: number; width: number }
): number {
  if (!(rect.width > 0)) return DEFAULT_REPAINT_COMPARE_POSITION;
  return clampComparePosition(((clientX - rect.left) / rect.width) * 100);
}

/**
 * 「重绘前」那层的裁剪：只露出滑杆左边。
 * 用 clip-path 而不是改宽度 —— 改宽度会让 object-fit 重新排版，A 图跟着缩放错位。
 */
export function buildBeforeLayerClipPath(position: number): string {
  const right = 100 - clampComparePosition(position);
  return `inset(0 ${right}% 0 0)`;
}

export const REPAINT_COMPARE_TOGGLE_LABEL = "A|B";
export const REPAINT_COMPARE_TOGGLE_TITLE_OFF =
  "打开对比：左 A 为重绘前，右 B 为重绘后";
export const REPAINT_COMPARE_TOGGLE_TITLE_ON = "关闭对比，显示重绘后的图片";
