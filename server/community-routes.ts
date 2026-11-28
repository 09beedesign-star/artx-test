import express from "express";
import multer from "multer";
import path from "path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { getUploadsRoot } from "./local-image-storage";
import {
  createPost,
  getPost,
  listPosts,
  removePost,
  incrementPostViews,
  createComment,
  listComments,
  removeComment,
  toggleLike,
  hasUserLiked,
  toggleFavorite,
  hasUserFavorited,
  listUserFavorites,
  getCommunitySettings,
  setEmergencySwitch,
  createArtistInvitation,
  listAllArtistInvitations,
  listArtistInvitationsForUser,
  advanceArtistInvitation,
  confirmArtistInvitation,
} from "./community-store";
import {
  findUserById, findUserByAccount, updateUser, effectiveUserRole, grantArtistFromInvitation, type StoredUser,
} from "./auth-store";

const router = express.Router();

// 配置图片上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(getUploadsRoot(), "community");
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("只支持 JPEG、PNG、WEBP 格式的图片"));
    }
  },
});

// 权限检查中间件
async function requireArtist(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as StoredUser;
  
  if (!user) {
    return res.status(401).json({ error: "未登录" });
  }
  
  try {
    // 检查应急开关
    const settings = await getCommunitySettings();
    if (settings.emergencySwitch) {
      return res.status(503).json({ 
        error: "社区功能暂时关闭,请稍后再试",
        emergencyMode: true 
      });
    }
    
    // 检查艺术家权限或超级管理员权限
    const isArtist = user.communityRole === "artist";
    const isSuperAdmin = effectiveUserRole(user) === "super_admin";
    
    if (!isArtist && !isSuperAdmin) {
      return res.status(403).json({ error: "需要艺术家权限才能发布内容" });
    }
    
    // 检查账号状态
    if (user.status === "disabled" || user.communityStatus === "frozen") {
      return res.status(403).json({ error: "您的账号已被冻结或停用,无法发布内容" });
    }
    
    next();
  } catch (err) {
    console.error("检查社区设置失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
}

/** 只要求登录（艺术家查看/回应自己的邀请）。 */
function requireLogin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as StoredUser;
  if (!user) return res.status(401).json({ error: "未登录" });
  if (user.status === "disabled") return res.status(403).json({ error: "账号已停用" });
  next();
}

function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as StoredUser;

  if (!user) {
    return res.status(401).json({ error: "未登录" });
  }

  // 与 publicUser 同口径：不能只看库里原始 role，否则前端显示超管、后端却 403。
  if (user.status === "disabled" || effectiveUserRole(user) !== "super_admin") {
    return res.status(403).json({ error: "需要超级管理员权限" });
  }

  next();
}

