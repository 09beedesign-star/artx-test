/**
 * 画布「模板」面板（版式工作台）—— 分类选择 tab + 对应分类内容平铺。
 *
 * 分类来源：Figma「100+ Page Layout Collection」Layout 页，每一排最左侧黑色封面 = 一个分类，
 * 同排其余 frame 全部归入（数据见 canvas-figma-layouts.data.json，7 类 103 个）。
 * 最后保留一个「本地模板」tab（老目录）。
 *
 * 🔒 交互说明：
 *   - 单击卡片 = 选中；点底部「加载到画布」或双击卡片 = 放进画布
 *   - 放置仍走 TEMPLATE_PLACE_EVENT，不消耗积分
 *   - 与 InfiniteCanvas 只走 window 事件，面板不持有节点状态
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  buildFigmaTemplatePieces,
  buildTemplatePieces,
  pickTemplateVariant,
  renderTemplateSvg,
  svgToDataUrl,
  templateBackground,
} from "@/lib/canvas-templates";
import { TEMPLATE_CATALOG } from "@/lib/canvas-template-catalog";
import { FIGMA_LAYOUT_CATEGORIES, type FigmaLayout } from "@/lib/canvas-figma-layouts";
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

/** 面板里一张卡片需要的全部信息（Figma 版式与老目录统一成这一种形状） */
interface CardRow {
  i: string;
  n: string;
  /** 副标题：分类名 / 老目录分类 */
  c: string;
  /** 卡片宽高比（w/h） */
  aspect: number;
  paperId: string;
  orientation: "portrait" | "landscape";
  thumb: () => { src: string; containers: number };
}

const LOCAL_TAB = "local";
const THUMB_LONG = 320;

function figmaThumb(layout: FigmaLayout): { src: string; containers: number } {
  const k = THUMB_LONG / Math.max(layout.w, layout.h);
  const w = Math.round(layout.w * k);
  const h = Math.round(layout.h * k);
  const pieces = buildFigmaTemplatePieces(layout);
  return { src: svgToDataUrl(renderTemplateSvg(pieces, w, h, layout.bg)), containers: pieces.length };
}

function localThumb(layout: TemplateLayoutData): { src: string; containers: number } {
  const w = 240, h = 140;
  const variant = pickTemplateVariant(layout, w / h);
  const pieces = buildTemplatePieces(layout, variant, w / h);
  return { src: svgToDataUrl(renderTemplateSvg(pieces, w, h, templateBackground(layout))), containers: pieces.length };
}

const FIGMA_ROWS: Record<string, CardRow[]> = Object.fromEntries(
  FIGMA_LAYOUT_CATEGORIES.map(category => [
    category.id,
    category.layouts.map<CardRow>(layout => ({
      i: layout.i,
      n: layout.n,
      c: category.name,
      aspect: layout.w / Math.max(1, layout.h),
      paperId: category.paper,
      orientation: category.orientation,
      thumb: () => figmaThumb(layout),
    })),
  ]),
);

const LOCAL_ROWS: CardRow[] = TEMPLATE_CATALOG.layouts.map(layout => ({
  i: layout.i,
  n: layout.n,
  c: layout.c,
  aspect: 240 / 140,
  paperId: "a4",
  orientation: "portrait",
  thumb: () => localThumb(layout),
}));

const ALL_ROWS: CardRow[] = [...Object.values(FIGMA_ROWS).flat(), ...LOCAL_ROWS];

/** 每张缩略图只渲染一次（103 张 SVG，切 tab 不重算） */
const THUMB_CACHE = new Map<string, { src: string; containers: number }>();
function thumbOf(row: CardRow) {
  let hit = THUMB_CACHE.get(row.i);
  if (!hit) { hit = row.thumb(); THUMB_CACHE.set(row.i, hit); }
  return hit;
}

const TABS: { id: string; label: string; count: number }[] = [
  ...FIGMA_LAYOUT_CATEGORIES.map(c => ({ id: c.id, label: c.name, count: c.layouts.length })),
  { id: LOCAL_TAB, label: "本地模板", count: LOCAL_ROWS.length },
];

