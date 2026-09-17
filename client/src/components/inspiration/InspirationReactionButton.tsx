/**
 * 点赞 / 收藏按钮 —— 带点亮动效的**共享组件**。
 *
 * 用户要求首页爱心、专题页详情浮窗的点赞与五角星收藏都要「点亮动画」。
 * 📌 三处各写一遍 = 三套不一样的动效，且改一处另两处不跟着改。
 *
 * 【动效设计】
 * 点亮瞬间做一次「回弹放大」+ 外圈光晕扩散，符合用户说的「红色桃心的点亮动画」。
 * ⚠️ 动画靠 `key` 变化重挂载触发，不能只切 CSS class：
 * 连续点两次同一个按钮时，class 没变化 → 浏览器不会重播动画，
 * 用户会觉得「第二次点没反应」。
 */
import { Heart, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type InspirationReactionButtonProps = {
  kind: "like" | "favorite";
  active: boolean;
  /** 展示的数字。不传则只显示图标（详情浮窗用） */
  count?: number;
  size?: number;
  /** 未点亮时的颜色。点亮色由 kind 决定，不可外部覆盖，保证全站一致 */
  idleColor?: string;
  label?: string;
  onToggle: () => void;
};

/** 点赞点亮色：用户明确要求「红色桃心」。 */
const LIKE_ACTIVE_COLOR = "#ff4d6d";
/** 收藏点亮色：五角星用暖金，和红心区分开，避免两个都点亮时分不清。 */
const FAVORITE_ACTIVE_COLOR = "#ffc53d";

export function InspirationReactionButton({
  kind,
  active,
  count,
  size = 14,
  idleColor = "rgba(255,255,255,0.69)",
  label,
  onToggle,
}: InspirationReactionButtonProps) {
  const [burstKey, setBurstKey] = useState(0);
  // ⚠️ 首次挂载时 active 可能已经是 true（历史数据），此时不该放动画，
  //    否则一进页面所有赞过的卡片同时爆闪。
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (active) setBurstKey(value => value + 1);
  }, [active]);

  const activeColor = kind === "like" ? LIKE_ACTIVE_COLOR : FAVORITE_ACTIVE_COLOR;
  const Icon = kind === "like" ? Heart : Star;
  const ariaLabel =
    label || (kind === "like" ? (active ? "取消点赞" : "点赞") : active ? "取消收藏" : "收藏");

  return (
    <button
      type="button"
      data-testid={`inspiration-${kind}-button`}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={event => {
        // ⚠️ 卡片本身是可点击的（打开详情），不拦截会「点个赞顺便弹窗」。
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      className="relative flex shrink-0 items-center gap-1 text-xs font-medium transition-transform active:scale-90"
      style={{ color: active ? activeColor : idleColor, background: "transparent" }}
    >
      <span className="relative flex items-center justify-center">
        {/* 点亮光晕：一次性扩散后消失，key 变化即重播 */}
        {active && (
          <span
            key={burstKey}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              width: size * 2,
              height: size * 2,
              background: activeColor,
              animation: "artx-reaction-burst 520ms ease-out forwards",
            }}
          />
        )}
        <Icon
          key={`icon-${burstKey}-${active ? "on" : "off"}`}
          size={size}
          fill={active ? activeColor : "currentColor"}
          strokeWidth={active ? 0 : 0}
          style={{
            position: "relative",
            animation: active ? "artx-reaction-pop 420ms cubic-bezier(0.2, 1.6, 0.4, 1)" : undefined,
          }}
        />
      </span>
      {typeof count === "number" && <span>{count}</span>}
    </button>
  );
}
