/**
 * InspirationPage — AI image prompt gallery.
 * 样式对标截图2 "创作模板" 风格：
 * 顶部搜索栏 + 分类 tab (横向滚动) + 编辑精选轮播 + 探索灵感网格
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { Search, Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";
import { InspirationCard } from "@/components/inspiration/InspirationCard";
import { InspirationReactionButton } from "@/components/inspiration/InspirationReactionButton";
import { useInspirationReactions } from "@/hooks/useInspirationReactions";
import { normalizeInspirationIdentity } from "@/lib/inspiration-identity";
import {
  getInspirationFavoriteBaseCount,
  getInspirationLikeBaseCount,
} from "@/lib/inspiration-metrics";
import {
  INSPIRATION_TARGET_COUNT,
  INSPIRATION_TAXONOMY,
  fetchInspirationFeed,
  getInspirationFallbackFeed,
  type InspirationFeedItem,
} from "@/lib/inspiration-feed";
import { getDisplayLikeCount } from "@/lib/inspiration-reactions";
import { applyInspirationSameStyle } from "@/lib/inspiration-same-style";
import { CardHoverOverlay } from "@/components/ui/card-hover-overlay";

/**
 * ⚠️ 直接复用共享类型，**不要在这里另抄一份字段列表**。
 * 抄一份的代价：将来共享模块加字段，这里不会报错，只是悄悄少一块数据。
 */
type PromptItem = InspirationFeedItem;

const ALL_GROUPS = "全部分类";
const ALL_SUBCATEGORIES = "全部";
const INSPIRATION_PAGE_SIZE = 50;

// 编辑精选分类 tab - 对应截图2的分类导航
const EDITOR_TABS = ["精选", "订阅", "大师设计", "节日推荐", "品牌风格", "极简主义", "赛博朋克"] as const;

function getParam(name: string, fallback: string) {
  const value = new URLSearchParams(globalThis.location?.search || "").get(name);
  return value || fallback;
}

function normalizeGroupParam(value: string) {
  if (value === "全部大类") return ALL_GROUPS;
  return value;
}

function normalizeSubcategoryParam(value: string) {
  if (value === "全部子类") return ALL_SUBCATEGORIES;
  return value;
}

function getInitialGroupParam() {
  const group = normalizeGroupParam(getParam("group", ALL_GROUPS));
  if (group === ALL_GROUPS || INSPIRATION_TAXONOMY[group]) return group;
  return ALL_GROUPS;
}

function getInitialSubcategoryParam() {
  const subcategory = normalizeSubcategoryParam(getParam("subcategory", ALL_SUBCATEGORIES));
  if (subcategory === ALL_SUBCATEGORIES || Object.values(INSPIRATION_TAXONOMY).flat().includes(subcategory)) return subcategory;
  return ALL_SUBCATEGORIES;
}


