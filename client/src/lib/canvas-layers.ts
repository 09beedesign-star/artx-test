/**
 * canvas-layers.ts — 画布图层面板纯工具函数
 *
 * 职责：从 ReactFlow Node 列表构建图层树（供图层面板渲染），
 * 以及生成"重排序"操作所需的新 zIndex 列表。
 *
 * ⚠️ 本文件无任何副作用（no setState / no DOM / no window events）。
 *    所有突变都在 InfiniteCanvas 的事件处理器里完成。
 */

import type { Node } from "@xyflow/react";

// ─── 图层行描述 ──────────────────────────────────────────────────────────────

export type LayerIcon = "frame" | "image" | "text" | "shape" | "draw" | "model3d" | "other";

export interface LayerRow {
  /** ReactFlow node id */
  id: string;
  /** 显示名称 */
  name: string;
  /** 图标类型 */
  icon: LayerIcon;
  /** 缩进深度（0 = 根级；frame 子项 depth=1；group 子项 depth=1） */
  depth: number;
  /** 是否隐藏（data.layerHidden） */
  hidden: boolean;
  /** 是否锁定（data.layerLocked） */
  locked: boolean;
  /** 是否在当前 selectedNodeIds 里 */
  selected: boolean;
  /** 该行所对应的 Frame id（非 Frame 节点的 embeddedInFrame 值） */
  parentFrameId?: string;
  /** 节点 zIndex（用于排序） */
  zIndex: number;
}

// ─── 名称推断 ────────────────────────────────────────────────────────────────

function inferName(node: Node): string {
  const d = node.data as Record<string, unknown>;
  if (typeof d.title === "string" && d.title.trim()) return d.title.trim();
  if (typeof d.text === "string" && d.text.trim()) {
    const t = d.text.trim().slice(0, 24);
    return t.length < d.text.trim().length ? t + "…" : t;
  }
  if (typeof d.shapeType === "string") {
    const labels: Record<string, string> = {
      triangle: "三角形",
      circle: "圆形",
      square: "正方形",
      star: "五角星",
      line: "线段",
      arrow: "箭头",
    };
    return labels[d.shapeType as string] ?? "几何形";
  }
  switch (node.type) {
    case "asset":      return "图片";
    case "canvasFrame": return "画板";
    case "text":       return "文字";
    case "shape":      return "几何形";
    case "pen":        return "钢笔路径";
    case "freehand":   return "手绘";
    case "draftImage": return "草图";
    case "model3d":    return "3D 画布";
    default:           return "未命名";
  }
}

function inferIcon(node: Node): LayerIcon {
  switch (node.type) {
    case "canvasFrame": return "frame";
    case "asset":       return "image";
    case "text":        return "text";
    case "shape":       return "shape";
    case "pen":
    case "freehand":    return "draw";
    case "model3d":     return "model3d";
    default:            return "other";
  }
}

// ─── 树构建 ──────────────────────────────────────────────────────────────────

export function isInternalNode(node: Node): boolean {
  return String(node.id).startsWith("__ghost__");
}

/**
 * 把 ReactFlow nodes 转换成图层面板需要的扁平行列表。
 *
 * 排序规则（模仿参考网站 Ye()）：
 *   1. 按 zIndex 降序（最上层的节点排在最前面）
 *   2. Frame 下面紧跟它包含的 asset 子项（也按 zIndex 降序）
 *   3. 其余顶级节点插在对应 zIndex 位置
 *
 * ⚠️ group 在本实现里只做同层分组（depth=0），不单独创建一行"组"节点，
 *    因为 ArtX 没有独立的组节点类型。
 */
