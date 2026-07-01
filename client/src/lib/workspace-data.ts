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

// ── Runtime shared constants ──────────────────────────────────
// Production workspaces must be created from user actions or recovered history.
// Keep these arrays empty so stale handwritten demo canvases/assets never appear.

export const PROJECTS: Project[] = [];

export const BG_GLOW = "https://d2xsxph8kpxj0f.cloudfront.net/310419663029167149/8AvWe7ZtcQhNUZsh6cyAoU/workspace-bg-glow-VcrGoRhdfcRLpcj7oX2BTa.webp";

export const GENERATED_ASSETS: GeneratedAsset[] = [];

export const INITIAL_MESSAGES: ChatMessage[] = [];

export const LAYERS: Layer[] = [];

export const NAV_ITEMS = [
  { id: "home", label: "首页", icon: "Home" },
  { id: "projects", label: "工作台", icon: "FolderOpen" },
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
