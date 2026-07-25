import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Brush,
  Camera,
  Clapperboard,
  FileImage,
  Globe2,
  LayoutTemplate,
  MonitorSmartphone,
  PenTool,
  SwatchBook,
} from "lucide-react";

export type SkillStoreCategory =
  | "brand_system"
  | "logo_identity"
  | "landing_page"
  | "commerce_poster"
  | "product_visual"
  | "video_storyboard"
  | "image_editing"
  | "visual_audit";

export type SkillStoreItem = {
  id: string;
  name: string;
  category: SkillStoreCategory;
  subcategory: string;
  summary: string;
  capability: "text_to_image" | "image_edit";
  capabilityPrompt: string;
  sourceRepo: string;
  sourceUrl: string;
  sourceScore: number;
  signal: "Stars" | "Release downloads" | "Template adoption";
  status: "已同步" | "待适配" | "内测";
  icon: LucideIcon;
  tags: string[];
  canvasSizes?: string[];
};

export const skillCategoryMeta: Record<SkillStoreCategory, {
  label: string;
  description: string;
  accent: string;
}> = {
  brand_system: {
    label: "品牌系统",
    description: "品牌色、字体气质、设计 token、组件规范和应用样张。",
    accent: "oklch(0.68 0.18 210)",
  },
  logo_identity: {
    label: "Logo 识别",
    description: "Logo、字标、徽章、品牌符号和识别方向探索。",
    accent: "oklch(0.70 0.19 300)",
  },
  landing_page: {
    label: "产品页 / 落地页",
    description: "首页首屏、产品页、营销页和响应式网页视觉。",
    accent: "oklch(0.70 0.16 155)",
  },
  commerce_poster: {
    label: "电商海报 / 社媒",
    description: "活动海报、商品主图、社媒封面和营销 Banner。",
    accent: "oklch(0.73 0.18 55)",
  },
  product_visual: {
    label: "产品视觉",
    description: "商品摄影、商业渲染、白底图、场景图和卖点视觉。",
    accent: "oklch(0.66 0.17 25)",
  },
  video_storyboard: {
    label: "视频活动 / 分镜",
    description: "短视频脚本、镜头节奏、分镜卡和活动视频封面。",
    accent: "oklch(0.67 0.19 330)",
  },
  image_editing: {
    label: "局部编辑 / 改图",
    description: "去背景、擦除、扩图、换风格、修复和局部重绘。",
    accent: "oklch(0.72 0.16 185)",
  },
  visual_audit: {
    label: "视觉分析 / 质检",
    description: "参考图分析、竞品拆解、提示词审阅和设计质量检查。",
    accent: "oklch(0.74 0.16 82)",
  },
};

