/**
 * Textarea — 图叙 AI 风格：与 Input 同一视觉语言
 */
import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { cn } from "@/lib/utils";
import * as React from "react";

function Textarea({
  className,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: React.ComponentProps<"textarea">) {
  const dialogComposition = useDialogComposition();

  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLTextAreaElement>({
    onKeyDown: (e) => {
      const isComposing = (e.nativeEvent as any).isComposing || dialogComposition.justEndedComposing();
      if (e.key === "Enter" && !e.shiftKey && isComposing) return;
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      dialogComposition.markCompositionEnd();
      setTimeout(() => { dialogComposition.setComposing(false); }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[80px] w-full px-3 py-2 text-sm outline-none transition-all resize-none",
        "rounded-lg border bg-transparent",
        "border-[rgba(22,22,22,0.14)] dark:border-[rgba(255,255,255,0.12)]",
        "placeholder:text-[#aaaaaa] dark:placeholder:text-[#555555]",
        "text-[#161616] dark:text-white",
        "focus:border-[rgba(22,22,22,0.40)] focus:shadow-[0_0_0_3px_rgba(22,22,22,0.08)]",
        "dark:focus:border-[rgba(255,255,255,0.35)] dark:focus:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export { Textarea };
