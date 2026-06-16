/**
 * InspirationPage — AI image prompt gallery.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import TopBar from "@/components/workspace/TopBar";
import promptCsv from "@/data/ai_image_prompt_rank_50.csv?raw";
import { useTheme } from "@/contexts/ThemeContext";
import { ArrowUpRight, ImageIcon, Layers, Search, Sparkles, Tags } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";

type PromptItem = {
  rank: number;
  field: string;
  model: string;
  title: string;
  description: string;
  prompt: string;
  imageUrl: string;
  detailUrl: string;
  sourceUrl: string;
  author: string;
};

const ALL_FIELDS = "全部分类";
const ALL_MODELS = "全部模型";

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
    .map((record) => ({
      rank: Number(get(record, "rank")) || 0,
      field: get(record, "field"),
      model: get(record, "model"),
      title: get(record, "title"),
      description: get(record, "description"),
      prompt: get(record, "prompt"),
      imageUrl: get(record, "image_url"),
      detailUrl: get(record, "detail_url"),
      sourceUrl: get(record, "source_url"),
      author: get(record, "author"),
    }))
    .filter((item) => item.title && item.imageUrl);
}

function getParam(name: string, fallback: string) {
  const value = new URLSearchParams(globalThis.location?.search || "").get(name);
  return value || fallback;
}

const PROMPT_ITEMS = loadPromptItems(promptCsv);

export default function InspirationPage() {
  const [location, navigate] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const fields = useMemo(() => [ALL_FIELDS, ...Array.from(new Set(PROMPT_ITEMS.map((item) => item.field)))], []);
  const models = useMemo(() => [ALL_MODELS, ...Array.from(new Set(PROMPT_ITEMS.map((item) => item.model)))], []);
  const [activeField, setActiveField] = useState(() => {
    const field = getParam("field", ALL_FIELDS);
    return fields.includes(field) ? field : ALL_FIELDS;
  });
  const [activeModel, setActiveModel] = useState(() => {
    const model = getParam("model", ALL_MODELS);
    return models.includes(model) ? model : ALL_MODELS;
  });
  const [query, setQuery] = useState("");

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.20 0.008 270)";
  const sub = isDark ? "oklch(0.62 0.01 270)" : "oklch(0.49 0.01 270)";
  const cardBg = isDark ? "oklch(0.13 0.012 270)" : "oklch(1 0 0)";
  const panelBg = isDark ? "oklch(1 0 0 / 5%)" : "oklch(1 0 0 / 0.72)";
  const border = isDark ? "oklch(1 0 0 / 9%)" : "oklch(0 0 0 / 8%)";
  const activeBg = isDark ? "oklch(0.62 0.22 290 / 0.20)" : "oklch(0.62 0.18 290 / 0.10)";
  const shadow = isDark ? "0 18px 46px oklch(0 0 0 / 0.24)" : "0 14px 34px oklch(0 0 0 / 0.08)";

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return PROMPT_ITEMS.filter((item) => {
      const matchesField = activeField === ALL_FIELDS || item.field === activeField;
      const matchesModel = activeModel === ALL_MODELS || item.model === activeModel;
      const haystack = `${item.title} ${item.description} ${item.prompt} ${item.author}`.toLowerCase();
      return matchesField && matchesModel && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [activeField, activeModel, query]);

  const updateFilters = (nextField: string, nextModel = activeModel) => {
    setActiveField(nextField);
    const params = new URLSearchParams();
    if (nextField !== ALL_FIELDS) params.set("field", nextField);
    if (nextModel !== ALL_MODELS) params.set("model", nextModel);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
  };

  const updateModel = (nextModel: string) => {
    setActiveModel(nextModel);
    const params = new URLSearchParams();
    if (activeField !== ALL_FIELDS) params.set("field", activeField);
    if (nextModel !== ALL_MODELS) params.set("model", nextModel);
    const suffix = params.toString();
    navigate(`/inspiration${suffix ? `?${suffix}` : ""}`);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.10, zIndex: 0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <main className="mx-auto px-5 py-8 sm:px-8 sm:py-10" style={{ maxWidth: 1320 }}>
          <section className="mb-6 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={15} style={{ color: "oklch(0.72 0.22 290)" }} />
                <span className="type-caption" style={{ color: "oklch(0.72 0.22 290)" }}>AI 图片生成提示词图库</span>
              </div>
              <h1 className="type-display-sm" style={{ color: text, letterSpacing: 0 }}>50 组高热图片提示词灵感</h1>
              <p className="type-body-sm mt-3 max-w-3xl leading-6" style={{ color: sub }}>
                汇总 Nano Banana Pro 与 GPT Image 2 的热门案例，按分类浏览图片、提示词、模型与来源。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: ImageIcon, label: "图片案例", value: PROMPT_ITEMS.length },
                { icon: Tags, label: "分类", value: fields.length - 1 },
                { icon: Layers, label: "模型", value: models.length - 1 },
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

          <section className="mb-6 rounded-[var(--radius-lg-design)] p-3" style={{ background: panelBg, border: `1px solid ${border}`, backdropFilter: "blur(18px)" }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none", whiteSpace: "nowrap" }}>
                {fields.map((field) => {
                  const active = field === activeField;
                  return (
                    <button
                      key={field}
                      onClick={() => updateFilters(field)}
                      className="shrink-0 rounded-[var(--radius-pill)] px-3.5 py-2 type-caption transition-all active:scale-95"
                      style={{
                        background: active ? activeBg : "transparent",
                        border: `1px solid ${active ? "oklch(0.62 0.22 290 / 0.42)" : border}`,
                        color: active ? "oklch(0.80 0.17 290)" : sub,
                      }}
                    >
                      {field}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none", whiteSpace: "nowrap" }}>
                  {models.map((model) => {
                    const active = model === activeModel;
                    return (
                      <button
                        key={model}
                        onClick={() => updateModel(model)}
                        className="shrink-0 rounded-[var(--radius-pill)] px-3 py-2 type-caption transition-all active:scale-95"
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

                <label className="flex min-w-0 items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2" style={{ background: isDark ? "oklch(0 0 0 / 0.20)" : "oklch(1 0 0 / 0.9)", border: `1px solid ${border}` }}>
                  <Search size={15} style={{ color: sub }} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索标题、作者或提示词"
                    className="w-full bg-transparent type-caption outline-none sm:w-48"
                    style={{ color: text, letterSpacing: 0, textTransform: "none" }}
                  />
                </label>
              </div>
            </div>
          </section>

          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
              当前显示 {filteredItems.length} / {PROMPT_ITEMS.length} 组
            </p>
          </div>

          <section className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {filteredItems.map((item) => (
              <article
                key={`${item.rank}-${item.title}`}
                className="group overflow-hidden rounded-[var(--radius-lg-design)] transition-all hover:-translate-y-0.5"
                style={{ background: cardBg, border: `1px solid ${border}`, boxShadow: shadow }}
              >
                <div className="relative overflow-hidden bg-black" style={{ aspectRatio: "16 / 10" }}>
                  <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
                    <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: "oklch(0 0 0 / 0.48)", color: "white", backdropFilter: "blur(10px)", letterSpacing: 0, textTransform: "none" }}>
                      #{item.rank}
                    </span>
                    <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: "oklch(0 0 0 / 0.48)", color: "white", backdropFilter: "blur(10px)", letterSpacing: 0, textTransform: "none" }}>
                      {item.model}
                    </span>
                  </div>
                </div>

                <div className="flex min-h-[270px] flex-col p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: activeBg, color: "oklch(0.80 0.17 290)", letterSpacing: 0, textTransform: "none" }}>
                      {item.field}
                    </span>
                    {item.author && (
                      <span className="truncate type-caption" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
                        {item.author}
                      </span>
                    )}
                  </div>

                  <h2 className="type-body-sm leading-5" style={{ color: text, fontWeight: 750 }}>{item.title}</h2>
                  <p className="type-caption mt-2 leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>{item.description}</p>
                  <p
                    className="mt-3 rounded-[var(--radius-md-design)] p-3 type-caption leading-5"
                    style={{
                      background: isDark ? "oklch(0 0 0 / 0.18)" : "oklch(0 0 0 / 0.035)",
                      color: isDark ? "oklch(0.72 0.01 270)" : "oklch(0.38 0.01 270)",
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

                  <div className="mt-auto flex items-center gap-2 pt-4">
                    {item.detailUrl && (
                      <a
                        href={item.detailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 type-caption transition-all hover:scale-[1.02] active:scale-95"
                        style={{ background: isDark ? "oklch(1 0 0 / 7%)" : "oklch(0 0 0 / 4%)", border: `1px solid ${border}`, color: text, letterSpacing: 0, textTransform: "none" }}
                      >
                        详情
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 type-caption transition-all hover:scale-[1.02] active:scale-95"
                        style={{ background: "transparent", border: `1px solid ${border}`, color: sub, letterSpacing: 0, textTransform: "none" }}
                      >
                        来源
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
