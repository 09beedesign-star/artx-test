/**
 * 新手引导引擎 —— 黑色蒙层挖孔 + 气泡弹窗
 *
 * 设计要点（均对应本项目既有踩坑）：
 *  1. 内容全部来自 `@shared/onboarding-steps`，本文件不硬编码任何文案。
 *  2. 挖孔用「四块遮罩拼接」而非 box-shadow，保证挖孔区域真实透明、
 *     且蒙层本身可拦截点击（interactive 步骤除外）。
 *  3. z-index 取 2147483600，压过路由 loading(2147483000) 与所有既有弹窗(10000+)。
 *  4. 锚点可能异步出现 → 轮询等待 waitMs，超时按 skipIfMissing 决定跳过或降级居中。
 *  5. 目标元素位置随滚动/resize 变化 → rAF 跟踪 + ResizeObserver。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  findTourTarget,
  type TourPlacement,
  type TourSegment,
  type TourStep,
} from "@shared/onboarding-steps";

const TOUR_Z_INDEX = 2147483600;
const MASK_COLOR = "rgba(0, 0, 0, 0.72)";
const ACCENT = "#936CFF";
const BUBBLE_WIDTH = 340;
const BUBBLE_GAP = 14;
const VIEWPORT_MARGIN = 16;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

interface BubblePos {
  top: number;
  left: number;
  /** 箭头相对气泡的方位，以及在该边上的偏移量 */
  arrow: { side: TourPlacement; offset: number } | null;
}

export interface OnboardingTourProps {
  segment: TourSegment;
  open: boolean;
  /** 走完最后一步 */
  onFinish: () => void;
  /** 用户主动跳过（Esc / 右上角 X / 跳过按钮） */
  onSkip: () => void;
  /** 点了「不再提示」 */
  onDismissAll?: () => void;
}

/* ────────────────────────── 工具函数 ────────────────────────── */

function readRect(el: HTMLElement, step: TourStep): Rect {
  const box = el.getBoundingClientRect();
  const padding = step.padding ?? 8;
  let radius = step.radius ?? 0;
  if (step.radius === undefined) {
    const computed = window.getComputedStyle(el).borderRadius;
    const parsed = Number.parseFloat(computed);
    radius = Number.isFinite(parsed) ? parsed : 0;
  }
  return {
    top: Math.max(0, box.top - padding),
    left: Math.max(0, box.left - padding),
    width: box.width + padding * 2,
    height: box.height + padding * 2,
    radius: radius + (step.radius === undefined ? Math.min(padding, 8) : 0),
  };
}

/** 自动选择气泡方位：挑四周可用空间最大的一侧 */
function pickPlacement(rect: Rect, preferred: TourPlacement): Exclude<TourPlacement, "auto"> {
  if (preferred !== "auto") {
    if (fits(rect, preferred)) return preferred;
  }
  const candidates: Exclude<TourPlacement, "auto">[] = ["bottom", "top", "right", "left"];
  const ordered = preferred === "auto" ? candidates : [preferred as Exclude<TourPlacement, "auto">, ...candidates];
  for (const side of ordered) {
    if (fits(rect, side)) return side;
  }
  // 都放不下时选空间最大的一侧
  const spaces: Record<Exclude<TourPlacement, "auto">, number> = {
    top: rect.top,
    bottom: window.innerHeight - (rect.top + rect.height),
    left: rect.left,
    right: window.innerWidth - (rect.left + rect.width),
  };
  return (Object.keys(spaces) as Exclude<TourPlacement, "auto">[]).reduce((best, key) =>
    spaces[key] > spaces[best] ? key : best,
  "bottom");
}

