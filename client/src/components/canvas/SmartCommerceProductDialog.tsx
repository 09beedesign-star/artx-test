import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  Boxes,
  Check,
  FileImage,
  GripHorizontal,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Minimize2,
  MoveDiagonal2,
  RefreshCw,
  Scan,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PicwishBackgroundSelector } from "@/components/canvas/PicwishBackgroundSelector";
import type { PicWishBackgroundTemplate } from "@/lib/ai";

export type SmartCommerceProductCreateDetail = {
  imageSrc: string;
  fileName?: string;
  userPrompt: string;
  prompt: string;
  style: string;
  composition: string;
  productScale: string;
  sceneType?: number;
  ratio: string;
  resolution: "2k" | "4k";
  count: number;
  customWidth: number;
  customHeight: number;
};

type Props = {
  isDark: boolean;
  canvasRightInset: number;
  onClose: () => void;
};

const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const RESOLUTION_PRESETS = [
  { label: "1:1", ratio: "1:1", width: 2048, height: 2048 },
  { label: "4:5", ratio: "4:5", width: 2048, height: 2560 },
  { label: "3:4", ratio: "3:4", width: 2160, height: 2880 },
  { label: "16:9", ratio: "16:9", width: 2560, height: 1440 },
  { label: "9:16", ratio: "9:16", width: 1440, height: 2560 },
  { label: "3:2", ratio: "3:2", width: 2400, height: 1600 },
] as const;

const PRODUCT_BACKGROUND_STYLES = [
  {
    name: "商务科技感",
    image: new URL("../../assets/smart-background/business-tech.jpg", import.meta.url).href,
    prompt: "premium business technology showroom, cool white and blue directional lighting, transparent glass, brushed metal, structured display platform, restrained digital light accents and precise commercial reflections. Do not use a domestic living room, rustic materials, or playful cartoon props.",
  },
  {
    name: "中国风",
    image: new URL("../../assets/smart-background/chinese-style.jpg", import.meta.url).href,
    prompt: "Chinese New Oriental commercial scene, refined Guochao aesthetic, vermilion lacquered wood, Chinese lattice or moon-gate structure, rice-paper or ink-wash texture, subtle celadon porcelain or jade details, restrained vermilion, ink black and warm gold palette, elegant Chinese spatial depth and directional lighting. Do not use a generic white-gray western minimalist living room, Scandinavian interior, or plain neutral studio.",
  },
  {
    name: "欧美潮流",
    image: new URL("../../assets/smart-background/western-fashion.jpg", import.meta.url).href,
    prompt: "bold western contemporary fashion campaign, editorial urban studio, saturated color-block architecture, sculptural props, confident magazine composition and directional spotlight. Do not use Chinese traditional elements, restrained neutral home interiors, or generic catalog staging.",
  },
  {
    name: "日韩风",
    image: new URL("../../assets/smart-background/jk-pastel.jpg", import.meta.url).href,
    prompt: "Japanese and Korean lifestyle commercial scene, low-saturation pastel palette, light wood, translucent acrylic, linen texture, tidy small-space styling, fresh daylight and soft natural shadows. Do not use neon cyberpunk, heavy luxury ornament, or dark industrial scenery.",
  },
  {
    name: "赛博风",
    image: new URL("../../assets/smart-background/cyberpunk.jpg", import.meta.url).href,
    prompt: "futuristic cyberpunk commercial set, midnight blue and electric magenta light strips, glossy reflective metal floor, layered digital architecture, atmospheric haze and crisp rim light. Do not use a living room, daylight studio, or soft Scandinavian styling.",
  },
  {
    name: "可爱呆萌系",
    image: new URL("../../assets/smart-background/cute-toy.jpg", import.meta.url).href,
    prompt: "cute playful commercial scene, pastel candy palette, rounded oversized props, plush toy texture, soft colorful lighting and cheerful 3D display design. Do not use dark mature interiors, industrial materials, or minimal monochrome staging.",
  },
  {
    name: "二次元系",
    image: new URL("../../assets/smart-background/anime-style.jpg", import.meta.url).href,
    prompt: "polished anime-style commercial background, illustrated architecture, cel-shaded props, graphic perspective lines, vibrant anime palette and dynamic light. Keep the uploaded product photorealistic and unchanged; do not redraw it as an illustration.",
  },
] as const;

