// Neo-Studio Dark Workspace — Data & Types
import {
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
  SUPPORTED_IMAGE_MODEL_IDS,
  sortImageModelIdsByPriority,
} from "../../../shared/image-models";
import { DEFAULT_TEXT_MODEL } from "../../../shared/text-models";

// ── AI Models ────────────────────────────────────────────────
export type AiModelOption = {
  id: string;
  label: string;
  color: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  unavailableReason?: string;
};

export const AUTO_AI_MODEL: AiModelOption = {
  id: "auto",
  label: "auto",
  color: "oklch(0.78 0.18 120)",
  description: "根据提示词自动选择对话或生图模型",
};

export const DEFAULT_IMAGE_AI_MODEL_ID = DEFAULT_IMAGE_MODEL_ID;

/**
 * 选择器里的图片模型清单。**全部走腾讯云 VOD AIGC 直连**
 * （server/tencent-vod-aigc.ts）。
 *
 * 2026-09-12 中转站图片模型（og-image2-* / gemini-3.5-flash-preview /
 * jimeng-4.0 / mj-v7 / mj-v8.1 / keling）已整体下线并从此表移除。
 * 中转站本身仍在服务文本/大语言模型，只是不再提供图片生成。
 *
 * 老用户本地草稿或白名单里残留的旧 id，由 shared/image-models.ts 的
 * RETIRED_RELAY_IMAGE_MODEL_IDS 自动迁移到等价 VOD 模型，不会变成无效选项。
 */
export const IMAGE_AI_MODELS: AiModelOption[] = [
  // 注意 icon 必须显式给出品牌名：getModelBrandIconKind 的正则匹配的是
  // `${icon} ${modelId}`，而 "vod-gem" / "vod-si" / "vod-qwen" 这些 id
  // 本身不含任何品牌关键字，不写 icon 就会落到 "none" 变成无图标。
  // OG image2.5 两系列（2026-09-11 接入，sunburst medium 为全站默认）。
  // 两系价格完全相同，画风不同，都放出来供用户手动切换。
  { id: "vod-og25-sunburst-medium", label: "image2.5 medium", color: "oklch(0.72 0.18 200)", description: "高性价比默认推荐", icon: "openai" },
  { id: "vod-og25-flare-medium", label: "image2.5 medium flare", color: "oklch(0.74 0.16 285)", description: "高性价比另一画风", icon: "openai" },
  { id: "vod-og25-sunburst-low", label: "image2.5 low", color: "oklch(0.70 0.16 150)", description: "极致低成本草稿", icon: "openai" },
  { id: "vod-og25-flare-low", label: "image2.5 low flare", color: "oklch(0.70 0.16 150)", description: "极致低成本另一画风", icon: "openai" },
  { id: "vod-og25-sunburst-high", label: "image2.5 high", color: "oklch(0.82 0.18 95)", description: "极致高清细节", icon: "openai" },
  { id: "vod-og25-flare-high", label: "image2.5 high flare", color: "oklch(0.82 0.18 95)", description: "极致高清另一画风", icon: "openai" },
  // label 是纯展示文案，与 id / 后端真实接口解耦
  // （路由看 id，发给腾讯的版本串由 tencent-vod-aigc.ts 决定）。
  // 2026-09-12 按要求调整对外命名：去掉 og 前缀、gem 前缀改 banana，后缀不变。
  // 这张表必须与 server/image-generation.ts 的 imageModelLabels 保持一致，
  // 否则 /api/ai/models 下发的目录文案会覆盖前端，UI 上出现两套名字。
  { id: "vod-gem", label: "banana 3.1", color: "oklch(0.72 0.18 200)", description: "高品质综合表现", icon: "gemini" },
  { id: "vod-gem-lite", label: "banana 3.1 lite", color: "oklch(0.76 0.16 130)", description: "高性价比出图快", icon: "gemini" },
  { id: "vod-og", label: "image2", color: "oklch(0.74 0.16 285)", description: "高品质场景稳定", icon: "openai" },
  { id: "vod-mj", label: "mj v8.2", color: "oklch(0.78 0.15 40)", description: "极致艺术表现", icon: "midjourney" },
  { id: "vod-kling", label: "kling 3.0", color: "oklch(0.76 0.16 130)", description: "高品质国风电商", icon: "kling" },
  { id: "vod-si", label: "si 5.0 pro", color: "oklch(0.82 0.18 95)", description: "极致写实质感", icon: "image" },
  { id: "vod-qwen", label: "qwen 0925", color: "oklch(0.70 0.16 150)", description: "高性价比中文强", icon: "qwen" },
  { id: "vod-jimeng", label: "jimeng 4.0", color: "oklch(0.82 0.18 95)", description: "高性价比中文强", icon: "jimeng" },
];

