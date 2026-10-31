/**
 * 项目封面来源决策（工作台卡片上显示的那张图）。
 *
 * 两种来源：
 *   1. 手动：用户在图片节点右键 →「设为封面」，项目记录里写入 coverNodeId。
 *   2. 自动：没有手动指定（或指定的节点已被删除 / 已没有图）时，取画布上第一张有图的图片节点。
 *
 * ⚠️⚠️ 画布里有三处会自动刷新封面（恢复、hydrate 完、节点变化 450ms 防抖），
 *    它们都必须走这里，否则会把用户手动设的封面又改回「第一张图」。
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
  for (const node of nodes) {
    const src = readLocalSrc(node);
    if (src) return { src, coverNodeId: null };
  }
  return { src: null, coverNodeId: null };
}
