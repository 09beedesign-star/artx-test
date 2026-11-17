/**
 * 画布「模板」面板 —— 版式选择与导入画布。
 *
 * 两个标签页：
 *   - 「Figma 模板库」：内嵌 Figma embed iframe，浏览 100+ 页面布局社区资源文件
 *   - 「本地模板」：现有的本地 SVG 版式列表，单击选中、双击或点「导入到画布」放置
 *
 * 🔒 交互说明：
 *   - Figma embed 是只读预览（社区文件），不可编辑
 *   - 本地模板导入仍走 TEMPLATE_PLACE_EVENT，不消耗积分
 *   - 与 InfiniteCanvas 只走 window 事件，面板不持有节点状态
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Figma, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  buildTemplatePieces,
  pickTemplateVariant,
  renderTemplateSvg,
  svgToDataUrl,
  templateBackground,
} from "@/lib/canvas-templates";
import { TEMPLATE_CATALOG } from "@/lib/canvas-template-catalog";
import {
  CANVAS_TEMPLATES_COMING_SOON_DESC,
  CANVAS_TEMPLATES_COMING_SOON_TITLE,
  canOpenTemplatePanel,
} from "@/lib/canvas-templates-release";
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

/** Figma 社区资源文件 — 100+ Page Layout Collection */
const FIGMA_EMBED_URL =
  "https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2FnXFPyYiMsThACPzOe4QzPy%2F100--Figma-Page-Layout-Collection--Presentation--A4--A5---Community-%3Fnode-id%3D0-1";

const FIGMA_ORIGINAL_URL =
  "https://www.figma.com/design/nXFPyYiMsThACPzOe4QzPy/100--Figma-Page-Layout-Collection--Presentation--A4--A5---Community-?node-id=0-1";

/** 预览统一用横向卡片，容器数是真实生成的子单元数。 */
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

type TabId = "figma" | "local";

