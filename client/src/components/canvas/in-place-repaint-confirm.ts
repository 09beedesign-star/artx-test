/**
 * 「就地局部重绘」的确认动作（2026-09-23）。
 *
 * 需求原文（用户）：
 *   「悬浮提示词输入框内，当对图片进行调整之后，再在撤销重绘的按钮旁边加上一个
 *     确认按钮，意思就是确认修改的效果。然后在右边的对话窗口内，同时会出现
 *     确认图片修改成功的消息气泡。」
 *
 * 为什么把这些搬到独立文件：
 *   InfiniteCanvas.tsx 已经 3.7 万行，而「确认」和「撤销」是**同一份快照**的两个
 *   出口。本项目已经栽过十三次「同一份逻辑的多个出口，只改一个等于没做」——
 *   所以判据、事件名、气泡文案一律只在这里定义一次，两个出口都从这里取。
 *
 * ⚠️ 本文件必须保持**纯函数、零 React、零 DOM**：
 *    项目的 vitest 跑在 environment: "node"，组件渲染测不了，
 *    只有纯函数才能被真正断言（不是「看一眼源码文本」）。
 */

/** 撤销快照的形状。由唯一回包出口 handleImageGenerate 写入。 */
export type InPlaceRepaintUndoSnapshot = {
  /** 重绘**前**的像素。原节点直接引用内置素材图时，这里本来就是 undefined。 */
  localSrc?: string;
  /** 重绘**后**写进节点的那一个。用来判断快照有没有过期。 */
  repaintedLocalSrc?: string;
};

export type RepaintActionNodeData = {
  localSrc?: unknown;
  inPlaceRepaintUndo?: unknown;
};

/** 确认动作的自定义事件名。与撤销那条并列，别在别处再写一遍字面量。 */
export const IN_PLACE_REPAINT_CONFIRM_EVENT = "in-place-repaint-confirm-request";

function readSnapshot(
  data: RepaintActionNodeData | null | undefined
): InPlaceRepaintUndoSnapshot | undefined {
  const raw = data?.inPlaceRepaintUndo;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as InPlaceRepaintUndoSnapshot;
}

/**
 * 快照是否仍然有效 —— 这是「撤销」和「确认」**共用的**唯一判据。
 *
 * ⚠️ 判据是 `repaintedLocalSrc`（重绘后写进去的那一个）而不是 `localSrc`：
 *    原节点可能是「没有 localSrc、直接引用内置素材图」的那种，
 *    这时重绘前的 localSrc 本来就是空 —— 拿它当判据按钮永远不会出现。
 *
 * ⚠️ 同时要求节点当前像素**仍然**等于重绘后那一个：用户重绘完又换了一张图时，
 *    快照已经过期，两个按钮都必须自己消失，否则撤销会覆盖掉后来的改动，
 *    而「确认」会去确认一张早已不存在的效果 —— 两种都零报错。
 */
export function isRepaintSnapshotLive(
  data: RepaintActionNodeData | null | undefined
): boolean {
  const snapshot = readSnapshot(data);
  if (typeof snapshot?.repaintedLocalSrc !== "string") return false;
  return data?.localSrc === snapshot.repaintedLocalSrc;
}

/**
 * 确认之后写回节点的 data 补丁。
 *
 * 确认 = 「这个效果我要了」→ 快照没有保留价值，清掉它，
 * 撤销与确认两个按钮同时收起（它们共用 isRepaintSnapshotLive）。
 *
 * ⚠️ 这里**只清元数据、不动 localSrc**：确认不改像素。
 *    任何顺手「再写一次 localSrc」的实现都会给图片 URL 换一次缓存键，
 *    浏览器重新拉一遍图，用户看到一次闪白 —— 零报错的体验回退。
 */
export function buildRepaintConfirmPatch(): {
  inPlaceRepaintUndo: undefined;
} {
  return { inPlaceRepaintUndo: undefined };
}

/** 右侧对话面板里那条气泡的文案。标题为空时给个兜底称呼。 */
export function buildRepaintConfirmedMessage(title: string): string {
  const name = title.trim() || "这张图片";
  return `已确认「${name}」的修改效果，图片修改成功。`;
}

/** 确认按钮的可见文案与无障碍标签，集中在这里，免得两处各写一版。 */
export const REPAINT_CONFIRM_BUTTON_LABEL = "确认修改";
export const REPAINT_CONFIRM_BUTTON_ARIA = "确认本次局部重绘的效果";
export const REPAINT_CONFIRM_BUTTON_TITLE =
  "保留本次局部重绘的效果，并在右侧对话中留下记录";
