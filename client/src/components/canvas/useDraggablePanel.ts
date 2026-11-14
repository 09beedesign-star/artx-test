/**
 * 画布悬浮面板的「左键拖拽移动」唯一实现（2026-11-14）。
 *
 * 🔒 用户要求：图层面板 / 属性编辑面板都能用鼠标左键拖动；
 *    ⚠️ 且**不会因为鼠标空击（点击画布空白处）自动消失**，只有点右上角 X 才关。
 *    所以这里只管位置，绝不注册任何「点外部就关闭」的监听。
 *
 * 为什么不用现成的 floating-panel-layer.ts / nextPanelPosition：
 *    那套是「跟着画布节点、位移要除 zoom」的世界坐标拖拽；
 *    这两个面板是 position:fixed 的屏幕坐标 UI，直接累加 clientX/clientY 差值即可。
 */
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface PanelPosition {
  x: number;
  y: number;
}

const PREFIX = "artx:canvas-panel-pos:";

function clampToViewport(pos: PanelPosition, width: number, height: number): PanelPosition {
  if (typeof window === "undefined") return pos;
  return {
    x: Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - height - 8)),
  };
}

export function readPanelPosition(key: string, fallback: PanelPosition): PanelPosition {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof p.x !== "number" || typeof p.y !== "number") return fallback;
    return clampToViewport({ x: p.x, y: p.y }, 260, 120);
  } catch {
    return fallback;
  }
}

function writePanelPosition(key: string, pos: PanelPosition) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(pos));
  } catch {
    // 位置写失败不影响面板使用
  }
}

export function useDraggablePanel(
  key: string,
  fallback: PanelPosition,
  size: { width: number; height: number } = { width: 260, height: 120 },
) {
  const [pos, setPos] = useState<PanelPosition>(() => readPanelPosition(key, fallback));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    // 只认鼠标左键；点在 X / 输入框等交互元素上不启动拖拽
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-panel-no-drag]")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const next = clampToViewport(
      { x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) },
      size.width,
      size.height,
    );
    setPos(next);
  }, [size.width, size.height]);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setPos(current => {
      writePanelPosition(key, current);
      return current;
    });
  }, [key]);

  return {
    pos,
    dragging,
    /** 挂在面板头部（拖拽把手）上 */
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