// 获取社区设置(包括应急开关状态)
router.get("/settings", async (req, res) => {
  try {
    const settings = await getCommunitySettings();
    const user = (req as any).user as StoredUser | undefined;
    
    // 检查是否可以上传：艺术家或超级管理员，且账号未被冻结/停用
    const canUpload = user && (
      (user.communityRole === "artist" || effectiveUserRole(user) === "super_admin") &&
      user.status !== "disabled" &&
      user.communityStatus !== "frozen"
    );
    
    res.json({ 
      ...settings, 
      isArtist: canUpload,
      isSuperAdmin: user ? effectiveUserRole(user) === "super_admin" : false,
    });
  } catch (err) {
    console.error("获取社区设置失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 上传帖子
router.post("/posts", requireArtist, upload.single("image"), async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    
    if (!req.file) {
      return res.status(400).json({ error: "请上传图片" });
    }
    
    const {
      title,
      prompt,
      description,
      isAiGenerated,
      isOriginal,
      isOpenSource,
      allowCommercialUse,
      disclaimerAccepted,
      tags: tagsStr,
    } = req.body;
    
    // 验证5项必选声明
    if (
      isAiGenerated === undefined ||
      isOriginal === undefined ||
      isOpenSource === undefined ||
      allowCommercialUse === undefined ||
      !disclaimerAccepted
    ) {
      return res.status(400).json({ error: "请完成所有必选声明" });
    }
    
    // 解析标签
    let tags: string[] = [];
    if (tagsStr) {
      try {
        tags = JSON.parse(typeof tagsStr === "string" ? tagsStr : JSON.stringify(tagsStr));
        if (!Array.isArray(tags)) {
          tags = [];
        }
      } catch (e) {
        tags = [];
      }
    }
    
    // 验证至少选一个标签
    if (tags.length === 0) {
      return res.status(400).json({ error: "请至少选择一个设计标签" });
    }
    
    const imageUrl = `/uploads/community/${req.file.filename}`;
    
    const post = await createPost({
      userId: user.id,
      username: user.username,
      imageUrl,
      title,
      prompt,
      description,
      tags,
      isAiGenerated: isAiGenerated === "true" || isAiGenerated === true,
      isOriginal: isOriginal === "true" || isOriginal === true,
      isOpenSource: isOpenSource === "true" || isOpenSource === true,
      allowCommercialUse: allowCommercialUse === "true" || allowCommercialUse === true,
      disclaimerAccepted: true,
      disclaimerAcceptedAt: new Date().toISOString(),
      status: "active",
    });
    
    res.json(post);
  } catch (err) {
    console.error("创建帖子失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 获取帖子列表
router.get("/posts", async (req, res) => {
  try {
    const { status = "active", userId, limit = "20", offset = "0" } = req.query;
    
    const posts = await listPosts({
      status: status as any,
      userId: userId as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    
    // 如果用户已登录,附加点赞和收藏状态
    const user = (req as any).user as StoredUser;
    if (user) {
      const postsWithStatus = await Promise.all(
        posts.map(async post => ({
          ...post,
          isLiked: await hasUserLiked(post.id, user.id),
          isFavorited: await hasUserFavorited(post.id, user.id),
        }))
      );
      return res.json(postsWithStatus);
    }
    
    res.json(posts);
  } catch (err) {
    console.error("获取帖子列表失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 获取单个帖子详情
router.get("/posts/:id", async (req, res) => {
  try {
    const post = await getPost(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: "帖子不存在" });
    }
    
    if (post.status !== "active") {
      return res.status(404).json({ error: "帖子已下架" });
    }
    
    // 增加浏览量
    await incrementPostViews(post.id);
    
    // 如果用户已登录,附加点赞和收藏状态
    const user = (req as any).user as StoredUser;
    if (user) {
      const isLiked = await hasUserLiked(post.id, user.id);
      const isFavorited = await hasUserFavorited(post.id, user.id);
      return res.json({ ...post, isLiked, isFavorited });
    }
    
    res.json(post);
  } catch (err) {
    console.error("获取帖子详情失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 点赞/取消点赞
router.post("/posts/:id/like", async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    
    if (!user) {
      return res.status(401).json({ error: "未登录" });
    }
    
    const result = await toggleLike(req.params.id, user.id);
    res.json(result);
  } catch (err) {
    console.error("点赞操作失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 收藏/取消收藏
router.post("/posts/:id/favorite", async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    
    if (!user) {
      return res.status(401).json({ error: "未登录" });
    }
    
    const result = await toggleFavorite(req.params.id, user.id);
    res.json(result);
  } catch (err) {
    console.error("收藏操作失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 获取用户收藏列表
router.get("/favorites", async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    
    if (!user) {
      return res.status(401).json({ error: "未登录" });
    }
    
    const favorites = await listUserFavorites(user.id);
    res.json(favorites);
  } catch (err) {
    console.error("获取收藏列表失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 添加评论
router.post("/posts/:id/comments", async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    
    if (!user) {
      return res.status(401).json({ error: "未登录" });
    }
    
    // 检查账号是否被冻结
    if (user.communityStatus === "frozen") {
      return res.status(403).json({ error: "您的账号已被冻结,无法发表评论" });
    }
    
    // 检查应急开关
    const settings = await getCommunitySettings();
    if (settings.emergencySwitch) {
      return res.status(503).json({ 
        error: "社区功能暂时关闭,请稍后再试",
        emergencyMode: true 
      });
    }
    
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "评论内容不能为空" });
    }
    
    const comment = await createComment({
      postId: req.params.id,
      userId: user.id,
      username: user.username,
      content: content.trim(),
    });
    
    res.json(comment);
  } catch (err) {
    console.error("添加评论失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 获取评论列表
router.get("/posts/:id/comments", async (req, res) => {
  try {
    const comments = await listComments(req.params.id);
    res.json(comments);
  } catch (err) {
    console.error("获取评论列表失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// ========== 管理接口 ==========

// ========== 艺术家授权：异步邀请流程 ==========
//
// 超管发起邀请 -> 艺术家在个人中心接受 -> 超管确认通过 -> 才写 communityRole。
// ⚠️ 旧 grant-artist 保留为**同一套逻辑**的兼容别名：缓存中的旧页面点「授权」
// 也只会发出邀请，不会绕过确认直接放行（不能留一个能直接授权的旁路）。

function isBusinessError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /已有待处理|已经是艺术家|状态已变更|已冻结或停用|权限已撤销|权限已写入/.test(message);
}

function invitationError(res: express.Response, error: unknown, fallback: string) {
  console.error(fallback, error);
  if (error instanceof Error && /^(邀请不存在|被邀请的用户已不存在)$/.test(error.message)) {
    return res.status(404).json({ error: error.message });
  }
  if (isBusinessError(error)) {
    return res.status(400).json({ error: error instanceof Error ? error.message : fallback });
  }
  return res.status(500).json({ error: fallback });
}

async function handleInviteArtist(req: express.Request, res: express.Response, account: unknown) {
  const admin = (req as any).user as StoredUser;
  const key = typeof account === "string" ? account.trim() : "";
  if (!key) return res.status(400).json({ error: "请输入艺术家的注册账号" });

  // 兼容旧前端：它可能传 email / username，也可能传 userId。
  const target = await findUserByAccount(key) || await findUserById(key);
  if (!target) return res.status(404).json({ error: "该注册账号不存在，请确认对方已注册" });
  if (target.id === admin.id) return res.status(400).json({ error: "不能向自己发送艺术家邀请" });

  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
  const invitation = await createArtistInvitation({
    userId: target.id,
    username: target.username,
    invitedBy: admin.id,
    invitedByUsername: admin.username,
    ...(note ? { note } : {}),
  });
  return res.json({
    success: true,
    message: `邀请已发送给 ${target.username}，等待对方在个人中心接受`,
    invitation,
  });
}

router.post("/admin/invite-artist", requireSuperAdmin, async (req, res) => {
  try {
    await handleInviteArtist(req, res, req.body?.account ?? req.body?.email ?? req.body?.username);
  } catch (err) {
    invitationError(res, err, "发送邀请失败");
  }
});

// 兼容旧页面：语义已改为「发邀请」，不再直接授予权限。
router.post("/admin/grant-artist", requireSuperAdmin, async (req, res) => {
  try {
    await handleInviteArtist(req, res, req.body?.account ?? req.body?.email ?? req.body?.username ?? req.body?.userId);
  } catch (err) {
    invitationError(res, err, "发送邀请失败");
  }
});

/** 超管：邀请列表，accepted 状态即「艺术家已接受、待你确认」的通过提醒。 */
router.get("/admin/artist-invitations", requireSuperAdmin, async (_req, res) => {
  try {
    res.json({ invitations: await listAllArtistInvitations() });
  } catch (err) {
    invitationError(res, err, "读取邀请列表失败");
  }
});

/** 超管：确认通过 —— 这一步才真正写入艺术家权限。 */
router.post("/admin/artist-invitations/:id/confirm", requireSuperAdmin, async (req, res) => {
  try {
    const admin = (req as any).user as StoredUser;
    const invitation = await confirmArtistInvitation(req.params.id, item =>
      grantArtistFromInvitation(item, admin.id)
    );
    res.json({ success: true, message: `${invitation.username} 的艺术家上传权限已生效`, invitation });
  } catch (err) {
    invitationError(res, err, "确认授权失败");
  }
});

/** 超管：撤回尚未生效的邀请。 */
router.post("/admin/artist-invitations/:id/revoke", requireSuperAdmin, async (req, res) => {
  try {
    const all = await listAllArtistInvitations();
    const invitation = all.find(item => item.id === req.params.id);
    if (!invitation) return res.status(404).json({ error: "邀请不存在" });
    if (invitation.status !== "pending" && invitation.status !== "accepted") {
      return res.status(400).json({ error: "该邀请已结束，无需撤回" });
    }
    const updated = await advanceArtistInvitation(invitation.id, invitation.status, "revoked");
    res.json({ success: true, invitation: updated });
  } catch (err) {
    invitationError(res, err, "撤回邀请失败");
  }
});

/** 艺术家：个人中心里的邀请提醒。 */
router.get("/artist-invitations", requireLogin, async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    res.json({ invitations: await listArtistInvitationsForUser(user.id) });
  } catch (err) {
    invitationError(res, err, "读取邀请失败");
  }
});

/** 艺术家：接受邀请（之后等超管确认）。 */
router.post("/artist-invitations/:id/accept", requireLogin, async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    const invitation = await advanceArtistInvitation(req.params.id, "pending", "accepted", {
      acceptedAt: new Date().toISOString(),
    }, user.id);
    res.json({ success: true, message: "已接受邀请，等待管理员确认后权限生效", invitation });
  } catch (err) {
    invitationError(res, err, "接受邀请失败");
  }
});

/** 艺术家：拒绝邀请。 */
router.post("/artist-invitations/:id/decline", requireLogin, async (req, res) => {
  try {
    const user = (req as any).user as StoredUser;
    const invitation = await advanceArtistInvitation(req.params.id, "pending", "declined", {}, user.id);
    res.json({ success: true, invitation });
  } catch (err) {
    invitationError(res, err, "拒绝邀请失败");
  }
});

// 撤销艺术家权限
router.post("/admin/revoke-artist", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "请提供用户 ID" });
    }
    
    await updateUser(userId, {
      communityRole: undefined,
      artistGrantedAt: undefined,
      artistGrantedBy: undefined,
    });
    
    res.json({ success: true, message: "艺术家权限撤销成功" });
  } catch (err) {
    console.error("撤销艺术家权限失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 下架帖子
router.post("/admin/remove-post", requireSuperAdmin, async (req, res) => {
  try {
    const { postId, reason } = req.body;
    const admin = (req as any).user as StoredUser;
    
    if (!postId) {
      return res.status(400).json({ error: "请提供帖子 ID" });
    }
    
    const success = await removePost(postId, admin.id, reason);
    
    if (!success) {
      return res.status(404).json({ error: "帖子不存在" });
    }
    
    res.json({ success: true, message: "帖子已下架" });
  } catch (err) {
    console.error("下架帖子失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 冻结账号
router.post("/admin/freeze-account", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "请提供用户 ID" });
    }
    
    await updateUser(userId, {
      communityStatus: "frozen",
    });
    
    res.json({ success: true, message: "账号已冻结" });
  } catch (err) {
    console.error("冻结账号失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 解冻账号
router.post("/admin/unfreeze-account", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "请提供用户 ID" });
    }
    
    await updateUser(userId, {
      communityStatus: "active",
    });
    
    res.json({ success: true, message: "账号已解冻" });
  } catch (err) {
    console.error("解冻账号失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 设置应急开关
router.post("/admin/emergency-switch", requireSuperAdmin, async (req, res) => {
  try {
    const { enabled, reason } = req.body;
    const admin = (req as any).user as StoredUser;
    
    if (enabled === undefined) {
      return res.status(400).json({ error: "请提供开关状态" });
    }
    
    await setEmergencySwitch(enabled, admin.id, reason);
    
    res.json({ 
      success: true, 
      message: enabled ? "应急开关已启用,社区功能暂时关闭" : "应急开关已关闭,社区功能恢复正常" 
    });
  } catch (err) {
    console.error("设置应急开关失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 删除评论
router.delete("/admin/comments/:id", requireSuperAdmin, async (req, res) => {
  try {
    const admin = (req as any).user as StoredUser;
    const success = await removeComment(req.params.id, admin.id);
    
    if (!success) {
      return res.status(404).json({ error: "评论不存在" });
    }
    
    res.json({ success: true, message: "评论已删除" });
  } catch (err) {
    console.error("删除评论失败:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

export default router;
