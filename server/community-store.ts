import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { PostgresJsonDocumentStore } from "./postgres-json-store";

const asyncLocalStorage = new AsyncLocalStorage<{ requestId: string }>();

interface CommunityPost {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  prompt?: string;
  title?: string;
  description?: string;
  
  // 5项必选声明
  isAiGenerated: boolean;
  isOriginal: boolean;
  isOpenSource: boolean;
  allowCommercialUse: boolean;
  disclaimerAccepted: boolean;
  
  disclaimerAcceptedAt: string;
  status: "active" | "removed" | "pending";
  createdAt: string;
  updatedAt: string;
  
  // 互动统计
  likes: number;
  commentsCount: number;
  favoritesCount: number;
  viewsCount: number;
  
  // 管理字段
  removedAt?: string;
  removedBy?: string;
  removedReason?: string;
}

interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  content: string;
  status: "active" | "removed";
  createdAt: string;
  removedAt?: string;
  removedBy?: string;
}

interface CommunityLike {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
}

interface CommunityFavorite {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
}

interface CommunitySettings {
  emergencySwitch: boolean;
  emergencySwitchUpdatedAt?: string;
  emergencySwitchUpdatedBy?: string;
  emergencySwitchReason?: string;
}

const store = new PostgresJsonDocumentStore();

// 社区帖子
export async function createPost(post: Omit<CommunityPost, "id" | "createdAt" | "updatedAt" | "likes" | "commentsCount" | "favoritesCount" | "viewsCount">): Promise<CommunityPost> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const newPost: CommunityPost = {
    ...post,
    id,
    createdAt: now,
    updatedAt: now,
    likes: 0,
    commentsCount: 0,
    favoritesCount: 0,
    viewsCount: 0,
  };
  
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  posts.push(newPost);
  await store.save("community-posts", posts);
  
  return newPost;
}

export async function getPost(postId: string): Promise<CommunityPost | null> {
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  return posts.find(p => p.id === postId) || null;
}

export async function listPosts(options: {
  status?: CommunityPost["status"];
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunityPost[]> {
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  
  let filtered = posts;
  
  if (options.status) {
    filtered = filtered.filter(p => p.status === options.status);
  }
  
  if (options.userId) {
    filtered = filtered.filter(p => p.userId === options.userId);
  }
  
  // 按创建时间倒序
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  if (options.offset) {
    filtered = filtered.slice(options.offset);
  }
  
  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
  }
  
  return filtered;
}

export async function removePost(postId: string, removedBy: string, reason?: string): Promise<boolean> {
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  const post = posts.find(p => p.id === postId);
  
  if (!post) {
    return false;
  }
  
  post.status = "removed";
  post.removedAt = new Date().toISOString();
  post.removedBy = removedBy;
  post.removedReason = reason;
  post.updatedAt = new Date().toISOString();
  
  await store.save("community-posts", posts);
  return true;
}

export async function incrementPostViews(postId: string): Promise<void> {
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  const post = posts.find(p => p.id === postId);
  
  if (post && post.status === "active") {
    post.viewsCount = (post.viewsCount || 0) + 1;
    post.updatedAt = new Date().toISOString();
    await store.save("community-posts", posts);
  }
}

// 评论
export async function createComment(comment: Omit<CommunityComment, "id" | "createdAt" | "status">): Promise<CommunityComment> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const newComment: CommunityComment = {
    ...comment,
    id,
    status: "active",
    createdAt: now,
  };
  
  const comments = await store.load<CommunityComment[]>("community-comments") || [];
  comments.push(newComment);
  await store.save("community-comments", comments);
  
  // 更新帖子评论计数
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  const post = posts.find(p => p.id === comment.postId);
  if (post) {
    post.commentsCount = (post.commentsCount || 0) + 1;
    post.updatedAt = new Date().toISOString();
    await store.save("community-posts", posts);
  }
  
  return newComment;
}

