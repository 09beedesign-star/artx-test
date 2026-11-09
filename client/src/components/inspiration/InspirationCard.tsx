/**
 * 灵感推荐卡片 —— 专题页与个人中心**共用的唯一实现**。
 *
 * 2026-11-09 UI 重构为创作模板风格：
 * - 封面图 16:10 比例，hover 时轻微放大
 * - hover 时卡片整体抬升投影 0px 4px 16px rgba(0,0,0,0.14)
 * - 底部仅展示标题 + 分类标签 + 操作按钮（参考截图2）
 * - 删除了原有的大块 prompt 展示区，改为精简的一行元信息
 *
 * ⚠️ 不改变数据结构和 props 接口——个人中心复用无需改动。
 */
import { Download } from "lucide-react";
import type { ReactNode } from "react";

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
  onOpen,
  onMouseEnter,
  onMouseLeave,
  onCopyPrompt,
  onImportToCanvas,
  reactionSlot,
}: InspirationCardProps) {
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
      <div className="relative overflow-hidden bg-[#1a1a1a]" style={{ aspectRatio: "16 / 10" }}>
        <img
          src={item.imageUrl}
          alt={item.title}
          className="relative z-10 h-full w-full object-cover transition-transform duration-500 ease-out"
          style={{ transform: hovered ? "scale(1.06)" : "scale(1)" }}
          loading="lazy"
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

        {/* hover 时显示操作覆盖层 */}
        <div
          className="absolute inset-0 z-20 flex items-end pb-3 px-3 gap-2 transition-opacity duration-200"
          style={{ opacity: hovered ? 1 : 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }}
        >
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onCopyPrompt(); }}
            className="rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-medium transition-all hover:scale-105 active:scale-95"
            style={{ background: "rgba(255,255,255,0.92)", color: "#161616" }}
          >
            复制提示词
          </button>
        </div>

        {/* 右上角导入画布按钮 */}
        {onImportToCanvas && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onImportToCanvas();
            }}
            className="absolute right-2 top-2 z-30 rounded-full p-1.5 shadow-lg transition-all hover:scale-110 active:scale-95"
            style={{ background: "#ffffff", opacity: hovered ? 1 : 0.7 }}
            aria-label="一键导入画布"
            title="一键导入画布"
          >
            <Download size={13} style={{ color: "#161616" }} />
          </button>
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
            className="shrink-0 truncate rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px]"
            style={{
              background: activeBg,
              color: isDark ? "rgba(255,255,255,0.6)" : "#555555",
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
