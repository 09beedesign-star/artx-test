import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Globe2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import TopBar from "@/components/workspace/TopBar";
import { useTheme } from "@/contexts/ThemeContext";
import { BG_GLOW } from "@/lib/workspace-data";
import type {
  CrossBorderCategoryId,
  CrossBorderComposeInput,
  CrossBorderGenerationContext,
  CrossBorderMarket,
  CrossBorderPlacement,
  CrossBorderPlacementId,
  CrossBorderPlatform,
  CrossBorderPlatformId,
  CrossBorderRiskResult,
  CrossBorderTemplate,
  CrossBorderTemplateId,
} from "@shared/cross-border-commerce-agent";

type MarketResponse = {
  version: string;
  markets: CrossBorderMarket[];
  categories: Array<{ id: CrossBorderCategoryId; label: string }>;
  templates: CrossBorderTemplate[];
  governance: {
    sourcePolicy: string;
    reviewCadence: string;
    disclaimer: string;
  };
};

type ComposeResponse = {
  context: CrossBorderGenerationContext;
  auditRecordId: string;
};

function readAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("artx-auth-session");
    const parsed = raw ? JSON.parse(raw) as { token?: string } : null;
    return parsed?.token || "";
  } catch {
    return "";
  }
}

function isTemplateAllowed(template: CrossBorderTemplate, placementId: string) {
  return template.allowedPlacements.includes(placementId as CrossBorderPlacementId);
}

function actionLabel(action: CrossBorderRiskResult["action"]) {
  if (action === "block") return "阻止生成";
  if (action === "rewrite") return "要求改写";
  if (action === "advise") return "提示建议";
  return "通过";
}