export const skillStoreItems: SkillStoreItem[] = [
  {
    id: "brand-system-kit",
    name: "品牌系统生成",
    category: "brand_system",
    subcategory: "品牌套件 / Design tokens",
    summary: "把品牌描述、产品定位或参考风格转成完整品牌系统板，包含色板、字体气质、图形语言和应用样张。",
    capability: "text_to_image",
    capabilityPrompt: "作为品牌系统生成 skill，请输出专业品牌 kit 视觉板：包含品牌定位、主色/辅助色/中性色、字体气质、Logo 使用区、图形元素、组件气质和至少三种应用示例。",
    sourceRepo: "penpot + style-dictionary + storybook",
    sourceUrl: "https://github.com/penpot/penpot",
    sourceScore: 145748,
    signal: "Stars",
    status: "已同步",
    icon: SwatchBook,
    tags: ["Brand kit", "Design tokens", "Identity"],
  },
  {
    id: "logo-identity-lab",
    name: "Logo 品牌识别",
    category: "logo_identity",
    subcategory: "Logo / 字标 / 品牌符号",
    summary: "围绕品牌关键词生成多方向 Logo 探索板，覆盖符号、字标、徽章、黑白可用性和推荐方向。",
    capability: "text_to_image",
    capabilityPrompt: "作为 Logo 品牌识别 skill，请生成 4 到 6 个可比较的标志方向：简洁、可缩放、黑白可用、避免商标抄袭，并说明每个方向的形态逻辑。",
    sourceRepo: "fooocus + diffusers + controlnet",
    sourceUrl: "https://github.com/lllyasviel/Fooocus",
    sourceScore: 118221,
    signal: "Stars",
    status: "已同步",
    icon: PenTool,
    tags: ["Logo", "Wordmark", "Symbol"],
  },
  {
    id: "landing-page-visual",
    name: "产品页落地页视觉",
    category: "landing_page",
    subcategory: "网页视觉 / 产品页",
    summary: "把产品、服务或活动需求生成真实可落地的网页首屏、产品页或多区块落地页视觉稿。",
    capability: "text_to_image",
    capabilityPrompt: "作为产品页落地页视觉 skill，请生成真实 UI 视觉：突出产品/服务首屏信号、模块层级、CTA、响应式布局、真实组件质感和可读文本区域。",
    sourceRepo: "grapesjs + shadcn/ui + tailwindcss",
    sourceUrl: "https://github.com/GrapesJS/grapesjs",
    sourceScore: 238597,
    signal: "Stars",
    status: "已同步",
    icon: MonitorSmartphone,
    tags: ["Landing page", "Web visual", "Responsive"],
    canvasSizes: ["1440x1024", "390x844", "1920x1080"],
  },
  {
    id: "commerce-poster-social",
    name: "电商海报社媒视觉",
    category: "commerce_poster",
    subcategory: "海报 / 社媒 / 营销图",
    summary: "根据产品、活动、优惠和渠道生成高冲击海报、商品主图、社媒封面和投放素材。",
    capability: "text_to_image",
    capabilityPrompt: "作为电商海报社媒视觉 skill，请生成商业可用主视觉：主体突出、标题区清晰、CTA 和品牌位明确，并适配方图/竖图/横幅裁切。",
    sourceRepo: "automatic1111 + comfyui + diffusers",
    sourceUrl: "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
    sourceScore: 315310,
    signal: "Stars",
    status: "已同步",
    icon: FileImage,
    tags: ["Poster", "Campaign", "Social"],
    canvasSizes: ["1080x1080", "1080x1920", "1200x628"],
  },
  {
    id: "cross-border-commerce-agent",
    name: "跨境电商视觉 Agent",
    category: "commerce_poster",
    subcategory: "跨境平台 / 市场包 / 风险检查",
    summary: "按国家地区、平台、广告位、品类和模板组合商品图生成上下文，并在生成前检查文化、宗教、政治与 IP 风险。",
    capability: "text_to_image",
    capabilityPrompt: "作为跨境电商视觉 Agent，请先锁定市场、平台、广告位尺寸、安全区、品类模板和风险规则；图片只保留标题/卖点/价格/CTA 可编辑区域，不把价格、折扣、功效、认证或法律声明直接烘焙进画面。",
    sourceRepo: "ArtX market package registry + seller-center docs",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G1881",
    sourceScore: 20260712,
    signal: "Template adoption",
    status: "内测",
    icon: Globe2,
    tags: ["Cross-border", "Marketplace", "Risk", "Template"],
    canvasSizes: ["2000x2000", "1080x1920", "1200x628"],
  },
  {
    id: "product-photography",
    name: "产品视觉商品摄影",
    category: "product_visual",
    subcategory: "商品摄影 / 产品渲染",
    summary: "生成商品摄影、商业渲染、白底主图、生活方式场景和卖点视觉，让产品清晰可检查。",
    capability: "text_to_image",
    capabilityPrompt: "作为产品视觉商品摄影 skill，请生成清晰商品主视觉：保持产品身份、材质、比例和卖点，匹配摄影灯光、表面、阴影、背景和商业质感。",
    sourceRepo: "comfyui + controlnet + diffusers",
    sourceUrl: "https://github.com/Comfy-Org/ComfyUI",
    sourceScore: 185461,
    signal: "Stars",
    status: "已同步",
    icon: Camera,
    tags: ["Product", "Photography", "Packshot"],
    canvasSizes: ["1000x1000", "1200x1600", "1920x1080"],
  },
  {
    id: "video-storyboard",
    name: "视频活动分镜",
    category: "video_storyboard",
    subcategory: "短视频 / 分镜 / 封面",
    summary: "把活动、广告或产品卖点转成连续分镜卡，包含镜头节奏、字幕位置、场景推进和封面方向。",
    capability: "text_to_image",
    capabilityPrompt: "作为视频活动分镜 skill，请生成 4 到 8 张连续分镜卡：开场钩子、主体展示、利益点、证明镜头和结尾 CTA，并标注镜头运动与字幕区。",
    sourceRepo: "remotion + diffusers + comfyui workflows",
    sourceUrl: "https://github.com/remotion-dev/remotion",
    sourceScore: 202147,
    signal: "Stars",
    status: "已同步",
    icon: Clapperboard,
    tags: ["Storyboard", "Video", "Keyframes"],
    canvasSizes: ["1080x1920", "1920x1080", "1280x720"],
  },
  {
    id: "image-local-edit",
    name: "局部编辑改图",
    category: "image_editing",
    subcategory: "去背景 / 擦除 / 扩图 / 换风格",
    summary: "对已有图片执行去背景、擦除、局部重绘、扩图、风格迁移和质量修复，并尽量保持未编辑区域不变。",
    capability: "image_edit",
    capabilityPrompt: "作为局部编辑改图 skill，请只修改用户指定区域或意图：保留主体身份、比例、未编辑像素、产品几何和文字位置，补全自然光影、纹理和透视。",
    sourceRepo: "rembg + iopaint + controlnet",
    sourceUrl: "https://github.com/danielgatis/rembg",
    sourceScore: 80589,
    signal: "Stars",
    status: "已同步",
    icon: Brush,
    tags: ["Inpaint", "Outpaint", "Background"],
  },
  {
    id: "visual-reference-audit",
    name: "视觉参考分析质检",
    category: "visual_audit",
    subcategory: "参考分析 / 竞品拆解 / 质量检查",
    summary: "分析参考图、竞品视觉和用户提示词，提炼可迁移的风格原则，并生成更完整、更干净的视觉方向。",
    capability: "text_to_image",
    capabilityPrompt: "作为视觉参考分析质检 skill，请先把用户输入或参考方向转成明确视觉诊断，再生成优化后的画面：提高层级、对齐、对比、可读性、安全区和风格一致性。",
    sourceRepo: "clip + llava + playwright",
    sourceUrl: "https://github.com/openai/CLIP",
    sourceScore: 149956,
    signal: "Stars",
    status: "已同步",
    icon: BadgeCheck,
    tags: ["Visual audit", "Reference", "Quality"],
  },
];

