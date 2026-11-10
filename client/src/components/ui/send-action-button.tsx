/**
 * SendActionButton — 全站统一的「发送 / 生成」圆钮。
 *
 * 【2026-11-10 用户点名】参考图：黑色圆形 + 白色纸飞机描边，统一替换掉
 * 首页的紫色方钮、主输入框的荧光绿方钮、各处自制的黑/渐变小方钮。
 *
 * 📌 为什么要抽成一个组件：这类按钮此前有 **7 份独立实现**（紫色 / 荧光绿 /
 *    黑方 / 渐变 / 纯图标），改一次配色要逐个找、逐个改，漏一个没有任何报错，
 *    表现是「页面里还残留一个旧颜色的发送键」。
 *    📌 同一视觉的多个出口 = 必然不同步，收口到一份实现是唯一可靠做法。
 *
 * ⚠️ 深色模式也用黑底白 icon（用户原话如此），靠一条 12% 白描边把圆从
 *    深色画布上勾出来 —— 去掉描边，黑圆贴在深色输入框上几乎看不见。
 * ⚠️ 尺寸只走 `size` / `iconSize`，不要在外面盖 width/height：
 *    icon 默认按直径的 46% 取，盖了尺寸忘了改图标大小就会显得空洞或挤爆。
 */
import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SendActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** 直径（px），默认 32 */
  size?: number;
  /** 图标尺寸（px），默认取直径的 46% */
  iconSize?: number;
  /** 处理中：图标换成旋转圈，同时置灰 */
  loading?: boolean;
  /**
   * 带文字的形态（如电商画布的「生成」）。
   * ⚠️ 文字版**不是**另写一个按钮：同样是黑底白图标，
   *    只是把圆拓宽成胶囊。只留一个实现才叫统一。
   */
  label?: string;
}

export function SendActionButton({
  size = 32,
  iconSize,
  loading = false,
  label,
  disabled,
  className,
  style,
  type = "button",
  ...rest
}: SendActionButtonProps) {
  const glyph = iconSize ?? Math.max(11, Math.round(size * 0.46));
  const inactive = Boolean(disabled) || loading;
  return (
    <button
      type={type}
      disabled={inactive}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-150",
        "hover:opacity-90 active:scale-95 disabled:cursor-not-allowed",
        className
      )}
      style={{
        ...(label
          ? { height: size, paddingInline: 14, gap: 6, fontSize: 13, fontWeight: 600 }
          : { width: size, height: size }),
        background: "#161616",
        color: "#ffffff",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
        opacity: inactive ? 0.35 : 1,
        ...style,
      }}
      {...rest}
    >
      {loading ? <Loader2 size={glyph} className="animate-spin" /> : <Send size={glyph} />}
      {label ? <span className="whitespace-nowrap">{label}</span> : null}
    </button>
  );
}

export default SendActionButton;
