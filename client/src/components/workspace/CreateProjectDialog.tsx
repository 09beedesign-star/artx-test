import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/contexts/ThemeContext";
import { SOCIAL_MEDIA_SIZE_PRESETS, SocialPlatformIcon, type SocialMediaSizePreset } from "@/lib/social-media-presets";

export interface CreateProjectPayload {
  id: string;
  name: string;
  createdAt: string;
  deliveryAt: string;
  owner: string;
  note: string;
  cover: string | null;
  socialPreset?: SocialMediaSizePreset | null;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: CreateProjectPayload) => void;
  title?: string;
}

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

function makeProjectId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function createCoverThumbnail(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    const maxSide = 520;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || maxSide, image.naturalHeight || maxSide));
    const width = Math.max(1, Math.round((image.naturalWidth || maxSide) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || maxSide) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CreateProjectDialog({
  open,
  onOpenChange,
  onCreate,
  title = "新建画布",
}: CreateProjectDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [createdAt, setCreatedAt] = useState(formatToday());
  const [deliveryAt, setDeliveryAt] = useState("");
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [socialSizeOpen, setSocialSizeOpen] = useState(false);
  const [socialPresetId, setSocialPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCreatedAt(formatToday());
    setDeliveryAt("");
    setOwner("");
    setNote("");
    setCover(null);
    setSocialSizeOpen(false);
    setSocialPresetId(null);
  }, [open]);

  const bg = isDark ? "oklch(0.15 0.018 270)" : "oklch(0.995 0.002 80)";
  const border = isDark ? "oklch(1 0 0 / 12%)" : "oklch(0.88 0.006 255)";
  const inputBg = isDark ? "oklch(1 0 0 / 6%)" : "oklch(0 0 0 / 4%)";
  const text = isDark ? "oklch(0.85 0.01 270)" : "oklch(0.22 0.018 255)";
  const sub = isDark ? "oklch(0.58 0.01 270)" : "oklch(0.50 0.012 255)";

  const fieldClass = "w-full h-10 px-3 rounded-[var(--radius-md-design)] type-caption outline-none transition-colors";
  const labelStyle = { color: sub };
  const inputStyle = { background: inputBg, border: `1px solid ${border}`, color: text };
  const selectedSocialPreset = SOCIAL_MEDIA_SIZE_PRESETS.find(preset => preset.id === socialPresetId) || null;
  const socialPlatforms = Array.from(new Set(SOCIAL_MEDIA_SIZE_PRESETS.map(preset => preset.platform)));

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    try {
      setCover(await createCoverThumbnail(file));
    } catch {
      toast("封面读取失败");
    }
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("请填写项目名称");
      return;
    }
    onCreate({
      id: makeProjectId(),
      name: trimmed,
      createdAt,
      deliveryAt,
      owner: owner.trim(),
      note: note.trim(),
      cover,
      socialPreset: selectedSocialPreset,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(560px,calc(100vw-32px))] max-w-none rounded-[var(--radius-lg-design)] border p-0 overflow-hidden"
        style={{ background: bg, borderColor: border, boxShadow: "0 24px 80px oklch(0 0 0 / 0.35)" }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="gap-2 text-left">
              <DialogTitle className="type-title-sm" style={{ color: text, fontSize: 18, fontWeight: 650 }}>
                {title}
              </DialogTitle>
              <DialogDescription className="type-body-sm leading-6" style={{ color: sub }}>
                填写基础项目信息，并可选择一张本地图片作为画布封面。
              </DialogDescription>
            </DialogHeader>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-[var(--radius-md-design)] flex items-center justify-center transition-opacity hover:opacity-70"
              style={{ color: sub, background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 4%)" }}
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_150px] gap-4">
            <div className="space-y-3">
              <div>
                <label className="type-caption mb-1.5 block" style={labelStyle}>项目名称</label>
                <input value={name} onChange={e => setName(e.target.value)} className={fieldClass} style={inputStyle} placeholder="输入项目名称..." autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="type-caption mb-1.5 block" style={labelStyle}>创建时间</label>
                  <input type="date" value={createdAt} onChange={e => setCreatedAt(e.target.value)} className={fieldClass} style={inputStyle} />
                </div>
                <div>
                  <label className="type-caption mb-1.5 block" style={labelStyle}>交付时间点</label>
                  <input type="date" value={deliveryAt} onChange={e => setDeliveryAt(e.target.value)} className={fieldClass} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="type-caption mb-1.5 block" style={labelStyle}>项目相关负责人</label>
                <input value={owner} onChange={e => setOwner(e.target.value)} className={fieldClass} style={inputStyle} placeholder="例如：品牌组 / 张三" />
              </div>
              <div>
                <label className="type-caption mb-1.5 block" style={labelStyle}>备注</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full min-h-[92px] px-3 py-2 rounded-[var(--radius-md-design)] type-caption outline-none resize-none"
                  style={inputStyle}
                  placeholder="补充项目目标、交付范围或协作说明..."
                />
              </div>
              <div
                className="overflow-hidden rounded-[var(--radius-md-design)]"
                style={{ background: inputBg, border: `1px solid ${border}` }}
              >
                <button
                  type="button"
                  onClick={() => setSocialSizeOpen(value => !value)}
                  className="flex h-10 w-full items-center justify-between gap-3 px-3 text-left transition-opacity hover:opacity-85"
                  style={{ color: text }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md-design)]" style={{ background: "oklch(0.62 0.22 290 / 0.14)" }}>
                      {selectedSocialPreset ? <SocialPlatformIcon platform={selectedSocialPreset.platform} size={18} /> : <ImageIcon size={14} style={{ color: "oklch(0.62 0.22 290)" }} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate type-caption" style={{ color: text }}>
                        社媒尺寸
                      </span>
                      <span className="block truncate" style={{ color: sub, fontSize: 11 }}>
                        {selectedSocialPreset
                          ? `${selectedSocialPreset.platform} · ${selectedSocialPreset.title} · ${selectedSocialPreset.width} × ${selectedSocialPreset.height}`
                          : "选择平台规格，创建时记录对应画板尺寸"}
                      </span>
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      color: sub,
                      fontSize: 12,
                      transform: socialSizeOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.16s ease",
                    }}
                  >
                    ˅
                  </span>
                </button>

                {socialSizeOpen && (
                  <div
                    className="max-h-[238px] overflow-y-auto"
                    style={{ borderTop: `1px solid ${border}`, scrollbarWidth: "thin" }}
                  >
                    <button
                      type="button"
                      onClick={() => setSocialPresetId(null)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
                      style={{
                        background: !selectedSocialPreset ? "oklch(0.62 0.22 290 / 0.12)" : "transparent",
                        color: text,
                      }}
                    >
                      <span className="type-caption">不使用社媒尺寸</span>
                      {!selectedSocialPreset && <span style={{ color: "oklch(0.62 0.22 290)", fontSize: 12 }}>已选</span>}
                    </button>
                    {socialPlatforms.map(platform => (
                      <div key={platform}>
                        <div
                          className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5"
                          style={{
                            background: isDark ? "rgba(28,28,38,0.98)" : "rgba(250,250,252,0.98)",
                            color: sub,
                            fontSize: 11,
                            fontWeight: 650,
                            borderTop: `1px solid ${border}`,
                          }}
                        >
                          <SocialPlatformIcon platform={platform} size={16} />
                          <span>{platform}</span>
                        </div>
                        {SOCIAL_MEDIA_SIZE_PRESETS.filter(preset => preset.platform === platform).map(preset => {
                          const active = preset.id === socialPresetId;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setSocialPresetId(preset.id);
                                if (!name.trim()) setName(`${preset.platform} ${preset.title}`);
                              }}
                              className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left transition-colors"
                              style={{
                                background: active ? "oklch(0.62 0.22 290 / 0.14)" : "transparent",
                                borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.055)"}`,
                                color: text,
                              }}
                              onMouseEnter={event => {
                                if (!active) event.currentTarget.style.background = isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.035)";
                              }}
                              onMouseLeave={event => {
                                event.currentTarget.style.background = active ? "oklch(0.62 0.22 290 / 0.14)" : "transparent";
                              }}
                            >
                              <span className="min-w-0">
                                <span className="block truncate type-caption" style={{ color: text }}>{preset.title}</span>
                                <span className="block truncate" style={{ color: sub, fontSize: 10 }}>
                                  {Math.round((preset.width / preset.height) * 100) / 100}:1
                                </span>
                              </span>
                              <span style={{ color: active ? "oklch(0.72 0.18 290)" : sub, fontSize: 11, fontWeight: 650, whiteSpace: "nowrap" }}>
                                {preset.width} × {preset.height}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="type-caption mb-1.5 block" style={labelStyle}>封面选择</label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative w-full aspect-[3/4] rounded-[var(--radius-lg-design)] overflow-hidden flex flex-col items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: inputBg, border: `1.5px dashed ${cover ? "oklch(0.62 0.22 290 / 0.55)" : border}`, color: sub }}
              >
                {cover ? (
                  <img src={cover} alt="项目封面预览" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-[var(--radius-lg-design)] flex items-center justify-center" style={{ background: "oklch(0.62 0.22 290 / 0.14)", color: "oklch(0.62 0.22 290)" }}>
                      <Plus size={19} />
                    </div>
                    <span className="type-caption">上传封面</span>
                    <ImageIcon size={14} style={{ opacity: 0.45 }} />
                  </>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="h-9 min-w-[96px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-85"
              style={{ background: isDark ? "oklch(1 0 0 / 5%)" : "oklch(0 0 0 / 0.04)", border: `1px solid ${border}`, color: text }}
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              className="h-9 min-w-[112px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))", color: "white", boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.22)" }}
            >
              创建
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
