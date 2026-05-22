/**
 * useCanvas — Infinite Canvas Engine
 * Handles pan, zoom, and node drag state for the workspace canvas
 */
import { useState, useRef, useCallback, useEffect } from "react";

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface CanvasNode {
  id: string;
  type: "asset" | "chat" | "text" | "prompt";
  x: number;
  y: number;
  width: number;
  height?: number;
  zIndex: number;
  data: Record<string, unknown>;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const ZOOM_SENSITIVITY = 0.001;

export function useCanvas(initialNodes: CanvasNode[]) {
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);

  const panStartRef = useRef<{ mouseX: number; mouseY: number; canvasX: number; canvasY: number } | null>(null);
  const dragNodeRef = useRef<{ nodeId: string; startMouseX: number; startMouseY: number; startNodeX: number; startNodeY: number } | null>(null);
  const maxZIndexRef = useRef(nodes.reduce((m, n) => Math.max(m, n.zIndex), 10));

  // ── Pan ──────────────────────────────────────────────────────
  const startPan = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, canvasX: transform.x, canvasY: transform.y };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setTransform((t) => ({ ...t, x: panStartRef.current!.canvasX + dx, y: panStartRef.current!.canvasY + dy }));
    }
    if (isDraggingNode && dragNodeRef.current) {
      const { nodeId, startMouseX, startMouseY, startNodeX, startNodeY } = dragNodeRef.current;
      const dx = (e.clientX - startMouseX) / transform.scale;
      const dy = (e.clientY - startMouseY) / transform.scale;
      setNodes((prev) =>
        prev.map((n) => n.id === nodeId ? { ...n, x: startNodeX + dx, y: startNodeY + dy } : n)
      );
    }
  }, [isPanning, isDraggingNode, transform.scale]);

  const stopDrag = useCallback(() => {
    setIsPanning(false);
    setIsDraggingNode(false);
    panStartRef.current = null;
    dragNodeRef.current = null;
  }, []);

  // ── Zoom ─────────────────────────────────────────────────────
  const onWheel = useCallback((e: WheelEvent, containerRect: DOMRect) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * (1 + delta)));
    // Zoom toward cursor position
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const ratio = newScale / transform.scale;
    setTransform((t) => ({
      scale: newScale,
      x: mouseX - ratio * (mouseX - t.x),
      y: mouseY - ratio * (mouseY - t.y),
    }));
  }, [transform]);

  // ── Node drag ────────────────────────────────────────────────
  const startNodeDrag = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setIsDraggingNode(true);
    maxZIndexRef.current += 1;
    setNodes((prev) =>
      prev.map((n) => n.id === nodeId ? { ...n, zIndex: maxZIndexRef.current } : n)
    );
    setSelectedNodeId(nodeId);
    dragNodeRef.current = { nodeId, startMouseX: e.clientX, startMouseY: e.clientY, startNodeX: node.x, startNodeY: node.y };
  }, [nodes]);

  // ── Zoom controls ────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setTransform((t) => ({ ...t, scale: Math.min(MAX_SCALE, t.scale * 1.25) }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform((t) => ({ ...t, scale: Math.max(MIN_SCALE, t.scale / 1.25) }));
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  const fitView = useCallback((containerWidth: number, containerHeight: number) => {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + (n.height || 300)));
    const contentW = maxX - minX + 80;
    const contentH = maxY - minY + 80;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(containerWidth / contentW, containerHeight / contentH) * 0.85));
    setTransform({
      scale,
      x: (containerWidth - contentW * scale) / 2 - minX * scale + 40 * scale,
      y: (containerHeight - contentH * scale) / 2 - minY * scale + 40 * scale,
    });
  }, [nodes]);

  // ── Add node ─────────────────────────────────────────────────
  const addNode = useCallback((node: Omit<CanvasNode, "zIndex">) => {
    maxZIndexRef.current += 1;
    setNodes((prev) => [...prev, { ...node, zIndex: maxZIndexRef.current }]);
    setSelectedNodeId(node.id);
  }, []);

  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const updateNodeData = useCallback((id: string, data: Partial<CanvasNode["data"]>) => {
    setNodes((prev) =>
      prev.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n)
    );
  }, []);

  return {
    transform,
    nodes,
    selectedNodeId,
    isPanning,
    isDraggingNode,
    setSelectedNodeId,
    startPan,
    onMouseMove,
    stopDrag,
    onWheel,
    startNodeDrag,
    zoomIn,
    zoomOut,
    resetView,
    fitView,
    addNode,
    removeNode,
    updateNodeData,
  };
}
