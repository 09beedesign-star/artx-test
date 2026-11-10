import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Sparkles, X } from "lucide-react";
import {
  fetchInspirationFeed,
  getInspirationFallbackFeed,
  INSPIRATION_TARGET_COUNT,
  type InspirationFeedItem,
} from "@/lib/inspiration-feed";

/**
 * ⚠️ 与专题页共用同一个类型与同一份远程数据源，不要再在这里手写一份
 *   reference → item 的映射：口径一漂移，「复制的提示词和专题页对不上」零报错。
 */
export type InspirationPromptItem = InspirationFeedItem;

export type InspirationPromptDialogProps = {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
  onCopy: (item: InspirationPromptItem) => void;
  onImport?: (item: InspirationPromptItem) => void;
};

/** 每批渲染条数。弹窗可滚动，分批是为了不一次性塞 900 张卡片进 DOM。 */
const DIALOG_PAGE_SIZE = 120;
const ALL_GROUPS = "全部分类";

export function InspirationPromptDialog({
  isOpen,
  isDark,
  onClose,
  onCopy,
  onImport,
}: InspirationPromptDialogProps) {
  const [items, setItems] = useState<InspirationPromptItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InspirationPromptItem | null>(null);
  const [activeGroup, setActiveGroup] = useState(ALL_GROUPS);
  const [visibleCount, setVisibleCount] = useState(DIALOG_PAGE_SIZE);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleInspirationCardMouseEnter = (itemKey: string) => {
    if (hoveredItemKey === itemKey) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredItemKey(itemKey);
      hoverTimerRef.current = null;
    }, 500);
  };

  const handleInspirationCardMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredItemKey(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    /**
     * ⚠️ 原来这里自己拼了一套 `/api/inspiration/references` 请求 + 映射，
     *    而且末尾写死 `.slice(0, 60)` —— 线上接口 900 条，弹窗只给看 60 条，
     *    用户直觉就是「我的灵感模板怎么少了很多」。
     * ✅ 改走专题页共用的 `fetchInspirationFeed`（同一接口、同一映射），
     *    并且失败 / 空数组时退同一份本地兜底，不再出现「暂无可用灵感」。
     */
    fetchInspirationFeed(controller.signal, INSPIRATION_TARGET_COUNT)
      .then(loaded => {
        if (controller.signal.aborted) return;
        setItems(loaded.length > 0 ? loaded : getInspirationFallbackFeed());
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("[inspiration] dialog feed failed, fallback to shared csv", error);
        setItems(getInspirationFallbackFeed());
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedItem(null);
      setActiveGroup(ALL_GROUPS);
      setVisibleCount(DIALOG_PAGE_SIZE);
    }
  }, [isOpen]);

  const groups = useMemo(
    () => [ALL_GROUPS, ...Array.from(new Set(items.map(item => item.group))).filter(Boolean)],
    [items]
  );
  const scopedItems = useMemo(
    () => (activeGroup === ALL_GROUPS ? items : items.filter(item => item.group === activeGroup)),
    [activeGroup, items]
  );
  /** 只按「每批多少」分页，不再有 60 条的硬上限；切换分类时回到第一批。 */
  const visibleItems = useMemo(
    () => scopedItems.slice(0, visibleCount),
    [scopedItems, visibleCount]
  );
  const canLoadMore = visibleCount < scopedItems.length;

  useEffect(() => {
    setVisibleCount(DIALOG_PAGE_SIZE);
  }, [activeGroup]);

  if (!isOpen) return null;

  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "#e5e5e7" : "#222";
  const sub = isDark ? "#a8a8ad" : "#666";
  const panelBg = isDark ? "#222222" : "#fff";
  const cardBg = isDark ? "#171717" : "#fafafa";
  const activeBg = isDark ? "rgba(197,237,71,0.16)" : "rgba(95,130,0,0.12)";
  const brandGreenText = isDark ? "#C5ED47" : "#5C7A1A"; // 品牌绿色文字（白天模式加深）

  return (
    <div
      data-inspiration-prompt-dialog
      className="fixed inset-0 z-[5300] flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(10px)" }}
      onMouseDown={onClose}
    >
      <section
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-[var(--radius-lg-design)]"
        style={{ maxWidth: 980, maxHeight: "calc(100vh - 48px)", background: panelBg, border: `1px solid ${border}`, boxShadow: "0 24px 80px rgba(0,0,0,0.40)" }}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles size={16} style={{ color: brandGreenText }} />
            <h2 className="type-body-sm truncate" style={{ color: text, fontWeight: 750 }}>
              灵感模板
              {/* 把真实总量写出来：只给 60 条却不说明「还有 840 条」，用户只会以为模板丢了。 */}
              <span style={{ color: sub, fontWeight: 500 }}> · 共 {scopedItems.length} 条</span>
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭灵感模板" className="rounded-[var(--radius-pill)] p-2" style={{ color: sub, border: `1px solid ${border}` }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex shrink-0 gap-2 overflow-x-auto px-5 py-3" style={{ borderBottom: `1px solid ${border}` }}>
          {groups.map(group => (
            <button key={group} type="button" onClick={() => setActiveGroup(group)} className="shrink-0 rounded-[var(--radius-pill)] px-3 py-1.5 type-caption" style={{ background: activeGroup === group ? activeBg : "transparent", border: `1px solid ${activeGroup === group ? "rgba(197,237,71,0.48)" : border}`, color: activeGroup === group ? brandGreenText : sub }}>
              {group}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {selectedItem ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
              <div className="relative overflow-hidden rounded-[var(--radius-md-design)] bg-[#171717]">
                <img ref={selectedImageRef} src={selectedItem.imageUrl} alt={selectedItem.title} className="block max-h-[52vh] w-full object-contain" />
              </div>
              <div className="min-w-0">
                <button type="button" onClick={() => setSelectedItem(null)} className="mb-4 type-caption" style={{ color: sub }}>← 返回灵感列表</button>
                <span className="inline-flex rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: activeBg, color: brandGreenText }}>{selectedItem.field}</span>
                <h3 className="mt-3 type-title-sm" style={{ color: text, fontWeight: 760 }}>{selectedItem.title}</h3>
                <p className="mt-2 type-caption leading-5" style={{ color: sub }}>{selectedItem.description}</p>
                <div className="mt-4 max-h-[36vh] overflow-y-auto rounded-[var(--radius-md-design)] p-4" style={{ background: cardBg, border: `1px solid ${border}` }}>
                  <p className="whitespace-pre-wrap type-caption leading-6" style={{ color: text }}>{selectedItem.prompt}</p>
                </div>
                <button type="button" onClick={() => onCopy(selectedItem)} className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2.5 type-caption" style={{ background: "#C5ED47", color: "#111", fontWeight: 700 }}>
                  <Copy size={14} /> 复制提示词
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map(item => (
                <article
                  key={`${item.rank}-${item.title}`}
                  className="cursor-pointer overflow-hidden rounded-[var(--radius-lg-design)]"
                  style={{ background: cardBg, border: `1px solid ${border}` }}
                  onMouseEnter={() => handleInspirationCardMouseEnter(`${item.rank}-${item.title}`)}
                  onMouseLeave={handleInspirationCardMouseLeave}
                  onDoubleClick={() => setSelectedItem(item)}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-[#171717]">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out"
                      style={{ transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)" }}
                      loading="lazy"
                    />
                    {onImport && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onImport(item); }}
                        className="absolute top-2 right-2 rounded-full p-2 shadow-lg transition-all hover:scale-110"
                        style={{ background: "#C5ED47" }}
                        aria-label="一键导入灵感"
                        title="一键导入灵感"
                      >
                        <Download size={14} style={{ color: "#111" }} />
                      </button>
                    )}
                  </div>
                  <div className="p-3"><p className="truncate type-body-sm" style={{ color: text, fontWeight: 700 }}>{item.title}</p><p className="mt-1 line-clamp-2 type-caption" style={{ color: sub }}>{item.prompt}</p><p className="mt-2 type-caption" style={{ color: brandGreenText }}>双击查看详情</p></div>
                </article>
              ))}
              {visibleItems.length === 0 && <p className="col-span-full py-12 text-center type-body-sm" style={{ color: sub }}>暂无可用灵感</p>}
            </div>
          )}
          {!selectedItem && canLoadMore && (
            <div className="col-span-full flex justify-center pt-2 pb-1">
              <button
                type="button"
                onClick={() => setVisibleCount(count => count + DIALOG_PAGE_SIZE)}
                className="rounded-[var(--radius-pill)] px-5 py-2 type-caption"
                style={{ border: `1px solid ${border}`, color: text, background: cardBg }}
              >
                加载更多（已显示 {visibleItems.length} / {scopedItems.length}）
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
