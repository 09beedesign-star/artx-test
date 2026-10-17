/**
 * 电商画布 · 基础控件
 *
 * ⚠️ 全部定义在组件外（而不是像首版那样写在 EcommerceCanvasPage 的渲染体里）。
 *
 * 【为什么】首版把 SectionTitle / Switch / Select 写成渲染函数内部的局部组件，
 *   每次父组件 state 变化都会重新创建组件类型 → React 视为「不同的组件」→
 *   卸载重建 DOM → textarea 失焦、下拉被合上。这在表单密集的页面上是
 *   典型零报错故障：代码跑得好好的，用户刚打字就被弹走。
 */
import type { ReactNode } from "react";
import { LIME, type EcommercePalette } from "./shared";

export function SectionTitle({
  children,
  aside,
  palette,
}: {
  children: ReactNode;
  aside?: ReactNode;
  palette: EcommercePalette;
}) {
  return (
    <div
      className="mb-2 flex items-center gap-2 text-[13px] font-semibold"
      style={{ color: palette.text }}
    >
      {children}
      {aside ? (
        <span className="ml-auto text-[11px] font-normal" style={{ color: palette.sub }}>
          {aside}
        </span>
      ) : null}
    </div>
  );
}

export function Switch({
  on,
  onToggle,
  label,
  desc,
  isDark,
  palette,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  desc?: string;
  isDark: boolean;
  palette: EcommercePalette;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md px-3 py-2.5"
      style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px]" style={{ color: palette.text }}>
          {label}
        </div>
        {desc ? (
          <div className="mt-0.5 text-[11px]" style={{ color: palette.sub }}>
            {desc}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className="relative h-[18px] w-8 shrink-0 rounded-full transition-colors"
        style={{ background: on ? LIME : isDark ? "rgba(255,255,255,0.16)" : "rgba(20,20,36,0.18)" }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all"
          style={{ left: on ? 16 : 2, background: on ? "#1a1a1a" : "#fff" }}
        />
      </button>
    </div>
  );
}

export function Select({
  value,
  options,
  onChange,
  isDark,
  palette,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  isDark: boolean;
  palette: EcommercePalette;
}) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="w-full appearance-none rounded-md px-2.5 py-[7px] text-[12px] outline-none"
      style={{ background: palette.panel, border: `1px solid ${palette.border}`, color: palette.text }}
    >
      {options.map(option => (
        <option
          key={option}
          value={option}
          style={{
            background: isDark ? "#1c1c26" : "#fff",
            color: isDark ? "#eee" : "#222",
          }}
        >
          {option}
        </option>
      ))}
    </select>
  );
}

/**
 * 数量步进器。
 *
 * ⚠️ 首版把「生成数量 / 张数」做成了一个常亮且 onClick 为空函数的 Switch，
 *    那是个死按钮：看着可交互，点了什么都不发生，而且永远关不掉。
 *    数量的真实控件就是这个步进器，所以这里不再套一层假的开关。
 */
export function Stepper({
  value,
  min,
  max,
  onChange,
  palette,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  palette: EcommercePalette;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md p-0.5"
      style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
    >
      <button
        type="button"
        className="h-6 w-7 rounded text-[14px]"
        style={{ color: palette.sub }}
        aria-label="减少"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="min-w-[30px] text-center text-[13px] font-semibold" style={{ color: palette.text }}>
        {value}
      </span>
      <button
        type="button"
        className="h-6 w-7 rounded text-[14px]"
        style={{ color: palette.sub }}
        aria-label="增加"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        ＋
      </button>
    </div>
  );
}

/**
 * 带数量的行控件：左侧说明 + 右侧步进器。
 * 取代首版「假 Switch + 下方一个孤零零的步进器」的组合。
 */
export function CountRow({
  label,
  desc,
  value,
  min,
  max,
  onChange,
  palette,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  palette: EcommercePalette;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md px-3 py-2.5"
      style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px]" style={{ color: palette.text }}>
          {label}
        </div>
        {desc ? (
          <div className="mt-0.5 text-[11px]" style={{ color: palette.sub }}>
            {desc}
          </div>
        ) : null}
      </div>
      <Stepper value={value} min={min} max={max} onChange={onChange} palette={palette} />
    </div>
  );
}
