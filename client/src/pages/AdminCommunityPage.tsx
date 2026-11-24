/**
 * AdminCommunityPage — 创意社区管理后台
 * 超级管理员功能: 艺术家授权邀请（异步三方确认）、下架作品、冻结账号、应急开关
 */
import { useState, useEffect } from "react";
import { communityAuthHeaders as authHeaders } from "@/lib/community-client";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Users, AlertCircle, CheckCircle2, Ban, Trash2, Power, Bell } from "lucide-react";
import { BG_GLOW } from "@/lib/workspace-data";

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

type InvitationStatus = "pending" | "accepted" | "granted" | "declined" | "revoked";

interface ArtistInvitation {
  id: string;
  userId: string;
  username: string;
  invitedByUsername: string;
  status: InvitationStatus;
  note?: string;
  createdAt: string;
  acceptedAt?: string;
  grantedAt?: string;
}

const INVITATION_LABEL: Record<InvitationStatus, string> = {
  pending: "待艺术家接受",
  accepted: "已接受 · 待你确认通过",
  granted: "授权已生效",
  declined: "艺术家已拒绝",
  revoked: "已撤回",
};

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
  const [posts, setPosts] = useState<Post[]>([]);
  const [invitations, setInvitations] = useState<ArtistInvitation[]>([]);
  const [emergencySwitch, setEmergencySwitch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 发起艺术家邀请
  const [grantAccount, setGrantAccount] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [busyInvitationId, setBusyInvitationId] = useState("");

  // Remove Post Form
  const [removePostId, setRemovePostId] = useState("");
  const [removeReason, setRemoveReason] = useState("");
  const [removeLoading, setRemoveLoading] = useState(false);

  // Freeze Account Form
  const [freezeUserId, setFreezeUserId] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeLoading, setFreezeLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void loadData();
    const refresh = () => { void loadData(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);

  async function loadData() {
    try {
      // Load settings
      const settingsRes = await fetch("/api/community/settings", {
        headers: authHeaders(),
      });
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setEmergencySwitch(data.emergencySwitch || false);
      }

      // Load posts
      const postsRes = await fetch("/api/community/posts?includeRemoved=true", {
        headers: authHeaders(),
      });
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(Array.isArray(data) ? data : data.posts || []);
      }

      // 艺术家邀请列表：accepted 即「已接受、待我确认」的通过提醒
      const invitationsRes = await fetch("/api/community/admin/artist-invitations", {
        headers: authHeaders(),
      });
      if (invitationsRes.ok) {
        const data = await invitationsRes.json();
        setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
      } else {
        const data = await invitationsRes.json();
        setMessage({ type: "error", text: data.error || "读取邀请列表失败，请刷新重试" });
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteArtist() {
    if (!grantAccount.trim()) {
      showMessage("error", "请输入艺术家的注册账号");
      return;
    }
    if (!authHeaders().Authorization) {
      showMessage("error", "登录状态已失效，请重新登录后再发送邀请");
      return;
    }

    setGrantLoading(true);
    try {
      const response = await fetch("/api/community/admin/invite-artist", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ account: grantAccount, note: grantNote }),
      });
      const data = await response.json();
      if (response.ok) {
        showMessage("success", data.message || "邀请已发送，等待艺术家在个人中心接受");
        setGrantAccount("");
        setGrantNote("");
        await loadData();
      } else {
        showMessage("error", data.error || "发送邀请失败");
      }
    } catch {
      showMessage("error", "发送邀请失败，请重试");
    } finally {
      setGrantLoading(false);
    }
  }

  /** 超管确认通过：这一步才让艺术家的上传权限真正生效。 */
  async function handleConfirmInvitation(id: string) {
    setBusyInvitationId(id);
    try {
      const response = await fetch(`/api/community/admin/artist-invitations/${id}/confirm`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json();
      if (response.ok) {
        showMessage("success", data.message || "授权已生效");
        await loadData();
      } else {
        showMessage("error", data.error || "确认失败");
      }
    } catch {
      showMessage("error", "确认失败，请重试");
    } finally {
      setBusyInvitationId("");
    }
  }

  async function handleRevokeInvitation(id: string) {
    setBusyInvitationId(id);
    try {
      const response = await fetch(`/api/community/admin/artist-invitations/${id}/revoke`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json();
      if (response.ok) {
        showMessage("success", "邀请已撤回");
        await loadData();
      } else {
        showMessage("error", data.error || "撤回失败");
      }
    } catch {
      showMessage("error", "撤回失败，请重试");
    } finally {
      setBusyInvitationId("");
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
        headers: authHeaders({ "Content-Type": "application/json" }),
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
        headers: authHeaders({ "Content-Type": "application/json" }),
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
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ enabled: enable, reason }),
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

  const pendingConfirm = invitations.filter(item => item.status === "accepted");

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
            {/* 通过提醒：艺术家已接受，等超管确认 */}
            {pendingConfirm.length > 0 && (
              <div
                style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)", padding: "var(--space-md)", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: "var(--radius-md)", color: "#22c55e" }}
              >
                <Bell size={16} />
                <span className="type-body">
                  有 {pendingConfirm.length} 位艺术家已接受邀请，确认通过后上传权限才会生效
                </span>
              </div>
            )}

            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}` }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-xs)" }}>邀请艺术家开通上传权限</h2>
              <p className="type-caption" style={{ color: subText, marginBottom: "var(--space-md)" }}>
                输入对方的注册账号发送邀请 → 对方在个人中心接受 → 你在这里确认通过，授权才最终生效。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>艺术家注册账号</label>
                  <input
                    type="text"
                    value={grantAccount}
                    onChange={e => setGrantAccount(e.target.value)}
                    placeholder="注册时使用的邮箱 / 手机号 / 用户名"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text }}
                  />
                </div>
                <div>
                  <label className="type-body" style={{ color: text, display: "block", marginBottom: "var(--space-xs)" }}>邀请备注（选填）</label>
                  <input
                    type="text"
                    value={grantNote}
                    onChange={e => setGrantNote(e.target.value)}
                    placeholder="例如：邀请上传作品集"
                    className="type-body"
                    style={{ width: "100%", padding: "var(--space-sm)", background: inputBg, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", color: text }}
                  />
                </div>
                <button
                  onClick={handleInviteArtist}
                  disabled={grantLoading}
                  className="type-body-strong"
                  style={{ padding: "var(--space-sm) var(--space-lg)", background: grantLoading ? "#555" : "#161616", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: grantLoading ? "not-allowed" : "pointer" }}
                >
                  {grantLoading ? "发送中..." : "发送邀请"}
                </button>
              </div>
            </div>

            <div style={{ background: cardBg, borderRadius: "var(--radius-lg)", padding: "var(--space-lg)", border: `1px solid ${border}`, marginTop: "var(--space-lg)" }}>
              <h2 className="type-headline" style={{ color: text, marginBottom: "var(--space-md)" }}>授权邀请记录</h2>
              {invitations.length === 0 ? (
                <p className="type-body" style={{ color: subText }}>暂无邀请</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                  {invitations.map(item => (
                    <div
                      key={item.id}
                      style={{ padding: "var(--space-sm)", border: `1px solid ${item.status === "accepted" ? "rgba(34,197,94,0.5)" : border}`, borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "var(--space-md)", flexWrap: "wrap" }}
                    >
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div className="type-body" style={{ color: text }}>{item.username}</div>
                        <div className="type-caption" style={{ color: subText }}>
                          {INVITATION_LABEL[item.status]} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                          {item.note ? ` · ${item.note}` : ""}
                        </div>
                      </div>
                      {item.status === "accepted" && (
                        <button
                          onClick={() => handleConfirmInvitation(item.id)}
                          disabled={busyInvitationId === item.id}
                          className="type-body-strong"
                          style={{ padding: "var(--space-xs) var(--space-md)", background: "#161616", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer" }}
                        >
                          {busyInvitationId === item.id ? "处理中..." : "确认通过"}
                        </button>
                      )}
                      {(item.status === "pending" || item.status === "accepted") && (
                        <button
                          onClick={() => handleRevokeInvitation(item.id)}
                          disabled={busyInvitationId === item.id}
                          className="type-caption"
                          style={{ padding: "var(--space-xs) var(--space-sm)", background: "transparent", color: subText, border: `1px solid ${border}`, borderRadius: "var(--radius-md)", cursor: "pointer" }}
                        >
                          撤回
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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