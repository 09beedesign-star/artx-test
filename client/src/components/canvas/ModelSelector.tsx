import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  AUTO_AI_MODEL,
  IMAGE_AI_MODEL_OPTIONS,
  TEXT_AI_MODELS,
  THREED_AI_MODEL_OPTIONS,
  mergeImageAiModelOptions,
  type AiModelOption,
} from "../../lib/workspace-data";
import { getAiModelEntitlements, listAiModelCatalog } from "../../lib/ai";
import { getStorageOwnerId } from "../../lib/owner-storage";
import { getModelBrandIconKind, ModelBrandIconMask } from "./model-brand-icons";
import { modelPopoverTokens, type ModelPopoverTheme, type ModelPopoverTokens } from "./model-popover-tokens";
import {
  getImageModelDefaultOutputCount,
  hasCustomDefaultOutputCount,
} from "@shared/image-models";
import {
  getAiImageModelCreditPolicy,
  getAiThreeDModelCreditPolicy,
  HIGH_COST_IMAGE_CREDITS_THRESHOLD,
  isHighCostImageModel,
} from "../../../../shared/ai-credit-policy";
import { DEFAULT_IMAGE_MODEL_ID } from "../../../../shared/image-models";

/**
 * 模型选择器 —— 画布与首页共用的唯一实现。
 *
 * 【为什么要抽出来】
 * 2026-09-15 给首页提示词输入框加模型选择器时，原本可以在 HomePage 里
 * 照着画布的样子再写一个。但这个项目已经在「同一份数据的多个出口」上
 * 连踩九次（比例 8 出口 / 字体 22 出口 / 画幅 6 出口），代价是
 * 「只改一个出口 = 功能等于没做，零报错」。
 *
 * 模型清单是会持续变动的数据（新模型上线、权益调整、图标补充），
 * 如果首页和画布各有一份渲染实现，下一次加模型时必然只改一处。
 * 所以这里一次性收口成共享组件，两个页面引用同一份代码。
 *
 * ⚠️ 本文件从 InfiniteCanvas.tsx 原样搬迁，**行为必须与搬迁前逐像素一致**。
 * 搬迁不是重写的借口 —— 任何"顺手优化"都会让画布侧产生回归。
 */

/**
 * 与 InfiniteCanvas.tsx 里的同名函数保持一致（画布面板的默认表面色）。
 * 这两个值是画布浮层的通用底色，不随模型清单变化，因此这里直接对齐常量，
 * 不做跨文件导入 —— 避免把 InfiniteCanvas 这个 1.1MB 的巨型模块
 * 拉进首页的依赖图（首页只需要一个选择器，不该为此加载整个画布）。
 */
function getMinimapSurfaceBackground(isDark: boolean) {
  return isDark ? "rgba(22,22,30,0.80)" : "rgba(255,255,255,0.82)";
}

function getMinimapSurfaceBorder(isDark: boolean) {
  return isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
}

function ImageModelLineIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 15.5 10.2 12l2.2 2.4 1.6-1.8 2.8 2.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.8" cy="8.8" r="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function AssistantModelIcon({
  modelId,
  icon,
  color = "#FFFFFF",
}: {
  modelId: string;
  icon?: string;
  /**
   * 图标颜色。
   *
   * 默认保持 #FFFFFF —— 画布里的触发按钮和节点上的模型标都依赖这个白色，
   * 改默认值等于一次性改掉全站所有调用点。
   *
   * 2026-09-16 开放此参数，是因为首页的模型选择器要和它左边的
   * 「添加参考图」按钮长成同一个样子：那个按钮默认态是 #7d7d7d 灰、
   * hover 才转白。选择器的图标却恒为白，两个并排的控件默认态一深一浅，
   * 看起来像其中一个是「已激活」状态。
   *
   * ⚠️ 传 "currentColor" 即可让图标跟随按钮自身的文字色，
   *    hover 变色不用再单独接一路状态。
   */
  color?: string;
}) {
  /**
   * 这里**绝不能因为认不出品牌就 return null**。
   *
   * 2026-09-13 线上 bug：调用点漏传 icon 时 getModelBrandIconKind 会落到 "none"，
   * 组件直接返回 null，选择器的触发按钮上就是一块空白 —— 用户看到的是
   * 「有的模型选中后没图标」。根因虽然在调用点，但把整条渲染链的最后一环
   * 做成「认不出就什么都不画」，等于给每一个新增调用点都埋了同一颗雷。
   *
   * 现在的口径：品牌认得出就用品牌图标，认不出一律降级到通用图片线框图标。
   * 图标位永远占位，永远有东西可看。
   */
  if (modelId === AUTO_AI_MODEL.id) {
    // auto 不是某一个品牌，它是「让系统替你挑」。全站用魔法棒表示这个语义
    // （compact 态的 auto 按钮同样是 WandSparkles），这里保持一致。
    return (
      <span
        data-model-brand-icon="auto"
        style={{ color, display: "inline-flex", flex: "0 0 auto", marginTop: 2 }}
      >
        <WandSparkles size={14} />
      </span>
    );
  }
  const iconKind = getModelBrandIconKind(modelId, icon);
  /*
    ⚠️ 品牌图标走 CSS mask，颜色由 backgroundColor 决定，**不吃 color**。
       光在外层 span 上改 color 只能管住线框图（那个用 currentColor 描边），
       品牌图标会继续是白的 —— 这就是「同一份视觉的多个出口」在图标上的形态。
       所以 color 必须同时往 ModelBrandIconMask 的 backgroundColor 传一份。
  */
  const iconNode = iconKind === "image" || iconKind === "none"
    ? <ImageModelLineIcon size={14} />
    : <ModelBrandIconMask kind={iconKind} size={14} style={{ backgroundColor: color }} />;
  return (
    <span
      data-model-brand-icon={iconKind}
      style={{ color, display: "inline-flex", flex: "0 0 auto", marginTop: 2 }}
    >
      {iconNode}
    </span>
  );
}

/**
 * 「高消耗」角标 —— 全站所有模型清单的**唯一实现**（2026-10）。
 *
 * 口径在 shared/ai-credit-policy.ts 的 isHighCostImageModel：单价高于默认档
 * （70 积分/张）即标。⚠️ 模型清单有三个渲染出口（本文件的 ModelSelector、
 * 画布 ImageGeneratorPopover、AI 助手模型菜单），必须都用这个组件，
 * 只改一处 = 另外两处用户照样无感知地选到 300 积分的模型。
 */
export function HighCostBadge({ model }: { model: string }) {
  if (!isHighCostImageModel(model)) return null;
  const credits = getAiImageModelCreditPolicy(model)?.creditsPerImage;
  return (
    <span
      data-high-cost-badge={model}
      title={credits ? `${credits} 积分/张，高于默认档 ${HIGH_COST_IMAGE_CREDITS_THRESHOLD} 积分/张` : undefined}
      className="shrink-0 rounded-full"
      style={{
        fontSize: 9,
        lineHeight: "14px",
        padding: "0 6px",
        color: "#F59E0B",
        background: "rgba(245,158,11,0.14)",
        border: "1px solid rgba(245,158,11,0.36)",
        letterSpacing: 0,
        whiteSpace: "nowrap",
      }}
    >
      高消耗
    </span>
  );
}

/**
 * 模型目录 + 权益的拉取 hook。
 *
 * ⚠️ 首页也必须走这个 hook，不能直接用静态的 IMAGE_AI_MODEL_OPTIONS：
 * 否则首页会把「当前套餐买不起的模型」当成可选项展示出来，
 * 用户选了之后要到画布里才发现用不了 —— 错误发生在一个页面，
 * 暴露在另一个页面，是最难排查的那种。
 */
/**
 * 模块级短缓存：DraftImageNode 等组件每个节点都会挂一个选择器，
 * 不缓存时画布上 N 个草稿节点 = N 次目录 + 权益请求。
 * 30 秒足够覆盖一次画布加载，又不会让「刚升级套餐」的用户等太久才解锁。
 */
