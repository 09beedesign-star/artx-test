/**
 * CropEditor — Modal-based interactive image cropper.
 * Replaces the old CSS cropX/Y/W/H approach with Cropper.js.
 */
import { useRef, useCallback, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Cropper, { type ReactCropperElement } from "react-cropper";
import { X, Download, Check, RotateCw } from "lucide-react";
import "cropperjs/dist/cropper.css";

export interface CropEditorProps {
  imageSrc: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string, size: { width: number; height: number; naturalWidth: number; naturalHeight: number }) => void;
  isDark?: boolean;
}

const ASPECT_RATIOS = [
  { label: "自由", value: NaN },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:4", value: 3 / 4 },
  { label: "9:16", value: 9 / 16 },
] as const;

export default function CropEditor({
  imageSrc,
  isOpen,
  onClose,
  onConfirm,
  isDark = true,
}: CropEditorProps) {
  const cropperRef = useRef<ReactCropperElement>(null);

  const surface = isDark ? "oklch(0.11 0.015 270)" : "var(--design-surface-soft)";
  const textPri = isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.018 255)";
  const textSec = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.50 0.012 255)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 0.04)";
  const accent = "oklch(0.58 0.22 290)";
  const accent2 = "oklch(0.72 0.18 200)";
  const bg = isDark ? "#0e0e1a" : "#fafafa";

  useEffect(() => {
    if (!isOpen && cropperRef.current) {
      cropperRef.current.cropper?.destroy();
    }
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    if (!canvas) return;
    const imageData = cropper.getImageData();
    onConfirm(canvas.toDataURL("image/png"), {
      width: canvas.width,
      height: canvas.height,
      naturalWidth: imageData.naturalWidth || canvas.width,
      naturalHeight: imageData.naturalHeight || canvas.height,
    });
  }, [onConfirm]);

  const handleDownload = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    cropper.getCroppedCanvas().toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cropped-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, []);

  const rotate = useCallback((deg: number) => {
    cropperRef.current?.cropper?.rotate(deg);
  }, []);

  const setAspect = useCallback((ratio: number) => {
    cropperRef.current?.cropper?.setAspectRatio(ratio);
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: isDark ? "oklch(0 0 0 / 0.72)" : "oklch(0 0 0 / 0.48)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        animation: "fadeIn 150ms ease-out",
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: 52,
          background: surface,
          borderBottom: `1px solid ${isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 8%)"}`,
          flexShrink: 0,
        }}
      >
        <span style={{ color: textPri, fontSize: 13, fontWeight: 500 }}>图片裁剪</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", gap: 2, background: isDark ? "oklch(1 0 0 / 4%)" : "oklch(0 0 0 / 0.03)", borderRadius: 8, padding: 2 }}>
            {ASPECT_RATIOS.map(({ label, value }) => (
              <button
                key={label}
                type="button"
                onClick={() => setAspect(value)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  color: textSec,
                  fontSize: 11,
                  fontWeight: 400,
                  background: "transparent",
                  cursor: "pointer",
                  transition: "all 120ms",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = hoverBg;
                  event.currentTarget.style.color = textPri;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = "transparent";
                  event.currentTarget.style.color = textSec;
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => rotate(-90)} title="左旋 90°" style={iconBtnStyle(textSec)}>
            <RotateCw size={15} style={{ transform: "scaleX(-1)" }} />
          </button>
          <button type="button" onClick={() => rotate(90)} title="右旋 90°" style={iconBtnStyle(textSec)}>
            <RotateCw size={15} />
          </button>
          <button type="button" onClick={handleDownload} title="下载" style={iconBtnStyle(textSec)}>
            <Download size={15} />
          </button>
          <button type="button" onClick={onClose} title="关闭" style={iconBtnStyle(textSec)}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          minHeight: 0,
          background: bg,
        }}
      >
        <div style={{ width: "90%", height: "calc(100vh - 160px)", maxWidth: 1280 }}>
          <Cropper
            ref={cropperRef}
            src={imageSrc}
            style={{ height: "100%", width: "100%" }}
            viewMode={1}
            dragMode="move"
            guides
            center
            highlight
            background={false}
            autoCropArea={0.9}
            responsive
            restore
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "12px 16px",
          background: surface,
          borderTop: `1px solid ${isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 8%)"}`,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
            background: isDark ? "oklch(1 0 0 / 5%)" : hoverBg,
            color: textPri,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 24px",
            borderRadius: 8,
            border: "none",
            background: `linear-gradient(135deg, ${accent}, ${accent2})`,
            color: "white",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 150ms",
            boxShadow: `0 8px 24px ${accent}44`,
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.transform = "scale(1.02)";
            event.currentTarget.style.boxShadow = `0 12px 32px ${accent}66`;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.transform = "scale(1)";
            event.currentTarget.style.boxShadow = `0 8px 24px ${accent}44`;
          }}
          onMouseDown={(event) => { event.currentTarget.style.transform = "scale(0.97)"; }}
          onMouseUp={(event) => { event.currentTarget.style.transform = "scale(1.02)"; }}
        >
          <Check size={15} />
          确认裁剪
        </button>
      </div>
    </div>,
    document.body
  );
}

function iconBtnStyle(color: string): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color,
    cursor: "pointer",
    transition: "all 120ms",
  };
}
