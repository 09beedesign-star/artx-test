import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Brush,
  Camera,
  Clapperboard,
  FileImage,
  Frame,
  Globe2,
  Images,
  MonitorSmartphone,
  Network,
  Newspaper,
  PenTool,
  PieChart,
  Presentation,
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
  | "visual_audit"
  | "graphic_design"
  | "infographic"
  | "ui_design"
  | "office_visual"
  | "diagram";

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
  graphic_design: {
    label: "平面设计 / 视觉表达",
    description: "艺术海报、社媒图文、知识漫画和概念视觉表达。",
    accent: "oklch(0.69 0.19 275)",
  },
  infographic: {
    label: "信息图 / 数据可视化",
    description: "数据信息图、流程说明图、对比图表和统计图视觉。",
    accent: "oklch(0.66 0.17 235)",
  },
  ui_design: {
    label: "UI 界面视觉",
    description: "界面视觉稿、组件质感、设计系统样张和交互状态。",
    accent: "oklch(0.71 0.16 168)",
  },
  office_visual: {
    label: "办公配图",
    description: "文章配图、封面图、演示幻灯片和数据汇报视觉。",
    accent: "oklch(0.73 0.15 40)",
  },
  diagram: {
    label: "流程图 / 图示",
    description: "流程图、架构图、思维导图、泳道图和示意图。",
    accent: "oklch(0.68 0.16 200)",
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
  {
    id: "art-poster-design",
    name: "艺术海报设计",
    category: "graphic_design",
    subcategory: "海报 / 概念视觉",
    summary: "围绕单一概念生成艺术化海报：一个想法、一种构图装置、严格的三层字级和刻意的留白。",
    capability: "text_to_image",
    capabilityPrompt: "作为艺术海报设计 skill，请只表达一个核心想法，选定一种构图装置（主图配字、字即图、破格网格或居中留白），层级不超过三层，保留大面积留白，主标题要能在远距离读出。",
    sourceRepo: "fooocus + penpot + diffusers",
    sourceUrl: "https://github.com/lllyasviel/Fooocus",
    sourceScore: 118221,
    signal: "Stars",
    status: "已同步",
    icon: Brush,
    tags: ["Poster", "Typography", "Concept"],
    canvasSizes: ["1080x1440", "1080x1920", "1600x1200"],
  },
  {
    id: "knowledge-comic",
    name: "知识漫画",
    category: "graphic_design",
    subcategory: "漫画 / 概念解释",
    summary: "把一个概念画成 4 到 8 格短漫画：开场用场景提问题，中段展示机制，结尾给出结论或行动。",
    capability: "text_to_image",
    capabilityPrompt: "作为知识漫画 skill，请生成 4 到 8 格连续漫画：第一格用场景呈现问题，中间展示机制而不是靠旁白，最后一格给出结论；角色、配色、线宽必须跨格一致。",
    sourceRepo: "p5.js + excalidraw + tldraw",
    sourceUrl: "https://github.com/excalidraw/excalidraw",
    sourceScore: 102000,
    signal: "Stars",
    status: "内测",
    icon: PenTool,
    tags: ["Comic", "Storyboard", "Explain"],
    canvasSizes: ["1200x1600", "1080x1080", "1600x900"],
  },
  {
    id: "xhs-carousel-images",
    name: "小红书轮播图",
    category: "graphic_design",
    subcategory: "社媒图文 / 轮播",
    summary: "把一条内容拆成封面加内页的完整轮播：统一版式系统、缩略图可读的封面、单页单观点和收尾页。",
    capability: "text_to_image",
    capabilityPrompt: "作为小红书轮播图 skill，请生成封面加 4 到 8 张内页：封面标题要在缩略图尺寸下可读，每页只讲一个观点，页边距/标题位/页脚位跨页完全一致，整套只用一个强调色。",
    sourceRepo: "penpot + tailwindcss + reveal.js",
    sourceUrl: "https://github.com/penpot/penpot",
    sourceScore: 145748,
    signal: "Stars",
    status: "已同步",
    icon: Images,
    tags: ["Xiaohongshu", "Carousel", "Social"],
    canvasSizes: ["1080x1440", "1242x1660", "1080x1080"],
  },
  {
    id: "infographic-designer",
    name: "信息图设计",
    category: "infographic",
    subcategory: "信息图 / 数据说明",
    summary: "把数据、流程或概念转成单张可读信息图：版式由数据形态决定，层级清楚，数字带单位和时间范围。",
    capability: "text_to_image",
    capabilityPrompt: "作为信息图设计 skill，请根据数据形态选定版式（竖向流程、对比分栏、时间轴、循环、金字塔、矩阵网格或数字主视觉），建立单一阅读顺序和清晰层级，每个数字都要带单位与时间范围。",
    sourceRepo: "observable plot + vega-lite + d3",
    sourceUrl: "https://github.com/vega/vega-lite",
    sourceScore: 76000,
    signal: "Stars",
    status: "已同步",
    icon: PieChart,
    tags: ["Infographic", "Data", "Layout"],
    canvasSizes: ["1080x1920", "1600x1200", "1080x1080"],
  },
  {
    id: "ui-visual-mockup",
    name: "界面视觉稿",
    category: "ui_design",
    subcategory: "UI 视觉 / 组件质感",
    summary: "生成去掉 AI 味的界面视觉稿：真实内容密度、统一设计系统、明确主操作和对齐到网格的排版。",
    capability: "text_to_image",
    capabilityPrompt: "作为界面视觉稿 skill，请生成生产级界面视觉：拒绝紫蓝渐变、全局玻璃拟态和 emoji 图标，使用真实内容密度与完整文案，主操作唯一，严格对齐到单一网格。",
    sourceRepo: "shadcn/ui + tailwindcss + storybook",
    sourceUrl: "https://github.com/shadcn-ui/ui",
    sourceScore: 238597,
    signal: "Stars",
    status: "已同步",
    icon: MonitorSmartphone,
    tags: ["UI", "Mockup", "Design system"],
    canvasSizes: ["1440x1024", "390x844", "1920x1080"],
  },
  {
    id: "article-illustrator",
    name: "文章配图",
    category: "office_visual",
    subcategory: "文章配图 / 插图",
    summary: "为具体文章生成配图：只画最难用文字说清的那一处，视觉语言全篇统一，语气匹配文章调性。",
    capability: "text_to_image",
    capabilityPrompt: "作为文章配图 skill，请先找准文章中最难用文字说清的那个点再画，视觉说明论点而不是标题名词，全篇保持同一媒介与配色逻辑，除信息性标签外不加字。",
    sourceRepo: "excalidraw + p5.js + diffusers",
    sourceUrl: "https://github.com/p5js/p5.js",
    sourceScore: 62000,
    signal: "Stars",
    status: "已同步",
    icon: Newspaper,
    tags: ["Illustration", "Editorial", "Article"],
    canvasSizes: ["1600x900", "1200x800", "1080x1080"],
  },
  {
    id: "cover-image-lab",
    name: "封面图设计",
    category: "office_visual",
    subcategory: "封面图 / 缩略图",
    summary: "生成全尺寸与缩略图双可读的封面：单一焦点、缩略图可读标题、预留标题安全区、情绪匹配内容。",
    capability: "text_to_image",
    capabilityPrompt: "作为封面图设计 skill，请先按缩略图尺寸定标题字级与元素数量，只保留一个焦点，为叠加标题预留干净区域，并自查清晰度/层级/缩略图可读性/情绪/品牌一致性五项。",
    sourceRepo: "fooocus + penpot + comfyui",
    sourceUrl: "https://github.com/Comfy-Org/ComfyUI",
    sourceScore: 185461,
    signal: "Stars",
    status: "已同步",
    icon: Frame,
    tags: ["Cover", "Thumbnail", "Title zone"],
    canvasSizes: ["1600x900", "1080x1080", "1280x720"],
  },
  {
    id: "slide-deck-visual",
    name: "演示幻灯片配图",
    category: "office_visual",
    subcategory: "演示 / 汇报配图",
    summary: "生成成套幻灯片视觉：固定版心与标题位，一页一个观点，标题写成结论，数据页只放一张图加一句洞察。",
    capability: "text_to_image",
    capabilityPrompt: "作为演示幻灯片配图 skill，请先给出页级规划（页码/版式/一句话内容），固定画布与标题位，一页只讲一个观点，标题写成结论而非标签，数据页只有一张图加一句洞察。",
    sourceRepo: "reveal.js + libreoffice + observable plot",
    sourceUrl: "https://github.com/hakimel/reveal.js",
    sourceScore: 68000,
    signal: "Stars",
    status: "已同步",
    icon: Presentation,
    tags: ["Slide", "Deck", "Presentation"],
    canvasSizes: ["1920x1080", "1280x720", "1080x1440"],
  },
  {
    id: "diagram-flowchart",
    name: "流程图架构图",
    category: "diagram",
    subcategory: "流程图 / 架构图 / 思维导图",
    summary: "把流程、架构或概念渲染成单张清晰图示：形状承载语义、连线正交少交叉、按层或角色用色、网格对齐。",
    capability: "text_to_image",
    capabilityPrompt: "作为流程图架构图 skill，请按内容选定图示类型（流程/架构/思维导图/泳道），保证唯一入口与出口，形状语义一致，连线正交且尽量少交叉，决策分支必须带条件标签。",
    sourceRepo: "mermaid + excalidraw + tldraw",
    sourceUrl: "https://github.com/mermaid-js/mermaid",
    sourceScore: 78000,
    signal: "Stars",
    status: "已同步",
    icon: Network,
    tags: ["Flowchart", "Architecture", "Mind map"],
    canvasSizes: ["1920x1080", "1600x900", "1080x1440"],
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
