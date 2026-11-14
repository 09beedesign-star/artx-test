import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { CardHoverOverlay } from "@/components/ui/card-hover-overlay";
import { MasonryColumns, type MasonryBreakpoint } from "@/components/ui/masonry-columns";
import {
  fetchInspirationFeed,
  getInspirationFallbackFeed,
  INSPIRATION_TARGET_COUNT,
  type InspirationFeedItem,
} from "@/lib/inspiration-feed";

/**
 * ⚠️ 与专题页共用同一个类型与同一份远程数据源，不要再在这里手写一份
 *   reference → item 的映射：口径一漂移，「弹窗里的图和专题页对不上」零报错。
 *
 * 🔒 2026-11-13 用户要求：灵感模板的**提示词全站一律不展示**（登录与否都一样）。
 *   - 网格卡片只显示图片；hover 时图片正中出现「一键同款」。
 *   - 双击详情也只给图 + 标题 / 描述 + 「一键同款」，不再有提示词框与「复制提示词」。
 *   - 「一键同款」= 图片进画布 + 挂进提示词输入框做引用，**绝不把 prompt 写进输入框**。
 *   ⚠️ 本组件拿到的 item 仍带 prompt 字段（数据源共用），只是不渲染 —— 别再把它放回 JSX。
 */
export type InspirationPromptItem = InspirationFeedItem;

export type InspirationPromptDialogProps = {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
  /** 「一键同款」：图片进画布 + 输入框引用该图。登录门禁在画布「生成」时触发。 */
  onApplySameStyle: (item: InspirationPromptItem) => void;
};

/** 弹窗内容区宽度 ≤ 940px：<480 一列，≥480 两列，≥720 三列（与原 sm/lg 网格档位相当）。 */
const DIALOG_MASONRY_BREAKPOINTS: MasonryBreakpoint[] = [
  { minWidth: 0, columns: 1 },
  { minWidth: 480, columns: 2 },
  { minWidth: 720, columns: 3 },
];

/** 每批渲染条数。弹窗可滚动，分批是为了不一次性塞 900 张卡片进 DOM。 */
const DIALOG_PAGE_SIZE = 120;
const ALL_GROUPS = "全部分类";