export const skillStoreStats = {
  total: skillStoreItems.length,
  synced: skillStoreItems.filter((skill) => skill.status === "已同步").length,
  source: "Open-source MD documentation snapshot",
};

export type PendingSkillLoad = {
  id: string;
  name: string;
  category: SkillStoreCategory;
  categoryLabel: string;
  subcategory: string;
  summary: string;
  capability: SkillStoreItem["capability"];
  capabilityPrompt: string;
  sourceRepo: string;
  sourceUrl: string;
  tags: string[];
  canvasSizes?: string[];
  loadedAt: string;
};

export const PENDING_SKILL_LOAD_KEY = "artx:pending-skill-load";

export function createPendingSkillLoad(skill: SkillStoreItem): PendingSkillLoad {
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    categoryLabel: skillCategoryMeta[skill.category].label,
    subcategory: skill.subcategory,
    summary: skill.summary,
    capability: skill.capability,
    capabilityPrompt: skill.capabilityPrompt,
    sourceRepo: skill.sourceRepo,
    sourceUrl: skill.sourceUrl,
    tags: skill.tags,
    canvasSizes: skill.canvasSizes,
    loadedAt: new Date().toISOString(),
  };
}

export function buildSkillPromptContext(skill: PendingSkillLoad) {
  return [
    `当前已加载 Skill：${skill.name}`,
    `分类：${skill.categoryLabel} / ${skill.subcategory}`,
    `生成能力：${skill.capability === "image_edit" ? "图片编辑，需要用户提供参考图或画布图片" : "文生图，可直接根据提示词生成画面"}`,
    `能力说明：${skill.summary}`,
    `执行规则：${skill.capabilityPrompt}`,
    skill.canvasSizes?.length ? `优先适配尺寸：${skill.canvasSizes.join("、")}` : "",
    skill.tags.length ? `关键词：${skill.tags.join("、")}` : "",
  ].filter(Boolean).join("\n");
}
