import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { PostgresJsonDocumentStore } from "./postgres-json-store";
import { findUserById } from "./auth-store";

const asyncLocalStorage = new AsyncLocalStorage<{ requestId: string }>();

interface CommunityPost {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  prompt?: string;
  title?: string;
  description?: string;
  tags?: string[];
  
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

export interface SiteAnnouncement {
  id: string;
  title: string;
  content: string;
  status: "active" | "archived";
  createdAt: string;
  createdBy: string;
  createdByUsername: string;
  updatedAt: string;
}

interface AnnouncementData {
  announcements: SiteAnnouncement[];
}

interface CommunityData {
  posts: CommunityPost[];
  comments: CommunityComment[];
  likes: CommunityLike[];
  favorites: CommunityFavorite[];
}

const DATABASE_URL = process.env.DATABASE_URL || "";

const postsStore = new PostgresJsonDocumentStore<{ posts: CommunityPost[] }>(DATABASE_URL, "community-posts");
const commentsStore = new PostgresJsonDocumentStore<{ comments: CommunityComment[] }>(DATABASE_URL, "community-comments");
const likesStore = new PostgresJsonDocumentStore<{ likes: CommunityLike[] }>(DATABASE_URL, "community-likes");
const favoritesStore = new PostgresJsonDocumentStore<{ favorites: CommunityFavorite[] }>(DATABASE_URL, "community-favorites");
const settingsStore = new PostgresJsonDocumentStore<CommunitySettings>(DATABASE_URL, "community-settings");
const announcementsStore = new PostgresJsonDocumentStore<AnnouncementData>(DATABASE_URL, "community-announcements");

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
  
  return postsStore.transaction(async (tx) => {
    const data = await tx.load();
    const posts = data?.posts || [];
    posts.push(newPost);
    await tx.save({ posts });
    return newPost;
  });
}

export async function getPost(postId: string): Promise<CommunityPost | null> {
  const data = await postsStore.load();
  const posts = data?.posts || [];
  return posts.find(p => p.id === postId) || null;
}

