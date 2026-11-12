/**
 * SkillsPage — GitHub-sourced design skill store.
 */
import { useMemo, useState } from "react";
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
import { skillCardNames, skillCardSummaries } from "@/lib/skill-card-copy";
import {
  Boxes,
  CheckCircle2,
  Filter,
  Search,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { CardHoverOverlay } from "@/components/ui/card-hover-overlay";
import { TOUR_ANCHORS } from "@shared/onboarding-steps";

const categoryOrder: SkillStoreCategory[] = [
  "brand_system",
  "logo_identity",
  "landing_page",
  "commerce_poster",
  "product_visual",
  "video_storyboard",
  "image_editing",
  "photo_art",
  "visual_audit",
];
/**
 * 技能卡缩略图：client/public/skill-thumbs/<id>.webp，800×400（2:1），每张 <150KB。
 * 用户要求所有卡片尺寸一致、不随描述长短变化：图片 2:1 固定、标题/分类单行截断、
 * 描述固定 3 行高（超出截断，卡片文案见 skill-card-copy.ts）、标签固定单行。
 */
const skillButtonPurple = "#9058fc";
const skillButtonPurpleBorder = "rgba(144, 88, 252, 0.56)";
const skillButtonPurpleShadow = "0 10px 26px rgba(144, 88, 252, 0.25)";
const categoryAccentPalette = [
  "#aaaaaa",
  "#f5f6f8",
  "#aaaaaa",
  "#bbbbbb",
  "#999999",
  "#aaaaaa",
  "#aaaaaa",
  "#bbbbbb",
  "#aaaaaa",
  "#aaaaaa",
];

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
  /** hover 中的技能卡 id。用 state 而不是 CSS group-hover：操作层要能判断「该不该接住点击」。 */
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null);

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

    return [...items].sort((a, b) => b.sourceScore - a.sourceScore);
  }, [activeCategory, query]);

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

  /**
   * 复制技能提示词。
   * hover 操作层里与「快速加载」并列的第二枚按钮 ——
   * 与灵感模板的「一键同款 / 复制提示词」保持同一套动作心智。
   */
  const copySkillPrompt = async (skill: (typeof skillStoreItems)[number]) => {
    const prompt = (skill.capabilityPrompt || "").trim();
    if (!prompt) {
      toast("这个技能还没有可用提示词", { description: skill.name });
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      toast("提示词已复制", { description: skill.name });
    } catch {
      toast("复制失败", { description: "请稍后重试" });
    }
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

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-6 pb-10 pt-5">
          {/* 搜索框 — 置顶全宽，无底托 */}
          <div
            data-tour-id={TOUR_ANCHORS.skillsSearch}
            className="flex h-9 w-full items-center gap-2 overflow-hidden rounded-[var(--radius-md-design)] border px-3"
            style={{ borderColor: border, background: panel }}
          >
            <Search size={14} style={{ color: faint, flexShrink: 0 }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索技能、尺寸"
              className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
              style={{ color: text }}
            />
          </div>

          {/* 分类标签 — 横向单行滚动，无底托 */}
          <div
            data-tour-id={TOUR_ANCHORS.skillsCategoryBar}
            className="flex gap-2 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-md-design)] px-3 text-sm transition-opacity hover:opacity-85"
              style={{
                background: activeCategory === "all" ? (isDark ? "#ffffff" : "#161616") : "transparent",
                color: activeCategory === "all" ? (isDark ? "#161616" : "#ffffff") : sub,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.3)" : "rgba(20,20,36,0.25)"}`,
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
                className="h-9 shrink-0 rounded-[var(--radius-md-design)] px-3 text-sm transition-opacity hover:opacity-85"
                style={{
                  background: activeCategory === category ? (isDark ? "#ffffff" : "#161616") : "transparent",
                  color: activeCategory === category ? (isDark ? "#161616" : "#ffffff") : sub,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.3)" : "rgba(20,20,36,0.25)"}`,
                }}
              >
                {skillCategoryMeta[category].label}
              </button>
            ))}
          </div>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredItems.map((skill, skillIndex) => {
              const Icon = skill.icon;
              const meta = skillCategoryMeta[skill.category];
              const isTourAnchorCard = skillIndex === 0;
              return (
                <article
                  key={skill.id}
                  data-tour-id={isTourAnchorCard ? TOUR_ANCHORS.skillsCard : undefined}
                  className="flex h-full min-h-[220px] flex-col overflow-hidden rounded-[var(--radius-lg-design)] border p-4 transition-transform hover:-translate-y-0.5"
                  style={{ background: panel, borderColor: border, backdropFilter: "blur(18px)" }}
                  onMouseEnter={() => setHoveredSkillId(skill.id)}
                  onMouseLeave={() =>
                    setHoveredSkillId(current => (current === skill.id ? null : current))
                  }
                >
                  {/* 效果缩略图：-mx-4 -mt-4 抵消卡片 p-4，让图片贴边铺满卡片顶部。 */}
                  <div className="relative -mx-4 -mt-4 mb-4 aspect-[2/1] shrink-0 overflow-hidden" style={{ background: panelStrong }}>
                    <img
                      src={`/skill-thumbs/${skill.id}.webp`}
                      alt={`${skill.name} 效果示例`}
                      loading="lazy"
                      decoding="async"
                      className="block h-full w-full object-cover"
                    />
                    {/* hover 操作层：与灵感模板同一份实现（压暗 + 居中两枚胶囊） */}
                    <CardHoverOverlay
                      visible={hoveredSkillId === skill.id}
                      compact
                      actions={[
                        { label: "快速加载", onClick: () => handleQuickLoad(skill) },
                        { label: "复制提示词", onClick: () => void copySkillPrompt(skill), variant: "ghost" },
                      ]}
                    />
                  </div>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center"
                      style={{ color: skillIconColor(skill.id) }}
                    >
                      <Icon size={22} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold leading-6" style={{ color: text }} title={skill.name}>{skillCardNames[skill.id] ?? skill.name}</h2>
                      <p className="mt-0.5 truncate text-xs" style={{ color: faint }}>{meta.label} / {skill.subcategory}</p>
                    </div>
                  </div>

                  <p className="mt-4 h-[72px] overflow-hidden text-sm leading-6 line-clamp-3" style={{ color: sub }}>
                    {skillCardSummaries[skill.id] ?? skill.summary}
                  </p>

                  <div className="mt-3 flex h-[26px] flex-wrap gap-1.5 overflow-hidden">
                    {skill.tags.slice(0, 2).map((tag) => (
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
                    <button
                      type="button"
                      onClick={() => handleQuickLoad(skill)}
                      data-tour-id={isTourAnchorCard ? TOUR_ANCHORS.skillsQuickLoad : undefined}
                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-md-design)] text-xs font-semibold transition-opacity hover:opacity-90 active:scale-[0.99]"
                      style={{
                        background: "var(--artx-action-bg)",
                        color: "var(--artx-action-text)",
                        border: "1px solid var(--artx-action-border)",
                      }}
                    >
                      快速加载
                    </button>
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
