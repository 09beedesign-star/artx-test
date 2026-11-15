/**
 * MindMapPage — 独立思维导图板块
 *
 * 布局：左侧工具面板（手动编辑 + AI 生成）+ 右侧 SVG 节点画布。
 * 不依赖 InfiniteCanvas，自包含拖拽与节点逻辑。
 * 积分：AI 生成消耗 40 积分（text_to_mindmap capability）。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
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

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function MindMapPage() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const dark = theme === "dark";

  const [root, setRoot] = useState<MindMapNode>(DEFAULT_ROOT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // AI 生成状态
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // 画布变换
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // 布局计算
  const { nodes: layoutNodes } = layoutTree(root, 0, 0);
  const svgW = Math.max(...layoutNodes.map((n) => n.x + NODE_W)) + 80;
  const svgH = Math.max(...layoutNodes.map((n) => n.y + NODE_H)) + 80;

  // ── 节点操作 ──────────────────────────────────────────────────────────────

  const addChild = useCallback(
    (parentId: string) => {
      const newNode: MindMapNode = { id: uid(), label: "新节点", children: [] };
      setRoot((r) =>
        mapNode(r, parentId, (n) => ({ ...n, children: [...n.children, newNode] })),
      );
      // 立即进入编辑模式
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

      // 从返回文本中提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AI 返回格式异常");

      const parsed = JSON.parse(jsonMatch[0]) as MindMapNode;

      // 补全缺失的 children 字段
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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)));
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
  const textColor = dark ? "#e4e4e7" : "#18181b";
  const subText = dark ? "#a1a1aa" : "#71717a";
  const edgeColor = dark ? "#52525b" : "#d4d4d8";
  const rootFill = dark ? "#4f46e5" : "#6366f1";

  return (
    <div
      className="flex h-full w-full overflow-hidden"
      style={{ background: bg }}
    >
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
          <span className="text-sm font-semibold" style={{ color: textColor }}>
            思维导图
          </span>
        </div>

        {/* 手动操作区 */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2"
          style={{ background: dark ? "#18181b" : "#f4f4f5" }}
        >
          <span
            className="text-xs font-medium mb-0.5"
            style={{ color: subText }}
          >
            手动编辑
          </span>

          <button
            onClick={addRootChild}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors"
            style={{
              background: dark ? "#3f3f46" : "#e4e4e7",
              color: textColor,
            }}
          >
            <Plus size={14} />
            添加一级节点
          </button>

          {selectedId && selectedId !== "root" && (
            <>
              <button
                onClick={() => addChild(selectedId)}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors"
                style={{
                  background: dark ? "#3f3f46" : "#e4e4e7",
                  color: textColor,
                }}
              >
                <Plus size={14} />
                添加子节点
              </button>
              <button
                onClick={() => {
                  const n = findNode(root, selectedId);
                  if (n) startEdit(n.id, n.label);
                }}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors"
                style={{
                  background: dark ? "#3f3f46" : "#e4e4e7",
                  color: textColor,
                }}
              >
                <Edit3 size={14} />
                编辑节点
              </button>
              <button
                onClick={() => deleteNode(selectedId)}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors"
                style={{
                  background: dark ? "#3b1f1f" : "#fee2e2",
                  color: dark ? "#f87171" : "#dc2626",
                }}
              >
                <Trash2 size={14} />
                删除节点
              </button>
            </>
          )}
        </div>

        {/* AI 生成区 */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2"
          style={{ background: dark ? "#18181b" : "#f4f4f5" }}
        >
          <span
            className="text-xs font-medium mb-0.5"
            style={{ color: subText }}
          >
            AI 生成 · 40 积分
          </span>

          <button
            onClick={() => setShowAiPanel((v) => !v)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors"
            style={{
              background: showAiPanel
                ? dark ? "#312e81" : "#e0e7ff"
                : dark ? "#3f3f46" : "#e4e4e7",
              color: showAiPanel
                ? dark ? "#a5b4fc" : "#4f46e5"
                : textColor,
            }}
          >
            <Sparkles size={14} />
            AI 一键生成
          </button>

          {showAiPanel && (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full text-sm rounded-md px-2 py-1.5 resize-none focus:outline-none"
                rows={4}
                placeholder="输入主题，例如：产品设计流程、机器学习基础..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{
                  background: dark ? "#3f3f46" : "#ffffff",
                  border: `1px solid ${dark ? "#52525b" : "#d4d4d8"}`,
                  color: textColor,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    generateMindMap();
                  }
                }}
              />
              <button
                onClick={generateMindMap}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                style={{
                  background: "#6366f1",
                  color: "#ffffff",
                }}
              >
                {aiLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {aiLoading ? "生成中..." : "生成思维导图"}
              </button>
              <span className="text-xs" style={{ color: subText }}>
                ⌘+Enter 快速生成
              </span>
            </div>
          )}
        </div>

        {/* 视图控制 */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2"
          style={{ background: dark ? "#18181b" : "#f4f4f5" }}
        >
          <span
            className="text-xs font-medium mb-0.5"
            style={{ color: subText }}
          >
            视图控制
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              className="flex-1 flex items-center justify-center gap-1 text-sm px-2 py-1.5 rounded-md"
              style={{ background: dark ? "#3f3f46" : "#e4e4e7", color: textColor }}
              title="放大"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
              className="flex-1 flex items-center justify-center gap-1 text-sm px-2 py-1.5 rounded-md"
              style={{ background: dark ? "#3f3f46" : "#e4e4e7", color: textColor }}
              title="缩小"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={resetView}
              className="flex-1 flex items-center justify-center gap-1 text-sm px-2 py-1.5 rounded-md"
              style={{ background: dark ? "#3f3f46" : "#e4e4e7", color: textColor }}
              title="重置视图"
            >
              <Maximize2 size={14} />
            </button>
          </div>
          <span className="text-xs" style={{ color: subText }}>
            缩放：{Math.round(zoom * 100)}%
          </span>
        </div>

        {/* 操作提示 */}
        <div
          className="rounded-lg p-3 text-xs leading-5"
          style={{ color: subText }}
        >
          <p>• 点击节点选中</p>
          <p>• 双击节点编辑</p>
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
          onWheel={handleWheel}
          style={{ touchAction: "none" }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* 边（连线） */}
            {layoutNodes.map((node) => {
              if (node.collapsed || node.children.length === 0) return null;
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
              const fill = isRoot ? rootFill : nodeFill;
              const stroke = isSelected ? nodeSelectedStroke : nodeStroke;
              const labelColor = isRoot ? "#ffffff" : textColor;

              return (
                <g
                  key={node.id}
                  data-node={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedId(node.id)}
                  onDoubleClick={() => startEdit(node.id, node.label)}
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
                        <ChevronRight
                          size={10}
                          x={-5}
                          y={-5}
                          color={textColor}
                          strokeWidth={2}
                        />
                      ) : (
                        <ChevronDown
                          size={10}
                          x={-5}
                          y={-5}
                          color={textColor}
                          strokeWidth={2}
                        />
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
              <feDropShadow
                dx={0}
                dy={2}
                stdDeviation={4}
                floodColor="#6366f1"
                floodOpacity={0.3}
              />
            </filter>
          </defs>
        </svg>

        {/* 画布空状态提示（新建时） */}
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