export function buildLayerRows(
  nodes: Node[],
  selectedNodeIds: string[]
): LayerRow[] {
  const selectedSet = new Set(selectedNodeIds);

  // ⚠️ 与 applyCanvasLayerAction 同口径：没设 zIndex 的节点回落到数组下标，
  //    否则全部当 0，排序完全依赖 sort 稳定性，面板顺序与画布绘制顺序对不上。
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  const getZ = (n: Node) =>
    typeof n.zIndex === "number" ? n.zIndex : indexOf.get(n.id) ?? 0;

  // 分成 Frame 和非 Frame
  const frames = nodes
    .filter(n => n.type === "canvasFrame")
    .sort((a, b) => getZ(b) - getZ(a)); // 降序：最上层先

  const frameIds = new Set(frames.map(f => f.id));

  // 收集嵌入了某 frame 的 asset
  const embeddedByFrame = new Map<string, Node[]>();
  for (const f of frames) embeddedByFrame.set(f.id, []);

  const roots: Node[] = []; // 未嵌入 frame 的节点

  for (const n of nodes) {
    if (n.type === "canvasFrame") continue; // frame 单独处理
    if (isInternalNode(n)) continue; // Alt 拖拽幽灵节点等内部节点不进图层
    const d = n.data as Record<string, unknown>;
    const fid =
      n.type === "asset"
        ? (d.embeddedInFrame as string | undefined)
        : undefined;
    if (fid && frameIds.has(fid)) {
      embeddedByFrame.get(fid)!.push(n);
    } else {
      roots.push(n);
    }
  }

  // 对子项也按 zIndex 降序
  embeddedByFrame.forEach(children => {
    children.sort((a, b) => getZ(b) - getZ(a));
  });

  // 合并 frame 和根节点，整体按 zIndex 降序穿插
  // 每个 frame 视作一个"slot"，其 zIndex 参与全局排序
  type Slot = { kind: "frame"; node: Node } | { kind: "root"; node: Node };
  const slots: Slot[] = [
    ...frames.map(n => ({ kind: "frame" as const, node: n })),
    ...roots.map(n => ({ kind: "root" as const, node: n })),
  ].sort((a, b) => getZ(b.node) - getZ(a.node));

  const rows: LayerRow[] = [];
  for (const slot of slots) {
    const n = slot.node;
    rows.push({
      id: n.id,
      name: inferName(n),
      icon: inferIcon(n),
      depth: 0,
      hidden: !!(n.data as Record<string, unknown>).layerHidden,
      locked: !!(n.data as Record<string, unknown>).layerLocked,
      selected: selectedSet.has(n.id),
      zIndex: getZ(n),
    });
    if (slot.kind === "frame") {
      for (const child of embeddedByFrame.get(n.id) ?? []) {
        rows.push({
          id: child.id,
          name: inferName(child),
          icon: inferIcon(child),
          depth: 1,
          hidden: !!(child.data as Record<string, unknown>).layerHidden,
          locked: !!(child.data as Record<string, unknown>).layerLocked,
          selected: selectedSet.has(child.id),
          parentFrameId: n.id,
          zIndex: getZ(child),
        });
      }
    }
  }

  return rows;
}

// ─── 重排序辅助 ──────────────────────────────────────────────────────────────

/**
 * 把 dragId 对应的节点移动到 targetId 节点的位置（往后插入，或嵌入 frame）。
 * 返回 `{nodes: Node[], changed: boolean}` — 若 drop 无效则 changed=false。
 *
 * 规则：
 * - targetType === "frame" → 把 dragId（asset）的 embeddedInFrame 改为 targetId
 * - targetType === "other" → 在全局 zIndex 顺序里，把 dragId 插到 targetId 之后（即 zIndex 值调低一格）
 */
export function applyLayerDrop(
  nodes: Node[],
  dragId: string,
  targetId: string
): { nodes: Node[]; changed: boolean } {
  if (dragId === targetId) return { nodes, changed: false };

  const dragNode = nodes.find(n => n.id === dragId);
  const targetNode = nodes.find(n => n.id === targetId);
  if (!dragNode || !targetNode) return { nodes, changed: false };

  // drop onto frame → embed
  if (targetNode.type === "canvasFrame" && dragNode.type === "asset") {
    const updated = nodes.map(n =>
      n.id === dragId
        ? {
            ...n,
            data: {
              ...n.data,
              embeddedInFrame: targetId,
            },
          }
        : n
    );
    return { nodes: updated, changed: true };
  }

  // drop onto non-frame → reorder zIndex
  // 与 applyCanvasLayerAction 同口径：无 zIndex 回落数组下标，同 z 按下标稳定排序
  const ordered = nodes
    .map((node, index) => ({
      node,
      index,
      z: typeof node.zIndex === "number" ? node.zIndex : index,
    }))
    .sort((a, b) => a.z - b.z || a.index - b.index)
    .map(item => item.node);

  // 面板列表是「最上层在前」，放到某行上 = 排在它下面一格（参考站 $e 的 insertAfter 语义）
  // 换算到升序 zIndex 数组里 = 插在 target 的**前面**。
  const withoutDrag = ordered.filter(n => n.id !== dragId);
  const targetIdx = withoutDrag.findIndex(n => n.id === targetId);
  withoutDrag.splice(targetIdx, 0, dragNode);

  // 容器归属跟随目标行：目标在画板里 → 加入同一画板；目标在根级 → 移出画板
  const targetFrame =
    targetNode.type === "asset"
      ? ((targetNode.data as Record<string, unknown>).embeddedInFrame as
          | string
          | undefined)
      : undefined;
  const dragFrame =
    dragNode.type === "asset"
      ? ((dragNode.data as Record<string, unknown>).embeddedInFrame as
          | string
          | undefined)
      : undefined;
  const nextFrame = dragNode.type === "asset" ? targetFrame : dragFrame;

  const zById = new Map(withoutDrag.map((n, i) => [n.id, i]));
  const orderChanged = withoutDrag.some((n, i) => n.id !== ordered[i].id);
  const frameChanged = nextFrame !== dragFrame;
  if (!orderChanged && !frameChanged) return { nodes, changed: false };

  const updated = nodes.map(n => {
    const next: Node = { ...n, zIndex: zById.get(n.id) ?? 0 };
    if (n.id === dragId && frameChanged) {
      const data = { ...(n.data as Record<string, unknown>) };
      if (nextFrame) data.embeddedInFrame = nextFrame;
      else delete data.embeddedInFrame;
      next.data = data;
    }
    return next;
  });
  return { nodes: updated, changed: true };
}
