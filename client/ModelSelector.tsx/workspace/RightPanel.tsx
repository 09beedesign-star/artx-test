/**
 * RightPanel — 图层 / 设置 / 参考 面板
 * 完全响应 ThemeContext（dark / light）
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Eye, EyeOff, Lock, Unlock, ChevronDown, ChevronRight,
  Plus, Sliders, Image as ImageIcon, Layers, RefreshCw,
  Palette, Type, Square,
} from "lucide-react";
import { LAYERS, GENERATED_ASSETS } from "@/lib/workspace-data";
import type { Layer } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";

type PanelTab = "layers" | "settings" | "reference";

const STYLE_PRESETS = [
  { id: "cinematic", label: "电影感", color: "oklch(0.58 0.22 290)" },
  { id: "editorial", label: "编辑风", color: "oklch(0.72 0.18 200)" },
  { id: "minimal", label: "极简", color: "oklch(0.70 0.01 270)" },
  { id: "bold", label: "大胆", color: "oklch(0.75 0.18 60)" },
  { id: "dark", label: "暗黑", color: "oklch(0.62 0.010 270)" },
  { id: "pastel", label: "柔和", color: "oklch(0.80 0.12 330)" },
];

const SIZE_PRESETS = [
  { label: "竖版", value: "720×960", ratio: "3:4" },
  { label: "方形", value: "1080×1080", ratio: "1:1" },
  { label: "横版", value: "1920×1080", ratio: "16:9" },
  { label: "故事", value: "1080×1920", ratio: "9:16" },
];

export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("layers");
  const [selectedSize, setSelectedSize] = useState("720×960");
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [quality, setQuality] = useState(80);
  const [count, setCount] = useState(2);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── theme tokens ──
  const panelBg     = isDark ? "oklch(0.12 0.016 270)"      : "#F5F5F5";
  const panelBorder = isDark ? "oklch(1 0 0 / 6%)"          : "oklch(0 0 0 / 8%)";
  const tabActiveBg = isDark ? "oklch(1 0 0 / 8%)"          : "oklch(0 0 0 / 7%)";
  const tabActiveColor = isDark ? "oklch(0.92 0.008 270)"   : "oklch(0.18 0.01 270)";
  const tabInactiveColor = isDark ? "oklch(0.64 0.010 270)"  : "oklch(0.66 0.010 270)";

  return (
    <aside
      className="flex flex-col h-full w-[260px] shrink-0"
      style={{
        background: panelBg,
        borderRight: `1px solid ${panelBorder}`,
        transition: "background 0.25s ease",
      }}
    >
      {/* Panel tabs */}
      <div
        className="flex items-center gap-0.5 px-2 shrink-0"
        style={{ height: 44, borderBottom: `1px solid ${panelBorder}` }}
      >
        {([
          { id: "layers", label: "图层", icon: Layers },
          { id: "settings", label: "设置", icon: Sliders },
          { id: "reference", label: "参考", icon: ImageIcon },
        ] as { id: PanelTab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150"
            style={activeTab === id
              ? { background: tabActiveBg, color: tabActiveColor }
              : { color: tabInactiveColor }
            }
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "layers" && <LayersPanel layers={LAYERS} isDark={isDark} />}
        {activeTab === "settings" && (
          <SettingsPanel
            isDark={isDark}
            selectedSize={selectedSize}
            setSelectedSize={setSelectedSize}
            selectedStyle={selectedStyle}
            setSelectedStyle={setSelectedStyle}
            quality={quality}
            setQuality={setQuality}
            count={count}
            setCount={setCount}
          />
        )}
        {activeTab === "reference" && <ReferencePanel isDark={isDark} />}
      </div>

      {/* Generate button */}
      <div
        className="px-3 pb-3 shrink-0"
        style={{ borderTop: `1px solid ${panelBorder}`, paddingTop: 12 }}
      >
        <button
          onClick={() => toast("开始生成", { description: "请先在对话框中输入描述" })}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 active:scale-95"
          style={{
            background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
            color: "white",
            fontSize: 13,
          }}
        >
          <Plus size={14} />
          开始生成
        </button>
      </div>
    </aside>
  );
}