function fits(rect: Rect, side: Exclude<TourPlacement, "auto"> | TourPlacement): boolean {
  const needV = 190 + BUBBLE_GAP;
  const needH = BUBBLE_WIDTH + BUBBLE_GAP;
  if (side === "bottom") return window.innerHeight - (rect.top + rect.height) >= needV;
  if (side === "top") return rect.top >= needV;
  if (side === "right") return window.innerWidth - (rect.left + rect.width) >= needH;
  if (side === "left") return rect.left >= needH;
  return false;
}

function computeBubblePos(
  rect: Rect | null,
  bubbleSize: { width: number; height: number },
  preferred: TourPlacement,
): BubblePos {
  // 无锚点 → 屏幕居中
  if (!rect) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (window.innerHeight - bubbleSize.height) / 2),
      left: Math.max(VIEWPORT_MARGIN, (window.innerWidth - bubbleSize.width) / 2),
      arrow: null,
    };
  }

  const side = pickPlacement(rect, preferred);
  let top = 0;
  let left = 0;

  if (side === "bottom") {
    top = rect.top + rect.height + BUBBLE_GAP;
    left = rect.left + rect.width / 2 - bubbleSize.width / 2;
  } else if (side === "top") {
    top = rect.top - bubbleSize.height - BUBBLE_GAP;
    left = rect.left + rect.width / 2 - bubbleSize.width / 2;
  } else if (side === "right") {
    top = rect.top + rect.height / 2 - bubbleSize.height / 2;
    left = rect.left + rect.width + BUBBLE_GAP;
  } else {
    top = rect.top + rect.height / 2 - bubbleSize.height / 2;
    left = rect.left - bubbleSize.width - BUBBLE_GAP;
  }

  // 夹回视口
  const clampedLeft = Math.min(
    Math.max(VIEWPORT_MARGIN, left),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - bubbleSize.width - VIEWPORT_MARGIN),
  );
  const clampedTop = Math.min(
    Math.max(VIEWPORT_MARGIN, top),
    Math.max(VIEWPORT_MARGIN, window.innerHeight - bubbleSize.height - VIEWPORT_MARGIN),
  );

  // 箭头需要跟着被夹回的量走，才能继续指向目标中心
  const arrowSide: TourPlacement =
    side === "bottom" ? "top" : side === "top" ? "bottom" : side === "right" ? "left" : "right";
  let offset: number;
  if (side === "top" || side === "bottom") {
    offset = rect.left + rect.width / 2 - clampedLeft;
    offset = Math.min(Math.max(18, offset), bubbleSize.width - 18);
  } else {
    offset = rect.top + rect.height / 2 - clampedTop;
    offset = Math.min(Math.max(18, offset), bubbleSize.height - 18);
  }

  return { top: clampedTop, left: clampedLeft, arrow: { side: arrowSide, offset } };
}

/* ────────────────────────── 主组件 ────────────────────────── */

