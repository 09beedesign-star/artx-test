/**
 * Switch — 图叙 AI 风格：激活色 #161616，thumb 白色，高度 18px
 */
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  thumbClassName?: string;
  thumbStyle?: React.CSSProperties;
};

function Switch({ className, thumbClassName, thumbStyle, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // 容器轨道
        "inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full border border-transparent p-[2px] transition-all outline-none",
        // 激活态：#161616；未激活：灰色轨道
        "data-[state=checked]:bg-[#161616] data-[state=unchecked]:bg-[rgba(22,22,22,0.18)]",
        "dark:data-[state=unchecked]:bg-[rgba(255,255,255,0.18)] dark:data-[state=checked]:bg-white",
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
          "pointer-events-none block size-[16px] rounded-full shadow-sm transition-transform",
          // 激活态：白色 thumb 右移；未激活：深色 thumb
          "data-[state=checked]:bg-white data-[state=checked]:translate-x-4",
          "data-[state=unchecked]:bg-white data-[state=unchecked]:translate-x-0",
          "dark:data-[state=checked]:bg-[#161616] dark:data-[state=unchecked]:bg-white",
          thumbClassName
        )}
        style={thumbStyle}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
