/**
 * MindMapPage — 独立思维导图板块
 *
 * 布局：左侧工具面板（手动编辑 + AI 生成）+ 右侧 SVG 节点画布。
 * 不依赖 InfiniteCanvas，自包含拖拽与节点逻辑。
 * 积分：AI 生成消耗 40 积分（text_to_mindmap capability）。
 *
 * 新增功能：
 * - 导出：SVG / PNG / JPG / PDF
 * - 节点颜色：自定义背景色 & 文字色
 * - 右键菜单：创建子节点 / 删除 / 复制
 * - 连线样式：实线 / 虚线（节点维度，影响其连向子节点的线）
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileImage,
  Loader2,
  Maximize2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { callLLM } from "@/lib/ai";

// ─── 数据结构 ──────────────────────────────────────────────────────────────

export type MindMapNode = {
  id: string;
  label: string;
  children: MindMapNode[];
  collapsed?: boolean;
  x?: number;
  y?: number;
  /** 自定义背景色（hex/rgba），undefined = 使用默认主题色 */
  bgColor?: string;
  /** 自定义文字色（hex/rgba），undefined = 使用默认主题色 */
  textColor?: string;
  /** 连向子节点的连线样式，undefined = solid */
  edgeStyle?: "solid" | "dashed";
};

type LayoutNode = MindMapNode & {
  x: number;
  y: number;
  depth: number;
};

// ─── 常量 ──────────────────────────────────────────────────────────────────

const NODE_W = 140;
const NODE_H = 36;
const H_GAP = 80;
const V_GAP = 12;

// 节点背景色调色板
const COLOR_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#0ea5e9", "#6b7280", "#a1a1aa",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── 布局算法（从根出发，向右展开） ────────────────────────────────────────

function layoutTree(
  node: MindMapNode,
  depth: number,
  startY: number,
): { nodes: LayoutNode[]; height: number } {
  const x = depth * (NODE_W + H_GAP);

  if (node.collapsed || node.children.length === 0) {
    return {
      nodes: [{ ...node, x, y: startY, depth }],
      height: NODE_H + V_GAP,
    };
  }

  const childResults = node.children.map((child) => {
    return layoutTree(child, depth + 1, 0);
  });

  let totalH = 0;
  const positioned: LayoutNode[] = [];
  childResults.forEach((r) => {
    r.nodes.forEach((n) => {
      positioned.push({ ...n, y: n.y + startY + totalH });
    });
    totalH += r.height;
  });

  const subtreeH = Math.max(totalH, NODE_H + V_GAP);
  const selfY = startY + subtreeH / 2 - NODE_H / 2;

  return {
    nodes: [{ ...node, x, y: selfY, depth }, ...positioned],
    height: subtreeH,
  };
}

// ─── 节点查找 / 更新工具函数 ────────────────────────────────────────────────

function findNode(root: MindMapNode, id: string): MindMapNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const found = findNode(c, id);
    if (found) return found;
  }
  return null;
}

function mapNode(
  node: MindMapNode,
  id: string,
  fn: (n: MindMapNode) => MindMapNode,
): MindMapNode {
  if (node.id === id) return fn(node);
  return { ...node, children: node.children.map((c) => mapNode(c, id, fn)) };
}

function removeNode(node: MindMapNode, id: string): MindMapNode {
  return {
    ...node,
    children: node.children
      .filter((c) => c.id !== id)
      .map((c) => removeNode(c, id)),
  };
}

function deepCloneNode(node: MindMapNode, newIdPrefix?: string): MindMapNode {
  const prefix = newIdPrefix ?? uid();
  return {
    ...node,
    id: prefix + "_" + uid(),
    children: node.children.map((c) => deepCloneNode(c, prefix)),
  };
}

// ─── SVG 箭头路径 ────────────────────────────────────────────────────────────

