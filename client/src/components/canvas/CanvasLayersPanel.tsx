/**
 * CanvasLayersPanel — 画布图层悬浮面板（2026-11-14 从 InfiniteCanvas 抽离并扩展）。
 *
 * 通过 window 事件与 InnerCanvas 通信：
 *   接收：canvas-layers-data              { rows: LayerRow[] }
 *   发送：canvas-layer-select             { id, shiftKey }
 *         canvas-layer-toggle-hidden      { id }
 *         canvas-layer-toggle-locked      { id }
 *         canvas-layer-reorder            { dragId, targetId }
 *         canvas-layer-frame-embed        { dragId, frameId }
 *         canvas-layer-rename             { id, name }        ← 新增
 *         canvas-layer-duplicate          { ids }             ← 新增
 *         canvas-layer-group              { ids }             ← 新增
 *         canvas-layer-ungroup            { ids }             ← 新增
 *         canvas-layer-properties         { id }              ← 新增
 *
 * 🔒 用户要求：面板沿画布左侧边栏展开、可左键拖拽移动、右上角 X 关闭；
 *    ⚠️ **不会因为鼠标空击（画布空白处点击）自动消失** —— 关闭只走 onClose。
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Box, Boxes, Copy, Eye, EyeOff, Frame, GripVertical, Image as ImageIcon,
  Lock, PenLine, Pencil, SlidersHorizontal, Square, Type, Unlock, X,
} from "lucide-react";
import type { LayerRow } from "@/lib/canvas-layers";
import { useDraggablePanel } from "./useDraggablePanel";

type ContextState = { x: number; y: number; rowId: string; ids: string[] };

export function CanvasLayersPanel({ isDark, onClose }: { isDark: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<LayerRow[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<ContextState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const { pos, dragging, dragHandlers } = useDraggablePanel("layers", { x: 84, y: 68 }, { width: 220, height: 260 });

  useEffect(() => {
    const handler = (e: Event) => setRows((e as CustomEvent<{ rows: LayerRow[] }>).detail.rows);
    window.addEventListener("canvas-layers-data", handler);
    return () => window.removeEventListener("canvas-layers-data", handler);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("canvas-layers-request"));
  }, []);

  // 右键菜单：点外部 / Esc 只关菜单，绝不关面板
  useEffect(() => {
    if (!ctx) return;
    const onDown = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCtx(null); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  const bg = isDark ? "rgba(22,22,30,0.96)" : "rgba(255,255,255,0.96)";
  const border = isDark ? "rgba(60,60,70,0.9)" : "rgba(0,0,0,0.10)";
  const textColor = isDark ? "rgba(240,240,248,0.88)" : "rgba(28,28,40,0.82)";
  const subColor = isDark ? "rgba(180,180,190,0.55)" : "rgba(0,0,0,0.35)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
  const selectedBg = isDark ? "rgba(30,80,180,0.35)" : "#e9f1ff";
  const selectedColor = isDark ? "#a0c4ff" : "#1266c6";
  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  const emit = (name: string, detail: unknown) =>
    window.dispatchEvent(new CustomEvent(name, { detail }));

  const handleRowClick = (id: string, e: React.MouseEvent) =>
    emit("canvas-layer-select", { id, shiftKey: e.shiftKey });
  const handleToggleHidden = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    emit("canvas-layer-toggle-hidden", { id });
  };
  const handleToggleLocked = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    emit("canvas-layer-toggle-locked", { id });
  };

  const stopAutoScroll = () => {
    if (autoScrollRef.current !== null) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };
  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); stopAutoScroll(); };
  const handleDragOver = (targetId: string, e: React.DragEvent) => {
    if (!dragId || dragId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(targetId);
    const list = listRef.current;
    if (!list) return;
    const rect = list.getBoundingClientRect();
    stopAutoScroll();
    if (e.clientY - rect.top < 32) {
      autoScrollRef.current = setInterval(() => { list.scrollTop = Math.max(0, list.scrollTop - 16); }, 60);
    } else if (rect.bottom - e.clientY < 32) {
      autoScrollRef.current = setInterval(() => { list.scrollTop += 16; }, 60);
    }
  };
  const handleDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    stopAutoScroll();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const targetRow = rows.find(r => r.id === targetId);
    emit(
      targetRow?.icon === "frame" ? "canvas-layer-frame-embed" : "canvas-layer-reorder",
      targetRow?.icon === "frame" ? { dragId, frameId: targetId } : { dragId, targetId },
    );
    setDragId(null);
    setDragOverId(null);
  };

  const iconForRow = (row: LayerRow) => {
    const sz = 13;
    const col = row.selected ? selectedColor : subColor;
    switch (row.icon) {
      case "frame":   return <Frame size={sz} style={{ color: col, flexShrink: 0 }} />;
      case "image":   return <ImageIcon size={sz} style={{ color: col, flexShrink: 0 }} />;
      case "text":    return <Type size={sz} style={{ color: col, flexShrink: 0 }} />;
      case "shape":   return <Square size={sz} style={{ color: col, flexShrink: 0 }} />;
      case "draw":    return <Pencil size={sz} style={{ color: col, flexShrink: 0 }} />;
      case "model3d": return <Box size={sz} style={{ color: col, flexShrink: 0 }} />;
      default:        return <Square size={sz} style={{ color: col, flexShrink: 0 }} />;
    }
  };

  const openContext = (row: LayerRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selected = rows.filter(r => r.selected).map(r => r.id);
    // 右键未选中的行：先把它设为唯一选中，菜单动作只作用于它
    const ids = row.selected && selected.length > 1 ? selected : [row.id];
    if (!row.selected) emit("canvas-layer-select", { id: row.id, shiftKey: false });
    setCtx({ x: e.clientX, y: e.clientY, rowId: row.id, ids });
  };

  const commitRename = () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) emit("canvas-layer-rename", { id: renamingId, name });
    setRenamingId(null);
  };

  const menuItems: Array<{ label: string; icon: React.ReactNode; run: () => void; hidden?: boolean; danger?: boolean }> = [
    {
      // 重命名 / 属性编辑永远作用于「被右键的那一行」，不受多选影响；
      // 只有打组 / 复制这类批量动作才用 ids。
      label: "重命名", icon: <PenLine size={13} />,
      run: () => {
        const row = rows.find(r => r.id === ctx?.rowId);
        setRenameValue(row?.name || "");
        setRenamingId(ctx?.rowId || null);
      },
    },
    { label: "复制", icon: <Copy size={13} />, run: () => emit("canvas-layer-duplicate", { ids: ctx?.ids || [] }) },
    {
      label: "属性编辑", icon: <SlidersHorizontal size={13} />,
      run: () => emit("canvas-layer-properties", { id: ctx?.rowId }),
    },
    { label: "打组", icon: <Boxes size={13} />, hidden: (ctx?.ids.length || 0) < 2, run: () => emit("canvas-layer-group", { ids: ctx?.ids || [] }) },
    { label: "解散打组", icon: <Box size={13} />, run: () => emit("canvas-layer-ungroup", { ids: ctx?.ids || [] }) },
  ];

  /*
   * ⚠️ 必须 portal 到 body：这个面板原本挂在 CanvasTopToolPalette 内部，
   *    而命令栏容器带 transform / backdropFilter，会变成 fixed 的包含块 ——
   *    表现是 left:84 被算成「相对命令栏」，面板跑到屏幕中间而不是贴左侧边栏。
   *    z-index 调多大都没用，只能换包含块。
   */
  return typeof document === "undefined" ? null : createPortal(
    <div
      data-artx-canvas-layers-panel=""
      className="fixed nodrag nopan"
      style={{ left: pos.x, top: pos.y, zIndex: 210, width: 220 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
        style={{ background: bg, border: `1px solid ${border}`, backdropFilter: "blur(20px)", maxHeight: "calc(100vh - 160px)" }}>
        {/* 头部 = 拖拽把手 */}
        <div {...dragHandlers}
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: `1px solid ${dividerColor}`, cursor: dragging ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}>
          <span style={{ color: textColor, fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>图层</span>
          <button data-panel-no-drag="" onClick={onClose} aria-label="关闭图层面板" data-artx-canvas-layers-close=""
            style={{ color: subColor, background: "transparent", border: "none", cursor: "pointer", lineHeight: 1 }}>
            <X size={14} />
          </button>
        </div>

        <div className="px-3 pt-2 pb-1" style={{ color: subColor, fontSize: 10, lineHeight: "1.5", userSelect: "none" }}>
          拖动图层调整顺序；右键可重命名 / 复制 / 打组 / 属性编辑。
        </div>

        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-8" style={{ color: subColor, fontSize: 11 }}>暂无图层</div>
        ) : (
          <div ref={listRef} className="overflow-y-auto" aria-label="图层列表" style={{ maxHeight: "calc(100vh - 260px)" }}>
            {rows.map(row => (
              <div
                key={row.id}
                data-artx-layer-row={row.id}
                draggable
                onDragStart={e => handleDragStart(row.id, e)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(row.id, e)}
                onDrop={e => handleDrop(row.id, e)}
                onClick={e => handleRowClick(row.id, e)}
                onContextMenu={e => openContext(row, e)}
                style={{
                  display: "flex", alignItems: "center", height: 36,
                  paddingLeft: 8 + row.depth * 14, paddingRight: 4, gap: 5,
                  cursor: row.hidden || row.locked ? "default" : "pointer",
                  borderRadius: 7, margin: "1px 4px",
                  background: row.id === dragOverId ? (isDark ? "rgba(30,100,220,0.22)" : "rgba(18,102,198,0.10)")
                    : row.selected ? selectedBg : "transparent",
                  opacity: row.id === dragId ? 0.4 : row.hidden ? 0.4 : 1,
                }}
              >
                <GripVertical size={12} style={{ color: subColor, flexShrink: 0, cursor: "grab", opacity: 0.5 }} />
                {iconForRow(row)}
                {renamingId === row.id ? (
                  <input
                    ref={renameRef}
                    data-artx-layer-rename=""
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    style={{ flex: 1, minWidth: 0, height: 24, fontSize: 12, color: textColor,
                      background: isDark ? "rgba(255,255,255,0.1)" : "#fff",
                      border: `1px solid ${border}`, borderRadius: 4, padding: "0 5px", outline: "none" }}
                  />
                ) : (
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: 12, color: row.selected ? selectedColor : textColor, userSelect: "none", minWidth: 0 }}>
                    {row.name}
                  </span>
                )}
                <button aria-label={row.hidden ? "显示图层" : "隐藏图层"} onClick={e => handleToggleHidden(row.id, e)}
                  style={{ background: "transparent", border: "none", cursor: "pointer",
                    color: row.hidden ? (isDark ? "#a0c4ff" : "#1266c6") : subColor, padding: "2px 3px", lineHeight: 1, flexShrink: 0 }}>
                  {row.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button aria-label={row.locked ? "解锁图层" : "锁定图层"} onClick={e => handleToggleLocked(row.id, e)}
                  style={{ background: "transparent", border: "none", cursor: "pointer",
                    color: row.locked ? (isDark ? "#a0c4ff" : "#1266c6") : subColor, padding: "2px 3px", lineHeight: 1, flexShrink: 0 }}>
                  {row.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {ctx && createPortal(
        <div
          data-artx-layer-context-menu=""
          className="fixed rounded-[var(--radius-md-design)] p-1 shadow-2xl"
          style={{ left: ctx.x, top: ctx.y, minWidth: 148, zIndex: 9999,
            background: isDark ? "#1a1a1a" : "#ffffff", border: `1px solid ${border}` }}
          onMouseDown={e => e.stopPropagation()}
        >
          {menuItems.filter(item => !item.hidden).map(item => (
            <button key={item.label} type="button" data-artx-layer-action={item.label}
              onClick={() => { item.run(); setCtx(null); }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm-design)] px-2.5 py-1.5 text-left text-[12px] transition-colors"
              style={{ color: item.danger ? "#d9534f" : textColor, background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
}
