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
import type React from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
  /*
    2026-10-19 用户要求：右侧加下拉箭头，否则分不清是按钮还是选择器。
    appearance-none 去掉了原生箭头 → 叠一个 pointer-events-none 的图标，
    点击仍落在 select 上；pr-7 给图标留位，长选项不压字。
    
    2026-10-20 用户要求：白色模式下所有下拉菜单改为白色背景 + 1px 浅灰色描边。
    ⚠️ 原生 <select> 的 <option> 样式会被浏览器系统深色模式覆盖，
    添加 color-scheme 属性强制浏览器使用对应的颜色方案渲染下拉选项。
  */
  return (
    <div className="relative w-full">
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="w-full cursor-pointer appearance-none rounded-md py-[7px] pl-2.5 pr-7 text-[12px] outline-none"
      style={{ 
        background: palette.panel, 
        border: `1px solid ${palette.border}`, 
        color: palette.text,
        colorScheme: isDark ? "dark" : "light",
      }}
    >
      {options.map(option => (
        <option
          key={option}
          value={option}
          style={{
            background: isDark ? "#1c1c26" : "#ffffff",
            color: isDark ? "#eee" : "rgba(20,20,36,0.86)",
          }}
        >
          {option}
        </option>
      ))}
    </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        data-testid="ecommerce-select-chevron"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        style={{ color: palette.sub }}
      />
    </div>
  );
}

/**
 * 数量步进器。
 *
 * ⚠️ 首版把「生成数量 / 张数」做成了一个常亮且 onClick 为空函数的 Switch，
 *    那是个死按钮：看着可交互，点了什么都不发生,而且永远关不掉。
 *    数量的真实控件就是这个步进器，所以这里不再套一层假的开关。
 *
 * 2026-10-17 用户需求：支持键盘直接输入 1-9 张，不再只能点击 +/-。
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
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // 只允许数字
    if (!/^\d*$/.test(raw)) return;
    
    if (raw === "") {
      // 2026-10-20 用户需求：允许通过 Backspace 清空，失焦时恢复当前值
      // 清空时不触发 onChange，保持 value 不变，但允许输入框显示为空
      return;
    }
    
    const num = parseInt(raw, 10);
    if (Number.isNaN(num)) return;
    
    // 限制在 [min, max] 范围内
    const clamped = Math.max(min, Math.min(max, num));
    onChange(clamped);
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // 失焦时若为空，恢复当前值
    if (e.target.value === "") {
      e.target.value = String(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 方向键上下也可以调整数量
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, value + 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(min, value - 1));
    }
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-md p-0.5"
      style={{ background: palette.panel, border: `1px solid ${palette.border}` }}
    >
      <button
        type="button"
        className="h-6 w-7 rounded text-[14px] transition-colors hover:bg-white/5"
        style={{ color: palette.sub }}
        aria-label="减少"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        defaultValue={value}
        key={value}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className="h-6 min-w-[30px] max-w-[36px] rounded bg-transparent text-center text-[13px] font-semibold outline-none transition-colors focus:bg-white/5"
        style={{ color: palette.text }}
        aria-label="生成数量"
        data-testid="ecommerce-count-input"
      />
      <button
        type="button"
        className="h-6 w-7 rounded text-[14px] transition-colors hover:bg-white/5"
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
