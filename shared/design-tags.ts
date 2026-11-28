/**
 * 设计社区标签配置
 * 30+ 标签，围绕视觉创意、平面设计、UI设计、品牌设计、海报、运营等常用设计风格
 */

export interface DesignTag {
  id: string;
  label: string;
  category: "visual" | "graphic" | "ui" | "brand" | "poster" | "operation" | "illustration" | "web" | "product";
  color?: string;
}

export const DESIGN_TAGS: DesignTag[] = [
  // 视觉创意 (Visual Creativity)
  { id: "abstract", label: "抽象艺术", category: "visual", color: "#6366f1" },
  { id: "minimalism", label: "极简主义", category: "visual", color: "#8b5cf6" },
  { id: "glitch", label: "故障艺术", category: "visual", color: "#ec4899" },
  { id: "gradient", label: "渐变设计", category: "visual", color: "#f59e0b" },
  { id: "3d-art", label: "3D 艺术", category: "visual", color: "#06b6d4" },
  { id: "collage", label: "拼贴艺术", category: "visual", color: "#a855f7" },
  { id: "cyberpunk", label: "赛博朋克", category: "visual", color: "#ef4444" },
  { id: "vaporwave", label: "蒸汽波", category: "visual", color: "#a78bfa" },

  // 平面设计 (Graphic Design)
  { id: "typography", label: "字体设计", category: "graphic", color: "#3b82f6" },
  { id: "icon-design", label: "图标设计", category: "graphic", color: "#10b981" },
  { id: "illustration", label: "插画", category: "graphic", color: "#f97316" },
  { id: "logo", label: "LOGO 设计", category: "graphic", color: "#06b6d4" },
  { id: "color-palette", label: "色彩搭配", category: "graphic", color: "#ec4899" },
  { id: "pattern", label: "图案纹理", category: "graphic", color: "#8b5cf6" },
  { id: "composition", label: "构图美学", category: "graphic", color: "#f59e0b" },

  // UI 设计 (UI Design)
  { id: "ui-kit", label: "UI Kit", category: "ui", color: "#0ea5e9" },
  { id: "mobile-ui", label: "移动端 UI", category: "ui", color: "#6366f1" },
  { id: "web-design", label: "网站设计", category: "ui", color: "#3b82f6" },
  { id: "dashboard", label: "数据面板", category: "ui", color: "#10b981" },
  { id: "app-interface", label: "应用界面", category: "ui", color: "#0ea5e9" },
  { id: "ux-flow", label: "交互流程", category: "ui", color: "#a855f7" },
  { id: "component-library", label: "组件库", category: "ui", color: "#f59e0b" },

  // 品牌设计 (Brand Design)
  { id: "brand-identity", label: "品牌识别", category: "brand", color: "#ef4444" },
  { id: "brand-guideline", label: "品牌规范", category: "brand", color: "#f97316" },
  { id: "packaging", label: "包装设计", category: "brand", color: "#fbbf24" },
  { id: "brand-story", label: "品牌故事", category: "brand", color: "#ec4899" },

  // 海报设计 (Poster Design)
  { id: "poster", label: "海报", category: "poster", color: "#ef4444" },
  { id: "movie-poster", label: "电影海报", category: "poster", color: "#dc2626" },
  { id: "event-poster", label: "活动海报", category: "poster", color: "#f97316" },
  { id: "music-poster", label: "音乐海报", category: "poster", color: "#ec4899" },

  // 运营设计 (Operational Design)
  { id: "social-media", label: "社交媒体", category: "operation", color: "#06b6d4" },
  { id: "banner", label: "横幅/Banner", category: "operation", color: "#3b82f6" },
  { id: "promotion", label: "促销设计", category: "operation", color: "#fbbf24" },
  { id: "content-design", label: "内容设计", category: "operation", color: "#10b981" },
  { id: "template", label: "模板设计", category: "operation", color: "#a855f7" },

  // 插画 (Illustration)
  { id: "character", label: "角色设计", category: "illustration", color: "#ec4899" },
  { id: "landscape", label: "风景插画", category: "illustration", color: "#10b981" },
  { id: "concept-art", label: "概念艺术", category: "illustration", color: "#8b5cf6" },

  // 网页设计 (Web Design)
  { id: "landing-page", label: "落地页", category: "web", color: "#0ea5e9" },
  { id: "portfolio", label: "作品集", category: "web", color: "#3b82f6" },

  // 产品设计 (Product Design)
  { id: "product-mockup", label: "产品样机", category: "product", color: "#6366f1" },
  { id: "user-research", label: "用户研究", category: "product", color: "#a855f7" },
];

export const TAG_CATEGORIES = {
  visual: "视觉创意",
  graphic: "平面设计",
  ui: "UI 设计",
  brand: "品牌设计",
  poster: "海报",
  operation: "运营",
  illustration: "插画",
  web: "网页设计",
  product: "产品设计",
} as const;

export function getTagLabel(tagId: string): string {
  const tag = DESIGN_TAGS.find(t => t.id === tagId);
  return tag?.label || tagId;
}

export function getTagsByCategory(category: keyof typeof TAG_CATEGORIES): DesignTag[] {
  return DESIGN_TAGS.filter(t => t.category === category);
}

export function getTagColor(tagId: string): string {
  const tag = DESIGN_TAGS.find(t => t.id === tagId);
  return tag?.color || "#6b7280";
}