function edgePath(
  px: number,
  py: number,
  cx: number,
  cy: number,
): string {
  const mx = px + NODE_W;
  const pmid = py + NODE_H / 2;
  const cmid = cy + NODE_H / 2;
  const mx2 = cx;
  return `M ${mx} ${pmid} C ${mx + H_GAP / 2} ${pmid}, ${mx2 - H_GAP / 2} ${cmid}, ${mx2} ${cmid}`;
}

// ─── 默认初始数据 ────────────────────────────────────────────────────────────

const DEFAULT_ROOT: MindMapNode = {
  id: "root",
  label: "中心主题",
  children: [
    {
      id: uid(),
      label: "分支一",
      children: [
        { id: uid(), label: "子节点", children: [] },
      ],
    },
    { id: uid(), label: "分支二", children: [] },
    { id: uid(), label: "分支三", children: [] },
  ],
};

// ─── 导出工具函数 ────────────────────────────────────────────────────────────

/** 将 SVG element 序列化为带 inline 样式的字符串 */
function serializeSvg(svgEl: SVGSVGElement, w: number, h: number): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

/** SVG → canvas */
async function svgToCanvas(
  svgStr: string,
  w: number,
  h: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 右键菜单组件 ────────────────────────────────────────────────────────────

type ContextMenuProps = {
  x: number;
  y: number;
  nodeId: string;
  isRoot: boolean;
  dark: boolean;
  onAddChild: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onClose: () => void;
};

const ContextMenu = ({
  x, y, isRoot, dark,
  onAddChild, onDelete, onCopy, onClose,
}: ContextMenuProps) => {
  const bg = dark ? "#27272a" : "#ffffff";
  const border = dark ? "#3f3f46" : "#e4e4e7";
  const text = dark ? "#e4e4e7" : "#18181b";

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [onClose]);

  const menu = (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 9999,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        minWidth: 148,
        padding: "4px 0",
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ContextMenuItem icon={<Plus size={13} />} label="创建子节点" color={text} onClick={() => { onAddChild(); onClose(); }} />
      <ContextMenuItem icon={<Copy size={13} />} label="复制节点" color={text} onClick={() => { onCopy(); onClose(); }} disabled={isRoot} />
      <div style={{ borderTop: `1px solid ${border}`, margin: "3px 0" }} />
      <ContextMenuItem icon={<Trash2 size={13} />} label="删除节点" color={isRoot ? "#a1a1aa" : "#ef4444"} onClick={() => { onDelete(); onClose(); }} disabled={isRoot} />
    </div>
  );

  if (typeof document === "undefined") return menu;
  return createPortal(menu, document.body);
};

