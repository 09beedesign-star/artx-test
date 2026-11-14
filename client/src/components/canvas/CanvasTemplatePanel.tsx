/**
 * 画布「模板」面板 —— 版式选择与导入画布。
 *
 * 🔒 2026-11-14 用户要求：
 *   - UI 按参考截图：标题「模板」+ X、搜索全部模板、模板总数、两列缩略图卡片
 *     （名称 + 「N 个容器 · 类别」），配色统一为站点黑白风；
 *   - **纸张、DPI、方向等一切打印输出参数一律不在这里**，
 *     它们已经全部归到画布右上角的打印工具（CanvasPrintPanel）；
 *   - 本面板只提供两件事：挑版式、导入到画布。
 *
 * ⚠️ 与 InfiniteCanvas 只走 window 事件，面板不持有节点状态。
 *   属性编辑 / 选中悬浮命令条是独立组件（TemplatePiecePropertiesPanel /
 *   TemplatePieceFloatingToolbar），不要在这里再加第二个出口。
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  buildTemplatePieces,
  pickTemplateVariant,
  renderTemplateSvg,
  svgToDataUrl,
  templateBackground,
} from "@/lib/canvas-templates";
import { TEMPLATE_CATALOG } from "@/lib/canvas-template-catalog";
import type { TemplateLayoutData } from "@/lib/canvas-template-types";

export const TEMPLATE_PANEL_TOGGLE_EVENT = "canvas-template-panel-toggle";
export const TEMPLATE_PANEL_CLOSE_EVENT = "canvas-template-panel-close";
export const TEMPLATE_SELECTION_EVENT = "canvas-template-selection";
export const TEMPLATE_PLACE_EVENT = "canvas-template-place";
export const TEMPLATE_PRINT_EVENT = "canvas-template-print";
export const TEMPLATE_PIECE_PATCH_EVENT = "canvas-template-piece-patch";
export const TEMPLATE_PIECE_REFERENCE_EVENT = "canvas-template-piece-reference";
/** 悬浮命令条 → 打开属性编辑面板 */
export const TEMPLATE_PROPERTIES_OPEN_EVENT = "canvas-template-properties-open";

