import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AnnouncementContent } from "./announcement-content";

/**
 * ── 公共公告弹窗（常驻骨架）──────────────────────────────────────
 *
 * 本文件只负责「排版布局 + 右下角绿色按钮样式」。
 * 这些是换弹窗时**不变**的部分；图片 / 标题 / 正文 / 标签 / 按钮文案
 * 全部由 `announcement-content.ts` 传进来。
 *
 * ── 关闭的通用规则（产品定稿 2026-09-19）──
 *   · 点右下角绿色按钮（我知道了）→ 关闭
 *   · 除此之外**任何操作都不关闭**
 *
 * ⚠️ 右上角圆形 ✕ 已于 2026-09-19 移除（产品：右下角已有按钮，两个关闭口重复）。
 *    所以现在**全局只剩一个关闭出口**，它的可用性是硬需求：
 *    右下角按钮一旦被条件渲染挡掉 / 被内容顶出可视区，弹窗就彻底关不掉了，
 *    而且不会报任何错。改底部区域时务必确认这个按钮恒在。
 *    （历史：✕ 曾因放进 overflowY:"auto" 的卡片里被裁切，显示不全。别再加回来。）
 *
 * ⚠️ 阻断式的三个必要条件，缺一条就不再是「阻断」：
 *   1. 遮罩自身要吃掉点击（不能 pointerEvents:"none"），且不绑 onClick 关闭
 *   2. 不设任何自动关闭定时器
 *   3. 不响应 Esc —— 否则用户可以不做选择就跳过
 * 📌 只把背景压暗却允许点击穿透，是「看起来像模态」的假模态。
 *
 * ⚠️ 蒙层遮罩（2026-09-19 产品改口径）：由「透明无蒙层」改为**半透明黑色蒙层**。
 *    早期版本刻意不加蒙层的要求已作废，改回 transparent 会让弹窗和首页内容糊在一起。
 *    但注意：蒙层只负责压暗，阻断靠的是「铺满视口 + 吃掉点击 + 不绑 onClick」。
 *    千万不要因为「现在有蒙层了」就顺手加「点蒙层关闭」或 pointerEvents:"none" ——
 *    那会让阻断彻底失效，而且页面看起来完全正常，不会有任何报错。
 *
 * ⚠️ 阻断期间锁住 body 滚动，否则用户虽然点不动，却还能滚页面，
 *    体验上会觉得「弹窗没管住」。卸载时必须恢复原值而不是硬写 ""，
 *    否则会把其它组件设的 overflow 一起抹掉。
 */

/** 右下角按钮 / 左下角标签共用的荧光绿（取自设计稿 #BAFF2E） */
const ACCENT_LIME = "var(--accent-lime, #BAFF2E)";

/**
 * 卡片宽度：原 600 → 整体缩小 20% 后为 480。
 * 内部的字号 / 间距 / 按钮尺寸也按同比例下调，否则只缩外框会把内容挤爆。
 */
const CARD_WIDTH = 480;

/**
 * 白色描边宽度：2 → 4（2026-09-19 产品要求「向内扩大两个像素」）。
 *
 * ⚠️ 「向内」靠的是卡片上的 `boxSizing: "border-box"`，不是这个数字本身。
 *    border-box 下 width 含边框，所以加粗只会吃掉内容区，外框总尺寸恒为 CARD_WIDTH。
 *    一旦有人把 boxSizing 改成 content-box（或删掉这行），
 *    描边就会**向外**撑，弹窗整体变成 488px —— 尺寸悄悄变大且不报错。
 */
const CARD_BORDER_WIDTH = 4;

/** 蒙层遮罩 —— 压暗首页背景，与弹窗形成层次 */
const MASK_SCRIM = "rgba(0,0,0,0.55)";

export interface AnnouncementModalProps {
  open: boolean;
  content: AnnouncementContent;
  /** 目前只有右下角「我知道了」会走这里（✕ 已移除） */
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
      // 阻断层：铺满视口、吃掉所有点击，并压暗背景（半透明黑色蒙层）
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: MASK_SCRIM,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="artx-announcement-title"
        style={{
          position: "relative",
          width: `min(${CARD_WIDTH}px, 100%)`,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          borderRadius: 14,
          padding: 11,
          background: "#000",
          border: `${CARD_BORDER_WIDTH}px solid #fff`,
          // 阴影：不透明度 +10%（0.65→0.72）、扩散 +20%（30/90→36/108）
          boxShadow: "0 36px 108px rgba(0,0,0,0.72)",
          // ⚠️ 描边「向内扩」全靠这一行，删掉会让弹窗整体变宽，见 CARD_BORDER_WIDTH
          boxSizing: "border-box",
        }}
      >
        {/* 图片区（设计稿里的灰色占位块） */}
        <img
          src={content.image}
          alt={content.imageAlt}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "865 / 308",
            objectFit: "cover",
            borderRadius: 8,
            background: "#3a3a3a",
          }}
        />

        <h2
          id="artx-announcement-title"
          style={{
            margin: "14px 0 0",
            fontSize: 22,
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
            margin: "11px 0 0",
            fontSize: 12,
            lineHeight: 1.75,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {content.body}
        </p>

        {/* 底部：左下角小标签 + 右下角绿色主按钮（唯一关闭出口） */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 13,
            marginTop: 18,
          }}
        >
          {/* tag 为 null 时用占位撑开，保证按钮始终靠右且高度不塌 */}
          {content.tag ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  minHeight: 30,
                  borderRadius: 2,
                  background: ACCENT_LIME,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
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
                    fontSize: 11,
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
              minWidth: 176,
              height: 38,
              padding: "0 19px",
              borderRadius: 6,
              border: "none",
              background: ACCENT_LIME,
              color: "#111",
              fontSize: 13,
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
