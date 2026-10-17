/**
 * EcommerceCanvasPage — 电商画布（路由分发壳）
 *
 * 「AI 带货图文」+ 原「智能电商产品」的整合入口（左侧边栏「电商画布」）。
 *
 * 【子路由】父路由注册的是 /ecommerce-canvas/*?（可选通配，见 App.tsx），这里再分发：
 *   /ecommerce-canvas                  → 带货图文工作台（默认）
 *   /ecommerce-canvas/post             → 带货图文工作台
 *   /ecommerce-canvas/product          → 产品图工作台
 *   /ecommerce-canvas/templates        → 模板库总览（二级页）
 *   /ecommerce-canvas/templates/:id    → 模板详情（二级页）
 *   /ecommerce-canvas/history          → 生成记录（二级页）
 *   其它                                → 重定向回 /ecommerce-canvas/post
 *
 * ⚠️ 草稿（draft）state 提在本壳里，而不是放在工作台内部 ——
 *    否则用户点「查看全部」进模板库、挑完模板回工作台，
 *    刚才写的卖点、选的模型、传的图全没了。
 *
 * 能力来源：
 *  - 带货图文：复刻美图设计室 shoppable-carousel 的参数结构
 *    （上传 ≤5 张 / 平台·市场·语言·比例 / 卖点 AI 帮写 / 分镜模板 /
 *      社媒发布文案 / 张数），模板库见 data/ecommerce-canvas-templates.ts。
 *  - 产品图：与画布内 SmartCommerceProductDialog 对齐，
 *    背景模板直接复用 PicwishBackgroundSelector（同一条
 *    listPicWishBackgroundTemplates 链路，不另起数据源）。
 *
 * 计价：走 shared/ai-credit-policy 的 quoteAiUsage（模型每张积分 ×
 * 张数 × 分辨率系数，取整十），与全站口径一致，不在此页自定义价格。
 *
 * 模型：默认全站默认档 image2.5 medium（70 积分/张），banana 2.1 可手选。展示名一律来自 IMAGE_AI_MODELS
 * 的 label（ModelSelector 内部处理），页面不硬编码模型文案。
 *
 * ⚠️ v1 边界：上传的商品图仅作本地预览，生成链路走文生图
 *（卖点 + 模板分镜公式拼 prompt）；图生图（把实拍商品图注入）留待下一步
 * 接 generateImages 的 referencedAssets 链路，接好前 UI 明示。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { generateImages } from "@/lib/ai";
import { IMAGE_AI_MODELS } from "@/lib/workspace-data";
import { quoteAiUsage } from "@shared/ai-credit-policy";
import { DEFAULT_IMAGE_MODEL_ID } from "@shared/image-models";
import {
  ECOMMERCE_TEMPLATES,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_MARKETS,
  ECOMMERCE_LANGUAGES,
  type EcommerceTpl,
} from "@/data/ecommerce-canvas-templates";
import {
  ecommercePalette,
  pixelSize,
  type EcommerceDraft,
  type EcommerceMode,
} from "@/components/ecommerce/shared";
import { EcommerceWorkspace } from "@/components/ecommerce/EcommerceWorkspace";
import { EcommerceTemplateGallery } from "@/components/ecommerce/EcommerceTemplateGallery";
import { EcommerceTemplateDetail } from "@/components/ecommerce/EcommerceTemplateDetail";
import {
  EcommerceHistory,
  type EcommerceHistoryEntry,
} from "@/components/ecommerce/EcommerceHistory";
import { EcommerceResultLightbox } from "@/components/ecommerce/EcommerceResultLightbox";

// 2026-10-17 用户拍板：电商板块默认用 70 积分/张的全站默认档（image2.5 medium）。
// banana 2.1（vod-gg36）300 积分/张、按 70 收会亏本，只作可选项。
const DEFAULT_MODEL_ID = DEFAULT_IMAGE_MODEL_ID;
const ROOT = "/ecommerce-canvas";
const TEMPLATE_PREFIX = "templates/";
/** 生成记录最多保留条数（只存图片 URL，不存原图） */
const HISTORY_LIMIT = 20;

function createDefaultDraft(): EcommerceDraft {
  return {
    model: DEFAULT_MODEL_ID,
    uploads: [],
    platform: ECOMMERCE_PLATFORMS[0],
    market: ECOMMERCE_MARKETS[0],
    language: ECOMMERCE_LANGUAGES[0],
    postRatio: "3:4",
    noTextOnImage: false,
    sellingPoints: "",
    tplId: null,
    withCopy: true,
    postCount: 6,
    productRatio: "3:4",
    productTier: "1k",
    // 2026-10-17 用户拍板：产品图默认 1 张，用户主动调高才多张（与画布内产品图弹窗一致）。
    productCount: 1,
  };
}

