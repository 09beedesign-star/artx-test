/**
 * ThemeSwitcher — Universal theme mode selector
 * Three options: Light / Dark / System
 * Trigger shows current mode icon, dropdown shows all three with checkmark on active
 */
import { useTheme } from "@/contexts/ThemeContext";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sun, Moon, Monitor, Check } from "lucide-react";

export function ThemeSwitcher() {
  const { mode, setMode } = useTheme();

  const options = [
    { value: "light" as const, label: "白天模式", icon: Sun },
    { value: "dark" as const, label: "黑夜模式", icon: Moon },
    { value: "system" as const, label: "跟随系统", icon: Monitor },
  ];

  const currentOption = options.find(opt => opt.value === mode) || options[0];
  const Icon = currentOption.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="主题模式"
          title="切换主题"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-all"
          style={{
            background: "var(--muted)",
            color: "var(--foreground)",
          }}
        >
          <Icon size={18} strokeWidth={1.8} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[160px] overflow-hidden rounded-xl border shadow-lg"
          style={{
            background: "var(--popover)",
            borderColor: "var(--border)",
            padding: "6px",
          }}
        >
          <DropdownMenu.RadioGroup value={mode} onValueChange={v => setMode(v as "light" | "dark" | "system")}>
            {options.map(opt => {
              const OptionIcon = opt.icon;
              const isActive = opt.value === mode;
              return (
                <DropdownMenu.RadioItem
                  key={opt.value}
                  value={opt.value}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none cursor-pointer transition-colors"
                  style={{
                    color: "var(--foreground)",
                    fontSize: 14,
                  }}
                  onSelect={() => setMode(opt.value)}
                >
                  <OptionIcon size={16} strokeWidth={1.6} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span className="flex-1">{opt.label}</span>
                  {isActive && <Check size={16} strokeWidth={2} style={{ flexShrink: 0 }} />}
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
