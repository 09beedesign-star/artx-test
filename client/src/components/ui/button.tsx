/**
 * Button — 图叙 AI 黑白极简风格
 * 主色 #161616，pill 圆角，hover 固定色
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[2px] focus-visible:ring-black/20 dark:focus-visible:ring-white/20 active:scale-[0.97]",
  {
    variants: {
      variant: {
        /** 主按钮：黑底白字，hover 深灰 */
        default:
          "rounded-full bg-[#161616] text-white hover:bg-[#333333] dark:bg-white dark:text-black dark:hover:bg-[#e8e8e8] shadow-sm",
        /** 危险操作 */
        destructive:
          "rounded-full bg-red-600 text-white hover:bg-red-700",
        /** 描边按钮：透明底，黑色边框 */
        outline:
          "rounded-full border border-[rgba(22,22,22,0.20)] bg-transparent hover:bg-[rgba(22,22,22,0.06)] dark:border-[rgba(255,255,255,0.14)] dark:hover:bg-[rgba(255,255,255,0.08)] text-[#161616] dark:text-white",
        /** 次要按钮：浅灰底 */
        secondary:
          "rounded-full bg-[rgba(22,22,22,0.07)] text-[#161616] hover:bg-[rgba(22,22,22,0.12)] dark:bg-[rgba(255,255,255,0.08)] dark:text-white dark:hover:bg-[rgba(255,255,255,0.14)]",
        /** 幽灵按钮：无背景 */
        ghost:
          "rounded-full hover:bg-[rgba(22,22,22,0.07)] text-[#161616] dark:hover:bg-[rgba(255,255,255,0.08)] dark:text-white",
        link: "text-[#161616] underline-offset-4 hover:underline dark:text-white",
      },
      size: {
        default: "h-9 px-5 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-4 has-[>svg]:px-2.5 text-xs",
        lg: "h-11 px-7 has-[>svg]:px-5 text-base",
        icon: "size-9 rounded-full",
        "icon-sm": "size-8 rounded-full",
        "icon-lg": "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
