/**
 * Tabs — 图叙 AI 风格：下划线激活态，无背景色 pill
 */
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

/** Tab 导航栏：下划线风格，无背景色容器 */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-auto w-fit items-end gap-0 border-b border-[rgba(22,22,22,0.10)] dark:border-[rgba(255,255,255,0.08)]",
        className
      )}
      {...props}
    />
  );
}

/** 单个 Tab 按钮：激活时下划线 #161616，无背景 */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // 基础样式
        "relative inline-flex h-9 items-center justify-center gap-1.5 px-4 pb-2 text-sm font-medium whitespace-nowrap transition-all outline-none",
        // 激活前颜色
        "text-[#999999] dark:text-[#666666]",
        // 激活态：下划线
        "data-[state=active]:text-[#161616] dark:data-[state=active]:text-white",
        "data-[state=active]:after:absolute data-[state=active]:after:bottom-[-1px] data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-[2px] data-[state=active]:after:rounded-full data-[state=active]:after:bg-[#161616] dark:data-[state=active]:after:bg-white data-[state=active]:after:content-['']",
        "hover:text-[#333333] dark:hover:text-[#cccccc]",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
