/**
 * 灵感推荐卡片 —— 专题页与个人中心**共用的唯一实现**。
 *
 * 【为什么抽出来】
 * 用户要求个人中心「我赞过的 / 我的收藏」两个 tab
 * 「直接复用灵感推荐专题页的卡片样式，所有信息保持一致，
 *   包括卡片右上角的一键导入画布 icon 也保留一样」。
 * 📌 复制一份 JSX 过去 = 同一份 UI 的第二个出口：专题页改了样式，
 * 个人中心不会跟着改，两边慢慢长歪，而这不会报任何错。
 *
 * 【头像的位置与描边】
 * 用户给的参考图里，头像压在图片区右下角、和下方信息区交界处，外围一圈描边。
 * ⚠️ 用户特别强调「描边不能覆盖下方的文字或者标签」：
 * 所以头像绝对定位在**图片容器**内（`bottom` 为负值仅越过交界线一点），
 * 并且信息区顶部预留了 `paddingTop`，让标签行从头像下方开始排。
 * 📌 若把头像放进信息区或用 `transform` 硬顶出去，描边就会压在「UI设计」标签上。
 */
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { InspirationAvatar } from "@/components/inspiration/InspirationAvatar";

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
  /** 卡片头像外圈描边宽度。专题页为 2px（用户指定） */
  avatarBorderWidth?: number;
  /** 描边颜色。必须与卡片背景同色，才是「挖空」观感而不是一圈黑边 */
  avatarBorderColor?: string;
  onOpen: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onCopyPrompt: () => void;
  /** 右上角「一键导入画布」。个人中心与专题页都要有 */
  onImportToCanvas?: () => void;
  /** 赞的位置上要渲染的内容（点赞按钮）。头像就贴在它旁边 */
  reactionSlot?: ReactNode;
};

export function InspirationCard({
  item,
  isDark,
  cardBg,
  border,
  shadow,
  text,
  sub,
  activeBg,
  hovered,
  avatarBorderWidth = 2,
  avatarBorderColor,
  onOpen,
  onMouseEnter,
  onMouseLeave,
  onCopyPrompt,
  onImportToCanvas,
  reactionSlot,
}: InspirationCardProps) {
  // 描边默认取卡片背景色 —— 用户要求「描边颜色与卡片的黑色保持同样的颜色」。
  const ringColor = avatarBorderColor || cardBg;

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
      className="cursor-pointer overflow-hidden rounded-[var(--radius-lg-design)] text-left transition-all"
      style={{ background: cardBg, border: `1px solid ${border}`, boxShadow: shadow }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative overflow-hidden bg-[#222222]" style={{ aspectRatio: "16 / 10" }}>
        <img
          src={item.imageUrl}
          alt={item.title}
          className="relative z-10 h-full w-full object-cover transition-transform duration-300 ease-out"
          style={{ transform: hovered ? "scale(1.08)" : "scale(1)" }}
          loading="lazy"
          onError={event => {
            event.currentTarget.style.display = "none";
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center px-6 text-center"
          style={{ background: "linear-gradient(135deg, oklch(0.20 0.05 290), oklch(0.18 0.04 205))", zIndex: 0 }}
        >
          <span className="type-caption leading-5" style={{ color: "oklch(0.88 0.02 270)", letterSpacing: 0, textTransform: "none" }}>
            本地图片待同步
          </span>
        </div>

        {onImportToCanvas && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onImportToCanvas();
            }}
            className="absolute right-2 top-2 z-20 rounded-full p-2 shadow-lg transition-all hover:scale-110"
            style={{ background: "#C5ED47" }}
            aria-label="一键导入画布"
            title="一键导入画布"
          >
            <Download size={14} style={{ color: "#111" }} />
          </button>
        )}

        {/*
          虚拟创作者头像（需求 3）。
          ⚠️ `pointer-events-none` —— 用户明确要求「头像不可点」。
          ⚠️ 只越过交界线 14px，不会伸进标签行；信息区已预留上内边距。
        */}
        <InspirationAvatar
          title={item.title}
          testId="inspiration-card-avatar"
          className="pointer-events-none absolute right-3 z-20 h-11 w-11 rounded-full"
          style={{
            bottom: -14,
            border: `${avatarBorderWidth}px solid ${ringColor}`,
            background: ringColor,
          }}
        />
      </div>

      {/* ⚠️ pt-7：给越过交界线的头像让位，避免描边压住下方标签（用户明确禁止） */}
      <div className="flex min-h-[270px] flex-col p-4 pt-7">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <span
            className="min-w-0 truncate whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 type-caption"
            style={{ background: activeBg, color: "oklch(0.80 0.17 290)", letterSpacing: 0, textTransform: "none" }}
          >
            {item.field}
          </span>
          {reactionSlot}
        </div>

        <h2 className="min-w-0 truncate whitespace-nowrap type-body-sm leading-5" style={{ color: text, fontWeight: 750 }}>
          {item.title}
        </h2>
        <p className="min-w-0 truncate whitespace-nowrap type-caption mt-2 leading-5" style={{ color: sub, letterSpacing: 0, textTransform: "none" }}>
          {item.description}
        </p>
        <p
          className="mt-3 rounded-[var(--radius-md-design)] p-3 type-caption leading-5"
          style={{
            background: isDark ? "oklch(0 0 0 / 0.18)" : "oklch(0 0 0 / 0.035)",
            color: isDark ? "oklch(0.72 0.01 270)" : "oklch(0.57 0.010 270)",
            display: "-webkit-box",
            letterSpacing: 0,
            overflow: "hidden",
            textTransform: "none",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 4,
          }}
        >
          {item.prompt}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span
            className="type-caption"
            style={{ color: isDark ? "oklch(0.78 0.14 290)" : "oklch(0.52 0.17 290)", letterSpacing: 0, textTransform: "none" }}
          >
            点击查看完整提示词
          </span>
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onCopyPrompt();
            }}
            className="shrink-0 rounded-[var(--radius-pill)] px-2.5 py-1 type-caption transition-all hover:scale-105 active:scale-95"
            style={{
              background: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.05)",
              border: `1px solid ${border}`,
              color: text,
              letterSpacing: 0,
              textTransform: "none",
            }}
          >
            复制提示词
          </button>
        </div>
      </div>
    </article>
  );
}