export default function InspirationPage() {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [activeGroup, setActiveGroup] = useState(getInitialGroupParam);
  const [activeSubcategory, setActiveSubcategory] = useState(getInitialSubcategoryParam);
  const [selectedItem, setSelectedItem] = useState<PromptItem | null>(null);
  const [externalItems, setExternalItems] = useState<PromptItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(INSPIRATION_PAGE_SIZE);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeEditorTab, setActiveEditorTab] = useState<string>(EDITOR_TABS[0]);
  const [featuredScrollPos, setFeaturedScrollPos] = useState(0);
  const featuredScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const promptScrollRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [detailImageHeight, setDetailImageHeight] = useState<number | null>(null);
  /**
   * 点赞 / 收藏状态。与首页、个人中心共用同一份唯一事实源，
   * ⚠️ 这里取消收藏，个人中心对应 tab 必须同步消失（用户明确要求）。
   */
  const inspirationReactions = useInspirationReactions();

  /** 把列表项转成沉淀快照。个人中心要按专题页卡片原样渲染，所以字段必须给全。 */
  const toReactionItem = (item: PromptItem) => ({
    id: normalizeInspirationIdentity(item.title),
    title: item.title,
    field: item.field,
    group: item.group,
    subcategory: item.subcategory,
    description: item.description,
    prompt: item.prompt,
    imageUrl: item.imageUrl,
  });

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleInspirationCardMouseEnter = (itemKey: string) => {
    if (hoveredItemKey === itemKey) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    // 零延迟：立即显示 hover 覆盖层，无需 500ms 确认期
    setHoveredItemKey(itemKey);
    hoverTimerRef.current = null;
  };

  const handleInspirationCardMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredItemKey(null);
  };

  const bg = isDark ? "#222222" : "var(--design-surface-soft)";
  const text = isDark ? "#161616" : "#161616";
  const sub = isDark ? "#161616" : "#666666";
  const cardBg = isDark ? "#161616" : "#ffffff";
  const panelBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)";
  const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
  const activeBg = isDark ? "rgba(22,22,22,0.20)" : "rgba(22,22,22,0.10)";
  const shadow = isDark ? "0 18px 46px rgba(0,0,0,0.24)" : "0 14px 34px rgba(0,0,0,0.08)";

  const allPromptItems = useMemo(() => externalItems, [externalItems]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allPromptItems) {
      counts.set(item.group, (counts.get(item.group) || 0) + 1);
      counts.set(item.subcategory, (counts.get(item.subcategory) || 0) + 1);
    }
    return counts;
  }, [allPromptItems]);
  const visibleGroups = useMemo(
    () => [ALL_GROUPS, ...Object.keys(INSPIRATION_TAXONOMY).filter(group => (categoryCounts.get(group) || 0) > 0)],
    [categoryCounts]
  );
  const availableSubcategories = useMemo(() => {
    const scopedSubcategories = activeGroup === ALL_GROUPS
      ? Object.values(INSPIRATION_TAXONOMY).flat()
      : INSPIRATION_TAXONOMY[activeGroup] || [];

    return [
      ALL_SUBCATEGORIES,
      ...scopedSubcategories.filter(subcategory => (categoryCounts.get(subcategory) || 0) > 0),
    ];
  }, [activeGroup, categoryCounts]);
  const filteredItems = useMemo(() => {
    return allPromptItems.filter((item) => {
      const matchesGroup = activeGroup === ALL_GROUPS || item.group === activeGroup;
      const matchesSubcategory = activeSubcategory === ALL_SUBCATEGORIES || item.subcategory === activeSubcategory;
      const matchesSearch = !searchQuery.trim() || 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.field.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesGroup && matchesSubcategory && matchesSearch;
    });
  }, [activeGroup, activeSubcategory, allPromptItems, searchQuery]);
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  const canLoadMore = visibleCount < filteredItems.length;

  useEffect(() => {
    setVisibleCount(INSPIRATION_PAGE_SIZE);
  }, [activeGroup, activeSubcategory]);

  /*
   * 拉取远程灵感。
   * 📌 与首页**共用** `fetchInspirationFeed` —— 同接口、同映射、同 title，
   * 这是两页头像与点赞数能一致的前提（详见 `inspiration-feed.ts` 文件头）。
   */
  useEffect(() => {
    const controller = new AbortController();

    fetchInspirationFeed(controller.signal, INSPIRATION_TARGET_COUNT)
      .then(items => {
        if (controller.signal.aborted) return;
        /*
         * ⚠️ 远程返回空数组也要退兜底：接口 200 但 references 为空时，
         * 直接 setExternalItems([]) 会让页面空态，和请求失败的后果一样。
         */
        setExternalItems(items.length > 0 ? items : getInspirationFallbackFeed());
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        /*
         * ⚠️⚠️⚠️ 改之前这里**只打一条 warn 就什么都不做**，
         * `externalItems` 停在初始空数组 → 整个专题页空态，一条内容都没有。
         * 那种状态下用户看到的不是「两页对不上」，而是「灵感推荐页全空了」。
         *
         * 📌 现在退回与首页**同一份**兜底（`getInspirationFallbackFeed`）：
         * 远程挂掉时两页都有内容，且因为 title 同源，
         * 头像与点赞收藏数**仍然逐条一致** —— 这就是「既有内容又完全一致」。
         */
        if (controller.signal.aborted) return;
        console.warn("[inspiration] external references failed, fallback to shared csv", error);
        setExternalItems(getInspirationFallbackFeed());
      });

    return () => controller.abort();
  }, []);

  const measureSelectedImage = () => {
    const height = selectedImageRef.current?.getBoundingClientRect().height || 0;
    if (height > 0) setDetailImageHeight(Math.round(height));
  };

  useEffect(() => {
    if (!selectedItem) {
      setDetailImageHeight(null);
      return;
    }

    const animationFrame = window.requestAnimationFrame(measureSelectedImage);
    window.addEventListener("resize", measureSelectedImage);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", measureSelectedImage);
    };
  }, [selectedItem]);

  const scrollPromptDetail = (event: React.WheelEvent<HTMLDivElement>) => {
    const promptPanel = promptScrollRef.current;
    if (!promptPanel) return;
    const target = event.target as Node;
    if (promptPanel.contains(target)) return;

    event.preventDefault();
    promptPanel.scrollTop += event.deltaY;
  };

  const updateFilters = (nextGroup: string, nextSubcategory = ALL_SUBCATEGORIES) => {
    setActiveGroup(nextGroup);
    setActiveSubcategory(nextSubcategory);
    const params = new URLSearchParams();
    if (nextGroup !== ALL_GROUPS) params.set("group", nextGroup);
    if (nextSubcategory !== ALL_SUBCATEGORIES) params.set("subcategory", nextSubcategory);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
  };

  const updateSubcategory = (nextSubcategory: string) => {
    setActiveSubcategory(nextSubcategory);
    const params = new URLSearchParams();
    if (activeGroup !== ALL_GROUPS) params.set("group", activeGroup);
    if (nextSubcategory !== ALL_SUBCATEGORIES) params.set("subcategory", nextSubcategory);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
  };

  /**
   * 一键同款。
   *
   * 只做一件事：把模板图带进新画布，并挂到提示词输入框的引用区，
   * 然后停下来等用户写提示词（不自动出图 —— 一次生成要扣积分）。
   *
   * ⚠️ 具体实现收口在 `@/lib/inspiration-same-style`：个人中心的
   * 「我赞过的 / 我的收藏」用的是同一个动作，两处必须是同一份代码。
   */
  const applySameStyle = (item: PromptItem) => {
    // 取图 + 建画板是异步的（图要先固化进载荷），这里不 await：
    // 函数内部自己兜住异常并 toast，页面不需要为它挂 loading 态。
    void applyInspirationSameStyle(
      { title: item.title, imageUrl: item.imageUrl },
      navigate
    );
  };

  const scrollFeatured = (dir: "left" | "right") => {
    const el = featuredScrollRef.current;
    if (!el) return;
    const scrollAmount = 340;
    el.scrollBy({ left: dir === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0, zIndex: 0 }} />
      )}
      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1, background: isDark ? "#171717" : "var(--design-surface-soft)" }}>
        <main className="mx-auto px-5 py-6 sm:px-8" style={{ maxWidth: 1320 }}>

          {/* ── 顶部搜索栏 ── */}
          <section className="mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: isDark ? "#666666" : "#999999" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索灵感模板、提示词..."
                  className="w-full rounded-[var(--radius-pill)] py-2.5 pl-10 pr-4 text-[13px] outline-none transition-all"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
                    color: text,
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                    aria-label="清除搜索"
                  >
                    <X size={13} style={{ color: isDark ? "#666666" : "#999999" }} />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── 分类 Tab (横向滚动) ── */}
          <section className="mb-6">
            <div
              className="flex items-center gap-1 overflow-x-auto pb-1"
              role="tablist"
              aria-label="主分类筛选"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {/* 主分类 tab */}
              {visibleGroups.map((group) => {
                const active = group === activeGroup;
                return (
                  <button
                    key={group}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => updateFilters(group)}
                    className="shrink-0 whitespace-nowrap px-4 py-2 text-[13px] font-medium transition-all relative"
                    style={{
                      color: active ? (isDark ? "white" : "#161616") : (isDark ? "#888888" : "#999999"),
                      borderBottom: active
                        ? `2px solid ${isDark ? "white" : "#161616"}`
                        : "2px solid transparent",
                    }}
                  >
                    {group}
                  </button>
                );
              })}
            </div>
            {/* 分隔线 */}
            <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />

            {/* 子分类 pill */}
            {availableSubcategories.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="细分类筛选">
                {availableSubcategories.map((subcategory) => {
                  const active = subcategory === activeSubcategory;
                  return (
                    <button
                      key={subcategory}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => updateSubcategory(subcategory)}
                      className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] px-3.5 py-1.5 text-[12px] transition-all active:scale-95"
                      style={{
                        background: active ? (isDark ? "#ffffff" : "#161616") : "transparent",
                        border: "1px solid var(--artx-action-border)",
                        color: active ? (isDark ? "#161616" : "#ffffff") : sub,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {subcategory}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 编辑精选轮播 ── (仅无搜索词时显示) */}
          {!searchQuery && visibleItems.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} style={{ color: isDark ? "#888888" : "#555555" }} />
                  <span className="text-[14px] font-semibold" style={{ color: text }}>编辑精选</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => scrollFeatured("left")}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                      border: `1px solid ${border}`,
                    }}
                    aria-label="向左滚动"
                  >
                    <ChevronLeft size={13} style={{ color: isDark ? "#cccccc" : "#555555" }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollFeatured("right")}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                      border: `1px solid ${border}`,
                    }}
                    aria-label="向右滚动"
                  >
                    <ChevronRight size={13} style={{ color: isDark ? "#cccccc" : "#555555" }} />
                  </button>
                </div>
              </div>

              {/* 精选轮播容器 */}
              <div
                ref={featuredScrollRef}
                className="flex gap-4 overflow-x-auto pb-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {visibleItems.slice(0, 8).map((item) => (
                  <article
                    key={`featured-${item.rank}-${item.title}`}
                    onClick={() => setSelectedItem(item)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedItem(item); } }}
                    role="button"
                    tabIndex={0}
                    className="group shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-lg-design)] transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      width: 320,
                      background: cardBg,
                      border: `1px solid ${border}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                    onMouseEnter={() => handleInspirationCardMouseEnter(`featured-${item.rank}-${item.title}`)}
                    onMouseLeave={handleInspirationCardMouseLeave}
                  >
                    {/* 封面图 16:10 */}
                    <div className="relative overflow-hidden bg-[#1a1a1a]" style={{ aspectRatio: "16 / 10" }}>
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="relative z-10 h-full w-full object-cover transition-transform duration-500 ease-out"
                        style={{
                          transform: hoveredItemKey === `featured-${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)",
                        }}
                        loading="lazy"
                        onError={e => { e.currentTarget.style.display = "none"; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a1a1a, #2a2a2a)", zIndex: 0 }}>
                        <span className="text-[11px]" style={{ color: "#666" }}>待加载</span>
                      </div>
                      {/* hover 压暗层：与网格卡片同一份实现（不承载按钮，见 InspirationCard 注释） */}
                      <CardHoverOverlay
                        visible={hoveredItemKey === `featured-${item.rank}-${item.title}`}
                        dim={0.18}
                      />
                      {/* 封面正中央「一键同款」：与网格卡片一致，零延迟淡入，居中覆盖 */}
                      <div
                        className="absolute inset-0 z-30 flex items-center justify-center"
                        style={{ pointerEvents: hoveredItemKey === `featured-${item.rank}-${item.title}` ? "auto" : "none" }}
                      >
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            applySameStyle(item);
                          }}
                          className="whitespace-nowrap rounded-[var(--radius-pill)] px-4 py-1.5 text-[12px] font-medium transition-all duration-150 hover:scale-105 active:scale-95"
                          style={{
                            background: "#ffffff",
                            color: "#161616",
                            boxShadow: "0 2px 12px rgba(0,0,0,0.22)",
                            opacity: hoveredItemKey === `featured-${item.rank}-${item.title}` ? 1 : 0,
                            transform: hoveredItemKey === `featured-${item.rank}-${item.title}` ? "scale(1)" : "scale(0.92)",
                          }}
                          tabIndex={hoveredItemKey === `featured-${item.rank}-${item.title}` ? 0 : -1}
                          aria-label="一键同款"
                          title="一键同款"
                        >
                          一键同款
                        </button>
                      </div>
                    </div>
                    {/* 底部元信息 */}
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold" style={{ color: text }}>{item.title}</p>
                        <p className="truncate text-[11px] mt-0.5" style={{ color: sub }}>{item.field}</p>
                      </div>
                      <span
                        className="ml-2 shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px]"
                        style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", color: sub }}
                      >
                        模板
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ── 探索灵感网格 ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-semibold" style={{ color: text }}>
                {searchQuery ? `搜索结果` : "探索灵感"}
                {/* 🔒 2026-11-13 用户要求：灵感总数不在前端显示 */}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((item) => {
                const identity = normalizeInspirationIdentity(item.title);
                return (
                  <InspirationCard
                    key={`${item.rank}-${item.title}`}
                    item={item}
                    isDark={isDark}
                    cardBg={cardBg}
                    border={border}
                    shadow={shadow}
                    text={text}
                    sub={sub}
                    activeBg={activeBg}
                    hovered={hoveredItemKey === `${item.rank}-${item.title}`}
                    onOpen={() => setSelectedItem(item)}
                    onMouseEnter={() => handleInspirationCardMouseEnter(`${item.rank}-${item.title}`)}
                    onMouseLeave={handleInspirationCardMouseLeave}
                    onApplySameStyle={() => applySameStyle(item)}
                    reactionSlot={
                      <InspirationReactionButton
                        kind="like"
                        active={inspirationReactions.isActive("like", identity)}
                        idleColor={sub}
                        count={getDisplayLikeCount(
                          getInspirationLikeBaseCount(item.title),
                          inspirationReactions.isActive("like", identity)
                        )}
                        onToggle={() => inspirationReactions.toggle("like", toReactionItem(item))}
                      />
                    }
                  />
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="rounded-[var(--radius-lg-design)] p-10 text-center" style={{ background: panelBg, border: `1px solid ${border}` }}>
                <p className="text-[14px] font-medium" style={{ color: text }}>
                  {searchQuery ? `未找到「${searchQuery}」相关内容` : "当前分类暂无内容"}
                </p>
                <p className="mt-2 text-[12px]" style={{ color: sub }}>
                  {searchQuery ? "试试其他关键词，或清除搜索查看全部" : "后续导入数据后会自动显示"}
                </p>
              </div>
            )}

            {canLoadMore && (
              <div className="flex justify-center pt-6">
                <button
                  type="button"
                  onClick={() => setVisibleCount(c => Math.min(c + INSPIRATION_PAGE_SIZE, filteredItems.length, INSPIRATION_TARGET_COUNT))}
                  className="rounded-[var(--radius-pill)] px-6 py-2.5 text-[13px] transition-all hover:scale-[1.02] active:scale-95"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                    border: `1px solid ${border}`,
                    color: text,
                  }}
                >
                  加载更多
                </button>
              </div>
            )}
          </section>

        </main>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ background: "rgba(34,34,34,0.72)", backdropFilter: "blur(10px)" }} onClick={() => setSelectedItem(null)}>
          <section
            data-artx-dialog-surface
            className="relative max-h-full w-full overflow-hidden rounded-[var(--radius-lg-design)]"
            style={{ maxWidth: 980, background: isDark ? "#222222" : cardBg, border: `1px solid ${border}` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute right-3 top-3 z-10 flex items-center" style={{ gap: 16 }}>
              {/*
                详情浮窗的点赞与五角星收藏（需求 5）。
                ⚠️ 与卡片、首页共用同一份状态源 —— 这里取消，
                个人中心「我赞过的 / 我的收藏」必须同步消失。
              */}
              <span
                className="flex shrink-0 items-center rounded-[var(--radius-pill)] px-3 py-2"
                style={{
                  gap: 14,
                  background: isDark ? "rgba(34,34,34,0.88)" : "rgba(255,255,255,0.88)",
                  border: `1px solid ${border}`,
                  backdropFilter: "blur(12px)",
                }}
              >
                <InspirationReactionButton
                  kind="like"
                  size={16}
                  idleColor={sub}
                  active={inspirationReactions.isActive(
                    "like",
                    normalizeInspirationIdentity(selectedItem.title)
                  )}
                  count={getDisplayLikeCount(
                    getInspirationLikeBaseCount(selectedItem.title),
                    inspirationReactions.isActive(
                      "like",
                      normalizeInspirationIdentity(selectedItem.title)
                    )
                  )}
                  onToggle={() =>
                    inspirationReactions.toggle("like", toReactionItem(selectedItem))
                  }
                />
                {/*
                  收藏数。⚠️ 改之前**全站没有任何地方显示收藏数**，
                  用户点了收藏只有颜色变化、没有数值反馈。
                  基数走 seed 的另一段位（见 inspiration-metrics.ts），
                  避免和点赞数强相关甚至相等。
                */}
                <InspirationReactionButton
                  kind="favorite"
                  size={16}
                  idleColor={sub}
                  active={inspirationReactions.isActive(
                    "favorite",
                    normalizeInspirationIdentity(selectedItem.title)
                  )}
                  count={getDisplayLikeCount(
                    getInspirationFavoriteBaseCount(selectedItem.title),
                    inspirationReactions.isActive(
                      "favorite",
                      normalizeInspirationIdentity(selectedItem.title)
                    )
                  )}
                  onToggle={() =>
                    inspirationReactions.toggle("favorite", toReactionItem(selectedItem))
                  }
                />
              </span>
              {/*
                2026-11-13 用户要求：灵感模板提示词全站一律不展示（登录与否都不展示），
                原「复制提示词」图标换成「一键同款」快捷按钮 —— 图进画布 + 挂进输入框引用。
              */}
              <button
                type="button"
                onClick={() => applySameStyle(selectedItem)}
                className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] px-3.5 py-1.5 text-[12px] font-medium transition-all hover:scale-105 active:scale-95"
                style={{ background: "#ffffff", border: `1px solid ${border}`, color: "#161616", backdropFilter: "blur(12px)" }}
                data-inspiration-detail-same-style=""
                aria-label="一键同款"
                title="一键同款"
              >
                一键同款
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="shrink-0 rounded-[var(--radius-pill)] p-2 transition-all hover:scale-105 active:scale-95"
                style={{ background: isDark ? "rgba(34,34,34,0.88)" : "rgba(255,255,255,0.88)", border: `1px solid ${border}`, color: text, backdropFilter: "blur(12px)" }}
                aria-label="关闭弹层"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 pr-14" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-pill)] border px-2.5 py-1 type-caption" style={{ background: "transparent", color: "var(--artx-action-fg)", borderColor: "var(--artx-action-border)", letterSpacing: 0, textTransform: "none" }}>
                    {selectedItem.field}
                  </span>
                </div>
                <h2 className="type-body-sm leading-6" style={{ color: text, fontWeight: 760 }}>{selectedItem.title}</h2>
              </div>
            </div>

            <div
              className="grid items-start overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]"
              style={{ maxHeight: "calc(100vh - 160px)", overscrollBehavior: "contain" }}
              onWheel={scrollPromptDetail}
            >
              <div className="bg-[#222222]">
                <div className="relative">
                  <img
                    ref={selectedImageRef}
                    src={selectedItem.imageUrl}
                    alt={selectedItem.title}
                    className="relative z-10 block h-auto max-h-[calc(100vh-160px)] w-full object-contain"
                    onLoad={measureSelectedImage}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center px-8 text-center" style={{ background: "linear-gradient(135deg, #1a1a1a, #1a1a1a)" }}>
                    <span className="type-body-sm" style={{ color: "#e6e3df", fontWeight: 650 }}>
                      本地图片待同步
                    </span>
                  </div>
                </div>
              </div>
              <div
                ref={promptScrollRef}
                className="overflow-y-auto p-4"
                style={{
                  height: detailImageHeight ? `${detailImageHeight}px` : "auto",
                  maxHeight: detailImageHeight ? `${detailImageHeight}px` : "calc(100vh - 160px)",
                  overscrollBehavior: "contain",
                }}
              >
                <p className="type-caption leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>{selectedItem.description}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
