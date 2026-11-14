/**
 * 图片节点右键「图片属性」弹窗（2026-11-14）。
 *
 * ⚠️ 分辨率必须读图片本身的 naturalWidth/naturalHeight：
 *    节点上的 imgW/imgH 是画布显示尺寸，缩放过就不再是原始分辨率。
 *    portal 到 body，避免被画布容器的层叠上下文裁掉。
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { resolveAssetProperties, type AssetProperties } from "@/lib/asset-node-properties";

export interface AssetPropertiesTarget {
  nodeId: string;
  data: Record<string, unknown>;
}

export function AssetPropertiesDialog({
  target,
  isDark,
  onClose,
}: {
  target: AssetPropertiesTarget;
  isDark: boolean;
  onClose: () => void;
}) {
  const [imageSize, setImageSize] = useState<{ naturalWidth: number; naturalHeight: number } | null>(null);
  const src = typeof target.data.localSrc === "string" ? target.data.localSrc : "";

  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.onload = () =>
      setImageSize({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.src = src;
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const props: AssetProperties = resolveAssetProperties(target.data, imageSize || undefined);
  const rows = [
    { label: "分辨率", value: props.resolution },
    { label: "格式", value: props.format },
    { label: "时间", value: props.createdAt },
    { label: "图片来源", value: props.sourceLabel },
  ];
  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const text = isDark ? "#eeeeee" : "#262627";
  const sub = isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)";
  const sourceColor =
    props.source === "ai"
      ? "#7c5cff"
      : props.source === "upload"
        ? "#2f9e6b"
        : props.source === "web"
          ? "#3b82f6"
          : "#999999";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,24,0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={onClose}
    >
      <section
        data-artx-asset-properties=""
        className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <h2 className="text-sm font-semibold">图片属性</h2>
          <button type="button" onClick={onClose} aria-label="关闭图片属性" className="rounded-full p-1.5" style={{ color: sub }}>
            <X size={16} />
          </button>
        </header>

        {src ? (
          <div className="flex justify-center px-5 pt-5">
            <img src={src} alt="节点图片预览" className="max-h-[180px] max-w-full rounded-md object-contain" />
          </div>
        ) : null}

        <dl className="px-5 py-5">
          {rows.map(row => (
            <div key={row.label} className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
              <dt className="shrink-0 text-xs" style={{ color: sub }}>{row.label}</dt>
              <dd
                className="text-right text-xs font-medium"
                style={row.label === "图片来源" ? { color: sourceColor } : undefined}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="px-5 pb-5 text-[11px] leading-5" style={{ color: sub }}>
          分辨率取自图片原始像素；来源按节点真实记录判定，历史图片若无记录会显示「未记录」。
        </p>
      </section>
    </div>,
    document.body,
  );
}
