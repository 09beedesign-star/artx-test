/**
 * ProfilePage — personal homepage detail page
 * Presents the current user's public profile overview while preserving the artx visual language.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Mail, MapPin, Pencil, Sparkles, Upload, UserRound, X } from "lucide-react";
import { useLocation } from "wouter";
import TopBar from "@/components/workspace/TopBar";
import { BG_GLOW } from "@/lib/workspace-data";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ProfileDraft {
  displayName: string;
  description: string;
  bio: string;
  email: string;
  location: string;
  projects: string;
  tags: string;
  avatar: string;
}

const PROFILE_STORAGE_KEY = "artx:creator-profile";
const DEFAULT_DESCRIPTION = "这是您的 ArtXStudio 创作者主页";

function readStoredProfile(): Partial<ProfileDraft> {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const storageError = error as { name?: string; code?: number };
  return (
    storageError.name === "QuotaExceededError" ||
    storageError.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    storageError.code === 22 ||
    storageError.code === 1014
  );
}

function writeStoredProfile(profile: ProfileDraft) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return { ok: true, avatarDropped: false };
  } catch (error) {
    if (!isQuotaExceededError(error)) return { ok: false, avatarDropped: false };
    try {
      localStorage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({
          ...profile,
          avatar: "",
        })
      );
      return { ok: true, avatarDropped: true };
    } catch {
      return { ok: false, avatarDropped: true };
    }
  }
}

export default function ProfilePage() {
  const { resolvedTheme } = useTheme();
  const { user, changePassword, logout } = useAuth();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);
  const isDark = resolvedTheme === "dark";
  const fallbackName = user?.username || "09bee";
  const [profile, setProfile] = useState<ProfileDraft>(() => {
    const stored = readStoredProfile();
    return {
      displayName: stored.displayName || fallbackName,
      description: stored.description || DEFAULT_DESCRIPTION,
      bio: stored.bio || "专注品牌视觉、社媒内容与 AI 辅助创作流程。这里用于展示用户的公开信息、创作偏好与项目概览，后续可接入真实账号资料和作品数据。",
      email: stored.email || fallbackName,
      location: stored.location || "中国 · 远程协作",
      projects: stored.projects || "已创建 12 个项目",
      tags: stored.tags || "品牌视觉、AI 创作、模板设计、灵感整理",
      avatar: stored.avatar || "",
    };
  });
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(profile);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [avatarEditor, setAvatarEditor] = useState<{
    src: string;
    target: "profile" | "draft";
  } | null>(null);

  useEffect(() => {
    const result = writeStoredProfile(profile);
    if (result.avatarDropped) {
      toast.warning("头像图片过大", {
        description: "文字资料已保存；头像仅在当前页面显示，请换用更小的图片。",
      });
      return;
    }
    if (!result.ok) {
      toast.error("个人资料保存失败，请稍后重试");
    }
  }, [profile]);

  const textPrimary = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.88)";
  const textSecondary = isDark ? "rgba(255,255,255,0.69)" : "rgba(20,20,36,0.56)";
  const textMuted = isDark ? "rgba(255,255,255,0.69)" : "rgba(20,20,36,0.36)";
  const cardBg = isDark ? "#222222" : "rgba(255,255,255,0.76)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(20,20,36,0.10)";
  const panelBg = isDark ? "#222222" : "rgba(255,255,255,0.98)";
  const inputBg = isDark ? "#222222" : "rgba(20,20,36,0.045)";
  const tags = profile.tags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean);

  const handleAvatarFile = (file: File | undefined, target: "profile" | "draft") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (src) setAvatarEditor({ src, target });
    };
    reader.readAsDataURL(file);
  };

  const applyAvatarCrop = (avatar: string) => {
    if (!avatarEditor) return;
    if (avatarEditor.target === "profile") {
      setProfile(current => ({ ...current, avatar }));
      setDraft(current => ({ ...current, avatar }));
    } else {
      setDraft(current => ({ ...current, avatar }));
    }
    setAvatarEditor(null);
    toast.success("头像已更新");
  };

  const openEdit = () => {
    setDraft(profile);
    setEditOpen(true);
  };

  const saveProfile = () => {
    setProfile({
      ...draft,
      displayName: draft.displayName.trim() || fallbackName,
      description: draft.description.trim() || DEFAULT_DESCRIPTION,
      tags: draft.tags.trim() || "品牌视觉、AI 创作、模板设计、灵感整理",
    });
    setEditOpen(false);
    toast.success("个人资料已更新");
  };

  const openPasswordDialog = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordBusy(false);
    setPasswordOpen(true);
  };

  const passwordMismatch = Boolean(confirmPassword && newPassword !== confirmPassword);
  const passwordReady =
    currentPassword.trim().length > 0 &&
    newPassword.trim().length >= 8 &&
    confirmPassword.trim().length >= 8 &&
    !passwordMismatch &&
    !passwordBusy;

  const submitPasswordChange = async () => {
    if (!passwordReady) return;
    setPasswordBusy(true);
    setPasswordError("");
    const result = await changePassword(currentPassword, newPassword);
    setPasswordBusy(false);
    if (!result.ok) {
      setPasswordError(result.error || "密码修改失败");
      return;
    }
    setPasswordOpen(false);
    toast.success("密码修改成功", { description: "请使用新密码重新登录。" });
    logout();
    navigate("/");
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        background: "#222222",
        color: textPrimary,
      }}
    >
      <TopBar credits={0} />
      <main className="relative flex-1 overflow-y-auto px-8 py-8">
        <div className="pointer-events-none absolute inset-0 opacity-0" style={{ background: BG_GLOW }} />
        <div className="relative mx-auto max-w-5xl">
          <section
            className="overflow-hidden rounded-[var(--radius-xl-design)]"
            style={{
              background: cardBg,
              border: `1px solid ${border}`,
              boxShadow: isDark ? "0 24px 72px rgba(0,0,0,0.34)" : "0 24px 72px rgba(20,20,36,0.10)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="h-40" style={{ background: "#222222" }} />
            <div className="px-8 pb-8">
              <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="flex items-end gap-5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                      border: `4px solid ${isDark ? "#222222" : "white"}`,
                      boxShadow: "0 18px 36px oklch(0.58 0.22 290 / 0.28)",
                    }}
                    aria-label="上传个人头像"
                  >
                    {profile.avatar ? (
                      <img src={profile.avatar} alt="个人头像" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={34} color="white" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-[#222222]/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera size={18} color="white" />
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => {
                      handleAvatarFile(event.target.files?.[0], "profile");
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="pb-2">
                    <h1 className="type-title-sm" style={{ color: textPrimary, fontSize: 26, fontWeight: 680 }}>{profile.displayName}</h1>
                    <p className="type-body-sm mt-1" style={{ color: textSecondary }}>{profile.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={openPasswordDialog}
                    className="flex items-center gap-2 rounded-[var(--radius-lg-design)] px-4 py-2 type-caption transition-opacity hover:opacity-85"
                    style={{
                      background: isDark ? "#222222" : "rgba(20,20,36,0.06)",
                      border: `1px solid ${border}`,
                      color: textPrimary,
                    }}
                  >
                    <KeyRound size={14} />
                    修改密码
                  </button>
                  <button
                    onClick={openEdit}
                    className="flex items-center gap-2 rounded-[var(--radius-lg-design)] px-4 py-2 type-caption transition-opacity hover:opacity-85"
                    style={{
                      background: isDark ? "#222222" : "rgba(20,20,36,0.06)",
                      border: `1px solid ${border}`,
                      color: textPrimary,
                    }}
                  >
                    <Pencil size={14} />
                    编辑资料
                  </button>
                </div>
              </div>

              <div className="mt-7 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div
                  className="rounded-[var(--radius-lg-design)] p-5"
                  style={{ background: isDark ? "#222222" : "rgba(255,255,255,0.66)", border: `1px solid ${border}` }}
                >
                  <p className="type-body-sm mb-3" style={{ color: textPrimary, fontWeight: 560 }}>个人简介</p>
                  <p className="type-body-sm leading-7" style={{ color: textSecondary }}>
                    {profile.bio}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className="rounded-[var(--radius-pill)] px-3 py-1 type-caption"
                        style={{ background: isDark ? "#222222" : "rgba(20,20,36,0.06)", color: textSecondary }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-[var(--radius-lg-design)] p-5"
                  style={{ background: isDark ? "#222222" : "rgba(255,255,255,0.66)", border: `1px solid ${border}` }}
                >
                  <p className="type-body-sm mb-4" style={{ color: textPrimary, fontWeight: 560 }}>账号信息</p>
                  <div className="space-y-3 type-caption" style={{ color: textSecondary }}>
                    <div className="flex items-center gap-2"><Mail size={14} style={{ color: textMuted }} /> {profile.email}</div>
                    <div className="flex items-center gap-2"><MapPin size={14} style={{ color: textMuted }} /> {profile.location}</div>
                    <div className="flex items-center gap-2"><Sparkles size={14} style={{ color: textMuted }} /> {profile.projects}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#222222]/35 px-6"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setEditOpen(false);
          }}
        >
          <div
            className="w-[min(620px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-5 shadow-2xl"
            style={{
              background: panelBg,
              border: `1px solid ${border}`,
              color: textPrimary,
              backdropFilter: "blur(18px)",
            }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="type-title-sm" style={{ fontSize: 18, fontWeight: 680 }}>编辑资料</p>
                <p className="type-caption mt-1" style={{ color: textSecondary }}>保存后会立即更新您的创作者主页。</p>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]"
                style={{ background: inputBg, color: textSecondary }}
                aria-label="关闭编辑资料"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mb-5 flex items-center gap-4">
              <button
                type="button"
                onClick={() => editAvatarInputRef.current?.click()}
                className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                  border: `1px solid ${border}`,
                }}
              >
                {draft.avatar ? (
                  <img src={draft.avatar} alt="个人头像预览" className="h-full w-full object-cover" />
                ) : (
                  <UserRound size={24} color="white" />
                )}
              </button>
              <input
                ref={editAvatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                  handleAvatarFile(event.target.files?.[0], "draft");
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => editAvatarInputRef.current?.click()}
                className="flex h-9 items-center gap-2 rounded-[var(--radius-md-design)] px-3 type-caption"
                style={{ background: inputBg, border: `1px solid ${border}`, color: textPrimary }}
              >
                <Upload size={14} />
                上传头像
              </button>
            </div>

            <div className="grid gap-3">
              <ProfileInput label="主页名称" value={draft.displayName} onChange={value => setDraft(current => ({ ...current, displayName: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} />
              <ProfileInput label="主页描述" value={draft.description} onChange={value => setDraft(current => ({ ...current, description: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} />
              <ProfileInput label="个人简介" value={draft.bio} onChange={value => setDraft(current => ({ ...current, bio: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} multiline />
              <div className="grid gap-3 sm:grid-cols-2">
                <ProfileInput label="邮箱/账号" value={draft.email} onChange={value => setDraft(current => ({ ...current, email: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} />
                <ProfileInput label="所在地" value={draft.location} onChange={value => setDraft(current => ({ ...current, location: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ProfileInput label="项目信息" value={draft.projects} onChange={value => setDraft(current => ({ ...current, projects: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} />
                <ProfileInput label="标签" value={draft.tags} onChange={value => setDraft(current => ({ ...current, tags: value }))} inputBg={inputBg} border={border} textPrimary={textPrimary} />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="h-9 min-w-[88px] rounded-[var(--radius-md-design)] type-caption"
                style={{ background: inputBg, border: `1px solid ${border}`, color: textPrimary }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveProfile}
                className="h-9 min-w-[96px] rounded-[var(--radius-md-design)] type-caption"
                style={{
                  background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))",
                  color: "white",
                  boxShadow: "0 8px 24px oklch(0.58 0.22 290 / 0.22)",
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#222222]/35 px-6"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setPasswordOpen(false);
          }}
        >
          <div
            className="w-[min(460px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-5 shadow-2xl"
            style={{
              background: panelBg,
              border: `1px solid ${border}`,
              color: textPrimary,
              backdropFilter: "blur(18px)",
            }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="type-title-sm" style={{ fontSize: 18, fontWeight: 680 }}>修改密码</p>
                <p className="type-caption mt-1" style={{ color: textSecondary }}>修改成功后需要重新登录。</p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]"
                style={{ background: inputBg, color: textSecondary }}
                aria-label="关闭修改密码"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid gap-3">
              <ProfilePasswordInput
                label="当前密码"
                value={currentPassword}
                onChange={setCurrentPassword}
                inputBg={inputBg}
                border={border}
                textPrimary={textPrimary}
                autoComplete="current-password"
              />
              <ProfilePasswordInput
                label="新密码"
                value={newPassword}
                onChange={setNewPassword}
                inputBg={inputBg}
                border={border}
                textPrimary={textPrimary}
                autoComplete="new-password"
                placeholder="至少 8 位，支持中英文和大小写"
              />
              <ProfilePasswordInput
                label="再次输入新密码"
                value={confirmPassword}
                onChange={setConfirmPassword}
                inputBg={inputBg}
                border={border}
                textPrimary={textPrimary}
                autoComplete="new-password"
                placeholder="请再次输入新密码"
              />
            </div>

            <div className="mt-3 min-h-5 type-caption text-red-300">
              {passwordMismatch ? "两次密码不一致" : passwordError}
            </div>

            <button
              type="button"
              disabled={!passwordReady}
              onClick={() => void submitPasswordChange()}
              className="mt-3 h-10 w-full rounded-[var(--radius-md-design)] type-caption transition-opacity hover:opacity-90 disabled:opacity-45"
              style={{
                background: passwordReady
                  ? "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))"
                  : inputBg,
                border: `1px solid ${passwordReady ? "transparent" : border}`,
                color: passwordReady ? "white" : textSecondary,
                boxShadow: passwordReady ? "0 8px 24px oklch(0.58 0.22 290 / 0.22)" : "none",
              }}
            >
              {passwordBusy ? "修改中..." : "修改密码"}
            </button>
          </div>
        </div>
      )}

      {avatarEditor && (
        <AvatarCropDialog
          src={avatarEditor.src}
          isDark={isDark}
          panelBg={panelBg}
          border={border}
          inputBg={inputBg}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          onCancel={() => setAvatarEditor(null)}
          onConfirm={applyAvatarCrop}
        />
      )}
    </div>
  );
}

function ProfilePasswordInput({
  label,
  value,
  onChange,
  inputBg,
  border,
  textPrimary,
  autoComplete,
  placeholder = "请输入密码",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputBg: string;
  border: string;
  textPrimary: string;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="type-caption" style={{ color: "rgba(255,255,255,0.64)" }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-10 rounded-[var(--radius-md-design)] px-3 outline-none placeholder:text-white/32"
        style={{ background: inputBg, border: `1px solid ${border}`, color: textPrimary, fontSize: 13 }}
      />
    </label>
  );
}

function AvatarCropDialog({
  src,
  isDark,
  panelBg,
  border,
  inputBg,
  textPrimary,
  textSecondary,
  onCancel,
  onConfirm,
}: {
  src: string;
  isDark: boolean;
  panelBg: string;
  border: string;
  inputBg: string;
  textPrimary: string;
  textSecondary: string;
  onCancel: () => void;
  onConfirm: (avatar: string) => void;
}) {
  const previewSize = 260;
  const outputSize = 512;
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const minScale = Math.max(
    previewSize / Math.max(1, imageSize.width),
    previewSize / Math.max(1, imageSize.height)
  );
  const maxScale = Math.max(minScale * 4, minScale + 0.1);

  const clampOffset = (nextOffset: { x: number; y: number }, nextScale = scale) => {
    const drawW = imageSize.width * nextScale;
    const drawH = imageSize.height * nextScale;
    const maxX = Math.max(0, (drawW - previewSize) / 2);
    const maxY = Math.max(0, (drawH - previewSize) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, nextOffset.y)),
    };
  };

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || 1;
      const height = image.naturalHeight || 1;
      const nextMinScale = Math.max(previewSize / width, previewSize / height);
      setImageSize({ width, height });
      setScale(nextMinScale);
      setOffset({ x: 0, y: 0 });
    };
    image.src = src;
  }, [src]);

  const handleScaleChange = (nextScale: number) => {
    const boundedScale = Math.max(minScale, Math.min(maxScale, nextScale));
    setScale(boundedScale);
    setOffset(current => clampOffset(current, boundedScale));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nextOffset = {
      x: drag.offsetX + event.clientX - drag.startX,
      y: drag.offsetY + event.clientY - drag.startY,
    };
    setOffset(clampOffset(nextOffset));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const confirmCrop = () => {
    const image = imageRef.current;
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = outputSize / previewSize;
    const drawW = imageSize.width * scale * ratio;
    const drawH = imageSize.height * scale * ratio;
    const drawX = outputSize / 2 - drawW / 2 + offset.x * ratio;
    const drawY = outputSize / 2 - drawH / 2 + offset.y * ratio;
    ctx.clearRect(0, 0, outputSize, outputSize);
    ctx.save();
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    ctx.restore();
    onConfirm(canvas.toDataURL("image/jpeg", 0.86));
  };

  const drawW = imageSize.width * scale;
  const drawH = imageSize.height * scale;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#222222]/45 px-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[min(480px,calc(100vw-32px))] rounded-[var(--radius-xl-design)] p-5 shadow-2xl"
        style={{
          background: panelBg,
          border: `1px solid ${border}`,
          color: textPrimary,
          backdropFilter: "blur(18px)",
        }}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="type-title-sm" style={{ fontSize: 18, fontWeight: 680 }}>编辑头像</p>
            <p className="type-caption mt-1" style={{ color: textSecondary }}>拖拽图片调整位置，使用滑杆放大或缩小。</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md-design)]"
            style={{ background: inputBg, color: textSecondary }}
            aria-label="关闭头像编辑"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-5">
          <div
            className="relative overflow-hidden rounded-full"
            style={{
              width: previewSize,
              height: previewSize,
              background: isDark ? "#191919" : "rgba(20,20,36,0.06)",
              border: `1px solid ${border}`,
              boxShadow: "0 18px 48px rgba(0,0,0,0.26)",
              cursor: "grab",
              touchAction: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={src}
              alt="头像裁剪预览"
              draggable={false}
              style={{
                position: "absolute",
                left: previewSize / 2 - drawW / 2 + offset.x,
                top: previewSize / 2 - drawH / 2 + offset.y,
                width: drawW,
                height: drawH,
                maxWidth: "none",
                maxHeight: "none",
                objectFit: "fill",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.34)" }}
            />
          </div>

          <label className="grid w-full gap-2">
            <span className="type-caption" style={{ color: textSecondary }}>缩放</span>
            <input
              type="range"
              min={minScale}
              max={maxScale}
              step={(maxScale - minScale) / 100}
              value={scale}
              onChange={event => handleScaleChange(Number(event.target.value))}
              className="w-full accent-[#C5ED47]"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 min-w-[88px] rounded-[var(--radius-md-design)] type-caption"
            style={{ background: inputBg, border: `1px solid ${border}`, color: textPrimary }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirmCrop}
            className="h-9 min-w-[96px] rounded-[var(--radius-md-design)] type-caption"
            style={{
              background: "#C5ED47",
              color: "#111827",
              boxShadow: "0 8px 24px rgba(197,237,71,0.22)",
              fontWeight: 700,
            }}
          >
            保存头像
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  inputBg,
  border,
  textPrimary,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputBg: string;
  border: string;
  textPrimary: string;
  multiline?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="type-caption" style={{ color: "rgba(255,255,255,0.64)" }}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          rows={4}
          className="resize-none rounded-[var(--radius-md-design)] px-3 py-2 outline-none"
          style={{ background: inputBg, border: `1px solid ${border}`, color: textPrimary, fontSize: 13, lineHeight: 1.7 }}
        />
      ) : (
        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          className="h-10 rounded-[var(--radius-md-design)] px-3 outline-none"
          style={{ background: inputBg, border: `1px solid ${border}`, color: textPrimary, fontSize: 13 }}
        />
      )}
    </label>
  );
}