const MODEL_OPTIONS_CACHE_TTL_MS = 30_000;
let modelOptionsCache: { at: number; owner: string; promise: Promise<AiModelOption[]> } | null = null;

function loadEntitledImageModelOptions(): Promise<AiModelOption[]> {
  // ⚠️ 缓存按账号隔离：切账号（Free ↔ Pro）后不能沿用上一个账号的权益。
  const owner = getStorageOwnerId();
  if (
    modelOptionsCache
    && modelOptionsCache.owner === owner
    && Date.now() - modelOptionsCache.at < MODEL_OPTIONS_CACHE_TTL_MS
  ) {
    return modelOptionsCache.promise;
  }
  const promise = Promise.allSettled([listAiModelCatalog(), getAiModelEntitlements()])
    .then(results => {
          const catalog = results[0].status === "fulfilled" ? results[0].value : null;
          const entitlements = results[1].status === "fulfilled" ? results[1].value.imageModels : [];
          const entitlementByModel = new Map(entitlements.map(item => [item.model, item]));
          return (
            mergeImageAiModelOptions(catalog?.image || []).map(option => {
              const entitlement = entitlementByModel.get(option.id);
              if (!entitlement || option.id === AUTO_AI_MODEL.id) return option;
              const blocked =
                entitlement.status === "unavailable" || entitlement.status === "exhausted";
              /*
               * ⚠️⚠️ unavailableReason 只有在模型**真的不能用**时才能赋值。
               *
               * 渲染出口读的都是 `unavailableReason || description` —— 短路取前者。
               * 此前这里无条件写 `unavailableReason: entitlement.message`，
               * 而标准模型的 message 是 "70 积分/张"（server/admin-store.ts:1570），
               * 于是**所有可用模型的能力描述被价格文案永久遮住**：
               * workspace-data.ts 里精心写的"高品质综合表现"一个字都没显示过。
               *
               * 这个字段的语义是「为什么不能选」，不是「附加信息」。
               * 能选的时候它必须是 undefined，否则等于把 description 作废。
               *
               * ⚠️ 同理不能把 entitlement.label（"标准模型"/"Pro / Studio 专属"）
               * 拼进 description —— 那是权益分组名，不是模型能力，
               * 拼上去既超出 20 字上限，也让每一行尾巴都挂着重复的"· 标准模型"。
               * 权益受限的信息由 disabled 置灰 + unavailableReason 表达，足够了。
               */
              return {
                ...option,
                disabled: blocked,
                unavailableReason: blocked ? entitlement.message : undefined,
              };
            })
          );
    })
    .catch(() => IMAGE_AI_MODEL_OPTIONS);
  modelOptionsCache = { at: Date.now(), owner, promise };
  return promise;
}

