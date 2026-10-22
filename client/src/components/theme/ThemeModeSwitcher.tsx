import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * 黑白模式切换 —— 通用选项组件。
 *
 * 📌 三态而不是两态：
 * 「跟随系统」必须单独占一格。做成「暗/亮」二态开关的话，用户一旦点过
 * 就再也回不到跟随系统，而系统偏好是会变的（macOS 傍晚自动切深色）。
 * 二态开关把这层能力永久关掉了，且没有任何提示。
 *
 * 📌 图标跟着**解析后的主题**走，不跟着 mode 走：
 * mode === "system" 时显示 Monitor，用户才知道自己现在处于跟随态。
 * 跟着 resolvedTheme 走的话跟随态和手动态长得一样，等于没有第三格。
 */

export interface ThemeModeOption {
  value: ThemeMode;
  label: string;
  hint: string;
  icon: typeof Sun;
}

export const THEME_MODE_OPTIONS: ThemeModeOption[] = [
  { value: "dark", label: "黑夜模式", hint: "始终使用深色界面", icon: Moon },
  { value: "light", label: "白天模式", hint: "始终使用浅色界面", icon: Sun },
  { value: "system", label: "跟随系统", hint: "随系统外观自动切换", icon: Monitor },
];

function resolveIcon(mode: ThemeMode) {
  return THEME_MODE_OPTIONS.find((o) => o.value === mode)?.icon ?? Sun;
}

interface ThemeModeSwitcherProps {
  className?: string;
  /** 紧凑图标按钮（顶栏用）还是带文字的按钮（设置页用） */
  variant?: "icon" | "labeled";
}

export function ThemeModeSwitcher({ className, variant = "icon" }: ThemeModeSwitcherProps) {
  const { mode, resolvedTheme, setMode } = useTheme();
  const Icon = resolveIcon(mode);
  const currentLabel =
    mode === "system" ? `跟随系统（当前${resolvedTheme === "dark" ? "黑夜" : "白天"}）` : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label="主题模式"
        title={currentLabel ?? "主题模式"}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-[var(--artx-text-muted)] outline-none transition-colors hover:text-[var(--artx-text-strong)] focus-visible:ring-2 focus-visible:ring-[var(--artx-brand-purple)]/45",
          variant === "icon" ? "w-10 shrink-0" : "border border-[var(--artx-line)] bg-[var(--artx-fill)] px-3 text-sm hover:bg-[var(--artx-fill-hover)]",
          className,
        )}
      >
        <Icon size={18} strokeWidth={1.9} aria-hidden />
        {variant === "labeled" && <span>外观</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem] p-1.5">
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {THEME_MODE_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="gap-2.5 rounded-[var(--radius-md-design)] py-2 pl-8 pr-2.5"
              >
                <OptionIcon
                  size={16}
                  strokeWidth={1.9}
                  className="shrink-0 text-[var(--artx-text-muted)]"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium leading-5">{option.label}</span>
                  <span className="text-[11px] leading-4 text-[var(--artx-text-faint)]">
                    {option.hint}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 行内版：设置页那种「一整行一个选项」的形态。
 *
 * ⚠️ 不要复制一份三态逻辑到这里 —— 两种形态共用 THEME_MODE_OPTIONS 与
 * 同一个 setMode 出口，否则以后加第四种模式要改两处。
 */
export function ThemeModeOptionList({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {THEME_MODE_OPTIONS.map((option) => {
        const OptionIcon = option.icon;
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-md-design)] border px-3 py-2.5 text-left transition-colors",
              active
                ? "border-[var(--artx-brand-purple)] bg-[var(--artx-brand-purple)]/12"
                : "border-[var(--artx-line)] bg-[var(--artx-fill)] hover:bg-[var(--artx-fill-hover)]",
            )}
          >
            <OptionIcon
              size={16}
              strokeWidth={1.9}
              className={cn(
                "shrink-0",
                active ? "text-[var(--artx-brand-purple-ink)]" : "text-[var(--artx-text-muted)]",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-5">{option.label}</span>
              <span className="block text-[11px] leading-4 text-[var(--artx-text-faint)]">
                {option.hint}
              </span>
            </span>
            {active && (
              <span
                className="size-2 shrink-0 rounded-full bg-[var(--artx-brand-purple)]"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
