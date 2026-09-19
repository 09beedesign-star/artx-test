import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AnnouncementContent } from "./announcement-content";

/**
 * ── 公共公告弹窗（常驻骨架）──────────────────────────────────────
 *
 * 本文件只负责「排版布局 + 右下角绿色按钮样式 + 右上角圆形关闭按钮」。
 * 这三样是换弹窗时**不变**的部分；图片 / 标题 / 正文 / 标签 / 按钮文案
 * 全部由 `announcement-content.ts` 传进来。
 *
 * ── 关闭的通用规则（产品定稿 2026-09-19）──
 *   · 点右上角 ✕ → 关闭
 *   · 点右下角绿色按钮（我知道了）→ 关闭
 *   · 除此之外**任何操作都不关闭**
 *
 * ⚠️ 阻断式的三个必要条件，缺一条就不再是「阻断」：
 *   1. 遮罩自身要吃掉点击（不能 pointerEvents:"none"），且不绑 onClick 关闭
 *   2. 不设任何自动关闭定时器
 *   3. 不响应 Esc —— 否则用户可以不做选择就跳过
 * 📌 只把背景压暗却允许点击穿透，是「看起来像模态」的假模态。
 *
 * ⚠️ 本弹窗**刻意不加黑色蒙层**（用户明确要求）。
 *    注意「没有蒙层」和「不阻断」是两回事：
 *    这里的遮罩层依然铺满视口、依然吃掉所有点击，只是 background 透明。
 *    所以千万不要因为「反正是透明的」就给它加 pointerEvents:"none" ——
 *    那一行会让阻断彻底失效，而且页面看起来完全正常，不会有任何报错。
 *
 * ⚠️ 阻断期间锁住 body 滚动，否则用户虽然点不动，却还能滚页面，
 *    体验上会觉得「弹窗没管住」。卸载时必须恢复原值而不是硬写 ""，
 *    否则会把其它组件设的 overflow 一起抹掉。
 */

/** 右下角按钮 / 左下角标签共用的荧光绿（取自设计稿 #BAFF2E） */
const ACCENT_LIME = "var(--accent-lime, #BAFF2E)";

export interface AnnouncementModalProps {
  open: boolean;
  content: AnnouncementContent;
  /** ✕ 与「我知道了」都会走这里 —— 关闭规则对两者完全一致 */
  onClose: () => void;
}

export default function AnnouncementModal({
  open,
  content,
  onClose,
}: AnnouncementModalProps) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      // 阻断层：铺满视口、吃掉所有点击，但**不画任何颜色**（无黑色蒙层）
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "transparent",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="artx-announcement-title"
        style={{
          position: "relative",
          width: "min(600px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          borderRadius: 18,
          padding: 14,
          background: "#000",
          // 没有蒙层做层次分离，所以卡片自己要够强的描边 + 投影
          border: "2px solid #fff",
          boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
          boxSizing: "border-box",
        }}
      >
        {/* 右上角圆形关闭 —— 悬在卡片右上角外侧，与设计稿一致 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          style={{
            position: "absolute",
            top: -16,
            right: -16,
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 5 L19 19 M19 5 L5 19"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* 图片区（设计稿里的灰色占位块） */}
        <img
          src={content.image}
          alt={content.imageAlt}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "865 / 308",
            objectFit: "cover",
            borderRadius: 10,
            background: "#3a3a3a",
          }}
        />

        <h2
          id="artx-announcement-title"
          style={{
            margin: "18px 0 0",
            fontSize: 27,
            lineHeight: 1.2,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          {content.title}
        </h2>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: 14,
            lineHeight: 1.75,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {content.body}
        </p>

        {/* 底部：左下角小标签 + 右下角绿色主按钮 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginTop: 22,
          }}
        >
          {/* tag 为 null 时用占位撑开，保证按钮始终靠右且高度不塌 */}
          {content.tag ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 4,
                  alignSelf: "stretch",
                  minHeight: 38,
                  borderRadius: 2,
                  background: ACCENT_LIME,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontStyle: "italic",
                    color: ACCENT_LIME,
                    lineHeight: 1.35,
                  }}
                >
                  {content.tag.line1}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: ACCENT_LIME,
                    lineHeight: 1.35,
                  }}
                >
                  {content.tag.line2}
                </div>
              </div>
            </div>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              minWidth: 220,
              height: 48,
              padding: "0 24px",
              borderRadius: 8,
              border: "none",
              background: ACCENT_LIME,
              color: "#111",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              transition: "filter 0.15s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = "brightness(0.92)")}
            onMouseLeave={e => (e.currentTarget.style.filter = "none")}
          >
            {content.actionLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