export default function CrossBorderCommercePage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [marketId, setMarketId] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [placementId, setPlacementId] = useState("");
  const [categoryId, setCategoryId] = useState<CrossBorderCategoryId>("beauty_personal_care");
  const [templateId, setTemplateId] = useState<CrossBorderTemplateId>("white_main");
  const [productName, setProductName] = useState("");
  const [productFacts, setProductFacts] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [result, setResult] = useState<ComposeResponse | null>(null);

  const bg = isDark ? "#222222" : "var(--design-surface-soft)";
  const panel = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.82)";
  const panelStrong = isDark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.96)";
  const border = isDark ? "rgba(255,255,255,0.11)" : "rgba(20,20,36,0.11)";
  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.86)";
  const sub = isDark ? "rgba(255,255,255,0.62)" : "rgba(20,20,36,0.58)";
  const field = isDark ? "rgba(255,255,255,0.07)" : "rgba(20,20,36,0.045)";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cross-border-commerce/markets")
      .then(async response => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<MarketResponse>;
      })
      .then(payload => {
        if (cancelled) return;
        setData(payload);
        const firstMarket = payload.markets.find(market => market.platforms.length > 0);
        const firstPlatform = firstMarket?.platforms[0];
        const firstPlacement = firstPlatform?.placements[0];
        const firstTemplate = payload.templates.find(template =>
          firstPlacement && isTemplateAllowed(template, firstPlacement.id)
        );
        setMarketId(firstMarket?.id || "");
        setPlatformId(firstPlatform?.id || "");
        setPlacementId(firstPlacement?.id || "");
        setCategoryId(payload.categories[0]?.id || "beauty_personal_care");
        setTemplateId(firstTemplate?.id || "white_main");
      })
      .catch(error => {
        toast.error("市场包加载失败", { description: error instanceof Error ? error.message : "请稍后重试" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const market = useMemo(() => data?.markets.find(item => item.id === marketId), [data, marketId]);
  const platform = useMemo(
    () => market?.platforms.find(item => item.id === platformId),
    [market, platformId],
  );
  const placement = useMemo(
    () => platform?.placements.find(item => item.id === placementId),
    [platform, placementId],
  );
  const templates = useMemo(
    () => (data?.templates || []).filter(template => !placementId || isTemplateAllowed(template, placementId)),
    [data, placementId],
  );
  const currentTemplate = useMemo(
    () => templates.find(template => template.id === templateId) || templates[0],
    [templateId, templates],
  );

  useEffect(() => {
    const nextPlatform = market?.platforms[0];
    if (market && !platform) {
      setPlatformId(nextPlatform?.id || "");
      setPlacementId(nextPlatform?.placements[0]?.id || "");
    }
  }, [market, platform]);

  useEffect(() => {
    if (platform && !placement) {
      setPlacementId(platform.placements[0]?.id || "");
    }
  }, [platform, placement]);

  useEffect(() => {
    if (currentTemplate && currentTemplate.id !== templateId) {
      setTemplateId(currentTemplate.id);
    }
  }, [currentTemplate, templateId]);

  const composeInput = useMemo<CrossBorderComposeInput | null>(() => {
    if (!marketId || !platformId || !placementId || !categoryId || !templateId) return null;
    return {
      marketId: marketId as CrossBorderComposeInput["marketId"],
      platformId: platformId as CrossBorderPlatformId,
      placementId: placementId as CrossBorderPlacementId,
      categoryId,
      templateId,
      productName,
      productFacts,
      userPrompt,
      finalUserText: userPrompt,
    };
  }, [categoryId, marketId, placementId, platformId, productFacts, productName, templateId, userPrompt]);

  const handleCompose = async () => {
    if (!composeInput) return;
    setSubmitting(true);
    try {
      const token = readAuthToken();
      const response = await fetch("/api/cross-border-commerce/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(composeInput),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "组合失败");
      setResult(payload as ComposeResponse);
      const risk = (payload as ComposeResponse).context.risk;
      if (risk.action === "block") {
        toast.error("已阻止生成", { description: "请按安全替代表达修改后重新检查。" });
      } else if (risk.action === "rewrite") {
        toast("需要改写", { description: "命中规则已列出，可替换为安全表达。" });
      } else {
        toast.success("上下文已组合");
      }
    } catch (error) {
      toast.error("组合失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setSubmitting(false);
    }
  };

  const selectStyle = {
    background: field,
    border: `1px solid ${border}`,
    color: text,
  };
  const risk = result?.context.risk;

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative" }}>
      {isDark && (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.04 }} />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} glass />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
        <div className="mx-auto grid w-full max-w-[1440px] gap-4 px-6 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-[var(--radius-lg-design)] border p-4" style={{ background: panel, borderColor: border }}>
            <div className="mb-4 flex items-center gap-2">
              <Globe2 size={18} style={{ color: "#c5ed47" }} />
              <h1 className="type-title" style={{ color: text }}>跨境电商视觉</h1>
            </div>

            {loading ? (
              <div className="flex h-56 items-center justify-center" style={{ color: sub }}>
                <Loader2 className="mr-2 animate-spin" size={18} />
                加载中
              </div>
            ) : (
              <div className="grid gap-3">
                <Field label="市场">
                  <select className="h-10 w-full rounded-[var(--radius-md-design)] px-3 type-caption" style={selectStyle} value={marketId} onChange={event => {
                    setMarketId(event.target.value);
                    setResult(null);
                  }}>
                    {(data?.markets || []).map(item => (
                      <option key={item.id} value={item.id} disabled={item.platforms.length === 0}>
                        {item.label}{item.platforms.length === 0 ? " · 待运营确认" : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="平台">
                  <select className="h-10 w-full rounded-[var(--radius-md-design)] px-3 type-caption" style={selectStyle} value={platformId} onChange={event => {
                    const nextPlatform = market?.platforms.find(item => item.id === event.target.value);
                    setPlatformId(event.target.value);
                    setPlacementId(nextPlatform?.placements[0]?.id || "");
                    setResult(null);
                  }}>
                    {(market?.platforms || []).map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="广告位">
                  <select className="h-10 w-full rounded-[var(--radius-md-design)] px-3 type-caption" style={selectStyle} value={placementId} onChange={event => {
                    setPlacementId(event.target.value);
                    setResult(null);
                  }}>
                    {(platform?.placements || []).map(item => (
                      <option key={item.id} value={item.id}>{item.label} · {item.size.width}x{item.size.height}</option>
                    ))}
                  </select>
                </Field>

                <Field label="品类">
                  <select className="h-10 w-full rounded-[var(--radius-md-design)] px-3 type-caption" style={selectStyle} value={categoryId} onChange={event => {
                    setCategoryId(event.target.value as CrossBorderCategoryId);
                    setResult(null);
                  }}>
                    {(data?.categories || []).map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="模板">
                  <select className="h-10 w-full rounded-[var(--radius-md-design)] px-3 type-caption" style={selectStyle} value={templateId} onChange={event => {
                    setTemplateId(event.target.value as CrossBorderTemplateId);
                    setResult(null);
                  }}>
                    {templates.map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="商品">
                  <input className="h-10 w-full rounded-[var(--radius-md-design)] px-3 type-caption outline-none" style={selectStyle} value={productName} onChange={event => setProductName(event.target.value)} placeholder="例如：高端香氛身体乳" />
                </Field>

                <Field label="事实">
                  <textarea className="min-h-[88px] w-full resize-none rounded-[var(--radius-md-design)] p-3 type-caption outline-none" style={selectStyle} value={productFacts} onChange={event => setProductFacts(event.target.value)} placeholder="材质、成分、卖点、包装、已确认认证" />
                </Field>

                <Field label="补充">
                  <textarea className="min-h-[88px] w-full resize-none rounded-[var(--radius-md-design)] p-3 type-caption outline-none" style={selectStyle} value={userPrompt} onChange={event => setUserPrompt(event.target.value)} placeholder="风格、镜头、场景、光线；不得覆盖平台尺寸和风险规则" />
                </Field>

                <button
                  type="button"
                  onClick={handleCompose}
                  disabled={!composeInput || submitting}
                  className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md-design)] px-4 type-caption transition-opacity disabled:opacity-55"
                  style={{ background: "#c5ed47", color: "#111111" }}
                >
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : <ClipboardList size={16} />}
                  检查并组合
                </button>
              </div>
            )}
          </section>

          <section className="grid min-h-[720px] gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="市场包" value={data?.version || "N/A"} sub={market?.label || "未选择"} panel={panelStrong} border={border} text={text} muted={sub} />
              <Metric label="广告位" value={placement ? `${placement.size.width}x${placement.size.height}` : "N/A"} sub={platform?.label || "未选择"} panel={panelStrong} border={border} text={text} muted={sub} />
              <Metric label="风险结论" value={risk ? actionLabel(risk.action) : "待检查"} sub={result?.auditRecordId || "未生成记录"} panel={panelStrong} border={border} text={text} muted={sub} />
            </div>

            <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[var(--radius-lg-design)] border p-4" style={{ background: panel, borderColor: border }}>
                <div className="mb-3 flex items-center gap-2">
                  {risk?.action === "block" ? <ShieldAlert size={17} style={{ color: "#ff5f57" }} /> : risk ? <CheckCircle2 size={17} style={{ color: "#c5ed47" }} /> : <AlertTriangle size={17} style={{ color: "#ffb020" }} />}
                  <h2 className="type-title" style={{ color: text }}>风险检查</h2>
                </div>

                {!risk ? (
                  <p className="type-caption" style={{ color: sub }}>等待检查</p>
                ) : risk.hits.length === 0 ? (
                  <div className="rounded-[var(--radius-md-design)] border p-3 type-caption" style={{ borderColor: "rgba(197,237,71,0.28)", color: text }}>
                    未命中阻止或改写规则
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {risk.hits.map(hit => (
                      <div key={hit.id} className="rounded-[var(--radius-md-design)] border p-3" style={{ borderColor: border, background: field }}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="type-caption" style={{ color: text }}>{hit.label}</span>
                          <span className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px]" style={{ background: hit.action === "block" ? "rgba(255,95,87,0.16)" : "rgba(255,176,32,0.16)", color: hit.action === "block" ? "#ff8a82" : "#ffc857" }}>
                            {actionLabel(hit.action)}
                          </span>
                        </div>
                        <p className="type-caption" style={{ color: sub }}>{hit.safeAlternative}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid min-h-0 gap-4">
                <Panel title="文案建议" panel={panel} border={border} text={text} muted={sub}>
                  {(result?.context.editableCopySuggestions || ["等待组合"]).map(item => (
                    <div key={item} className="rounded-[var(--radius-md-design)] px-3 py-2 type-caption" style={{ background: field, color: text }}>
                      {item}
                    </div>
                  ))}
                </Panel>

                <Panel title="生成上下文" panel={panel} border={border} text={text} muted={sub}>
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md-design)] p-3 text-[12px] leading-5" style={{ background: field, color: text }}>
                    {result?.context.prompt || "等待组合"}
                  </pre>
                </Panel>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="type-caption" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  sub,
  panel,
  border,
  text,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg-design)] border p-4" style={{ background: panel, borderColor: border }}>
      <p className="type-caption" style={{ color: muted }}>{label}</p>
      <p className="mt-1 type-title" style={{ color: text }}>{value}</p>
      <p className="mt-1 truncate type-caption" style={{ color: muted }}>{sub}</p>
    </div>
  );
}

function Panel({
  title,
  panel,
  border,
  text,
  children,
}: {
  title: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-0 rounded-[var(--radius-lg-design)] border p-4" style={{ background: panel, borderColor: border }}>
      <h2 className="mb-3 type-title" style={{ color: text }}>{title}</h2>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