export function CanvasTemplatePanel({ isDark }: { isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("figma");
  const [keyword, setKeyword] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [figmaLoaded, setFigmaLoaded] = useState(false);

  // ── 颜色系统 ──────────────────────────────────────────────────────────────
  const bg   = isDark ? "#161616" : "#ffffff";
  const text = isDark ? "#f4f4f4" : "#161616";
  const muted = isDark ? "rgba(255,255,255,0.52)" : "rgba(22,22,22,0.5)";
  const line = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,22,0.1)";
  const field = isDark ? "rgba(255,255,255,0.06)" : "#f5f5f5";
  const tabActiveBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(22,22,22,0.07)";

  useEffect(() => {
    // 🔒 2026-11-17：线上未正式发布 → 不开面板，只提示「即将上线」（唯一打开口子就在这里）
    const toggle = () => {
      if (!canOpenTemplatePanel()) {
        toast(CANVAS_TEMPLATES_COMING_SOON_TITLE, { description: CANVAS_TEMPLATES_COMING_SOON_DESC });
        return;
      }
      setOpen(v => !v);
    };
    const close  = () => setOpen(false);
    window.addEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
    window.addEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    return () => {
      window.removeEventListener(TEMPLATE_PANEL_TOGGLE_EVENT, toggle);
      window.removeEventListener(TEMPLATE_PANEL_CLOSE_EVENT, close);
    };
  }, []);

  // 切换到本地模板时重置 Figma loaded 状态（切回 Figma 重新显示 loading）
  useEffect(() => {
    if (tab === "figma") setFigmaLoaded(false);
  }, [tab]);

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

  const place = (layoutId: string) => {
    window.dispatchEvent(new CustomEvent(TEMPLATE_PLACE_EVENT, {
      detail: {
        layoutId,
        paperId: "a4",
        orientation: "portrait",
        resolutionId: "dpi-300",
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
        position: "fixed", top: 92, left: 16,
        width: tab === "figma" ? 780 : 420,
        maxHeight: "calc(100vh - 124px)",
        display: "flex", flexDirection: "column",
        borderRadius: 16, border: `1px solid ${line}`, background: bg,
        boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.55)" : "0 24px 70px rgba(0,0,0,0.14)",
        zIndex: 115, overflow: "hidden", color: text,
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* ── 标题栏 ───────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "18px 22px 0",
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 650, letterSpacing: "-0.01em", margin: 0 }}>模板</h2>
        <button
          type="button" onClick={() => setOpen(false)} aria-label="关闭模板面板"
          style={{ border: "none", background: "transparent", color: text, cursor: "pointer", display: "grid", placeItems: "center", width: 28, height: 28 }}
        >
          <X size={20} />
        </button>
      </div>

      {/* ── 标签页切换 ───────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: "flex", gap: 6, padding: "12px 22px 0",
      }}>
        {(["figma", "local"] as TabId[]).map(t => (
          <button
            key={t}
            type="button"
            data-artx-template-tab={t}
            onClick={() => setTab(t)}
            style={{
              border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              background: tab === t ? tabActiveBg : "transparent",
              color: tab === t ? text : muted,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {t === "figma"
              ? <><Figma size={13} style={{ opacity: 0.8 }} /> Figma 模板库</>
              : <>本地模板</>
            }
          </button>
        ))}
      </div>

      {/* ── Figma embed 标签页 ───────────────────────────────────────── */}
      {tab === "figma" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "12px 0 0" }}>
          {/* 说明栏 */}
          <div style={{
            flexShrink: 0, padding: "0 22px 10px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, color: muted }}>
              100+ 页面布局（Presentation · A4 · A5）— 只读预览，可滚动缩略图
            </span>
            <a
              href={FIGMA_ORIGINAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: muted, textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget.style.color = text)}
              onMouseLeave={e => (e.currentTarget.style.color = muted)}
            >
              <ExternalLink size={12} /> 在 Figma 打开
            </a>
          </div>

          {/* iframe 容器 */}
          <div style={{
            flex: 1, position: "relative", margin: "0 12px 12px",
            borderRadius: 12, overflow: "hidden",
            border: `1px solid ${line}`,
            background: isDark ? "#0d0d0d" : "#f0f0f0",
          }}>
            {/* loading 占位 */}
            {!figmaLoaded && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 12, zIndex: 2,
              }}>
                <Figma size={32} style={{ color: muted, opacity: 0.6 }} />
                <span style={{ fontSize: 13, color: muted }}>正在加载 Figma 预览…</span>
                <span style={{ fontSize: 11, color: muted, opacity: 0.7 }}>
                  首次加载需要 10–20 秒，请稍候
                </span>
              </div>
            )}
            <iframe
              src={FIGMA_EMBED_URL}
              allowFullScreen
              title="Figma 页面布局模板库"
              onLoad={() => setFigmaLoaded(true)}
              style={{
                width: "100%", height: "100%", border: "none",
                opacity: figmaLoaded ? 1 : 0,
                transition: "opacity 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* ── 本地模板标签页 ────────────────────────────────────────────── */}
      {tab === "local" && (
        <>
          {/* 搜索 */}
          <div style={{ flexShrink: 0, padding: "12px 22px 10px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: field, border: `1px solid ${line}`, borderRadius: 14, padding: "11px 16px",
            }}>
              <Search size={16} color={muted} />
              <input
                data-artx-template-search=""
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索全部模板"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: text, fontSize: 13.5 }}
              />
              {keyword && (
                <button type="button" onClick={() => setKeyword("")} aria-label="清空搜索"
                  style={{ border: "none", background: "transparent", color: muted, cursor: "pointer" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* 计数 */}
          <div style={{ flexShrink: 0, padding: "0 22px 10px", fontSize: 12, color: muted }} data-artx-template-count="">
            {rows.length} 个本地模板
          </div>

          {/* 卡片网格 */}
          <div style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: "0 22px 18px" }}>
            {rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "36px 0", color: muted, fontSize: 13 }}>
                没有匹配的模板，换个关键词试试
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                      aspectRatio: "1.71", borderRadius: 10, overflow: "hidden",
                      background: isDark ? "#202020" : "#f6f6f6",
                      border: `2px solid ${active ? text : "transparent"}`,
                      display: "grid", placeItems: "center",
                    }}>
                      <img src={thumb?.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 650, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {layout.n}
                    </div>
                    <div style={{ fontSize: 11.5, color: muted, marginTop: 3 }}>
                      {thumb?.containers ?? 0} 个容器 · {layout.c}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 导入按钮 */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${line}`, padding: "12px 22px 16px" }}>
            <button
              type="button"
              data-artx-template-import=""
              disabled={!pickedId}
              onClick={() => pickedId && place(pickedId)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: "none", borderRadius: 12, padding: "11px 16px", fontSize: 13.5, fontWeight: 650,
                background: text, color: bg,
                cursor: pickedId ? "pointer" : "not-allowed", opacity: pickedId ? 1 : 0.4,
              }}
            >
              导入到画布 <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
