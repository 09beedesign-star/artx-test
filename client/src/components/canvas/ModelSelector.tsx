import { useEffect, useRef, useState } from "react";
import { ChevronDown, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AUTO_AI_MODEL,
  IMAGE_AI_MODEL_OPTIONS,
  mergeImageAiModelOptions,
  type AiModelOption,
} from "../../lib/workspace-data";
import { getAiModelEntitlements, listAiModelCatalog } from "../../lib/ai";
import { getModelBrandIconKind, ModelBrandIconMask } from "./model-brand-icons";

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
}: {
  modelId: string;
  icon?: string;
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
        style={{ color: "#FFFFFF", display: "inline-flex", flex: "0 0 auto", marginTop: 2 }}
      >
        <WandSparkles size={14} />
      </span>
    );
  }
  const iconKind = getModelBrandIconKind(modelId, icon);
  const iconNode = iconKind === "image" || iconKind === "none"
    ? <ImageModelLineIcon size={14} />
    : <ModelBrandIconMask kind={iconKind} size={14} />;
  return (
    <span
      data-model-brand-icon={iconKind}
      style={{ color: "#FFFFFF", display: "inline-flex", flex: "0 0 auto", marginTop: 2 }}
    >
      {iconNode}
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
export function useImageModelOptions() {
  const [imageModelOptions, setImageModelOptions] = useState(IMAGE_AI_MODEL_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listAiModelCatalog(), getAiModelEntitlements()])
      .then(results => {
        if (!cancelled) {
          const catalog = results[0].status === "fulfilled" ? results[0].value : null;
          const entitlements = results[1].status === "fulfilled" ? results[1].value.imageModels : [];
          const entitlementByModel = new Map(entitlements.map(item => [item.model, item]));
          setImageModelOptions(
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
        }
      })
      .catch(() => {
        if (!cancelled) setImageModelOptions(IMAGE_AI_MODEL_OPTIONS);
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
  models = IMAGE_AI_MODEL_OPTIONS,
  surface,
  placement = "up",
  triggerClassName,
}: {
  model: string;
  onChange: (m: string) => void;
  isDark: boolean;
  models?: AiModelOption[];
  surface?: ModelSelectorSurface;
  placement?: "up" | "down";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const current = models.find(m => m.id === model) || AUTO_AI_MODEL;
  const bg = surface ? surface.background : getMinimapSurfaceBackground(isDark);
  const selectedBg = isDark
    ? "oklch(0.13 0.015 270)"
    : "oklch(0.22 0.015 270)";
  const border = surface ? surface.border : getMinimapSurfaceBorder(isDark);
  const selectedBorder = "oklch(0.62 0.22 290 / 45%)";
  const text = surface ? surface.text : (isDark ? "oklch(0.74 0.01 270)" : "oklch(0.58 0.008 270)");
  const selectedText = "white";
  const popBg = isDark ? "oklch(0.16 0.018 270)" : "oklch(0.99 0.004 270)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 5%)";
  const rowHeight = 40;
  const panelHeight = Math.min(models.length * rowHeight, 320);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        modelRef.current &&
        event.target instanceof globalThis.Node &&
        !modelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  return (
    <div
      ref={modelRef}
      className="relative nodrag nopan"
      style={{ zIndex: open ? 1200 : 100 }}
    >
      <button
        type="button"
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
          fontSize: 11,
          lineHeight: "14px",
          letterSpacing: 0,
        }}
        onMouseEnter={() => setButtonHover(true)}
        onMouseLeave={() => setButtonHover(false)}
      >
        <AssistantModelIcon modelId={current.id} icon={current.icon} />
        {current.label}
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div
          className={`absolute ${placement === "down" ? "top-full mt-1" : "bottom-full mb-1"} left-0 rounded-[var(--radius-md-design)] overflow-hidden shadow-2xl`}
          style={{
            background: popBg,
            border: `1px solid ${border}`,
            minWidth: 160,
            zIndex: 1201,
            maxHeight: panelHeight,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="model-selector-scroll"
            style={{
              maxHeight: panelHeight,
              overflowY: "auto",
              overscrollBehavior: "contain",
              scrollbarWidth: "thin",
              scrollbarColor: `${isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)"} transparent`,
            }}
            onWheel={e => e.stopPropagation()}
          >
            {models.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (m.disabled) {
                    toast("当前模型暂不可用", {
                      description: m.unavailableReason || "请切换其他模型继续创作。",
                    });
                    return;
                  }
                  onChange(m.id);
                  setOpen(false);
                }}
                disabled={m.disabled}
                className="flex items-start gap-2 w-full px-3 text-left type-caption transition-colors"
                style={{
                  height: rowHeight,
                  color: text,
                  opacity: m.disabled ? 0.46 : 1,
                  cursor: m.disabled ? "not-allowed" : "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <AssistantModelIcon modelId={m.id} icon={m.icon} />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span
                    className="type-caption"
                    style={{ textTransform: "none", letterSpacing: "0.02em" }}
                  >
                    {m.label}
                  </span>
                  {"description" in m && m.description ? (
                    <span
                      className="truncate"
                      style={{ fontSize: 10, marginTop: 2, opacity: 0.58, letterSpacing: 0 }}
                    >
                      {m.unavailableReason || m.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
