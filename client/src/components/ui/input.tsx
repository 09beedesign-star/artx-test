/**
 * Input — 图叙 AI 风格：圆角，极简边框，focus 时黑色轮廓
 */
import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

function Input({
  className,
  type,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"input">) {
  const dialogComposition = useDialogComposition();

  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLInputElement>({
    onKeyDown: (e) => {
      const isComposing = (e.nativeEvent as any).isComposing || dialogComposition.justEndedComposing();
      if (e.key === "Enter" && isComposing) return;
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      dialogComposition.markCompositionEnd();
      setTimeout(() => {
        dialogComposition.setComposing(false);
      }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 基础布局
        "h-9 w-full min-w-0 px-3 py-2 text-sm outline-none transition-all",
        // 圆角、背景、边框
        "rounded-lg border bg-transparent",
        "border-[rgba(22,22,22,0.14)] dark:border-[rgba(255,255,255,0.12)]",
        "placeholder:text-[#aaaaaa] dark:placeholder:text-[#555555]",
        "text-[#161616] dark:text-white",
        // focus：加深边框 + 轻微阴影
        "focus:border-[rgba(22,22,22,0.40)] focus:shadow-[0_0_0_3px_rgba(22,22,22,0.08)]",
        "dark:focus:border-[rgba(255,255,255,0.35)] dark:focus:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]",
        // 禁用态
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // 文件输入
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#161616] dark:file:text-white",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Input };