export function InspirationPromptDialog({
  isOpen,
  isDark,
  onClose,
  onApplySameStyle,
}: InspirationPromptDialogProps) {
  const [items, setItems] = useState<InspirationPromptItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InspirationPromptItem | null>(null);
  const [activeGroup, setActiveGroup] = useState(ALL_GROUPS);
  const [visibleCount, setVisibleCount] = useState(DIALOG_PAGE_SIZE);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  /**
   * 画板灵感弹窗：hover 即刻显示「一键同款」（用户 2026-11-14 要求零延时）。
   * ⚠️ 只针对本弹窗；独立灵感页 InspirationPage 仍保留 500ms 延时，别顺手改。
   */
  const handleInspirationCardMouseEnter = (itemKey: string) => {
    setHoveredItemKey(itemKey);
  };

  const handleInspirationCardMouseLeave = () => {
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
            <Sparkles size={16} style={{ color: text }} />
            <h2 className="type-body-sm truncate" style={{ color: text, fontWeight: 750 }}>
              灵感模板
              {/* 🔒 2026-11-13 用户要求：灵感总数不在前端显示（标题、加载更多都不带数字）。 */}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭灵感模板" className="rounded-[var(--radius-pill)] p-2" style={{ color: sub, border: `1px solid ${border}` }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex shrink-0 gap-2 overflow-x-auto px-5 py-3" style={{ borderBottom: `1px solid ${border}` }}>
          {groups.map(group => (
            <button key={group} type="button" onClick={() => setActiveGroup(group)} className="shrink-0 rounded-[var(--radius-pill)] px-3 py-1.5 type-caption" style={{ background: activeGroup === group ? "var(--artx-action-active-bg)" : "var(--artx-action-bg)", border: `1px solid ${activeGroup === group ? "var(--artx-action-active-border)" : "var(--artx-action-border)"}`, color: activeGroup === group ? "var(--artx-action-active-fg)" : sub }}>
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
                <span className="inline-flex rounded-[var(--radius-pill)] border px-2.5 py-1 type-caption" style={{ background: "transparent", color: "var(--artx-action-fg)", borderColor: "var(--artx-action-border)" }}>{selectedItem.field}</span>
                <h3 className="mt-3 type-title-sm" style={{ color: text, fontWeight: 760 }}>{selectedItem.title}</h3>
                {/* 🔒 2026-11-14：「灵感提示词描述」一行随提示词屏蔽一并删除，别加回。 */}
                <button
                  type="button"
                  data-inspiration-dialog-detail-same-style=""
                  onClick={() => onApplySameStyle(selectedItem)}
                  className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2.5 type-caption"
                  style={{ background: "var(--artx-action-bg)", color: "var(--artx-action-fg)", border: "1px solid var(--artx-action-border)", fontWeight: 700 }}
                  aria-label="一键同款"
                  title="一键同款"
                >
                  一键同款
                </button>
              </div>
            </div>
          ) : (
            <>
            {/* 🔒 2026-11-14 用户要求：等宽列瀑布流，卡片高度随图片自适应，整图完整可见（不再 16:10 裁切）。 */}
            <MasonryColumns
              items={visibleItems}
              getKey={item => `${item.rank}-${item.title}`}
              breakpoints={DIALOG_MASONRY_BREAKPOINTS}
              gap={16}
              renderItem={item => (
                <article
                  className="cursor-pointer overflow-hidden rounded-[var(--radius-lg-design)]"
                  style={{ background: cardBg, border: `1px solid ${border}` }}
                  onMouseEnter={() => handleInspirationCardMouseEnter(`${item.rank}-${item.title}`)}
                  onMouseLeave={handleInspirationCardMouseLeave}
                  onDoubleClick={() => setSelectedItem(item)}
                >
                  <div className="relative overflow-hidden bg-[#171717]" data-inspiration-dialog-card-fit="" style={{ minHeight: 120 }}>
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="block h-auto w-full transition-transform duration-300 ease-out"
                      style={{ transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)" }}
                      loading="lazy"
                    />
                    <CardHoverOverlay visible={hoveredItemKey === `${item.rank}-${item.title}`} dim={0.18} />
                    {/*
                      hover 时图片正中「一键同款」（与专题页 InspirationCard 同一交互）。
                      ⚠️ 隐藏态连点击一起关：opacity:0 的元素照样接点击，会误触。
                    */}
                    <div
                      className="absolute inset-0 z-30 flex items-center justify-center"
                      style={{ pointerEvents: hoveredItemKey === `${item.rank}-${item.title}` ? "auto" : "none" }}
                    >
                      <button
                        type="button"
                        data-inspiration-dialog-same-style=""
                        onClick={event => { event.stopPropagation(); onApplySameStyle(item); }}
                        onDoubleClick={event => event.stopPropagation()}
                        className="whitespace-nowrap rounded-[var(--radius-pill)] px-4 py-1.5 text-[12px] font-medium transition-all duration-150 hover:scale-105 active:scale-95"
                        style={{
                          background: "#ffffff",
                          color: "#161616",
                          boxShadow: "0 2px 12px rgba(0,0,0,0.22)",
                          opacity: hoveredItemKey === `${item.rank}-${item.title}` ? 1 : 0,
                          transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1)" : "scale(0.92)",
                        }}
                        tabIndex={hoveredItemKey === `${item.rank}-${item.title}` ? 0 : -1}
                        aria-label="一键同款"
                        title="一键同款"
                      >
                        一键同款
                      </button>
                    </div>
                  </div>
                </article>
              )}
            />
            {visibleItems.length === 0 && <p className="py-12 text-center type-body-sm" style={{ color: sub }}>暂无可用灵感</p>}
            </>
          )}
          {!selectedItem && canLoadMore && (
            <div className="col-span-full flex justify-center pt-2 pb-1">
              <button
                type="button"
                onClick={() => setVisibleCount(count => count + DIALOG_PAGE_SIZE)}
                className="rounded-[var(--radius-pill)] px-5 py-2 type-caption"
                style={{ border: `1px solid ${border}`, color: text, background: cardBg }}
              >
                加载更多
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
