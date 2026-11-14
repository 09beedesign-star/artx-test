/**
 * 画布版式工作台。
 *
 * 视觉与交互刻意自成一套：左侧抽屉 + 卡片栅格 + 底部单元属性抽屉，
 * 图标、命名、按钮文案均与参考站点不同。
 *
 * 与 InfiniteCanvas 之间只走 window 自定义事件，面板本身不持有节点状态：
 *   出：canvas-template-place / -print / -piece-patch / -piece-reference
 *   入：canvas-template-panel-toggle / -close / -selection
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Info,
  LayoutGrid,
  MoveRight,
  Printer,
  Ruler,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  TEMPLATE_BLEED_OPTIONS,
  TEMPLATE_CREDIT_COST,
  TEMPLATE_CREDIT_NOTE,
  TEMPLATE_MATERIALS,
  TEMPLATE_PAPER_GROUPS,
  TEMPLATE_PAPER_PRESETS,
  TEMPLATE_PRINT_NOTE,
  TEMPLATE_RESOLUTIONS,
  buildTemplatePieces,
  filterTemplateLayouts,
  pickTemplateVariant,
  renderPieceSvg,
  renderTemplateSvg,
  resolveTemplateSize,
  svgToDataUrl,
  svgToPngBlob,
  templateBackground,
} from "@/lib/canvas-templates";
import { TEMPLATE_CATALOG } from "@/lib/canvas-template-catalog";
import type { TemplatePiece, TemplateResolution } from "@/lib/canvas-templates";

export const TEMPLATE_PANEL_TOGGLE_EVENT = "canvas-template-panel-toggle";
export const TEMPLATE_PANEL_CLOSE_EVENT = "canvas-template-panel-close";
export const TEMPLATE_SELECTION_EVENT = "canvas-template-selection";
export const TEMPLATE_PLACE_EVENT = "canvas-template-place";
export const TEMPLATE_PRINT_EVENT = "canvas-template-print";
export const TEMPLATE_PIECE_PATCH_EVENT = "canvas-template-piece-patch";
export const TEMPLATE_PIECE_REFERENCE_EVENT = "canvas-template-piece-reference";

export interface TemplateSelectionDetail {
  nodeId: string;
  piece: TemplatePiece;
  frameW: number;
  frameH: number;
  layoutName: string;
}
export interface TemplateActionDetail {
  layoutId: string;
  paperId: string;
  orientation: "portrait" | "landscape";
  resolutionId: string;
  bleedMm: number;
}

function resolveActionResolution(id: string): TemplateResolution {
  return TEMPLATE_RESOLUTIONS.find(r => `${r.kind}-${r.value}` === id) || TEMPLATE_RESOLUTIONS[2];
}
function resolutionId(r: TemplateResolution): string {
  return `${r.kind}-${r.value}`;
}
function toHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read blob failed"));
    reader.readAsDataURL(blob);
  });
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.06em",
  fontWeight: 700,
  textTransform: "uppercase",
};

export function CanvasTemplatePanel({ isDark }: { isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [material, setMaterial] = useState("all");
  const [paperId, setPaperId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [resolution, setResolution] = useState<TemplateResolution>(TEMPLATE_RESOLUTIONS[2]);
  const [bleedMm, setBleedMm] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<TemplateSelectionDetail | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const accent = isDark ? "#7dd3c0" : "#0f766e";
  // 用不透明底色：半透明时画布右下角的小地图会透到面板底部，像一张幽灵卡片
  const bg = isDark ? "rgb(17,24,31)" : "rgb(250,252,251)";
  const panelBorder = isDark ? "rgba(125,211,192,0.22)" : "rgba(15,118,110,0.18)";
  const text = isDark ? "rgba(236,244,242,0.92)" : "rgba(18,38,36,0.9)";
  const muted = isDark ? "rgba(190,208,204,0.58)" : "rgba(28,52,50,0.5)";
  const soft = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,118,110,0.06)";
  const line = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,118,110,0.12)";
  const fieldBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)";

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    const close = () => setOpen(false);
    const onSelection = (e: Event) => {
      const detail = (e as CustomEvent<TemplateSelectionDetail | null>).detail;
      setSelection(detail || null);
      if (detail) setInspectorOpen(true);
    };
    window.addEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
    window.addEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    window.addEventListener(TEMPLATE_SELECTION_EVENT, onSelection);
    return () => {
      window.removeEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
      window.removeEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
      window.removeEventListener(TEMPLATE_SELECTION_EVENT, onSelection);
    };
  }, []);

  const size = useMemo(
    () => resolveTemplateSize({ paperId, orientation, resolution, bleedMm }),
    [paperId, orientation, resolution, bleedMm]
  );
  const rows = useMemo(
    () => filterTemplateLayouts({ category, keyword, material, aspect: size.aspect }),
    [category, keyword, material, size.aspect]
  );
  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const layout of rows) {
      const variant = pickTemplateVariant(layout, size.aspect);
      const pieces = buildTemplatePieces(layout, variant);
      const w = 200;
      const h = Math.max(40, Math.round(w / size.aspect));
      out[layout.i] = svgToDataUrl(
        renderTemplateSvg(pieces, w, h, templateBackground(layout))
      );
    }
    return out;
  }, [rows, size.aspect]);

  const picked = TEMPLATE_CATALOG.layouts.find(l => l.i === pickedId) || null;
  const actionDetail = (layoutId: string): TemplateActionDetail => ({
    layoutId,
    paperId,
    orientation,
    resolutionId: resolutionId(resolution),
    bleedMm,
  });
  const place = (layoutId: string) => {
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_PLACE_EVENT, { detail: actionDetail(layoutId) })
    );
  };
  const print = () => {
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_PRINT_EVENT, {
        detail: actionDetail(pickedId || rows[0]?.i || TEMPLATE_CATALOG.layouts[0].i),
      })
    );
  };
  const patch = (partial: Partial<TemplatePiece>) => {
    if (!selection) return;
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_PIECE_PATCH_EVENT, {
        detail: { nodeId: selection.nodeId, patch: partial },
      })
    );
    setSelection({ ...selection, piece: { ...selection.piece, ...partial } });
  };

  const pieceBlob = async () => {
    if (!selection) return null;
    const { piece, frameW, frameH } = selection;
    const w = Math.max(1, Math.round(piece.w * frameW));
    const h = Math.max(1, Math.round(piece.h * frameH));
    const svg = renderPieceSvg(piece, frameW, frameH);
    return await svgToPngBlob(svg, Math.min(w, 4000), Math.min(h, 4000));
  };
  const downloadPiece = async () => {
    const blob = await pieceBlob();
    if (!blob) {
      toast.error("这个单元暂时无法导出");
      return;
    }
    saveBlob(blob, `${selection?.piece.name || "版式单元"}.png`);
    toast.success("单元已下载（0 积分）");
  };
  const copyPiece = async () => {
    const blob = await pieceBlob();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("单元已复制，可直接粘贴");
    } catch {
      toast.error("浏览器拒绝了剪贴板写入，请改用下载");
    }
  };
  const referencePiece = async () => {
    if (!selection) return;
    const blob = await pieceBlob();
    if (!blob) return;
    const { piece, frameW, frameH, nodeId } = selection;
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_PIECE_REFERENCE_EVENT, {
        detail: {
          id: nodeId,
          title: piece.name,
          src: await blobToDataUrl(blob),
          width: Math.round(piece.w * frameW),
          height: Math.round(piece.h * frameH),
        },
      })
    );
    toast.success("已加入生图提示词的参考图");
  };

  const inspectorNode = selection ? (
<div
          style={{
            position: "fixed", left: 384, top: 92, width: 292,
            maxHeight: "calc(100vh - 124px)", overflowY: "auto",
            borderRadius: 16, border: `1px solid ${panelBorder}`, background: bg,
            boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(15,60,55,0.18)",
            backdropFilter: "blur(20px)", zIndex: 115, color: text, padding: 12,
          }}
          onMouseDown={e => e.stopPropagation()}
          data-canvas-template-inspector=""
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <SlidersHorizontal size={15} color={accent} />
            <b style={{ fontSize: 13, flex: 1 }}>单元属性</b>
            <button onClick={() => setInspectorOpen(v => !v)} style={iconButton(soft, text)}>
              {inspectorOpen ? <Check size={13} /> : <X size={13} />}
            </button>
          </div>
          {inspectorOpen && (
            <TemplatePieceInspector
              detail={selection}
              isDark={isDark}
              onPatch={patch}
              onDownload={downloadPiece}
              onCopy={copyPiece}
              onReference={referencePiece}
            />
          )}
        </div>
  ) : null;

  // 面板收起时属性抽屉仍要常驻：选中子单元就能改属性
  if (!open) return inspectorNode;

  return (
    <div
      className="nodrag nopan"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 92,
        left: 16,
        width: 356,
        maxHeight: "calc(100vh - 124px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 18,
        border: `1px solid ${panelBorder}`,
        background: bg,
        boxShadow: isDark
          ? "0 24px 70px rgba(0,0,0,0.55)"
          : "0 24px 70px rgba(15,60,55,0.18)",
        backdropFilter: "blur(20px)",
        zIndex: 115,
        overflow: "hidden",
        color: text,
      }}
      data-canvas-template-panel=""
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 8px" }}>
        <LayoutGrid size={17} color={accent} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.02em" }}>版式工作台</div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>挑一套骨架，再逐格替换内容</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{ background: soft, border: "none", borderRadius: 8, width: 26, height: 26, cursor: "pointer", color: text, display: "grid", placeItems: "center" }}
          aria-label="收起版式工作台"
        >
          <X size={14} />
        </button>
      </div>

      {/* 搜索 */}
      <div style={{ flexShrink: 0, padding: "4px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: fieldBg, border: `1px solid ${line}`, borderRadius: 10, padding: "7px 10px" }}>
          <Search size={14} color={muted} />
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="找版式名称、编号或说明"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: text, fontSize: 12 }}
          />
          {keyword && <button onClick={() => setKeyword("")} style={{ border: "none", background: "transparent", color: muted, cursor: "pointer" }}><X size={12} /></button>}
        </div>
      </div>

      {/* 分类 */}
      <div style={{ flexShrink: 0, display: "flex", gap: 6, overflowX: "auto", padding: "0 14px 10px", scrollbarWidth: "thin" }}>
        {["all", ...TEMPLATE_CATALOG.categories].map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              flexShrink: 0, border: `1px solid ${category === cat ? accent : line}`,
              background: category === cat ? accent : soft,
              color: category === cat ? (isDark ? "#0b1a18" : "#ffffff") : text,
              borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {cat === "all" ? "全部" : cat}
          </button>
        ))}
      </div>

      {/* 输出参数 */}
      <div style={{ flexShrink: 0, padding: "0 14px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8 }}>
          <Ruler size={13} color={accent} />
          <span style={{ ...sectionLabel, color: muted }}>纸张与输出参数</span>
        </label>
        <select
          value={paperId}
          onChange={e => setPaperId(e.target.value)}
          style={{ gridColumn: "span 2", ...selectStyle(fieldBg, line, text) }}
        >
          {TEMPLATE_PAPER_GROUPS.map(group => (
            <optgroup key={group} label={group}>
              {TEMPLATE_PAPER_PRESETS.filter(p => p.group === group).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={resolutionId(resolution)} onChange={e => setResolution(resolveActionResolution(e.target.value))} style={selectStyle(fieldBg, line, text)}>
          {TEMPLATE_RESOLUTIONS.map(r => <option key={resolutionId(r)} value={resolutionId(r)}>{r.label}</option>)}
        </select>
        <select value={bleedMm} onChange={e => setBleedMm(Number(e.target.value))} style={selectStyle(fieldBg, line, text)}>
          {TEMPLATE_BLEED_OPTIONS.map(b => <option key={b} value={b}>{b === 0 ? "无出血" : `出血 ${b} mm`}</option>)}
        </select>
        <select value={orientation} onChange={e => setOrientation(e.target.value as "portrait" | "landscape")} style={selectStyle(fieldBg, line, text)}>
          <option value="portrait">竖向</option>
          <option value="landscape">横向</option>
        </select>
        <select value={material} onChange={e => setMaterial(e.target.value)} style={selectStyle(fieldBg, line, text)}>
          {TEMPLATE_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div style={{ gridColumn: "span 2", fontSize: 11, color: muted }}>
          画布 {size.display.width}×{size.display.height} · 输出 {size.print.width}×{size.print.height} px
          {size.clamped ? " · 已按浏览器上限等比缩放" : ""}
        </div>
      </div>

      {/* 版式卡片 */}
      <div style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: "0 14px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0 8px" }}>
          <span style={{ ...sectionLabel, color: muted }}>可用版式</span>
          <span style={{ fontSize: 11, color: muted }}>{rows.length} 套</span>
        </div>
        {rows.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", color: muted, fontSize: 12 }}>
            没有对得上的版式，换个词或放宽尺寸试试
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {rows.map(layout => (
            <button
              key={layout.i}
              onClick={() => setPickedId(layout.i)}
              onDoubleClick={() => place(layout.i)}
              style={{
                textAlign: "left", padding: 7, borderRadius: 12, cursor: "pointer",
                border: `1px solid ${pickedId === layout.i ? accent : line}`,
                background: pickedId === layout.i ? soft : "transparent",
                color: text,
              }}
            >
              <div style={{ borderRadius: 8, overflow: "hidden", background: "#fff", aspectRatio: String(size.aspect), display: "grid", placeItems: "center" }}>
                <img src={thumbs[layout.i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {layout.n}
              </div>
              <div style={{ fontSize: 10, color: muted, marginTop: 1 }}>{layout.c}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 底部操作 + 积分说明 */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${line}`, padding: "10px 14px 12px", background: soft }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => pickedId && place(pickedId)}
            disabled={!pickedId}
            style={primaryButton(accent, !pickedId)}
          >
            <MoveRight size={14} /> 放到画布右侧 <ArrowRight size={13} />
          </button>
          <button onClick={print} style={ghostButton(line, text)} title="按当前纸张与分辨率导出">
            <Printer size={14} /> 输出
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 9, fontSize: 11, color: muted, lineHeight: 1.5 }}>
          <Info size={13} color={accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b style={{ color: accent }}>打印不消耗积分（{TEMPLATE_CREDIT_COST} 积分）</b>。
            {TEMPLATE_PRINT_NOTE.replace("打印不消耗积分（0 积分），仅", "仅")}
            <br />{TEMPLATE_CREDIT_NOTE}
          </span>
        </div>
      </div>

      {inspectorNode}
    </div>
  );
}

function TemplatePieceInspector({
  detail, isDark, onPatch, onDownload, onCopy, onReference,
}: {
  detail: TemplateSelectionDetail;
  isDark: boolean;
  onPatch: (partial: Partial<TemplatePiece>) => void;
  onDownload: () => void;
  onCopy: () => void;
  onReference: () => void;
}) {
  const { piece } = detail;
  const text = isDark ? "rgba(236,244,242,0.92)" : "rgba(18,38,36,0.9)";
  const muted = isDark ? "rgba(190,208,204,0.58)" : "rgba(28,52,50,0.5)";
  const line = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,118,110,0.12)";
  const fieldBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)";
  const accent = isDark ? "#7dd3c0" : "#0f766e";
  const isText = piece.kind === "text" || piece.kind === "placeholder";
  const isShape = piece.kind === "rect" || piece.kind === "ellipse" || piece.kind === "path" || piece.kind === "dots";
  const field = { ...selectStyle(fieldBg, line, text), padding: "5px 7px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontSize: 11, color: muted }}>
        {detail.layoutName} / {piece.role}
      </div>
      <input
        value={piece.name}
        onChange={e => onPatch({ name: e.target.value })}
        style={{ ...field, fontWeight: 700 }}
      />
      {isText && (
        <>
          <label style={labelStyle(muted)}>文案</label>
          <textarea
            value={piece.text || ""}
            onChange={e => onPatch({ text: e.target.value })}
            rows={3}
            style={{ ...field, resize: "vertical", lineHeight: 1.45 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <NumField label="字号 %" value={(piece.sizeRatio || 0) * 100} step={0.1} onChange={v => onPatch({ sizeRatio: v / 100 })} field={field} muted={muted} />
            <NumField label="字重" value={piece.fontWeight || 500} step={100} onChange={v => onPatch({ fontWeight: v })} field={field} muted={muted} />
            <NumField label="行距" value={piece.lineHeight || 1.12} step={0.05} onChange={v => onPatch({ lineHeight: v })} field={field} muted={muted} />
            <NumField label="字距 ‰" value={(piece.trackingRatio || 0) * 1000} step={1} onChange={v => onPatch({ trackingRatio: v / 1000 })} field={field} muted={muted} />
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <ColorField label="字色" value={toHex(piece.color, "#121212")} onChange={v => onPatch({ color: v })} muted={muted} />
            <select value={piece.textAlign || "left"} onChange={e => onPatch({ textAlign: e.target.value as TemplatePiece["textAlign"] })} style={{ ...field, flex: 1 }}>
              <option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option>
            </select>
          </div>
        </>
      )}
      {isShape && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <ColorField label="填充" value={toHex(piece.fill === "none" ? undefined : piece.fill, "#dddddd")} onChange={v => onPatch({ fill: v })} muted={muted} />
            <ColorField label="描边" value={toHex(piece.stroke, "#121212")} onChange={v => onPatch({ stroke: v })} muted={muted} />
            <NumField label="线宽 ‰" value={(piece.strokeRatio || 0) * 1000} step={0.5} onChange={v => onPatch({ strokeRatio: v / 1000 })} field={field} muted={muted} />
            <NumField label="旋转 °" value={piece.rotation || 0} step={1} onChange={v => onPatch({ rotation: v })} field={field} muted={muted} />
          </div>
        </>
      )}
      <label style={labelStyle(muted)}>不透明度 {(Math.round((piece.opacity ?? 1) * 100))}%</label>
      <input
        type="range" min={0} max={100} value={Math.round((piece.opacity ?? 1) * 100)}
        onChange={e => onPatch({ opacity: Number(e.target.value) / 100 })}
        style={{ width: "100%", accentColor: accent }}
      />
      <label style={labelStyle(muted)}>位置与尺寸（相对画板）</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        {(["x", "y", "w", "h"] as const).map(key => (
          <NumField key={key} label={key.toUpperCase()} value={piece[key]} step={0.005} onChange={v => onPatch({ [key]: Math.max(key === "w" || key === "h" ? 0.001 : 0, v) })} field={field} muted={muted} />
        ))}
      </div>
      <div style={{ height: 1, background: line, margin: "2px 0" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        <button onClick={onDownload} style={ghostButton(line, text)}><Download size={13} /> 下载 PNG</button>
        <button onClick={onCopy} style={ghostButton(line, text)}><Copy size={13} /> 复制单元</button>
      </div>
      <button onClick={onReference} style={primaryButton(accent, false)}>
        <Sparkles size={14} /> 引用到节日提示词
      </button>
      <div style={{ fontSize: 10, color: muted, lineHeight: 1.5 }}>
        以上操作与打印均为 {TEMPLATE_CREDIT_COST} 积分；引用后可作为生图的参考图参与提示词。
      </div>
    </div>
  );
}

function labelStyle(muted: string): React.CSSProperties {
  return { fontSize: 10, color: muted, marginTop: 2 };
}
function selectStyle(bg: string, line: string, color: string): React.CSSProperties {
  return {
    border: `1px solid ${line}`, background: bg, color,
    borderRadius: 8, padding: "6px 8px", fontSize: 11, outline: "none", width: "100%",
  };
}
function primaryButton(accent: string, disabled: boolean): React.CSSProperties {
  return {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    border: "none", borderRadius: 10, padding: "9px 10px", fontSize: 12, fontWeight: 700,
    background: accent, color: "#ffffff", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap",
  };
}
function ghostButton(line: string, color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    border: `1px solid ${line}`, borderRadius: 10, padding: "9px 10px", fontSize: 12,
    fontWeight: 600, background: "transparent", color, cursor: "pointer", whiteSpace: "nowrap",
  };
}
function iconButton(bg: string, color: string): React.CSSProperties {
  return { border: "none", background: bg, color, borderRadius: 7, width: 24, height: 24, display: "grid", placeItems: "center", cursor: "pointer" };
}
function NumField({ label, value, step, onChange, field, muted }: {
  label: string; value: number; step: number;
  onChange: (v: number) => void; field: React.CSSProperties; muted: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: muted }}>{label}</span>
      <input
        type="number" step={step} value={Math.round(value * 1000) / 1000}
        onChange={e => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        style={{ ...field, width: "100%" }}
      />
    </label>
  );
}
function ColorField({ label, value, onChange, muted }: {
  label: string; value: string; onChange: (v: string) => void; muted: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
      <span style={{ fontSize: 10, color: muted }}>{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", height: 28, border: "none", background: "transparent", cursor: "pointer" }} />
    </label>
  );
}