export function CanvasTemplatePanel({ isDark }: { isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>(TABS[0]?.id ?? LOCAL_TAB);
  const [keyword, setKeyword] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  // ── 颜色系统（黑白） ────────────────────────────────────────────────────
  const bg   = isDark ? "#0d0d0d" : "#f0f0f0";
  const text = isDark ? "#f4f4f4" : "#161616";
  const muted = isDark ? "rgba(255,255,255,0.52)" : "rgba(22,22,22,0.5)";
  const line = isDark ? "rgba(255,255,255,0.10)" : "rgba(22,22,22,0.1)";
  const field = isDark ? "rgba(255,255,255,0.05)" : "#e8e8e8";
  const tabActiveBg = isDark ? "#f4f4f4" : "#161616";
  const tabActiveText = isDark ? "#161616" : "#ffffff";

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    const close  = () => setOpen(false);
    window.addEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
    window.addEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    return () => {
      window.removeEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
      window.removeEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    };
  }, []);

  /** 有关键词 = 跨全部分类搜；否则只平铺当前分类 */
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (kw) return ALL_ROWS.filter(layout => [layout.n, layout.c, layout.i].join(" ").toLowerCase().includes(kw));
    return tab === LOCAL_TAB ? LOCAL_ROWS : (FIGMA_ROWS[tab] ?? []);
  }, [keyword, tab]);

  const picked = useMemo(() => ALL_ROWS.find(r => r.i === pickedId) ?? null, [pickedId]);

  const place = (layoutId: string) => {
    const row = ALL_ROWS.find(r => r.i === layoutId);
    window.dispatchEvent(new CustomEvent(TEMPLATE_PLACE_EVENT, {
      detail: {
        layoutId,
        paperId: row?.paperId ?? "a4",
        orientation: row?.orientation ?? "portrait",
        resolutionId: "dpi-300",
        bleedMm: 0,
      } satisfies TemplateActionDetail,
    }));
    toast.success("模板已加载到画布");
  };

  if (!open) return null;

  return (
    <div
      className="nodrag nopan"
      data-canvas-template-panel=""
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top: 92, left: 16, width: 560,
        maxHeight: "calc(100vh - 124px)", height: 720,
        display: "flex", flexDirection: "column",
        borderRadius: 16, border: `1px solid ${line}`, background: bg,
        boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(0,0,0,0.14)",
        zIndex: 115, overflow: "hidden", color: text,
      }}
    >
      {/* ── 标题栏 ───────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 0" }}>
        <h2 style={{ fontSize: 22, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>模板</h2>
        <button
          type="button" onClick={() => setOpen(false)} aria-label="关闭模板面板"
          style={{ border: "none", background: "transparent", color: text, cursor: "pointer", display: "grid", placeItems: "center", width: 28, height: 28 }}
        >
          <X size={20} />
        </button>
      </div>

      {/* ── 搜索 ─────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "12px 22px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: field, border: `1px solid ${line}`, borderRadius: 12, padding: "9px 14px" }}>
          <Search size={15} color={muted} />
          <input
            data-artx-template-search=""
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜索全部模板"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: text, fontSize: 13.5 }}
          />
          {keyword && (
            <button type="button" onClick={() => setKeyword("")} aria-label="清空搜索"
              style={{ border: "none", background: "transparent", color: muted, cursor: "pointer" }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── 分类选择 tab ─────────────────────────────────────────────── */}
      <div
        data-artx-template-tabs=""
        style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 22px 10px" }}
      >
        {TABS.map(t => {
          const active = !keyword.trim() && tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-artx-template-tab={t.id}
              aria-pressed={active}
              onClick={() => { setTab(t.id); setKeyword(""); }}
              style={{
                border: `1px solid ${active ? tabActiveBg : line}`, borderRadius: 999, padding: "5px 12px",
                fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                background: active ? tabActiveBg : "transparent",
                color: active ? tabActiveText : muted,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {t.label} <span style={{ opacity: 0.6, fontWeight: 500 }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* ── 计数 ─────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "0 22px 10px", fontSize: 12, color: muted }} data-artx-template-count="">
        {keyword.trim() ? `搜索到 ${rows.length} 个模板` : `${rows.length} 个模板`}
      </div>

      {/* ── 分类内容平铺 ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: "0 22px 18px" }}>
        {rows.length === 0 && (
          <div style={{ textAlign: "center", padding: "36px 0", color: muted, fontSize: 13 }}>
            没有匹配的模板，换个关键词试试
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {rows.map(layout => {
            const thumb = thumbOf(layout);
            const active = pickedId === layout.i;
            return (
              <button
                key={layout.i}
                type="button"
                data-artx-template-card={layout.i}
                aria-pressed={active}
                onClick={() => setPickedId(layout.i)}
                onDoubleClick={() => place(layout.i)}
                style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", color: text, cursor: "pointer", minWidth: 0 }}
              >
                <div style={{
                  aspectRatio: "1.414", borderRadius: 8, overflow: "hidden",
                  background: isDark ? "#202020" : "#f2f2f2",
                  outline: `2px solid ${active ? text : "transparent"}`, outlineOffset: 1,
                  display: "grid", placeItems: "center",
                }}>
                  <img
                    src={thumb.src} alt="" loading="lazy" draggable={false}
                    style={{
                      maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                      boxShadow: layout.aspect < 1 ? "0 1px 4px rgba(0,0,0,0.12)" : undefined,
                    }}
                  />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 650, marginTop: 7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {layout.n}
                </div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {thumb.containers} 个容器 · {layout.c}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 加载按钮 ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${line}`, padding: "12px 22px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {picked ? `已选：${picked.n}` : "单击选中模板，双击可直接加载"}
        </div>
        <button
          type="button"
          data-artx-template-import=""
          disabled={!pickedId}
          onClick={() => pickedId && place(pickedId)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            border: "none", borderRadius: 12, padding: "10px 20px", fontSize: 13.5, fontWeight: 650,
            background: text, color: bg,
            cursor: pickedId ? "pointer" : "not-allowed", opacity: pickedId ? 1 : 0.4,
          }}
        >
          加载到画布 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
