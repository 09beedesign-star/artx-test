/**
 * Switch — 图叙 AI 风格：激活色 #161616，thumb 白色，高度 20px
 *
 * ⚠️⚠️ 尺寸**只能**通过 `size` 改，不要在外面用 `h-[14px] w-[26px]` 覆盖 Root：
 *     thumb 的尺寸和位移是写死在这份文件里的（16px / translate-x-4）。
 *     只压小轨道不压 thumb，thumb 会顶出轨道 6px、看起来整体偏右偏上 ——
 *     这就是 2026-11-10 用户截图里那个「开关有偏移」。
 *     📌 轨道 / thumb / 位移三者是**一组数**，必须成组改。
 */
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

type SwitchSize = "default" | "sm";
type SwitchTone = "default";

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  thumbClassName?: string;
  thumbStyle?: React.CSSProperties;
  /** 尺寸：default = 20×36（thumb 16 / 位移 16），sm = 16×28（thumb 12 / 位移 12） */
  size?: SwitchSize;
  /** 激活态轨道色调：黑（深色主题反相为白）。品牌绿档已随全站黑白化移除。 */
  tone?: SwitchTone;
};

const SIZE_CLASSES: Record<SwitchSize, { root: string; thumb: string }> = {
  default: { root: "h-5 w-9 p-[2px]", thumb: "size-4 data-[state=checked]:translate-x-4" },
  sm: { root: "h-4 w-7 p-[2px]", thumb: "size-3 data-[state=checked]:translate-x-3" },
};

const TONE_CLASSES: Record<SwitchTone, string> = {
  default: "data-[state=checked]:bg-[#161616] dark:data-[state=checked]:bg-white",
};

function Switch({
  className,
  thumbClassName,
  thumbStyle,
  size = "default",
  tone = "default",
  ...props
}: SwitchProps) {
  const sizeClasses = SIZE_CLASSES[size];
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // 容器轨道
        "inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all outline-none",
        sizeClasses.root,
        // 激活态：黑；未激活：灰色轨道
        "data-[state=unchecked]:bg-[rgba(22,22,22,0.18)]",
        "dark:data-[state=unchecked]:bg-[rgba(255,255,255,0.18)]",
        TONE_CLASSES[tone],
        // focus ring
        "focus-visible:ring-[2px] focus-visible:ring-[#161616]/30 dark:focus-visible:ring-white/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full shadow-sm transition-transform",
          sizeClasses.thumb,
          // 激活态：白色 thumb 右移；未激活：白色 thumb 归位
          "data-[state=checked]:bg-white data-[state=unchecked]:bg-white",
          "dark:data-[state=checked]:bg-[#161616] dark:data-[state=unchecked]:bg-white",
          thumbClassName
        )}
        style={thumbStyle}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