export function useImageModelOptions() {
  const [imageModelOptions, setImageModelOptions] = useState(IMAGE_AI_MODEL_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    void loadEntitledImageModelOptions().then(options => {
      if (!cancelled) setImageModelOptions(options);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return imageModelOptions;
}

export type ModelSelectorSurface = {
  background: string;
  border: string;
  text: string;
  /**
   * hover / 展开时的触发按钮样式（可选）。
   *
   * 不传 → 沿用画布口径：套一层深色底托 + 文字转白。
   * 传了 → 按调用方给的来。
   *
   * 2026-09-16 为首页开放：首页这一行里，选择器左边就是「添加参考图」按钮，
   * 那个按钮 hover 只是 #7d7d7d → 白，没有任何底托。选择器却会弹出一块
   * 深色方块，两个并排控件的 hover 反馈完全不是一套语言。
   *
   * ⚠️ 默认值必须保持画布现状 —— 这是搬迁来的组件，
   *    动默认值等于在画布侧制造一次无人察觉的视觉回归。
   */
  hoverBackground?: string;
  hoverText?: string;
  /** 展开时的描边。不传则沿用画布的紫色高亮描边。 */
  openBorder?: string;
};

/**
 * 首页与画布的配色体系不同：
 *   - 画布走 isDark 主题变量（oklch 色值，随明暗主题切换）
 *   - 首页是固定深色玻璃面板（#212121 / #454545 硬编码）
 *
 * 与其让组件内部去 if/else 两套主题（那等于把页面知识塞进通用组件），
 * 不如让调用方把「触发按钮长什么样」作为参数传进来。
 * 下拉面板本身两边保持一致，不开放定制 —— 面板是模型清单的表达，
 * 不该因为放在哪个页面而长得不一样。
 */
export function ModelSelector({
  model,
  onChange,
  isDark,
  /**
   * 不传 → 组件内部自取「目录 + 权益」（2026-10）。
   * 此前默认值是静态 IMAGE_AI_MODEL_OPTIONS，画布里 4 个调用点
   * （素材面板 / 草稿节点 / 底部提示条 / 节点悬浮条）因此**完全不看权益**，
   * 免费用户能在那里选中被锁的模型，直到发请求才吃 403。
   */
  models: modelsProp,
  surface,
  placement = "up",
  triggerClassName,
  /**
   * 「只留图标」模式（2026-09-21）：触发按钮隐藏模型名文案，只渲染
   * 模型图标 + 展开箭头。节点悬浮提示条要求整行按钮去掉文案省空间，
   * 当前选了什么模型由下拉面板与 title 表达。默认 false，既有调用零影响。
   */
  iconOnly = false,
  /**
   * 展开面板配色（2026-11-10 电商画布需求）。
   * 默认 "dark" —— 画布/首页的深色面板口径原样保留；
   * 浅色页面（电商画布）显式传 "light" 才是白底深字。
   */
  popoverTheme = "dark",
  /**
   * 是否展示 3D 分类 tab（默认 true）。
   * 电商画布只用图片模型，显式传 false 隐藏 tab 行并排除 3D 模型列表。
   */
  enable3D = true,
}: {
  model: string;
  onChange: (m: string) => void;
  isDark: boolean;
  models?: AiModelOption[];
  surface?: ModelSelectorSurface;
  placement?: "up" | "down";
  triggerClassName?: string;
  iconOnly?: boolean;
  popoverTheme?: ModelPopoverTheme;
  enable3D?: boolean;
}) {
  const entitledModels = useImageModelOptions();
  const models = modelsProp ?? entitledModels;
  /**
   * 分类 tab 状态。2026-11-18 起 3D 全面下架,分类改为「生图 / 对话」两等分,
   * 与右下角 composer 的浮层（AssistantModelPopover）完全一致。
   * category 只控制「面板里展示哪批」,不影响外部 model 值。
   * 对话模型是文本模型（TEXT_AI_MODELS）,下游画布会按 isSupportedImageModelId
   * 自动路由生图 / 对话,所以传出文本模型 id 是安全的。
   */
  const [category, setCategory] = useState<"image" | "text">("image");
  /** 当前 category 下可见的模型列表 */
  const displayModels: AiModelOption[] = category === "text" ? TEXT_AI_MODELS : models;
  /** 弹层高度上限（含 tab 行），交给公共浮层做滚动 */
  const TAB_ROW_HEIGHT = 40;
  /**
   * 当前选中的模型被权益置灰（典型：免费用户 + 节点悬浮条默认即梦 / 本地偏好
   * 里存着 banana）→ 自动切回默认档。不切的话按钮上显示的是一个用不了的模型，
   * 用户一点生成就 403，体验等于「默认就是坏的」。
   * ⚠️ 只在图片模型里做自动回退，3D 模型当前无权益限制。
   */
  useEffect(() => {
    const selected = models.find(m => m.id === model);
    if (!selected?.disabled) return;
    const fallback = models.find(m => m.id === DEFAULT_IMAGE_MODEL_ID && !m.disabled)
      || models.find(m => !m.disabled);
    if (fallback && fallback.id !== model) onChange(fallback.id);
  }, [model, models, onChange]);
  const [open, setOpen] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(
    null
  );
  const current = models.find(m => m.id === model)
    || THREED_AI_MODEL_OPTIONS.find(m => m.id === model)
    || AUTO_AI_MODEL;
  const bg = surface ? surface.background : getMinimapSurfaceBackground(isDark);
  const selectedBg = surface?.hoverBackground
    ?? (isDark ? "#161616" : "rgba(255,255,255,0.97)");
  const border = surface ? surface.border : getMinimapSurfaceBorder(isDark);
  const selectedBorder = surface?.openBorder ?? (isDark ? "#161616" : "rgba(20,20,36,0.22)");
  const text = surface ? surface.text : (isDark ? "#bbbbbb" : "#161616");
  const selectedText = surface?.hoverText ?? (isDark ? "white" : "#161616");
  /**
   * 触发按钮上图标的颜色。
   *
   * 跟着按钮文字色走，而不是恒为白 —— 否则「默认态灰字 + 白图标」，
   * 看起来像图标被单独点亮了。用具体色值而非 "currentColor"：
   * 品牌图标是 CSS mask，需要一个真实色值填进 backgroundColor。
   */
  const triggerIconColor = open || buttonHover ? selectedText : text;
  /**
   * 下拉面板与触发按钮是两套配色：触发按钮可以被调用方的 surface 接管
   * （首页传的是深色玻璃面板上的浅色文字），面板照抄 text 会白底白字。
   * 所以整组色值统一由 modelPopoverTokens 给出，不再散落 isDark 三元。
   */
  const pop = modelPopoverTokens(popoverTheme, { text, border }, isDark);
  const rowHeight = 40;
  /**
   * 展开栏高度上限（2026-09-21 用户点名 220）。
   * 始终显示「生图 / 对话」tab 行，额外加其高度。
   * 超出的模型行走下方滚动条（overflowY auto + model-selector-scroll）。
   */
  const panelHeight = Math.min(displayModels.length * rowHeight, 220)
    + TAB_ROW_HEIGHT;
  const popMinWidth = 160;
  const POP_GAP = 4;
  const VIEWPORT_MARGIN = 8;

  /**
   * ⚠️ 下拉面板用 portal 到 body + position:fixed 定位（2026-09-21）。
   *
   * 【为什么改】节点悬浮提示条（AssetEditPromptBar）容器带 overflow:hidden，
   * absolute 定位的面板会被悬浮窗裁断；面板的 zIndex 又被关在悬浮窗自己的
   * 层叠上下文里，调多大都压不住画布根层 —— 这是「层叠上下文归属」问题，
   * z-index 无解，只能像 ImageCountSelector 一样 portal 到 body。
   *
   * 定位规则（与 ImageCountSelector 同一套）：
   *   - up：面板底缘贴按钮上缘 - GAP，用 `bottom` 定位 → 面板高度随内容
   *     收缩时仍然贴着按钮，不会悬空；
   *   - down：面板顶缘贴按钮下缘 + GAP，用 `top` 定位；
   *   - maxHeight = min(220 上限, 该侧视口可用空间) → 极端贴边时面板
   *     压缩 + 滚动条兜底，永不越出视口；
   *   - 默认侧放不下时翻到另一侧。
   */
  const updatePopoverPosition = useCallback(() => {
    const trigger = modelRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceUp = rect.top - POP_GAP - VIEWPORT_MARGIN;
    const spaceDown = window.innerHeight - rect.bottom - POP_GAP - VIEWPORT_MARGIN;
    let effUp = placement === "up";
    if (effUp && spaceUp < panelHeight && spaceDown > spaceUp) effUp = false;
    if (!effUp && spaceDown < panelHeight && spaceUp > spaceDown) effUp = true;
    const maxHeight = Math.min(panelHeight, Math.max(rowHeight, effUp ? spaceUp : spaceDown));
    setPopoverStyle({
      position: "fixed",
      left: Math.min(
        Math.max(VIEWPORT_MARGIN, rect.left),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - popMinWidth - VIEWPORT_MARGIN)
      ),
      top: effUp ? undefined : rect.bottom + POP_GAP,
      bottom: effUp ? window.innerHeight - rect.top + POP_GAP : undefined,
      minWidth: popMinWidth,
      maxHeight,
    });
  }, [placement, panelHeight]);

  // 点外关闭：portal 后面板不在 modelRef 子树里，必须把 popoverRef 一并认作「内部」。
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof globalThis.Node &&
        !modelRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  // 打开时先算一帧位置（layoutEffect 防首帧闪 (0,0)），之后跟随 resize / 滚动重算。
  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition]);

  return (
    <div
      ref={modelRef}
      className="relative nodrag nopan"
      style={{ zIndex: open ? 1200 : 100 }}
    >
      <button
        type="button"
        title={iconOnly ? `模型：${current.label}` : undefined}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className={
          triggerClassName
          || "flex h-8 items-center gap-1 rounded-[var(--radius-md-design)] px-2 transition-colors"
        }
        style={{
          background: open || buttonHover ? selectedBg : bg,
          border: `1px solid ${open ? selectedBorder : border}`,
          color: open || buttonHover ? selectedText : text,
          /*
            ⚠️ 字号只在「没传 triggerClassName」时才由内联样式接管。
               内联 style 的优先级高于 className，写死 fontSize: 11 会把调用方
               传进来的 text-xs 直接顶掉 —— 首页要求这个按钮和它左边的
               「添加参考图」长一样，而那个按钮是 text-xs(12px)，
               差 1px 在并排时肉眼可见。
               画布侧不传 triggerClassName，走原分支，行为不变。
          */
          ...(triggerClassName
            ? { letterSpacing: 0 }
            : { fontSize: 11, lineHeight: "14px", letterSpacing: 0 }),
        }}
        onMouseEnter={() => setButtonHover(true)}
        onMouseLeave={() => setButtonHover(false)}
      >
        <AssistantModelIcon
          modelId={current.id}
          icon={current.icon}
          color={triggerIconColor}
        />
        {!iconOnly && current.label}
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <AssistantModelPopover
            popoverRef={popoverRef}
            style={{
              ...(popoverStyle || {}),
              ...(pop.scrollbar ? { scrollbarColor: `${pop.scrollbar} transparent` } : {}),
            }}
            activeCategory={category}
            onCategoryChange={cat => setCategory(cat as "image" | "text")}
            models={displayModels}
            selectedModelId={model}
            onSelectModel={m => {
              onChange(m.id);
              setOpen(false);
            }}
            tabs={[
              { id: "image", label: "生图" },
              { id: "text", label: "对话" },
            ]}
            tokens={pop}
            text={selectedText}
            sub={isDark ? "#bbbbbb" : "#8b8b8b"}
            isDark={isDark}
            border={border}
          />,
          document.body
        )}
    </div>
  );
}

