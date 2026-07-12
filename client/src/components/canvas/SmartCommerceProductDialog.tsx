import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  FileImage,
  GripHorizontal,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ClipboardCopy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SocialPlatformIcon } from "@/lib/social-media-presets";
import {
  checkCommerceRisk,
  composeCommerceContext,
  createDefaultCommerceSelection,
  fetchCommerceMarkets,
  getCommercePlatformForSelection,
  getCommercePlatformOptions,
  getCompatibleCommerceTemplates,
  getMarketsForCommercePlatform,
  ratioFromCommerceSize,
  repairCommerceSelection,
  riskActionLabel,
  scaleCommerceOutputSize,
  type CommerceMarketsResponse,
  type CommerceComposeResponse,
  type CommerceSelection,
  type CrossBorderComposeInput,
  type CrossBorderRiskResult,
} from "@/lib/cross-border-commerce";

export type SmartCommerceProductCreateDetail = {
  imageSrc: string;
  fileName?: string;
  backgroundReferenceSrc?: string;
  backgroundReferenceName?: string;
  prompt: string;
  style: string;
  ratio: string;
  resolution: "2k" | "4k";
  count: number;
  customWidth: number;
  customHeight: number;
  platformId: string;
  platformLabel: string;
  marketId: string;
  marketLabel: string;
  categoryId: string;
  placementId: string;
  placementLabel: string;
  templateId: string;
  skillId: "commerce-poster-social" | "product-photography";
  auditRecordId: string;
  editableCopySuggestions: string[];
  exportSizes: Array<{
    label: string;
    width: number;
    height: number;
    platform: string;
  }>;
  marketPackageVersion: string;
  platformSpecVersion: string;
  templateVersion: string;
  categoryLabel: string;
  templateLabel: string;
  riskAction: "pass" | "advise" | "rewrite" | "block";
};

type Props = {
  isDark: boolean;
  canvasRightInset: number;
  onClose: () => void;
};

const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const PLATFORM_ICON_NAMES: Record<string, string> = {
  amazon: "亚马逊",
  shopee: "虾皮",
  tiktok_shop: "TikTok",
  lazada: "Lazada",
  douyin: "抖音",
  xiaohongshu: "小红书",
  taobao_tmall: "淘宝 / 天猫",
  jd: "京东",
};

const RISK_TONES = {
  pass: {
    icon: ShieldCheck,
    color: "#7CAA20",
    background: "rgba(124,170,32,0.10)",
    border: "rgba(124,170,32,0.28)",
  },
  advise: {
    icon: AlertTriangle,
    color: "#B37A14",
    background: "rgba(214,154,41,0.10)",
    border: "rgba(214,154,41,0.30)",
  },
  rewrite: {
    icon: ShieldAlert,
    color: "#C36A18",
    background: "rgba(219,113,27,0.10)",
    border: "rgba(219,113,27,0.30)",
  },
  block: {
    icon: ShieldAlert,
    color: "#D14A4A",
    background: "rgba(209,74,74,0.10)",
    border: "rgba(209,74,74,0.30)",
  },
} as const;

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

