/**
 * SkillsPage — GitHub-sourced design skill store.
 */
import { useMemo, useState } from "react";
import TopBar from "@/components/workspace/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { BG_GLOW } from "@/lib/workspace-data";
import {
  createPendingSkillLoad,
  skillCategoryMeta,
  skillStoreItems,
  skillStoreStats,
  type SkillStoreCategory,
} from "@/lib/skill-store";
import {
  Boxes,
  CheckCircle2,
  Filter,
  GitFork,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const categoryOrder: SkillStoreCategory[] = [
  "brand_system",
  "logo_identity",
  "landing_page",
  "commerce_poster",
  "product_visual",
  "video_storyboard",
  "image_editing",
  "visual_audit",
];
const skillButtonPurple = "#9058fc";
const skillButtonPurpleBorder = "rgba(144, 88, 252, 0.56)";
const skillButtonPurpleShadow = "0 10px 26px rgba(144, 88, 252, 0.25)";
const categoryAccentPalette = [
  "oklch(0.72 0.18 210)",
  "oklch(0.70 0.20 288)",
  "oklch(0.70 0.17 150)",
  "oklch(0.74 0.18 55)",
  "oklch(0.68 0.19 25)",
  "oklch(0.70 0.20 330)",
  "oklch(0.73 0.16 185)",
  "oklch(0.75 0.17 82)",
  "oklch(0.72 0.18 250)",
  "oklch(0.72 0.16 120)",
];

const statusTone: Record<string, string> = {
  "已同步": "oklch(0.72 0.16 150)",
  "待适配": "oklch(0.74 0.16 82)",
  "内测": "oklch(0.68 0.18 210)",
};

function formatScore(score: number) {
  if (score >= 100000) return `${Math.round(score / 1000)}k`;
  if (score >= 10000) return `${(score / 1000).toFixed(1)}k`;
  return score.toLocaleString();
}

function getCategoryAccent(category: SkillStoreCategory, index: number) {
  const hash = category.split("").reduce((sum, char) => sum + char.charCodeAt(0), index);
  return categoryAccentPalette[Math.abs(hash) % categoryAccentPalette.length];
}

export default function SkillsPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [activeCategory, setActiveCategory] = useState<SkillStoreCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"popular" | "synced">("popular");

  const bg = isDark ? "#222222" : "var(--design-surface-soft)";
  const panel = isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.78)";
  const panelStrong = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.95)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(20,20,36,0.10)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.86)";
  const sub = isDark ? "rgba(255,255,255,0.66)" : "rgba(20,20,36,0.56)";
  const faint = isDark ? "rgba(255,255,255,0.54)" : "rgba(20,20,36,0.40)";

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = skillStoreItems.filter((skill) => {
      const matchesCategory = activeCategory === "all" || skill.category === activeCategory;
      const searchable = [
        skill.name,
        skill.subcategory,
        skill.summary,
        skill.sourceRepo,
        ...skill.tags,
        ...(skill.canvasSizes || []),
      ].join(" ").toLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });

    return [...items].sort((a, b) => {
      if (sortMode === "synced") {
        const statusRank = { "已同步": 0, "内测": 1, "待适配": 2 };
        return statusRank[a.status] - statusRank[b.status] || b.sourceScore - a.sourceScore;
      }
      return b.sourceScore - a.sourceScore;
    });
  }, [activeCategory, query, sortMode]);

  const visibleCategories = useMemo(() => {
    const merged = new Set<SkillStoreCategory>(categoryOrder);
    skillStoreItems.forEach((skill) => merged.add(skill.category));
    return Array.from(merged);
  }, []);

  const categoryCounts = useMemo(() => {
    return visibleCategories.reduce((acc, category) => {
      acc[category] = skillStoreItems.filter((skill) => skill.category === category).length;
      return acc;
    }, {} as Record<SkillStoreCategory, number>);
  }, [visibleCategories]);

  const heroStats = [
    { label: "总技能", value: skillStoreStats.total, icon: Sparkles, accent: skillButtonPurple },
    { label: "已同步", value: skillStoreStats.synced, icon: CheckCircle2, accent: "#42d392" },
    { label: "分类", value: visibleCategories.length, icon: Boxes, accent: "#00d0ff" },
  ];

  const handleQuickLoad = (skill: (typeof skillStoreItems)[number]) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("artx:pending-skill-load", JSON.stringify(createPendingSkillLoad(skill)));
    }
    toast("Skill 已快速加载", { description: `正在进入画布：${skill.name}` });
    navigate("/project/__blank-workspace__");
  };

  const skillIconColor = (id: string) => {
    const palette = [
      "#ff7ab6",
      "#7c5cff",
      "#00d0ff",
      "#42d392",
      "#ffb020",
      "#ff6b4a",
      "#c5ed47",
      "#4f9cff",
      "#f76fff",
      "#26d9b5",
    ];
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}
    >
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0, zIndex: 0 }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} glass />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-6 pb-10 pt-5">
          <section className="grid gap-3">
            <div
              className="relative overflow-hidden rounded-[var(--radius-lg-design)] border p-5"
              style={{
                background: isDark
                  ? "linear-gradient(135deg, rgba(144,88,252,0.16), rgba(255,255,255,0.055) 42%, rgba(0,208,255,0.09))"
                  : "linear-gradient(135deg, rgba(144,88,252,0.12), rgba(255,255,255,0.86) 42%, rgba(0,208,255,0.10))",
                borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(20,20,36,0.10)",
                backdropFilter: "blur(18px)",
              }}
            >
              <div
                className="pointer-events-none absolute right-6 top-2 h-24 w-24 rounded-full"
                style={{ background: "rgba(144,88,252,0.16)", filter: "blur(30px)" }}
              />
              <div
                className="pointer-events-none absolute bottom-0 right-28 h-16 w-36 rounded-full"
                style={{ background: "rgba(0,208,255,0.10)", filter: "blur(26px)" }}
              />

              <div className="relative grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(520px,1fr)] xl:items-start">
                <div className="flex min-h-[214px] flex-col justify-between gap-4">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex h-7 items-center gap-2 rounded-[var(--radius-md-design)] border px-2.5 type-caption"
                        style={{
                          color: isDark ? "rgba(255,255,255,0.82)" : "rgba(20,20,36,0.76)",
                          borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.10)",
                          background: isDark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.72)",
                        }}
                      >
                        <Sparkles size={13} style={{ color: "#c5ed47" }} />
                        Skill Store
                      </span>
                      <span className="type-caption" style={{ color: faint }}>
                        GitHub 热度快照 · stars / adoption 汇总
                      </span>
                    </div>

                    <h1 className="max-w-[720px] text-[38px] font-semibold leading-[1.04]" style={{ color: text, letterSpacing: 0 }}>
                      设计图片类 Skills
                    </h1>
                    <p className="mt-2 max-w-[580px] text-sm leading-6" style={{ color: sub }}>
                      使用技能，让你的创意效率即刻提速翻倍。
                    </p>
                  </div>

                  <div className="grid grid-cols-3">
                    {heroStats.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.label}
                          className="flex min-h-[86px] flex-col items-center justify-center gap-1 text-center"
                        >
                          <Icon size={20} style={{ color: item.accent }} />
                          <p className="text-[30px] font-semibold leading-none" style={{ color: text }}>{item.value}</p>
                          <p className="text-xs" style={{ color: faint }}>{item.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                  <div className="rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: border, background: isDark ? "#222222" : "rgba(255,255,255,0.62)" }}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2" style={{ color: text }}>
                        <Boxes size={15} />
                        <span className="text-sm font-medium">分类覆盖</span>
                      </div>
                      <span className="text-xs" style={{ color: faint }}>商店结构</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {visibleCategories.map((category, index) => {
                        const meta = skillCategoryMeta[category];
                        const accent = getCategoryAccent(category, index);
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setActiveCategory(category)}
                            className="group flex w-full items-center gap-2.5 rounded-[var(--radius-md-design)] px-2 py-1 text-left transition-opacity hover:opacity-85"
                            style={{
                              background: activeCategory === category ? "rgba(144,88,252,0.16)" : "transparent",
                            }}
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium" style={{ color: text }}>{meta.label}</span>
                                <span className="text-xs font-semibold" style={{ color: activeCategory === category ? skillButtonPurple : faint }}>{categoryCounts[category]}</span>
                              </span>
                              <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(20,20,36,0.08)" }}>
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.max(14, (categoryCounts[category] / skillStoreStats.total) * 100)}%`,
                                    background: accent,
                                  }}
                                />
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
              </div>
            </div>
          </section>

          <section
            className="flex flex-col gap-3 rounded-[var(--radius-lg-design)] border p-3 md:flex-row md:items-start md:justify-between"
            style={{ background: panel, borderColor: border, backdropFilter: "blur(18px)" }}
          >
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md-design)] border px-3 text-sm transition-opacity hover:opacity-85"
                style={{
                  color: activeCategory === "all" ? "white" : sub,
                  borderColor: activeCategory === "all" ? skillButtonPurpleBorder : border,
                  background: activeCategory === "all" ? skillButtonPurple : "transparent",
                  boxShadow: activeCategory === "all" ? skillButtonPurpleShadow : "none",
                }}
              >
                <Filter size={14} />
                全部
              </button>
              {visibleCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className="h-9 rounded-[var(--radius-md-design)] border px-3 text-sm transition-opacity hover:opacity-85"
                  style={{
                    color: activeCategory === category ? "white" : sub,
                    borderColor: activeCategory === category ? skillButtonPurpleBorder : border,
                    background: activeCategory === category ? skillButtonPurple : "transparent",
                    boxShadow: activeCategory === category ? skillButtonPurpleShadow : "none",
                  }}
                >
                  {skillCategoryMeta[category].label}
                </button>
              ))}
            </div>

            <div className="flex w-full max-w-[420px] shrink-0 items-center gap-2 md:mt-[44px] md:w-[420px]">
              <div
                className="flex h-9 w-[300px] shrink-0 items-center gap-2 overflow-hidden rounded-[var(--radius-md-design)] border px-3"
                style={{ borderColor: border, background: panelStrong }}
              >
                <Search size={14} style={{ color: faint, flexShrink: 0 }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索技能、尺寸、来源"
                  className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
                  style={{ color: text }}
                />
              </div>

              <div className="grid h-9 w-[112px] shrink-0 grid-cols-2 rounded-[var(--radius-md-design)] border p-1" style={{ borderColor: border, background: panelStrong }}>
                <button
                  type="button"
                  onClick={() => setSortMode("popular")}
                  className="h-7 truncate whitespace-nowrap rounded-[var(--radius-sm-design)] px-2 text-xs"
                  style={{ color: sortMode === "popular" ? "white" : faint, background: sortMode === "popular" ? skillButtonPurple : "transparent" }}
                >
                  热度
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("synced")}
                  className="h-7 truncate whitespace-nowrap rounded-[var(--radius-sm-design)] px-2 text-xs"
                  style={{ color: sortMode === "synced" ? "white" : faint, background: sortMode === "synced" ? skillButtonPurple : "transparent" }}
                >
                  状态
                </button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredItems.map((skill) => {
              const Icon = skill.icon;
              const meta = skillCategoryMeta[skill.category];
              return (
                <article
                  key={skill.id}
                  className="flex min-h-[248px] flex-col rounded-[var(--radius-lg-design)] border p-4 transition-transform hover:-translate-y-0.5"
                  style={{ background: panel, borderColor: border, backdropFilter: "blur(18px)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center"
                        style={{ color: skillIconColor(skill.id) }}
                      >
                        <Icon size={22} strokeWidth={2.2} />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold leading-6" style={{ color: text }}>{skill.name}</h2>
                        <p className="mt-0.5 text-xs" style={{ color: faint }}>{meta.label} / {skill.subcategory}</p>
                      </div>
                    </div>
                    <span
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-md-design)] border px-2 text-xs"
                      style={{
                        color: statusTone[skill.status],
                        borderColor: `${statusTone[skill.status]}66`,
                        background: `${statusTone[skill.status]}18`,
                      }}
                    >
                      <CheckCircle2 size={12} />
                      {skill.status}
                    </span>
                  </div>

                  <p className="mt-4 min-h-[48px] text-sm leading-6" style={{ color: sub }}>
                    {skill.summary}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {skill.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[var(--radius-sm-design)] border px-2 py-1 text-xs"
                        style={{ borderColor: border, color: faint, background: panelStrong }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs" style={{ color: faint }}>来源：{skill.sourceRepo}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: sub }}>
                          {skill.signal === "Stars" ? <Star size={12} /> : <GitFork size={12} />}
                          {formatScore(skill.sourceScore)} {skill.signal}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickLoad(skill)}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md-design)] text-xs font-semibold transition-opacity hover:opacity-90 active:scale-[0.99]"
                        style={{
                          background: skillButtonPurple,
                          color: "white",
                          boxShadow: skillButtonPurpleShadow,
                        }}
                      >
                        快速加载
                      </button>
                      <span className="hidden text-xs md:inline" style={{ color: faint }}>
                        进入画布并连接生成
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {filteredItems.length === 0 && (
            <div
              className="rounded-[var(--radius-lg-design)] border p-8 text-center"
              style={{ background: panel, borderColor: border, color: sub }}
            >
              没有找到匹配的 skill。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