export interface TemplateSelectionDetail {
  nodeId: string;
  piece: import("@/lib/canvas-templates").TemplatePiece;
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

/** 预览统一用横向卡片（与参考截图一致），容器数是真实生成的子单元数。 */
const THUMB_W = 240;
const THUMB_H = 140;

function layoutThumb(layout: TemplateLayoutData): { src: string; containers: number } {
  const aspect = THUMB_W / THUMB_H;
  const variant = pickTemplateVariant(layout, aspect);
  const pieces = buildTemplatePieces(layout, variant);
  return {
    src: svgToDataUrl(renderTemplateSvg(pieces, THUMB_W, THUMB_H, templateBackground(layout))),
    containers: pieces.length,
  };
}

export function CanvasTemplatePanel({ isDark }: { isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  // 黑白风：与打印面板 / 站点其余面板同一套色值，不再用 teal 渐变。
  const bg = isDark ? "#161616" : "#ffffff";
  const text = isDark ? "#f4f4f4" : "#161616";
  const muted = isDark ? "rgba(255,255,255,0.52)" : "rgba(22,22,22,0.5)";
  const line = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,22,0.1)";
  const field = isDark ? "rgba(255,255,255,0.06)" : "#f5f5f5";

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    const close = () => setOpen(false);
    window.addEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
    window.addEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    return () => {
      window.removeEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
      window.removeEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    };
  }, []);

  // 直接按名称 / 分类 / 说明过滤，不再受纸张宽高比限制（否则默认只显示一部分）。
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return TEMPLATE_CATALOG.layouts.filter(layout =>
      !kw || [layout.n, layout.c, layout.d, layout.h, layout.i].join(" ").toLowerCase().includes(kw)
    );
  }, [keyword]);

  const thumbs = useMemo(() => {
    const out: Record<string, { src: string; containers: number }> = {};
    for (const layout of rows) out[layout.i] = layoutThumb(layout);
    return out;
  }, [rows]);

  /**
   * 导入画布。payload 仍带固定的输出默认值 —— InfiniteCanvas 用它们计算画板尺寸，
   * 但 UI 不再暴露这些参数；真正的打印参数在画布右上角的打印工具里调。
   */
  const place = (layoutId: string) => {
    window.dispatchEvent(new CustomEvent(TEMPLATE_PLACE_EVENT, {
      detail: {
        layoutId,
        paperId: "a4",
        orientation: "portrait",
        resolutionId: "dpi-300", // 固定 300 DPI；InfiniteCanvas 按 `${kind}-${value}` 解析
        bleedMm: 0,
      } satisfies TemplateActionDetail,
    }));
    toast.success("已放到画布右侧");
  };

  if (!open) return null;

  return (
    <div
      className="nodrag nopan"
      data-canvas-template-panel=""
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top: 92, left: 16, width: 420,
        maxHeight: "calc(100vh - 124px)",
        display: "flex", flexDirection: "column",
        borderRadius: 16, border: `1px solid ${line}`, background: bg,
        boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(0,0,0,0.14)",
        zIndex: 115, overflow: "hidden", color: text,
      }}
    >
      {/* 标题：模板 + X */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 22px 14px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>模板</h2>
        <button
          type="button" onClick={() => setOpen(false)} aria-label="关闭模板面板"
          style={{ border: "none", background: "transparent", color: text, cursor: "pointer", display: "grid", placeItems: "center", width: 28, height: 28 }}
        >
          <X size={22} />
        </button>
      </div>

      {/* 搜索全部模板 */}
      <div style={{ flexShrink: 0, padding: "0 22px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: field, border: `1px solid ${line}`, borderRadius: 14, padding: "13px 16px" }}>
          <Search size={17} color={muted} />
          <input
            data-artx-template-search=""
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜索全部模板"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: text, fontSize: 14 }}
          />
          {keyword && (
            <button type="button" onClick={() => setKeyword("")} aria-label="清空搜索" style={{ border: "none", background: "transparent", color: muted, cursor: "pointer" }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: "0 22px 12px", fontSize: 13, color: muted }} data-artx-template-count="">
        {rows.length} 个模板
      </div>

      {/* 两列模板卡片（缩略图 + 名称 + 容器数 · 类别） */}
      <div style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: "0 22px 18px" }}>
        {rows.length === 0 && (
          <div style={{ textAlign: "center", padding: "36px 0", color: muted, fontSize: 13 }}>没有匹配的模板，换个关键词试试</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {rows.map(layout => {
            const thumb = thumbs[layout.i];
            const active = pickedId === layout.i;
            return (
              <button
                key={layout.i}
                type="button"
                data-artx-template-card={layout.i}
                aria-pressed={active}
                onClick={() => setPickedId(layout.i)}
                onDoubleClick={() => place(layout.i)}
                style={{
                  textAlign: "left", padding: 0, border: "none", background: "transparent",
                  color: text, cursor: "pointer", minWidth: 0,
                }}
              >
                <div style={{
                  aspectRatio: "1.71", borderRadius: 12, overflow: "hidden", background: isDark ? "#202020" : "#f6f6f6",
                  border: `2px solid ${active ? text : "transparent"}`, display: "grid", placeItems: "center",
                }}>
                  <img src={thumb?.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 650, marginTop: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {layout.n}
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>
                  {thumb?.containers ?? 0} 个容器 · {layout.c}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 唯一动作：导入到画布 */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${line}`, padding: "14px 22px 18px" }}>
        <button
          type="button"
          data-artx-template-import=""
          disabled={!pickedId}
          onClick={() => pickedId && place(pickedId)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 13.5, fontWeight: 650,
            background: text, color: bg, cursor: pickedId ? "pointer" : "not-allowed", opacity: pickedId ? 1 : 0.45,
          }}
        >
          导入到画布 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
