import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { CircleDot, X } from "lucide-react";
import { toast } from "sonner";
import {
  skillStoreItems,
  createPendingSkillLoad,
  type PendingSkillLoad,
} from "@/lib/skill-store";
import { ComposerDisclosureCaret } from "./composer-disclosure-caret";
import { modelPopoverTokens, type ModelPopoverTheme } from "./model-popover-tokens";

const COMPACT_DISCLOSURE_BUTTON_WIDTH = 32;

interface SkillSelectorProps {
  activeSkill: PendingSkillLoad | null;
  onChange: (skill: PendingSkillLoad | null) => void;
  isDark: boolean;
  compact?: boolean;
  // 主题颜色 props
  textPrimary?: string;
  textMuted?: string;
  bgMain?: string;
  borderColor?: string;
  /**
   * 展开面板的配色（2026-11-14）：与 ModelSelector 共用 modelPopoverTokens。
   * ⚠️ 默认 "dark" = 原行为；浅色页面（首页）显式传 "light" 才是白底深字。
   */
  popoverTheme?: ModelPopoverTheme;
}

/**
 * Skill 技能选择器组件
 * 从画布的 SkillPointSelector 提取出来的可复用组件
 */
export function SkillSelector({
  activeSkill,
  onChange,
  isDark,
  compact = false,
  textPrimary,
  textMuted,
  bgMain,
  borderColor,
  popoverTheme = "dark",
}: SkillSelectorProps) {
  const [open, setOpen] = useState(false);
  const [buttonHover, setButtonHover] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties | null>(null);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, typeof skillStoreItems>();
    skillStoreItems.forEach(skill => {
      const key = skill.subcategory || skill.category;
      groups.set(key, [...(groups.get(key) || []), skill]);
    });
    return Array.from(groups.entries());
  }, []);

  // 使用传入的颜色或默认值
  const bg = bgMain || (isDark ? "#161616" : "#161616");
  const hoverButtonBg = "transparent"; // 与 ModelSelector 一致：透明背景
  const compactDefaultBg = isDark ? "#525252" : bg;
  const compactSelectedBg = isDark ? "#2b2b2b" : hoverButtonBg;
  const border = borderColor || (isDark ? "#161616" : "#161616");
  const text = textMuted || (isDark ? "#bbbbbb" : "#161616");
  const hoverButtonText = textPrimary || (isDark ? "#ffffff" : "#000000"); // 与 ModelSelector 一致：使用 textPrimary
  /**
   * 🔒 2026-11-14 用户要求：首页（浅色）的 Skill 展开面板改白底。
   * 改之前浅色页面下面板恒为 #161616、行文字也是 #161616 → 黑底黑字，零报错。
   * 面板主色统一走 modelPopoverTokens，与模型选择器同一事实源。
   */
  const lightPop = popoverTheme === "light";
  const pop = modelPopoverTokens(popoverTheme, { text, border }, isDark);
  const popBg = pop.background;
  const popBorder = pop.border;
  const popText = pop.text;
  const hoverBg = pop.hoverBackground;
  const activeBg = lightPop
    ? pop.selectedBackground
    : isDark
      ? "rgba(22,22,22,0.18)"
      : "rgba(22,22,22,0.08)";
  const activeText = lightPop ? "#161616" : isDark ? "#f5f6f8" : "#161616";
  /** 面板内次级文字：浅色面板一律深色系；深色面板保持原口径 */
  const popSecondary = (darkValue: string, lightValue: string) =>
    lightPop ? lightValue : isDark ? darkValue : lightValue;

  const skillIconColor = useCallback((id: string) => {
    const palette = [
      "#ff7ab6",
      "#7c5cff",
      "#00d0ff",
      "#42d392",
      "#ffb020",
      "#ff6b4a",
      "#c5ed47",
      "#4f9cff",
      "#f76fff",
      "#26d9b5",
    ];
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length];
  }, []);

  const updatePopoverPosition = useCallback(() => {
    const trigger = selectorRef.current;
    if (!trigger) return;
    const margin = 12;
    const gap = 8;
    const width = Math.min(288, Math.max(220, window.innerWidth - margin * 2));
    const maxHeight = Math.max(
      180,
      Math.min(360, window.innerHeight - margin * 2)
    );
    const rect = trigger.getBoundingClientRect();
    const spaceAbove = rect.top - margin - gap;
    const spaceBelow = window.innerHeight - rect.bottom - margin - gap;
    const openAbove =
      spaceAbove >= Math.min(maxHeight, 260) || spaceAbove >= spaceBelow;
    const availableHeight = Math.max(
      160,
      Math.min(maxHeight, openAbove ? spaceAbove : spaceBelow)
    );
    const left = Math.min(
      Math.max(margin, rect.left),
      window.innerWidth - width - margin
    );
    const top = openAbove
      ? Math.max(margin, rect.top - gap - availableHeight)
      : Math.min(
          window.innerHeight - margin - availableHeight,
          rect.bottom + gap
        );
    setPopoverStyle({
      position: "fixed",
      left,
      top,
      width,
      maxHeight: availableHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !selectorRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      )
        setOpen(false);
    };
    updatePopoverPosition();
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition]);

  return (
    <div
      ref={selectorRef}
      className="relative nodrag nopan"
      style={{ zIndex: open ? 1200 : 100 }}
    >
      <button
        type="button"
        title="极点选择器 / Skill"
        onClick={() => {
          setOpen(value => !value);
          requestAnimationFrame(updatePopoverPosition);
        }}
        className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-[var(--radius-md-design)] px-2 transition-colors"
        style={{
          width: compact ? COMPACT_DISCLOSURE_BUTTON_WIDTH : undefined,
          maxWidth: compact ? COMPACT_DISCLOSURE_BUTTON_WIDTH : 74,
          background:
            compact
              ? activeSkill || open || buttonHover
                ? compactSelectedBg
                : compactDefaultBg
              : open || buttonHover
                ? hoverButtonBg
                : "transparent",
          border: compact ? "none" : "none",
          color: compact
            ? activeSkill || open || buttonHover
              ? hoverButtonText
              : text
            : open || buttonHover
              ? hoverButtonText
              : text,
          fontSize: 11,
          lineHeight: "14px",
          letterSpacing: 0,
        }}
        onMouseEnter={() => setButtonHover(true)}
        onMouseLeave={() => setButtonHover(false)}
      >
        <CircleDot size={12} style={{ flex: "0 0 auto" }} />
        {!compact && (
          <span className="min-w-0 max-w-[38px] truncate">
            {activeSkill ? activeSkill.name : "Skill"}
          </span>
        )}
        <ComposerDisclosureCaret open={open} compact={compact} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="model-selector-scroll overflow-y-auto rounded-[var(--radius-md-design)] p-1 shadow-2xl"
            style={{
              ...(popoverStyle || {}),
              background: popBg,
              border: `1px solid ${popBorder}`,
              color: popText,
              ...(pop.shadow ? { boxShadow: pop.shadow } : {}),
              ...(lightPop ? { scrollbarColor: `${pop.scrollbar} transparent` } : {}),
              zIndex: 9999,
            }}
          >
            {activeSkill && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  toast("已取消 Skill", {
                    description: "输入框恢复为普通 AI 创作模式",
                  });
                }}
                className="flex w-full items-center gap-2 rounded-[var(--radius-sm-design)] px-2.5 py-2 text-left type-caption"
                style={{
                  color: popSecondary(
                    "rgba(255,255,255,0.71)",
                    "rgba(20,20,36,0.58)"
                  ),
                }}
                onMouseEnter={event => {
                  event.currentTarget.style.background = hoverBg;
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.background = "transparent";
                }}
              >
                <X size={13} />
                取消当前 Skill
              </button>
            )}
            {groupedSkills.map(([group, skills]) => (
              <div key={group}>
                <div
                  className="px-2.5 pb-1 pt-2 text-[11px] font-semibold"
                  style={{
                    color: popSecondary(
                      "rgba(255,255,255,0.59)",
                      "rgba(20,20,36,0.42)"
                    ),
                  }}
                >
                  {group}
                </div>
                {skills.map(skill => {
                  const Icon = skill.icon;
                  const active = activeSkill?.id === skill.id;
                  const iconColor = skillIconColor(skill.id);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => {
                        const pendingSkill = createPendingSkillLoad(skill);
                        onChange(pendingSkill);
                        setOpen(false);
                        toast("Skill 已加载", {
                          description: pendingSkill.name,
                        });
                      }}
                      className="flex w-full items-start gap-2 rounded-[var(--radius-sm-design)] px-2.5 py-2 text-left transition-colors"
                      style={{
                        background: active ? activeBg : "transparent",
                        color: active ? activeText : popText,
                      }}
                      onMouseEnter={event => {
                        if (!active)
                          event.currentTarget.style.background = hoverBg;
                      }}
                      onMouseLeave={event => {
                        event.currentTarget.style.background = active
                          ? activeBg
                          : "transparent";
                      }}
                    >
                      <Icon
                        size={15}
                        color={iconColor}
                        stroke={iconColor}
                        strokeWidth={2.35}
                        style={{
                          color: iconColor,
                          filter: `drop-shadow(0 0 5px ${iconColor}66)`,
                          marginTop: 1,
                          flexShrink: 0,
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {skill.name}
                        </span>
                        <span
                          className="mt-0.5 block line-clamp-2 text-[11px]"
                          style={{
                            color: popSecondary(
                              "rgba(255,255,255,0.62)",
                              "rgba(20,20,36,0.50)"
                            ),
                          }}
                        >
                          {skill.summary}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
