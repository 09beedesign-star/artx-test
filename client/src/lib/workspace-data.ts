// Neo-Studio Dark Workspace — Data & Types

// ── AI Models ────────────────────────────────────────────────
export type AiModelOption = {
  id: string;
  label: string;
  color: string;
  description?: string;
};

export const AUTO_AI_MODEL: AiModelOption = {
  id: "auto",
  label: "auto",
  color: "oklch(0.78 0.18 120)",
  description: "根据提示词自动选择对话或生图模型",
};

export const IMAGE_AI_MODELS: AiModelOption[] = [
  { id: "gpt-image-2", label: "GPT Image 2", color: "oklch(0.72 0.18 200)" },
  { id: "gemini-3.1-flash-image", label: "🍌Nano Banana 3.1", color: "oklch(0.82 0.18 95)" },
  { id: "gemini-3.1-flash-image-preview", label: "🍌Nano Banana 3.1 lite", color: "oklch(0.78 0.15 105)" },
];

export const TEXT_AI_MODELS: AiModelOption[] = [
  { id: "gpt-4o", label: "GPT-4o", color: "oklch(0.72 0.18 160)" },
  { id: "gpt-5.4", label: "GPT-5.4", color: "oklch(0.70 0.16 255)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", color: "oklch(0.74 0.14 230)" },
  { id: "gpt-5.5", label: "GPT-5.5", color: "oklch(0.66 0.18 280)" },
];

export const IMAGE_AI_MODEL_OPTIONS: AiModelOption[] = [AUTO_AI_MODEL, ...IMAGE_AI_MODELS];
export const TEXT_AI_MODEL_OPTIONS: AiModelOption[] = [AUTO_AI_MODEL, ...TEXT_AI_MODELS];
export const ALL_AI_MODEL_OPTIONS: AiModelOption[] = [
  AUTO_AI_MODEL,
  ...IMAGE_AI_MODELS,
  ...TEXT_AI_MODELS,
];

export type AssetType = "image" | "video" | "brand" | "poster";

export interface Project {
  id: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  active?: boolean;
}

export interface GeneratedAsset {
  id: string;
  type: AssetType;
  title: string;
  width: number;
  height: number;
  src: string;
  projectId: string;
  tags?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  assets?: GeneratedAsset[];
  timestamp: Date;
}

export interface AgentStep {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "running" | "done";
}

export interface Layer {
  id: string;
  name: string;
  type: "image" | "text" | "shape" | "group";
  visible: boolean;
  locked: boolean;
  children?: Layer[];
}

// ── Static mock data ──────────────────────────────────────────

export const PROJECTS: Project[] = [
  { id: "p1", title: "跑鞋产品页", subtitle: "Athletic Product Launch", updatedAt: "2 小时前", active: true },
  { id: "p2", title: "咖啡品牌系统", subtitle: "Coffee Shop Brand System", updatedAt: "昨天" },
  { id: "p3", title: "登山品牌视频", subtitle: "Hiking Brand Campaign", updatedAt: "3 天前" },
  { id: "p4", title: "眼镜电商海报", subtitle: "Eyewear E-commerce", updatedAt: "上周" },
  { id: "p5", title: "科技产品发布", subtitle: "Tech Product Launch", updatedAt: "2 周前" },
];

export const POSTER_1 = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-poster-1-DATcWhVcZRVivtUCucEHfs.webp";
export const POSTER_2 = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-poster-2-NTxjh66koAhnBAhhcjC89d.webp";
export const BRAND_KIT = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-brand-kit-V9KcLx992pZUUDT7GuBo2a.webp";
export const SOCIAL_AD = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/ai-generated-social-ad-RrSD9DQUDaqwSjKBeYF3Wy.webp";
export const BG_GLOW = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/workspace-bg-glow-VcrGoRhdfcRLpcj7oX2BTa.webp";

export const GENERATED_ASSETS: GeneratedAsset[] = [
  { id: "a1", type: "image", title: "时尚大片海报", width: 720, height: 960, src: POSTER_1, projectId: "p1", tags: ["fashion", "editorial"] },
  { id: "a2", type: "image", title: "跑鞋产品图", width: 720, height: 960, src: POSTER_2, projectId: "p1", tags: ["product", "shoe"] },
  { id: "a3", type: "brand", title: "咖啡品牌手册", width: 1440, height: 1080, src: BRAND_KIT, projectId: "p2", tags: ["brand", "identity"] },
  { id: "a4", type: "poster", title: "科技产品广告", width: 720, height: 960, src: SOCIAL_AD, projectId: "p4", tags: ["tech", "ad"] },
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "为一个次世代跑鞋品牌设计产品页视觉资产，包括英雄图、产品特写和运动员穿着图，突出性能与材质。",
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: "m2",
    role: "assistant",
    content: "我已为次世代跑鞋产品详情页生成了一套视觉资产，聚焦清晰度与性能冲击力。\n\n该套图包含速度感十足的英雄图、材质特写以及精心控制的穿着图，统一的光线和视角贯穿全套，完整支撑 PDP 页面流程。",
    steps: [
      { id: "s1", label: "分析用户意图", detail: "Analyzed user intent", status: "done" },
      { id: "s2", label: "搜索高质量参考", detail: "Explored visual trends", status: "done" },
      { id: "s3", label: "调研品牌信息", detail: "Collected references", status: "done" },
    ],
    assets: [
      { id: "a1", type: "image", title: "时尚大片海报", width: 720, height: 960, src: POSTER_1, projectId: "p1" },
      { id: "a2", type: "image", title: "跑鞋产品图", width: 720, height: 960, src: POSTER_2, projectId: "p1" },
    ],
    timestamp: new Date(Date.now() - 60000),
  },
];

export const LAYERS: Layer[] = [
  { id: "l1", name: "英雄图层组", type: "group", visible: true, locked: false, children: [
    { id: "l1a", name: "背景", type: "image", visible: true, locked: true },
    { id: "l1b", name: "产品主图", type: "image", visible: true, locked: false },
  ]},
  { id: "l2", name: "文字层", type: "group", visible: true, locked: false, children: [
    { id: "l2a", name: "标题文字", type: "text", visible: true, locked: false },
    { id: "l2b", name: "副标题", type: "text", visible: true, locked: false },
  ]},
  { id: "l3", name: "装饰形状", type: "shape", visible: true, locked: false },
];

export const NAV_ITEMS = [
  { id: "home", label: "首页", icon: "Home" },
  { id: "projects", label: "工作台", icon: "FolderOpen", badge: 5 },
  { id: "assets", label: "素材库", icon: "Image" },
  { id: "brand", label: "品牌套件", icon: "Palette" },
  { id: "templates", label: "模板", icon: "LayoutTemplate" },
  { id: "history", label: "生成历史", icon: "History" },
];

export const BOTTOM_NAV_ITEMS = [
  { id: "settings", label: "设置", icon: "Settings" },
  { id: "help", label: "帮助", icon: "HelpCircle" },
  { id: "upgrade", label: "升级计划", icon: "Zap" },
];
