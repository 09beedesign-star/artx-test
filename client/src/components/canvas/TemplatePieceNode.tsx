/**
 * 版式子单元节点。
 *
 * 🔒 2026-11-14：选中后弹出悬浮命令条（NodeToolbar 自带跟随节点 / 缩放 / 平移），
 *    配色改黑白；3D 旋转用独立 CSS transform 作用在容器上，不碰 ReactFlow 的
 *    transform: translate()（覆盖它节点会跳到画布原点）。
 */
import { memo } from "react";
import { NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { useTheme } from "@/contexts/ThemeContext";
import { renderPieceSvg, type TemplatePiece } from "@/lib/canvas-templates";
import type { TemplateSelectionDetail } from "@/lib/canvas-template-piece-actions";
import { TemplatePieceFloatingToolbar } from "./TemplatePieceFloatingToolbar";

function TemplatePieceNodeComponent({ id, data, selected }: NodeProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const record = (data || {}) as Record<string, unknown>;
  const piece = record.piece as TemplatePiece | undefined;
  const frameW = Number(record.frameW) || 800;
  const frameH = Number(record.frameH) || 600;
  if (!piece) return null;

  const svg = renderPieceSvg(piece, frameW, frameH);
  const detail: TemplateSelectionDetail = {
    nodeId: id,
    piece,
    frameW,
    frameH,
    layoutName: String(record.title || piece.name || "版式"),
  };
  const rx = piece.rotateX || 0;
  const ry = piece.rotateY || 0;
  const transform3d = rx || ry
    ? `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`
    : undefined;

  return (
    <>
      {selected && (
        <NodeToolbar isVisible position={Position.Top} offset={14} align="center">
          <TemplatePieceFloatingToolbar detail={detail} />
        </NodeToolbar>
      )}
      <div
        data-canvas-template-piece=""
        style={{
          width: "100%",
          height: "100%",
          outline: selected ? `1.5px solid ${isDark ? "#ffffff" : "#161616"}` : "none",
          outlineOffset: -1,
          pointerEvents: "all",
          transform: transform3d,
          transformStyle: "preserve-3d",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </>
  );
}

export const TemplatePieceNode = memo(TemplatePieceNodeComponent);