const PRODUCT_COMPOSITIONS = [
  { id: "center", label: "居中主视觉", icon: AlignCenter, prompt: "Place the product in the visual center with balanced surrounding space and a clear hero presentation." },
  { id: "left", label: "左侧留白", icon: AlignLeft, prompt: "Place the product on the left third of the frame and reserve clean visual space on the right for the background scene." },
  { id: "right", label: "右侧留白", icon: AlignRight, prompt: "Place the product on the right third of the frame and reserve clean visual space on the left for the background scene." },
  { id: "bottom", label: "底部陈列", icon: ArrowDownToLine, prompt: "Place the product low in the frame on a grounded display surface, leaving a richer upper background with spatial depth." },
  { id: "diagonal", label: "斜向布局", icon: MoveDiagonal2, prompt: "Use an asymmetrical diagonal composition with the product offset to create movement while keeping the product fully visible." },
] as const;

const PRODUCT_SCALES = [
  { id: "small", label: "留白展示", icon: Minimize2, prompt: "Keep the product at about 25% to 35% of the frame so the commercial background and spatial story remain clearly visible." },
  { id: "medium", label: "均衡陈列", icon: Scan, prompt: "Keep the product at about 40% to 55% of the frame for a balanced product-and-scene composition." },
  { id: "large", label: "产品聚焦", icon: Maximize2, prompt: "Keep the product at about 60% to 72% of the frame for a bold hero-product composition without cropping it." },
] as const;

type ResolutionPreset = (typeof RESOLUTION_PRESETS)[number];

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const value = event.target?.result;
      if (typeof value === "string") resolve(value);
      else reject(new Error("图片读取失败"));
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
      <h3 className="text-[11px] font-semibold leading-5 text-inherit">
        {children}
      </h3>
      {aside ? <span className="text-[10px] leading-4 opacity-55">{aside}</span> : null}
    </div>
  );
}

function getOutputSize(preset: ResolutionPreset, resolution: "2k" | "4k") {
  const scale = resolution === "4k" ? 3840 / 2560 : 1;
  if (resolution === "2k") {
    return { width: preset.width, height: preset.height };
  }
  return {
    width: Math.max(1, Math.round(preset.width * scale)),
    height: Math.max(1, Math.round(preset.height * scale)),
  };
}

