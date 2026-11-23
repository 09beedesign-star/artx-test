/**
 * AdminCommunityPage — 创意社区管理后台
 * 超级管理员功能:授予艺术家权限、下架作品、冻结账号、应急开关
 */
import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Users, AlertCircle, CheckCircle2, Ban, Trash2, Power } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";

interface User {
  id: string;
  email: string;
  username: string;
  communityRole?: "artist";
  communityStatus?: "active" | "frozen";
  artistGrantedAt?: string;
  artistGrantedBy?: string;
}

interface Post {
  id: string;
  userId: string;
  username: string;
  title?: string;
  imageUrl: string;
  status: "active" | "removed";
  createdAt: string;
  removedAt?: string;
  removedBy?: string;
  removedReason?: string;
}

export default function AdminCommunityPage() {
  const { resolvedTheme } = useTheme();
  const { user } = useAuth();
  const isDark = resolvedTheme === "dark";
  const bg = isDark ? "#161616" : "var(--design-surface-soft)";
  const cardBg = isDark ? "#1e1e1e" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#161616";
  const subText = isDark ? "#999" : "#666";
  const border = isDark ? "#2a2a2a" : "#e5e5e5";
  const inputBg = isDark ? "#2a2a2a" : "#f5f5f5";

  const [activeTab, setActiveTab] = useState<"users" | "posts" | "settings">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [emergencySwitch, setEmergencySwitch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Grant Artist Form
  const [grantEmail, setGrantEmail] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);

  // Remove Post Form
  const [removePostId, setRemovePostId] = useState("");
  const [removeReason, setRemoveReason] = useState("");
  const [removeLoading, setRemoveLoading] = useState(false);

  // Freeze Account Form
  const [freezeUserId, setFreezeUserId] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeLoading, setFreezeLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load settings
      const settingsRes = await fetch("/api/community/settings", {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
      });
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setEmergencySwitch(data.emergencySwitch || false);
      }

      // Load posts
      const postsRes = await fetch("/api/community/posts?includeRemoved=true", {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
      });
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGrantArtist() {
    if (!grantEmail.trim()) {
      showMessage("error", "请输入邮箱");
      return;
    }

    setGrantLoading(true);
    try {
      const response = await fetch("/api/community/admin/grant-artist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ email: grantEmail }),
      });

      if (response.ok) {
        showMessage("success", "艺术家权限已授予");
        setGrantEmail("");
        loadData();
      } else {
        const data = await response.json();
        showMessage("error", data.error || "授予失败");
      }
    } catch (error) {
      showMessage("error", "授予失败,请重试");
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleRemovePost() {
    if (!removePostId.trim()) {
      showMessage("error", "请输入作品ID");
      return;
    }

    setRemoveLoading(true);
    try {
      const response = await fetch("/api/community/admin/remove-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ postId: removePostId, reason: removeReason }),
      });

      if (response.ok) {
        showMessage("success", "作品已下架");
        setRemovePostId("");
        setRemoveReason("");
        loadData();
      } else {
        const data = await response.json();
        showMessage("error", data.error || "下架失败");
      }
    } catch (error) {
      showMessage("error", "下架失败,请重试");
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleFreezeAccount() {
    if (!freezeUserId.trim()) {
      showMessage("error", "请输入用户ID");
      return;
    }

    setFreezeLoading(true);
    try {
      const response = await fetch("/api/community/admin/freeze-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ userId: freezeUserId, reason: freezeReason }),
      });

      if (response.ok) {
        showMessage("success", "账号已冻结");
        setFreezeUserId("");
        setFreezeReason("");
        loadData();
      } else {
        const data = await response.json();
        showMessage("error", data.error || "冻结失败");
      }
    } catch (error) {
      showMessage("error", "冻结失败,请重试");
    } finally {
      setFreezeLoading(false);
    }
  }

  async function handleEmergencySwitch(enable: boolean) {
    const reason = enable ? "应急关闭社区" : "恢复社区功能";
    
    try {
      const response = await fetch("/api/community/admin/emergency-switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ enable, reason }),
      });

      if (response.ok) {
        setEmergencySwitch(enable);
        showMessage("success", enable ? "社区已暂停" : "社区已恢复");
      } else {
        const data = await response.json();
        showMessage("error", data.error || "操作失败");
      }
    } catch (error) {
      showMessage("error", "操作失败,请重试");
    }
  }

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <Shield size={24} style={{ color: text }} />
          <h1 className="type-headline" style={{ color: text }}>创意社区管理</h1>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{ padding: "var(--space-md)", background: message.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: "var(--space-xs)", position: "relative", zIndex: 1 }}>
          {message.type === "success" ? (
            <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
          ) : (
            <AlertCircle size={16} style={{ color: "#ef4444" }} />
          )}
          <span className="type-caption" style={{ color: message.type === "success" ? "#22c55e" : "#ef4444" }}>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: "var(--space-md) var(--space-lg)", borderBottom: `1px solid ${border}`, display: "flex", gap: "var(--space-sm)", position: "relative", zIndex: 1 }}>
        <button
          onClick={() => setActiveTab("users")}
          className="type-body"
          style={{ padding: "var(--space-sm) var(--space-md)", background: activeTab === "users" ? "#161616" : "none", color: activeTab === "users" ? "#fff" : text, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", cursor: "pointer" }}
        >
          用户管理
        </button>
        <button
          onClick={() => setActiveTab("posts")}
          className="type-body"
          style={{ padding: "var(--space-sm) var(--space-md)", background: activeTab === "posts" ? "#161616" : "none", color: activeTab === "posts" ? "#fff" : text, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", cursor: "pointer" }}
        >
          作品管理
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className="type-body"
          style={{ padding: "var(--space-sm) var(--space-md)", background: activeTab === "settings" ? "#161616" : "none", color: activeTab === "settings" ? "#fff" : text, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", cursor: "pointer" }}
        >
          系统设置
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1, padding: "var(--space-lg)" }}>
        {activeTab === "users" && (
          <div style={{ maxWidth: "800px" }}>
            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}` }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-md)" }}>授予艺术家权限</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>用户邮箱</label>
                  <input
                    type="email"
                    value={grantEmail}
                    onChange={e => setGrantEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text }}
                  />
                </div>
                <button
                  onClick={handleGrantArtist}
                  disabled={grantLoading}
                  className="type-body-strong"
                  style={{ padding: "var(--space-sm) var(--space-lg)", background: grantLoading ? "#555" : "#161616", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: grantLoading ? "not-allowed" : "pointer" }}
                >
                  {grantLoading ? "处理中..." : "授予权限"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "posts" && (
          <div style={{ maxWidth: "1200px" }}>
            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}`, marginBottom: "var(--space-lg)" }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-md)" }}>下架作品</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>作品ID</label>
                  <input
                    type="text"
                    value={removePostId}
                    onChange={e => setRemovePostId(e.target.value)}
                    placeholder="post-xxx"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text }}
                  />
                </div>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>下架原因</label>
                  <textarea
                    value={removeReason}
                    onChange={e => setRemoveReason(e.target.value)}
                    placeholder="请填写下架原因"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text, minHeight: "80px", resize: "vertical" }}
                  />
                </div>
                <button
                  onClick={handleRemovePost}
                  disabled={removeLoading}
                  className="type-body-strong"
                  style={{ padding: "var(--space-sm) var(--space-lg)", background: removeLoading ? "#555" : "#ef4444", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: removeLoading ? "not-allowed" : "pointer" }}
                >
                  {removeLoading ? "处理中..." : "下架作品"}
                </button>
              </div>
            </div>

            {/* Posts List */}
            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}` }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-md)" }}>作品列表</h2>
              {posts.length === 0 ? (
                <p className="type-body" style={{ color: subText }}>暂无作品</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                  {posts.map(post => (
                    <div key={post.id} style={{ padding: "var(--space-sm)", border: `1px solid ${border}`, borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-md)", background: post.status === "removed" ? "rgba(239, 68, 68, 0.1)" : "none" }}>
                      <img src={post.imageUrl} alt="" style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                      <div style={{ flex: 1 }}>
                        <p className="type-body" style={{ color: text }}>{post.title || "无标题"}</p>
                        <p className="type-caption" style={{ color: subText }}>ID: {post.id} · by {post.username}</p>
                        {post.status === "removed" && post.removedReason && (
                          <p className="type-caption" style={{ color: "#ef4444" }}>下架原因: {post.removedReason}</p>
                        )}
                      </div>
                      <span className="type-caption" style={{ padding: "2px 8px", background: post.status === "removed" ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)", color: post.status === "removed" ? "#ef4444" : "#22c55e", borderRadius: "var(--radius-xs)" }}>
                        {post.status === "removed" ? "已下架" : "正常"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div style={{ maxWidth: "800px" }}>
            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}`, marginBottom: "var(--space-lg)" }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-md)" }}>冻结账号</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>用户ID</label>
                  <input
                    type="text"
                    value={freezeUserId}
                    onChange={e => setFreezeUserId(e.target.value)}
                    placeholder="user-xxx"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text }}
                  />
                </div>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>冻结原因</label>
                  <textarea
                    value={freezeReason}
                    onChange={e => setFreezeReason(e.target.value)}
                    placeholder="请填写冻结原因"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text, minHeight: "80px", resize: "vertical" }}
                  />
                </div>
                <button
                  onClick={handleFreezeAccount}
                  disabled={freezeLoading}
                  className="type-body-strong"
                  style={{ padding: "var(--space-sm) var(--space-lg)", background: freezeLoading ? "#555" : "#ef4444", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: freezeLoading ? "not-allowed" : "pointer" }}
                >
                  {freezeLoading ? "处理中..." : "冻结账号"}
                </button>
              </div>
            </div>

            {/* Emergency Switch */}
            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}` }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-md)" }}>应急开关</h2>
              <p className="type-body" style={{ color: subText, marginBottom: "var(--space-lg)" }}>
                启用后,社区将暂停所有上传、发布和互动功能,用于应对集中投诉或安全事件
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                <button
                  onClick={() => handleEmergencySwitch(!emergencySwitch)}
                  className="type-body-strong"
                  style={{ padding: "var(--space-sm) var(--space-lg)", background: emergencySwitch ? "#22c55e" : "#ef4444", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}
                >
                  <Power size={16} />
                  {emergencySwitch ? "恢复社区功能" : "暂停社区功能"}
                </button>
                <span className="type-body" style={{ color: emergencySwitch ? "#ef4444" : "#22c55e" }}>
                  当前状态: {emergencySwitch ? "已暂停" : "正常运行"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}