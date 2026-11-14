/**
 * 灵感推荐卡片 —— 专题页与个人中心**共用的唯一实现**。
 *
 * 2026-11-09 UI 重构为创作模板风格：
 * - 封面图 16:10 比例，hover 时轻微放大
 * - hover 时卡片整体抬升投影 0px 4px 16px rgba(0,0,0,0.14)
 * - 底部仅展示标题 + 分类标签 + 点赞
 *
 * 2026-11-10 两轮改动（用户要求）：
 * 1. 右上角 `Download` 图标 → 文字胶囊「一键同款」（没有文案用户不知道点下去是
 *    下载图片还是进画布，实际动作是后者）。
 * 2. 胶囊**只在 hover 时出现**，不再常驻；同时去掉 hover 时居中的两枚按钮
 *    （与右上角入口重复）。hover 只剩「整块轻微压暗 + 胶囊淡入」。
 *
 * ⚠️ 不改变数据结构——个人中心复用无需改动。
 * ⚠️ `onCopyPrompt` 已随居中按钮一并移除：复制提示词的入口在「点卡片打开的详情弹窗」里，
 *    卡片上再放一个是同一动作的第二个出口。
 */
import { useState, type ReactNode } from "react";
import { CardHoverOverlay } from "@/components/ui/card-hover-overlay";

export type InspirationCardItem = {
  title: string;
  field: string;
  description: string;
  prompt: string;
  imageUrl: string;
};

export type InspirationCardProps = {
  item: InspirationCardItem;
  isDark: boolean;
  cardBg: string;
  border: string;
  shadow: string;
  text: string;
  sub: string;
  activeBg: string;
  hovered: boolean;
  onOpen: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** 「一键同款」：图片进画布 + 挂进提示词输入框，等用户写提示词。 */
  onApplySameStyle?: () => void;
  /** 赞的位置上要渲染的内容（点赞按钮）。头像就贴在它旁边 */
  reactionSlot?: ReactNode;
  /**
   * 🔒 2026-11-14：瀑布流模式 —— 宽度跟随列宽、高度随图片原始比例自适应，整图完整可见。
   * 默认 false = 原 16:10 裁切封面（个人中心仍是等高网格，不受影响）。
   */
  fitImage?: boolean;
};

export function InspirationCard({
  item,
  isDark,
  cardBg,
  border,
  text,
  sub,
  activeBg,
  hovered,
  onOpen,
  onMouseEnter,
  onMouseLeave,
  onApplySameStyle,
  reactionSlot,
  fitImage = false,
}: InspirationCardProps) {
  // 瀑布流下图片未加载前高度为 0，给个占位最小高；加载完撤掉，矮图不留空白。
  const [imageLoaded, setImageLoaded] = useState(false);
  return (
    <article
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      role="button"
      tabIndex={0}
      className="cursor-pointer overflow-hidden text-left transition-all duration-300"
      style={{
        background: cardBg,
        border: `1px solid ${border}`,
        borderRadius: "var(--radius-lg-design)",
        // hover 时整体抬升投影，与截图2 hover 态保持一致
        boxShadow: hovered
          ? "0px 4px 16px rgba(0,0,0,0.14)"
          : "0 1px 4px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── 封面图区 16:10 ── */}
      <div
        className="relative overflow-hidden bg-[#1a1a1a]"
        data-inspiration-card-fit={fitImage ? "" : undefined}
        style={fitImage ? { minHeight: imageLoaded ? undefined : 160 } : { aspectRatio: "16 / 10" }}
      >
        <img
          src={item.imageUrl}
          alt={item.title}
          className={
            fitImage
              ? "relative z-10 block h-auto w-full transition-transform duration-500 ease-out"
              : "relative z-10 h-full w-full object-cover transition-transform duration-500 ease-out"
          }
          style={{ transform: hovered ? "scale(1.08)" : "scale(1)" }}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={event => {
            event.currentTarget.style.display = "none";
          }}
        />
        {/* 图片加载失败兜底背景 */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #1a1a1a, #2a2a2a)", zIndex: 0 }}
        >
          <span style={{ color: "#555", fontSize: 11 }}>待加载</span>
        </div>

        {/* hover 压暗层：不承载按钮，只负责「被选中」的反馈 */}
        <CardHoverOverlay visible={hovered} dim={0.18} />

        {onApplySameStyle && (
          /*
           * 封面正中央「一键同款」，**只在 hover 时出现**（用户要求）。
           * - 位置：absolute 居中（inset-0 + flex 对齐），不再钉右上角
           * - 延迟：父组件 handleInspirationCardMouseEnter 有 500ms setTimeout，
           *   卡片内部不再叠加 transition delay，改为 duration-150 零感延迟淡入。
           * ⚠️ 隐藏时必须连点击一起关掉：opacity:0 的元素照样接点击，
           *    否则鼠标扫过卡片任意位置都可能误触「一键同款」。
           */
          <div
            className="absolute inset-0 z-30 flex items-center justify-center"
            style={{ pointerEvents: hovered ? "auto" : "none" }}
          >
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onApplySameStyle();
              }}
              className="whitespace-nowrap rounded-[var(--radius-pill)] px-4 py-1.5 text-[12px] font-medium transition-all duration-150 hover:scale-105 active:scale-95"
              style={{
                background: "#ffffff",
                color: "#161616",
                boxShadow: "0 2px 12px rgba(0,0,0,0.22)",
                opacity: hovered ? 1 : 0,
                transform: hovered ? "scale(1)" : "scale(0.92)",
              }}
              tabIndex={hovered ? 0 : -1}
              aria-label="一键同款"
              title="一键同款"
            >
              一键同款
            </button>
          </div>
        )}
      </div>

      {/* ── 底部元信息区 ── */}
      <div className="px-3 py-2.5">
        {/* 标题行 */}
        <h2
          className="truncate whitespace-nowrap text-[13px] font-semibold leading-5"
          style={{ color: text }}
        >
          {item.title}
        </h2>

        {/* 分类标签 + 点赞 */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className="shrink-0 truncate rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px]"
            style={{
              background: "transparent",
              color: "var(--artx-action-fg)",
              borderColor: "var(--artx-action-border)",
              maxWidth: "70%",
            }}
          >
            {item.field}
          </span>
          {/* 点赞 slot */}
          <span className="shrink-0">{reactionSlot}</span>
        </div>
      </div>
    </article>
  );
}
