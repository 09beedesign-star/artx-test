/**
 * 版式子单元的动作与命令 —— 悬浮命令条 / 属性编辑面板 / 画布共用的唯一事实源。
 *
 * 🔒 2026-11-14：面板与画布之间只走 window 事件；下载 / 复制 / 参考图 / 全部
 *    属性命令都收口在这里，避免「两个出口各写一套」（项目里踩过十四次）。
 * ⚠️ 打印参数不在这里：纸张 / DPI / 出血 / 分辨率已全部归到画布打印工具。
 */
import { toast } from "sonner";
import {
  alignPiece,
  renderPieceSvg,
  repeatPieceGrid,
  svgToPngBlob,
  type TemplatePiece,
  type TemplatePieceCommand,
} from "./canvas-templates";

export const TEMPLATE_PIECE_COMMAND_EVENT = "canvas-template-piece-command";

export interface TemplateSelectionDetail {
  nodeId: string;
  piece: TemplatePiece;
  frameW: number;
  frameH: number;
  layoutName: string;
}

export interface PieceCommandPayload {
  nodeId: string;
  command: TemplatePieceCommand;
  args?: { cols?: number; rows?: number };
}

/** 同画板内参与布尔运算的兄弟单元。 */
export interface PieceSibling {
  nodeId: string;
  piece: TemplatePiece;
}

export interface PieceCommandResult {
  patches: Array<{ nodeId: string; patch: Partial<TemplatePiece> }>;
  additions: TemplatePiece[];
  removals: string[];
  message: string;
  mode?: "create-text" | "import-image" | null;
}

export const ALIGN_COMMANDS: Array<{ id: TemplatePieceCommand; label: string; glyph: string }> = [
  { id: "align-left", label: "左对齐", glyph: "⇤" },
  { id: "align-hcenter", label: "水平居中", glyph: "⇹" },
  { id: "align-right", label: "右对齐", glyph: "⇥" },
  { id: "align-top", label: "上对齐", glyph: "⤒" },
  { id: "align-vcenter", label: "垂直居中", glyph: "↕" },
  { id: "align-bottom", label: "下对齐", glyph: "⤓" },
  { id: "distribute", label: "居中分布", glyph: "⇔" },
];

export const BOOLEAN_COMMANDS: Array<{ id: TemplatePieceCommand; label: string; glyph: string }> = [
  { id: "boolean-union", label: "合并形状", glyph: "⊎" },
  { id: "boolean-subtract", label: "减去顶层", glyph: "⊟" },
  { id: "boolean-intersect", label: "相交区域", glyph: "⊓" },
  { id: "boolean-exclude", label: "排除重叠", glyph: "⊻" },
];

export const MORE_COMMANDS: Array<{ id: TemplatePieceCommand; label: string }> = [
  { id: "3d-extrude", label: "3D立体处理" },
  { id: "3d-path", label: "沿路径3D立体处理" },
  { id: "3d-rotate", label: "空间 3D 旋转" },
  { id: "path-text", label: "沿路径文字" },
];

export const BLEND_MODES = [
  "穿透", "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "difference", "exclusion", "hue", "saturation", "luminosity",
];
export const STROKE_JOINS: Array<{ id: NonNullable<TemplatePiece["strokeJoin"]>; label: string }> = [
  { id: "miter", label: "尖角" }, { id: "round", label: "圆角" }, { id: "bevel", label: "斜角" },
];
export const STROKE_ALIGNS: Array<{ id: NonNullable<TemplatePiece["strokeAlign"]>; label: string }> = [
  { id: "inside", label: "内侧" }, { id: "center", label: "居中" }, { id: "outside", label: "外侧" },
];

/** 单元 → PNG Blob（下载 / 复制 / 参考图共用，保证三处拿到的是同一张图）。 */
export async function pieceToPngBlob(detail: TemplateSelectionDetail): Promise<Blob | null> {
  const { piece, frameW, frameH } = detail;
  const w = Math.max(1, Math.round(piece.w * frameW));
  const h = Math.max(1, Math.round(piece.h * frameH));
  const svg = renderPieceSvg(piece, frameW, frameH);
  return await svgToPngBlob(svg, Math.min(w, 4000), Math.min(h, 4000));
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadPiece(detail: TemplateSelectionDetail): Promise<void> {
  const blob = await pieceToPngBlob(detail);
  if (!blob) { toast.error("这个单元暂时无法导出"); return; }
  saveBlob(blob, `${detail.piece.name || "版式单元"}.png`);
  toast.success("单元已下载（0 积分）");
}

export async function copyPiece(detail: TemplateSelectionDetail): Promise<void> {
  const blob = await pieceToPngBlob(detail);
  if (!blob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast.success("单元已复制，可直接粘贴");
  } catch {
    toast.error("浏览器拒绝了剪贴板写入，请改用下载");
  }
}

export async function referencePiece(detail: TemplateSelectionDetail): Promise<void> {
  const blob = await pieceToPngBlob(detail);
  if (!blob) return;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read blob failed"));
    reader.readAsDataURL(blob);
  });
  window.dispatchEvent(new CustomEvent("canvas-template-piece-reference", {
    detail: {
      id: detail.nodeId,
      title: detail.piece.name,
      src: dataUrl,
      width: Math.round(detail.piece.w * detail.frameW),
      height: Math.round(detail.piece.h * detail.frameH),
    },
  }));
  toast.success("已加入生图提示词的参考图");
}