export default function OnboardingTour({
  segment,
  open,
  onFinish,
  onSkip,
  onDismissAll,
}: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const [bubbleSize, setBubbleSize] = useState({ width: BUBBLE_WIDTH, height: 200 });
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const steps = segment.steps;
  const step = steps[index] as TourStep | undefined;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  /* 分段切换时重置 */
  useEffect(() => {
    if (open) {
      setIndex(0);
      setReady(false);
    }
  }, [open, segment.id]);

  /* 锁滚动，防止蒙层与页面错位 */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const goNext = useCallback(() => {
    setIndex((current) => {
      if (current >= steps.length - 1) {
        onFinish();
        return current;
      }
      setReady(false);
      return current + 1;
    });
  }, [steps.length, onFinish]);

  const goPrev = useCallback(() => {
    setIndex((current) => {
      if (current <= 0) return current;
      setReady(false);
      return current - 1;
    });
  }, []);

  /* 键盘：Esc 跳过，← → 翻页 */
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, goNext, goPrev, onSkip]);

  /* 定位目标元素：轮询等待异步渲染，然后 rAF 持续跟踪 */
  useEffect(() => {
    if (!open || !step) return;

    let cancelled = false;
    const startedAt = performance.now();
    const waitMs = step.waitMs ?? 4000;
    const skipIfMissing = step.skipIfMissing ?? true;

    // 无锚点步骤 → 直接居中
    if (!step.anchor) {
      setRect(null);
      setReady(true);
      return;
    }

    const track = () => {
      if (cancelled) return;
      const el = findTourTarget(step.anchor as NonNullable<TourStep["anchor"]>);
      if (el) {
        const box = el.getBoundingClientRect();
        const visible = box.width > 0 && box.height > 0;
        if (visible) {
          if (!ready) {
            // 首次找到：若元素在视口外，先滚动到可视区
            const inView =
              box.top >= 0 && box.bottom <= window.innerHeight;
            if (!inView) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            setReady(true);
          }
          setRect(readRect(el, step));
          rafRef.current = requestAnimationFrame(track);
          return;
        }
      }

      // 还没出现
      if (performance.now() - startedAt < waitMs) {
        rafRef.current = requestAnimationFrame(track);
        return;
      }

      // 超时
      if (skipIfMissing) {
        // 静默跳过该步（最后一步则结束）
        if (index >= steps.length - 1) {
          onFinish();
        } else {
          setIndex((c) => c + 1);
          setReady(false);
        }
      } else {
        setRect(null);
        setReady(true);
      }
    };

    rafRef.current = requestAnimationFrame(track);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // ready 刻意不入依赖：它只用于「首次滚动」的一次性判断
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, index, steps.length, onFinish]);

  /* 测量气泡尺寸 */
  useLayoutEffect(() => {
    if (!open || !bubbleRef.current) return;
    const el = bubbleRef.current;
    const measure = () => {
      const box = el.getBoundingClientRect();
      setBubbleSize((prev) =>
        Math.abs(prev.height - box.height) > 1 || Math.abs(prev.width - box.width) > 1
          ? { width: box.width, height: box.height }
          : prev,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, index, ready]);

  const bubblePos = useMemo(
    () => computeBubblePos(rect, bubbleSize, step?.placement ?? "auto"),
    [rect, bubbleSize, step?.placement],
  );

  if (!open || !step) return null;
  if (typeof document === "undefined") return null;

  const interactive = step.interactive ?? false;

  /* 四块遮罩：上 / 下 / 左 / 右，中间留空即为挖孔 */
  const maskPieces: React.CSSProperties[] = rect
    ? [
        { top: 0, left: 0, width: "100vw", height: Math.max(0, rect.top) },
        {
          top: rect.top + rect.height,
          left: 0,
          width: "100vw",
          height: Math.max(0, window.innerHeight - rect.top - rect.height),
        },
        { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
        {
          top: rect.top,
          left: rect.left + rect.width,
          width: Math.max(0, window.innerWidth - rect.left - rect.width),
          height: rect.height,
        },
      ]
    : [{ top: 0, left: 0, width: "100vw", height: "100vh" }];

  const content = (
    <div
      data-artx-onboarding-root=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: TOUR_Z_INDEX,
        pointerEvents: "none",
      }}
      aria-live="polite"
    >
      {/* ── 黑色蒙层（四块拼接，中间挖孔） ── */}
      {maskPieces.map((piece, i) => (
        <div
          key={i}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            background: MASK_COLOR,
            pointerEvents: "auto",
            transition: "opacity 180ms ease",
            opacity: ready ? 1 : 0,
            ...piece,
          }}
        />
      ))}

      {/* ── 高亮框（描边 + 呼吸光晕），不遮挡内容 ── */}
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: rect.radius,
            border: `1.5px solid ${ACCENT}`,
            boxShadow: `0 0 0 3px rgba(147,108,255,0.22), 0 0 22px rgba(147,108,255,0.35)`,
            pointerEvents: interactive ? "none" : "auto",
            transition: "all 260ms cubic-bezier(0.22, 1, 0.36, 1)",
            opacity: ready ? 1 : 0,
          }}
          onClick={(e) => {
            if (!interactive) e.stopPropagation();
          }}
        />
      )}

      {/* ── 气泡弹窗 ── */}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-label={`${segment.label}引导 第 ${index + 1} 步，共 ${steps.length} 步`}
        style={{
          position: "fixed",
          top: bubblePos.top,
          left: bubblePos.left,
          width: BUBBLE_WIDTH,
          maxWidth: "calc(100vw - 32px)",
          background: "#1A1A1C",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
          padding: "16px 16px 13px",
          pointerEvents: "auto",
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0) scale(1)" : "translateY(6px) scale(0.98)",
          transition: "opacity 200ms ease, transform 240ms cubic-bezier(0.22,1,0.36,1), top 260ms cubic-bezier(0.22,1,0.36,1), left 260ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* 箭头 */}
        {bubblePos.arrow && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              width: 10,
              height: 10,
              background: "#1A1A1C",
              borderLeft: "1px solid rgba(255,255,255,0.10)",
              borderTop: "1px solid rgba(255,255,255,0.10)",
              ...(bubblePos.arrow.side === "top"
                ? { top: -6, left: bubblePos.arrow.offset - 5, transform: "rotate(45deg)" }
                : bubblePos.arrow.side === "bottom"
                ? { bottom: -6, left: bubblePos.arrow.offset - 5, transform: "rotate(225deg)" }
                : bubblePos.arrow.side === "left"
                ? { left: -6, top: bubblePos.arrow.offset - 5, transform: "rotate(-45deg)" }
                : { right: -6, top: bubblePos.arrow.offset - 5, transform: "rotate(135deg)" }),
            }}
          />
        )}

        {/* 顶部：分段标签 + 关闭 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.3,
              color: ACCENT,
              background: "rgba(147,108,255,0.12)",
              border: "1px solid rgba(147,108,255,0.25)",
              borderRadius: 5,
              padding: "2px 7px",
            }}
          >
            {segment.label}
          </span>
          <button
            type="button"
            onClick={onSkip}
            aria-label="关闭引导"
            style={{
              display: "flex",
              height: 22,
              width: 22,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 5,
              color: "rgba(255,255,255,0.45)",
              background: "transparent",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              e.currentTarget.style.color = "rgba(255,255,255,0.85)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.45)";
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* 正文 */}
        <h3 style={{ fontSize: 15, fontWeight: 640, color: "#F5F5F7", lineHeight: 1.4, marginBottom: 7 }}>
          {step.title}
        </h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.72, color: "rgba(255,255,255,0.62)", whiteSpace: "pre-wrap" }}>
          {step.body}
        </p>

        {/* 底部：进度点 + 操作 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {steps.map((s, i) => (
              <span
                key={s.id}
                style={{
                  height: 5,
                  borderRadius: 3,
                  width: i === index ? 16 : 5,
                  background: i === index ? ACCENT : "rgba(255,255,255,0.20)",
                  transition: "all 220ms ease",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!isFirst && (
              <button
                type="button"
                onClick={goPrev}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  height: 28,
                  padding: "0 9px",
                  borderRadius: 7,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.60)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <ChevronLeft size={12} />
                上一步
              </button>
            )}
            <button
              type="button"
              onClick={isLast ? onFinish : goNext}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                height: 28,
                padding: "0 12px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: ACCENT,
                boxShadow: "0 4px 14px rgba(147,108,255,0.35)",
              }}
            >
              {isLast ? "开始使用" : "下一步"}
              {!isLast && <ChevronRight size={12} />}
            </button>
          </div>
        </div>

        {/* 「不再提示」入口 */}
        {onDismissAll && (
          <button
            type="button"
            onClick={onDismissAll}
            style={{
              marginTop: 9,
              fontSize: 11,
              color: "rgba(255,255,255,0.30)",
              background: "transparent",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            不再显示新手引导
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
