import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import TopBar from "@/components/workspace/TopBar";
import { useTheme } from "@/contexts/ThemeContext";
import { BG_GLOW } from "@/lib/workspace-data";
import generationMark from "@/assets/generation/ai-generation-mark.svg";

interface FeedbackImage {
  id: string;
  name: string;
  url: string;
}

const MAX_IMAGES = 4;

export default function HelpPage() {
  const { resolvedTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const isDark = resolvedTheme === "dark";

  const bg = isDark ? "oklch(0.09 0.012 270)" : "var(--design-surface-soft)";
  const text = isDark ? "oklch(0.88 0.008 270)" : "oklch(0.20 0.012 270)";
  const sub = isDark ? "oklch(0.71 0.010 270)" : "oklch(0.64 0.010 270)";
  const panel = isDark ? "oklch(0.12 0.016 270 / 0.86)" : "oklch(1 0 0 / 0.86)";
  const field = isDark ? "oklch(1 0 0 / 0.055)" : "oklch(0 0 0 / 0.035)";
  const border = isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 10%)";

  const clearForm = () => {
    images.forEach(image => URL.revokeObjectURL(image.url));
    setContent("");
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/"));
    if (selected.length === 0) return;

    const available = MAX_IMAGES - images.length;
    if (available <= 0) {
      toast.error("最多只能上传 4 张图片");
      event.target.value = "";
      return;
    }

    if (selected.length > available) {
      toast("已达到上传上限", { description: `本次只添加前 ${available} 张图片` });
    }

    const nextImages = selected.slice(0, available).map(file => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID?.() || Date.now()}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    setImages(current => [...current, ...nextImages]);
    event.target.value = "";
  };

  const removeImage = (id: string) => {
    setImages(current => {
      const target = current.find(image => image.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter(image => image.id !== id);
    });
  };

  const handleCancel = () => {
    clearForm();
    toast("已取消反馈");
  };

  const handleSubmit = () => {
    if (!content.trim() && images.length === 0) {
      toast.error("请先填写反馈内容或上传问题截图");
      return;
    }
    clearForm();
    toast.success("反馈已提交", { description: "感谢你的反馈，我们会尽快查看。" });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: bg, position: "relative" }}>
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.12, zIndex: 0 }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <TopBar credits={0} />
      </div>

      <main className="flex-1 overflow-auto px-6 py-10" style={{ position: "relative", zIndex: 1 }}>
        <section className="mx-auto w-full max-w-3xl">
          <div className="mb-6">
            <h1 className="type-title-sm" style={{ color: text, fontSize: 24, fontWeight: 680 }}>
              帮助与反馈
            </h1>
            <p className="mt-2 type-body-sm" style={{ color: sub }}>
              描述你遇到的问题，也可以上传截图辅助说明。
            </p>
          </div>

          <div
            className="rounded-[var(--radius-xl-design)] border p-5 shadow-[0_24px_72px_rgba(0,0,0,0.18)] backdrop-blur-xl"
            style={{ background: panel, borderColor: border }}
          >
            <textarea
              value={content}
              onChange={event => setContent(event.target.value)}
              placeholder="请描述你碰到的问题或想反馈的内容..."
              className="min-h-[220px] w-full resize-none rounded-[var(--radius-lg-design)] border p-4 outline-none transition-colors"
              style={{ background: field, borderColor: border, color: text, fontSize: 14, lineHeight: 1.7 }}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {images.map(image => (
                <div key={image.id} className="group relative h-20 w-20 overflow-hidden rounded-[var(--radius-md-design)] border" style={{ borderColor: border }}>
                  <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm-design)] bg-[#222222]/65 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="移除图片"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}

              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[var(--radius-md-design)] border border-dashed transition-colors hover:bg-white/10"
                  style={{ borderColor: border, color: sub, background: field }}
                >
                  <ImagePlus size={18} />
                  <span className="type-caption">{images.length}/{MAX_IMAGES}</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="flex h-10 items-center gap-2 rounded-[var(--radius-md-design)] border px-5 type-body-sm transition-colors hover:bg-white/10"
                style={{ borderColor: border, color: sub, background: "transparent" }}
              >
                <Trash2 size={15} />
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex h-10 items-center gap-2 rounded-[var(--radius-md-design)] px-5 type-body-sm font-medium transition-transform hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#C5ED47", color: "#000", boxShadow: "0 14px 30px rgba(197,237,71,0.24)" }}
              >
                <img src={generationMark} alt="" aria-hidden="true" draggable={false} className="h-4 w-4 object-contain" style={{ filter: "brightness(0)" }} />
                提交
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
