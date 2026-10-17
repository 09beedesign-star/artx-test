/**
 * 电商画布 · 模板详情（二级页 /ecommerce-canvas/templates/:id）
 *
 * 把一行「全景融入 → 局部特写 → 退后收尾」拆成可理解的分镜步骤，
 * 并给出推荐张数 —— 分镜有几段就出几张，这是本功能与普通文生图的核心差异。
 *
 * ⚠️ 必须处理「模板不存在」：直接手敲 /templates/999 不该白屏，
 *    也不该抛异常，而是给出可点的返回出口。
 */
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import {
  ECOMMERCE_TEMPLATES,
  type EcommerceTpl,
} from "@/data/ecommerce-canvas-templates";
import { LIME, splitFlow, type EcommercePalette } from "./shared";
import {
  THUMB_CELLS,
  categoryLabelById,
  templateCoverUrl,
  templateIndexById,
  templateThumbGradient,
} from "./template-visual";

type Props = {
  template: EcommerceTpl | null;
  palette: EcommercePalette;
  /** 选中该模板并跳回带货图文工作台 */
  onUse: (template: EcommerceTpl) => void;
};

export function EcommerceTemplateDetail({ template, palette, onUse }: Props) {
  /*
    「返回模板库」用浏览器后退而不是硬跳 /templates ——
    用户可能是从工作台右栏点进来的，硬跳会把他的起点改掉。
    只有当没有历史可退（直接粘链接进来的）时才兜底跳列表页。
  */
  const [, navigate] = useLocation();

  if (!template) {
    return (
      <div className="flex min-h-full items-center justify-center p-8" style={{ background: palette.bg, color: palette.text }}>
        <div className="max-w-sm rounded-xl p-6 text-center" style={{ background: palette.panelStrong, border: `1px solid ${palette.border}` }}>
          <Sparkles size={22} style={{ color: LIME }} className="mx-auto" />
          <div className="mt-2 text-[14px] font-semibold">模板不存在</div>
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: palette.sub }}>
            这个分镜模板可能已经下线，或者链接里的编号有误。
          </p>
          <Link
            href="/ecommerce-canvas/templates"
            className="mt-3 inline-block rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.4)", color: LIME }}
          >
            回到模板库
          </Link>
        </div>
      </div>
    );
  }

  const index = templateIndexById(template.id);
  const steps = splitFlow(template.flow);
  const recommendedCount = Math.min(9, Math.max(3, steps.length));
  const prev = ECOMMERCE_TEMPLATES[index - 1];
  const next = ECOMMERCE_TEMPLATES[index + 1];

  return (
    <div className="relative flex min-h-full" style={{ background: palette.bg, color: palette.text }}>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col p-5">
        {/* 面包屑 + 返回 */}
        <div className="mb-3 flex items-center gap-1.5 text-[11px]" style={{ color: palette.sub }}>
          <Link href="/ecommerce-canvas/post" className="transition-colors hover:opacity-80" style={{ color: palette.sub }}>
            电商画布
          </Link>
          <ChevronRight size={11} />
          <Link href="/ecommerce-canvas/templates" className="transition-colors hover:opacity-80" style={{ color: palette.sub }}>
            模板库
          </Link>
          <ChevronRight size={11} />
          <span style={{ color: palette.text }}>{template.name}</span>
          <button
            type="button"
            className="ml-auto rounded-md px-2.5 py-1"
            style={{ border: `1px solid ${palette.border}`, color: palette.sub }}
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else navigate("/ecommerce-canvas/templates");
            }}
          >
            ← 返回
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* 缩略图 */}
          <div
            className="overflow-hidden rounded-xl p-[3px]"
            style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
          >
            {templateCoverUrl(template.id) ? (
              <img
                src={templateCoverUrl(template.id)!}
                alt={`${template.name} 示例`}
                decoding="async"
                className="aspect-[9/7] w-full rounded-[9px] object-cover"
                style={{ background: templateThumbGradient(index, 1) }}
              />
            ) : (
              <div className="grid aspect-[9/7] grid-cols-3 gap-[3px]">
                {THUMB_CELLS.map(cell => (
                  <div key={cell} className="rounded" style={{ background: templateThumbGradient(index, cell) }} />
                ))}
              </div>
            )}
          </div>

          {/* 详情 */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold" style={{ color: palette.text }}>
                {template.name}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-[10px]"
                style={{ color: LIME, background: "rgba(197,237,71,0.14)", border: "1px solid rgba(197,237,71,0.34)" }}
              >
                {categoryLabelById(template.categoryId)}
              </span>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[13px] font-semibold" style={{ color: palette.text }}>
                分镜节奏（{steps.length} 段）
              </div>
              <ol className="flex flex-col gap-2">
                {steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[12px]"
                    style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{ background: "rgba(197,237,71,0.18)", color: LIME }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ color: palette.text }}>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { label: "推荐张数", value: `${recommendedCount} 张` },
                { label: "推荐比例", value: "3:4" },
                { label: "推荐平台", value: "小红书 / TikTok" },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-md px-3 py-2"
                  style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
                >
                  <div className="text-[10px]" style={{ color: palette.sub }}>{item.label}</div>
                  <div className="mt-0.5 text-[12px] font-medium" style={{ color: palette.text }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold"
                style={{ background: LIME, color: "#1a1a1a" }}
                onClick={() => onUse(template)}
              >
                <Sparkles size={13} /> 使用此模板生成
              </button>
              <Link
                href="/ecommerce-canvas/templates"
                className="rounded-md px-3 py-2 text-[12px]"
                style={{ border: `1px solid ${palette.border}`, color: palette.text }}
              >
                再看看别的模板
              </Link>
            </div>
          </div>
        </div>

        {/* 上/下一个模板：详情页之间的横向导航，免得每次都退回列表 */}
        <div className="mt-6 flex items-center gap-2 border-t pt-4" style={{ borderColor: palette.border }}>
          {prev ? (
            <Link
              href={`/ecommerce-canvas/templates/${prev.id}`}
              className="flex min-w-0 items-center gap-1 rounded-md px-3 py-2 text-[12px]"
              style={{ border: `1px solid ${palette.border}`, color: palette.text }}
            >
              <ChevronLeft size={13} />
              <span className="truncate">{prev.name}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link
              href={`/ecommerce-canvas/templates/${next.id}`}
              className="ml-auto flex min-w-0 items-center gap-1 rounded-md px-3 py-2 text-[12px]"
              style={{ border: `1px solid ${palette.border}`, color: palette.text }}
            >
              <span className="truncate">{next.name}</span>
              <ChevronRight size={13} />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
