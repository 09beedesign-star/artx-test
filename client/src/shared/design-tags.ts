/**
 * 设计标签库 - 创意社区作品分类
 */

export interface DesignTag {
  id: string;
  label: string;
  category: string;
  color: string;
}

export const TAG_CATEGORIES: Record<string, string> = {
  style: "风格",
  medium: "介质",
  subject: "主题",
  technique: "技术",
  mood: "氛围",
};

export const DESIGN_TAGS: DesignTag[] = [
  // 风格 (Style)
  { id: "minimalist", label: "极简", category: "style", color: "#1f2937" },
  { id: "colorful", label: "彩色", category: "style", color: "#ec4899" },
  { id: "monochrome", label: "单色", category: "style", color: "#6b7280" },
  { id: "retro", label: "复古", category: "style", color: "#d97706" },
  { id: "cyberpunk", label: "赛博朋克", category: "style", color: "#06b6d4" },
  { id: "futuristic", label: "未来感", category: "style", color: "#a855f7" },
  { id: "vintage", label: "复古风", category: "style", color: "#b45309" },
  { id: "abstract", label: "抽象", category: "style", color: "#ef4444" },
  
  // 介质 (Medium)
  { id: "photography", label: "摄影", category: "medium", color: "#0891b2" },
  { id: "illustration", label: "插画", category: "medium", color: "#8b5cf6" },
  { id: "3d", label: "3D", category: "medium", color: "#3b82f6" },
  { id: "digital-art", label: "数字艺术", category: "medium", color: "#06b6d4" },
  { id: "motion-graphics", label: "动态图形", category: "medium", color: "#f59e0b" },
  { id: "ui-design", label: "UI设计", category: "medium", color: "#10b981" },
  { id: "graphic-design", label: "平面设计", category: "medium", color: "#ec4899" },
  { id: "typography", label: "排版", category: "medium", color: "#6366f1" },
  
  // 主题 (Subject)
  { id: "nature", label: "自然", category: "subject", color: "#22c55e" },
  { id: "landscape", label: "风景", category: "subject", color: "#84cc16" },
  { id: "portrait", label: "人像", category: "subject", color: "#f43f5e" },
  { id: "animals", label: "动物", category: "subject", color: "#f97316" },
  { id: "architecture", label: "建筑", category: "subject", color: "#64748b" },
  { id: "food", label: "美食", category: "subject", color: "#f59e0b" },
  { id: "product", label: "产品", category: "subject", color: "#6366f1" },
  { id: "abstract-shapes", label: "抽象形状", category: "subject", color: "#ec4899" },
  
  // 技术 (Technique)
  { id: "ai-generated", label: "AI生成", category: "technique", color: "#8b5cf6" },
  { id: "hand-drawn", label: "手绘", category: "technique", color: "#ef4444" },
  { id: "watercolor", label: "水彩", category: "technique", color: "#06b6d4" },
  { id: "oil-painting", label: "油画", category: "technique", color: "#d97706" },
  { id: "vector", label: "矢量", category: "technique", color: "#10b981" },
  { id: "pixel-art", label: "像素艺术", category: "technique", color: "#f59e0b" },
  { id: "collage", label: "拼贴", category: "technique", color: "#ec4899" },
  { id: "photo-manipulation", label: "照片合成", category: "technique", color: "#3b82f6" },
  
  // 氛围 (Mood)
  { id: "calm", label: "宁静", category: "mood", color: "#06b6d4" },
  { id: "energetic", label: "充满活力", category: "mood", color: "#ef4444" },
  { id: "mysterious", label: "神秘", category: "mood", color: "#6366f1" },
  { id: "playful", label: "顽皮", category: "mood", color: "#ec4899" },
  { id: "dramatic", label: "戏剧化", category: "mood", color: "#dc2626" },
  { id: "serene", label: "宁和", category: "mood", color: "#10b981" },
  { id: "dark", label: "黑暗", category: "mood", color: "#1f2937" },
  { id: "bright", label: "明亮", category: "mood", color: "#fbbf24" },
];