/**
 * 从 wouter 的 location 里拆出子路径与 query。
 *
 * ⚠️ location 已经去掉了 router base（wouter 的 useLocation 返回相对路径），
 *    但**仍然可能带尾斜杠** —— 静态托管会把 /ecommerce-canvas 301 成
 *    /ecommerce-canvas/。所以先剥尾斜杠再分段，否则 sub 会拿到 "post/"。
 */
function parseRoute(location: string) {
  const [rawPath, rawSearch = ""] = location.split("?");
  const clean = rawPath.replace(/\/+$/, "");
  const sub = clean.replace(new RegExp(`^${ROOT}(/|$)`), "").replace(/^\//, "");
  return { sub, params: new URLSearchParams(rawSearch) };
}

export default function EcommerceCanvasPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [location, navigate] = useLocation();
  const palette = useMemo(() => ecommercePalette(isDark), [isDark]);

  const { sub, params } = useMemo(() => parseRoute(location), [location]);
  const mode: EcommerceMode = sub === "product" ? "product" : "post";

  const [draft, setDraft] = useState<EcommerceDraft>(createDefaultDraft);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [history, setHistory] = useState<EcommerceHistoryEntry[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const updateDraft = useCallback(
    (patch: Partial<EcommerceDraft> | ((d: EcommerceDraft) => EcommerceDraft)) => {
      setDraft(prev => (typeof patch === "function" ? patch(prev) : { ...prev, ...patch }));
    },
    [],
  );

  /*
    从模板库 / 详情页带 ?tpl=<id> 回来时，把模板写进草稿。
    ⚠️ updateDraft 在同值时返回原对象（上面那个三元），
       所以这里不会陷入「effect 改 state → state 变 → effect 再跑」的死循环。
  */
  const tplParam = params.get("tpl");
  useEffect(() => {
    if (!tplParam) return;
    const id = Number(tplParam);
    if (!Number.isFinite(id)) return;
    if (!ECOMMERCE_TEMPLATES.some(item => item.id === id)) return;
    updateDraft(prev => (prev.tplId === id ? prev : { ...prev, tplId: id }));
  }, [tplParam, updateDraft]);

  const count = mode === "post" ? draft.postCount : draft.productCount;
  const quote = useMemo(
    () =>
      quoteAiUsage({
        capability: "text_to_image",
        model: draft.model,
        outputCount: count,
        ...(mode === "product" ? { resolutionTier: draft.productTier } : {}),
      }),
    [draft.model, count, mode, draft.productTier],
  );
  /**
   * 单张价（含分辨率系数）。按钮上的总价 = 单张价 × 张数再取整十，
   * 只在按钮上写一个总数会让用户误读成「一张 1200 积分」，
   * 所以这里单独算一份单张价，UI 上把算式摊开写。
   */
  const unitCredits = useMemo(
    () =>
      quoteAiUsage({
        capability: "text_to_image",
        model: draft.model,
        outputCount: 1,
        ...(mode === "product" ? { resolutionTier: draft.productTier } : {}),
      }).chargedCredits,
    [draft.model, mode, draft.productTier],
  );
  const modelLabel = useMemo(
    () => IMAGE_AI_MODELS.find(item => item.id === draft.model)?.label || draft.model,
    [draft.model],
  );

  function buildPrompt() {
    if (mode === "product") {
      return [
        `电商产品图：保留产品主体不变，替换为${draft.bgTemplate ? `「${draft.bgTemplate.name}」` : "默认"}电商背景。`,
        draft.sellingPoints.trim() ? `产品信息：${draft.sellingPoints.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    const tpl = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId);
    return [
      `为 ${draft.platform}（${draft.market}市场）生成一套 ${draft.postCount} 张的社媒带货图文，文案语言：${draft.language}。`,
      tpl ? `分镜模板：${tpl.name}（拍摄节奏：${tpl.flow}）。` : "",
      `商品卖点与要求：${draft.sellingPoints.trim() || "由 AI 根据常见卖点合理发挥"}`,
      draft.noTextOnImage ? "图片不加文字，突出产品使用场景。" : "可在画面中按模板加入少量卖点文字。",
      draft.withCopy ? "同时输出整套图的社媒发布文案（标题 + 正文 + 话题标签）。" : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const handleGenerate = useCallback(async () => {
    if (mode === "post" && draft.tplId === null) {
      toast.error("请先在右侧选择一个分镜模板");
      return;
    }
    if (draft.uploads.length === 0) {
      toast.error("请先上传商品图");
      return;
    }
    setGenerating(true);
    setResults([]);
    const startedMode = mode;
    const startedCount = count;
    const startedCredits = quote.chargedCredits;
    const startedPrompt = buildPrompt();
    const startedTemplateName = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId)?.name || "";
    const startedBackgroundName = draft.bgTemplate?.name || "";
    try {
      /*
        ⚠️ 1K 档不传像素（2026-10-17 实测踩到）。
        服务端 __testResolveHighDefinitionTargetSize 对「显式传入的像素」有一道
        「长边不足 1536 就放大」：传 1088×1088 → 放大成 1536×1536 → 短边 > 1088
        按 2K 落档，**界面报价 70、实扣 150**，零报错。
        不传像素时上游走默认 1K（线上 20 单全是 1k/70），与报价一致。
        2K/4K 的长边 ≥ 2048，不触发放大，照旧传。
      */
      const size = startedMode === "product" && draft.productTier !== "1k"
        ? pixelSize(draft.productRatio, draft.productTier)
        : {};
      const response = await generateImages({
        prompt: startedPrompt,
        model: draft.model,
        ratio: startedMode === "post" ? draft.postRatio : draft.productRatio,
        count: startedCount,
        ...size,
      });
      const urls = (response.images || []).map(image => image.src).filter(Boolean);
      if (urls.length === 0) throw new Error("生成结果为空，请重试");
      setResults(urls);
      setHistory(prev =>
        [
          {
            id: `ec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            mode: startedMode,
            model: draft.model,
            count: startedCount,
            credits: startedCredits,
            templateName: startedTemplateName,
            backgroundName: startedBackgroundName,
            prompt: startedPrompt,
            images: urls,
            createdAt: Date.now(),
          },
          ...prev,
        ].slice(0, HISTORY_LIMIT),
      );
      toast.success(`生成完成：${urls.length} 张`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  }, [count, draft.bgTemplate, draft.model, draft.postRatio, draft.productRatio, draft.productTier, draft.tplId, mode, quote.chargedCredits]);

  /** 选中模板后回到带货图文工作台（并把模板带进 URL，便于分享/刷新） */
  const goWorkspaceWithTemplate = useCallback(
    (template: EcommerceTpl) => {
      updateDraft({ tplId: template.id });
      navigate(`${ROOT}/post?tpl=${template.id}`);
    },
    [navigate, updateDraft],
  );

  const isTemplatesIndex = sub === "templates";
  const templateId = sub.startsWith(TEMPLATE_PREFIX)
    ? Number(sub.slice(TEMPLATE_PREFIX.length))
    : null;
  const isTemplateDetail = templateId !== null && Number.isFinite(templateId);
  const template = isTemplateDetail
    ? ECOMMERCE_TEMPLATES.find(item => item.id === templateId) || null
    : null;

  return (
    <>
      {isTemplatesIndex ? (
        <EcommerceTemplateGallery
          palette={palette}
          selectedId={draft.tplId}
          onPick={goWorkspaceWithTemplate}
          onOpenDetail={id => navigate(`${ROOT}/templates/${id}`)}
        />
      ) : isTemplateDetail ? (
        <EcommerceTemplateDetail
          template={template}
          palette={palette}
          onUse={goWorkspaceWithTemplate}
        />
      ) : sub === "history" ? (
        <EcommerceHistory
          palette={palette}
          entries={history}
          onOpen={entry => {
            setResults(entry.images);
            navigate(`${ROOT}/${entry.mode}`);
          }}
          onRemove={id => setHistory(prev => prev.filter(item => item.id !== id))}
          onClear={() => setHistory([])}
        />
      ) : sub === "" || sub === "post" || sub === "product" ? (
        <EcommerceWorkspace
          isDark={isDark}
          mode={mode}
          palette={palette}
          draft={draft}
          updateDraft={updateDraft}
          generating={generating}
          results={results}
          quoteCredits={quote.chargedCredits}
          unitCredits={unitCredits}
          modelLabel={modelLabel}
          onGenerate={() => void handleGenerate()}
          onClearResults={() => setResults([])}
          onOpenTemplateDetail={id => navigate(`${ROOT}/templates/${id}`)}
          onPreviewResult={index => setPreviewIndex(index)}
        />
      ) : (
        <Redirect to={`${ROOT}/post`} replace />
      )}

      {previewIndex !== null ? (
        <EcommerceResultLightbox
          images={results}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}
    </>
  );
}