/* ============================================================================
 * AssistantModelPopover —— 模型选择器「展开浮层」的唯一 UI 实现（2026-11-18）
 * ============================================================================
 * 【为什么收口到这里】
 * 之前存在两套浮层：
 *   - A 套：右下角 composer 内联（auto 开关 + 生图/对话胶囊 tab + 模型描述
 *     + 选中打勾），也就是用户截图里那套「最新 UI」。
 *   - B 套：本文件的 ModelSelector 浮层（下划线 tab、无 auto、无打勾），首页
 *     和节点悬浮用的就是它 —— 用户看到的「UI 回退」正是这套。
 * 两份视觉写死在两个地方，改一处另一处不变。现在把浮层内容收口成本组件，
 * A 套（右下角）和 B 套（本文件）都渲染它，浮层视觉只此一份。
 *
 * ⚠️ 本组件只负责「浮层里画什么」，不含触发按钮、portal 和定位 —— 那些在
 *    各调用方（右下角 composer / ModelSelector），因为锚点、开关状态、业务
 *    路由各不相同。当前版本的浮层列表项逐像素复刻 A 套（用户确认的标准）。
 */
export type ModelPopoverCategory = "image" | "text" | "3d";

export type ModelPopoverTab = {
  id: ModelPopoverCategory;
  label: string;
  /** 该 tab 是否可见；不传=可见。用于 3D 下架、空模型列表等场景。 */
  visible?: boolean;
};

