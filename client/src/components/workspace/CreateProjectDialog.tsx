import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/contexts/ThemeContext";

export interface CreateProjectPayload {
  id: string;
  name: string;
  createdAt: string;
  deliveryAt: string;
  owner: string;
  note: string;
  cover: string | null;
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

  useEffect(() => {
    if (!open) return;
    setName("");
    setCreatedAt(formatToday());
    setDeliveryAt("");
    setOwner("");
    setNote("");
    setCover(null);
  }, [open]);

  const bg = isDark ? "#222222" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.12)" : "#e6e3df";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const text = isDark ? "#f1f1f3" : "#262627";
  const sub = isDark ? "#99999e" : "#777472";

  const fieldClass = "w-full h-10 px-3 rounded-[var(--radius-md-design)] type-caption outline-none transition-colors";
  const labelStyle = { color: sub };
  const inputStyle = { background: inputBg, border: `1px solid ${border}`, color: text };

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
      toast("请填写画板名称");
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
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(560px,calc(100vw-32px))] max-w-none rounded-[var(--radius-lg-design)] border p-0 overflow-hidden"
        style={{ background: bg, borderColor: border, boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}
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
              style={{ color: sub, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" }}
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_150px] gap-4">
            <div className="space-y-3">
              <div>
                <label className="type-caption mb-1.5 block" style={labelStyle}>画板名称</label>
                <input value={name} onChange={e => setName(e.target.value)} className={fieldClass} style={inputStyle} placeholder="输入画板名称..." autoFocus />
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
                <label className="type-caption mb-1.5 block" style={labelStyle}>相关负责人</label>
                <input value={owner} onChange={e => setOwner(e.target.value)} className={fieldClass} style={inputStyle} placeholder="例如：品牌组 / 张三" />
              </div>
              <div>
                <label className="type-caption mb-1.5 block" style={labelStyle}>备注</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full min-h-[92px] px-3 py-2 rounded-[var(--radius-md-design)] type-caption outline-none resize-none"
                  style={inputStyle}
                  placeholder="补充画板目标、交付范围或协作说明..."
                />
              </div>
            </div>

            <div>
              <label className="type-caption mb-1.5 block" style={labelStyle}>封面选择</label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative w-full aspect-[3/4] rounded-[var(--radius-lg-design)] overflow-hidden flex flex-col items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: inputBg, border: `1.5px dashed ${cover ? "rgba(22,22,22,0.55)" : border}`, color: sub }}
              >
                {cover ? (
                  <img src={cover} alt="项目封面预览" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-[var(--radius-lg-design)] flex items-center justify-center" style={{ background: "rgba(22,22,22,0.14)", color: "#161616" }}>
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
              style={{ background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px solid ${border}`, color: text }}
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              className="h-9 min-w-[112px] rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90"
              style={{ background: "#161616", color: "white", boxShadow: "0 6px 24px rgba(48,37,25,0.12)" }}
            >
              创建
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
