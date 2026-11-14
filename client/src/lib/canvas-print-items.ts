/**
 * 从画布节点构造「可打印容器」列表（纯函数，2026-11-14）。
 *
 * ⚠️ 图片节点取图口径必须与画布其它出口一致：localSrc 优先，其次 sourceUrl。
 * ⚠️ 版式画板走 renderTemplateSvg —— 与画布节点 / 缩略图 / 下载 / 打印
 *    共用**同一个 SVG 出口**，不能自己再画一份（多出口事故 A）。
 */
import type { Node } from "@xyflow/react";
import {
  getTemplateLayout,
  renderTemplateSvg,
  svgToDataUrl,
  templateBackground,
  type TemplatePiece,
} from "./canvas-templates";

/** 打开打印面板的事件（命令栏按钮用；右键走 state 直开）。 */
export const CANVAS_PRINT_OPEN_EVENT = "canvas-print-open";

export interface PrintableItem {
  id: string;
  name: string;
  src: string;
  kind: "image" | "frame";
  naturalWidth?: number;
  naturalHeight?: number;
}

function collectPieces(nodes: Node[], frameId: string): TemplatePiece[] {
  return nodes
    .filter(n =>
      n.type === "templatePiece" &&
      (n.data as Record<string, unknown>).embeddedInFrame === frameId,
    )
    .sort((a, b) => ((a.zIndex as number) || 0) - ((b.zIndex as number) || 0))
    .map(n => (n.data as Record<string, unknown>).piece as TemplatePiece)
    .filter(Boolean);
}

export function buildPrintableItems(nodes: Node[]): PrintableItem[] {
  const items: PrintableItem[] = [];
  for (const node of nodes) {
    const data = (node.data || {}) as Record<string, unknown>;
    if (node.type === "asset") {
      const src = (typeof data.localSrc === "string" && data.localSrc) ||
        (typeof data.sourceUrl === "string" && data.sourceUrl) || "";
      if (!src) continue;
      items.push({
        id: node.id,
        name: String(data.title || "图片"),
        src,
        kind: "image",
        naturalWidth: Number(data.naturalWidth) || undefined,
        naturalHeight: Number(data.naturalHeight) || undefined,
      });
    } else if (node.type === "canvasFrame") {
      const pieces = collectPieces(nodes, node.id);
      if (!pieces.length) continue;
      const style = (node.style || {}) as Record<string, unknown>;
      const width = Math.max(1, Math.round(Number(style.width) || 800));
      const height = Math.max(1, Math.round(Number(style.height) || 1131));
      const layoutId = String(data.templateLayoutId || "");
      const layout = layoutId ? getTemplateLayout(layoutId) : undefined;
      const background = layout ? templateBackground(layout) : "#ffffff";
      items.push({
        id: node.id,
        name: String(data.title || data.templateLayoutName || "版式画板"),
        src: svgToDataUrl(renderTemplateSvg(pieces, width, height, background)),
        kind: "frame",
        naturalWidth: width,
        naturalHeight: height,
      });
    }
  }
  return items;
}