export async function listPosts(options: {
  status?: CommunityPost["status"];
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunityPost[]> {
  const data = await postsStore.load();
  const posts = data?.posts || [];
  
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
  return postsStore.transaction(async (tx) => {
    const data = await tx.load();
    const posts = data?.posts || [];
    const post = posts.find(p => p.id === postId);
    
    if (!post) {
      return false;
    }
    
    post.status = "removed";
    post.removedAt = new Date().toISOString();
    post.removedBy = removedBy;
    post.removedReason = reason;
    post.updatedAt = new Date().toISOString();
    
    await tx.save({ posts });
    return true;
  });
}

export async function incrementPostViews(postId: string): Promise<void> {
  await postsStore.transaction(async (tx) => {
    const data = await tx.load();
    const posts = data?.posts || [];
    const post = posts.find(p => p.id === postId);
    
    if (post && post.status === "active") {
      post.viewsCount = (post.viewsCount || 0) + 1;
      post.updatedAt = new Date().toISOString();
      await tx.save({ posts });
    }
  });
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
  
  return commentsStore.transaction(async (tx) => {
    const commentsData = await tx.load();
    const comments = commentsData?.comments || [];
    comments.push(newComment);
    await tx.save({ comments });
    
    // 更新帖子评论计数
    const postsData = await postsStore.load();
    const posts = postsData?.posts || [];
    const post = posts.find(p => p.id === comment.postId);
    if (post) {
      post.commentsCount = (post.commentsCount || 0) + 1;
      post.updatedAt = now;
      await postsStore.save({ posts });
    }
    
    return newComment;
  });
}

export async function listComments(postId: string): Promise<CommunityComment[]> {
  const data = await commentsStore.load();
  const comments = data?.comments || [];
  return comments
    .filter(c => c.postId === postId && c.status === "active")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function removeComment(commentId: string, removedBy: string): Promise<boolean> {
  return commentsStore.transaction(async (tx) => {
    const commentsData = await tx.load();
    const comments = commentsData?.comments || [];
    const comment = comments.find(c => c.id === commentId);
    
    if (!comment) {
      return false;
    }
    
    comment.status = "removed";
    comment.removedAt = new Date().toISOString();
    comment.removedBy = removedBy;
    
    await tx.save({ comments });
    
    // 更新帖子评论计数
    const postsData = await postsStore.load();
    const posts = postsData?.posts || [];
    const post = posts.find(p => p.id === comment.postId);
    if (post && post.commentsCount > 0) {
      post.commentsCount -= 1;
      post.updatedAt = new Date().toISOString();
      await postsStore.save({ posts });
    }
    
    return true;
  });
}

// 点赞
export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean; count: number }> {
  return likesStore.transaction(async (tx) => {
    const likesData = await tx.load();
    const likes = likesData?.likes || [];
    const existingLike = likes.find(l => l.postId === postId && l.userId === userId);
    
    if (existingLike) {
      // 取消点赞
      const filtered = likes.filter(l => !(l.postId === postId && l.userId === userId));
      await tx.save({ likes: filtered });
      
      // 更新帖子点赞计数
      const postsData = await postsStore.load();
      const posts = postsData?.posts || [];
      const post = posts.find(p => p.id === postId);
      if (post && post.likes > 0) {
        post.likes -= 1;
        post.updatedAt = new Date().toISOString();
        await postsStore.save({ posts });
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
      await tx.save({ likes });
      
      // 更新帖子点赞计数
      const postsData = await postsStore.load();
      const posts = postsData?.posts || [];
      const post = posts.find(p => p.id === postId);
      if (post) {
        post.likes = (post.likes || 0) + 1;
        post.updatedAt = new Date().toISOString();
        await postsStore.save({ posts });
        return { liked: true, count: post.likes };
      }
      return { liked: true, count: 1 };
    }
  });
}

export async function hasUserLiked(postId: string, userId: string): Promise<boolean> {
  const data = await likesStore.load();
  const likes = data?.likes || [];
  return likes.some(l => l.postId === postId && l.userId === userId);
}

// 收藏
export async function toggleFavorite(postId: string, userId: string): Promise<{ favorited: boolean; count: number }> {
  return favoritesStore.transaction(async (tx) => {
    const favoritesData = await tx.load();
    const favorites = favoritesData?.favorites || [];
    const existingFavorite = favorites.find(f => f.postId === postId && f.userId === userId);
    
    if (existingFavorite) {
      // 取消收藏
      const filtered = favorites.filter(f => !(f.postId === postId && f.userId === userId));
      await tx.save({ favorites: filtered });
      
      // 更新帖子收藏计数
      const postsData = await postsStore.load();
      const posts = postsData?.posts || [];
      const post = posts.find(p => p.id === postId);
      if (post && post.favoritesCount > 0) {
        post.favoritesCount -= 1;
        post.updatedAt = new Date().toISOString();
        await postsStore.save({ posts });
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
      await tx.save({ favorites });
      
      // 更新帖子收藏计数
      const postsData = await postsStore.load();
      const posts = postsData?.posts || [];
      const post = posts.find(p => p.id === postId);
      if (post) {
        post.favoritesCount = (post.favoritesCount || 0) + 1;
        post.updatedAt = new Date().toISOString();
        await postsStore.save({ posts });
        return { favorited: true, count: post.favoritesCount };
      }
      return { favorited: true, count: 1 };
    }
  });
}

export async function hasUserFavorited(postId: string, userId: string): Promise<boolean> {
  const data = await favoritesStore.load();
  const favorites = data?.favorites || [];
  return favorites.some(f => f.postId === postId && f.userId === userId);
}

export async function listUserFavorites(userId: string): Promise<CommunityPost[]> {
  const favoritesData = await favoritesStore.load();
  const favorites = favoritesData?.favorites || [];
  const userFavorites = favorites.filter(f => f.userId === userId);
  
  const postsData = await postsStore.load();
  const posts = postsData?.posts || [];
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
  const settings = await settingsStore.load();
  if (!settings || !settings.emergencySwitch) {
    return { emergencySwitch: false };
  }
  return settings as CommunitySettings;
}

export async function setEmergencySwitch(enabled: boolean, updatedBy: string, reason?: string): Promise<void> {
  const settings: CommunitySettings = {
    emergencySwitch: enabled,
    emergencySwitchUpdatedAt: new Date().toISOString(),
    emergencySwitchUpdatedBy: updatedBy,
    emergencySwitchReason: reason,
  };
  await settingsStore.save(settings);
}

// 站内公告
export async function createAnnouncement(
  announcement: Omit<SiteAnnouncement, "id" | "createdAt" | "updatedAt">
): Promise<SiteAnnouncement> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newAnnouncement: SiteAnnouncement = {
    ...announcement,
    id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  return announcementsStore.transaction(async (tx) => {
    const data = await tx.load();
    const announcements = data?.announcements || [];
    announcements.push(newAnnouncement);
    await tx.save({ announcements });
    return newAnnouncement;
  });
}

export async function listAnnouncements(options?: {
  status?: "active" | "archived";
  limit?: number;
}): Promise<SiteAnnouncement[]> {
  const data = await announcementsStore.load();
  let announcements = data?.announcements || [];

  if (options?.status) {
    announcements = announcements.filter((a) => a.status === options.status);
  }

  // 按创建时间倒序，最新的在前
  announcements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (options?.limit) {
    announcements = announcements.slice(0, options.limit);
  }

  return announcements;
}

export async function archiveAnnouncement(announcementId: string): Promise<boolean> {
  return announcementsStore.transaction(async (tx) => {
    const data = await tx.load();
    const announcements = data?.announcements || [];
    const announcement = announcements.find((a) => a.id === announcementId);

    if (!announcement) {
      return false;
    }

    announcement.status = "archived";
    announcement.updatedAt = new Date().toISOString();
    await tx.save({ announcements });
    return true;
  });
}


export function runInContext<T>(requestId: string, fn: () => T): T {
  return asyncLocalStorage.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

/* ------------------------------------------------------------------ *
 * 艺术家授权邀请（异步三段式）
 *
 * 超管发起 -> 艺术家在个人中心接受 -> 超管确认通过 -> 权限才真正生效。
 * 独立文档 key，避免碰订单后台的 admin-data；所有写入走 transaction()
 * 拿 pg_advisory_xact_lock，防止「load→改→save」互相覆盖。
 * ------------------------------------------------------------------ */

export type ArtistInvitationStatus =
  | "pending"      // 已发出，等艺术家接受
  | "accepted"     // 艺术家已接受，等超管确认
  | "granted"      // 超管确认，权限已生效
  | "declined"     // 艺术家拒绝
  | "revoked";     // 超管撤回

export type ArtistInvitation = {
  id: string;
  userId: string;
  username: string;
  invitedBy: string;
  invitedByUsername: string;
  status: ArtistInvitationStatus;
  note?: string;
  createdAt: string;
  acceptedAt?: string;
  grantedAt?: string;
};

type InvitationData = { invitations: ArtistInvitation[] };

const invitationsStore = new PostgresJsonDocumentStore<InvitationData>(
  DATABASE_URL,
  "community-artist-invitations",
);

function invitationsOf(data: Partial<InvitationData> | null): ArtistInvitation[] {
  return Array.isArray(data?.invitations) ? [...data.invitations] : [];
}

// 等待邀请锁的请求不先占连接，给锁内 auth-users 事务和读取留出 pool 空位。
let invitationWriteChain: Promise<unknown> = Promise.resolve();
function withInvitationWriteLock<R>(fn: Parameters<typeof invitationsStore.transaction<R>>[0]): Promise<R> {
  const run = () => invitationsStore.transaction(fn);
  const result = invitationWriteChain.then(run, run);
  invitationWriteChain = result.catch(() => undefined);
  return result;
}

function byNewest(a: ArtistInvitation, b: ArtistInvitation) {
  return b.createdAt.localeCompare(a.createdAt);
}

export async function listArtistInvitationsForUser(userId: string): Promise<ArtistInvitation[]> {
  return invitationsOf(await invitationsStore.load())
    .filter(item => item.userId === userId)
    .sort(byNewest);
}

export async function listAllArtistInvitations(): Promise<ArtistInvitation[]> {
  return invitationsOf(await invitationsStore.load()).sort(byNewest);
}

export async function createArtistInvitation(input: {
  userId: string;
  username: string;
  invitedBy: string;
  invitedByUsername: string;
  note?: string;
}): Promise<ArtistInvitation> {
  return withInvitationWriteLock(async tx => {
    const list = invitationsOf(await tx.load());
    if (list.some(item => item.userId === input.userId &&
      (item.status === "pending" || item.status === "accepted"))) {
      throw new Error("该账号已有待处理的艺术家邀请，请等待对方回应或先撤回");
    }
    const target = await findUserById(input.userId);
    if (!target) throw new Error("被邀请的用户已不存在");
    if (target.status === "disabled" || target.communityStatus === "frozen") {
      throw new Error("账号已冻结或停用，不能邀请");
    }
    if (target.communityRole === "artist") {
      throw new Error("该账号已经是艺术家，无需重复邀请");
    }
    const invitation: ArtistInvitation = {
      id: crypto.randomUUID(),
      ...input,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await tx.save({ invitations: [...list, invitation] });
    return invitation;
  });
}

/** 只允许单步状态迁移；状态已被别人改过时明确报错，不静默覆盖。 */
export async function advanceArtistInvitation(
  id: string,
  expected: ArtistInvitationStatus,
  next: ArtistInvitationStatus,
  patch: Pick<Partial<ArtistInvitation>, "acceptedAt"> = {},
  actorUserId?: string,
): Promise<ArtistInvitation> {
  return withInvitationWriteLock(async tx => {
    const list = invitationsOf(await tx.load());
    const index = list.findIndex(item => item.id === id);
    if (index < 0 || (actorUserId !== undefined && list[index].userId !== actorUserId)) {
      throw new Error("邀请不存在");
    }
    const allowed = (expected === "pending" && ["accepted", "declined", "revoked"].includes(next)) ||
      (expected === "accepted" && next === "revoked");
    if (!allowed) throw new Error("邀请状态已变更：不允许该状态迁移");
    if (list[index].status !== expected) {
      throw new Error(`邀请状态已变更（当前：${list[index].status}），请刷新后重试`);
    }
    if (expected === "accepted") {
      const target = await findUserById(list[index].userId);
      if (target?.communityRole === "artist" && target.artistGrantInvitationId === id) {
        throw new Error("权限已写入，请重试确认授权或撤销艺术家权限");
      }
    }
    list[index] = {
      ...list[index],
      ...(next === "accepted" ? { acceptedAt: patch.acceptedAt || new Date().toISOString() } : {}),
      status: next,
    };
    await tx.save({ invitations: list });
    return list[index];
  });
}

/** 邀请锁始终先于 auth 锁；权限提交成功后才标完成，不做易失效的补偿写入。 */
export async function confirmArtistInvitation(
  id: string,
  grant: (invitation: ArtistInvitation & { status: "accepted" | "granted" }) => Promise<{ grantedAt: string }>,
): Promise<ArtistInvitation> {
  return withInvitationWriteLock(async tx => {
    const list = invitationsOf(await tx.load());
    const index = list.findIndex(item => item.id === id);
    if (index < 0) throw new Error("邀请不存在");
    const invitation = list[index];
    if (invitation.status !== "accepted" && invitation.status !== "granted") {
      throw new Error(`邀请状态已变更（当前：${invitation.status}），须先由本人接受`);
    }
    const { grantedAt } = await grant({ ...invitation, status: invitation.status });
    if (invitation.status === "granted") return invitation;
    list[index] = { ...invitation, status: "granted", grantedAt };
    await tx.save({ invitations: list });
    return list[index];
  });
}
