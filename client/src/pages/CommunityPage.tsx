/**
 * CommunityPage — 创意社区
 */
import { useState, useEffect, useMemo } from "react";
import { communityAuthHeaders } from "@/lib/community-client";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Users, Upload, Heart, MessageCircle, Star, AlertCircle } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";
import { useLocation } from "wouter";
import UploadDialog from "@/components/community/UploadDialog";
import PostDetailModal from "@/components/community/PostDetailModal";
import { applyInspirationSameStyle } from "@/lib/inspiration-same-style";

interface CommunityPost {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  prompt?: string;
  title?: string;
  description?: string;
  isAiGenerated: boolean;
  isOriginal: boolean;
  isOpenSource: boolean;
  allowCommercialUse: boolean;
  likes: number;
  commentsCount: number;
  favoritesCount: number;
  viewsCount: number;
  createdAt: string;
  hasLiked?: boolean;
  hasFavorited?: boolean;
}

export type { CommunityPost };

export default function CommunityPage() {
  const { resolvedTheme } = useTheme();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "#161616" : "var(--design-surface-soft)";
  const cardBg = isDark ? "#1e1e1e" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#161616";
  const subText = isDark ? "#999" : "#666";
  const border = isDark ? "#2a2a2a" : "#e5e5e5";

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [applyingSameStyle, setApplyingSameStyle] = useState(false);

  // 检查 URL 查询参数以确定是否自动打开上传对话框
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upload") === "true") {
      setUploadOpen(true);
      // 清理 URL，移除 upload 参数
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // 检查 URL 查询参数以确定是否自动打开上传对话框
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upload") === "true") {
      setUploadOpen(true);
      // 清理 URL，移除 upload 参数
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
    void checkArtistStatus();
    const refresh = () => { void checkArtistStatus(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);

  async function loadPosts() {
    try {
      const response = await fetch("/api/community/posts", {
        headers: communityAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setPosts((Array.isArray(data) ? data : data.posts || []).map((post: CommunityPost & { isLiked?: boolean; isFavorited?: boolean }) => ({ ...post, hasLiked: post.isLiked ?? post.hasLiked, hasFavorited: post.isFavorited ?? post.hasFavorited })));
      }
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setLoading(false);
    }
  }

  async function checkArtistStatus() {
    try {
      const response = await fetch("/api/community/settings", {
        headers: communityAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setEmergencyMode(data.emergencySwitch || false);
        setIsArtist(data.isArtist || false);
        setIsSuperAdmin(data.isSuperAdmin || false);
      }
    } catch (error) {
      console.error("Failed to check artist status:", error);
    }
  }

  async function toggleLike(postId: string) {
    try {
      const response = await fetch(`/api/community/posts/${postId}/like`, {
        method: "POST",
        headers: communityAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: data.count, hasLiked: data.liked } : p));
      }
    } catch (error) {
      console.error("Failed to toggle like:", error);
    }
  }

  async function toggleFavorite(postId: string) {
    try {
      const response = await fetch(`/api/community/posts/${postId}/favorite`, {
        method: "POST",
        headers: communityAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, favoritesCount: data.count, hasFavorited: data.favorited } : p));
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  }

  function handleUploadClick() {
    if (!user) {
      setPermissionError("请先登录");
      return;
    }

    if (!isArtist && !isSuperAdmin) {
      setPermissionError("当前并非邀请艺术家，如果要申请上传图片，请发送邀请权限给管理员");
      return;
    }

    setPermissionError("");
    setUploadOpen(true);
  }

  function handlePostClick(post: CommunityPost) {
    setSelectedPost(post);
    setDetailOpen(true);
  }

  function handleCopyPrompt(prompt: string) {
    // 保存提示词到本地存储，以便在画布中使用
    sessionStorage.setItem("communityPrompt", prompt);
    // 跳转到画布
    navigate("/workspace");
  }

  async function handleCardSameStyle(post: CommunityPost) {
    if (applyingSameStyle) return;
    
    setApplyingSameStyle(true);
    try {
      void await applyInspirationSameStyle(
        {
          title: post.title || "社区作品",
          imageUrl: post.imageUrl,
        },
        navigate
      );
    } finally {
      setApplyingSameStyle(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg }}>
        <div className="flex-1 flex items-center justify-center">
          <p className="type-body" style={{ color: subText }}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: bg, position: "relative", transition: "background 0.25s ease" }}>
      {isDark && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url(${BG_GLOW})`, backgroundSize: "cover", opacity: 0.10, zIndex: 0 }} />
      )}
      
      {/* Header */}
      <div style={{ padding: "var(--space-lg)", borderBottom: `1px solid ${border}`, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <Users size={24} style={{ color: text }} />
            <h1 className="type-headline" style={{ color: text }}>创意社区</h1>
          </div>
          {user && !emergencyMode && (
            <button
              onClick={handleUploadClick}
              className="flex items-center gap-2 px-4 py-2 rounded-lg type-body-strong"
              style={{ background: "#161616", color: "#ffffff", border: "none", cursor: "pointer" }}
            >
              <Upload size={16} />
              上传作品
            </button>
          )}
        </div>
        {emergencyMode && (
          <div style={{ marginTop: "var(--space-sm)", padding: "var(--space-sm)", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
            <AlertCircle size={16} style={{ color: "#ef4444" }} />
            <p className="type-caption" style={{ color: "#ef4444" }}>社区功能暂时关闭,维护中</p>
          </div>
        )}
        {permissionError && (
          <div style={{ marginTop: "var(--space-sm)", padding: "var(--space-sm)", background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
            <AlertCircle size={16} style={{ color: "#ef4444" }} />
            <p className="type-caption" style={{ color: "#ef4444" }}>{permissionError}</p>
          </div>
        )}
      </div>

      {/* Posts Grid */}
      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1, padding: "var(--space-lg)" }}>
        {posts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "var(--space-md)" }}>
            <Users size={48} style={{ color: subText }} />
            <p className="type-body" style={{ color: subText }}>暂无作品,期待第一位艺术家的分享</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-lg)" }}>
            {posts.map(post => (
              <div
                key={post.id}
                onClick={() => handlePostClick(post)}
                style={{
                  background: cardBg,
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  border: `1px solid ${border}`,
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-4px)";
                  el.style.boxShadow = isDark ? "0 8px 24px rgba(0, 0, 0, 0.4)" : "0 8px 24px rgba(0, 0, 0, 0.1)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(0)";
                  el.style.boxShadow = "none";
                }}
              >
                {/* Image */}
                <div 
                  style={{ position: "relative", paddingTop: "100%", background: "#f5f5f5" }}
                >
                  <img
                    src={post.imageUrl}
                    alt={post.title || ""}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                
                {/* Content */}
                <div style={{ padding: "var(--space-md)" }}>
                  {post.title && (
                    <h3 className="type-body-strong" style={{ color: text, marginBottom: "var(--space-xs)" }}>{post.title}</h3>
                  )}
                  {post.description && (
                    <p className="type-caption" style={{ color: subText, marginBottom: "var(--space-sm)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {post.description}
                    </p>
                  )}
                  
                  {/* Metadata */}
                  <div style={{ display: "flex", gap: "var(--space-xs)", marginBottom: "var(--space-sm)", flexWrap: "wrap" }}>
                    {post.isAiGenerated && (
                      <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(99, 102, 241, 0.1)", color: "#6366f1", borderRadius: "var(--radius-xs)" }}>AI生成</span>
                    )}
                    {post.isOriginal && (
                      <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", borderRadius: "var(--radius-xs)" }}>原创</span>
                    )}
                    {post.isOpenSource && (
                      <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(234, 179, 8, 0.1)", color: "#eab308", borderRadius: "var(--radius-xs)" }}>开源</span>
                    )}
                    {post.allowCommercialUse && (
                      <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(168, 85, 247, 0.1)", color: "#a855f7", borderRadius: "var(--radius-xs)" }}>可商用</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "center" }}>
                    <button
                      onClick={() => toggleLike(post.id)}
                      style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", background: "none", border: "none", cursor: "pointer", color: post.hasLiked ? "#ef4444" : subText }}
                    >
                      <Heart size={16} fill={post.hasLiked ? "#ef4444" : "none"} />
                      <span className="type-caption">{post.likes}</span>
                    </button>
                    <button
                      style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", background: "none", border: "none", cursor: "pointer", color: subText }}
                    >
                      <MessageCircle size={16} />
                      <span className="type-caption">{post.commentsCount}</span>
                    </button>
                    <button
                      onClick={() => toggleFavorite(post.id)}
                      style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", background: "none", border: "none", cursor: "pointer", color: post.hasFavorited ? "#eab308" : subText }}
                    >
                      <Star size={16} fill={post.hasFavorited ? "#eab308" : "none"} />
                      <span className="type-caption">{post.favoritesCount}</span>
                    </button>
                  </div>

                  {/* Author */}
                  <div style={{ marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: `1px solid ${border}` }}>
                    <p className="type-micro" style={{ color: subText }}>by {post.username}</p>
                  </div>

                  {/* Persistent "一键复刻" Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCardSameStyle(post);
                    }}
                    disabled={applyingSameStyle}
                    className="type-body-strong"
                    style={{
                      width: "100%",
                      padding: "var(--space-sm)",
                      marginTop: "var(--space-md)",
                      background: applyingSameStyle ? "#999" : "#161616",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      cursor: applyingSameStyle ? "not-allowed" : "pointer",
                      transition: "background 0.2s ease",
                      opacity: applyingSameStyle ? 0.6 : 1,
                    }}
                  >
                    {applyingSameStyle ? "处理中..." : "一键复刻"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          // 当对话框关闭时，刷新帖子列表
          if (!open) {
            void loadPosts();
          }
        }}
      />

      {/* Post Detail Modal */}
      <PostDetailModal
        post={selectedPost}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        isDark={isDark}
        onCopyPrompt={handleCopyPrompt}
        onApplySameStyle={handleCardSameStyle}
      />
    </div>
  );
}