// 文本 / 多模态理解模型清单（用户下拉框唯一可见项）。
// 2026-09-10 起全站文本能力统一走中转站的 claude-opus-5，
// id 必须与 shared/text-models.ts 的 DEFAULT_TEXT_MODEL 一致，
// 否则前端传参会被服务端白名单静默丢弃。
// 注意：上面的 IMAGE_AI_MODELS 属于图片**生成**模型，一个都不能动。
export const TEXT_AI_MODELS: AiModelOption[] = [
  { id: DEFAULT_TEXT_MODEL, label: "Claude Opus 5", color: "oklch(0.74 0.14 45)", icon: "anthropic" },
];

/**
 * 选择器里的展示顺序必须 = IMAGE_MODEL_PRIORITY_IDS 的优先级顺序。
 *
 * 此前这里是 `[AUTO, ...IMAGE_AI_MODELS]` 直拼，等于把「源数组的书写顺序」
 * 当成了展示顺序，与真正的 auto fallback 优先级是两套独立的顺序。
 * 2026-09-11 把默认模型切到 image2.5 后立刻暴露问题：
 * 优先级链首已经是 vod-og25-sunburst-medium，
 * 而用户在下拉框里第一眼看到的仍然是旧的 og-image2-medium ——
 * 「默认模型」与「默认选项」对不上。
 *
 * 统一走 sortImageModelIdsByPriority 之后，这两套顺序只剩一个真相来源。
 */
export const IMAGE_AI_MODEL_OPTIONS: AiModelOption[] = (() => {
  const optionById = new Map(IMAGE_AI_MODELS.map(option => [option.id, option]));
  const ordered = sortImageModelIdsByPriority(IMAGE_AI_MODELS.map(option => option.id))
    .map(id => optionById.get(id))
    .filter((option): option is AiModelOption => Boolean(option));
  // 兜底：万一某个选项不在优先级表里，也不能凭空从 UI 消失。
  const missing = IMAGE_AI_MODELS.filter(option => !ordered.some(item => item.id === option.id));
  return [AUTO_AI_MODEL, ...ordered, ...missing];
})();
export const TEXT_AI_MODEL_OPTIONS: AiModelOption[] = [AUTO_AI_MODEL, ...TEXT_AI_MODELS];
export const ALL_AI_MODEL_OPTIONS: AiModelOption[] = [
  AUTO_AI_MODEL,
  ...IMAGE_AI_MODELS,
  ...TEXT_AI_MODELS,
];

function isImageModelOption(option: AiModelOption) {
  const id = option.id.toLowerCase();
  return SUPPORTED_IMAGE_MODEL_IDS.has(id);
}

/**
 * 腾讯云 VOD AIGC 模型 —— 必须无条件保留在选择器里。
 *
 * 服务端 /api/ai/models 的目录是「中转站 /models 返回 ∩ 本地注册表」，
 * 而这些模型压根不在中转站上（它们走 server/tencent-vod-aigc.ts 的独立签名链路），
 * 因此永远不会出现在 discoveredModels 里。
 *
 * 若不做这层兜底，下面「有目录就用目录」的逻辑会把它们整体丢弃，
 * 结果就是 IMAGE_AI_MODELS 里明明加了，UI 上却一个都看不到。
 */
const VOD_ONLY_MODELS = IMAGE_AI_MODELS.filter(model => model.id.startsWith("vod-"));

export function mergeImageAiModelOptions(discoveredModels: AiModelOption[] = []) {
  const merged = new Map<string, AiModelOption>();
  const validDiscoveredModels = discoveredModels.filter(isImageModelOption);
  const sourceModels = validDiscoveredModels.length > 0
    ? [
        ...validDiscoveredModels,
        // 目录里已有的条目优先，避免覆盖服务端下发的 label/description。
        ...VOD_ONLY_MODELS.filter(
          model => !validDiscoveredModels.some(item => item.id === model.id)
        ),
      ]
    : IMAGE_AI_MODELS;
  const optionById = new Map(sourceModels.map(option => [option.id, option]));
  const orderedModelIds = sortImageModelIdsByPriority(sourceModels.map(option => option.id));
  for (const id of orderedModelIds.length > 0 ? orderedModelIds : IMAGE_MODEL_PRIORITY_IDS) {
    const option = optionById.get(id) || IMAGE_AI_MODELS.find(model => model.id === id);
    if (!option) continue;
    if (!option.id || option.id === AUTO_AI_MODEL.id || !isImageModelOption(option)) continue;
    merged.set(option.id, {
      ...option,
      label: option.label || option.id,
    });
  }
  return [AUTO_AI_MODEL, ...Array.from(merged.values())];
}

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

export const NAV_ITEMS: Array<{ id: string; label: string; icon: string; badge?: string | number }> = [
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
