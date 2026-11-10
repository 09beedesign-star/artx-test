/**
 * 卡片 hover 操作层 —— 技能商店 / 灵感模板 / 个人中心**共用的唯一实现**。
 *
 * 视觉对标用户给的截图（2026-11-10）：
 *   - 图片区域整体压暗
 *   - 两枚胶囊按钮居中：主操作白底黑字，次操作毛玻璃白字
 *   - 底部标题/分类区不变白
 *
 * ⚠️⚠️ 为什么收成一个组件而不是各页各写一份：
 *    这是「同一份交互的多个出口」的典型场景。用户要求的是「所有卡片的 hover
 *    反馈必须一致」，一旦某页自己抄一份，将来调一次圆角/一档暗度，
 *    那一页就会悄悄走偏 —— 而且不会报错，只能靠肉眼在两张截图里找差异。
 *
 * ⚠️ 隐藏时必须**连点击一起关掉**（pointerEvents: none）：
 *    opacity: 0 的元素照样能接住点击。只藏视觉不藏命中区的结果是
 *    「卡片空白处乱点一下就跳走了」，用户完全无法理解发生了什么。
 */
export type CardHoverAction = {
  label: string;
  onClick: () => void;
  /** solid = 白底黑字主操作；ghost = 毛玻璃次操作（与截图一致） */
  variant?: "solid" | "ghost";
};

type CardHoverOverlayProps = {
  visible: boolean;
  actions: CardHoverAction[];
  /**
   * 压暗强度。默认 0.42 —— 截图里 hover 后图片几乎看不出内容，
   * 但仍保留一点层次，不至于变成纯黑色块。
   */
  dim?: number;
  /**
   * 紧凑版：卡片缩略图很窄时用（技能商店是 2:1 的小图，宽约 210px）。
   *
   * ⚠️ 两枚常规胶囊在 210px 宽的图上会溢出卡片边缘并被裁掉 ——
   *    表现为「复制提示词」只剩半截字。这不是排版小瑕疵，
   *    用户会以为按钮坏了。
   */
  compact?: boolean;
};

export function CardHoverOverlay({
  visible,
  actions,
  dim = 0.42,
  compact = false,
}: CardHoverOverlayProps) {
  return (
    <div
      data-card-hover-overlay={visible ? "on" : "off"}
      aria-hidden={!visible}
      className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200 ${
        compact ? "gap-1.5" : "gap-2"
      }`}
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        background: `rgba(0, 0, 0, ${dim})`,
      }}
    >
      {actions.map(action => (
        <button
          key={action.label}
          type="button"
          // 隐藏态不可聚焦：否则 Tab 会停在看不见的按钮上。
          tabIndex={visible ? 0 : -1}
          onClick={event => {
            // 卡片外层是 role="button"，不拦住会同时触发「打开详情」。
            event.stopPropagation();
            action.onClick();
          }}
          className={`shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] font-medium transition-transform duration-200 hover:scale-[1.03] active:scale-95 ${
            compact ? "px-3.5 py-1.5 text-[12px]" : "px-5 py-2 text-[13px]"
          }`}
          style={
            action.variant === "ghost"
              ? {
                  background: "rgba(255,255,255,0.16)",
                  border: "1px solid rgba(255,255,255,0.34)",
                  color: "#ffffff",
                  backdropFilter: "blur(2px)",
                }
              : { background: "#ffffff", color: "#161616" }
          }
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