export function SmartCommerceProductDialog({
  isDark,
  canvasRightInset,
  onClose,
}: Props) {
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [data, setData] = useState<CommerceMarketsResponse | null>(null);
  const [selection, setSelection] = useState<CommerceSelection | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [loadError, setLoadError] = useState("");
  const [imageSrc, setImageSrc] = useState("");
  const [fileName, setFileName] = useState("");
  const [backgroundReferenceSrc, setBackgroundReferenceSrc] = useState("");
  const [backgroundReferenceName, setBackgroundReferenceName] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [resolution, setResolution] = useState<"2k" | "4k">("2k");
  const [count, setCount] = useState(1);
  const [risk, setRisk] = useState<CrossBorderRiskResult | null>(null);
  const [riskState, setRiskState] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");
  const [isComposing, setIsComposing] = useState(false);
  const [composeReceipt, setComposeReceipt] =
    useState<CommerceComposeResponse | null>(null);
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

  const loadMarkets = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");
    try {
      const response = await fetchCommerceMarkets();
      setData(response);
      setSelection(createDefaultCommerceSelection(response));
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setLoadError(error instanceof Error ? error.message : "电商配置加载失败");
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  const clampPanelPosition = useCallback((left: number, top: number) => {
    if (typeof window === "undefined") return { left, top };
    const panelWidth = panelRef.current?.offsetWidth || Math.min(1120, window.innerWidth - 32);
    const panelHeight = panelRef.current?.offsetHeight || Math.min(760, window.innerHeight - 32);
    return {
      left: Math.min(Math.max(16, left), Math.max(16, window.innerWidth - panelWidth - 16)),
      top: Math.min(Math.max(16, top), Math.max(16, window.innerHeight - panelHeight - 16)),
    };
  }, []);

  const defaultPanelPosition = useCallback(() => {
    if (typeof window === "undefined") return { left: 24, top: 76 };
    const panelWidth = panelRef.current?.offsetWidth || Math.min(1120, window.innerWidth - 32);
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

  const platformOptions = useMemo(
    () => (data ? getCommercePlatformOptions(data) : []),
    [data]
  );
  const marketOptions = useMemo(
    () =>
      data && selection
        ? getMarketsForCommercePlatform(data, selection.platformId)
        : [],
    [data, selection]
  );
  const selectedMarket = useMemo(
    () => data?.markets.find(item => item.id === selection?.marketId),
    [data, selection?.marketId]
  );
  const selectedPlatform = useMemo(
    () =>
      data && selection
        ? getCommercePlatformForSelection(
            data,
            selection.marketId,
            selection.platformId
          )
        : undefined,
    [data, selection]
  );
  const selectedPlacement = useMemo(
    () =>
      selectedPlatform?.placements.find(item => item.id === selection?.placementId),
    [selectedPlatform, selection?.placementId]
  );
  const compatibleTemplates = useMemo(
    () =>
      data && selection
        ? getCompatibleCommerceTemplates(
            data,
            selection.platformId,
            selection.placementId
          )
        : [],
    [data, selection]
  );
  const selectedTemplate = useMemo(
    () => compatibleTemplates.find(item => item.id === selection?.templateId),
    [compatibleTemplates, selection?.templateId]
  );
  const selectedOutputSize = useMemo(
    () =>
      selectedPlacement
        ? scaleCommerceOutputSize(
            selectedPlacement.size.width,
            selectedPlacement.size.height,
            resolution
          )
        : null,
    [resolution, selectedPlacement]
  );

  const makeInput = useCallback((): CrossBorderComposeInput | null => {
    if (!selection) return null;
    return {
      ...selection,
      productName: fileName || "用户上传产品",
      productFacts: "仅使用上传产品图中可见且由卖家确认的商品信息。",
      userPrompt: userPrompt.trim(),
    };
  }, [fileName, selection, userPrompt]);

  useEffect(() => {
    const input = makeInput();
    if (!input) {
      setRisk(null);
      setRiskState("idle");
      return;
    }
    const controller = new AbortController();
    setRiskState("checking");
    const timer = window.setTimeout(() => {
      void checkCommerceRisk(input, controller.signal)
        .then(result => {
          setRisk(result);
          setRiskState("ready");
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          setRisk(null);
          setRiskState("error");
          console.warn("[smart-commerce-risk]", error);
        });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [makeInput]);

  const updateSelection = (patch: Partial<CommerceSelection>) => {
    if (!data || !selection) return;
    try {
      setSelection(repairCommerceSelection(data, { ...selection, ...patch }));
    } catch (error) {
      toast("当前组合不可用", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const setUpload = async (file: File, slot: "product" | "background") => {
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    try {
      const src = await readImageFile(file);
      if (slot === "product") {
        setImageSrc(src);
        setFileName(file.name);
      } else {
        setBackgroundReferenceSrc(src);
        setBackgroundReferenceName(file.name);
      }
    } catch (error) {
      toast("图片读取失败", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleDrop = async (
    event: React.DragEvent<HTMLButtonElement>,
    slot: "product" | "background"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const file = Array.from(event.dataTransfer.files).find(item =>
      item.type.startsWith("image/")
    );
    if (file) {
      await setUpload(file, slot);
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
    if (slot === "product") {
      setImageSrc(src);
      setFileName("网页产品图");
    } else {
      setBackgroundReferenceSrc(src);
      setBackgroundReferenceName("网页背景参考图");
    }
  };

  const handleCreate = async () => {
    const input = makeInput();
    if (!imageSrc || !input || !selection || !selectedPlacement || !selectedTemplate) {
      toast("请先完成产品素材和电商配置");
      return;
    }
    if (!risk || risk.action === "block" || risk.action === "rewrite") {
      toast(risk?.action === "block" ? "当前内容已阻止生成" : "请先按建议改写补充要求");
      return;
    }
    setIsComposing(true);
    try {
      const { context, auditRecordId } = await composeCommerceContext(input);
      const outputSize = scaleCommerceOutputSize(
        context.placement.size.width,
        context.placement.size.height,
        resolution
      );
      const detail: SmartCommerceProductCreateDetail = {
        imageSrc,
        fileName,
        backgroundReferenceSrc,
        backgroundReferenceName,
        prompt: context.prompt,
        style: context.template.label,
        ratio: ratioFromCommerceSize(
          context.placement.size.width,
          context.placement.size.height
        ),
        resolution,
        count,
        customWidth: outputSize.width,
        customHeight: outputSize.height,
        platformId: context.platform.id,
        platformLabel: context.platform.label,
        marketId: context.market.id,
        marketLabel: context.market.label,
        categoryId: context.category,
        placementId: context.placement.id,
        placementLabel: context.placement.label,
        templateId: context.template.id,
        skillId: context.skillId,
        auditRecordId,
        editableCopySuggestions: context.editableCopySuggestions,
        exportSizes: context.exportSizes,
        marketPackageVersion: context.marketPackageVersion,
        platformSpecVersion: context.placement.size.source.verifiedAt,
        templateVersion: context.template.trendEvidence.validUntil,
        categoryLabel:
          data?.categories.find(item => item.id === context.category)?.label ||
          context.category,
        templateLabel: context.template.label,
        riskAction: context.risk.action,
      };
      setComposeReceipt({ context, auditRecordId });
      window.dispatchEvent(
        new CustomEvent<SmartCommerceProductCreateDetail>(
          "smart-commerce-product-create",
          { detail }
        )
      );
    } catch (error) {
      toast("智能电商产品配置失败", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsComposing(false);
    }
  };

  const uploadSlot = (
    slot: "product" | "background",
    title: string,
    hint: string,
    src: string,
    name: string,
    inputRef: React.RefObject<HTMLInputElement | null>,
    icon: ReactNode
  ) => (
    <button
      type="button"
      className="relative flex min-h-[154px] w-full flex-col items-center justify-center overflow-hidden rounded-md px-3 text-center transition-colors"
      style={{
        color: colors.text,
        background: colors.surface,
        border: `1px dashed ${src ? "rgba(197,237,71,0.62)" : colors.border}`,
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={event => void handleDrop(event, slot)}
    >
      {src ? (
        <>
          <img
            src={src}
            alt={name || title}
            className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)] object-contain"
            draggable={false}
          />
          <span
            className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-1.5 text-left text-[10px] font-medium"
            style={{
              color: colors.text,
              background: isDark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.88)",
              border: `1px solid ${colors.border}`,
            }}
          >
            {name || title}
          </span>
        </>
      ) : (
        <>
          <span
            className="mb-2 flex h-9 w-9 items-center justify-center rounded-md"
            style={{ color: colors.accent, background: "rgba(197,237,71,0.12)" }}
          >
            {icon}
          </span>
          <span className="text-[11px] font-semibold">{title}</span>
          <span className="mt-1 max-w-[170px] text-[10px] leading-4" style={{ color: colors.muted }}>
            {hint}
          </span>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          if (file) void setUpload(file, slot);
          event.currentTarget.value = "";
        }}
      />
    </button>
  );

  const riskTone = RISK_TONES[risk?.action || "pass"];
  const RiskIcon = riskTone.icon;
  const canGenerate = Boolean(
    imageSrc &&
      selection &&
      selectedPlacement &&
      selectedTemplate &&
      riskState === "ready" &&
      risk &&
      risk.action !== "block" &&
      risk.action !== "rewrite" &&
      !isComposing
  );

  const dialog = (
    <div className="fixed inset-0 z-[3500] pointer-events-none">
      <div
        ref={panelRef}
        className="fixed flex max-h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg"
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
                按平台、国家、品类与用途组合规则，生成可上架与投放的高清产品图。
              </p>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {["产品", "平台", "模板", "风险", "输出"].map((step, index) => (
                  <span key={step} className="flex items-center gap-1 text-[9px]" style={{ color: colors.muted }}>
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold"
                      style={{
                        color: index === 0 && !imageSrc ? colors.muted : "#172000",
                        background:
                          index === 0 && !imageSrc
                            ? colors.surfaceStrong
                            : "rgba(197,237,71,0.88)",
                      }}
                    >
                      {index + 1}
                    </span>
                    {step}
                  </span>
                ))}
              </div>
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

        {composeReceipt ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{ color: "#172000", background: colors.accent }}
              >
                <Check size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold leading-5">
                  生成任务已发送到画布
                </h3>
                <p className="mt-0.5 text-[10px] leading-4" style={{ color: colors.muted }}>
                  图片会按当前平台规格生成到产品图右侧，完成后可在画布中继续编辑和导出。
                </p>
              </div>
            </div>

            <div
              className="mt-5 grid gap-5 border-y py-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]"
              style={{ borderColor: colors.border }}
            >
              <section className="min-w-0">
                <SectionTitle>本次生成配置</SectionTitle>
                <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[10px] sm:grid-cols-3">
                  {[
                    ["平台", composeReceipt.context.platform.label],
                    ["市场", composeReceipt.context.market.label],
                    [
                      "品类",
                      data?.categories.find(
                        item => item.id === composeReceipt.context.category
                      )?.label || composeReceipt.context.category,
                    ],
                    ["图片用途", composeReceipt.context.placement.label],
                    ["爆款模板", composeReceipt.context.template.label],
                    [
                      "高清尺寸",
                      `${selectedOutputSize?.width || composeReceipt.context.placement.size.width}×${selectedOutputSize?.height || composeReceipt.context.placement.size.height}`,
                    ],
                    ["生成数量", `${count} 张`],
                    ["风险结论", riskActionLabel(composeReceipt.context.risk.action)],
                    ["规则版本", composeReceipt.context.marketPackageVersion],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="text-[9px] leading-4" style={{ color: colors.muted }}>
                        {label}
                      </p>
                      <p className="truncate font-medium leading-4">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="min-w-0 lg:border-l lg:pl-5" style={{ borderColor: colors.border }}>
                <SectionTitle>审计记录</SectionTitle>
                <div className="flex min-w-0 items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded px-2 py-2 text-[9px]"
                    style={{ color: colors.muted, background: colors.surface }}
                  >
                    {composeReceipt.auditRecordId}
                  </code>
                  <button
                    type="button"
                    aria-label="复制审计记录 ID"
                    title="复制审计记录 ID"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{ color: colors.text, background: colors.surface }}
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        composeReceipt.auditRecordId
                      );
                      toast("审计记录 ID 已复制");
                    }}
                  >
                    <ClipboardCopy size={13} />
                  </button>
                </div>
                <p className="mt-2 text-[9px] leading-4" style={{ color: colors.muted }}>
                  已记录平台规格、模板版本、风险结论和最终生成上下文。
                </p>
              </section>
            </div>

            <div className="grid gap-5 pt-4 lg:grid-cols-2">
              <section className="min-w-0">
                <SectionTitle>可编辑文案建议</SectionTitle>
                <div className="space-y-1.5">
                  {composeReceipt.context.editableCopySuggestions.map(item => (
                    <div key={item} className="flex items-start gap-2 text-[10px] leading-4">
                      <CheckCircle2
                        size={12}
                        className="mt-0.5 shrink-0"
                        style={{ color: "#7CAA20" }}
                      />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="min-w-0">
                <SectionTitle aside="生成后可在画布导出">相关导出尺寸</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {composeReceipt.context.exportSizes.map(item => (
                    <div
                      key={`${item.label}-${item.width}-${item.height}`}
                      className="min-w-0 rounded-md px-2.5 py-2"
                      style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                    >
                      <p className="truncate text-[9px] font-medium leading-4">{item.label}</p>
                      <p className="text-[9px] leading-4" style={{ color: colors.muted }}>
                        {item.width}×{item.height}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : loadState === "loading" ? (
          <div className="flex min-h-[420px] items-center justify-center gap-2 text-[11px]" style={{ color: colors.muted }}>
            <LoaderCircle size={16} className="animate-spin" />
            正在加载电商平台规则
          </div>
        ) : loadState === "error" ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <AlertTriangle size={22} style={{ color: "#D14A4A" }} />
            <p className="mt-3 text-[12px] font-semibold">电商配置加载失败</p>
            <p className="mt-1 max-w-md text-[10px] leading-4" style={{ color: colors.muted }}>{loadError}</p>
            <button
              type="button"
              className="mt-4 flex h-9 items-center gap-2 rounded-md px-4 text-[11px] font-semibold"
              style={{ color: "#172000", background: colors.accent }}
              onClick={() => void loadMarkets()}
            >
              <RefreshCw size={14} />
              重新加载
            </button>
          </div>
        ) : data && selection ? (
          <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto overflow-x-hidden lg:grid-cols-[220px_minmax(360px,1fr)_280px]">
            <section className="min-w-0 p-4" style={{ borderRight: `1px solid ${colors.border}` }}>
              <SectionTitle aside="产品图必选">产品素材</SectionTitle>
              <div className="space-y-2.5">
                {uploadSlot("product", "添加产品图", "拖入网页图片或选择本地图片", imageSrc, fileName, productInputRef, <ImagePlus size={18} />)}
                {uploadSlot("background", "背景参考图（可选）", "只参考风格、光线和材质，不替换商品", backgroundReferenceSrc, backgroundReferenceName, backgroundInputRef, <FileImage size={18} />)}
              </div>
              <p className="mt-3 text-[9px] leading-4" style={{ color: colors.muted }}>
                产品主体会保持清晰和可识别；背景参考图不会覆盖平台规格与风险规则。
              </p>
            </section>

            <section className="min-w-0 p-4" style={{ borderRight: `1px solid ${colors.border}` }}>
              <SectionTitle aside={`${platformOptions.length} 个平台`}>选择平台</SectionTitle>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {platformOptions.map(platform => {
                  const active = selection.platformId === platform.id;
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      className="flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left text-[10px] font-medium transition-colors"
                      style={{
                        background: active ? "rgba(197,237,71,0.13)" : colors.surface,
                        border: `1px solid ${active ? "rgba(197,237,71,0.58)" : colors.border}`,
                        color: colors.text,
                      }}
                      onClick={() => updateSelection({ platformId: platform.id })}
                    >
                      <span className="shrink-0"><SocialPlatformIcon platform={PLATFORM_ICON_NAMES[platform.id] || platform.label} size={22} /></span>
                      <span className="truncate">{platform.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="min-w-0">
                  <span className="mb-1.5 block text-[10px] font-semibold">国家 / 地区</span>
                  <select
                    className="h-9 w-full rounded-md px-2.5 text-[10px] outline-none"
                    style={{ color: colors.text, background: colors.surface, border: `1px solid ${colors.border}` }}
                    value={selection.marketId}
                    onChange={event => updateSelection({ marketId: event.target.value as CommerceSelection["marketId"] })}
                  >
                    {marketOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="mb-1.5 block text-[10px] font-semibold">商品品类</span>
                  <select
                    className="h-9 w-full rounded-md px-2.5 text-[10px] outline-none"
                    style={{ color: colors.text, background: colors.surface, border: `1px solid ${colors.border}` }}
                    value={selection.categoryId}
                    onChange={event => updateSelection({ categoryId: event.target.value as CommerceSelection["categoryId"] })}
                  >
                    {data.categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-3">
                <SectionTitle aside={selectedPlatform?.label}>图片用途</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {selectedPlatform?.placements.map(item => {
                    const active = selection.placementId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="min-h-12 rounded-md px-2.5 py-2 text-left transition-colors"
                        style={{
                          background: active ? "rgba(197,237,71,0.12)" : colors.surface,
                          border: `1px solid ${active ? "rgba(197,237,71,0.55)" : colors.border}`,
                          color: colors.text,
                        }}
                        onClick={() => updateSelection({ placementId: item.id })}
                      >
                        <span className="block text-[10px] font-semibold leading-4">{item.label}</span>
                        <span className="block text-[9px] leading-4" style={{ color: colors.muted }}>{item.size.width}×{item.size.height}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3">
                <SectionTitle aside={`${compatibleTemplates.length} 个可用模板`}>爆款风格模板</SectionTitle>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {compatibleTemplates.map(item => {
                    const active = selection.templateId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="relative min-h-[72px] rounded-md px-3 py-2.5 text-left transition-colors"
                        style={{
                          background: active ? "rgba(197,237,71,0.11)" : colors.surface,
                          border: `1px solid ${active ? "rgba(197,237,71,0.55)" : colors.border}`,
                          color: colors.text,
                        }}
                        onClick={() => updateSelection({ templateId: item.id })}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-semibold leading-4">{item.label}</span>
                          {active ? <Check size={13} style={{ color: colors.accent }} /> : null}
                        </span>
                        <span className="mt-1 block text-[9px] leading-4" style={{ color: colors.muted }}>{item.summary}</span>
                        <span className="mt-1 block text-[8px] font-medium" style={{ color: item.trendEvidence.label === "运营复核" ? "#C38924" : "#7CAA20" }}>{item.trendEvidence.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-semibold">补充要求（可选）</span>
                <textarea
                  className="min-h-[68px] w-full resize-y rounded-md px-3 py-2 text-[10px] leading-4 outline-none"
                  style={{ color: colors.text, background: colors.surface, border: `1px solid ${colors.border}` }}
                  placeholder="例如：自然日光、真实家居场景，保留本地语言标题区"
                  value={userPrompt}
                  onChange={event => setUserPrompt(event.target.value)}
                />
              </label>
            </section>

            <aside className="min-w-0 p-4">
              <SectionTitle aside={riskState === "checking" ? "检查中" : undefined}>风险检查</SectionTitle>
              <div className="rounded-md p-3" style={{ background: riskTone.background, border: `1px solid ${riskTone.border}` }}>
                <div className="flex items-center gap-2">
                  {riskState === "checking" ? <LoaderCircle size={15} className="animate-spin" style={{ color: riskTone.color }} /> : <RiskIcon size={15} style={{ color: riskTone.color }} />}
                  <span className="text-[10px] font-semibold" style={{ color: riskTone.color }}>
                    {riskState === "checking" ? "正在检查" : riskState === "error" ? "检查暂不可用" : risk ? riskActionLabel(risk.action) : "等待配置"}
                  </span>
                </div>
                {risk?.hits.length ? (
                  <div className="mt-2 space-y-2">
                    {risk.hits.map(hit => (
                      <div key={hit.id} className="text-[9px] leading-4">
                        <p className="font-semibold">{hit.label}</p>
                        <p style={{ color: colors.muted }}>{hit.reason}</p>
                        <p className="mt-0.5" style={{ color: riskTone.color }}>建议：{hit.safeAlternative}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[9px] leading-4" style={{ color: colors.muted }}>
                    {riskState === "ready" ? "当前组合未命中阻止或改写规则。" : "完成平台和模板选择后自动检查。"}
                  </p>
                )}
              </div>

              <div className="mt-4">
                <SectionTitle>输出规格</SectionTitle>
                <div className="rounded-md p-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold">{selectedOutputSize?.width} × {selectedOutputSize?.height}</p>
                      <p className="mt-0.5 text-[9px] leading-4" style={{ color: colors.muted }}>{selectedPlatform?.label} · {selectedPlacement?.label} · {resolution.toUpperCase()}</p>
                    </div>
                    <span className="rounded px-1.5 py-1 text-[8px] font-semibold" style={{ color: "#6B8D18", background: "rgba(197,237,71,0.14)" }}>官方规格</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
                    <span style={{ color: colors.muted }}>平台原始规格</span><span className="text-right">{selectedPlacement?.size.width}×{selectedPlacement?.size.height}</span>
                    <span style={{ color: colors.muted }}>市场</span><span className="text-right">{selectedMarket?.label}</span>
                    <span style={{ color: colors.muted }}>安全区</span><span className="text-right">四周 {selectedPlacement?.size.safeArea.top}%</span>
                    <span style={{ color: colors.muted }}>模板</span><span className="text-right">{selectedTemplate?.label}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle>清晰度</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["2k", "4k"] as const).map(item => (
                    <button
                      key={item}
                      type="button"
                      className="h-9 rounded-md text-[10px] font-semibold uppercase"
                      style={{
                        color: colors.text,
                        background: resolution === item ? "rgba(197,237,71,0.13)" : colors.surface,
                        border: `1px solid ${resolution === item ? "rgba(197,237,71,0.56)" : colors.border}`,
                      }}
                      onClick={() => setResolution(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <SectionTitle aside="最多 9 张">生成数量</SectionTitle>
                <div className="grid grid-cols-9 gap-1">
                  {IMAGE_COUNTS.map(item => (
                    <button
                      key={item}
                      type="button"
                      className="aspect-square min-w-0 rounded text-[9px] font-semibold"
                      style={{
                        color: colors.text,
                        background: count === item ? "rgba(197,237,71,0.15)" : colors.surface,
                        border: `1px solid ${count === item ? "rgba(197,237,71,0.58)" : colors.border}`,
                      }}
                      onClick={() => setCount(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 text-[9px] leading-4" style={{ color: colors.muted }}>
                <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: "#7CAA20" }} />
                <p>价格、折扣、认证、法律与功效文字不会直接烘焙进图片，将作为可编辑建议返回。</p>
              </div>
            </aside>
          </div>
        ) : null}

        <footer className="flex shrink-0 items-center justify-between gap-3 px-5 py-3" style={{ borderTop: `1px solid ${colors.border}` }}>
          {composeReceipt ? (
            <>
              <div className="hidden min-w-0 text-[9px] leading-4 sm:block" style={{ color: colors.muted }}>
                {composeReceipt.context.platform.label} · {composeReceipt.context.market.label} · {composeReceipt.context.placement.label}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md px-4 text-[10px] font-semibold"
                  style={{ color: colors.text, background: colors.surface, border: `1px solid ${colors.border}` }}
                  onClick={() => setComposeReceipt(null)}
                >
                  继续调整
                </button>
                <button
                  type="button"
                  className="flex h-9 min-w-[132px] items-center justify-center gap-2 rounded-md px-4 text-[10px] font-semibold"
                  style={{ color: "#172000", background: colors.accent }}
                  onClick={onClose}
                >
                  查看画布
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="hidden min-w-0 text-[9px] leading-4 sm:block" style={{ color: colors.muted }}>
                {selection && selectedPlatform && selectedPlacement && selectedTemplate
                  ? `${selectedPlatform.label} · ${selectedMarket?.label} · ${selectedPlacement.label} · ${selectedTemplate.label}`
                  : "请完成电商配置"}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="h-9 rounded-md px-4 text-[10px] font-semibold" style={{ color: colors.text, background: colors.surface, border: `1px solid ${colors.border}` }} onClick={onClose}>
                  取消
                </button>
                <button
                  type="button"
                  disabled={!canGenerate}
                  className="flex h-9 min-w-[176px] items-center justify-center gap-2 rounded-md px-4 text-[10px] font-semibold disabled:cursor-not-allowed"
                  style={{
                    color: canGenerate ? "#172000" : colors.muted,
                    background: canGenerate ? colors.accent : colors.surfaceStrong,
                    opacity: canGenerate ? 1 : 0.62,
                  }}
                  onClick={() => void handleCreate()}
                >
                  {isComposing ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {isComposing ? "正在组合电商规则" : `生成智能电商产品图 ${count} 张`}
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(dialog, document.body);
}