const DEFAULT_PATH = "M0 0.5 C0.25 0 0.75 1 1 0.5";

/**
 * 执行一条命令。纯函数：只算「要改什么 / 加什么 / 删什么」，由画布统一写回节点。
 * ⚠️ 不在这里直接 setNodes —— 画布才是节点状态的唯一持有者。
 */
export function runPieceCommand(
  detail: TemplateSelectionDetail,
  command: TemplatePieceCommand,
  siblings: PieceSibling[] = [],
  args: { cols?: number; rows?: number } = {},
): PieceCommandResult {
  const { piece, nodeId } = detail;
  const result: PieceCommandResult = { patches: [], additions: [], removals: [], message: "" };
  const patch = (p: Partial<TemplatePiece>, msg: string, target = nodeId) => {
    result.patches.push({ nodeId: target, patch: p });
    result.message = msg;
  };

  if (command.startsWith("align-") || command === "distribute") {
    patch(alignPiece(piece, command), "已对齐");
    return result;
  }
  switch (command) {
    case "repeat-grid": {
      const cols = args.cols ?? 3;
      const rows = args.rows ?? 2;
      const clones = repeatPieceGrid(piece, cols, rows);
      result.additions = clones;
      patch({ w: clones[0]?.w ?? piece.w, h: clones[0]?.h ?? piece.h, repeatGrid: { cols, rows } },
        `已生成 ${cols}×${rows} 重复网格（新增 ${clones.length} 个单元）`);
      return result;
    }
    case "boolean-union":
    case "boolean-subtract":
    case "boolean-intersect":
    case "boolean-exclude": {
      const mode = command.replace("boolean-", "") as "union" | "subtract" | "intersect" | "exclude";
      const partner = siblings.find(s =>
        s.nodeId !== nodeId &&
        (s.piece.kind === "rect" || s.piece.kind === "ellipse" || s.piece.kind === "path")
      );
      if (!partner) {
        result.message = "布尔运算需要同画板内另一个图形单元";
        return result;
      }
      // 参与形状烘进当前单元，渲染用 SVG mask / clipPath 合成，不依赖几何引擎。
      patch({
        composite: { mode, shapes: [partner.piece] },
        name: `${piece.name} · ${BOOLEAN_COMMANDS.find(b => b.id === command)?.label || "布尔"}`,
      }, `已完成${BOOLEAN_COMMANDS.find(b => b.id === command)?.label || "布尔运算"}`);
      result.removals = [partner.nodeId];
      return result;
    }
    case "3d-extrude":
      patch({ rotateX: -12, rotateY: 14, depth: 24 }, "已应用 3D 立体处理");
      return result;
    case "3d-path":
      patch({ pathText: true, path: piece.path || DEFAULT_PATH, rotateX: -10, rotateY: 18, depth: 18 }, "已应用沿路径 3D 立体处理");
      return result;
    case "3d-rotate":
      patch({ rotateX: 18, rotateY: -22, depth: 12 }, "已应用空间 3D 旋转");
      return result;
    case "path-text":
      patch({ pathText: !(piece.pathText), path: piece.path || DEFAULT_PATH }, piece.pathText ? "已取消沿路径文字" : "已应用沿路径文字");
      return result;
    case "clip-mask":
      patch({ clipMask: !piece.clipMask }, piece.clipMask ? "已取消剪切蒙版" : "已应用剪切蒙版");
      return result;
    case "flip-x":
      patch({ flipX: !piece.flipX }, "已水平翻转");
      return result;
    case "flip-y":
      patch({ flipY: !piece.flipY }, "已垂直翻转");
      return result;
    case "reset-rotation":
      patch({ rotation: 0, rotateX: 0, rotateY: 0, depth: 0 }, "已重置旋转");
      return result;
    case "toggle-lock":
      patch({ locked: !piece.locked }, piece.locked ? "已解锁" : "已锁定");
      return result;
    case "bring-front":
      patch({ order: Math.max(...siblings.map(s => s.piece.order), piece.order) + 1 }, "已移到最上层");
      return result;
    case "send-back":
      patch({ order: Math.min(...siblings.map(s => s.piece.order), piece.order) - 1 }, "已移到最下层");
      return result;
    case "create-text":
      result.mode = "create-text";
      result.message = "已激活文字创建模式，请点击模板区域创建文字";
      return result;
    case "import-image":
      result.mode = "import-image";
      result.message = "已激活图片导入模式，请选择图片";
      return result;
    default:
      result.message = "未知命令";
      return result;
  }
}