export interface AssistantModelPopoverProps {
  /** 当前激活的分类（决定展示哪批模型 + 角标口径）。 */
  activeCategory: ModelPopoverCategory;
  onCategoryChange: (category: ModelPopoverCategory) => void;
  /** 当前分类下要展示的模型列表。 */
  models: AiModelOption[];
  /** 当前选中的模型 id（用于打勾 / 高亮）。 */
  selectedModelId: string;
  /** 点选模型的回调。disabled 的模型不会触发。 */
  onSelectModel: (model: AiModelOption) => void;
  /** 分类 tab 配置。默认「生图 / 对话」两等分。 */
  tabs?: ModelPopoverTab[];

  /** 是否显示顶部 auto 行。右下角 composer=true，首页/节点悬浮=false（默认）。 */
  showAuto?: boolean;
  autoMode?: boolean;
  onAutoModeChange?: (value: boolean) => void;
  autoDisabled?: boolean;

  /** 配色。由调用方用 modelPopoverTokens 算好后传入，避免组件内散落 isDark 三元。 */
  tokens: ModelPopoverTokens;
  /** 模型名 / auto 标题的主文字色。 */
  text: string;
  /** 描述 / 次要信息色。 */
  sub: string;
  isDark: boolean;
  /** auto 开关关闭态边框色。 */
  border: string;

