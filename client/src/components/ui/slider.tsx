/**
 * Slider — 图叙 AI 风格：轨道深灰，填充 #161616，thumb 白色+阴影
 */
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      {/* 轨道 */}
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-[rgba(22,22,22,0.12)] dark:bg-[rgba(255,255,255,0.12)] data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
      >
        {/* 已填充范围 */}
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-[#161616] dark:bg-white data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>

      {/* 拖动点 */}
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "block size-4 shrink-0 rounded-full bg-white shadow-md border border-[rgba(22,22,22,0.15)]",
            "transition-all",
            "hover:shadow-[0_0_0_4px_rgba(22,22,22,0.10)] dark:hover:shadow-[0_0_0_4px_rgba(255,255,255,0.10)]",
            "focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgba(22,22,22,0.15)] dark:focus-visible:shadow-[0_0_0_4px_rgba(255,255,255,0.15)]",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
