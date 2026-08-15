import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

type AnnotationMaskBuildResult = {
  maskSrc: string;
  width: number;
  height: number;
};

type AnnotationMaskPreviewDialogProps = {
  imageSrc: string;
  /** 构建指定缩放比例的重绘蒙版（透明=编辑区，黑=保留区） */
  buildMask: (scale: number) => Promise<AnnotationMaskBuildResult>;
  onCancel: () => void;
  onConfirm: (maskSrc: string) => void;
};

const MASK_SCALE_MIN = 0.6;
const MASK_SCALE_MAX = 1.6;
const MASK_SCALE_STEP = 0.05;

/**
 * 「AI 修改」重绘区域预览弹窗：
 * - 原图上叠加白色重绘区（所见即所得，白色=美图将重绘的区域）
 * - 滑块实时缩放重绘区域（60%–160%），让用户肉眼确认覆盖目标物体且避开眉/眼/脸
 */
export function AnnotationMaskPreviewDialog({
  imageSrc,
  buildMask,
  onCancel,
  onConfirm,
}: AnnotationMaskPreviewDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [scale, setScale] = useState(1);
  const [maskSrc, setMaskSrc] = useState<string>("");
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [building, setBuilding] = useState(true);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const buildVersionRef = useRef(0);

  // 构建蒙版（防抖：滑块连续拖动时避免高频重建）
  useEffect(() => {
    setBuilding(true);
    setError("");
    const version = ++buildVersionRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await buildMask(scale);
        if (buildVersionRef.current !== version) return; // 丢弃过期结果
        setMaskSrc(result.maskSrc);
        setDimensions({ w: result.width, h: result.height });
        setBuilding(false);
      } catch (e) {
        if (buildVersionRef.current !== version) return;
        setError(e instanceof Error ? e.message : "蒙版生成失败");
        setBuilding(false);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [scale, buildMask]);

  // 白色重绘区叠加：半透明白底 → destination-out 用蒙版擦除保留区 → 白色仅留在编辑区
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !maskSrc || !dimensions) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = dimensions;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1; // 擦除必须用满不透明度，否则保留区会残留白色
    ctx.globalCompositeOperation = "destination-out";
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    };
    image.src = maskSrc;
  }, [maskSrc, dimensions]);

  const bg = isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)";
  const text = isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.71 0.010 270)" : "oklch(0.65 0.010 255)";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(10px)",
        zIndex: 7000,
      }}
      onMouseDown={onCancel}
    >
      <div
        className="w-[min(680px,calc(100vw-32px))] rounded-[var(--radius-lg-design)] p-5 shadow-2xl"
        style={{
          background: bg,
          border: `1px solid ${border}`,
          boxShadow: "0 24px 80px oklch(0 0 0 / 0.35)",
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="type-title-sm" style={{ color: text, fontSize: 16, fontWeight: 650 }}>
            重绘区域预览
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="type-caption transition-opacity hover:opacity-80"
            style={{ color: sub }}
          >
            关闭
          </button>
        </div>

        <div
          className="relative overflow-hidden rounded-[var(--radius-md-design)]"
          style={{ border: `1px solid ${border}`, maxHeight: "52vh" }}
        >
          <img src={imageSrc} alt="" className="block h-auto w-full" draggable={false} />
          {dimensions && (
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          )}
          {building && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.35)" }}
            >
              <span className="type-caption" style={{ color: "white" }}>
                正在生成蒙版…
              </span>
            </div>
          )}
        </div>

        <p
          className="type-caption mt-2"
          style={{ color: sub, fontSize: 11, lineHeight: 1.6 }}
        >
          白色 = 重绘区域（AI 只修改白色区域）。拖动滑块确保覆盖目标物体，且
          <span style={{ color: text }}>不碰到眉毛、眼睛、脸</span>。
        </p>
        {error && (
          <p className="type-caption mt-1" style={{ color: "oklch(0.6 0.2 25)" }}>
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <span className="type-caption shrink-0" style={{ color: sub, fontSize: 11 }}>
            重绘区域大小
          </span>
          <input
            type="range"
            min={MASK_SCALE_MIN}
            max={MASK_SCALE_MAX}
            step={MASK_SCALE_STEP}
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
            style={{ accentColor: "oklch(0.58 0.22 290)" }}
          />
          <span
            className="type-caption w-12 shrink-0 text-right"
            style={{ color: text, fontSize: 11 }}
          >
            {Math.round(scale * 100)}%
          </span>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 min-w-[88px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-85"
            style={{
              background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)",
              border: `1px solid ${border}`,
              color: text,
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => maskSrc && onConfirm(maskSrc)}
            disabled={!maskSrc || building}
            className="h-9 min-w-[112px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
              color: "white",
              boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.22)",
            }}
          >
            生成
          </button>
        </div>
      </div>
    </div>
  );
}
