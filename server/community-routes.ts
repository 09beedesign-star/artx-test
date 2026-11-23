import express from "express";
import multer from "multer";
import path from "path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
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
} from "./community-store";
import { findUserById, updateUser, type StoredUser } from "./auth-store";

const router = express.Router();

// 配置图片上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads", "community");
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
function requireArtist(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as StoredUser;
  
  if (!user) {
    return res.status(401).json({ error: "未登录" });
  }
  
  // 检查应急开关
  getCommunitySettings().then(settings => {
    if (settings.emergencySwitch) {
      return res.status(503).json({ 
        error: "社区功能暂时关闭,请稍后再试",
        emergencyMode: true 
      });
    }
    
    // 检查艺术家权限
    if (user.communityRole !== "artist") {
      return res.status(403).json({ error: "需要艺术家权限才能发布内容" });
    }
    
    // 检查账号状态
    if (user.communityStatus === "frozen") {
      return res.status(403).json({ error: "您的账号已被冻结,无法发布内容" });
    }
    
    next();
  }).catch(err => {
    console.error("检查社区设置失败:", err);
    res.status(500).json({ error: "服务器错误" });
  });
}

function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as StoredUser;
  
  if (!user) {
    return res.status(401).json({ error: "未登录" });
  }
  
  if (user.role !== "super_admin") {
    return res.status(403).json({ error: "需要超级管理员权限" });
  }
  
  next();
}

// 获取社区设置(包括应急开关状态)
router.get("/settings", async (req, res) => {
  try {
    const settings = await getCommunitySettings();
    res.json(settings);
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
    
    const imageUrl = `/uploads/community/${req.file.filename}`;
    
    const post = await createPost({
      userId: user.id,
      username: user.username,
      imageUrl,
      title,
      prompt,
      description,
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

// 授予艺术家权限
router.post("/admin/grant-artist", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    const admin = (req as any).user as StoredUser;
    
    if (!userId) {
      return res.status(400).json({ error: "请提供用户 ID" });
    }
    
    const targetUser = await findUserById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "用户不存在" });
    }
    
    await updateUser(userId, {
      communityRole: "artist",
      communityStatus: "active",
      artistGrantedAt: new Date().toISOString(),
      artistGrantedBy: admin.id,
    });
    
    res.json({ success: true, message: "艺术家权限授予成功" });
  } catch (err) {
    console.error("授予艺术家权限失败:", err);
    res.status(500).json({ error: "服务器错误" });
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
      communityStatus: undefined,
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