// ── Layers Panel ──────────────────────────────────────────────

function LayersPanel({ layers, isDark }: { layers: Layer[]; isDark: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["l1", "l2"]));
  const [visible, setVisible] = useState<Set<string>>(new Set(layers.flatMap(l => [l.id, ...(l.children?.map(c => c.id) || [])])));
  const [locked, setLocked] = useState<Set<string>>(new Set(["l1a"]));

  const labelColor   = isDark ? "oklch(0.59 0.010 270)" : "oklch(0.62 0.010 270)";
  const nameColor    = isDark ? "oklch(0.78 0.008 270)" : "oklch(0.22 0.008 270)";
  const iconColor    = isDark ? "oklch(0.69 0.010 270)"  : "oklch(0.62 0.010 270)";
  const chevronColor = isDark ? "oklch(0.62 0.010 270)"  : "oklch(0.65 0.010 270)";
  const hoverBg      = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const btnHoverBg   = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)";
  const childNameColor = isDark ? "oklch(0.65 0.008 270)" : "oklch(0.38 0.008 270)";
  const childIconColor = isDark ? "oklch(0.64 0.010 270)"  : "oklch(0.65 0.010 270)";

  const toggleExpand  = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVisible = (id: string) => setVisible(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleLock    = (id: string) => setLocked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const typeIcon = (type: Layer["type"]) => {
    switch (type) {
      case "image": return ImageIcon;
      case "text":  return Type;
      case "shape": return Square;
      case "group": return Layers;
    }
  };

  return (
    <div className="p-2 space-y-0.5">
      <div className="flex items-center justify-between px-2 py-1.5 mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: labelColor }}>图层</span>
        <button onClick={() => toast("添加图层", { description: "功能即将上线" })}
          className="p-0.5 rounded transition-colors"
          style={{ color: iconColor }}
          onMouseEnter={e => (e.currentTarget.style.background = btnHoverBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Plus size={12} />
        </button>
      </div>

      {layers.map((layer) => {
        const Icon = typeIcon(layer.type);
        const isExpanded = expanded.has(layer.id);
        const isVisible  = visible.has(layer.id);
        const isLocked   = locked.has(layer.id);

        return (
          <div key={layer.id}>
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors group cursor-pointer"
              style={{ ["--hover-bg" as string]: hoverBg } as React.CSSProperties}
              onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              onClick={() => layer.children && toggleExpand(layer.id)}
            >
              {layer.children ? (
                <ChevronRight size={11} className="shrink-0 transition-transform duration-150"
                  style={{ color: chevronColor, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }} />
              ) : <div className="w-3" />}
              <Icon size={12} className="shrink-0" style={{ color: iconColor }} />
              <span className="flex-1 text-[12px] truncate" style={{ color: nameColor }}>{layer.name}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); toggleVisible(layer.id); }}
                  className="p-0.5 rounded transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = btnHoverBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {isVisible
                    ? <Eye size={11} style={{ color: iconColor }} />
                    : <EyeOff size={11} style={{ color: isDark ? "oklch(0.57 0.010 270)" : "oklch(0.65 0.01 270)" }} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
                  className="p-0.5 rounded transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = btnHoverBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {isLocked
                    ? <Lock size={11} style={{ color: "oklch(0.72 0.18 60)" }} />
                    : <Unlock size={11} style={{ color: iconColor }} />}
                </button>
              </div>
            </div>

            {layer.children && isExpanded && (
              <div className="ml-4 space-y-0.5">
                {layer.children.map((child) => {
                  const ChildIcon = typeIcon(child.type);
                  const childVisible = visible.has(child.id);
                  const childLocked  = locked.has(child.id);
                  return (
                    <div key={child.id}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors group cursor-pointer"
                      onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="w-3" />
                      <ChildIcon size={11} className="shrink-0" style={{ color: childIconColor }} />
                      <span className="flex-1 text-[11px] truncate" style={{ color: childNameColor }}>{child.name}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => toggleVisible(child.id)} className="p-0.5 rounded transition-colors"
                          onMouseEnter={e => (e.currentTarget.style.background = btnHoverBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          {childVisible
                            ? <Eye size={10} style={{ color: childIconColor }} />
                            : <EyeOff size={10} style={{ color: isDark ? "oklch(0.35 0.01 270)" : "oklch(0.65 0.01 270)" }} />}
                        </button>
                        <button onClick={() => toggleLock(child.id)} className="p-0.5 rounded transition-colors"
                          onMouseEnter={e => (e.currentTarget.style.background = btnHoverBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          {childLocked
                            ? <Lock size={10} style={{ color: "oklch(0.72 0.18 60)" }} />
                            : <Unlock size={10} style={{ color: childIconColor }} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────

function SettingsPanel({
  isDark,
  selectedSize, setSelectedSize,
  selectedStyle, setSelectedStyle,
  quality, setQuality,
  count, setCount,
}: {
  isDark: boolean;
  selectedSize: string; setSelectedSize: (v: string) => void;
  selectedStyle: string; setSelectedStyle: (v: string) => void;
  quality: number; setQuality: (v: number) => void;
  count: number; setCount: (v: number) => void;
}) {
  const itemBg      = isDark ? "oklch(1 0 0 / 4%)"  : "oklch(0 0 0 / 4%)";
  const itemBorder  = isDark ? "oklch(1 0 0 / 8%)"  : "oklch(0 0 0 / 10%)";
  const textMuted   = isDark ? "oklch(0.65 0.01 270)" : "oklch(0.62 0.010 270)";
  const textDim     = isDark ? "oklch(0.69 0.010 270)" : "oklch(0.69 0.010 270)";
  const hoverBg     = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const countInactive = isDark
    ? { background: "oklch(1 0 0 / 5%)", border: `1px solid oklch(1 0 0 / 10%)`, color: "oklch(0.69 0.010 270)" }
    : { background: "oklch(0 0 0 / 4%)", border: `1px solid oklch(0 0 0 / 10%)`, color: "oklch(0.40 0.01 270)" };

  return (
    <div className="p-3 space-y-5">
      {/* Size */}
      <Section title="输出尺寸" isDark={isDark}>
        <div className="grid grid-cols-2 gap-1.5">
          {SIZE_PRESETS.map((s) => (
            <button key={s.value} onClick={() => setSelectedSize(s.value)}
              className="flex flex-col items-start px-2.5 py-2 rounded-lg transition-all duration-150"
              style={selectedSize === s.value ? {
                background: "oklch(0.58 0.22 290 / 0.15)",
                border: "1px solid oklch(0.58 0.22 290 / 0.4)",
              } : { background: itemBg, border: `1px solid ${itemBorder}` }}
            >
              <span className="text-[11px] font-medium"
                style={{ color: selectedSize === s.value ? "oklch(0.78 0.18 290)" : textMuted }}>
                {s.label}
              </span>
              <span className="text-[10px] font-mono" style={{ color: textDim }}>{s.value}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Style */}
      <Section title="视觉风格" isDark={isDark}>
        <div className="grid grid-cols-3 gap-1.5">
          {STYLE_PRESETS.map((s) => (
            <button key={s.id} onClick={() => setSelectedStyle(s.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-150"
              style={selectedStyle === s.id ? {
                background: `${s.color.replace(")", " / 0.15)")}`,
                border: `1px solid ${s.color.replace(")", " / 0.4)")}`,
              } : { background: itemBg, border: `1px solid ${itemBorder}` }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[11px]"
                style={{ color: selectedStyle === s.id ? (isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.01 270)") : textDim }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Quality slider */}
      <Section title="生成质量" isDark={isDark}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: textDim }}>精度</span>
            <span className="text-[12px] font-mono" style={{ color: textMuted }}>{quality}%</span>
          </div>
          <input type="range" min={20} max={100} step={10} value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, oklch(0.58 0.22 290) ${quality}%, ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 12%)"} ${quality}%)`,
            }}
          />
        </div>
      </Section>

      {/* Count */}
      <Section title="生成数量" isDark={isDark}>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} onClick={() => setCount(n)}
              className="w-9 h-9 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={count === n ? {
                background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                color: "white",
              } : countInactive}
            >
              {n}
            </button>
          ))}
        </div>
      </Section>

      {/* Model */}
      <Section title="生成模型" isDark={isDark}>
        <button onClick={() => toast("切换模型", { description: "功能即将上线" })}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
          style={{ background: itemBg, border: `1px solid ${itemBorder}` }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)")}
          onMouseLeave={e => (e.currentTarget.style.background = itemBg)}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
            <span className="text-[12px]" style={{ color: textMuted }}>Lovart Pro v2</span>
          </div>
          <ChevronDown size={12} style={{ color: textDim }} />
        </button>
      </Section>
    </div>
  );
}

// ── Reference Panel ───────────────────────────────────────────

function ReferencePanel({ isDark }: { isDark: boolean }) {
  const labelColor  = isDark ? "oklch(0.59 0.010 270)" : "oklch(0.62 0.010 270)";
  const textMuted   = isDark ? "oklch(0.64 0.010 270)" : "oklch(0.62 0.010 270)";
  const textDim     = isDark ? "oklch(0.57 0.010 270)" : "oklch(0.69 0.010 270)";
  const uploadBg    = isDark ? "oklch(1 0 0 / 2%)"    : "oklch(0 0 0 / 2%)";
  const uploadBdr   = isDark ? "oklch(1 0 0 / 12%)"   : "oklch(0 0 0 / 14%)";
  const imgBorder   = isDark ? "oklch(1 0 0 / 8%)"    : "oklch(0 0 0 / 8%)";
  const addBtnHover = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const paletteBdr  = isDark ? "oklch(1 0 0 / 15%)"   : "oklch(0 0 0 / 12%)";
  const addColorBdr = isDark ? "oklch(1 0 0 / 20%)"   : "oklch(0 0 0 / 18%)";

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: labelColor }}>参考素材</span>
        <button onClick={() => toast("上传参考图", { description: "功能即将上线" })}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
          style={{ color: "oklch(0.58 0.22 290)" }}
          onMouseEnter={e => (e.currentTarget.style.background = addBtnHover)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <Plus size={11} />添加
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GENERATED_ASSETS.slice(0, 4).map((asset, i) => (
          <div key={asset.id}
            className="relative rounded-lg overflow-hidden cursor-pointer group"
            style={{ border: `1px solid ${imgBorder}` }}
            onClick={() => toast("使用参考图", { description: "功能即将上线" })}
          >
            <div className="aspect-square">
              <img src={asset.src} alt={asset.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div className="absolute inset-0 bg-[#222222]/0 group-hover:bg-[#222222]/40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <span className="text-[11px] text-white font-medium">使用</span>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => toast("上传素材", { description: "功能即将上线" })}
        className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl transition-all duration-150"
        style={{ background: uploadBg, border: `1.5px dashed ${uploadBdr}` }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "oklch(0.58 0.22 290 / 0.4)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = uploadBdr)}
      >
        <ImageIcon size={20} style={{ color: labelColor }} />
        <span className="text-[12px]" style={{ color: textMuted }}>上传参考图片</span>
        <span className="text-[10px]" style={{ color: textDim }}>PNG、JPG、WEBP，最大 10MB</span>
      </button>

      <Section title="品牌色板" isDark={isDark}>
        <div className="flex gap-2 flex-wrap">
          {["oklch(0.58 0.22 290)", "oklch(0.72 0.18 200)", "oklch(0.15 0.02 270)", "oklch(0.93 0.008 270)", "oklch(0.75 0.18 60)"].map((color, i) => (
            <button key={i}
              onClick={() => toast("应用颜色", { description: "功能即将上线" })}
              className="w-7 h-7 rounded-full transition-transform hover:scale-110"
              style={{ background: color, border: `2px solid ${paletteBdr}` }}
              title={color}
            />
          ))}
          <button onClick={() => toast("添加颜色", { description: "功能即将上线" })}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ border: `1.5px dashed ${addColorBdr}`, color: labelColor }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <Plus size={11} />
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────

function Section({ title, children, isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  const labelColor = isDark ? "oklch(0.59 0.010 270)" : "oklch(0.62 0.010 270)";
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: labelColor }}>
        {title}
      </span>
      {children}
    </div>
  );
}
