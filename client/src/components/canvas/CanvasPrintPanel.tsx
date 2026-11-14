/**
 * 画布打印面板（2026-11-14，React 复刻）。
 *
 * 参考的是用户给的两张截图的结构：
 *   - 系统打印框：左侧纸张预览 / 右侧「目标打印机·页面·布局·更多设置」/ 底部取消+保存；
 *   - 「选择容器」下拉 + 多页容器列表：支持一次勾选多张模板。
 * ⚠️ 但配色**完全走本站黑白风**（白纸、黑字、黑色主按钮、浅灰分区），
 *    不用参考站的蓝色描边与深灰右栏。
 *
 * 🔒 打印 / 导出 0 积分；只有用户主动点「AI 高清化」才会调用已计费接口。
 * 🔒 预览与导出共用 drawPrintPage()，保证「调整大小/左右移动/剪裁」所见即所得。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { ChevronDown, Printer, X } from "lucide-react";
import { enhanceImageToHd } from "@/lib/ai";
import {
  TEMPLATE_BLEED_OPTIONS,
  TEMPLATE_PAPER_PRESETS,
  TEMPLATE_RESOLUTIONS,
  resolveTemplateSize,
  type TemplateOrientation,
  type TemplateResolution,
} from "@/lib/canvas-templates";
import {
  AI_ENHANCE_CREDITS,
  AI_EXPANSION_CREDITS,
  DEFAULT_PRINT_PLACEMENT,
  PRINT_CREDIT_COST,
  creditsToHkd,
  drawPrintPage,
  evaluatePrintPrecision,
  type PrintPlacement,
} from "@/lib/canvas-print-precision";

import type { PrintableItem } from "@/lib/canvas-print-items";

type Destination = "pdf" | "png";

const PAPER_WORDS: Record<string, string> = { a4: "A4", a3: "A3", a5: "A5", a6: "A6" };

export function CanvasPrintPanel({
  isDark,
  items,
  preselectIds,
  onClose,
}: {
  isDark: boolean;
  items: PrintableItem[];
  preselectIds?: string[];
  onClose: () => void;
}) {
  /**
   * ⚠️ items 是画布异步推过来的：面板首次挂载时往往还是空数组。
   *    若把「默认全选」写在 useState 初始值里，会永远得到 []（0 页、预览空白、导出空）。
   *    这里在 items 第一次就绪时初始化一次；之后用户主动取消全选不会被强行勾回。
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionInitializedRef = useRef(false);
  useEffect(() => {
    if (selectionInitializedRef.current || !items.length) return;
    selectionInitializedRef.current = true;
    const preset = (preselectIds || []).filter(id => items.some(i => i.id === id));
    setSelectedIds(preset.length ? preset : items.map(i => i.id));
  }, [items, preselectIds]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [placements, setPlacements] = useState<Record<string, PrintPlacement>>({});
  const [paperId, setPaperId] = useState("a4");
  const [orientation, setOrientation] = useState<TemplateOrientation>("portrait");
  const [resolutionId, setResolutionId] = useState("300");
  const [bleedMm, setBleedMm] = useState(0);
  const [destination, setDestination] = useState<Destination>("pdf");
  const [pageRange, setPageRange] = useState<"all" | "current">("all");
  const [showMore, setShowMore] = useState(false);
  const [showContainers, setShowContainers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enhancedSrc, setEnhancedSrc] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<Record<string, { width: number; height: number }>>({});
  const [tick, setTick] = useState(0);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const previewRef = useRef<HTMLCanvasElement>(null);

  const ink = isDark ? "#f4f4f4" : "#161616";
  const sub = isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)";
  const line = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const panelBg = isDark ? "#161616" : "#ffffff";
  const sideBg = isDark ? "#202020" : "#f7f7f7";
  const fieldBg = isDark ? "rgba(255,255,255,0.06)" : "#ffffff";

  const resolution = useMemo<TemplateResolution>(() => {
    const found = TEMPLATE_RESOLUTIONS.find(r =>
      (r.kind === "dpi" && String(r.value) === resolutionId) ||
      (r.kind === "long" && `long-${r.value}` === resolutionId),
    );
    return found || TEMPLATE_RESOLUTIONS[2]; // 300 DPI
  }, [resolutionId]);

  const size = useMemo(() => resolveTemplateSize({ paperId, orientation, resolution, bleedMm }),
    [paperId, orientation, resolution, bleedMm]);

  const selectedItems = useMemo(
    () => selectedIds.map(id => items.find(i => i.id === id)).filter((i): i is PrintableItem => !!i),
    [selectedIds, items],
  );
  const pages = pageRange === "current" ? (selectedItems[currentIndex] ? [selectedItems[currentIndex]] : []) : selectedItems;
  const currentItem = selectedItems[Math.min(currentIndex, Math.max(0, selectedItems.length - 1))];
  const placement = (currentItem && placements[currentItem.id]) || DEFAULT_PRINT_PLACEMENT;
  const currentSrc = currentItem ? (enhancedSrc[currentItem.id] || currentItem.src) : "";
  const dims = currentItem ? (loaded[currentItem.id] || {
    width: currentItem.naturalWidth || 1024,
    height: currentItem.naturalHeight || 1024,
  }) : { width: 1024, height: 1024 };

  const precision = useMemo(() => evaluatePrintPrecision({
    imageWidth: dims.width, imageHeight: dims.height,
    paperId, orientation, resolution, bleedMm, placement,
  }), [dims.width, dims.height, paperId, orientation, resolution, bleedMm, placement]);

  // 预加载所有选中项的图片（含 AI 高清化替换后的 src）
  useEffect(() => {
    let cancelled = false;
    selectedItems.forEach(item => {
      const src = enhancedSrc[item.id] || item.src;
      const key = `${item.id}::${src}`;
      if (imagesRef.current[key]) return;
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        imagesRef.current[key] = img;
        setLoaded(prev => ({ ...prev, [item.id]: { width: img.naturalWidth, height: img.naturalHeight } }));
        setTick(t => t + 1);
      };
      img.src = src;
    });
    return () => { cancelled = true; };
  }, [selectedItems, enhancedSrc]);

  const setPlacement = (patch: Partial<PrintPlacement>) => {
    if (!currentItem) return;
    setPlacements(prev => ({ ...prev, [currentItem.id]: { ...placement, ...patch } }));
  };

  const imageFor = (item: PrintableItem): HTMLImageElement | null => {
    const src = enhancedSrc[item.id] || item.src;
    return imagesRef.current[`${item.id}::${src}`] || null;
  };

  // 预览：与导出共用同一绘制函数，只是尺寸小
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !currentItem) return;
    const img = imageFor(currentItem);
    if (!img) return;
    const previewW = 440;
    const previewH = Math.round(previewW * (size.print.height / size.print.width));
    canvas.width = previewW;
    canvas.height = previewH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPrintPage(ctx, img, img.naturalWidth, img.naturalHeight, previewW, previewH, placement);
  }, [currentItem, placement, size.print.width, size.print.height, tick, enhancedSrc]);

  const renderPageCanvas = useCallback((item: PrintableItem, maxEdge?: number): HTMLCanvasElement | null => {
    const img = imageFor(item);
    if (!img) return null;
    const p = (placements[item.id] || DEFAULT_PRINT_PLACEMENT);
    let w = size.print.width;
    let h = size.print.height;
    if (maxEdge && Math.max(w, h) > maxEdge) {
      const k = maxEdge / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawPrintPage(ctx, img, img.naturalWidth, img.naturalHeight, w, h, p);
    return canvas;
  }, [imageFor, placements, size.print.width, size.print.height]);

  const exportPng = async () => {
    for (let i = 0; i < pages.length; i++) {
      const item = pages[i];
      const canvas = renderPageCanvas(item);
      if (!canvas) { toast.error(`「${item.name}」图片尚未加载完成`); continue; }
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) continue;
      saveAs(blob, `ArtX-打印-${String(i + 1).padStart(2, "0")}-${item.name.replace(/[\\/:*?"<>|]/g, "_")}.png`);
      if (i < pages.length - 1) await new Promise(r => setTimeout(r, 250));
    }
    toast.success(`已导出 ${pages.length} 张（${size.print.width}×${size.print.height}，${PRINT_CREDIT_COST} 积分）`);
  };

  const printViaSystem = async () => {
    const paper = TEMPLATE_PAPER_PRESETS.find(p => p.id === paperId) || TEMPLATE_PAPER_PRESETS[0];
    const pageWmm = orientation === "landscape" ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h);
    const pageHmm = orientation === "landscape" ? Math.min(paper.w, paper.h) : Math.max(paper.w, paper.h);
    const pagesHtml = pages.map(item => {
      const canvas = renderPageCanvas(item, 2400);
      const url = canvas ? canvas.toDataURL("image/png") : "";
      return `<div class="page"><img src="${url}" alt="" /></div>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${pageWmm}mm ${pageHmm}mm; margin: 0; }
      * { box-sizing: border-box; }
      html,body { margin:0; padding:0; background:#fff; }
      .page { width:${pageWmm}mm; height:${pageHmm}mm; overflow:hidden; page-break-after:always; break-after:page; }
      .page:last-child { page-break-after:auto; break-after:auto; }
      img { width:100%; height:100%; object-fit:fill; display:block; }
    </style></head><body>${pagesHtml}</body></html>`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) { toast.error("无法创建打印预览"); document.body.removeChild(iframe); return; }
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise<void>(resolve => {
      const imgs = Array.from(doc.querySelectorAll("img"));
      let left = imgs.length;
      if (!left) { setTimeout(resolve, 120); return; }
      imgs.forEach(im => {
        if (im.complete) { if (--left === 0) setTimeout(resolve, 120); return; }
        im.onload = im.onerror = () => { if (--left === 0) setTimeout(resolve, 120); };
      });
      setTimeout(resolve, 4000); // 兜底，绝不卡死
    });
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 60000);
    toast.success(`已打开系统打印（${pages.length} 页，${PRINT_CREDIT_COST} 积分）`);
  };

  const handleSave = async () => {
    if (!pages.length) { toast("请至少选择一个容器"); return; }
    setBusy(true);
    try {
      if (destination === "png") await exportPng();
      else await printViaSystem();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打印失败");
    } finally {
      setBusy(false);
    }
  };

  const handleAiEnhance = async () => {
    if (!currentItem) return;
    setBusy(true);
    try {
      const result = await enhanceImageToHd({ imageSrc: currentSrc, level: "4k" });
      const next = result.images?.[0]?.src;
      if (!next) { toast.error("AI 高清化没有返回结果"); return; }
      setEnhancedSrc(prev => ({ ...prev, [currentItem.id]: next }));
      toast.success(`AI 高清化完成（${AI_ENHANCE_CREDITS} 积分）`, { description: "打印与导出仍然 0 积分" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 高清化失败");
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setCurrentIndex(0);
  };

  const selectStyle: React.CSSProperties = {
    width: "100%", height: 34, padding: "0 9px", fontSize: 12,
    color: ink, background: fieldBg, border: `1px solid ${line}`,
    borderRadius: 8, outline: "none", cursor: "pointer",
  };
  const rowLabel = (t: string) => <div className="mb-1.5 text-[11px]" style={{ color: sub }}>{t}</div>;
  const sectionTitle = (t: string) => (
    <div className="mt-4 mb-1.5 text-[10px] font-semibold" style={{ color: sub, letterSpacing: "0.08em" }}>{t}</div>
  );
  const slider = (label: string, value: number, min: number, max: number, step: number, key: keyof PrintPlacement, suffix = "") => (
    <div className="mb-2" key={key}>
      <div className="flex items-center justify-between text-[11px]" style={{ color: sub }}>
        <span>{label}</span><span style={{ color: ink }}>{Math.round(value * (step < 1 ? 100 : 1))}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        data-artx-print-slider={key}
        onChange={e => setPlacement({ [key]: Number(e.target.value) } as Partial<PrintPlacement>)}
        className="w-full" style={{ accentColor: ink }} />
    </div>
  );
  const hkdEnhance = creditsToHkd(AI_ENHANCE_CREDITS);
  const hkdExpand = creditsToHkd(AI_EXPANSION_CREDITS);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5"
      style={{ background: "rgba(20,20,20,0.48)", backdropFilter: "blur(4px)" }}
      onMouseDown={onClose}>
      <section data-artx-print-panel="" className="flex w-full overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
        style={{ maxWidth: 1040, height: "min(760px, calc(100vh - 40px))", background: panelBg, border: `1px solid ${line}`, color: ink }}
        onMouseDown={e => e.stopPropagation()}>
        {/* ── 左：选择容器 + 纸张预览 + 放置调整 ── */}
        <div className="flex min-w-0 flex-1 flex-col" style={{ borderRight: `1px solid ${line}` }}>
          <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${line}` }}>
            <div className="flex items-center gap-2.5">
              <Printer size={17} />
              <h2 className="text-[17px] font-bold">打印</h2>
              <span className="text-[11px]" style={{ color: sub }}>{pages.length} 页</span>
            </div>
            <button type="button" data-artx-print-close="" onClick={onClose} aria-label="关闭打印面板"
              className="rounded-full p-1.5" style={{ color: sub, border: "none", background: "transparent", cursor: "pointer" }}>
              <X size={17} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* 容器选择列表（复刻截图 2） */}
            <div className="w-[236px] shrink-0 overflow-y-auto px-4 py-4" style={{ borderRight: `1px solid ${line}` }}>
              <button type="button" onClick={() => setShowContainers(v => !v)}
                className="flex w-full items-center justify-between rounded-[var(--radius-pill)] px-3 py-2 text-[12px]"
                style={{ color: ink, background: fieldBg, border: `1px solid ${line}`, cursor: "pointer" }}>
                选择容器 <ChevronDown size={14} style={{ transform: showContainers ? "rotate(180deg)" : "none" }} />
              </button>
              <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: sub }}>
                <span>已选 {selectedIds.length} / {items.length}</span>
                <button type="button" onClick={() => setSelectedIds(items.map(i => i.id))}
                  style={{ color: ink, background: "transparent", border: "none", cursor: "pointer", fontSize: 11 }}>全选</button>
              </div>
              {showContainers && (
                <div data-artx-print-containers="" className="mt-2">
                  {items.length === 0 && <p className="py-6 text-center text-[11px]" style={{ color: sub }}>画布里还没有可打印的图片或画板</p>}
                  {items.map((item, index) => (
                    <label key={item.id} data-artx-print-container={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm-design)] px-2 py-2 text-[11.5px]"
                      style={{ background: selectedIds.includes(item.id) ? (isDark ? "rgba(255,255,255,0.09)" : "#f1f1f1") : "transparent" }}>
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleItem(item.id)}
                        style={{ accentColor: ink }} />
                      <span className="truncate">{String(index + 1).padStart(2, "0")} · {item.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 预览 + 调整 */}
            <div className="flex min-w-0 flex-1 flex-col items-center overflow-y-auto px-5 py-4" style={{ background: sideBg }}>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: sub }}>
                <button type="button" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  style={{ color: ink, border: `1px solid ${line}`, background: fieldBg, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>上一页</button>
                <span>{selectedItems.length ? `${Math.min(currentIndex + 1, selectedItems.length)} / ${selectedItems.length}` : "0 / 0"}</span>
                <button type="button" onClick={() => setCurrentIndex(i => Math.min(selectedItems.length - 1, i + 1))}
                  style={{ color: ink, border: `1px solid ${line}`, background: fieldBg, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>下一页</button>
              </div>
              {/*
                ⚠️ flexShrink:0 必须显式写：这个预览容器是竖向 flex 的子项，
                   不写会被下面的调整面板一起压缩（实测压到 145px），
                   overflow:hidden 只露出白纸顶部留白 → 看起来像「预览空白」。
                canvas 固有 440×622，用固定显示高度等比缩放，整张纸完整可见。
              */}
              <div className="mt-3 shrink-0 overflow-hidden rounded-sm bg-white"
                style={{ boxShadow: "0 6px 24px rgba(0,0,0,0.16)", lineHeight: 0, flexShrink: 0 }}>
                <canvas ref={previewRef} data-artx-print-preview=""
                  style={{ display: "block", height: 320, width: "auto", maxWidth: "100%" }} />
              </div>
              <p className="mt-2 text-center text-[10.5px]" style={{ color: sub }}>
                {currentItem ? currentItem.name : "未选择容器"} · {size.print.width}×{size.print.height} px
              </p>

              <div className="mt-3 w-full rounded-[var(--radius-md-design)] p-3" style={{ background: fieldBg, border: `1px solid ${line}` }}>
                {sectionTitle("预览调整（当前页）")}
                {slider("显示大小", placement.scale, 0.2, 2, 0.05, "scale", "%")}
                {slider("左右移动", placement.offsetX, -100, 100, 1, "offsetX", "%")}
                {slider("上下移动", placement.offsetY, -100, 100, 1, "offsetY", "%")}
                {sectionTitle("剪裁")}
                {slider("左", placement.cropLeft, 0, 0.45, 0.01, "cropLeft", "%")}
                {slider("右", placement.cropRight, 0, 0.45, 0.01, "cropRight", "%")}
                {slider("上", placement.cropTop, 0, 0.45, 0.01, "cropTop", "%")}
                {slider("下", placement.cropBottom, 0, 0.45, 0.01, "cropBottom", "%")}
                <button type="button" onClick={() => currentItem && setPlacements(prev => ({ ...prev, [currentItem.id]: DEFAULT_PRINT_PLACEMENT }))}
                  className="mt-1 w-full rounded-md py-1.5 text-[11px]"
                  style={{ color: ink, background: "transparent", border: `1px solid ${line}`, cursor: "pointer" }}>重置本页调整</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 右：打印设置（复刻截图 1 的字段，本站黑白配色） ── */}
        <aside className="flex w-[300px] shrink-0 flex-col" style={{ background: sideBg }}>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">打印设置</span>
              <span className="text-[11px]" style={{ color: sub }}>{pages.length} 页</span>
            </div>

            <div className="mt-4">
              {rowLabel("目标打印机")}
              <select data-artx-print-destination="" value={destination} onChange={e => setDestination(e.target.value as Destination)} style={selectStyle}>
                <option value="pdf">另存为 PDF（系统打印）</option>
                <option value="png">导出 PNG 图片</option>
              </select>
            </div>
            <div className="mt-3">
              {rowLabel("页面")}
              <select data-artx-print-range="" value={pageRange} onChange={e => setPageRange(e.target.value as "all" | "current")} style={selectStyle}>
                <option value="all">全部（{selectedItems.length} 页）</option>
                <option value="current">仅当前页</option>
              </select>
            </div>
            <div className="mt-3">
              {rowLabel("布局")}
              <select data-artx-print-orientation="" value={orientation} onChange={e => setOrientation(e.target.value as TemplateOrientation)} style={selectStyle}>
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </div>
            <div className="mt-3">
              {rowLabel("纸张")}
              <select data-artx-print-paper="" value={paperId} onChange={e => setPaperId(e.target.value)} style={selectStyle}>
                {TEMPLATE_PAPER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="mt-3">
              {rowLabel("分辨率")}
              <select data-artx-print-resolution="" value={resolutionId} onChange={e => setResolutionId(e.target.value)} style={selectStyle}>
                {TEMPLATE_RESOLUTIONS.map(r => <option key={`${r.kind}-${r.value}`} value={r.kind === "dpi" ? String(r.value) : `long-${r.value}`}>{r.label}</option>)}
              </select>
            </div>
            <div className="mt-3">
              {rowLabel("出血")}
              <select data-artx-print-bleed="" value={bleedMm} onChange={e => setBleedMm(Number(e.target.value))} style={selectStyle}>
                {TEMPLATE_BLEED_OPTIONS.map(b => <option key={b} value={b}>{b} mm</option>)}
              </select>
            </div>

            <button type="button" onClick={() => setShowMore(v => !v)}
              className="mt-5 flex w-full items-center justify-between border-0 border-t py-3 text-[12px]"
              style={{ color: ink, background: "transparent", borderColor: line, cursor: "pointer" }}>
              更多设置 <ChevronDown size={14} style={{ transform: showMore ? "rotate(180deg)" : "none" }} />
            </button>
            {showMore && (
              <div data-artx-print-more="" className="rounded-[var(--radius-md-design)] p-3" style={{ background: fieldBg, border: `1px solid ${line}` }}>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: sub }}>实际有效精度</span>
                  <span data-artx-print-effective-dpi="" className="font-semibold"
                    style={{ color: precision.verdict === "insufficient" ? "#b42318" : ink }}>
                    {precision.effectiveDpi} DPI
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5" style={{ color: sub }}>{precision.suggestion}</p>
                {precision.clamped && <p className="mt-1 text-[10.5px]" style={{ color: "#b42318" }}>输出已按浏览器 canvas 上限等比缩小。</p>}
                <div className="mt-3 rounded-md p-2.5" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f3f3f3" }}>
                  <p className="text-[11px] font-semibold">精度与积分评估</p>
                  <p className="mt-1 text-[10.5px] leading-5" style={{ color: sub }}>
                    打印 / 导出：<b style={{ color: ink }}>{PRINT_CREDIT_COST} 积分</b>（永远免费）。<br />
                    AI 高清化（超分 4K，真上游）：<b style={{ color: ink }}>{AI_ENHANCE_CREDITS} 积分/次</b> ≈ HKD {hkdEnhance.low}~{hkdEnhance.high}。<br />
                    AI 扩图：<b style={{ color: ink }}>{AI_EXPANSION_CREDITS} 积分/次</b> ≈ HKD {hkdExpand.low}~{hkdExpand.high}，输出仍 1K，<b>不适合提精度</b>。<br />
                    8K 档是 4K 出图 + 本地插值，画质无真实提升。
                  </p>
                  <button type="button" data-artx-print-ai-enhance="" onClick={handleAiEnhance} disabled={busy || !currentItem}
                    className="mt-2 w-full rounded-md py-2 text-[11px] font-medium"
                    style={{ color: "#ffffff", background: "#161616", border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
                    对当前页做 AI 高清化（{AI_ENHANCE_CREDITS} 积分）
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-[11px] font-semibold">打印不消耗积分（{PRINT_CREDIT_COST} 积分）</p>
            <p className="mt-1 text-[10.5px] leading-5" style={{ color: sub }}>
              {PAPER_WORDS[paperId] || "当前纸张"} · {size.print.width}×{size.print.height} px · 目标 {precision.targetDpi} DPI。
              选「另存为 PDF」会打开系统打印框，在目标打印机里选「另存为 PDF」即可。
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${line}` }}>
            <button type="button" onClick={onClose}
              className="rounded-[var(--radius-pill)] px-5 py-2 text-[12px]"
              style={{ color: ink, background: "transparent", border: `1px solid ${ink}`, cursor: "pointer" }}>取消</button>
            <button type="button" data-artx-print-save="" onClick={handleSave} disabled={busy}
              className="rounded-[var(--radius-pill)] px-5 py-2 text-[12px] font-semibold"
              style={{ color: "#ffffff", background: "#161616", border: "1px solid #161616", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "处理中…" : destination === "pdf" ? "保存 / 打印" : "导出 PNG"}
            </button>
          </div>
        </aside>
      </section>
    </div>,
    document.body,
  );
}
