/**
 * 版式子单元节点。
 *
 * 🔒 2026-11-14：选中后弹出悬浮命令条（NodeToolbar 自带跟随节点 / 缩放 / 平移），
 *    配色改黑白；3D 旋转用独立 CSS transform 作用在容器上，不碰 ReactFlow 的
 *    transform: translate()（覆盖它节点会跳到画布原点）。
 * 🔒 2026-11-17：文字单元双击即可原地编辑（模板统一文案「双击文案可编辑」必须名副其实）。
 *    ⚠️ 写回只走 TEMPLATE_PIECE_PATCH_EVENT（画布是节点状态唯一持有者），组件不碰 setNodes。
 *    Enter 换行 · ⌘/Ctrl+Enter 或点空白处保存 · Esc 放弃。
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { useTheme } from "@/contexts/ThemeContext";
import { renderPieceSvg, type TemplatePiece } from "@/lib/canvas-templates";
import type { TemplateSelectionDetail } from "@/lib/canvas-template-piece-actions";
import { TemplatePieceFloatingToolbar } from "./TemplatePieceFloatingToolbar";
import { TEMPLATE_PIECE_PATCH_EVENT } from "./CanvasTemplatePanel";

/** 可双击编辑的单元：普通文字（含页眉页脚里的文字）。 */
export function isPieceTextEditable(piece: TemplatePiece | undefined): boolean {
  return !!piece && piece.kind === "text" && !piece.locked && !piece.hidden;
}

function TemplatePieceNodeComponent({ id, data, selected }: NodeProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const record = (data || {}) as Record<string, unknown>;
  const piece = record.piece as TemplatePiece | undefined;
  const frameW = Number(record.frameW) || 800;
  const frameH = Number(record.frameH) || 600;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelledRef = useRef(false);

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      if (!isPieceTextEditable(piece)) return;
      e.stopPropagation();
      e.preventDefault();
      cancelledRef.current = false;
      setDraft(piece!.text || "");
      setEditing(true);
    },
    [piece]
  );

  const commit = useCallback(() => {
    setEditing(false);
    if (cancelledRef.current || !piece) return;
    if (draft === (piece.text || "")) return;
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_PIECE_PATCH_EVENT, {
        detail: { nodeId: id, patch: { text: draft } },
      })
    );
  }, [draft, id, piece]);

  // 「创建文字」新建的单元：挂载即进入编辑，并清掉一次性标记（防止刷新后又自动进编辑）
  const autoEdit = record.autoEdit === true;
  useEffect(() => {
    if (!autoEdit || !isPieceTextEditable(piece)) return;
    cancelledRef.current = false;
    setDraft(piece!.text || "");
    setEditing(true);
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_PIECE_PATCH_EVENT, {
        detail: { nodeId: id, patch: {} },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit, id]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  // 取消选中（点画布空白）也要落盘，不能把用户改的字吞掉。
  useEffect(() => {
    if (editing && !selected) textareaRef.current?.blur();
  }, [editing, selected]);

  if (!piece) return null;

  // 传节点 id：同页多个内联 SVG 的渐变 / 投影 / 蒙版 id 不能撞
  const svg = renderPieceSvg(editing ? { ...piece, text: "" } : piece, frameW, frameH, id);
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
  const editable = isPieceTextEditable(piece);
  const fontSize = Math.max(1, (piece.sizeRatio || 0.014) * frameH);

  return (
    <>
      {selected && !editing && (
        <NodeToolbar isVisible position={Position.Top} offset={14} align="center">
          <TemplatePieceFloatingToolbar detail={detail} />
        </NodeToolbar>
      )}
      <div
        data-canvas-template-piece=""
        data-template-piece-editable={editable ? "true" : undefined}
        title={editable && !editing ? "双击编辑文字" : undefined}
        onDoubleClick={startEdit}
        // ⚠️ 实测：第一下点击会选中节点 → 弹命令条 → 重渲染，浏览器因此不派发原生 dblclick
        //    （click.detail 已经是 2，但 dblclick 事件根本不来）。所以以 click.detail 为准，
        //    onDoubleClick 只作兜底；两路都进 startEdit，editing 已为 true 时幂等。
        onClick={e => { if (e.detail >= 2 && !editing) startEdit(e); }}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          outline: editing
            ? `1.5px dashed ${isDark ? "#ffffff" : "#161616"}`
            : selected ? `1.5px solid ${isDark ? "#ffffff" : "#161616"}` : "none",
          outlineOffset: -1,
          pointerEvents: "all",
          cursor: editing ? "text" : undefined,
          transform: transform3d,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{ width: "100%", height: "100%" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {editing && (
          <textarea
            ref={textareaRef}
            data-testid="template-piece-text-editor"
            className="nodrag nopan nowheel"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Escape") {
                cancelledRef.current = true;
                e.currentTarget.blur();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            spellCheck={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              minHeight: fontSize * (piece.lineHeight || 1.12),
              margin: 0,
              padding: 0,
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              background: "transparent",
              color: piece.color || "#000000",
              caretColor: piece.color || "#000000",
              fontFamily: piece.fontFamily || "sans-serif",
              fontSize,
              fontWeight: piece.fontWeight || 500,
              fontStyle: piece.italic ? "italic" : undefined,
              lineHeight: piece.lineHeight || 1.12,
              letterSpacing: (piece.trackingRatio || 0) * frameH,
              textAlign: piece.textAlign || "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>
    </>
  );
}

export const TemplatePieceNode = memo(TemplatePieceNodeComponent);
