/**
 * 电商画布 · 分镜模板卡
 *
 * 工作台右栏与模板库总览页共用同一个卡片实现 —— 两个出口必须长得一样，
 * 否则用户在详情页挑中的模板回到工作台会「认不出来」。
 */
import { ArrowUpRight, Check } from "lucide-react";
import type { EcommerceTpl } from "@/data/ecommerce-canvas-templates";
import { LIME, type EcommercePalette } from "./shared";
import { THUMB_CELLS, templateCoverUrl, templateThumbGradient } from "./template-visual";

type Props = {
  template: EcommerceTpl;
  index: number;
  selected: boolean;
  palette: EcommercePalette;
  /** 选中该模板（工作台里是「直接选中并留在当前页」） */
  onSelect: (template: EcommerceTpl) => void;
  /** 进入模板详情二级页 */
  onOpenDetail: (template: EcommerceTpl) => void;
};

export function EcommerceTemplateCard({
  template,
  index,
  selected,
  palette,
  onSelect,
  onOpenDetail,
}: Props) {
  const cover = templateCoverUrl(template.id);
  return (
    <div
      className="group relative overflow-hidden rounded-[10px] transition-transform hover:-translate-y-0.5"
      style={{
        background: palette.panel,
        border: `1px solid ${selected ? LIME : palette.border}`,
        boxShadow: selected ? `0 0 0 1px ${LIME}` : "none",
      }}
    >
      {/*
        选中区做成覆盖整卡的独立按钮，而不是给外层 div 挂 onClick ——
        外层再嵌一个「详情」按钮会构成 button 嵌套（非法 HTML，
        且点击行为在部分浏览器里不可预期）。两个平级按钮最稳。
      */}
      <button
        type="button"
        aria-pressed={selected}
        className="block w-full text-left"
        onClick={() => onSelect(template)}
      >
        {cover ? (
          <div className="aspect-[9/7] p-[3px]">
            <img
              src={cover}
              alt={`${template.name} 示例`}
              loading="lazy"
              decoding="async"
              className="h-full w-full rounded object-cover"
              style={{ background: templateThumbGradient(index, 1) }}
            />
          </div>
        ) : (
          <div className="grid aspect-[9/7] grid-cols-3 gap-[3px] p-[3px]">
            {THUMB_CELLS.map(cell => (
              <div key={cell} className="rounded" style={{ background: templateThumbGradient(index, cell) }} />
            ))}
          </div>
        )}
        <div className="px-2.5 pb-2.5 pt-1.5">
          <div className="text-[12px] font-semibold leading-snug" style={{ color: palette.text }}>
            {template.name}
          </div>
          <div className="mt-0.5 text-[10.5px] leading-snug" style={{ color: palette.sub }}>
            {template.flow}
          </div>
        </div>
      </button>

      <button
        type="button"
        className="absolute right-2 top-2 flex items-center gap-0.5 rounded px-1.5 py-1 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        style={{ color: "#1a1a1a", background: LIME }}
        onClick={() => onOpenDetail(template)}
        title="查看模板分镜详情"
      >
        详情
        <ArrowUpRight size={10} />
      </button>

      {selected ? (
        <span
          className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: LIME }}
          aria-hidden="true"
        >
          <Check size={12} color="#1a1a1a" />
        </span>
      ) : null}
    </div>
  );
}
