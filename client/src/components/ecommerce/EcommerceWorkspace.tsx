/**
 * 电商画布 · 主工作台（带货图文 / 产品图）
 *
 * 左栏参数 + 右栏模板库（post）或空态引导（product）+ 生成结果。
 *
 * 【交互口径】本页每一个可点元素都必须有真实结果：
 *   - 模式 tab        → 跳子路由 /ecommerce-canvas/post | /product
 *   - 模板「查看全部」→ 跳 /ecommerce-canvas/templates
 *   - 模板「详情」    → 跳 /ecommerce-canvas/templates/:id
 *   - 历史记录        → 跳 /ecommerce-canvas/history
 *   - 结果图          → 打开放大预览浮层
 *
 * ⚠️ 首版里「生成数量」「张数」是常亮且 onClick 为空的假 Switch（死按钮）——
 *    看着可交互、点了什么都不发生、还永远关不掉。这里改成真实的数量控件，
 *    页面上不再存在「点了没反应」的开关。
 * ⚠️ 上传区写着「点击或拖拽上传」，首版却只接了点击。这里补上拖拽。
 */
import { useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ChevronRight,
  Clock3,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { ModelSelector } from "@/components/canvas/ModelSelector";
import { PicwishBackgroundSelector } from "@/components/canvas/PicwishBackgroundSelector";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Switch as UISwitch } from "@/components/ui/switch";
import {
  ECOMMERCE_TPL_CATEGORIES,
  ECOMMERCE_TEMPLATES,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_MARKETS,
  ECOMMERCE_LANGUAGES,
  ECOMMERCE_RATIOS,
} from "@/data/ecommerce-canvas-templates";
import { EcommerceTemplateCard } from "./EcommerceTemplateCard";
import {
  LIME,
  downloadImage,
  type EcommerceDraft,
  type EcommerceMode,
  type EcommercePalette,
} from "./shared";
import { CountRow, SectionTitle, Select, Switch } from "./primitives";
import { templateCoverUrl } from "./template-visual";

const MAX_UPLOADS = 5;

type Props = {
  isDark: boolean;
  mode: EcommerceMode;
  /** Tab 切换：只改本地状态，不跳路由（2026-10-18） */
  onSwitchMode: (mode: EcommerceMode) => void;
  palette: EcommercePalette;
  draft: EcommerceDraft;
  updateDraft: (
    patch: Partial<EcommerceDraft> | ((d: EcommerceDraft) => EcommerceDraft),
  ) => void;
  generating: boolean;
  interrupted: boolean;
  results: string[];
  /** 本次生成的总积分（单张价 × 张数，取整十） */
  quoteCredits: number;
  /** 单张积分（含分辨率系数），用于把总价拆开给用户看 */
  unitCredits: number;
  /** 当前模型的平台展示名（label，不是接口 id） */
  modelLabel: string;
  /** 长期记忆是否生效（ecommerceMemoryEnabled 或 longTerm 非空） */
  memoryActive: boolean;
  /** 记忆附加费（积分），0 表示未开启或不消费记忆 */
  memorySurcharge: number;
  /** 电商画布专属记忆开关当前值 */
  ecommerceMemoryEnabled: boolean;
  /** 切换电商画布记忆开关的回调 */
  onToggleEcommerceMemory: (next: boolean) => void;
  onGenerate: () => void;
  onClearResults: () => void;
  onOpenTemplateDetail: (id: number) => void;
  onPreviewResult: (index: number) => void;
  /** 左栏最下方的参数预设面板（由页面注入，便于拿账号 id） */
  presetSlot?: ReactNode;
};

