/**
 * 电商画布 · 生成结果放大预览（结果区的二级浮层）
 *
 * 点结果图打开，支持左右切换、单张下载、ESC 关闭。
 */
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { downloadImage } from "./shared";

type Props = {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

export function EcommerceResultLightbox({ images, index, onIndexChange, onClose }: Props) {
  /*
    ⚠️ 键盘监听挂在 document 上，且依赖 index —— 依赖变化就重装监听，
       否则左右键会一直读到首次渲染时的 index，翻到第二张就再也翻不动。
  */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
      if (event.key === "ArrowRight") onIndexChange(Math.min(images.length - 1, index + 1));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [images.length, index, onClose, onIndexChange]);

  if (images.length === 0) return null;
  const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
  const current = images[safeIndex];

  return (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col"
      style={{ background: "rgba(10,10,14,0.92)" }}
      role="dialog"
      aria-modal="true"
      aria-label="生成结果预览"
      onClick={onClose}
    >
      {/* 顶栏：计数 + 下载 + 关闭。点顶栏空白不应关掉浮层，所以这层要阻止冒泡 */}
      <div
        className="flex shrink-0 items-center gap-3 px-5 py-3.5 text-white/90"
        onClick={event => event.stopPropagation()}
      >
        <span className="text-[13px] font-semibold">
          {safeIndex + 1} / {images.length}
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] transition-colors hover:bg-white/10"
          onClick={() => void downloadImage(current, `ecommerce-${safeIndex + 1}.png`)}
        >
          <Download size={13} /> 下载这张
        </button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
          onClick={onClose}
          aria-label="关闭预览"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-5 pb-5">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
          disabled={safeIndex === 0}
          onClick={event => {
            event.stopPropagation();
            onIndexChange(Math.max(0, safeIndex - 1));
          }}
          aria-label="上一张"
        >
          <ChevronLeft size={20} />
        </button>

        <img
          src={current}
          alt={`生成结果 ${safeIndex + 1}`}
          className="max-h-full min-w-0 flex-1 rounded-lg object-contain"
          onClick={event => event.stopPropagation()}
        />

        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
          disabled={safeIndex === images.length - 1}
          onClick={event => {
            event.stopPropagation();
            onIndexChange(Math.min(images.length - 1, safeIndex + 1));
          }}
          aria-label="下一张"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
