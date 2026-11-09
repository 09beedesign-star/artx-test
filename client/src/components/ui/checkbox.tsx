/**
 * Checkbox — 图叙 AI 风格：激活色 #161616，圆角 4px
 */
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border transition-all outline-none",
        // 未选中：浅灰边框，透明背景
        "border-[rgba(22,22,22,0.25)] dark:border-[rgba(255,255,255,0.20)] bg-transparent",
        // 选中：#161616 背景
        "data-[state=checked]:bg-[#161616] data-[state=checked]:border-[#161616] data-[state=checked]:text-white",
        "dark:data-[state=checked]:bg-white dark:data-[state=checked]:border-white dark:data-[state=checked]:text-[#161616]",
        // focus ring
        "focus-visible:shadow-[0_0_0_3px_rgba(22,22,22,0.12)] dark:focus-visible:shadow-[0_0_0_3px_rgba(255,255,255,0.12)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <CheckIcon className="size-3" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