export async function listComments(postId: string): Promise<CommunityComment[]> {
  const comments = await store.load<CommunityComment[]>("community-comments") || [];
  return comments
    .filter(c => c.postId === postId && c.status === "active")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function removeComment(commentId: string, removedBy: string): Promise<boolean> {
  const comments = await store.load<CommunityComment[]>("community-comments") || [];
  const comment = comments.find(c => c.id === commentId);
  
  if (!comment) {
    return false;
  }
  
  comment.status = "removed";
  comment.removedAt = new Date().toISOString();
  comment.removedBy = removedBy;
  
  await store.save("community-comments", comments);
  
  // 更新帖子评论计数
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  const post = posts.find(p => p.id === comment.postId);
  if (post && post.commentsCount > 0) {
    post.commentsCount -= 1;
    post.updatedAt = new Date().toISOString();
    await store.save("community-posts", posts);
  }
  
  return true;
}

// 点赞
export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean; count: number }> {
  const likes = await store.load<CommunityLike[]>("community-likes") || [];
  const existingLike = likes.find(l => l.postId === postId && l.userId === userId);
  
  if (existingLike) {
    // 取消点赞
    const filtered = likes.filter(l => !(l.postId === postId && l.userId === userId));
    await store.save("community-likes", filtered);
    
    // 更新帖子点赞计数
    const posts = await store.load<CommunityPost[]>("community-posts") || [];
    const post = posts.find(p => p.id === postId);
    if (post && post.likes > 0) {
      post.likes -= 1;
      post.updatedAt = new Date().toISOString();
      await store.save("community-posts", posts);
      return { liked: false, count: post.likes };
    }
    return { liked: false, count: 0 };
  } else {
    // 添加点赞
    const newLike: CommunityLike = {
      id: crypto.randomUUID(),
      postId,
      userId,
      createdAt: new Date().toISOString(),
    };
    likes.push(newLike);
    await store.save("community-likes", likes);
    
    // 更新帖子点赞计数
    const posts = await store.load<CommunityPost[]>("community-posts") || [];
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.likes = (post.likes || 0) + 1;
      post.updatedAt = new Date().toISOString();
      await store.save("community-posts", posts);
      return { liked: true, count: post.likes };
    }
    return { liked: true, count: 1 };
  }
}

export async function hasUserLiked(postId: string, userId: string): Promise<boolean> {
  const likes = await store.load<CommunityLike[]>("community-likes") || [];
  return likes.some(l => l.postId === postId && l.userId === userId);
}

// 收藏
export async function toggleFavorite(postId: string, userId: string): Promise<{ favorited: boolean; count: number }> {
  const favorites = await store.load<CommunityFavorite[]>("community-favorites") || [];
  const existingFavorite = favorites.find(f => f.postId === postId && f.userId === userId);
  
  if (existingFavorite) {
    // 取消收藏
    const filtered = favorites.filter(f => !(f.postId === postId && f.userId === userId));
    await store.save("community-favorites", filtered);
    
    // 更新帖子收藏计数
    const posts = await store.load<CommunityPost[]>("community-posts") || [];
    const post = posts.find(p => p.id === postId);
    if (post && post.favoritesCount > 0) {
      post.favoritesCount -= 1;
      post.updatedAt = new Date().toISOString();
      await store.save("community-posts", posts);
      return { favorited: false, count: post.favoritesCount };
    }
    return { favorited: false, count: 0 };
  } else {
    // 添加收藏
    const newFavorite: CommunityFavorite = {
      id: crypto.randomUUID(),
      postId,
      userId,
      createdAt: new Date().toISOString(),
    };
    favorites.push(newFavorite);
    await store.save("community-favorites", favorites);
    
    // 更新帖子收藏计数
    const posts = await store.load<CommunityPost[]>("community-posts") || [];
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.favoritesCount = (post.favoritesCount || 0) + 1;
      post.updatedAt = new Date().toISOString();
      await store.save("community-posts", posts);
      return { favorited: true, count: post.favoritesCount };
    }
    return { favorited: true, count: 1 };
  }
}

export async function hasUserFavorited(postId: string, userId: string): Promise<boolean> {
  const favorites = await store.load<CommunityFavorite[]>("community-favorites") || [];
  return favorites.some(f => f.postId === postId && f.userId === userId);
}

export async function listUserFavorites(userId: string): Promise<CommunityPost[]> {
  const favorites = await store.load<CommunityFavorite[]>("community-favorites") || [];
  const userFavorites = favorites.filter(f => f.userId === userId);
  
  const posts = await store.load<CommunityPost[]>("community-posts") || [];
  const favoritedPosts = posts.filter(p => 
    userFavorites.some(f => f.postId === p.id) && p.status === "active"
  );
  
  // 按收藏时间倒序
  return favoritedPosts.sort((a, b) => {
    const aFav = userFavorites.find(f => f.postId === a.id);
    const bFav = userFavorites.find(f => f.postId === b.id);
    return new Date(bFav!.createdAt).getTime() - new Date(aFav!.createdAt).getTime();
  });
}

// 应急开关
export async function getCommunitySettings(): Promise<CommunitySettings> {
  const settings = await store.load<CommunitySettings>("community-settings");
  return settings || { emergencySwitch: false };
}

export async function setEmergencySwitch(enabled: boolean, updatedBy: string, reason?: string): Promise<void> {
  const settings: CommunitySettings = {
    emergencySwitch: enabled,
    emergencySwitchUpdatedAt: new Date().toISOString(),
    emergencySwitchUpdatedBy: updatedBy,
    emergencySwitchReason: reason,
  };
  await store.save("community-settings", settings);
}

export function runInContext<T>(requestId: string, fn: () => T): T {
  return asyncLocalStorage.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}
