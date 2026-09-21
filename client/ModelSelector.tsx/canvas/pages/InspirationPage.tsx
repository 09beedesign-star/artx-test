/**
 * InspirationPage — AI image prompt gallery.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import TopBar from "@/components/workspace/TopBar";
import { useTheme } from "@/contexts/ThemeContext";
import { Copy, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
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
import { createWorkspaceHistoryProject } from "@/lib/project-history";
import { writeHomePromptHandoff } from "@/lib/home-prompt-handoff";

/**
 * ⚠️ 直接复用共享类型，**不要在这里另抄一份字段列表**。
 * 抄一份的代价：将来共享模块加字段，这里不会报错，只是悄悄少一块数据。
 */
type PromptItem = InspirationFeedItem;

const ALL_GROUPS = "全部分类";
const ALL_SUBCATEGORIES = "全部";
const INSPIRATION_PAGE_SIZE = 50;

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

  const bg = isDark ? "#171717" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.73 0.010 270)" : "oklch(0.49 0.01 270)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const panelBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(1 0 0 / 0.72)";
  const border = isDark ? "oklch(1 0 0 / 9%)" : "oklch(0 0 0 / 8%)";
  const activeBg = isDark ? "oklch(0.62 0.22 290 / 0.20)" : "oklch(0.62 0.18 290 / 0.10)";
  const shadow = isDark ? "0 18px 46px oklch(0 0 0 / 0.24)" : "0 14px 34px oklch(0 0 0 / 0.08)";

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
      return matchesGroup && matchesSubcategory;
    });
  }, [activeGroup, activeSubcategory, allPromptItems]);
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
   * 一键导入画布。
   *
   * ⚠️ 复用首页「输入提示词 → 建画布」那条现成链路
   * （`createWorkspaceHistoryProject` + `writeHomePromptHandoff`），
   * 📌 不另起一套：交接载荷的字段一旦有第二个写入方，
   * 消费侧（CanvasAssistantPanel）改了格式，这边就会静默失效。
   *
   * ⚠️ 只带提示词、不带图片：灵感图是远程 URL，而交接通道要求 data:URL，
   * 硬塞进去画布侧会拿到一个加载不出来的引用图（且不报错）。
   */
  const importToCanvas = (item: PromptItem) => {
    const text = item.prompt?.trim() || item.title;
    const title = text.length > 18 ? `${text.slice(0, 18)}...` : text;
    const project = createWorkspaceHistoryProject(title || undefined, text);
    writeHomePromptHandoff({
      projectId: project.id,
      prompt: text,
      model: "auto",
      // 刻意不自动跑：用户可能只是想把灵感提示词拿进画布再改，
      // 自动出图会直接扣积分。涉及花钱的动作不替用户做决定。
      shouldAutoRun: false,
      createdAt: project.createdAt,
    });
    toast("已导入画布", { description: item.title });
    navigate(`/project/${project.id}`);
  };

  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast("提示词已复制");
    } catch {
      toast("复制失败", { description: "请手动复制提示词内容" });
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} glass />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1, background: isDark ? "#171717" : "var(--design-surface-soft)" }}>
        <main className="mx-auto px-5 py-8 sm:px-8 sm:py-10" style={{ maxWidth: 1320 }}>
          <section className="mb-6">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={15} style={{ color: "oklch(0.72 0.22 290)" }} />
                <span className="type-caption" style={{ color: "oklch(0.72 0.22 290)" }}>AI 图片生成提示词图库</span>
              </div>
              <h1 className="type-display-sm" style={{ color: text, letterSpacing: 0 }}>超多优质 AI 图片灵感提示词持续更新中，一键复制，你也能生成高质量的 AI 图片。</h1>
              <p className="type-body-sm mt-3 max-w-3xl leading-6" style={{ color: sub }}>
                汇总热门 AI 图片案例，按分类浏览图片与提示词。
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-[var(--radius-lg-design)] p-3.5" style={{ background: panelBg, border: `1px solid ${border}`, backdropFilter: "blur(18px)" }}>
            <div className="flex flex-col gap-3">
              <div
                className="flex flex-wrap items-center gap-2"
                role="tablist"
                aria-label="主分类筛选"
              >
                {visibleGroups.map((group) => {
                  const active = group === activeGroup;
                  const count = group === ALL_GROUPS ? allPromptItems.length : categoryCounts.get(group) || 0;
                  return (
                    <button
                      key={group}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => updateFilters(group)}
                      className="max-w-[168px] shrink-0 truncate whitespace-nowrap rounded-[var(--radius-pill)] px-4 py-2.5 type-caption transition-all active:scale-95"
                      style={{
                        background: active ? activeBg : "transparent",
                        border: `1px solid ${active ? "oklch(0.62 0.22 290 / 0.42)" : "transparent"}`,
                        color: active ? "oklch(0.84 0.14 290)" : sub,
                        fontWeight: active ? 760 : 650,
                      }}
                    >
                      {group}
                      <span style={{ opacity: 0.62 }}> {count}</span>
                    </button>
                  );
                })}
              </div>

              <div
                aria-hidden="true"
                className="h-px w-full"
                style={{ background: isDark ? "oklch(1 0 0 / 14%)" : "oklch(0 0 0 / 12%)" }}
              />

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="细分类筛选">
                  {availableSubcategories.map((subcategory) => {
                    const active = subcategory === activeSubcategory;
                    const count = subcategory === ALL_SUBCATEGORIES
                      ? allPromptItems.filter(item => activeGroup === ALL_GROUPS || item.group === activeGroup).length
                      : categoryCounts.get(subcategory) || 0;
                    return (
                      <button
                        key={subcategory}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => updateSubcategory(subcategory)}
                        className="max-w-[168px] shrink-0 truncate whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-2 type-caption transition-all active:scale-95"
                        style={{
                          background: active ? "oklch(0.72 0.18 200 / 0.16)" : "transparent",
                          border: `1px solid ${active ? "oklch(0.72 0.18 200 / 0.38)" : border}`,
                          color: active ? "oklch(0.80 0.13 200)" : sub,
                        }}
                      >
                        {subcategory}
                        <span style={{ opacity: 0.62 }}> {count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
              当前显示 {visibleItems.length} / {filteredItems.length} 组
            </p>
          </div>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  onCopyPrompt={() => copyPrompt(item.prompt)}
                  onImportToCanvas={() => importToCanvas(item)}
                  reactionSlot={
                    /*
                     * ⚠️ 这里原来**没有传 count** —— 专题页的卡片只有一颗心，没有数字，
                     * 于是用户点赞后毫无反馈（用户明确要求「点赞收藏之后都要有增加数值」）。
                     * 基数来自 title 哈希，与首页同一个纯函数，两页数字必然相同。
                     */
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
          </section>
          {filteredItems.length === 0 && (
            <section className="rounded-[var(--radius-lg-design)] p-8 text-center" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <p className="type-body-sm" style={{ color: text, fontWeight: 720 }}>当前分类暂无图片和提示词</p>
              <p className="type-caption mt-2" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                后续导入该分类的数据后，这里会自动显示对应图片和提示词。
              </p>
            </section>
          )}
          {canLoadMore && (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                onClick={() => setVisibleCount(count => Math.min(count + INSPIRATION_PAGE_SIZE, filteredItems.length, INSPIRATION_TARGET_COUNT))}
                className="rounded-[var(--radius-pill)] px-5 py-2.5 type-caption transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  background: activeBg,
                  border: "1px solid oklch(0.62 0.22 290 / 0.42)",
                  color: "oklch(0.84 0.14 290)",
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              >
                加载更多
              </button>
            </div>
          )}
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
                  background: isDark ? "rgba(34,34,34,0.88)" : "oklch(1 0 0 / 0.88)",
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
              <button
                onClick={() => copyPrompt(selectedItem.prompt)}
                className="shrink-0 rounded-[var(--radius-pill)] p-2 transition-all hover:scale-105 active:scale-95"
                style={{ background: isDark ? "rgba(34,34,34,0.88)" : "oklch(1 0 0 / 0.88)", border: `1px solid ${border}`, color: text, backdropFilter: "blur(12px)" }}
                aria-label="复制提示词"
                title="复制提示词"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="shrink-0 rounded-[var(--radius-pill)] p-2 transition-all hover:scale-105 active:scale-95"
                style={{ background: isDark ? "rgba(34,34,34,0.88)" : "oklch(1 0 0 / 0.88)", border: `1px solid ${border}`, color: text, backdropFilter: "blur(12px)" }}
                aria-label="关闭弹层"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 pr-14" style={{ borderBottom: `1px solid ${border}` }}>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: activeBg, color: "oklch(0.80 0.17 290)", letterSpacing: 0, textTransform: "none" }}>
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
                  <div className="absolute inset-0 flex items-center justify-center px-8 text-center" style={{ background: "linear-gradient(135deg, oklch(0.20 0.05 290), oklch(0.18 0.04 205))" }}>
                    <span className="type-body-sm" style={{ color: "oklch(0.88 0.02 270)", fontWeight: 650 }}>
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
                <div className="mt-4 rounded-[var(--radius-md-design)] p-4" style={{ background: isDark ? "#222222" : "oklch(0 0 0 / 0.035)", border: `1px solid ${border}` }}>
                  <p className="whitespace-pre-wrap type-caption leading-6" style={{ color: text, letterSpacing: 0, textTransform: "none" }}>
                    {selectedItem.prompt}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
