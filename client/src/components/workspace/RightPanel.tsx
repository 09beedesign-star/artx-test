/**
 * RightPanel — Neo-Studio Dark Design System
 * Right properties panel: layers, generation settings, reference assets
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

type PanelTab = "layers" | "settings" | "reference";

const STYLE_PRESETS = [
  { id: "cinematic", label: "电影感", color: "oklch(0.58 0.22 290)" },
  { id: "editorial", label: "编辑风", color: "oklch(0.72 0.18 200)" },
  { id: "minimal", label: "极简", color: "oklch(0.70 0.01 270)" },
  { id: "bold", label: "大胆", color: "oklch(0.75 0.18 60)" },
  { id: "dark", label: "暗黑", color: "oklch(0.45 0.01 270)" },
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

  return (
    <aside
      className="flex flex-col h-full w-[260px] shrink-0"
      style={{ background: "oklch(0.12 0.016 270)", borderLeft: "1px solid oklch(1 0 0 / 6%)" }}
    >
      {/* Panel tabs */}
      <div
        className="flex items-center gap-0.5 px-2 shrink-0"
        style={{ height: 44, borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
      >
        {([
          { id: "layers", label: "图层", icon: Layers },
          { id: "settings", label: "设置", icon: Sliders },
          { id: "reference", label: "参考", icon: ImageIcon },
        ] as { id: PanelTab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
              activeTab === id ? "text-white" : "hover:text-white"
            )}
            style={activeTab === id ? {
              background: "oklch(1 0 0 / 8%)",
              color: "white",
            } : { color: "oklch(0.48 0.01 270)" }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "layers" && <LayersPanel layers={LAYERS} />}
        {activeTab === "settings" && (
          <SettingsPanel
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
        {activeTab === "reference" && <ReferencePanel />}
      </div>

      {/* Generate button */}
      <div className="px-3 pb-3 shrink-0" style={{ borderTop: "1px solid oklch(1 0 0 / 6%)", paddingTop: 12 }}>
        <button
          onClick={() => toast("开始生成", { description: "请先在对话框中输入描述" })}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150 pulse-glow"
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

function LayersPanel({ layers }: { layers: Layer[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["l1", "l2"]));
  const [visible, setVisible] = useState<Set<string>>(new Set(layers.flatMap(l => [l.id, ...(l.children?.map(c => c.id) || [])])));
  const [locked, setLocked] = useState<Set<string>>(new Set(["l1a"]));

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleVisible = (id: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleLock = (id: string) => {
    setLocked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const typeIcon = (type: Layer["type"]) => {
    switch (type) {
      case "image": return ImageIcon;
      case "text": return Type;
      case "shape": return Square;
      case "group": return Layers;
    }
  };

  return (
    <div className="p-2 space-y-0.5">
      <div className="flex items-center justify-between px-2 py-1.5 mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.42 0.01 270)" }}>
          图层
        </span>
        <button
          onClick={() => toast("添加图层", { description: "功能即将上线" })}
          className="p-0.5 rounded hover:bg-white/10 transition-colors"
        >
          <Plus size={12} style={{ color: "oklch(0.50 0.01 270)" }} />
        </button>
      </div>

      {layers.map((layer) => {
        const Icon = typeIcon(layer.type);
        const isExpanded = expanded.has(layer.id);
        const isVisible = visible.has(layer.id);
        const isLocked = locked.has(layer.id);

        return (
          <div key={layer.id}>
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
              onClick={() => layer.children && toggleExpand(layer.id)}
            >
              {layer.children ? (
                <ChevronRight
                  size={11}
                  className="shrink-0 transition-transform duration-150"
                  style={{
                    color: "oklch(0.45 0.01 270)",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                />
              ) : (
                <div className="w-3" />
              )}
              <Icon size={12} className="shrink-0" style={{ color: "oklch(0.55 0.01 270)" }} />
              <span className="flex-1 text-[12px] truncate" style={{ color: "oklch(0.78 0.008 270)" }}>
                {layer.name}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleVisible(layer.id); }}
                  className="p-0.5 rounded hover:bg-white/10"
                >
                  {isVisible
                    ? <Eye size={11} style={{ color: "oklch(0.55 0.01 270)" }} />
                    : <EyeOff size={11} style={{ color: "oklch(0.38 0.01 270)" }} />
                  }
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
                  className="p-0.5 rounded hover:bg-white/10"
                >
                  {isLocked
                    ? <Lock size={11} style={{ color: "oklch(0.72 0.18 60)" }} />
                    : <Unlock size={11} style={{ color: "oklch(0.55 0.01 270)" }} />
                  }
                </button>
              </div>
            </div>

            {/* Children */}
            {layer.children && isExpanded && (
              <div className="ml-4 space-y-0.5">
                {layer.children.map((child) => {
                  const ChildIcon = typeIcon(child.type);
                  const childVisible = visible.has(child.id);
                  const childLocked = locked.has(child.id);
                  return (
                    <div
                      key={child.id}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                    >
                      <div className="w-3" />
                      <ChildIcon size={11} className="shrink-0" style={{ color: "oklch(0.48 0.01 270)" }} />
                      <span className="flex-1 text-[11px] truncate" style={{ color: "oklch(0.65 0.008 270)" }}>
                        {child.name}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => toggleVisible(child.id)} className="p-0.5 rounded hover:bg-white/10">
                          {childVisible
                            ? <Eye size={10} style={{ color: "oklch(0.50 0.01 270)" }} />
                            : <EyeOff size={10} style={{ color: "oklch(0.35 0.01 270)" }} />
                          }
                        </button>
                        <button onClick={() => toggleLock(child.id)} className="p-0.5 rounded hover:bg-white/10">
                          {childLocked
                            ? <Lock size={10} style={{ color: "oklch(0.72 0.18 60)" }} />
                            : <Unlock size={10} style={{ color: "oklch(0.50 0.01 270)" }} />
                          }
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
  selectedSize, setSelectedSize,
  selectedStyle, setSelectedStyle,
  quality, setQuality,
  count, setCount,
}: {
  selectedSize: string; setSelectedSize: (v: string) => void;
  selectedStyle: string; setSelectedStyle: (v: string) => void;
  quality: number; setQuality: (v: number) => void;
  count: number; setCount: (v: number) => void;
}) {
  return (
    <div className="p-3 space-y-5">
      {/* Size */}
      <Section title="输出尺寸">
        <div className="grid grid-cols-2 gap-1.5">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSelectedSize(s.value)}
              className="flex flex-col items-start px-2.5 py-2 rounded-lg transition-all duration-150"
              style={selectedSize === s.value ? {
                background: "oklch(0.58 0.22 290 / 0.15)",
                border: "1px solid oklch(0.58 0.22 290 / 0.4)",
              } : {
                background: "oklch(1 0 0 / 4%)",
                border: "1px solid oklch(1 0 0 / 8%)",
              }}
            >
              <span className="text-[11px] font-medium" style={{ color: selectedSize === s.value ? "oklch(0.78 0.18 290)" : "oklch(0.65 0.01 270)" }}>
                {s.label}
              </span>
              <span className="font-mono-dim">{s.value}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Style */}
      <Section title="视觉风格">
        <div className="grid grid-cols-3 gap-1.5">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStyle(s.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-150"
              style={selectedStyle === s.id ? {
                background: `${s.color.replace(")", " / 0.15)")}`,
                border: `1px solid ${s.color.replace(")", " / 0.4)")}`,
              } : {
                background: "oklch(1 0 0 / 4%)",
                border: "1px solid oklch(1 0 0 / 8%)",
              }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-[11px]" style={{ color: selectedStyle === s.id ? "oklch(0.85 0.01 270)" : "oklch(0.55 0.01 270)" }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Quality slider */}
      <Section title="生成质量">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "oklch(0.60 0.01 270)" }}>精度</span>
            <span className="font-mono-dim">{quality}%</span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            step={10}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, oklch(0.58 0.22 290) ${quality}%, oklch(1 0 0 / 10%) ${quality}%)`,
            }}
          />
        </div>
      </Section>

      {/* Count */}
      <Section title="生成数量">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className="w-9 h-9 rounded-lg text-[13px] font-semibold transition-all duration-150"
              style={count === n ? {
                background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                color: "white",
              } : {
                background: "oklch(1 0 0 / 5%)",
                border: "1px solid oklch(1 0 0 / 10%)",
                color: "oklch(0.55 0.01 270)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </Section>

      {/* Model */}
      <Section title="生成模型">
        <button
          onClick={() => toast("切换模型", { description: "功能即将上线" })}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ background: "oklch(1 0 0 / 4%)", border: "1px solid oklch(1 0 0 / 8%)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.72 0.18 200)" }} />
            <span className="text-[12px]" style={{ color: "oklch(0.75 0.01 270)" }}>Lovart Pro v2</span>
          </div>
          <ChevronDown size={12} style={{ color: "oklch(0.45 0.01 270)" }} />
        </button>
      </Section>
    </div>
  );
}

// ── Reference Panel ───────────────────────────────────────────

function ReferencePanel() {
  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.42 0.01 270)" }}>
          参考素材
        </span>
        <button
          onClick={() => toast("上传参考图", { description: "功能即将上线" })}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "oklch(0.58 0.22 290)" }}
        >
          <Plus size={11} />
          添加
        </button>
      </div>

      {/* Reference grid */}
      <div className="grid grid-cols-2 gap-2">
        {GENERATED_ASSETS.slice(0, 4).map((asset, i) => (
          <div
            key={asset.id}
            className="relative rounded-lg overflow-hidden cursor-pointer group animate-fade-up"
            style={{ animationDelay: `${i * 60}ms`, border: "1px solid oklch(1 0 0 / 8%)" }}
            onClick={() => toast("使用参考图", { description: "功能即将上线" })}
          >
            <div className="aspect-square">
              <img
                src={asset.src}
                alt={asset.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <span className="text-[11px] text-white font-medium">使用</span>
            </div>
          </div>
        ))}
      </div>

      {/* Upload area */}
      <button
        onClick={() => toast("上传素材", { description: "功能即将上线" })}
        className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl transition-all duration-150 hover:border-purple-500/40"
        style={{
          background: "oklch(1 0 0 / 2%)",
          border: "1.5px dashed oklch(1 0 0 / 12%)",
        }}
      >
        <ImageIcon size={20} style={{ color: "oklch(0.42 0.01 270)" }} />
        <span className="text-[12px]" style={{ color: "oklch(0.48 0.01 270)" }}>上传参考图片</span>
        <span className="text-[10px]" style={{ color: "oklch(0.38 0.01 270)" }}>PNG、JPG、WEBP，最大 10MB</span>
      </button>

      {/* Color palette section */}
      <Section title="品牌色板">
        <div className="flex gap-2 flex-wrap">
          {["oklch(0.58 0.22 290)", "oklch(0.72 0.18 200)", "oklch(0.15 0.02 270)", "oklch(0.93 0.008 270)", "oklch(0.75 0.18 60)"].map((color, i) => (
            <button
              key={i}
              onClick={() => toast("应用颜色", { description: "功能即将上线" })}
              className="w-7 h-7 rounded-full transition-transform hover:scale-110"
              style={{ background: color, border: "2px solid oklch(1 0 0 / 15%)" }}
              title={color}
            />
          ))}
          <button
            onClick={() => toast("添加颜色", { description: "功能即将上线" })}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ border: "1.5px dashed oklch(1 0 0 / 20%)" }}
          >
            <Plus size={11} style={{ color: "oklch(0.45 0.01 270)" }} />
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.42 0.01 270)" }}>
        {title}
      </span>
      {children}
    </div>
  );
}