export function SmartCommerceProductDialog({
  isDark,
  canvasRightInset,
  onClose,
}: Props) {
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [imageSrc, setImageSrc] = useState("");
  const [fileName, setFileName] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<(typeof PRODUCT_BACKGROUND_STYLES)[number]>(
    PRODUCT_BACKGROUND_STYLES[0]
  );
  const [selectedComposition, setSelectedComposition] = useState<(typeof PRODUCT_COMPOSITIONS)[number]>(
    PRODUCT_COMPOSITIONS[0]
  );
  const [selectedProductScale, setSelectedProductScale] = useState<(typeof PRODUCT_SCALES)[number]>(
    PRODUCT_SCALES[1]
  );
  const [showPicwishSelector, setShowPicwishSelector] = useState(false);
  const [selectedPicwishTemplate, setSelectedPicwishTemplate] = useState<PicWishBackgroundTemplate>();
  const [resolution, setResolution] = useState<"2k" | "4k">("2k");
  const [count, setCount] = useState(1);
  const [selectedPreset, setSelectedPreset] =
    useState<ResolutionPreset>(RESOLUTION_PRESETS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [hasDispatched, setHasDispatched] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);

  const colors = {
    panel: isDark ? "rgba(18,18,25,0.985)" : "rgba(255,255,255,0.99)",
    surface: isDark ? "rgba(255,255,255,0.055)" : "rgba(22,22,34,0.035)",
    surfaceStrong: isDark ? "rgba(255,255,255,0.085)" : "rgba(22,22,34,0.055)",
    border: isDark ? "rgba(255,255,255,0.11)" : "rgba(22,22,34,0.11)",
    text: isDark ? "rgba(255,255,255,0.92)" : "rgba(22,22,34,0.92)",
    muted: isDark ? "rgba(255,255,255,0.58)" : "rgba(22,22,34,0.55)",
    accent: "#C5ED47",
  };

  const clampPanelPosition = useCallback((left: number, top: number) => {
    if (typeof window === "undefined") return { left, top };
    const panelWidth = panelRef.current?.offsetWidth || Math.min(720, window.innerWidth - 32);
    const panelHeight = panelRef.current?.offsetHeight || Math.min(720, window.innerHeight - 32);
    return {
      left: Math.min(Math.max(16, left), Math.max(16, window.innerWidth - panelWidth - 16)),
      top: Math.min(Math.max(16, top), Math.max(16, window.innerHeight - panelHeight - 16)),
    };
  }, []);

  const defaultPanelPosition = useCallback(() => {
    if (typeof window === "undefined") return { left: 24, top: 76 };
    const panelWidth = panelRef.current?.offsetWidth || Math.min(720, window.innerWidth - 32);
    const canvasWidth = Math.max(360, window.innerWidth - canvasRightInset);
    return clampPanelPosition(Math.round((canvasWidth - panelWidth) / 2), 76);
  }, [canvasRightInset, clampPanelPosition]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPanelPosition(defaultPanelPosition()));
    return () => window.cancelAnimationFrame(frame);
  }, [defaultPanelPosition]);

  useEffect(() => {
    const handleResize = () =>
      setPanelPosition(current =>
        current
          ? clampPanelPosition(current.left, current.top)
          : defaultPanelPosition()
      );
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPanelPosition, defaultPanelPosition]);

  const outputSize = getOutputSize(selectedPreset, resolution);

  const setUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    try {
      const src = await readImageFile(file);
      setImageSrc(src);
      setFileName(file.name);
    } catch (error) {
      toast("图片读取失败", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = Array.from(event.dataTransfer.files).find(item =>
      item.type.startsWith("image/")
    );
    if (file) {
      await setUpload(file);
      return;
    }
    const html = event.dataTransfer.getData("text/html");
    const uri = event.dataTransfer.getData("text/uri-list").split("\n").find(Boolean);
    const plain = event.dataTransfer.getData("text/plain").trim();
    const htmlSrc = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
    const src = htmlSrc || uri || (/^https?:\/\//i.test(plain) ? plain : "");
    if (!src) {
      toast("没有读取到图片");
      return;
    }
    setImageSrc(src);
    setFileName("网页产品图");
  };

  const handleCreate = () => {
    if (!imageSrc) {
      toast("请先上传产品图片");
      return;
    }
    const trimmedPrompt = userPrompt.trim();
    setIsCreating(true);
    const prompt = [
      trimmedPrompt
        ? `用户明确要求：${trimmedPrompt}`
        : "用户未输入额外要求：创建真实、干净、有商业质感的产品背景。",
      selectedPicwishTemplate ? `PicWish 背景模板：${selectedPicwishTemplate.name}` : `补充风格方向：${selectedStyle.prompt}`,
      `产品构图要求：${selectedComposition.prompt}`,
      `产品占画面比例要求：${selectedProductScale.prompt}`,
      "保持上传产品图的商品主体完整清晰，不改变产品颜色、材质、文字、标识、比例和外形。",
      "风格只能影响背景、道具和环境氛围，不能卡通化、重绘或重新解释产品主体。",
      "用户明确要求与风格方向冲突时，以用户明确要求为准。",
      "只生成与用户提示词匹配的商业化背景、真实光影、空间和氛围。",
    ].join("\n");
    const detail: SmartCommerceProductCreateDetail = {
      imageSrc,
      fileName,
      userPrompt: trimmedPrompt || selectedPicwishTemplate?.name || selectedStyle.name,
      prompt,
      style: selectedStyle.name,
      composition: selectedComposition.id,
      productScale: selectedProductScale.id,
      sceneType: selectedPicwishTemplate?.id,
      ratio: selectedPreset.ratio,
      resolution,
      count,
      customWidth: outputSize.width,
      customHeight: outputSize.height,
    };
    window.dispatchEvent(
      new CustomEvent<SmartCommerceProductCreateDetail>(
        "smart-commerce-product-create",
        { detail }
      )
    );
    setHasDispatched(true);
    window.setTimeout(() => setIsCreating(false), 250);
  };

  const uploadSlot = (
    <div
      role="button"
      tabIndex={0}
      className="relative flex min-h-[236px] w-full flex-col items-center justify-center overflow-hidden rounded-md px-4 text-center transition-colors"
      style={{
        color: colors.text,
        background: colors.surface,
        border: `1px dashed ${imageSrc ? "rgba(197,237,71,0.62)" : colors.border}`,
      }}
      onClick={() => productInputRef.current?.click()}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        productInputRef.current?.click();
      }}
      onDragOver={event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={event => void handleDrop(event)}
    >
      {imageSrc ? (
        <>
          <img
            src={imageSrc}
            alt={fileName || "产品图"}
            className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)] object-contain"
            draggable={false}
          />
          <span className="absolute right-2 top-2 flex gap-1">
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-semibold"
              style={{
                color: colors.text,
                background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.92)",
                border: `1px solid ${colors.border}`,
              }}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                productInputRef.current?.click();
              }}
              aria-label="替换产品图"
              title="替换产品图"
            >
              <RefreshCw size={11} />
              替换
            </button>
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded px-2 text-[10px] font-semibold"
              style={{
                color: "#F87171",
                background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.92)",
                border: `1px solid ${colors.border}`,
              }}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                setImageSrc("");
                setFileName("");
              }}
              aria-label="删除产品图"
              title="删除产品图"
            >
              <Trash2 size={11} />
              删除
            </button>
          </span>
          <span
            className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-1.5 text-left text-[10px] font-medium"
            style={{
              color: colors.text,
              background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.88)",
              border: `1px solid ${colors.border}`,
            }}
          >
            {fileName || "产品图"}
          </span>
        </>
      ) : (
        <>
          <span
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-md"
            style={{ color: colors.accent, background: "rgba(197,237,71,0.12)" }}
          >
            <ImagePlus size={20} />
          </span>
          <span className="text-[12px] font-semibold">上传产品图片</span>
          <span className="mt-1 max-w-[240px] text-[10px] leading-4" style={{ color: colors.muted }}>
            拖入图片或选择本地文件，生成时会保护产品主体，只创建新背景。
          </span>
        </>
      )}
      <input
        ref={productInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          if (file) void setUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );

  const canGenerate = Boolean(imageSrc && !isCreating);

  const dialog = (
    <div className="fixed inset-0 z-[3500] pointer-events-none">
      <div
        ref={panelRef}
        className="fixed flex max-h-[calc(100dvh-32px)] w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg"
        style={{
          pointerEvents: "auto",
          left: panelPosition?.left ?? 16,
          top: panelPosition?.top ?? 76,
          color: colors.text,
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 18px 48px rgba(0,0,0,0.24)",
          backdropFilter: "blur(22px)",
        }}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <header
          className="flex cursor-grab touch-none items-start justify-between gap-4 px-5 py-3.5 active:cursor-grabbing"
          style={{ borderBottom: `1px solid ${colors.border}` }}
          onPointerDown={event => {
            if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,textarea,select")) return;
            const rect = panelRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragRef.current = {
              pointerId: event.pointerId,
              offsetX: event.clientX - rect.left,
              offsetY: event.clientY - rect.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            setPanelPosition(
              clampPanelPosition(
                event.clientX - drag.offsetX,
                event.clientY - drag.offsetY
              )
            );
          }}
          onPointerUp={event => {
            if (dragRef.current?.pointerId !== event.pointerId) return;
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ color: colors.accent, background: "rgba(197,237,71,0.11)" }}
            >
              <Boxes size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold leading-5">智能电商产品</h2>
                <Sparkles size={13} style={{ color: colors.accent }} />
              </div>
              <p className="mt-0.5 hidden text-[10px] leading-4 sm:block" style={{ color: colors.muted }}>
                上传产品图片，输入背景要求，选择数量和输出分辨率。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GripHorizontal size={16} style={{ color: colors.muted }} />
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:opacity-70"
              style={{ color: colors.muted }}
              onClick={onClose}
              aria-label="关闭智能电商产品"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
            <section className="min-w-0">
              <SectionTitle aside="必选">产品图片</SectionTitle>
              {uploadSlot}

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_104px]">
                <div>
                  <SectionTitle>常用画幅</SectionTitle>
                  <div className="grid grid-cols-3 gap-1.5">
                    {RESOLUTION_PRESETS.map(preset => {
                      const active = selectedPreset.ratio === preset.ratio;
                      return (
                        <button
                          key={preset.ratio}
                          type="button"
                          className="h-10 min-w-0 overflow-hidden rounded-md px-1.5 text-left text-[10px] font-semibold transition-colors"
                          style={{
                            color: colors.text,
                            background: active ? "rgba(197,237,71,0.13)" : colors.surface,
                            border: `1px solid ${active ? "rgba(197,237,71,0.58)" : colors.border}`,
                          }}
                          onClick={() => setSelectedPreset(preset)}
                        >
                          <span className="block leading-4">{preset.label}</span>
                          <span
                            className="block truncate whitespace-nowrap text-[8px] leading-3 tabular-nums"
                            style={{ color: colors.muted }}
                          >
                            {preset.width}×{preset.height}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <SectionTitle>分辨率</SectionTitle>
                  <div className="grid grid-rows-2 gap-1.5">
                    {(["2k", "4k"] as const).map(item => (
                      <button
                        key={item}
                        type="button"
                        className="h-10 rounded-md text-[10px] font-semibold uppercase transition-colors"
                        style={{
                          color: colors.text,
                          background: resolution === item ? "rgba(197,237,71,0.13)" : colors.surface,
                          border: `1px solid ${resolution === item ? "rgba(197,237,71,0.58)" : colors.border}`,
                        }}
                        onClick={() => setResolution(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="min-w-0">
              <SectionTitle aside="用于生成背景">提示词</SectionTitle>
              <textarea
                className="min-h-[112px] w-full resize-none rounded-md px-3 py-2 text-[11px] leading-5 outline-none"
                style={{
                  color: colors.text,
                  background: colors.surface,
                  border: `1px solid ${colors.border}`,
                }}
                value={userPrompt}
                onChange={event => setUserPrompt(event.target.value)}
                placeholder="例如：干净的高级灰摄影棚背景，柔和侧光，产品底部有自然接触阴影。"
              />

              <div className="mt-4">
                <SectionTitle aside="用户要求优先">背景风格</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <button
                    type="button"
                    className="relative h-14 overflow-hidden rounded-md text-left flex items-center justify-center"
                    style={{
                      border: `1px solid ${showPicwishSelector ? "rgba(197,237,71,0.68)" : colors.border}`,
                      background: colors.surface,
                    }}
                    onClick={() => setShowPicwishSelector(true)}
                    title="PicWish 背景模板库"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Sparkles size={14} style={{ color: colors.accent }} />
                      <span className="text-[9px] font-semibold text-center px-1">PicWish 模板</span>
                    </div>
                  </button>
                  {PRODUCT_BACKGROUND_STYLES.map(style => {
                    const active = !selectedPicwishTemplate && selectedStyle.name === style.name;
                    return (
                      <button
                        key={style.name}
                        type="button"
                        className="relative h-14 overflow-hidden rounded-md text-left"
                        style={{
                          border: `1px solid ${active ? "rgba(197,237,71,0.68)" : colors.border}`,
                        }}
                        onClick={() => { setSelectedStyle(style); setSelectedPicwishTemplate(undefined); }}
                      >
                        <img
                          src={style.image}
                          alt={`${style.name}背景风格`}
                          className="absolute inset-0 h-full w-full object-cover"
                          draggable={false}
                        />
                        <span className="absolute inset-0 bg-black/45" />
                        <span className="absolute inset-x-2 bottom-1.5 truncate text-[10px] font-semibold text-white">
                          {style.name}
                        </span>
                        {active ? (
                          <Check className="absolute right-1.5 top-1.5" size={12} style={{ color: colors.accent }} />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle>产品构图</SectionTitle>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRODUCT_COMPOSITIONS.map(composition => {
                    const active = selectedComposition.id === composition.id;
                    const Icon = composition.icon;
                    return (
                      <button
                        key={composition.id}
                        type="button"
                        className="flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[9px] font-semibold transition-colors"
                        style={{
                          color: active ? colors.text : colors.muted,
                          background: active ? "rgba(197,237,71,0.13)" : colors.surface,
                          border: `1px solid ${active ? "rgba(197,237,71,0.58)" : colors.border}`,
                        }}
                        onClick={() => setSelectedComposition(composition)}
                        title={composition.label}
                      >
                        <Icon size={14} />
                        <span className="max-w-full truncate whitespace-nowrap">{composition.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle>产品占画面比例</SectionTitle>
                <div className="grid grid-cols-3 gap-1.5">
                  {PRODUCT_SCALES.map(scale => {
                    const active = selectedProductScale.id === scale.id;
                    const Icon = scale.icon;
                    return (
                      <button
                        key={scale.id}
                        type="button"
                        className="flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-semibold transition-colors"
                        style={{
                          color: active ? colors.text : colors.muted,
                          background: active ? "rgba(197,237,71,0.13)" : colors.surface,
                          border: `1px solid ${active ? "rgba(197,237,71,0.58)" : colors.border}`,
                        }}
                        onClick={() => setSelectedProductScale(scale)}
                        title={scale.label}
                      >
                        <Icon size={13} />
                        <span className="truncate whitespace-nowrap">{scale.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle>生成数量</SectionTitle>
                <div className="grid grid-cols-9 gap-1">
                  {IMAGE_COUNTS.map(item => (
                    <button
                      key={item}
                      type="button"
                      className="h-9 rounded-md text-[10px] font-semibold transition-colors"
                      style={{
                        color: count === item ? "#172000" : colors.text,
                        background: count === item ? colors.accent : colors.surface,
                        border: `1px solid ${count === item ? "rgba(197,237,71,0.75)" : colors.border}`,
                      }}
                      onClick={() => setCount(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {hasDispatched ? (
                <div
                  className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-[10px] leading-4"
                  style={{
                    color: colors.text,
                    background: colors.surfaceStrong,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <Check size={13} style={{ color: colors.accent }} />
                  生成任务已发送到画布，结果会在产品图右侧生成。
                </div>
              ) : null}
            </section>
          </div>
        </div>

        {showPicwishSelector ? <PicwishBackgroundSelector isDark={isDark} selectedTemplate={selectedPicwishTemplate} onSelect={setSelectedPicwishTemplate} onClose={() => setShowPicwishSelector(false)} /> : null}
        <footer
          className="flex items-center justify-between gap-3 px-5 py-3"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <span className="flex min-w-0 items-center gap-2 text-[10px]" style={{ color: colors.muted }}>
            <FileImage size={13} />
            {selectedPreset.label} · {resolution.toUpperCase()} · {count} 张
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-md px-4 text-[11px] font-semibold"
              style={{ color: colors.text, background: colors.surface }}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canGenerate}
              className="flex h-9 items-center gap-2 rounded-md px-4 text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ color: "#172000", background: colors.accent }}
              onClick={handleCreate}
            >
              {isCreating ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
              生成产品图
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