const ContextMenuItem = ({
  icon, label, color, onClick, disabled,
}: { icon: React.ReactNode; label: string; color: string; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={disabled ? undefined : onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      padding: "6px 12px",
      color: disabled ? "#a1a1aa" : color,
      background: "transparent",
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      textAlign: "left",
    }}
    onMouseEnter={(e) => {
      if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.08)";
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
    }}
  >
    {icon}
    {label}
  </button>
);

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function MindMapPage() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const dark = theme === "dark";

  const [root, setRoot] = useState<MindMapNode>(DEFAULT_ROOT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // 颜色面板
  const [showColorPanel, setShowColorPanel] = useState(false);

  // AI 生成状态
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // 导出状态
  const [exporting, setExporting] = useState(false);

  // 画布变换
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // 布局计算
  const { nodes: layoutNodes } = layoutTree(root, 0, 0);
  const contentW = Math.max(...layoutNodes.map((n) => n.x + NODE_W)) + 80;
  const contentH = Math.max(...layoutNodes.map((n) => n.y + NODE_H)) + 80;

  // ── 节点操作 ──────────────────────────────────────────────────────────────

  const addChild = useCallback(
    (parentId: string) => {
      const newNode: MindMapNode = { id: uid(), label: "新节点", children: [] };
      setRoot((r) =>
        mapNode(r, parentId, (n) => ({ ...n, children: [...n.children, newNode] })),
      );
      setTimeout(() => {
        setEditingId(newNode.id);
        setEditingLabel("新节点");
      }, 50);
    },
    [],
  );

  const addRootChild = useCallback(() => {
    addChild("root");
  }, [addChild]);

  const deleteNode = useCallback(
    (id: string) => {
      if (id === "root") {
        toast.error("根节点不能删除");
        return;
      }
      setRoot((r) => removeNode(r, id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const copyNode = useCallback(
    (id: string) => {
      if (id === "root") return;
      const node = findNode(root, id);
      if (!node) return;
      // 找父节点并在其 children 末尾插入
      const insertCopy = (parent: MindMapNode): MindMapNode => ({
        ...parent,
        children: parent.children.flatMap((c) => {
          if (c.id === id) {
            return [c, deepCloneNode(node)];
          }
          return [insertCopy(c)];
        }),
      });
      setRoot((r) => insertCopy(r));
      toast.success("节点已复制");
    },
    [root],
  );

  const toggleCollapse = useCallback((id: string) => {
    setRoot((r) =>
      mapNode(r, id, (n) => ({ ...n, collapsed: !n.collapsed })),
    );
  }, []);

  const startEdit = useCallback((id: string, label: string) => {
    setEditingId(id);
    setEditingLabel(label);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const trimmed = editingLabel.trim();
    if (trimmed) {
      setRoot((r) =>
        mapNode(r, editingId, (n) => ({ ...n, label: trimmed })),
      );
    }
    setEditingId(null);
  }, [editingId, editingLabel]);

  // 颜色变更
  const setNodeBgColor = useCallback((color: string | undefined) => {
    if (!selectedId) return;
    setRoot((r) => mapNode(r, selectedId, (n) => ({ ...n, bgColor: color })));
  }, [selectedId]);

  const setNodeTextColor = useCallback((color: string) => {
    if (!selectedId) return;
    setRoot((r) => mapNode(r, selectedId, (n) => ({ ...n, textColor: color })));
  }, [selectedId]);

  const toggleEdgeStyle = useCallback(() => {
    if (!selectedId) return;
    setRoot((r) =>
      mapNode(r, selectedId, (n) => ({
        ...n,
        edgeStyle: n.edgeStyle === "dashed" ? "solid" : "dashed",
      })),
    );
  }, [selectedId]);

  // ── AI 生成 ───────────────────────────────────────────────────────────────

  const generateMindMap = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast.error("请输入主题");
      return;
    }
    if (!user) {
      toast.error("请先登录");
      return;
    }
    setAiLoading(true);
    try {
      const { text } = await callLLM({
        prompt: `请根据以下主题生成一个结构清晰的思维导图，以 JSON 格式输出，格式如下：
{
  "id": "root",
  "label": "主题名称",
  "children": [
    {
      "id": "1",
      "label": "分支一",
      "children": [
        { "id": "1-1", "label": "子节点", "children": [] }
      ]
    }
  ]
}

主题：${aiPrompt.trim()}

要求：
1. 输出纯 JSON，不要有任何额外说明文字
2. 分支数量 3-6 个，每个分支可以有 2-4 个子节点
3. 节点文字简洁，每个节点不超过 15 个字
4. id 使用简单数字字符串即可`,
        module: "mindmap",
        skillId: "text_to_mindmap",
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI 返回格式异常");

      const parsed = JSON.parse(jsonMatch[0]) as MindMapNode;

      const ensureChildren = (node: MindMapNode): MindMapNode => ({
        ...node,
        id: node.id || uid(),
        children: (node.children || []).map(ensureChildren),
      });

      setRoot(ensureChildren(parsed));
      setShowAiPanel(false);
      setAiPrompt("");
      toast.success("思维导图已生成");
      setPan({ x: 60, y: 40 });
      setZoom(1);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "AI 生成失败，请重试",
      );
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, user]);

  // ── 导出 ─────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async (format: "svg" | "png" | "jpg" | "pdf") => {
    if (!svgRef.current) return;
    setExporting(true);
    try {
      const svgStr = serializeSvg(svgRef.current, contentW, contentH);

      if (format === "svg") {
        const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
        downloadBlob(blob, "mindmap.svg");
        toast.success("SVG 已导出");
        return;
      }

      const canvas = await svgToCanvas(svgStr, contentW * 2, contentH * 2); // 2x 高清

      if (format === "png") {
        canvas.toBlob((blob) => {
          if (blob) { downloadBlob(blob, "mindmap.png"); toast.success("PNG 已导出"); }
        }, "image/png");
      } else if (format === "jpg") {
        canvas.toBlob((blob) => {
          if (blob) { downloadBlob(blob, "mindmap.jpg"); toast.success("JPG 已导出"); }
        }, "image/jpeg", 0.92);
      } else if (format === "pdf") {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        const pdfW = contentW;
        const pdfH = contentH;
        const html = `<!DOCTYPE html><html><head><style>
          *{margin:0;padding:0;box-sizing:border-box;}
          body{background:#fff;}
          img{width:${pdfW}px;height:${pdfH}px;display:block;}
          @page{size:${pdfW}px ${pdfH}px;margin:0;}
          @media print{body{margin:0;}img{width:100%;height:auto;}}
        </style></head><body><img src="${dataUrl}"/></body></html>`;
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          setTimeout(() => { win.print(); }, 500);
          toast.success("PDF 打印对话框已打开，选择「另存为 PDF」");
        } else {
          toast.error("请允许弹出窗口");
        }
      }
    } catch (err) {
      toast.error("导出失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  }, [contentW, contentH]);

  // ── 画布平移 ──────────────────────────────────────────────────────────────

  const onSvgPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if ((e.target as SVGElement).closest("[data-node]")) return;
      panStart.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const onSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!panStart.current) return;
      setPan({
        x: panStart.current.px + e.clientX - panStart.current.sx,
        y: panStart.current.py + e.clientY - panStart.current.sy,
      });
    },
    [],
  );

  const onSvgPointerUp = useCallback(() => {
    panStart.current = null;
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // 仅拦截画布滚轮，避免捏合手势触发整页缩放而影响左栏。
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 60, y: 40 });
  }, []);

  // ── 颜色 ──────────────────────────────────────────────────────────────────

  const bg = dark ? "#18181b" : "#f4f4f5";
  const panelBg = dark ? "#27272a" : "#ffffff";
  const nodeFill = dark ? "#3f3f46" : "#ffffff";
  const nodeStroke = dark ? "#52525b" : "#d4d4d8";
  const nodeSelectedStroke = "#6366f1";
  const textClr = dark ? "#e4e4e7" : "#18181b";
  const subText = dark ? "#a1a1aa" : "#71717a";
  const edgeColor = dark ? "#52525b" : "#d4d4d8";
  const rootFill = dark ? "#4f46e5" : "#6366f1";

  const selectedNode = selectedId ? findNode(root, selectedId) : null;

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ background: bg }}
      onClick={() => { setCtxMenu(null); }}
    >
      {/* ── 右键菜单 ── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          nodeId={ctxMenu.nodeId}
          isRoot={ctxMenu.nodeId === "root"}
          dark={dark}
          onAddChild={() => addChild(ctxMenu.nodeId)}
          onDelete={() => deleteNode(ctxMenu.nodeId)}
          onCopy={() => copyNode(ctxMenu.nodeId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── 左侧工具面板 ── */}
      <aside
        className="flex flex-col gap-3 p-4 shrink-0 overflow-y-auto"
        style={{
          width: 220,
          background: panelBg,
          borderRight: `1px solid ${dark ? "#3f3f46" : "#e4e4e7"}`,
        }}
      >
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-1">
          <Brain size={18} style={{ color: "#6366f1" }} />
          <span className="text-sm font-semibold" style={{ color: textClr }}>
            思维导图
          </span>
        </div>

        {/* 手动操作区 */}
        <SideSection title="手动编辑" dark={dark} subText={subText}>
          <SideBtn icon={<Plus size={14} />} label="添加一级节点" dark={dark} textColor={textClr} onClick={addRootChild} />

          {selectedId && (
            <>
              <SideBtn icon={<Plus size={14} />} label="添加子节点" dark={dark} textColor={textClr} onClick={() => addChild(selectedId)} />
              <SideBtn
                icon={<Edit3 size={14} />}
                label="编辑节点"
                dark={dark}
                textColor={textClr}
                onClick={() => {
                  const n = findNode(root, selectedId);
                  if (n) startEdit(n.id, n.label);
                }}
              />
              {selectedId !== "root" && (
                <>
                  <SideBtn icon={<Copy size={14} />} label="复制节点" dark={dark} textColor={textClr} onClick={() => copyNode(selectedId)} />
                  <SideBtn
                    icon={<Trash2 size={14} />}
                    label="删除节点"
                    dark={dark}
                    textColor={dark ? "#f87171" : "#dc2626"}
                    bgOverride={dark ? "#3b1f1f" : "#fee2e2"}
                    onClick={() => deleteNode(selectedId)}
                  />
                </>
              )}
            </>
          )}
        </SideSection>

        {/* 节点样式区（有选中节点时显示） */}
        {selectedId && (
          <SideSection title="节点样式" dark={dark} subText={subText}>
            {/* 背景色 */}
            <div>
              <span className="text-xs" style={{ color: subText }}>背景色</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNodeBgColor(c)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, background: c,
                      border: selectedNode?.bgColor === c ? "2px solid #fff" : "2px solid transparent",
                      outline: selectedNode?.bgColor === c ? "2px solid #6366f1" : "none",
                      cursor: "pointer",
                    }}
                    title={c}
                  />
                ))}
                <button
                  onClick={() => setNodeBgColor(undefined)}
                  style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: "linear-gradient(135deg, #fff 50%, #f00 50%)",
                    border: "1px solid #d4d4d8", cursor: "pointer",
                  }}
                  title="重置默认色"
                />
              </div>
            </div>

            {/* 文字色 */}
            <div className="mt-2">
              <span className="text-xs" style={{ color: subText }}>文字色</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {["#ffffff", "#18181b", "#6366f1", "#ef4444", "#22c55e", "#f97316", "#3b82f6", "#a1a1aa"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setNodeTextColor(c)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, background: c,
                      border: selectedNode?.textColor === c ? "2px solid #6366f1" : `1px solid ${dark ? "#52525b" : "#d4d4d8"}`,
                      cursor: "pointer",
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* 连线样式 */}
            <div className="mt-2">
              <span className="text-xs" style={{ color: subText }}>子节点连线</span>
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => setRoot((r) => mapNode(r, selectedId, (n) => ({ ...n, edgeStyle: "solid" })))}
                  style={{
                    flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 12,
                    border: `1px solid ${selectedNode?.edgeStyle !== "dashed" ? "#6366f1" : (dark ? "#52525b" : "#d4d4d8")}`,
                    background: selectedNode?.edgeStyle !== "dashed" ? (dark ? "#312e81" : "#e0e7ff") : "transparent",
                    color: selectedNode?.edgeStyle !== "dashed" ? "#6366f1" : subText,
                    cursor: "pointer",
                  }}
                >实线</button>
                <button
                  onClick={() => setRoot((r) => mapNode(r, selectedId, (n) => ({ ...n, edgeStyle: "dashed" })))}
                  style={{
                    flex: 1, padding: "4px 0", borderRadius: 6, fontSize: 12,
                    border: `1px solid ${selectedNode?.edgeStyle === "dashed" ? "#6366f1" : (dark ? "#52525b" : "#d4d4d8")}`,
                    background: selectedNode?.edgeStyle === "dashed" ? (dark ? "#312e81" : "#e0e7ff") : "transparent",
                    color: selectedNode?.edgeStyle === "dashed" ? "#6366f1" : subText,
                    cursor: "pointer",
                  }}
                >虚线</button>
              </div>
            </div>
          </SideSection>
        )}

        {/* AI 生成区 */}
        <SideSection title="AI 生成 · 40 积分" dark={dark} subText={subText}>
          <SideBtn
            icon={<Sparkles size={14} />}
            label="AI 一键生成"
            dark={dark}
            textColor={showAiPanel ? (dark ? "#a5b4fc" : "#4f46e5") : textClr}
            bgOverride={showAiPanel ? (dark ? "#312e81" : "#e0e7ff") : undefined}
            onClick={() => setShowAiPanel((v) => !v)}
          />

          {showAiPanel && (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full text-sm rounded-md px-2 py-1.5 resize-none focus:outline-none"
                rows={4}
                placeholder="输入主题，例如：产品设计流程..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{
                  background: dark ? "#3f3f46" : "#ffffff",
                  border: `1px solid ${dark ? "#52525b" : "#d4d4d8"}`,
                  color: textClr,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generateMindMap();
                }}
              />
              <button
                onClick={generateMindMap}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                style={{ background: "#6366f1", color: "#ffffff" }}
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiLoading ? "生成中..." : "生成思维导图"}
              </button>
              <span className="text-xs" style={{ color: subText }}>⌘+Enter 快速生成</span>
            </div>
          )}
        </SideSection>

        {/* 导出区 */}
        <SideSection title="导出" dark={dark} subText={subText}>
          <div className="grid grid-cols-2 gap-1.5">
            {(["svg", "png", "jpg", "pdf"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleExport(fmt)}
                disabled={exporting}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 5, padding: "6px 4px", borderRadius: 6, fontSize: 12,
                  border: `1px solid ${dark ? "#52525b" : "#d4d4d8"}`,
                  background: dark ? "#3f3f46" : "#f4f4f5",
                  color: textClr, cursor: exporting ? "wait" : "pointer",
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                {fmt === "pdf" ? <FileImage size={12} /> : <Download size={12} />}
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </SideSection>

        {/* 视图控制 */}
        <SideSection title="视图控制" dark={dark} subText={subText}>
          <div className="flex gap-2">
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              className="flex-1 flex items-center justify-center py-1.5 rounded-md"
              style={{ background: dark ? "#3f3f46" : "#e4e4e7", color: textClr }}>
              <ZoomIn size={14} />
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
              className="flex-1 flex items-center justify-center py-1.5 rounded-md"
              style={{ background: dark ? "#3f3f46" : "#e4e4e7", color: textClr }}>
              <ZoomOut size={14} />
            </button>
            <button onClick={resetView}
              className="flex-1 flex items-center justify-center py-1.5 rounded-md"
              style={{ background: dark ? "#3f3f46" : "#e4e4e7", color: textClr }}>
              <Maximize2 size={14} />
            </button>
          </div>
          <span className="text-xs" style={{ color: subText }}>缩放：{Math.round(zoom * 100)}%</span>
        </SideSection>

        {/* 操作提示 */}
        <div className="rounded-lg p-3 text-xs leading-5" style={{ color: subText }}>
          <p>• 点击节点选中</p>
          <p>• 双击节点编辑</p>
          <p>• 右键打开操作菜单</p>
          <p>• 点击 › 折叠/展开</p>
          <p>• 拖拽画布平移</p>
          <p>• 滚轮缩放</p>
        </div>
      </aside>

      {/* ── 右侧 SVG 画布 ── */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerCancel={onSvgPointerUp}
          style={{ touchAction: "none" }}
        >
          <rect width="100%" height="100%" fill={bg} />
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* 边（连线） */}
            {layoutNodes.map((node) => {
              if (node.collapsed || node.children.length === 0) return null;
              const isDashed = node.edgeStyle === "dashed";
              return node.children.map((child) => {
                const childLayout = layoutNodes.find((n) => n.id === child.id);
                if (!childLayout) return null;
                return (
                  <path
                    key={`edge-${node.id}-${child.id}`}
                    d={edgePath(node.x, node.y, childLayout.x, childLayout.y)}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeDasharray={isDashed ? "6 4" : undefined}
                  />
                );
              });
            })}

            {/* 节点 */}
            {layoutNodes.map((node) => {
              const isRoot = node.id === "root";
              const isSelected = selectedId === node.id;
              const isEditing = editingId === node.id;
              const hasChildren = node.children.length > 0;

              const fill = node.bgColor ?? (isRoot ? rootFill : nodeFill);
              const stroke = isSelected ? nodeSelectedStroke : nodeStroke;
              const labelColor = node.textColor ?? (isRoot ? "#ffffff" : textClr);

              return (
                <g
                  key={node.id}
                  data-node={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); setCtxMenu(null); }}
                  onDoubleClick={() => startEdit(node.id, node.label)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedId(node.id);
                    const MENU_W = 160;
                    const MENU_H = 120;
                    const GAP = 8;
                    // 以鼠标位置为基准，右侧 GAP 偏移；超出视口边界则自动收回
                    const rawX = e.clientX + GAP;
                    const rawY = e.clientY + GAP;
                    const finalX = rawX + MENU_W > window.innerWidth ? e.clientX - MENU_W - GAP : rawX;
                    const finalY = rawY + MENU_H > window.innerHeight ? e.clientY - MENU_H - GAP : rawY;
                    setCtxMenu({ x: finalX, y: finalY, nodeId: node.id });
                  }}
                >
                  {/* 节点矩形 */}
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 2 : 1}
                    filter={isSelected ? "url(#shadow)" : undefined}
                  />

                  {/* 节点文字或编辑框 */}
                  {isEditing ? (
                    <foreignObject x={8} y={4} width={NODE_W - 16} height={NODE_H - 8}>
                      <input
                        // @ts-ignore
                        xmlns="http://www.w3.org/1999/xhtml"
                        autoFocus
                        className="w-full h-full text-sm bg-transparent border-none outline-none"
                        style={{ color: labelColor }}
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </foreignObject>
                  ) : (
                    <text
                      x={NODE_W / 2}
                      y={NODE_H / 2 + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fill={labelColor}
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {node.label.length > 11
                        ? node.label.slice(0, 11) + "…"
                        : node.label}
                    </text>
                  )}

                  {/* 折叠/展开按钮 */}
                  {hasChildren && (
                    <g
                      transform={`translate(${NODE_W - 2},${NODE_H / 2 - 7})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(node.id);
                      }}
                    >
                      <circle r={7} fill={dark ? "#52525b" : "#d4d4d8"} />
                      {node.collapsed ? (
                        <ChevronRight size={10} x={-5} y={-5} color={textClr} strokeWidth={2} />
                      ) : (
                        <ChevronDown size={10} x={-5} y={-5} color={textClr} strokeWidth={2} />
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* 阴影滤镜 */}
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx={0} dy={2} stdDeviation={4} floodColor="#6366f1" floodOpacity={0.3} />
            </filter>
          </defs>
        </svg>

        {layoutNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center" style={{ color: subText }}>
              <Brain size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">点击左侧「添加一级节点」或「AI 一键生成」</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 小型辅助组件 ────────────────────────────────────────────────────────────

function SideSection({
  title, dark, subText, children,
}: { title: string; dark: boolean; subText: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: dark ? "#18181b" : "#f4f4f5" }}
    >
      <span className="text-xs font-medium mb-0.5" style={{ color: subText }}>{title}</span>
      {children}
    </div>
  );
}

function SideBtn({
  icon, label, dark, textColor, bgOverride, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  dark: boolean;
  textColor: string;
  bgOverride?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors"
      style={{
        background: bgOverride ?? (dark ? "#3f3f46" : "#e4e4e7"),
        color: textColor,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