export function EcommerceWorkspace({
  isDark,
  mode,
  onSwitchMode,
  palette,
  draft,
  updateDraft,
  generating,
  interrupted,
  results,
  quoteCredits,
  unitCredits,
  modelLabel,
  memoryActive,
  memorySurcharge,
  ecommerceMemoryEnabled,
  onToggleEcommerceMemory,
  onGenerate,
  onClearResults,
  onOpenTemplateDetail,
  onPreviewResult,
  presetSlot,
}: Props) {
  const [tplCategory, setTplCategory] = useState("all");
  const [dragOver, setDragOver] = useState(false);
  const [sellingFocused, setSellingFocused] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const tplSlotRef = useRef<HTMLImageElement>(null);
  const tplSectionRef = useRef<HTMLDivElement>(null);
  /** 正在飞向左栏的模板封面（FLIP 动画用的临时克隆）。 */
  const [flying, setFlying] = useState<{ src: string; from: DOMRect; to: DOMRect | null } | null>(null);
  const [slotPulse, setSlotPulse] = useState(0);
  /** 「在右侧选择模板」指引：自增 key 让同一张卡能重复触发闪烁动画 */
  const [tplHintTick, setTplHintTick] = useState(0);
  const tplGridRef = useRef<HTMLDivElement>(null);
  const hintFirstTemplate = () => {
    // 先把右栏第一张卡滚进视野（右栏可能已被用户滚到下面），再触发闪烁
    const first = tplGridRef.current?.firstElementChild as HTMLElement | null;
    first?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTplHintTick(t => t + 1);
  };

  /**
   * 选中模板：把卡片封面「移动 + 缩放」飞进左栏「选择模板」卡片。
   *
   * ⚠️ 目标卡片可能在左栏可视区之外（左栏能滚动），所以先把左栏滚到目标处，
   *    等一帧拿到滚动后的真实位置再起飞，否则克隆会飞到屏幕外。
   * ⚠️ 尊重 prefers-reduced-motion：系统要求减少动效时直接选中，不飞。
   */
  function selectTemplateWithFlight(picked: { id: number }, sourceEl: HTMLElement | null) {
    const cover = templateCoverUrl(picked.id);
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    updateDraft({ tplId: picked.id });
    // ⚠️ 用 section 而不是 slot 做滚动锚点：之前没选过模板时，slot 要等这次重渲染后才存在。
    const section = tplSectionRef.current;
    if (!cover || !sourceEl || !section || reduce) {
      setSlotPulse(n => n + 1);
      return;
    }
    const from = sourceEl.getBoundingClientRect();
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setFlying({ src: cover, from, to: null });
    // 等滚动开始稳定后再取落点（smooth scroll 约 300ms）
    window.setTimeout(() => {
      const to = tplSlotRef.current?.getBoundingClientRect() || null;
      setFlying(prev => (prev ? { ...prev, to } : prev));
    }, 260);
    window.setTimeout(() => {
      setFlying(null);
      setSlotPulse(n => n + 1);
    }, 260 + 620);
  }

  const tpl = ECOMMERCE_TEMPLATES.find(item => item.id === draft.tplId) || null;
  const visibleTpls = tplCategory === "all"
    ? ECOMMERCE_TEMPLATES
    : ECOMMERCE_TEMPLATES.filter(item => item.categoryId === tplCategory);
  const showResults = results.length > 0 || generating || interrupted;
  const count = mode === "post" ? draft.postCount : draft.productCount;

  const chipStyle = (on: boolean) => ({
    background: on ? "rgba(197,237,71,0.16)" : palette.field,
    border: `1px solid ${on ? "rgba(197,237,71,0.62)" : palette.border}`,
    color: on ? LIME : palette.text,
  });

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (images.length === 0) {
      toast.error("只支持图片文件");
      return;
    }
    images.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        let overflow = false;
        updateDraft(prev => {
          if (prev.uploads.length >= MAX_UPLOADS) {
            overflow = true;
            return prev;
          }
          return { ...prev, uploads: [...prev.uploads, String(reader.result)] };
        });
        if (overflow) toast.error(`同一产品最多 ${MAX_UPLOADS} 张，多余的已忽略`);
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleDownloadAll() {
    if (results.length === 0) return;
    setDownloadingAll(true);
    for (let i = 0; i < results.length; i += 1) {
      // 逐张下载：并发触发多个 a.click() 会被浏览器当成弹窗拦掉
      // eslint-disable-next-line no-await-in-loop
      await downloadImage(results[i], `ecommerce-${i + 1}.png`);
    }
    setDownloadingAll(false);
    toast.success(`已保存 ${results.length} 张`);
  }

  return (
    <div className="relative flex h-full" style={{ background: palette.bg, color: palette.text }}>

      {/* ── 左参数栏 ── */}
      <aside
        className="flex w-[340px] shrink-0 flex-col overflow-hidden border-r"
        style={{ borderColor: palette.border }}
      >
        {/*
          ⚠️ 滚动必须落在这一层（flex-1 + min-h-0 + overflow-y-auto）。
             之前 aside 自身是 overflow-y-auto 但没有确定高度，
             外层是 min-h-full 会被内容撑开 → 永远不出现滚动条，
             底部内容被 AppShell 的 overflow-hidden 直接切掉（2026-10-17 截图事故）。
        */}
        <div ref={leftScrollRef} className="ecommerce-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
          <div className="flex flex-col gap-4">

        {/* 面包屑 + 历史记录入口 */}
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: palette.sub }}>
          <Link href="/ecommerce-canvas/post" className="transition-colors hover:opacity-80" style={{ color: palette.sub }}>
            电商画布
          </Link>
          <ChevronRight size={11} />
          <span style={{ color: palette.text }}>{mode === "post" ? "带货图文" : "产品图"}</span>
          <Link
            href="/ecommerce-canvas/history"
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
            style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
            title="查看本次会话的生成记录"
          >
            <Clock3 size={11} /> 生成记录
          </Link>
        </div>

        {/* 模式切换 */}
        <div>
          <div className="grid grid-cols-2 gap-1 rounded-md p-1" style={{ background: palette.panel, border: `1px solid ${palette.border}` }}>
            {([["post", "带货图文"], ["product", "产品图"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                data-testid={`ecommerce-mode-tab-${m}`}
                onClick={() => { if (mode !== m) onSwitchMode(m); }}
                className="rounded py-1.5 text-center text-[12px] transition-colors"
                style={{
                  background: mode === m ? palette.panelStrong : "transparent",
                  color: mode === m ? LIME : palette.sub,
                  boxShadow: mode === m ? "inset 0 0 0 1px rgba(197,237,71,0.3)" : "none",
                  fontWeight: mode === m ? 500 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: palette.sub }}>
            {mode === "post"
              ? "上传商品图，选模板一键生成成套社媒帖子配图与文案，支持单图与多图轮播。"
              : "与画布「智能电商产品」同链路：上传产品图，选电商背景模板与数量，生成可上架的产品图。"}
          </p>
        </div>

        {/* 生成模型（展示名来自平台 label，默认 image2.5 medium，70 积分/张） */}
        <div>
          <SectionTitle palette={palette} aside={mode === "product" ? "多张同价" : undefined}>
            生成模型
          </SectionTitle>
          {/*
            生成按钮放在模型选择器右侧（用户 2026-10-17 指定）。
            ⚠️ 原先放在左栏最底部，小屏下被浏览器边缘截断、根本点不到。
            点击 = 把左栏全部输入（上传图 + 平台/市场/语言/比例 + 卖点 + 模板 + 模型）
            融合成一次生成，校验与拼 prompt 都在 EcommerceCanvasPage.handleGenerate。
          */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ModelSelector model={draft.model} onChange={model => updateDraft({ model })} isDark={isDark} placement="down" />
            </div>
            <button
              type="button"
              data-testid="ecommerce-generate"
              disabled={generating}
              onClick={onGenerate}
              title={`融合上传图、生成设置、卖点${mode === "post" ? "、模板" : "、背景模板"}与所选模型生成`}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-55"
              style={{ background: LIME, color: "#1a1a1a" }}
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? "生成中…" : "生成"}
            </button>
          </div>
          <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: palette.sub }}>
            {mode === "product" ? (
              <>{modelLabel} · 批次计费，1 - 8 张总积分相同 · 按上传图与所选背景模板生成</>
            ) : (
              <>
                {modelLabel} · 融合左侧上传图、设置、卖点与模板一起生成
              </>
            )}
          </div>
          {/*
            长期记忆提示条（用户 2026-10-17 指定）：开启时在板块内明确告知；
            hover 大脑图标出 tooltip，指引去左侧边栏「长期记忆」（/memory）编辑。
            2026-10-17：个人中心的长期记忆卡片已按用户要求移除，唯一编辑入口是侧栏。
            ⚠️ 用 Radix Tooltip 而不是 title 属性：title 有 ~1s 延迟且样式不可控，
               用户要的是"hover 即出现的 toast 式浮层"。
            2026-10-17：加入「电商画布记忆」专属开关（与画布对话记忆、长期记忆彼此独立）。
            ⚠️ 开关行必须**始终可见**：若跟着 memoryActive 一起隐藏，
               没写长期记忆的用户永远看不到开关、也就永远打不开 ——「开」在 A「关」在 B 必卡死。
          */}
          <div
            data-testid="ecommerce-memory-notice"
            className="mt-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]"
            style={
              memoryActive
                ? {
                    background: "rgba(197,237,71,0.10)",
                    border: "1px solid rgba(197,237,71,0.35)",
                    color: LIME,
                  }
                : { border: `1px solid ${palette.border}`, color: palette.sub }
            }
          >
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="电商画布记忆说明"
                    data-testid="ecommerce-memory-icon"
                    className="flex shrink-0 cursor-help items-center"
                  >
                    <Brain size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[240px] leading-relaxed">
                  开启记忆可以了解您的出图习惯，如需编辑长期记忆，请在左侧边栏的
                  <Link href="/memory" className="mx-0.5 underline">
                    长期记忆
                  </Link>
                  中编辑。
                </TooltipContent>
              </Tooltip>
              <span className="flex-1">
                {ecommerceMemoryEnabled
                  ? "您已开启电商画布记忆"
                  : memoryActive
                    ? "您已开启长期记忆"
                    : "电商画布记忆（默认关闭）"}
              </span>
              <UISwitch
                checked={ecommerceMemoryEnabled}
                onCheckedChange={onToggleEcommerceMemory}
                aria-label="电商画布记忆开关"
                data-testid="ecommerce-memory-switch"
              />
          </div>
        </div>

        {/* 上传 */}
        <div>
          <SectionTitle palette={palette} aside={<span className="text-[10px]" style={{ color: "#e24b4a" }}>必选</span>}>
          上传商品图
          </SectionTitle>
          <div
            onDragOver={event => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={event => {
              event.preventDefault();
              setDragOver(false);
              addFiles(event.dataTransfer?.files || null);
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-[96px] w-full flex-col items-center justify-center gap-1.5 rounded-md text-[12px] transition-colors"
              style={{
                border: `1.5px dashed ${dragOver ? LIME : palette.border}`,
                color: dragOver ? LIME : palette.sub,
                background: dragOver ? "rgba(197,237,71,0.08)" : "transparent",
              }}
            >
              <Plus size={18} />
              <span>点击或拖拽上传</span>
              <span className="text-[10.5px]">同一产品，最多 {MAX_UPLOADS} 张</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={event => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          {draft.uploads.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.uploads.map((src, i) => (
                <div key={i} className="relative h-[52px] w-[52px]">
                  <div className="h-full w-full overflow-hidden rounded-md" style={{ border: `1px solid ${palette.border}` }}>
                    <img src={src} alt={`商品图 ${i + 1}`} className="h-full w-full object-cover" />
                  </div>
                  <button
                    type="button"
                    aria-label="移除"
                    className="absolute right-[-4px] top-[-4px] flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white transition-transform hover:scale-110"
                    style={{ background: "#e24b4a" }}
                    onClick={() => updateDraft(prev => ({ ...prev, uploads: prev.uploads.filter((_, j) => j !== i) }))}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* 生成设置（带货图文）／电商背景模板（产品图） */}
        {mode === "post" ? (
          <div>
            <SectionTitle palette={palette}>生成设置</SectionTitle>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={draft.platform} options={ECOMMERCE_PLATFORMS} onChange={platform => updateDraft({ platform })} isDark={isDark} palette={palette} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[220px] text-[11px] leading-relaxed">
投放平台：AI 会参考该平台的常见视觉风格来构图和排版（如 TikTok 偏动感、小红书偏生活感）
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={draft.market} options={ECOMMERCE_MARKETS} onChange={market => updateDraft({ market })} isDark={isDark} palette={palette} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[220px] text-[11px] leading-relaxed">
目标市场：AI 会让场景、模特和道具更贴近当地审美与生活习惯
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={draft.language} options={ECOMMERCE_LANGUAGES} onChange={language => updateDraft({ language })} isDark={isDark} palette={palette} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[220px] text-[11px] leading-relaxed">
文案语言：图片里如果出现标题或卖点文字，会用这种语言书写
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>
                    <Select
                      value={draft.postRatio}
                      options={ECOMMERCE_RATIOS}
                      onChange={postRatio => updateDraft({ postRatio, userModifiedPostRatio: true })}
                      isDark={isDark}
                      palette={palette}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="max-w-[220px] text-[11px] leading-relaxed">
图片比例：决定生成图片的宽高比例，按发布位置选择（如 3:4 适合信息流，9:16 适合全屏）
                </TooltipContent>
              </Tooltip>
            </div>
            {/*
              2026-10-18 用户拍板：去掉「图片不加文字」开关——它会和「商品卖点 & 要求」里
              写的「加 XX 标题文字」直接冲突。是否加字完全由用户提示词决定。
            */}
          </div>
        ) : (
          <div>
            <SectionTitle palette={palette} aside={draft.bgTemplate ? draft.bgTemplate.name : "默认随机"}>
              电商背景模板
            </SectionTitle>
            {/* 2026-10-18：右栏已常驻背景模板列表，这里只回显当前选择（不再弹层） */}
            <div
              className="w-full rounded-md px-3 py-2 text-left text-[12px]"
              style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.text }}
              data-testid="ecommerce-bg-template-current"
            >
              {draft.bgTemplate
                ? `已选：${draft.bgTemplate.name}（${draft.bgTemplate.category}）`
                : "使用默认电商背景模板 · 在右侧挑选"}
            </div>
            {/*
              2026-10-18 用户需求：产品图模式只靠背景模板出图。
              ⚠️ 选了模板时服务端把 scene_type 交给 PicWish，prompt 整段不传
                 （server/image-generation.ts createBackgroundWithPicWish 三元互斥），
                 所以「商品卖点 & 要求」在本模式下已隐藏——必须明说，否则用户会以为少了个输入框。
            */}
            <div
              data-testid="ecommerce-product-template-hint"
              className="mt-1.5 text-[10.5px] leading-relaxed"
              style={{ color: palette.sub }}
            >
              精调模板，无需填写提示词——选好背景模板即可直接出图。
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {(["1:1", "3:4", "9:16", "16:9"] as const).map(r => (
                <button key={r} type="button" className="rounded-md py-1.5 text-[11px]" style={chipStyle(draft.productRatio === r)} onClick={() => updateDraft({ productRatio: r })}>
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {(["1k", "2k", "4k"] as const).map(t => (
                <button key={t} type="button" className="rounded-md py-1.5 text-[11px] uppercase" style={chipStyle(draft.productTier === t)} onClick={() => updateDraft({ productTier: t, userModifiedProductTier: true })}>
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <CountRow
                label="生成数量"
                desc={`1 - 8 张，${modelLabel}${draft.productTier === "1k" ? "" : `（${draft.productTier} 分辨率）`}，张数越多单张越划算。`}
                value={draft.productCount}
                min={1}
                max={8}
                onChange={productCount => updateDraft({ productCount })}
                palette={palette}
              />
              <div className="mt-2 rounded-md px-2.5 py-2 text-[10.5px] leading-relaxed" style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.sub }}>
                💡 产品图模式采用<span style={{ color: palette.text, fontWeight: 500 }}>批次计费</span>：生成 1 张和 8 张消耗的总积分相同。<span style={{ color: LIME }}>建议一次生成多张</span>，单张成本更低。
              </div>
            </div>
          </div>
        )}

        {/*
          卖点：只在带货图文模式显示。
          ⚠️ 产品图模式走 PicWish 模板（scene_type），卖点写进 prompt 也不会被上游使用，
             留着就是「填了没用还不告诉用户」（2026-10-18 用户反馈）。
             带货图文走 image_edit，没有 scene_type，卖点真生效，不能一起删。
        */}
        {/*
          2026-10-19 用户要求：卖点与选择模板关联性强 → 合进同一个大容器。
          外层 panel 底 + 描边；内部输入面用 palette.bg（更深）做「内嵌槽」，中间细分隔线。
          ⚠️ tplSectionRef 仍挂在模板区自身（飞入动画/闪烁定位依赖它），不能挂到外层。
        */}
        {mode === "post" ? (
        <div
          data-testid="ecommerce-brief-group"
          className="rounded-lg p-3"
          style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
        >
        <div>
          <SectionTitle
            palette={palette}
            aside={
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                style={{ color: LIME }}
                onClick={() => {
                  updateDraft({
                    sellingPoints:
                      "产品名称：（从商品图提取）\n核心卖点：（材质 / 功能 / 续航等）\n适用人群：（目标用户）\n期望场景：（使用环境）\n具体参数：（尺寸 / 规格）",
                  });
                  toast.info("已填入卖点框架，替换为真实信息后生成更精准");
                }}
              >
                <WandSparkles size={11} /> AI 帮写
              </button>
            }
          >
            商品卖点 &amp; 要求
          </SectionTitle>
          <textarea
            value={draft.sellingPoints}
            onChange={event => updateDraft({ sellingPoints: event.target.value })}
            placeholder={"建议包含以下信息生成更精准：\n1.产品名称\n2.核心卖点\n3.适用人群\n4.期望场景\n5.具体参数"}
            onFocus={() => setSellingFocused(true)}
            onBlur={() => setSellingFocused(false)}
            data-testid="ecommerce-selling-points"
            className="min-h-[96px] w-full resize-none rounded-md p-2.5 text-[12px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-150"
            style={{
              background: palette.bg,
              // 聚焦态与画布右下角提示词输入框同色值（2026-10-18 用户要求）
              border: `1px solid ${sellingFocused ? "rgba(197,237,71,0.42)" : palette.border}`,
              boxShadow: sellingFocused ? "0 0 0 3px rgba(197,237,71,0.14)" : "none",
              color: palette.text,
            }}
          />
        </div>

          <div className="my-3 h-px" style={{ background: palette.border }} aria-hidden="true" />

          {/* 选择模板（带货图文） */}
            <div ref={tplSectionRef}>
            <SectionTitle palette={palette}>选择模板</SectionTitle>
            {tpl ? (
              <div
                key={`slot-${tpl.id}-${slotPulse}`}
                data-testid="ecommerce-selected-template"
                className={`flex items-center gap-2.5 rounded-md p-2.5${slotPulse ? " ecommerce-slot-pulse" : ""}`}
                style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
              >
                {templateCoverUrl(tpl.id) ? (
                  <img
                    ref={tplSlotRef}
                    data-tpl-slot
                    src={templateCoverUrl(tpl.id)!}
                    alt=""
                    className="h-[52px] w-[66px] shrink-0 rounded object-cover"
                    style={{ background: "linear-gradient(150deg,#4a5068,#2b3044)" }}
                  />
                ) : (
                  <div className="h-[52px] w-10 shrink-0 rounded" style={{ background: "linear-gradient(150deg,#4a5068,#2b3044)" }} />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium" style={{ color: palette.text }}>{tpl.name}</div>
                  <div className="truncate text-[11px]" style={{ color: palette.sub }}>{tpl.flow}</div>
                </div>
                <button
                  type="button"
                  className="ml-auto shrink-0 text-[11px] font-medium transition-opacity hover:opacity-70"
                  style={{ color: "#F87171" }}
                  onClick={() => updateDraft({ tplId: null })}
                  title="移除选中的模板"
                >
                  移除
                </button>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-2 rounded-md border border-dashed p-2.5 text-center text-[12px]"
                style={{ background: palette.bg, borderColor: palette.border, color: palette.sub }}
              >
                <span>暂未选择模板</span>
                {/*
                  ⚠️ 首版这里只是一句静态提示，用户看到「没选模板」却没有任何
                     可点的入口，只能自己回右栏翻。补一个真实跳转。
                */}
                {/*
                  2026-10-18 用户要求：不跳页。点击后右侧第一个模板绿色高亮闪烁两次，
                  提示「模板就在右边」。只是指引，不替用户选中。
                */}
                <button
                  type="button"
                  data-testid="ecommerce-hint-first-template"
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.4)", color: LIME }}
                  onClick={hintFirstTemplate}
                >
                  在右侧选择模板
                </button>
              </div>
            )}
          </div>
        </div>
        ) : null}

        {/*
          图片张数（带货图文）。
          2026-10-18 用户拍板：删掉「附加功能」标题与「社媒帖子发布文案」开关——
          该开关只往 prompt 里塞一句话，出图接口不回文字、页面也无文案区，是摆设。
        */}
        {mode === "post" ? (
          <div>
            <SectionTitle palette={palette}>图片张数</SectionTitle>
            <div className="flex flex-col gap-2">
              <CountRow
                label="张数"
                desc={`热门图文多为 6 张。`}
                value={draft.postCount}
                min={1}
                max={9}
                onChange={postCount => updateDraft({ postCount })}
                palette={palette}
              />
            </div>
          </div>
        ) : null}

        {/* 参数预设：左侧参数板块最下方（两种模式都显示，存的是整套参数） */}
        {presetSlot ? (
          <div className="pt-1" style={{ borderTop: `1px solid ${palette.border}` }}>
            <div className="pt-3">{presetSlot}</div>
          </div>
        ) : null}

          </div>
        </div>
      </aside>

      {/* ── 右侧：模板库 / 生成结果 ── */}
      {/*
        ⚠️ h-full + overflow-y-auto：AppShell 的内容区是 overflow-hidden，
           这里不自带滚动的话，模板库第二屏以下鼠标滚轮完全滚不动。
      */}
      <main className="ecommerce-scroll relative h-full min-w-0 flex-1 overflow-y-auto p-5">
        {showResults ? (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="text-[14px] font-semibold">生成结果</div>
              <span className="text-[11px]" style={{ color: palette.sub }}>
                共 {generating ? count : results.length} 张
              </span>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-[12px]"
                style={{ border: `1px solid ${palette.border}`, color: palette.text }}
                onClick={onClearResults}
              >
                ← {mode === "post" ? "返回模板库" : "返回"}
              </button>
              <button
                type="button"
                disabled={generating || results.length === 0 || downloadingAll}
                onClick={() => void handleDownloadAll()}
                className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] disabled:opacity-45"
                style={{ border: `1px solid ${palette.border}`, color: palette.text }}
              >
                {downloadingAll ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                下载全部
              </button>
              <button
                type="button"
                disabled={generating}
                onClick={onGenerate}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] disabled:opacity-45"
                style={{ border: `1px solid ${palette.border}`, color: palette.text }}
              >
                <RefreshCw size={12} /> 重新生成
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
              {generating
                ? Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="flex aspect-[3/4] items-center justify-center rounded-[10px]" style={{ background: palette.panel, border: `1px solid ${palette.border}` }}>
                      <Loader2 size={20} className="animate-spin" style={{ color: LIME }} />
                    </div>
                  ))
                : interrupted
                  ? (
                      <div
                        className="col-span-full flex aspect-[5/2] flex-col items-center justify-center gap-2 rounded-[10px]"
                        style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
                      >
                        <div className="text-[13px] font-medium" style={{ color: palette.text }}>图片生成中断</div>
                        <div className="text-[11px]" style={{ color: palette.sub }}>点击「重新生成」再试一次</div>
                      </div>
                    )
                  : results.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      className="overflow-hidden rounded-[10px]"
                      style={{ border: `1px solid ${palette.border}` }}
                      onClick={() => onPreviewResult(i)}
                      title="点击放大预览"
                    >
                      <img src={src} alt={`结果 ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                    </button>
                  ))}
            </div>
          </div>
        ) : mode === "post" ? (
          <div>
            <div className="mb-1 flex items-baseline gap-2">
              <div className="text-[14px] font-semibold">模板库</div>
              <div className="text-[11px]" style={{ color: palette.sub }}>选择一个分镜模板，生成节奏更可控</div>
              {/*
                「展示所有模板」—— 首版右栏只有一排卡片，翻完全部 49 个模板要
                 靠横向 chips 一格一格切。这里给一个真实进入二级页的出口。
                 2026-10-17 用户反馈：点击后应确保直接跳转到模板库页面。
              */}
              <Link
                href="/ecommerce-canvas/templates"
                className="ml-auto flex items-center gap-0.5 text-[12px] transition-opacity hover:opacity-80"
                style={{ color: LIME }}
                data-testid="ecommerce-view-all-templates"
              >
                展示所有模板 <ChevronRight size={12} />
              </Link>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {ECOMMERCE_TPL_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="shrink-0 rounded-full px-3 py-1.5 text-[12px]"
                  style={chipStyle(tplCategory === c.id)}
                  onClick={() => setTplCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div ref={tplGridRef} className="mt-2 grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-4">
              {visibleTpls.map((item, i) =>
                i === 0 && tplHintTick > 0 ? (
                  // key 带 tick：每点一次重新挂载这层外壳 → CSS 动画重播
                  <div
                    key={`${item.id}-hint-${tplHintTick}`}
                    data-testid="ecommerce-first-template-hint"
                    className="ecommerce-tpl-hint-flash rounded-[10px]"
                  >
                    <EcommerceTemplateCard
                      template={item}
                      index={i}
                      selected={draft.tplId === item.id}
                      palette={palette}
                      onSelect={selectTemplateWithFlight}
                      onOpenDetail={picked => onOpenTemplateDetail(picked.id)}
                    />
                  </div>
                ) : (
                  <EcommerceTemplateCard
                    key={item.id}
                    template={item}
                    index={i}
                    selected={draft.tplId === item.id}
                    palette={palette}
                    onSelect={selectTemplateWithFlight}
                    onOpenDetail={picked => onOpenTemplateDetail(picked.id)}
                  />
                ),
              )}
            </div>
          </div>
        ) : (
          /* 产品图模式空状态：直接显示背景模板选择器（内嵌模式），不再弹窗 (2026-10-18) */
          <PicwishBackgroundSelector
            isDark={isDark}
            selectedTemplate={draft.bgTemplate}
            onSelect={bgTemplate => updateDraft({ bgTemplate })}
            embedded
            title="产品图模式"
            description="上传产品图并在下方挑选电商背景模板，生成结果将显示在这里。"
          />
        )}

        {/* 电商背景模板选择浮层已废弃，产品图模式下直接内嵌选择器 (2026-10-18) */}
      </main>

      {/*
        模板封面飞行克隆：FLIP 动画，起点在工作台卡片，终点在左栏选择区。
        ⚠️ fixed 定位 + pointer-events-none，不影响页面原布局与点击。
      */}
      {flying && flying.to ? (
        <div
          className="pointer-events-none fixed z-50 overflow-hidden rounded-md"
          style={{
            left: flying.from.left,
            top: flying.from.top,
            width: flying.from.width,
            height: flying.from.height,
            boxShadow: "0 4px 24px rgba(197,237,71,0.22)",
            // ⚠️ 必须左上角为原点：默认 center 时 scale 会让位移量算错，落点偏移。
            transformOrigin: "top left",
            animation: "ecommerce-fly-to-slot 620ms cubic-bezier(0.2,0,0,1) forwards",
            "--fly-tx": `${flying.to.left - flying.from.left}px`,
            "--fly-ty": `${flying.to.top - flying.from.top}px`,
            "--fly-sx": (flying.to.width / flying.from.width).toString(),
            "--fly-sy": (flying.to.height / flying.from.height).toString(),
          } as React.CSSProperties}
        >
          <img
            src={flying.src}
            alt=""
            loading="eager"
            className="h-full w-full rounded object-cover"
          />
        </div>
      ) : null}

      <style>{`
        @keyframes ecommerce-fly-to-slot {
          to {
            transform: translate(var(--fly-tx), var(--fly-ty)) scale(var(--fly-sx), var(--fly-sy));
          }
        }
        @keyframes ecommerce-slot-pulse {
          0%, 100% { transform: scale(1); }
          30% { transform: scale(0.97); }
          60% { transform: scale(1.01); }
        }
        .ecommerce-slot-pulse {
          animation: ecommerce-slot-pulse 460ms ease-out;
        }
        /* 「在右侧选择模板」指引：绿色高亮闪烁两次（亮-暗-亮-暗） */
        @keyframes ecommerce-tpl-hint-flash {
          0%, 50%, 100% { box-shadow: 0 0 0 0 rgba(197,237,71,0); }
          25%, 75% { box-shadow: 0 0 0 2px ${LIME}, 0 0 18px rgba(197,237,71,0.45); }
        }
        .ecommerce-tpl-hint-flash {
          animation: ecommerce-tpl-hint-flash 1200ms ease-in-out;
        }
      `}</style>
    </div>
  );
}
