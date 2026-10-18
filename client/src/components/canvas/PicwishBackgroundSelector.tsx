import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listPicWishBackgroundTemplates, type PicWishBackgroundTemplate } from "@/lib/ai";

type Props = {
  isDark: boolean;
  selectedTemplate?: PicWishBackgroundTemplate;
  onSelect: (template: PicWishBackgroundTemplate) => void;
  onClose?: () => void;
  /**
   * 内嵌模式（2026-10-18 电商画布产品图模式）：
   * 直接铺在右栏，不是浮层 → 不绝对定位、不显示关闭按钮、选完不关闭。
   * ⚠️ 内嵌时若还显示 X，点了没有任何反应 = 死按钮。
   */
  embedded?: boolean;
  title?: string;
  description?: string;
};

export function PicwishBackgroundSelector({
  isDark,
  selectedTemplate,
  onSelect,
  onClose,
  embedded = false,
  title = "电商背景模板选择",
  description = "选择模板后，仅替换产品背景，产品主体保持不变。",
}: Props) {
  const [templates, setTemplates] = useState<PicWishBackgroundTemplate[]>([]);
  const [category, setCategory] = useState("全部");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    listPicWishBackgroundTemplates().then(items => alive && setTemplates(items)).catch(reason => {
      if (!alive) return;
      // 静态环境下的 CORS 错误给出友好提示
      const message = reason instanceof Error ? reason.message : String(reason);
      if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("CORS")) {
        setError("此功能需要完整的后端环境，静态预览暂不可用");
      } else {
        setError(message || "背景模板加载失败");
      }
    });
    return () => { alive = false; };
  }, []);
  const categories = useMemo(() => ["全部", ...Array.from(new Set(templates.map(template => template.category))).filter(Boolean)], [templates]);
  const visible = category === "全部" ? templates : templates.filter(template => template.category === category);
  const text = isDark ? "rgba(255,255,255,0.92)" : "rgba(22,22,34,0.92)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,22,34,0.12)";
  const surface = isDark ? "rgba(255,255,255,0.055)" : "rgba(22,22,34,0.04)";
  const rootClass = embedded ? "flex h-full min-h-0 flex-col" : "absolute inset-0 z-20 flex flex-col";
  const rootBg = embedded ? "transparent" : isDark ? "rgba(18,18,25,0.985)" : "rgba(255,255,255,0.99)";
  return <div className={rootClass} style={{ color: text, background: rootBg }} data-testid={embedded ? "picwish-bg-selector-embedded" : undefined}>
    <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5" style={{ borderColor: border }}>
      <div><h3 className="text-[13px] font-semibold">{title}</h3><p className="mt-0.5 text-[10px] opacity-55">{description}</p></div>
      {!embedded && onClose ? <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md" onClick={onClose} aria-label="关闭背景模板"><X size={16} /></button> : null}
    </div>
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b px-5 py-2.5" style={{ borderColor: border }}>
      {categories.map(item => <button key={item} type="button" className="shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: category === item ? "rgba(197,237,71,0.16)" : surface, border: `1px solid ${category === item ? "rgba(197,237,71,0.62)" : border}` }} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {error ? <div className="rounded-md border p-4 text-center" style={{ borderColor: border, background: surface }}><p className="text-[11px] text-amber-400">{error}</p></div> : null}
      {!error && templates.length === 0 ? <div className="flex h-36 items-center justify-center gap-2 text-[11px] opacity-60"><LoaderCircle className="animate-spin" size={15} />加载背景模板</div> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{visible.map(template => {
        const active = selectedTemplate?.id === template.id;
        return <button key={template.id} type="button" className="relative min-h-20 overflow-hidden rounded-md p-2 text-left" style={{ background: surface, border: `1px solid ${active ? "rgba(197,237,71,0.7)" : border}` }} onClick={() => { onSelect(template); if (!embedded) onClose?.(); }}>
          {template.previewUrl ? <img src={template.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : null}{template.previewUrl ? <span className="absolute inset-0 bg-black/40" /> : null}
          <span className="relative block text-[10px] font-semibold">{template.name}</span><span className="relative mt-1 block text-[9px] opacity-70">{template.category}</span>{active ? <Check className="absolute right-2 top-2" size={14} color="#C5ED47" /> : null}
        </button>;
      })}</div>
    </div>
  </div>;
}
