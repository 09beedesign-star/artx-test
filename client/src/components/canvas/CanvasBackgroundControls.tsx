/**
 * 画布辅助底纹 + 网格吸附（2026-11-14 用户要求）。
 *
 * 三种底纹：点阵 / 棋盘格 / 轴测网格线；每种底纹的透明度各自记忆；
 * 顶部命令栏旁的磁铁按钮控制「拖动结束吸附到网格顶点」。
 *
 * ⚠️ 底纹层用 useViewport 把 backgroundSize / backgroundPosition 绑到
 *    viewport，缩放平移时才会跟着画布走；纯 CSS 固定背景会「粘在屏幕上」。
 */
import { useEffect, useRef, useState } from "react";
import { useViewport } from "@xyflow/react";
import { Check, LayoutGrid, Magnet } from "lucide-react";
import {
  CANVAS_BACKGROUND_PATTERNS,
  CANVAS_GRID_SIZE,
  clampOpacity,
  type CanvasBackgroundPattern,
  type CanvasBackgroundPreference,
} from "@/lib/canvas-background-preference";

const TILE: Record<CanvasBackgroundPattern, { w: number; h: number }> = {
  dots: { w: 24, h: 24 },
  checker: { w: 24, h: 24 },
  isometric: { w: 32, h: 18.5 },
};

/** 纯函数：生成可平铺的 SVG 图案 data URL（便于单测断言三种都不同）。 */
export function canvasPatternImage(pattern: CanvasBackgroundPattern, color: string): string {
  const { w, h } = TILE[pattern];
  let body: string;
  if (pattern === "checker") {
    body = `<rect width="12" height="12" fill="${color}" opacity="0.55"/><rect x="12" y="12" width="12" height="12" fill="${color}" opacity="0.55"/>`;
  } else if (pattern === "isometric") {
    body = `<path d="M0 9.25 L16 0 L32 9.25 L16 18.5 Z" fill="none" stroke="${color}" stroke-width="0.7"/>`;
  } else {
    body = `<circle cx="1.5" cy="1.5" r="1.5" fill="${color}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function CanvasBackgroundLayer({
  pref,
  isDark,
}: {
  pref: CanvasBackgroundPreference;
  isDark: boolean;
}) {
  const { x, y, zoom } = useViewport();
  const color = isDark ? "rgba(255,255,255,0.20)" : "rgba(20,20,36,0.22)";
  const tile = TILE[pref.pattern];
  const opacity = clampOpacity(pref.opacity[pref.pattern], 1);
  return (
    <div
      data-artx-canvas-background={pref.pattern}
      className="react-flow__background"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        backgroundImage: canvasPatternImage(pref.pattern, color),
        backgroundSize: `${tile.w * zoom}px ${tile.h * zoom}px`,
        backgroundPosition: `${x}px ${y}px`,
        opacity,
      }}
    />
  );
}

export function CanvasBackgroundControls({
  isDark,
  pref,
  onChange,
}: {
  isDark: boolean;
  pref: CanvasBackgroundPreference;
  onChange: (next: CanvasBackgroundPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeColor = isDark ? "#ffffff" : "#161616";
  const idleColor = isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.55)";
  const activeBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const popBg = isDark ? "rgba(26,26,26,0.97)" : "rgba(255,255,255,0.98)";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const currentOpacity = pref.opacity[pref.pattern];

  return (
    <div ref={wrapRef} className="relative flex items-center" style={{ marginLeft: 4 }}>
      <span className="mx-1 h-5 w-px" style={{ background: border }} />
      <button
        type="button"
        data-artx-canvas-snap=""
        aria-label="吸附网格顶点"
        aria-pressed={pref.snapEnabled}
        title={`吸附网格顶点（${pref.snapEnabled ? "已开启" : "已关闭"}，间距 ${CANVAS_GRID_SIZE}px）`}
        onClick={() => onChange({ ...pref, snapEnabled: !pref.snapEnabled })}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-95"
        style={{ color: pref.snapEnabled ? activeColor : idleColor, background: pref.snapEnabled ? activeBg : "transparent" }}
      >
        <Magnet size={17} />
      </button>
      <button
        type="button"
        data-artx-canvas-background-toggle=""
        aria-label="画布底纹设置"
        aria-expanded={open}
        title="画布底纹与透明度"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md-design)] transition-all active:scale-95"
        style={{ color: open ? activeColor : idleColor, background: open ? activeBg : "transparent" }}
      >
        <LayoutGrid size={17} />
      </button>

      {open && (
        <div
          data-artx-canvas-background-panel=""
          className="absolute right-0 top-full mt-2 rounded-[var(--radius-lg-design)] p-3 shadow-2xl"
          style={{ background: popBg, border: `1px solid ${border}`, backdropFilter: "blur(18px)", width: 232, zIndex: 30 }}
        >
          <p className="mb-2 text-[10px]" style={{ color: idleColor, letterSpacing: "0.04em" }}>画布底纹</p>
          <div className="flex gap-1.5">
            {CANVAS_BACKGROUND_PATTERNS.map(item => (
              <button
                key={item.id}
                type="button"
                data-artx-canvas-pattern={item.id}
                aria-pressed={pref.pattern === item.id}
                onClick={() => onChange({ ...pref, pattern: item.id })}
                className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-md-design)] px-1 py-2 text-[11px] transition-colors"
                style={{
                  color: pref.pattern === item.id ? "#ffffff" : activeColor,
                  background: pref.pattern === item.id ? "#161616" : "transparent",
                  border: `1px solid ${border}`,
                }}
              >
                {pref.pattern === item.id && <Check size={11} />}
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px]" style={{ color: idleColor }}>底纹透明度</span>
            <span data-artx-canvas-opacity-value="" className="text-[11px] font-semibold" style={{ color: activeColor }}>
              {Math.round(currentOpacity * 100)}%
            </span>
          </div>
          <input
            data-artx-canvas-opacity=""
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={currentOpacity}
            aria-label="底纹透明度"
            onChange={e =>
              onChange({
                ...pref,
                opacity: { ...pref.opacity, [pref.pattern]: clampOpacity(e.target.value, currentOpacity) },
              })
            }
            className="mt-1.5 w-full"
            style={{ accentColor: isDark ? "#ffffff" : "#161616" }}
          />
          <p className="mt-2 text-[10px] leading-4" style={{ color: idleColor }}>
            每种底纹单独记忆透明度；磁铁开启后，拖动结束自动对齐到 {CANVAS_GRID_SIZE}px 网格顶点。
          </p>
        </div>
      )}
    </div>
  );
}
