/**
 * 3D 模型预览弹窗（2026-11-xx）。
 *
 * 使用 Google <model-viewer> web component，支持 GLB/GLTF 格式。
 * CDN script 通过动态插入 <script> 一次性加载，不阻塞首屏。
 * portal 到 body，避免被画布层叠上下文裁掉。
 *
 * ⚠️ <model-viewer> 是自定义 element，TypeScript 中需要声明扩展。
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Download, Box } from "lucide-react";

// 扩展 JSX 类型以支持 <model-viewer> 自定义元素
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "auto-rotate"?: boolean | "";
          "camera-controls"?: boolean | "";
          "shadow-intensity"?: string;
          "environment-image"?: string;
          exposure?: string;
          ar?: boolean | "";
          poster?: string;
          loading?: "auto" | "lazy" | "eager";
          style?: React.CSSProperties;
        },
        HTMLElement
      >;
    }
  }
}

const MODEL_VIEWER_CDN =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

function ensureModelViewerScript() {
  if (document.querySelector(`script[src="${MODEL_VIEWER_CDN}"]`)) return;
  const script = document.createElement("script");
  script.type = "module";
  script.src = MODEL_VIEWER_CDN;
  document.head.appendChild(script);
}

export interface ThreeDViewerDialogProps {
  modelUrl: string;
  prompt?: string;
  modelId?: string;
  isDark: boolean;
  onClose: () => void;
}

export function ThreeDViewerDialog({
  modelUrl,
  prompt,
  modelId,
  isDark,
  onClose,
}: ThreeDViewerDialogProps) {
  const viewerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ensureModelViewerScript();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleDownload() {
    const a = document.createElement("a");
    a.href = modelUrl;
    const filename = modelUrl.split("/").pop() || `artx-3d-${Date.now()}.glb`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "#eeeeee" : "#262627";
  const sub = isDark ? "rgba(255,255,255,0.46)" : "rgba(0,0,0,0.44)";
  const viewerBg = isDark ? "#111114" : "#f4f4f6";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,14,0.65)", backdropFilter: "blur(8px)" }}
      onMouseDown={onClose}
    >
      <section
        data-artx-3d-viewer=""
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--radius-lg-design)] shadow-2xl"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <div className="flex items-center gap-2">
            <Box size={16} style={{ color: "#7c5cff" }} />
            <h2 className="text-sm font-semibold">3D 模型预览</h2>
            {modelId && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: isDark ? "rgba(124,92,255,0.18)" : "rgba(124,92,255,0.12)", color: "#7c5cff" }}
              >
                {modelId}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭 3D 预览"
            className="rounded-full p-1.5"
            style={{ color: sub }}
          >
            <X size={16} />
          </button>
        </header>

        {/* 3D 查看器 */}
        <div
          className="relative flex items-center justify-center"
          style={{ background: viewerBg, height: 360 }}
        >
          {/* @ts-expect-error model-viewer 是自定义 element，类型扩展见文件顶部 */}
          <model-viewer
            ref={viewerRef}
            src={modelUrl}
            alt={prompt || "3D 模型"}
            auto-rotate=""
            camera-controls=""
            shadow-intensity="1"
            exposure="0.9"
            loading="eager"
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
            }}
          />
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: `1px solid ${border}` }}
        >
          <p className="line-clamp-2 text-xs leading-5" style={{ color: sub }}>
            {prompt || "拖拽旋转 · 滚轮缩放 · 右键平移"}
          </p>
          <button
            type="button"
            onClick={handleDownload}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: "#7c5cff", color: "#ffffff" }}
          >
            <Download size={13} />
            下载 GLB
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
