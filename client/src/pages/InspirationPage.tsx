/**
 * InspirationPage — AI image prompt gallery.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import TopBar from "@/components/workspace/TopBar";
import promptCsv from "@/data/ai_image_prompt_rank_50.csv?raw";
import { useTheme } from "@/contexts/ThemeContext";
import { Copy, ImageIcon, Layers, Sparkles, Tags, X } from "lucide-react";
import { toast } from "sonner";
import { BG_GLOW } from "@/lib/workspace-data";
import { defaultApiBaseUrlForCurrentHost, normalizeApiBaseUrl } from "@/lib/api-base-url";

type PromptItem = {
  rank: number;
  group: string;
  subcategory: string;
  field: string;
  model: string;
  title: string;
  description: string;
  prompt: string;
  imageUrl: string;
  author: string;
  sourceSite?: string;
  sourceUrl?: string;
  licenseNote?: string;
  isExternal?: boolean;
};

type InspirationReference = {
  id: string;
  group: string;
  subcategory: string;
  sourceSite: string;
  sourceUrl: string;
  imageUrl: string;
  proxyImageUrl: string;
  title: string;
  prompt: string;
  stylePromptEn: string;
  licenseNote: string;
};

const ALL_GROUPS = "全部大类";
const ALL_SUBCATEGORIES = "全部子类";
const ALL_MODELS = "全部模型";
const INSPIRATION_PAGE_SIZE = 50;

const INSPIRATION_TAXONOMY: Record<string, string[]> = {
  行业品类: ["服装", "化妆品", "游戏", "母婴亲子", "美食饮品", "AI智能", "教育", "汽车相关", "3C数码", "医美纤体", "宠物广告", "家居美学", "运动户外"],
  品牌商业: ["商务视觉", "VI套件", "营销活动", "B端视觉设计", "UI设计", "陈列展示", "机制图设计"],
  风格美术: ["生活美学", "酸性视觉", "复古未来主义", "Vintage复古", "赛博美术", "美式嘻哈", "和风", "中国现代", "怪诞美学", "二次元"],
  人物角色: ["肖像特写", "AI角色设", "古装宫廷"],
  空间对象: ["工业概念", "概念设计", "建筑效果", "游戏道具"],
  图形技法: ["字体排版", "铅笔线描"],
  影像叙事: ["分镜脚本", "镜头提示词"],
  节庆文化: ["传统节庆", "国际节庆"],
  其他分类: ["其他"],
};

function classifyLegacyField(field: string): { group: string; subcategory: string } {
  if (/logo/i.test(field)) return { group: "品牌商业", subcategory: "VI套件" };
  if (/广告|电商|海报|电影/.test(field)) return { group: "品牌商业", subcategory: "营销活动" };
  if (/IP/.test(field)) return { group: "人物角色", subcategory: "AI角色设" };
  if (/视觉|创意/.test(field)) return { group: "品牌商业", subcategory: "商务视觉" };
  return { group: "其他分类", subcategory: "其他" };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuote) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuote = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function loadPromptItems(csv: string): PromptItem[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = rows[0] ?? [];
  const get = (record: string[], key: string) => record[header.indexOf(key)]?.trim() ?? "";

  return rows
    .slice(1)
    .filter((record) => record.length > 1)
    .map((record) => {
      const field = get(record, "field");
      const category = classifyLegacyField(field);
      return {
        rank: Number(get(record, "rank")) || 0,
        group: category.group,
        subcategory: category.subcategory,
        field,
        model: get(record, "model"),
        title: get(record, "title"),
        description: get(record, "description"),
        prompt: get(record, "prompt"),
        imageUrl: get(record, "image_url"),
        author: get(record, "author"),
      };
    })
    .filter((item) => item.title && item.imageUrl);
}

function getParam(name: string, fallback: string) {
  const value = new URLSearchParams(globalThis.location?.search || "").get(name);
  return value || fallback;
}

const PROMPT_ITEMS = loadPromptItems(promptCsv);

function getInspirationApiBaseUrl() {
  const env = import.meta.env as Record<string, string | undefined>;
  return normalizeApiBaseUrl(
    env.VITE_API_BASE_URL ||
    env.VITE_TEST_BACKEND_URL ||
    defaultApiBaseUrlForCurrentHost("")
  );
}

function toPromptItem(reference: InspirationReference, index: number, apiBase: string): PromptItem {
  const imageUrl =
    reference.proxyImageUrl.startsWith("/") && apiBase
      ? `${apiBase}${reference.proxyImageUrl}`
      : reference.proxyImageUrl;
  return {
    rank: 1000 + index,
    group: reference.group || "其他分类",
    subcategory: reference.subcategory || "其他",
    field: reference.subcategory || reference.group || "外部灵感",
    model: reference.sourceSite,
    title: reference.title,
    description: `${reference.sourceSite} 公开链接参考 · ${reference.group} / ${reference.subcategory}`,
    prompt: reference.prompt || reference.stylePromptEn || reference.title,
    imageUrl,
    author: reference.sourceSite,
    sourceSite: reference.sourceSite,
    sourceUrl: reference.sourceUrl,
    licenseNote: reference.licenseNote,
    isExternal: true,
  };
}

export default function InspirationPage() {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const models = useMemo(() => [ALL_MODELS, ...Array.from(new Set(PROMPT_ITEMS.map((item) => item.model)))], []);
  const [activeGroup, setActiveGroup] = useState(() => getParam("group", ALL_GROUPS));
  const [activeSubcategory, setActiveSubcategory] = useState(() => getParam("subcategory", ALL_SUBCATEGORIES));
  const [activeModel, setActiveModel] = useState(() => {
    const model = getParam("model", ALL_MODELS);
    return models.includes(model) ? model : ALL_MODELS;
  });
  const [selectedItem, setSelectedItem] = useState<PromptItem | null>(null);
  const [externalItems, setExternalItems] = useState<PromptItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(INSPIRATION_PAGE_SIZE);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const promptScrollRef = useRef<HTMLDivElement | null>(null);
  const [detailImageHeight, setDetailImageHeight] = useState<number | null>(null);

  const bg = isDark ? "#222222" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.73 0.010 270)" : "oklch(0.49 0.01 270)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const panelBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(1 0 0 / 0.72)";
  const border = isDark ? "oklch(1 0 0 / 9%)" : "oklch(0 0 0 / 8%)";
  const activeBg = isDark ? "oklch(0.62 0.22 290 / 0.20)" : "oklch(0.62 0.18 290 / 0.10)";
  const shadow = isDark ? "0 18px 46px oklch(0 0 0 / 0.24)" : "0 14px 34px oklch(0 0 0 / 0.08)";

  const allPromptItems = useMemo(() => [...PROMPT_ITEMS, ...externalItems], [externalItems]);
  const allGroups = useMemo(() => [ALL_GROUPS, ...Object.keys(INSPIRATION_TAXONOMY)], []);
  const availableSubcategories = useMemo(() => {
    if (activeGroup !== ALL_GROUPS) return [ALL_SUBCATEGORIES, ...(INSPIRATION_TAXONOMY[activeGroup] || [])];
    return [
      ALL_SUBCATEGORIES,
      ...Object.values(INSPIRATION_TAXONOMY).flat(),
    ];
  }, [activeGroup]);
  const allModels = useMemo(() => [ALL_MODELS, ...Array.from(new Set(allPromptItems.map((item) => item.model)))], [allPromptItems]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allPromptItems) {
      counts.set(item.group, (counts.get(item.group) || 0) + 1);
      counts.set(item.subcategory, (counts.get(item.subcategory) || 0) + 1);
    }
    return counts;
  }, [allPromptItems]);

  const filteredItems = useMemo(() => {
    return allPromptItems.filter((item) => {
      const matchesGroup = activeGroup === ALL_GROUPS || item.group === activeGroup;
      const matchesSubcategory = activeSubcategory === ALL_SUBCATEGORIES || item.subcategory === activeSubcategory;
      const matchesModel = activeModel === ALL_MODELS || item.model === activeModel;
      return matchesGroup && matchesSubcategory && matchesModel;
    });
  }, [activeGroup, activeModel, activeSubcategory, allPromptItems]);
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
  const canLoadMore = visibleCount < filteredItems.length;

  useEffect(() => {
    setVisibleCount(INSPIRATION_PAGE_SIZE);
  }, [activeGroup, activeModel, activeSubcategory]);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = getInspirationApiBaseUrl();
    const endpoint = `${apiBase}/api/inspiration/references?limit=900`;

    fetch(endpoint, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ references?: InspirationReference[]; total?: number; hasMore?: boolean }>;
      })
      .then(payload => {
        const references = Array.isArray(payload.references) ? payload.references : [];
        setExternalItems(references.map((reference, index) => toPromptItem(reference, index, apiBase)));
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("[inspiration] external references failed", error);
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

  const updateFilters = (nextGroup: string, nextSubcategory = ALL_SUBCATEGORIES, nextModel = activeModel) => {
    setActiveGroup(nextGroup);
    setActiveSubcategory(nextSubcategory);
    const params = new URLSearchParams();
    if (nextGroup !== ALL_GROUPS) params.set("group", nextGroup);
    if (nextSubcategory !== ALL_SUBCATEGORIES) params.set("subcategory", nextSubcategory);
    if (nextModel !== ALL_MODELS) params.set("model", nextModel);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
  };

  const updateSubcategory = (nextSubcategory: string) => {
    setActiveSubcategory(nextSubcategory);
    const params = new URLSearchParams();
    if (activeGroup !== ALL_GROUPS) params.set("group", activeGroup);
    if (nextSubcategory !== ALL_SUBCATEGORIES) params.set("subcategory", nextSubcategory);
    if (activeModel !== ALL_MODELS) params.set("model", activeModel);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
  };

  const updateModel = (nextModel: string) => {
    setActiveModel(nextModel);
    const params = new URLSearchParams();
    if (activeGroup !== ALL_GROUPS) params.set("group", activeGroup);
    if (activeSubcategory !== ALL_SUBCATEGORIES) params.set("subcategory", activeSubcategory);
    if (nextModel !== ALL_MODELS) params.set("model", nextModel);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
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

      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1, background: "#222222" }}>
        <main className="mx-auto px-5 py-8 sm:px-8 sm:py-10" style={{ maxWidth: 1320 }}>
          <section className="mb-6 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={15} style={{ color: "oklch(0.72 0.22 290)" }} />
                <span className="type-caption" style={{ color: "oklch(0.72 0.22 290)" }}>AI 图片生成提示词图库</span>
              </div>
              <h1 className="type-display-sm" style={{ color: text, letterSpacing: 0 }}>超多优质 AI 图片灵感提示词持续更新中，一键复制，你也能生成高质量的 AI 图片。</h1>
              <p className="type-body-sm mt-3 max-w-3xl leading-6" style={{ color: sub }}>
                汇总 Nano Banana Pro 与 GPT Image 2 的热门案例，按分类浏览图片、提示词与模型。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: ImageIcon, label: "图片案例", value: allPromptItems.length },
                { icon: Tags, label: "分类", value: Object.values(INSPIRATION_TAXONOMY).flat().length },
                { icon: Layers, label: "来源", value: allModels.length - 1 },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}` }}>
                    <Icon size={15} style={{ color: "oklch(0.72 0.22 290)" }} />
                    <div className="type-body-sm mt-2" style={{ color: text, fontWeight: 750 }}>{stat.value}</div>
                    <div className="type-caption mt-0.5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-6 rounded-[var(--radius-lg-design)] p-3.5" style={{ background: panelBg, border: `1px solid ${border}`, backdropFilter: "blur(18px)" }}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {allGroups.map((group) => {
                  const active = group === activeGroup;
                  const count = group === ALL_GROUPS ? allPromptItems.length : categoryCounts.get(group) || 0;
                  return (
                    <button
                      key={group}
                      onClick={() => updateFilters(group)}
                      className="max-w-[168px] shrink-0 truncate whitespace-nowrap rounded-[var(--radius-pill)] px-3.5 py-2 type-caption transition-all active:scale-95"
                      style={{
                        background: active ? activeBg : "transparent",
                        border: `1px solid ${active ? "oklch(0.62 0.22 290 / 0.42)" : border}`,
                        color: active ? "oklch(0.80 0.17 290)" : sub,
                      }}
                    >
                      {group}
                      <span style={{ opacity: 0.62 }}> {count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {availableSubcategories.map((subcategory) => {
                  const active = subcategory === activeSubcategory;
                  const count = subcategory === ALL_SUBCATEGORIES
                    ? allPromptItems.filter(item => activeGroup === ALL_GROUPS || item.group === activeGroup).length
                    : categoryCounts.get(subcategory) || 0;
                  return (
                    <button
                      key={subcategory}
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

              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {allModels.map((model) => {
                    const active = model === activeModel;
                    return (
                    <button
                      key={model}
                      onClick={() => updateModel(model)}
                        className="max-w-[168px] shrink-0 truncate whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-2 type-caption transition-all active:scale-95"
                        style={{
                          background: active ? "oklch(0.72 0.18 200 / 0.16)" : "transparent",
                          border: `1px solid ${active ? "oklch(0.72 0.18 200 / 0.38)" : border}`,
                          color: active ? "oklch(0.80 0.13 200)" : sub,
                        }}
                      >
                        {model}
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

          <section className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {visibleItems.map((item) => (
              <article
                key={`${item.rank}-${item.title}`}
                onClick={() => setSelectedItem(item)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedItem(item);
                }}
                role="button"
                tabIndex={0}
                className="group cursor-pointer overflow-hidden rounded-[var(--radius-lg-design)] text-left transition-all"
                style={{ background: cardBg, border: `1px solid ${border}`, boxShadow: shadow }}
              >
                <div className="relative overflow-hidden bg-[#222222]" style={{ aspectRatio: "16 / 10" }}>
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="relative z-10 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center" style={{ background: "linear-gradient(135deg, oklch(0.20 0.05 290), oklch(0.18 0.04 205))", zIndex: 0 }}>
                    <span className="type-caption leading-5" style={{ color: "oklch(0.88 0.02 270)", letterSpacing: 0, textTransform: "none" }}>
                      本地图片待同步
                    </span>
                  </div>
                  <div className="absolute inset-x-0 top-0 flex min-w-0 items-center justify-between gap-2 p-3" style={{ zIndex: 2 }}>
                    <span className="shrink-0 rounded-[var(--radius-pill)] px-2.5 py-1 type-caption whitespace-nowrap" style={{ background: "oklch(0 0 0 / 0.48)", color: "white", backdropFilter: "blur(10px)", letterSpacing: 0, textTransform: "none" }}>
                      {item.isExternal ? item.sourceSite : `#${item.rank}`}
                    </span>
                  </div>
                </div>

                <div className="flex min-h-[270px] flex-col p-4">
                  <div className="mb-3 flex min-w-0 items-center gap-2">
                    <span className="min-w-0 max-w-[58%] truncate whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: activeBg, color: "oklch(0.80 0.17 290)", letterSpacing: 0, textTransform: "none" }}>
                      {item.field}
                    </span>
                    {item.author && (
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                        {item.author}
                      </span>
                    )}
                  </div>

                  <h2 className="min-w-0 truncate whitespace-nowrap type-body-sm leading-5" style={{ color: text, fontWeight: 750 }}>{item.title}</h2>
                  <p className="min-w-0 truncate whitespace-nowrap type-caption mt-2 leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>{item.description}</p>
                  <p
                    className="mt-3 rounded-[var(--radius-md-design)] p-3 type-caption leading-5"
                    style={{
                      background: isDark ? "oklch(0 0 0 / 0.18)" : "oklch(0 0 0 / 0.035)",
                      color: isDark ? "oklch(0.72 0.01 270)" : "oklch(0.57 0.010 270)",
                      display: "-webkit-box",
                      letterSpacing: 0,
                      overflow: "hidden",
                      textTransform: "none",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 4,
                    }}
                  >
                    {item.prompt}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <span className="type-caption" style={{ color: isDark ? "oklch(0.78 0.14 290)" : "oklch(0.52 0.17 290)", letterSpacing: 0, textTransform: "none" }}>
                      点击查看完整提示词
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        copyPrompt(item.prompt);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        copyPrompt(item.prompt);
                      }}
                      className="shrink-0 rounded-[var(--radius-pill)] px-2.5 py-1 type-caption transition-all hover:scale-105 active:scale-95"
                      style={{ background: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.05)", border: `1px solid ${border}`, color: text, letterSpacing: 0, textTransform: "none" }}
                    >
                      复制提示词
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
          {filteredItems.length === 0 && (
            <section className="rounded-[var(--radius-lg-design)] p-8 text-center" style={{ background: panelBg, border: `1px solid ${border}` }}>
              <p className="type-body-sm" style={{ color: text, fontWeight: 720 }}>当前分类暂无图片和提示词</p>
              <p className="type-caption mt-2" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                后续导入该分类的公开链接数据后，这里会自动显示对应图片、提示词和来源。
              </p>
            </section>
          )}
          {canLoadMore && (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                onClick={() => setVisibleCount(count => Math.min(count + INSPIRATION_PAGE_SIZE, filteredItems.length))}
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
            className="relative max-h-full w-full overflow-hidden rounded-[var(--radius-lg-design)]"
            style={{ maxWidth: 980, background: isDark ? "#222222" : cardBg, border: `1px solid ${border}`, boxShadow: "0 24px 80px rgba(0,0,0,0.34)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute right-3 top-3 z-10 flex items-center" style={{ gap: 16 }}>
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
                  {selectedItem.sourceSite && (
                    <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.05)", color: sub, letterSpacing: 0, textTransform: "none" }}>
                      {selectedItem.sourceSite}
                    </span>
                  )}
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
                {selectedItem.sourceUrl && (
                  <a
                    href={selectedItem.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex type-caption"
                    style={{ color: "oklch(0.78 0.14 290)", letterSpacing: 0, textTransform: "none" }}
                  >
                    查看来源
                  </a>
                )}
                <div className="mt-4 rounded-[var(--radius-md-design)] p-4" style={{ background: isDark ? "#222222" : "oklch(0 0 0 / 0.035)", border: `1px solid ${border}` }}>
                  <p className="whitespace-pre-wrap type-caption leading-6" style={{ color: text, letterSpacing: 0, textTransform: "none" }}>
                    {selectedItem.prompt}
                  </p>
                </div>
                {selectedItem.licenseNote && (
                  <p className="mt-3 type-caption leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                    {selectedItem.licenseNote}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
