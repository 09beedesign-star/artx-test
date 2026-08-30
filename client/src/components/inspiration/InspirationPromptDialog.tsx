import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  defaultApiBaseUrlForCurrentHost,
  normalizeApiBaseUrl,
} from "@/lib/api-base-url";

export type InspirationPromptItem = {
  rank: number;
  group: string;
  subcategory: string;
  field: string;
  model: string;
  title: string;
  description: string;
  prompt: string;
  imageUrl: string;
  author: string;
};

type InspirationReference = {
  id: string;
  group: string;
  subcategory: string;
  imageUrl: string;
  proxyImageUrl: string;
  title: string;
  prompt: string;
  stylePromptEn: string;
};

export type InspirationPromptDialogProps = {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
  onCopy: (item: InspirationPromptItem) => void;
};

const ALL_GROUPS = "全部分类";

function getApiBaseUrl() {
  const env = import.meta.env as Record<string, string | undefined>;
  return normalizeApiBaseUrl(
    env.VITE_API_BASE_URL ||
      env.VITE_TEST_BACKEND_URL ||
      defaultApiBaseUrlForCurrentHost("")
  );
}

function toPromptItem(reference: InspirationReference, index: number, apiBase: string): InspirationPromptItem {
  const imageUrl =
    reference.proxyImageUrl.startsWith("/") && apiBase
      ? `${apiBase}${reference.proxyImageUrl}`
      : reference.proxyImageUrl;
  return {
    rank: 1000 + index,
    group: reference.group || "其他分类",
    subcategory: reference.subcategory || "其他",
    field: reference.subcategory || reference.group || "外部灵感",
    model: "ArtX",
    title: reference.title,
    description: `灵感提示词描述 · ${reference.group} / ${reference.subcategory}`,
    prompt: reference.prompt || reference.stylePromptEn,
    imageUrl,
    author: "ArtX",
  };
}

