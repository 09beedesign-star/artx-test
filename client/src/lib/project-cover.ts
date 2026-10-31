/**
 * 项目封面来源决策（工作台卡片上显示的那张图）。
 *
 * 两种来源：
 *   1. 手动：用户在图片节点右键 →「设为封面」，项目记录里写入 coverNodeId。
 *   2. 自动：没有手动指定（或指定的节点已被删除）时，取画布上最后一张有图的图片节点。
 *
 * ⚠️⚠️ 画布里有三处会自动刷新封面（恢复、hydrate 完、节点变化 450ms 防抖），
 *    它们都必须走这里，否则会把用户手动设的封面又改回默认封面。
 */

type CoverCandidateNode = {
  id: string;
  type?: string;
  data?: unknown;
};

export type CanvasCoverResolution = {
  /** 用来生成封面缩略图的图片地址；null 表示画布上没有可用图片。 */
  src: string | null;
  /** 手动封面仍然有效时为该节点 id；否则为 null（调用方应清掉记录里的 coverNodeId）。 */
  coverNodeId: string | null;
};

function readLocalSrc(node: CoverCandidateNode) {
  if (node.type !== "asset") return null;
  const data = node.data as Record<string, unknown> | undefined;
  const src = data?.localSrc;
  return typeof src === "string" && src ? src : null;
}

/** 从节点 id 中取出 13 位毫秒时间戳（如 `image-gen-1761800000000-ab12c`）；取不到返回 -1。 */
function readCreatedTime(id: string) {
  const matches = id.match(/(?<!\d)1\d{12}(?!\d)/g);
  if (!matches) return -1;
  return Math.max(...matches.map(Number));
}

export function resolveCanvasCoverSource(
  nodes: CoverCandidateNode[],
  coverNodeId?: string | null
): CanvasCoverResolution {
  if (coverNodeId) {
    const manual = nodes.find(node => node.id === coverNodeId);
    if (manual && manual.type === "asset") {
      /*
       * ⚠️ 节点还在、只是暂时没有 localSrc（画布刚恢复，大图载荷还没 hydrate 回来）：
       *    保留手动选择、本轮不刷新封面。若这里退回「第一张图」，会把用户的手动封面冲掉。
       */
      return { src: readLocalSrc(manual), coverNodeId };
    }
  }
  /*
   * 默认封面 = 画布里「最后一张」（最新加入的）有图的图片节点
   * （2026-10-31 由「第一张」改为「最后一张」）。
   *
   * ⚠️ 不能只看数组顺序：置顶 / 添加文本备注等操作会把老节点挪到数组末尾，
   *    封面会跟着乱跳。节点 id 里几乎都带 `Date.now()` 生成时间，优先按它比；
   *    取不到时间的节点退回数组顺序。
   */
  let best: { src: string; time: number; index: number } | null = null;
  nodes.forEach((node, index) => {
    const src = readLocalSrc(node);
    if (!src) return;
    const time = readCreatedTime(node.id);
    if (
      !best ||
      time > best.time ||
      (time === best.time && index > best.index)
    ) {
      best = { src, time, index };
    }
  });
  const picked = best as { src: string } | null;
  return { src: picked ? picked.src : null, coverNodeId: null };
}
