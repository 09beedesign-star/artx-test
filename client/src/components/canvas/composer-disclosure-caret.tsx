import { ChevronDown } from "lucide-react";

/**
 * 提示词输入框工具条上「可展开按钮」的展开箭头 —— 唯一事实源。
 *
 * 【2026-09-17 新建】用户反馈：「四个功能 icon 总是容易被忽视掉有展开效果」。
 *
 * ── 为什么要抽成组件 ────────────────────────────────────────────
 *
 * 这一排有四个带展开态的按钮（模型 / Skill / 张数 / 画幅），它们分散在
 * 三个不同的地方定义：
 *   - 模型选择器：InfiniteCanvas.tsx 内联 JSX
 *   - SkillPointSelector：同文件独立组件
 *   - ImageCountSelector / ImageRatioSelector：同文件另两个独立组件
 *
 * 本次排查发现的真实状况正是「同一份视觉逻辑的多个出口」典型症状：
 *   ① 四处都把箭头包在 `{!compact && ...}` 里 → 面板窄于 400px 时
 *      **四个箭头同时消失**，按钮退化成一个光秃秃的图标，
 *      用户完全看不出它能展开（这就是用户反馈的场景）。
 *   ② SkillPointSelector 的箭头**漏了 transform**，展开了也不转 —— 四处里
 *      三处有旋转、一处没有，纯人工复制必然出现的偏差。
 *   ③ size/opacity 三处写 10/0.65，一处写 10/0.65 但没 transition。
 *
 * ⚠️ 所以新增/修改展开箭头一律走本组件，不要再在按钮里内联 <ChevronDown>。
 *    只要有人再抄一份，①②③ 就会重新长出来，而且不会报任何错。
 */

/** 箭头尺寸。比之前的 10 略大 —— 10px 在 32px 高的按钮里几乎看不见。 */
export const COMPOSER_CARET_SIZE = 11;

/**
 * 箭头的静息透明度。
 *
 * 原先是 0.65，配合 10px 尺寸导致「有展开效果」这件事几乎不可见。
 * 提到 0.9：箭头是**功能可见性指示**（affordance），不是装饰，
 * 不该像辅助说明那样被压暗。
 */
export const COMPOSER_CARET_IDLE_OPACITY = 0.9;

/** 展开时的透明度，配合旋转一起强化「当前是打开的」。 */
export const COMPOSER_CARET_OPEN_OPACITY = 1;

export const COMPOSER_CARET_TRANSITION = "transform 0.16s ease, opacity 0.16s ease";

/**
 * 紧凑模式下「可展开按钮」的宽度。
 *
 * ⚠️⚠️ 原先是 32 —— 那是「只放一个 12px 图标」算出来的宽度。
 * 现在紧凑态也要显示箭头，继续用 32 会让图标和箭头互相挤压变形。
 * 44 = 12(图标) + 11(箭头) + 左右 padding + 图标箭头间距。
 *
 * 📌 上传按钮**不在此列**：它点击后弹系统文件选择器，没有展开态，
 *    不该有箭头，因此仍然保持 32。给它加箭头等于用视觉语言撒谎。
 */
export const COMPACT_DISCLOSURE_BUTTON_WIDTH = 44;

/**
 * 工具条按钮的展开箭头。
 *
 * @param open 面板是否展开。展开时旋转 180° 变为向上。
 * @param compact 紧凑模式（面板窄，按钮只剩图标、隐去文字）。
 *
 * ⚠️⚠️ compact 只影响**左边距**，绝不影响「是否渲染」。
 *   紧凑模式恰恰是最需要箭头的场景 —— 文字 label 都被隐去了，
 *   箭头是此时唯一还能表达「我可以展开」的元素。
 *   把它藏起来等于在最需要提示的时候撤掉提示。
 */
export function ComposerDisclosureCaret({
  open,
  compact = false,
}: {
  open: boolean;
  compact?: boolean;
}) {
  return (
    <ChevronDown
      size={COMPOSER_CARET_SIZE}
      data-composer-caret={open ? "open" : "closed"}
      aria-hidden="true"
      style={{
        flex: "0 0 auto",
        // 紧凑模式下按钮只有 32px 宽，图标+箭头要挤在一起，所以收掉间距。
        marginLeft: compact ? -1 : 0,
        opacity: open ? COMPOSER_CARET_OPEN_OPACITY : COMPOSER_CARET_IDLE_OPACITY,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: COMPOSER_CARET_TRANSITION,
      }}
    />
  );
}