export function InspirationPromptDialog({
  isOpen,
  isDark,
  onClose,
  onCopy,
}: InspirationPromptDialogProps) {
  const [items, setItems] = useState<InspirationPromptItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InspirationPromptItem | null>(null);
  const [activeGroup, setActiveGroup] = useState(ALL_GROUPS);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleInspirationCardMouseEnter = (itemKey: string) => {
    if (hoveredItemKey === itemKey) return;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredItemKey(itemKey);
      hoverTimerRef.current = null;
    }, 500);
  };

  const handleInspirationCardMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredItemKey(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const apiBase = getApiBaseUrl();
    const endpoint = `${apiBase}/api/inspiration/references?limit=900&verifiedPromptOnly=1`;
    fetch(endpoint, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ references?: InspirationReference[] }>;
      })
      .then(payload => {
        const references = Array.isArray(payload.references) ? payload.references : [];
        setItems(references.map((reference, index) => toPromptItem(reference, index, apiBase)));
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast("灵感推荐加载失败", { description: "请稍后重试" });
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedItem(null);
      setActiveGroup(ALL_GROUPS);
    }
  }, [isOpen]);

  const groups = useMemo(
    () => [ALL_GROUPS, ...Array.from(new Set(items.map(item => item.group))).filter(Boolean)],
    [items]
  );
  const visibleItems = useMemo(
    () => (activeGroup === ALL_GROUPS ? items : items.filter(item => item.group === activeGroup)).slice(0, 60),
    [activeGroup, items]
  );

  if (!isOpen) return null;

  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const text = isDark ? "#e5e5e7" : "#222";
  const sub = isDark ? "#a8a8ad" : "#666";
  const panelBg = isDark ? "#222222" : "#fff";
  const cardBg = isDark ? "#171717" : "#fafafa";
  const activeBg = isDark ? "rgba(197,237,71,0.16)" : "rgba(95,130,0,0.12)";

  return (
    <div
      data-inspiration-prompt-dialog
      className="fixed inset-0 z-[5300] flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(10px)" }}
      onMouseDown={onClose}
    >
      <section
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-[var(--radius-lg-design)]"
        style={{ maxWidth: 980, maxHeight: "calc(100vh - 48px)", background: panelBg, border: `1px solid ${border}`, boxShadow: "0 24px 80px rgba(0,0,0,0.40)" }}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles size={16} style={{ color: "#C5ED47" }} />
            <h2 className="type-body-sm truncate" style={{ color: text, fontWeight: 750 }}>灵感推荐</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭灵感推荐" className="rounded-[var(--radius-pill)] p-2" style={{ color: sub, border: `1px solid ${border}` }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex shrink-0 gap-2 overflow-x-auto px-5 py-3" style={{ borderBottom: `1px solid ${border}` }}>
          {groups.map(group => (
            <button key={group} type="button" onClick={() => setActiveGroup(group)} className="shrink-0 rounded-[var(--radius-pill)] px-3 py-1.5 type-caption" style={{ background: activeGroup === group ? activeBg : "transparent", border: `1px solid ${activeGroup === group ? "rgba(197,237,71,0.48)" : border}`, color: activeGroup === group ? "#C5ED47" : sub }}>
              {group}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {selectedItem ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
              <div className="relative overflow-hidden rounded-[var(--radius-md-design)] bg-[#171717]">
                <img ref={selectedImageRef} src={selectedItem.imageUrl} alt={selectedItem.title} className="block max-h-[52vh] w-full object-contain" />
              </div>
              <div className="min-w-0">
                <button type="button" onClick={() => setSelectedItem(null)} className="mb-4 type-caption" style={{ color: sub }}>← 返回灵感列表</button>
                <span className="inline-flex rounded-[var(--radius-pill)] px-2.5 py-1 type-caption" style={{ background: activeBg, color: "#C5ED47" }}>{selectedItem.field}</span>
                <h3 className="mt-3 type-title-sm" style={{ color: text, fontWeight: 760 }}>{selectedItem.title}</h3>
                <p className="mt-2 type-caption leading-5" style={{ color: sub }}>{selectedItem.description}</p>
                <div className="mt-4 max-h-[36vh] overflow-y-auto rounded-[var(--radius-md-design)] p-4" style={{ background: cardBg, border: `1px solid ${border}` }}>
                  <p className="whitespace-pre-wrap type-caption leading-6" style={{ color: text }}>{selectedItem.prompt}</p>
                </div>
                <button type="button" onClick={() => onCopy(selectedItem)} className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2.5 type-caption" style={{ background: "#C5ED47", color: "#111", fontWeight: 700 }}>
                  <Copy size={14} /> 复制提示词
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map(item => (
                <article
                  key={`${item.rank}-${item.title}`}
                  className="cursor-pointer overflow-hidden rounded-[var(--radius-lg-design)]"
                  style={{ background: cardBg, border: `1px solid ${border}` }}
                  onMouseEnter={() => handleInspirationCardMouseEnter(`${item.rank}-${item.title}`)}
                  onMouseLeave={handleInspirationCardMouseLeave}
                  onDoubleClick={() => setSelectedItem(item)}
                >
                  <div className="aspect-[16/10] overflow-hidden bg-[#171717]">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out"
                      style={{ transform: hoveredItemKey === `${item.rank}-${item.title}` ? "scale(1.08)" : "scale(1)" }}
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3"><p className="truncate type-body-sm" style={{ color: text, fontWeight: 700 }}>{item.title}</p><p className="mt-1 line-clamp-2 type-caption" style={{ color: sub }}>{item.prompt}</p><p className="mt-2 type-caption" style={{ color: "#C5ED47" }}>双击查看详情</p></div>
                </article>
              ))}
              {visibleItems.length === 0 && <p className="col-span-full py-12 text-center type-body-sm" style={{ color: sub }}>暂无可用灵感</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
