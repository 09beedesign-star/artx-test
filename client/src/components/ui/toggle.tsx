/**
 * Toggle — 图叙 AI 风格：激活态 #161616 深色背景，pill 圆角
 */
import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 whitespace-nowrap",
  {
    variants: {
      variant: {
        /** 默认：激活时深色背景 */
        default:
          "bg-transparent text-[#888888] dark:text-[#666666] hover:bg-[rgba(22,22,22,0.07)] hover:text-[#161616] dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-white data-[state=on]:bg-[#161616] data-[state=on]:text-white dark:data-[state=on]:bg-white dark:data-[state=on]:text-[#161616]",
        /** 描边变体 */
        outline:
          "border border-[rgba(22,22,22,0.14)] dark:border-[rgba(255,255,255,0.12)] bg-transparent text-[#888888] dark:text-[#888888] hover:bg-[rgba(22,22,22,0.07)] hover:text-[#161616] dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-white data-[state=on]:bg-[#161616] data-[state=on]:text-white data-[state=on]:border-transparent dark:data-[state=on]:bg-white dark:data-[state=on]:text-[#161616]",
      },
      size: {
        default: "h-9 px-3 min-w-9",
        sm: "h-8 px-2.5 min-w-8 text-xs",
        lg: "h-10 px-3.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
