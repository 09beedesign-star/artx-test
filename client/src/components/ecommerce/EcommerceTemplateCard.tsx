/**
 * 电商画布 · 分镜模板卡
 *
 * 工作台右栏与模板库总览页共用同一个卡片实现 —— 两个出口必须长得一样，
 * 否则用户在详情页挑中的模板回到工作台会「认不出来」。
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import type { EcommerceTpl } from "@/data/ecommerce-canvas-templates";
import { LIME, type EcommercePalette } from "./shared";
import { THUMB_CELLS, templateCoverUrl, templateThumbGradient } from "./template-visual";

type Props = {
  template: EcommerceTpl;
  index: number;
  selected: boolean;
  palette: EcommercePalette;
  /**
   * 选中该模板（工作台里是「直接选中并留在当前页」）。
   * 第二个参数是封面元素，供工作台做「飞入左栏」动画取起点。
   */
  onSelect: (template: EcommerceTpl, coverEl: HTMLElement | null) => void;
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
  /*
    hover 规则与灵感推荐卡（InspirationCard）一致：
    悬停满 500ms 才认定 hover → 仅缩略图 scale(1.08)，300ms ease-out；卡片本身不位移。
    📌 不用 CSS 的 group-hover 缩放类 —— 那会立刻放大，绕过 500ms 延时。
  */
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  useEffect(() => clearHoverTimer, []);
  const thumbStyle = {
    transform: hovered ? "scale(1.08)" : "scale(1)",
  } as const;
  return (
    <div
      className="group relative overflow-hidden rounded-[10px]"
      onMouseEnter={() => {
        clearHoverTimer();
        hoverTimer.current = setTimeout(() => setHovered(true), 500);
      }}
      onMouseLeave={() => {
        clearHoverTimer();
        setHovered(false);
      }}
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
        onClick={event => {
          const coverEl = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-tpl-cover]");
          onSelect(template, coverEl);
        }}
      >
        {cover ? (
          <div className="aspect-[9/7] p-[3px]" data-tpl-cover>
            <div className="h-full w-full overflow-hidden rounded">
              <img
                src={cover}
                alt={`${template.name} 示例`}
                loading="lazy"
                decoding="async"
                data-tpl-thumb
                className="h-full w-full object-cover transition-transform duration-300 ease-out"
                style={{ background: templateThumbGradient(index, 1), ...thumbStyle }}
              />
            </div>
          </div>
        ) : (
          <div className="aspect-[9/7] p-[3px]">
            <div
              data-tpl-thumb
              className="grid h-full w-full grid-cols-3 gap-[3px] overflow-hidden rounded transition-transform duration-300 ease-out"
              style={thumbStyle}
            >
              {THUMB_CELLS.map(cell => (
                <div key={cell} className="rounded" style={{ background: templateThumbGradient(index, cell) }} />
              ))}
            </div>
          </div>
        )}
        {/*
          文案区固定高度：标题单行截断，流程描述**恒占两行**（line-clamp-2 + 固定高度）。
          ⚠️ 不能靠内容撑高 —— 单行/双行文案会让同一行卡片高度不一致（2026-10-18 用户反馈）。
        */}
        <div className="px-2.5 pb-2.5 pt-1.5" data-tpl-text>
          <div
            className="h-[18px] truncate text-[12px] font-semibold leading-[18px]"
            style={{ color: palette.text }}
            title={template.name}
          >
            {template.name}
          </div>
          <div
            className="mt-0.5 line-clamp-2 h-[30px] text-[10.5px] leading-[15px]"
            style={{ color: palette.sub }}
            title={template.flow}
          >
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
