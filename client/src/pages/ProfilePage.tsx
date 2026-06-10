/**
 * ProfilePage — personal homepage detail page
 * Presents the current user's public profile overview while preserving the artx visual language.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Mail, MapPin, Palette, Pencil, Sparkles, Upload, UserRound, X } from "lucide-react";
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
const PROFILE_BACKGROUND_KEY = "artx:profile-background-color";
const DEFAULT_DESCRIPTION = "这是您的 ArtXStudio 创作者主页";
const PROFILE_BACKGROUND_COLORS = [
  "#000000",
  "#1A1A1A",
  "#2B2D42",
  "#1B1F3B",
  "#0F172A",
  "#12332E",
  "#224C3A",
  "#5A3E2B",
  "#7A3E2E",
  "#3B1F2B",
  "#41246D",
  "#936CFF",
  "#6D7DFF",
  "#2F80ED",
  "#00A3A3",
  "#37B24D",
  "#F59F00",
  "#FF6B6B",
  "#E64980",
  "#F8F9FA",
];

function readStoredProfile(): Partial<ProfileDraft> {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readStoredProfileBackground() {
  if (typeof window === "undefined") return PROFILE_BACKGROUND_COLORS[0];
  const stored = localStorage.getItem(PROFILE_BACKGROUND_KEY);
  return stored && PROFILE_BACKGROUND_COLORS.includes(stored) ? stored : PROFILE_BACKGROUND_COLORS[0];
}

export default function ProfilePage() {
  const { resolvedTheme } = useTheme();
  const { user } = useAuth();
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
  const [draft, setDraft] = useState<ProfileDraft>(profile);
  const [profileBackground, setProfileBackground] = useState(readStoredProfileBackground);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [pendingProfileBackground, setPendingProfileBackground] = useState(profileBackground);

  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(PROFILE_BACKGROUND_KEY, profileBackground);
  }, [profileBackground]);

  const textPrimary = isDark ? "rgba(255,255,255,0.88)" : "rgba(20,20,36,0.88)";
  const textSecondary = isDark ? "rgba(255,255,255,0.56)" : "rgba(20,20,36,0.56)";
  const textMuted = isDark ? "rgba(255,255,255,0.36)" : "rgba(20,20,36,0.36)";
  const cardBg = isDark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.76)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(20,20,36,0.10)";
  const panelBg = isDark ? "rgba(18,18,24,0.98)" : "rgba(255,255,255,0.98)";
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(20,20,36,0.045)";
  const tags = profile.tags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean);
  const displayedProfileBackground = backgroundPickerOpen ? pendingProfileBackground : profileBackground;

  const handleAvatarFile = (file: File | undefined, target: "profile" | "draft") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatar = String(reader.result || "");
      if (target === "profile") {
        setProfile(current => ({ ...current, avatar }));
      } else {
        setDraft(current => ({ ...current, avatar }));
      }
    };
    reader.readAsDataURL(file);
  };

  const openEdit = () => {
    setDraft(profile);
    setEditOpen(true);
  };

  const openBackgroundPicker = () => {
    setPendingProfileBackground(profileBackground);
    setBackgroundPickerOpen(true);
  };

  const confirmBackground = () => {
    setProfileBackground(pendingProfileBackground);
    setBackgroundPickerOpen(false);
    toast.success("主页背景已更新");
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

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        background: isDark ? "oklch(0.09 0.012 270)" : "oklch(0.975 0.004 80)",
        color: textPrimary,
      }}
    >
      <TopBar credits={0} />
      <main className="relative flex-1 overflow-y-auto px-8 py-8">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: BG_GLOW }} />
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
            <div className="relative z-0 h-40 transition-colors duration-200" style={{ background: displayedProfileBackground }}>
              {!backgroundPickerOpen && (
                <button
                  type="button"
                  onClick={openBackgroundPicker}
                  className="absolute right-4 top-4 flex h-9 items-center gap-2 rounded-[var(--radius-md-design)] px-3 type-caption shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-colors hover:bg-black/45"
                  style={{
                    background: "rgba(0,0,0,0.32)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    color: "white",
                    backdropFilter: "blur(16px)",
                  }}
                  aria-expanded={false}
                >
                  <Palette size={14} />
                  主页背景
                </button>
              )}

              {backgroundPickerOpen && (
                <div
                  className="absolute right-4 top-4 z-10 w-[246px] rounded-[var(--radius-lg-design)] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
                  style={{
                    background: "rgba(18,18,24,0.82)",
                    border: "1px solid rgba(255,255,255,0.20)",
                    backdropFilter: "blur(20px)",
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="type-caption" style={{ color: "rgba(255,255,255,0.82)" }}>选择背景颜色</p>
                    <span className="type-caption" style={{ color: "rgba(255,255,255,0.48)" }}>{pendingProfileBackground}</span>
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {PROFILE_BACKGROUND_COLORS.map(color => {
                      const selected = pendingProfileBackground === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setPendingProfileBackground(color)}
                          className="flex h-4 w-4 items-center justify-center rounded-[5px] transition-transform hover:scale-110"
                          style={{
                            background: color,
                            border: selected ? "2px solid #936CFF" : "1px solid rgba(255,255,255,0.28)",
                            boxShadow: selected ? "0 0 0 2px rgba(147,108,255,0.26)" : "none",
                          }}
                          aria-label={`选择主页背景色 ${color}`}
                        >
                          {selected && <Check size={9} color={color === "#F8F9FA" ? "#111" : "white"} strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={confirmBackground}
                    className="mt-2 h-8 w-full rounded-[var(--radius-md-design)] bg-[#936CFF] type-caption text-white transition-colors hover:bg-[#A384FF]"
                  >
                    确定
                  </button>
                </div>
              )}
            </div>
            <div className="relative z-10 px-8 pb-8">
              <div className="-mt-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative z-10 flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px]"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.62 0.20 210))",
                      border: `4px solid ${isDark ? "oklch(0.13 0.012 270)" : "white"}`,
                      boxShadow: "0 18px 36px oklch(0.58 0.22 290 / 0.28)",
                    }}
                    aria-label="上传个人头像"
                  >
                    {profile.avatar ? (
                      <img src={profile.avatar} alt="个人头像" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={34} color="white" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera size={18} color="white" />
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => handleAvatarFile(event.target.files?.[0], "profile")}
                  />
                  <div className="relative z-10 pb-2">
                    <h1 className="type-title-sm" style={{ color: textPrimary, fontSize: 26, fontWeight: 680 }}>{profile.displayName}</h1>
                    <p className="type-body-sm mt-1" style={{ color: textSecondary }}>{profile.description}</p>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 md:items-end">
                  <button
                    onClick={openEdit}
                    className="flex items-center gap-2 rounded-[var(--radius-lg-design)] px-4 py-2 type-caption transition-opacity hover:opacity-85"
                    style={{
                      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(20,20,36,0.06)",
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
                  style={{ background: isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.52)", border: `1px solid ${border}` }}
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
                        style={{ background: isDark ? "rgba(255,255,255,0.07)" : "rgba(20,20,36,0.06)", color: textSecondary }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-[var(--radius-lg-design)] p-5"
                  style={{ background: isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.52)", border: `1px solid ${border}` }}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6"
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
                className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px]"
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
                onChange={event => handleAvatarFile(event.target.files?.[0], "draft")}
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
      <span className="type-caption" style={{ color: "rgba(255,255,255,0.48)" }}>{label}</span>
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
