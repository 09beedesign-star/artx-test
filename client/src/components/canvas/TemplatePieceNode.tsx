/**
 * 版式子单元节点。
 *
 * ⚠️ 这里刻意不重写任何绘图逻辑：直接复用 canvas-templates 的
 * renderPieceSvg，画布节点 / 面板缩略图 / 下载 / 参考图 / 打印导出
 * 全走同一份 SVG，避免出现「预览是一套、导出是另一套」。
 */
import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { renderPieceSvg } from "@/lib/canvas-templates";
import type { TemplatePiece } from "@/lib/canvas-templates";

function TemplatePieceNodeComponent({ data, selected }: NodeProps) {
  const record = data as Record<string, unknown>;
  const piece = record.piece as TemplatePiece | undefined;
  if (!piece) return null;
  const frameW = Number(record.frameW) || 800;
  const frameH = Number(record.frameH) || 600;
  const svg = renderPieceSvg(piece, frameW, frameH);
  return (
    <div
      data-canvas-template-piece=""
      style={{
        width: "100%",
        height: "100%",
        outline: selected ? "1.5px solid #0f766e" : "none",
        outlineOffset: -1,
        pointerEvents: "all",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export const TemplatePieceNode = memo(TemplatePieceNodeComponent);
