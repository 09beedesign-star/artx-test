/**
 * UploadDialog — 创意社区上传对话框
 * 包含 5 项必选声明 + 免责条款确认 + 标签选择
 */
import { useState, useRef } from "react";
import { communityAuthHeaders } from "@/lib/community-client";
import { useTheme } from "@/contexts/ThemeContext";
import { X, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { DESIGN_TAGS, TAG_CATEGORIES } from "@/shared/design-tags";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledData?: {
    imageUrl?: string;
    prompt?: string;
    title?: string;
  };
}

export default function UploadDialog({ open, onOpenChange, prefilledData }: UploadDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "#1e1e1e" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#161616";
  const subText = isDark ? "#999" : "#666";
  const border = isDark ? "#2a2a2a" : "#e5e5e5";
  const inputBg = isDark ? "#2a2a2a" : "#f5f5f5";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(prefilledData?.imageUrl || "");
  const [title, setTitle] = useState(prefilledData?.title || "");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState(prefilledData?.prompt || "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // 5 项必选声明
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [isOriginal, setIsOriginal] = useState(false);
  const [isOpenSource, setIsOpenSource] = useState(false);
  const [allowCommercialUse, setAllowCommercialUse] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = selectedFile && 
    isAiGenerated !== null && 
    isOriginal !== null && 
    isOpenSource !== null && 
    allowCommercialUse !== null && 
    disclaimerAccepted &&
    selectedTags.length > 0;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("图片大小不能超过 10MB");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  }

  function toggleTag(tagId: string) {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", selectedFile!);
      formData.append("title", title);
      formData.append("description", description);
      formData.append("prompt", prompt);
      formData.append("tags", JSON.stringify(selectedTags));
      formData.append("isAiGenerated", String(isAiGenerated));
      formData.append("isOriginal", String(isOriginal));
      formData.append("isOpenSource", String(isOpenSource));
      formData.append("allowCommercialUse", String(allowCommercialUse));
      formData.append("disclaimerAccepted", String(disclaimerAccepted));

      const response = await fetch("/api/community/posts", {
        method: "POST",
        headers: communityAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "上传失败");
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败,请重试");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      <div style={{ background: bg, borderRadius: "var(--radius-lg)", width: "90%", maxWidth: "600px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${border}` }}>
        {/* Header */}
        <div style={{ padding: "var(--space-lg)", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="type-headline" style={{ color: text }}>上传作品</h2>
          <button onClick={() => onOpenChange(false)} style={{ background: "none", border: "none", cursor: "pointer", color: subText }}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          {/* File Upload */}
          <div>
            <label className="type-body-strong" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>选择图片</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            {previewUrl ? (
              <div style={{ position: "relative", borderRadius: "var(--radius-md)", overflow: "hidden", border: `1px solid ${border}` }}>
                <img src={previewUrl} alt="预览" style={{ width: "100%", maxHeight: "300px", objectFit: "contain", background: "#000" }} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="type-caption"
                  style={{ position: "absolute", top: "var(--space-sm)", right: "var(--space-sm)", padding: "var(--space-xs) var(--space-sm)", background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                >
                  更换图片
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ width: "100%", padding: "var(--space-lg)", border: `2px dashed ${border}`, borderRadius: "var(--radius-md)", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-sm)" }}
              >
                <Upload size={32} style={{ color: subText }} />
                <span className="type-body" style={{ color: subText }}>点击选择图片</span>
                <span className="type-caption" style={{ color: subText }}>支持 JPG、PNG、WEBP,最大 10MB</span>
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="type-body-strong" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>标题(可选)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="为你的作品起个标题"
              className="type-body"
              style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="type-body-strong" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>描述(可选)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="介绍一下你的创作思路"
              className="type-body"
              style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text, minHeight: "80px", resize: "vertical" }}
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="type-body-strong" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>提示词(可选)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="分享你的提示词,帮助他人学习"
              className="type-body"
              style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text, minHeight: "60px", resize: "vertical" }}
            />
          </div>

          {/* Tags Selection */}
          <div>
            <label className="type-body-strong" style={{ color: text, display: "block", marginBottom: "var(--space-sm)" }}>
              设计标签
              <span className="ml-1 text-rose-400">*</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "var(--space-sm)" }}>
              {Object.entries(TAG_CATEGORIES).map(([catKey, catLabel]) => (
                <div key={catKey} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                  <p className="type-micro" style={{ color: subText, fontWeight: 500 }}>{catLabel}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                    {DESIGN_TAGS.filter(t => t.category === catKey).map(tag => (
                      <label key={tag.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer", padding: "var(--space-xs) var(--space-sm)", borderRadius: "var(--radius-sm)", background: selectedTags.includes(tag.id) ? tag.color + "20" : "transparent", border: `1px solid ${selectedTags.includes(tag.id) ? tag.color : border}`, transition: "all 0.2s" }}>
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(tag.id)}
                          onChange={() => toggleTag(tag.id)}
                          style={{ width: "14px", height: "14px", cursor: "pointer" }}
                        />
                        <span className="type-caption" style={{ color: text, fontSize: "12px" }}>{tag.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {selectedTags.length === 0 && (
              <p className="type-caption" style={{ color: "#ef4444", marginTop: "var(--space-sm)" }}>请至少选择一个标签</p>
            )}
            {selectedTags.length > 0 && (
              <div style={{ marginTop: "var(--space-sm)", display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                {selectedTags.map(tagId => {
                  const tag = DESIGN_TAGS.find(t => t.id === tagId);
                  return (
                    <span key={tagId} className="type-caption" style={{ padding: "2px 8px", background: tag?.color + "20", color: tag?.color, borderRadius: "var(--radius-xs)", border: `1px solid ${tag?.color}` }}>
                      {tag?.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: "var(--space-md)", background: isDark ? "#2a2a2a" : "#f9f9f9", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <p className="type-body-strong" style={{ color: text, marginBottom: "var(--space-xs)" }}>作品声明(必填)</p>
            
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isAiGenerated}
                onChange={e => setIsAiGenerated(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span className="type-body" style={{ color: text }}>此作品为 AI 生成</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isOriginal}
                onChange={e => setIsOriginal(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span className="type-body" style={{ color: text }}>此作品为原创</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isOpenSource}
                onChange={e => setIsOpenSource(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span className="type-body" style={{ color: text }}>愿意开源/分享此作品</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allowCommercialUse}
                onChange={e => setAllowCommercialUse(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span className="type-body" style={{ color: text }}>允许他人商用此作品</span>
            </label>
          </div>

          {/* 免责声明 */}
          <div style={{ padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--space-md)", border: `1px solid #ef4444` }}>
            <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
              <AlertCircle size={20} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <p className="type-body-strong" style={{ color: "#ef4444", marginBottom: "var(--space-xs)" }}>免责声明</p>
                <p className="type-caption" style={{ color: "#ef4444", lineHeight: 1.6 }}>
                  我明确知晓并同意:图片分享和素材上传为用户个人行为,与平台无关。平台只承担素材展示和呈现的义务,一旦产生版权纠纷和责任,平台概不负责。上传即表示我拥有完整的知识产权或已获得必要的授权,并对内容的合法性承担全部责任。
                </p>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={e => setDisclaimerAccepted(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span className="type-body-strong" style={{ color: "#ef4444" }}>我已阅读并同意以上免责声明</span>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ padding: "var(--space-sm)", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
              <AlertCircle size={16} style={{ color: "#ef4444" }} />
              <span className="type-caption" style={{ color: "#ef4444" }}>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "var(--space-lg)", borderTop: `1px solid ${border}`, display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="type-body"
            style={{ padding: "var(--space-sm) var(--space-lg)", background: "none", border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text, cursor: "pointer" }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || uploading}
            className="type-body-strong"
            style={{ padding: "var(--space-sm) var(--space-lg)", background: canSubmit && !uploading ? "#161616" : "#555", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: canSubmit && !uploading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}
          >
            {uploading ? (
              <>正在上传...</>
            ) : (
              <>
                <Upload size={16} />
                上传作品
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}