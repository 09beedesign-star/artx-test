/**
 * RotateEditor — modal-based interactive image rotation and flip.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Moveable from "react-moveable";
import { Check, Download, FlipHorizontal, FlipVertical, RotateCcw, RotateCw, X } from "lucide-react";

export interface RotateEditorProps {
  imageSrc: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rotatedDataUrl: string, size: {
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  }) => void;
  isDark?: boolean;
}

const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];

export default function RotateEditor({
  imageSrc,
  isOpen,
  onClose,
  onConfirm,
  isDark = true,
}: RotateEditorProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [rotate, setRotate] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);

  const surface = isDark ? "oklch(0.11 0.015 270)" : "var(--design-surface-soft)";
  const textPri = isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.018 255)";
  const textSec = isDark ? "oklch(0.50 0.01 270)" : "oklch(0.50 0.012 255)";
  const hoverBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 0.04)";
  const accent = "oklch(0.58 0.22 290)";
  const accent2 = "oklch(0.72 0.18 200)";

  useEffect(() => {
    if (!isOpen) return;
    setReady(false);
    setRotate(0);
    setFlipX(false);
    setFlipY(false);
  }, [imageSrc, isOpen]);

  const renderToCanvas = useCallback(() => {
    const img = imageRef.current;
    if (!img) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const normalizedRotate = ((rotate % 360) + 360) % 360;
    const rad = (normalizedRotate * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(rad));
    const absSin = Math.abs(Math.sin(rad));
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    const width = Math.max(1, Math.ceil(naturalWidth * absCos + naturalHeight * absSin));
    const height = Math.max(1, Math.ceil(naturalWidth * absSin + naturalHeight * absCos));

    canvas.width = width;
    canvas.height = height;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(img, -naturalWidth / 2, -naturalHeight / 2, naturalWidth, naturalHeight);

    return { canvas, width, height, naturalWidth, naturalHeight };
  }, [flipX, flipY, rotate]);

  const handleConfirm = useCallback(() => {
    const rendered = renderToCanvas();
    if (!rendered) return;
    onConfirm(rendered.canvas.toDataURL("image/png"), {
      width: rendered.width,
      height: rendered.height,
      naturalWidth: rendered.naturalWidth,
      naturalHeight: rendered.naturalHeight,
    });
  }, [onConfirm, renderToCanvas]);

  const handleDownload = useCallback(() => {
    const rendered = renderToCanvas();
    if (!rendered) return;
    rendered.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `artx-rotated-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [renderToCanvas]);

  const stepRotate = useCallback((deg: number) => {
    setRotate((prev) => (prev + deg + 360) % 360);
  }, []);

  if (!isOpen) return null;

  const transformStyle = `rotate(${rotate}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`;

  return createPortal(
    <div
      className="nodrag nopan"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: isDark ? "oklch(0 0 0 / 0.72)" : "oklch(0 0 0 / 0.48)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        animation: "artxRotateFadeIn 150ms ease-out",
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <style>{`
        @keyframes artxRotateFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        .moveable-rotation-control {
          border: 2px solid oklch(0.72 0.18 200) !important;
          background: oklch(0.58 0.22 290) !important;
        }
        .moveable-rotation-line {
          background: oklch(0.58 0.22 290 / 0.60) !important;
        }
        .moveable-control {
          border-color: oklch(0.72 0.18 200) !important;
        }
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
        <span style={{ color: textPri, fontSize: 13, fontWeight: 500 }}>旋转 & 翻转</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={buttonGroupStyle(isDark)}>
            <button type="button" onClick={() => stepRotate(-90)} title="左旋 90°" style={iconBtnStyle(textSec, hoverBg)}>
              <RotateCcw size={14} />
            </button>
            <button type="button" onClick={() => stepRotate(90)} title="右旋 90°" style={iconBtnStyle(textSec, hoverBg)}>
              <RotateCw size={14} />
            </button>
          </div>
          <div style={buttonGroupStyle(isDark)}>
            <button
              type="button"
              onClick={() => setFlipX((value) => !value)}
              title="水平翻转"
              style={{ ...iconBtnStyle(flipX ? accent : textSec, hoverBg), background: flipX ? `${accent}22` : "transparent" }}
            >
              <FlipHorizontal size={14} />
            </button>
            <button
              type="button"
              onClick={() => setFlipY((value) => !value)}
              title="垂直翻转"
              style={{ ...iconBtnStyle(flipY ? accent : textSec, hoverBg), background: flipY ? `${accent}22` : "transparent" }}
            >
              <FlipVertical size={14} />
            </button>
          </div>
          <span
            style={{
              color: textSec,
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              minWidth: 38,
              textAlign: "center",
            }}
          >
            {Math.round(((rotate % 360) + 360) % 360)}°
          </span>
          <button type="button" onClick={() => setRotate(0)} title="重置角度" style={iconBtnStyle(textSec, hoverBg)}>
            <span style={{ fontSize: 11 }}>0°</span>
          </button>
          <button type="button" onClick={handleDownload} title="下载" style={iconBtnStyle(textSec, hoverBg)}>
            <Download size={15} />
          </button>
          <button type="button" onClick={onClose} title="关闭" style={iconBtnStyle(textSec, hoverBg)}>
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
          padding: 48,
          minHeight: 0,
          position: "relative",
        }}
      >
        <img
          ref={imageRef}
          src={imageSrc}
          alt="旋转预览"
          draggable={false}
          crossOrigin="anonymous"
          onLoad={() => setReady(true)}
          style={{
            maxWidth: "70%",
            maxHeight: "70%",
            objectFit: "contain",
            transform: transformStyle,
            transformOrigin: "center",
            transition: "transform 80ms ease-out",
            borderRadius: 8,
            boxShadow: `0 0 0 1px ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
            userSelect: "none",
          }}
        />
        {ready && imageRef.current && (
          <Moveable
            target={imageRef.current}
            container={document.body}
            rotatable
            draggable={false}
            resizable={false}
            scalable={false}
            origin={false}
            rotationPosition="top"
            rotationHandleOffset={22}
            snappable
            snapRotationDegrees={SNAP_ANGLES}
            throttleRotate={0}
            onRotateStart={(event) => event.set(rotate)}
            onRotate={(event) => setRotate(Math.round(event.rotation % 360))}
            renderDirections={[]}
          />
        )}
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
        <button type="button" onClick={onClose} style={secondaryBtnStyle(isDark, textPri, hoverBg)}>
          取消
        </button>
        <button type="button" onClick={handleConfirm} style={confirmBtnStyle(accent, accent2)}>
          <Check size={15} />
          确认旋转
        </button>
      </div>
    </div>,
    document.body,
  );
}

function buttonGroupStyle(isDark: boolean): CSSProperties {
  return {
    display: "flex",
    gap: 0,
    background: isDark ? "oklch(1 0 0 / 4%)" : "oklch(0 0 0 / 0.03)",
    borderRadius: 8,
    padding: 2,
  };
}

function iconBtnStyle(color: string, hoverBg: string): CSSProperties {
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

function secondaryBtnStyle(isDark: boolean, color: string, hoverBg: string): CSSProperties {
  return {
    padding: "8px 20px",
    borderRadius: 8,
    border: `1px solid ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 8%)"}`,
    background: isDark ? "oklch(1 0 0 / 5%)" : hoverBg,
    color,
    fontSize: 13,
    cursor: "pointer",
  };
}

function confirmBtnStyle(accent: string, accent2: string): CSSProperties {
  return {
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
  };
}
