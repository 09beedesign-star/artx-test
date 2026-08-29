import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, RotateCcw } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

type AnnotationMaskPreviewDialogProps = {
  imageSrc: string;
  onCancel: () => void;
  /** 确认后回传蒙版：透明 = 编辑区（AI 重绘），黑色 = 保留区 */
  onConfirm: (maskSrc: string) => void;
};

const BRUSH_MIN = 16;
const BRUSH_MAX = 160;
const BRUSH_DEFAULT = 64;
/** 弹窗内图片的最大显示高度：整图等比缩放后完整可见，超出时可滚动 */
const IMAGE_MAX_HEIGHT = "60vh";

/**
 * 「AI 修改」重绘区域涂抹弹窗（PS 式笔刷）：
 * - 按住鼠标在图上涂抹，白色覆盖 = AI 将重绘的区域
 * - 笔刷 / 橡皮擦 切换，可调笔刷大小，可一键清除
 * - 蒙版语义与后端一致：透明 = 编辑区，黑色 = 保留区
 */
export function AnnotationMaskPreviewDialog({
  imageSrc,
  onCancel,
  onConfirm,
}: AnnotationMaskPreviewDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState("");
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);

  /** 把蒙版（黑=保留，透明=编辑）渲染成白色高亮覆盖层 */
  const renderOverlay = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const overlay = overlayRef.current;
    if (!maskCanvas || !overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = maskCanvas;
    overlay.width = w;
    overlay.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  /**
   * 重置蒙版为全黑（全部保留）。
   * 不再预涂默认重绘圆：自动识别的位置经常不准，反而干扰用户，交给用户自己涂抹。
   */
  const resetMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    renderOverlay();
  }, [renderOverlay]);

  // 图片加载完成后初始化蒙版
  // 第一步：图片加载完成后记录原始尺寸（此时蒙版画布尚未渲染）
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const w = Math.max(1, image.naturalWidth || image.width || 1024);
      const h = Math.max(1, image.naturalHeight || image.height || 1024);
      setDimensions({ w, h });
    };
    image.src = imageSrc;
  }, [imageSrc]);

  // 第二步：蒙版画布随 dimensions 渲染完成后，再初始化蒙版内容
  useEffect(() => {
    if (!dimensions) return;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    maskCanvas.width = dimensions.w;
    maskCanvas.height = dimensions.h;
    resetMask();
  }, [dimensions, resetMask]);

  /** 在鼠标位置画一笔（笔刷=擦成透明编辑区，橡皮=涂黑恢复保留区） */
  const paintAt = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const maskCanvas = maskCanvasRef.current;
      const rect = e.currentTarget.getBoundingClientRect();
      if (!maskCanvas || rect.width === 0 || rect.height === 0) return;
      const ctx = maskCanvas.getContext("2d");
      if (!ctx) return;
      const scaleX = maskCanvas.width / rect.width;
      const scaleY = maskCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const r = (brushSize / 2) * Math.max(scaleX, scaleY);
      ctx.save();
      ctx.globalCompositeOperation =
        tool === "brush" ? "destination-out" : "source-over";
      ctx.fillStyle = "black";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      renderOverlay();
    },
    [brushSize, tool, renderOverlay]
  );

  const handleConfirm = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) return;
    // 校验蒙版中存在编辑像素（透明区），避免"无重绘区域"白跑一次
    const { data } = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    let hasEditPixels = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) {
        hasEditPixels = true;
        break;
      }
    }
    if (!hasEditPixels) {
      setError("请先涂抹出要重绘的区域，再用笔刷在图上画一下");
      return;
    }
    onConfirm(maskCanvas.toDataURL("image/png"));
  };

  const bg = isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)";
  const text = isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.71 0.010 270)" : "oklch(0.65 0.010 255)";
  const accent = "oklch(0.58 0.22 290)";

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
            涂抹重绘区域
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
          className="rounded-[var(--radius-md-design)] text-center"
          style={{
            border: `1px solid ${border}`,
            maxHeight: IMAGE_MAX_HEIGHT,
            overflow: "auto",
            background: isDark ? "oklch(0 0 0 / 0.25)" : "oklch(0 0 0 / 0.04)",
          }}
        >
          {/*
            inline-block 包裹层让容器尺寸严格贴合图片显示尺寸：
            蒙版 canvas 用 absolute inset-0 覆盖时才能和图片像素一一对应，
            否则 paintAt 里的 scaleX/scaleY 会算错，导致涂抹位置偏移。
          */}
          <div className="relative inline-block max-w-full align-top">
            <img
              src={imageSrc}
              alt=""
              className="block align-top"
              style={{ maxHeight: IMAGE_MAX_HEIGHT, maxWidth: "100%", width: "auto", height: "auto" }}
              draggable={false}
            />
            {dimensions && (
              <>
                <canvas
                  ref={overlayRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                <canvas
                  ref={maskCanvasRef}
                  className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                  style={{ opacity: 0 }}
                  onPointerDown={e => {
                    paintingRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    paintAt(e);
                  }}
                  onPointerMove={e => {
                    if (paintingRef.current) paintAt(e);
                  }}
                  onPointerUp={() => {
                    paintingRef.current = false;
                  }}
                  onPointerCancel={() => {
                    paintingRef.current = false;
                  }}
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{
              background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.05)",
              border: `1px solid ${border}`,
            }}
          >
            <button
              type="button"
              onClick={() => setTool("brush")}
              className="type-caption flex h-7 items-center gap-1.5 rounded-md px-2.5 transition-colors"
              style={
                tool === "brush"
                  ? { background: accent, color: "white" }
                  : { color: text }
              }
            >
              <Brush size={14} />
              笔刷
            </button>
            <button
              type="button"
              onClick={() => setTool("eraser")}
              className="type-caption flex h-7 items-center gap-1.5 rounded-md px-2.5 transition-colors"
              style={
                tool === "eraser"
                  ? { background: accent, color: "white" }
                  : { color: text }
              }
            >
              <Eraser size={14} />
              橡皮
            </button>
          </div>

          <div className="flex min-w-[180px] flex-1 items-center gap-2">
            <span className="type-caption shrink-0" style={{ color: sub, fontSize: 11 }}>
              笔刷大小
            </span>
            <input
              type="range"
              min={BRUSH_MIN}
              max={BRUSH_MAX}
              step={2}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
              style={{ accentColor: accent }}
            />
            <span
              className="type-caption w-10 shrink-0 text-right"
              style={{ color: text, fontSize: 11 }}
            >
              {brushSize}px
            </span>
          </div>

          <button
            type="button"
            onClick={() => resetMask()}
            className="type-caption flex h-8 items-center gap-1.5 rounded-md px-2.5 transition-opacity hover:opacity-85"
            style={{ color: sub, border: `1px solid ${border}` }}
          >
            <RotateCcw size={13} />
            清除
          </button>
        </div>

        <p
          className="type-caption mt-2"
          style={{ color: sub, fontSize: 11, lineHeight: 1.6 }}
        >
          白色 = 重绘区域（AI 只修改白色覆盖处）。按住鼠标涂抹覆盖想修改的物体，橡皮擦可恢复涂错的部分。
          <span style={{ color: text }}>尽量避开眉毛、眼睛、脸</span>
          ，白色之外的内容 AI 不会改动。
        </p>
        {error && (
          <p className="type-caption mt-1" style={{ color: "oklch(0.6 0.2 25)" }}>
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="type-caption h-9 min-w-[88px] rounded-[var(--radius-md-design)] transition-opacity hover:opacity-85"
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
            onClick={handleConfirm}
            disabled={!dimensions}
            className="type-caption h-9 min-w-[112px] rounded-[var(--radius-md-design)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
