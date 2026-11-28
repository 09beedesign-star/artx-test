/**
 * PostDetailModal — 作品详情浮窗
 */
import { useState, useEffect } from "react";
import { X, MessageSquare, Copy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { communityAuthHeaders } from "@/lib/community-client";
import type { CommunityPost } from "@/pages/CommunityPage";

interface Comment {
  id: string;
  author: string;
  text: string;
  time: string;
}

interface PostDetailModalProps {
  post: CommunityPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  onCopyPrompt: (prompt: string) => void;
  onApplySameStyle?: (post: CommunityPost) => void;
}

export default function PostDetailModal({
  post,
  open,
  onOpenChange,
  isDark,
  onCopyPrompt,
  onApplySameStyle,
}: PostDetailModalProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const bg = isDark ? "#161616" : "#f5f5f5";
  const cardBg = isDark ? "#1e1e1e" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#161616";
  const subText = isDark ? "#999" : "#666";
  const border = isDark ? "#2a2a2a" : "#e5e5e5";
  const inputBg = isDark ? "#2a2a2a" : "#f9f9f9";

  if (!open || !post) return null;

  // 加载评论
  const loadComments = async () => {
    if (!post?.id) return;
    
    setLoadingComments(true);
    try {
      const response = await fetch(`/api/community/posts/${post.id}/comments`, {
        headers: communityAuthHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json() as Comment[];
        setComments(data);
      } else {
        console.error("加载评论失败:", response.statusText);
      }
    } catch (err) {
      console.error("加载评论出错:", err);
    } finally {
      setLoadingComments(false);
    }
  };

  // 在浮窗打开时加载评论
  useEffect(() => {
    if (open && post?.id) {
      void loadComments();
    }
  }, [open, post?.id]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !user) return;

    setSubmittingComment(true);
    try {
      // 调用API保存评论
      const response = await fetch(`/api/community/posts/${post!.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...communityAuthHeaders(),
        },
        body: JSON.stringify({
          text: newComment,
        }),
      });

      if (response.ok) {
        const savedComment = await response.json() as Comment;
        setComments(prev => [savedComment, ...prev]);
        setNewComment("");
      } else {
        const error = await response.json();
        console.error("发布评论失败:", error);
        alert(error.error || "发布评论失败");
      }
    } catch (err) {
      console.error("发布评论出错:", err);
      alert("发布评论出错");
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("zh-CN");
    } catch {
      return dateString;
    }
  };

  return (
    <>
      {/* 背景遮罩 */}
      {open && (
        <div
          onClick={() => onOpenChange(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 999,
          }}
        />
      )}

      {/* 浮窗 */}
      <div
        style={{
          position: "fixed",
          inset: "50%",
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "1200px",
          height: "85vh",
          background: cardBg,
          borderRadius: "var(--radius-xl)",
          display: "flex",
          flexDirection: "column",
          zIndex: 1000,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          border: `1px solid ${border}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-lg)",
            borderBottom: `1px solid ${border}`,
          }}
        >
          <h2 className="type-headline" style={{ color: text }}>
            作品详情
          </h2>
          <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "center" }}>
            {onApplySameStyle && post && (
              <button
                onClick={() => onApplySameStyle(post)}
                className="type-body-strong"
                style={{
                  padding: "var(--space-sm) var(--space-md)",
                  background: "#161616",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                }}
              >
                一键复刻
              </button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: subText,
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-lg)",
            flex: 1,
            overflow: "hidden",
            padding: "var(--space-lg)",
          }}
        >
          {/* 左侧：图片 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-md)",
              overflow: "auto",
            }}
          >
            <div
              style={{
                position: "relative",
                paddingTop: "100%",
                background: "#f5f5f5",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              <img
                src={post.imageUrl}
                alt={post.title || ""}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
            {post.description && (
              <div>
                <p className="type-body-strong" style={{ color: text, marginBottom: "var(--space-xs)" }}>
                  描述
                </p>
                <p className="type-body" style={{ color: subText, lineHeight: 1.6 }}>
                  {post.description}
                </p>
              </div>
            )}
          </div>

          {/* 右侧：属性和评论 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-lg)",
              overflow: "auto",
            }}
          >
            {/* 属性信息 */}
            <div
              style={{
                padding: "var(--space-md)",
                background: inputBg,
                borderRadius: "var(--radius-lg)",
              }}
            >
              {post.title && (
                <div style={{ marginBottom: "var(--space-md)" }}>
                  <p className="type-micro" style={{ color: subText, marginBottom: "var(--space-xs)" }}>
                    作品名称
                  </p>
                  <p className="type-body-strong" style={{ color: text }}>
                    {post.title}
                  </p>
                </div>
              )}

              <div style={{ marginBottom: "var(--space-md)" }}>
                <p className="type-micro" style={{ color: subText, marginBottom: "var(--space-xs)" }}>
                  上传账号
                </p>
                <p className="type-body" style={{ color: text }}>
                  {post.username}
                </p>
              </div>

              <div style={{ marginBottom: "var(--space-md)" }}>
                <p className="type-micro" style={{ color: subText, marginBottom: "var(--space-xs)" }}>
                  上传时间
                </p>
                <p className="type-body" style={{ color: text }}>
                  {formatDate(post.createdAt)}
                </p>
              </div>

              {/* 标签 */}
              <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
                {post.isAiGenerated && (
                  <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(99, 102, 241, 0.1)", color: "#6366f1", borderRadius: "var(--radius-xs)" }}>
                    AI生成
                  </span>
                )}
                {post.isOriginal && (
                  <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", borderRadius: "var(--radius-xs)" }}>
                    原创
                  </span>
                )}
                {post.isOpenSource && (
                  <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(234, 179, 8, 0.1)", color: "#eab308", borderRadius: "var(--radius-xs)" }}>
                    开源
                  </span>
                )}
                {post.allowCommercialUse && (
                  <span className="type-micro" style={{ padding: "2px 6px", background: "rgba(168, 85, 247, 0.1)", color: "#a855f7", borderRadius: "var(--radius-xs)" }}>
                    可商用
                  </span>
                )}
              </div>

              {/* 一键同款按钮 */}
              {post.prompt && (
                <button
                  onClick={() => onCopyPrompt(post.prompt || "")}
                  style={{
                    width: "100%",
                    marginTop: "var(--space-md)",
                    padding: "var(--space-sm) var(--space-md)",
                    background: "#6366f1",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "var(--space-xs)",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <Copy size={16} />
                  一键同款
                </button>
              )}
            </div>

            {/* 评论区 */}
            <div
              style={{
                borderTop: `1px solid ${border}`,
                paddingTop: "var(--space-md)",
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-sm)" }}>
                <MessageSquare size={16} style={{ color: text }} />
                <p className="type-body-strong" style={{ color: text }}>
                  评论 ({comments.length})
                </p>
              </div>

              {/* 评论列表 */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  marginBottom: "var(--space-md)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-sm)",
                }}
              >
                {comments.length === 0 ? (
                  <p className="type-caption" style={{ color: subText, textAlign: "center", padding: "var(--space-md) 0" }}>
                    暂无评论
                  </p>
                ) : (
                  comments.map(comment => (
                    <div
                      key={comment.id}
                      style={{
                        padding: "var(--space-sm)",
                        background: inputBg,
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-xs)" }}>
                        <p className="type-body-strong" style={{ color: text }}>
                          {comment.author}
                        </p>
                        <p className="type-micro" style={{ color: subText }}>
                          {comment.time}
                        </p>
                      </div>
                      <p className="type-body" style={{ color: text }}>
                        {comment.text}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* 评论输入框 */}
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <input
                  type="text"
                  placeholder="添加评论..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyPress={e => e.key === "Enter" && handleAddComment()}
                  style={{
                    flex: 1,
                    padding: "var(--space-sm) var(--space-md)",
                    background: inputBg,
                    border: `1px solid ${border}`,
                    borderRadius: "var(--radius-md)",
                    color: text,
                    fontSize: "14px",
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment || !user}
                  className="type-body-strong"
                  style={{
                    padding: "var(--space-sm) var(--space-md)",
                    background: (newComment.trim() && !submittingComment && user) ? "#6366f1" : "#999",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    cursor: (newComment.trim() && !submittingComment && user) ? "pointer" : "not-allowed",
                  }}
                >
                  {submittingComment ? "发送中..." : "发送"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