  /** 角标开关：默认都开，首页/节点悬浮可直接用默认值。 */
  showHighCostBadge?: boolean;
  showDefaultCountBadge?: boolean;
  show3DCreditBadge?: boolean;

  /** 透传给浮层根节点的定位样式（portal 的 top/bottom/maxHeight 等）。 */
  style?: CSSProperties;
  className?: string;
  popoverRef?: Ref<HTMLDivElement>;
  /** 阻止浮层内的点击冒泡到画布节点。默认 true。 */
  stopClickPropagation?: boolean;
}

export function AssistantModelPopover({
  activeCategory,
  onCategoryChange,
  models,
  selectedModelId,
  onSelectModel,
  tabs = [
    { id: "image", label: "生图" },
    { id: "text", label: "对话" },
  ],
  showAuto = false,
  autoMode = false,
  onAutoModeChange,
  autoDisabled = false,
  tokens,
  text,
  sub,
  isDark,
  border,
  showHighCostBadge = true,
  showDefaultCountBadge = true,
  show3DCreditBadge = true,
  style,
  className,
  popoverRef,
  stopClickPropagation = true,
}: AssistantModelPopoverProps) {
  const visibleTabs = tabs.filter(tab => tab.visible !== false);

  return (
    <div
      ref={popoverRef}
      className={className ?? "model-selector-scroll overflow-y-auto rounded-[var(--radius-md-design)] p-1 shadow-2xl"}
      style={{
        ...(style || {}),
        background: tokens.background,
        border: `1px solid ${tokens.border}`,
        color: tokens.text,
        ...(tokens.shadow ? { boxShadow: tokens.shadow } : {}),
        backdropFilter: "blur(16px)",
        zIndex: 9999,
      }}
      onClick={stopClickPropagation ? e => e.stopPropagation() : undefined}
    >
      {/* 顶部 auto 行 —— 仅右下角 composer 显示；首页/节点悬浮不显示 */}
      {showAuto && onAutoModeChange && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm-design)] px-2.5 py-2">
          <span
            className="type-caption"
            style={{ color: text, fontWeight: 700, textTransform: "none", letterSpacing: 0 }}
          >
            auto
          </span>
          <Switch
            checked={autoMode}
            onCheckedChange={onAutoModeChange}
            disabled={autoDisabled}
            aria-label="自动模式"
            style={{
              background: autoMode
                ? "var(--artx-action-active-bg)"
                : isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(0,0,0,0.12)",
              border: `1px solid ${autoMode ? "var(--artx-action-active-border)" : border}`,
            }}
            thumbStyle={{
              background: autoMode
                ? "var(--artx-action-active-fg)"
                : isDark
                  ? "#999999"
                  : "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
            }}
          />
        </div>
      )}

      {/* 分类 tab 行 —— 胶囊圆角、等分网格（生图 / 对话），与截图一致 */}
      {visibleTabs.length > 0 && (
        <div
          className="grid gap-1 px-1 pb-1"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
        >
          {visibleTabs.map(tab => {
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className="h-7 rounded-[var(--radius-md-design)] type-caption transition-colors"
                style={{
                  color: active ? tokens.text : sub,
                  background: active ? tokens.selectedBackground : "transparent",
                  border: `1px solid ${active ? tokens.border : "var(--artx-action-border)"}`,
                }}
                onClick={() => onCategoryChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 模型列表：图标 + 名称 + 角标 + 描述 + 选中打勾 */}
      {models.map(model => {
        const is3D = activeCategory === "3d";
        const isImage = activeCategory === "image";
        const threeDCredit = is3D && show3DCreditBadge
          ? getAiThreeDModelCreditPolicy(model.id)
          : null;
        const hasDefaultCount = isImage && showDefaultCountBadge && hasCustomDefaultOutputCount(model.id);
        const selected = selectedModelId === model.id;
        return (
          <button
            key={model.id}
            type="button"
            disabled={model.disabled}
            className="flex w-full items-center justify-between rounded-[var(--radius-sm-design)] px-2.5 py-2 text-left transition-colors"
            style={{
              color: tokens.text,
              opacity: model.disabled ? 0.46 : 1,
              cursor: model.disabled ? "not-allowed" : "pointer",
              background: selected ? tokens.selectedBackground : "transparent",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = tokens.hoverBackground)}
            onMouseLeave={e =>
              (e.currentTarget.style.background = selected ? tokens.selectedBackground : "transparent")
            }
            onClick={() => {
              if (model.disabled) {
                toast("当前模型暂不可用", {
                  description: model.unavailableReason || "请切换其他模型继续创作。",
                });
                return;
              }
              onSelectModel(model);
            }}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <AssistantModelIcon modelId={model.id} icon={model.icon} color={tokens.icon} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p
                    className="truncate text-xs font-semibold"
                    style={{ color: text, textTransform: "none", letterSpacing: 0 }}
                  >
                    {model.label}
                  </p>
                  {isImage && showDefaultCountBadge && hasDefaultCount ? (
                    <span
                      className="shrink-0 rounded-full"
                      style={{
                        fontSize: 9,
                        lineHeight: "14px",
                        padding: "0 6px",
                        color: "#C5ED47",
                        background: "rgba(197,237,71,0.14)",
                        border: "1px solid rgba(197,237,71,0.32)",
                        letterSpacing: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      默认{getImageModelDefaultOutputCount(model.id)}张
                    </span>
                  ) : null}
                  {isImage && showHighCostBadge ? <HighCostBadge model={model.id} /> : null}
                  {is3D && threeDCredit ? (
                    <span
                      className="shrink-0 rounded-full"
                      style={{
                        fontSize: 9,
                        lineHeight: "14px",
                        padding: "0 6px",
                        color: sub,
                        background: tokens.hoverBackground,
                        border: `1px solid ${tokens.border}`,
                        letterSpacing: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {threeDCredit.creditsPerGeneration} 积分/次
                    </span>
                  ) : null}
                </div>
                {"description" in model && model.description ? (
                  <p
                    className="truncate"
                    style={{
                      color: sub,
                      fontSize: 10,
                      letterSpacing: 0,
                      marginTop: 2,
                      maxWidth: 150,
                    }}
                  >
                    {model.unavailableReason || model.description}
                  </p>
                ) : null}
                {isImage && hasDefaultCount && !model.unavailableReason ? (
                  <p
                    style={{
                      color: sub,
                      fontSize: 9,
                      letterSpacing: 0,
                      marginTop: 2,
                      maxWidth: 168,
                      lineHeight: "13px",
                      opacity: 0.85,
                    }}
                  >
                    选中后自动出 {getImageModelDefaultOutputCount(model.id)} 张，按张计费，可在「张数」里改
                  </p>
                ) : null}
              </div>
            </div>
            {selected && (
              <Check size={13} style={{ color: tokens.text, flex: "0 0 auto" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
