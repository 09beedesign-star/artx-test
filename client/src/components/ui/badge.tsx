/**
 * Badge — 图叙 AI 风格：pill 圆角，黑白极简
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // 基础：pill 圆角，小号文字，内边距紧凑
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        /** 主标签：#161616 底，白字 */
        default:
          "border-transparent bg-[#161616] text-white dark:bg-white dark:text-[#161616]",
        /** 次要标签：浅灰底 */
        secondary:
          "border-transparent bg-[rgba(22,22,22,0.08)] text-[#444444] dark:bg-[rgba(255,255,255,0.12)] dark:text-[#cccccc]",
        /** 危险标签 */
        destructive:
          "border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
        /** 描边标签 */
        outline:
          "border-[rgba(22,22,22,0.20)] text-[#444444] dark:border-[rgba(255,255,255,0.18)] dark:text-[#cccccc]",
        /** 成功 */
        success:
          "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
