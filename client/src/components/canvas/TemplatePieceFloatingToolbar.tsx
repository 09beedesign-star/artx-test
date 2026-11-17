/**
 * 版式子单元选中后的悬浮命令条（参考截图：作为参考图 / 复制 / 下载 / … / 属性编辑）。
 *
 * ⚠️ 挂在 ReactFlow 的 NodeToolbar 里（见 TemplatePieceNode），因此会随节点移动、
 *    缩放，不需要自己算屏幕坐标，也不会被画布 transform 带偏。
 * 🔒 所有动作都派发事件或走 canvas-template-piece-actions 的共用函数，
 *    不在组件里另写一套下载 / 复制 / 参考图逻辑。
 */
import { useState } from "react";
import { Copy, Download, ImagePlus, Layers3, MoreHorizontal, Pencil, Rotate3D, RotateCcw, Sparkles, Type } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  MORE_COMMANDS,
  TEMPLATE_PIECE_COMMAND_EVENT,
  copyPiece,
  downloadPiece,
  referencePiece,
  type TemplateSelectionDetail,
} from "@/lib/canvas-template-piece-actions";
import { TEMPLATE_PROPERTIES_OPEN_EVENT } from "./CanvasTemplatePanel";

const MORE_ICONS = [Layers3, Layers3, Rotate3D, Type];

export function TemplatePieceFloatingToolbar({ detail }: { detail: TemplateSelectionDetail }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [moreOpen, setMoreOpen] = useState(false);

  const bg = isDark ? "#1b1b1b" : "#ffffff";
  const ink = isDark ? "#f4f4f4" : "#161616";
  const muted = isDark ? "rgba(255,255,255,0.55)" : "rgba(22,22,22,0.5)";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(22,22,22,0.05)";
  const line = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,22,0.1)";

  const command = (id: string) => {
    window.dispatchEvent(new CustomEvent(TEMPLATE_PIECE_COMMAND_EVENT, {
      detail: { nodeId: detail.nodeId, command: id },
    }));
    setMoreOpen(false);
  };

  const Btn = ({ icon: Icon, label, onClick, active }: {
    icon: typeof Copy; label: string; onClick: () => void; active?: boolean;
  }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={e => { e.stopPropagation(); onClick(); }}
      className="nodrag nopan"
      style={{
        display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 10px",
        border: "none", borderRadius: 9, background: active ? hover : "transparent",
        color: ink, fontSize: 12.5, fontWeight: 550, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  return (
    <div
      data-artx-piece-toolbar=""
      className="nodrag nopan"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 2, padding: 5, borderRadius: 14, background: bg, border: `1px solid ${line}`, boxShadow: "0 10px 34px rgba(0,0,0,0.16)", color: ink }}
    >
      <Btn icon={Sparkles} label="作为参考图" onClick={() => void referencePiece(detail)} />
      <Btn icon={Copy} label="复制" onClick={() => void copyPiece(detail)} />
      <span style={{ width: 1, height: 20, background: line, margin: "0 4px" }} />
      <button
        type="button" title="下载单元" aria-label="下载单元"
        onClick={e => { e.stopPropagation(); void downloadPiece(detail); }}
        className="nodrag nopan"
        style={{ display: "grid", placeItems: "center", width: 34, height: 34, border: "none", borderRadius: 9, background: "transparent", color: ink, cursor: "pointer" }}
      >
        <Download size={15} />
      </button>
      <button
        type="button" title="更多" aria-label="更多" aria-expanded={moreOpen}
        onClick={e => { e.stopPropagation(); setMoreOpen(v => !v); }}
        className="nodrag nopan"
        style={{ display: "grid", placeItems: "center", width: 34, height: 34, border: "none", borderRadius: 9, background: moreOpen ? hover : "transparent", color: ink, cursor: "pointer" }}
      >
        <MoreHorizontal size={17} />
      </button>
      <Btn
        icon={Pencil} label="属性编辑" active
        onClick={() => window.dispatchEvent(new CustomEvent(TEMPLATE_PROPERTIES_OPEN_EVENT))}
      />
      <Btn icon={Type} label="创建文字" onClick={() => command("create-text")} />
      <Btn icon={ImagePlus} label="导入图片" onClick={() => command("import-image")} />

      {moreOpen && (
        <div
          data-artx-piece-more=""
          className="nodrag nopan"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 90, width: 220,
            padding: 8, borderRadius: 14, background: bg, border: `1px solid ${line}`,
            boxShadow: "0 16px 44px rgba(0,0,0,0.18)", zIndex: 30,
          }}
        >
          {MORE_COMMANDS.map((item, i) => {
            const Icon = MORE_ICONS[i];
            return (
              <button
                key={item.id}
                type="button"
                data-artx-piece-more-command={item.id}
                onClick={e => { e.stopPropagation(); command(item.id); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", border: "none", borderRadius: 9,
                  background: i === 3 ? hover : "transparent", color: ink,
                  fontSize: 13, textAlign: "left", cursor: "pointer",
                }}
              >
                <Icon size={16} color={muted} />
                {item.label}
              </button>
            );
          })}
          <div style={{ borderTop: `1px solid ${line}`, margin: "6px 0" }} />
          <button
            type="button"
            data-artx-piece-more-command="reset-rotation"
            onClick={e => { e.stopPropagation(); command("reset-rotation"); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", borderRadius: 9, background: "transparent", color: muted, fontSize: 12.5, textAlign: "left", cursor: "pointer" }}
          >
            <RotateCcw size={15} /> 重置旋转
          </button>
        </div>
      )}
    </div>
  );
}
