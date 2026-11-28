/**
 * Community Types — 社区功能的共享类型定义
 */

export interface CommunityPost {
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
