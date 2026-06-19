/**
 * SkillsPage — GitHub-sourced design skill store.
 */
import { useMemo, useState } from "react";
import TopBar from "@/components/workspace/TopBar";
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
  Download,
  Filter,
  GitFork,
  Loader2,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const categoryOrder: SkillStoreCategory[] = ["creative", "editing", "analysis", "export"];
const skillButtonPurple = "#9058fc";
const skillButtonPurpleBorder = "rgba(144, 88, 252, 0.56)";
const skillButtonPurpleShadow = "0 10px 26px rgba(144, 88, 252, 0.25)";

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

export default function SkillsPage() {
  const [, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [activeCategory, setActiveCategory] = useState<SkillStoreCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"popular" | "synced">("popular");

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const panel = isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.78)";
  const panelStrong = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.95)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(20,20,36,0.10)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.86)";
  const sub = isDark ? "rgba(255,255,255,0.52)" : "rgba(20,20,36,0.56)";
  const faint = isDark ? "rgba(255,255,255,0.34)" : "rgba(20,20,36,0.40)";

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

  const categoryCounts = useMemo(() => {
    return categoryOrder.reduce((acc, category) => {
      acc[category] = skillStoreItems.filter((skill) => skill.category === category).length;
      return acc;
    }, {} as Record<SkillStoreCategory, number>);
  }, []);

  const handleQuickLoad = (skill: (typeof skillStoreItems)[number]) => {
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
          style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.08, zIndex: 0 }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-6 pb-10 pt-5">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div
              className="rounded-[var(--radius-lg-design)] border p-5"
              style={{ background: panel, borderColor: border, backdropFilter: "blur(18px)" }}
            >
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md-design)] border px-2.5 type-caption"
                  style={{
                    color: isDark ? "rgba(255,255,255,0.72)" : "rgba(20,20,36,0.72)",
                    borderColor: border,
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.70)",
                  }}
                >
                  <Sparkles size={13} />
                  Skill Store
                </span>
                <span className="type-caption" style={{ color: faint }}>
                  GitHub 热度快照，按 stars / adoption 汇总
                </span>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-[32px] font-semibold leading-tight" style={{ color: text, letterSpacing: 0 }}>
                    设计图片类 Skills
                  </h1>
                  <p className="mt-2 max-w-[720px] text-sm leading-6" style={{ color: sub }}>
                    使用技能，让你的创意效率即刻提速翻倍。
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 md:w-[330px]">
                  <div className="rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: border, background: panelStrong }}>
                    <p className="text-[22px] font-semibold" style={{ color: text }}>{skillStoreStats.total}</p>
                    <p className="mt-1 text-xs" style={{ color: faint }}>总技能</p>
                  </div>
                  <div className="rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: border, background: panelStrong }}>
                    <p className="text-[22px] font-semibold" style={{ color: text }}>{skillStoreStats.synced}</p>
                    <p className="mt-1 text-xs" style={{ color: faint }}>已同步</p>
                  </div>
                  <div className="rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: border, background: panelStrong }}>
                    <p className="text-[22px] font-semibold" style={{ color: text }}>4</p>
                    <p className="mt-1 text-xs" style={{ color: faint }}>分类</p>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="rounded-[var(--radius-lg-design)] border p-4"
              style={{ background: panel, borderColor: border, backdropFilter: "blur(18px)" }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2" style={{ color: text }}>
                  <Boxes size={16} />
                  <span className="text-sm font-medium">分类覆盖</span>
                </div>
                <span className="text-xs" style={{ color: faint }}>按平台商店结构</span>
              </div>
              <div className="grid gap-2">
                {categoryOrder.map((category) => {
                  const meta = skillCategoryMeta[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      className="flex items-center justify-between rounded-[var(--radius-md-design)] border px-3 py-2 text-left transition-opacity hover:opacity-85"
                      style={{
                        borderColor: activeCategory === category ? skillButtonPurpleBorder : border,
                        background: activeCategory === category ? skillButtonPurple : panelStrong,
                        boxShadow: activeCategory === category ? skillButtonPurpleShadow : "none",
                      }}
                    >
                      <span>
                        <span className="block text-sm font-medium" style={{ color: activeCategory === category ? "white" : text }}>{meta.label}</span>
                        <span className="block max-w-[250px] truncate text-xs" style={{ color: activeCategory === category ? "rgba(255,255,255,0.76)" : sub }}>{meta.description}</span>
                      </span>
                      <span className="text-sm font-semibold" style={{ color: activeCategory === category ? "white" : skillButtonPurple }}>{categoryCounts[category]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section
            className="flex flex-col gap-3 rounded-[var(--radius-lg-design)] border p-3 md:flex-row md:items-center md:justify-between"
            style={{ background: panel, borderColor: border, backdropFilter: "blur(18px)" }}
          >
            <div className="flex flex-wrap gap-2">
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
              {categoryOrder.map((category) => (
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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div
                className="flex h-9 items-center gap-2 rounded-[var(--radius-md-design)] border px-3"
                style={{ borderColor: border, background: panelStrong }}
              >
                <Search size={14} style={{ color: faint }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索技能、尺寸、来源"
                  className="w-[220px] bg-transparent text-sm outline-none"
                  style={{ color: text }}
                />
              </div>

              <div className="grid grid-cols-2 rounded-[var(--radius-md-design)] border p-1" style={{ borderColor: border, background: panelStrong }}>
                <button
                  type="button"
                  onClick={() => setSortMode("popular")}
                  className="h-7 rounded-[var(--radius-sm-design)] px-2 text-xs"
                  style={{ color: sortMode === "popular" ? "white" : faint, background: sortMode === "popular" ? skillButtonPurple : "transparent" }}
                >
                  热度
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("synced")}
                  className="h-7 rounded-[var(--radius-sm-design)] px-2 text-xs"
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

                  {skill.canvasSizes && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {skill.canvasSizes.slice(0, 5).map((size) => (
                        <span
                          key={size}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-sm-design)] px-2 py-1 text-xs"
                          style={{ color: "white", background: skillButtonPurple }}
                        >
                          <Download size={11} />
                          {size}
                        </span>
                      ))}
                    </div>
                  )}

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
                        <Loader2 size={13} />
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
