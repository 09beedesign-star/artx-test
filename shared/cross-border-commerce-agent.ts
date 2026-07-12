export type CrossBorderMarketId =
  | "us"
  | "br"
  | "mx"
  | "id"
  | "th"
  | "vn"
  | "sg"
  | "ph"
  | "jp"
  | "ae"
  | "sa"
  | "qa"
  | "kw"
  | "cn";

export type CrossBorderPlatformId =
  | "amazon"
  | "shopee"
  | "tiktok_shop"
  | "lazada"
  | "douyin"
  | "xiaohongshu"
  | "taobao_tmall"
  | "jd";

export type CrossBorderPlacementId =
  | "product_main"
  | "feature_benefit"
  | "lifestyle_scene"
  | "campaign_banner"
  | "short_video_cover"
  | "detail_module";

export type CrossBorderTemplateId =
  | "white_main"
  | "feature_callout"
  | "ugc_review"
  | "lifestyle_seed"
  | "promotion_event"
  | "tech_parameter"
  | "checklist_compare";

export type CrossBorderCategoryId =
  | "beauty_personal_care"
  | "fashion_accessories"
  | "home_living"
  | "consumer_electronics"
  | "food_beverage"
  | "baby_pet";

export type CrossBorderRiskAction = "pass" | "advise" | "rewrite" | "block";
export type CrossBorderPlatformStatus = "active" | "ops_review";

export type CrossBorderSource = {
  title: string;
  url: string;
  verifiedAt: string;
};

export type CrossBorderSizeSpec = {
  width: number;
  height: number;
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
    unit: "percent";
  };
  source: CrossBorderSource;
};

export type CrossBorderPlacement = {
  id: CrossBorderPlacementId;
  label: string;
  format: "square" | "portrait" | "landscape" | "story";
  size: CrossBorderSizeSpec;
  textPolicy: string;
};

export type CrossBorderPlatform = {
  id: CrossBorderPlatformId;
  label: string;
  status: CrossBorderPlatformStatus;
  placements: CrossBorderPlacement[];
};

export type CrossBorderMarket = {
  id: CrossBorderMarketId;
  label: string;
  region:
    | "north_america"
    | "latin_america"
    | "southeast_asia"
    | "east_asia"
    | "gulf"
    | "china";
  languages: string[];
  currency: string;
  culturalNotes: string[];
  platforms: CrossBorderPlatform[];
};

export type CrossBorderTemplate = {
  id: CrossBorderTemplateId;
  label: string;
  summary: string;
  preferredSkillId: "commerce-poster-social" | "product-photography";
  platformIds: CrossBorderPlatformId[];
  allowedPlacements: CrossBorderPlacementId[];
  promptRules: string[];
  categoryLens: Record<CrossBorderCategoryId, string>;
  disabledElements: string[];
  trendEvidence: {
    label: "官方规格" | "公开趋势" | "运营复核";
    validUntil: string;
  };
};

export type CrossBorderRiskHit = {
  id: string;
  action: Exclude<CrossBorderRiskAction, "pass">;
  label: string;
  reason: string;
  matched: string;
  safeAlternative: string;
};

export type CrossBorderRiskResult = {
  action: CrossBorderRiskAction;
  hits: CrossBorderRiskHit[];
  canGenerate: boolean;
  disclaimer: string;
};

export type CrossBorderComposeInput = {
  marketId: CrossBorderMarketId;
  platformId: CrossBorderPlatformId;
  placementId: CrossBorderPlacementId;
  categoryId: CrossBorderCategoryId;
  templateId: CrossBorderTemplateId;
  productName?: string;
  productFacts?: string;
  userPrompt?: string;
  finalUserText?: string;
};

export type CrossBorderGenerationContext = {
  market: Pick<CrossBorderMarket, "id" | "label" | "languages" | "currency" | "region">;
  platform: Pick<CrossBorderPlatform, "id" | "label">;
  placement: CrossBorderPlacement;
  category: CrossBorderCategoryId;
  template: CrossBorderTemplate;
  skillId: CrossBorderTemplate["preferredSkillId"];
  prompt: string;
  editableCopySuggestions: string[];
  exportSizes: Array<{
    label: string;
    width: number;
    height: number;
    platform: string;
  }>;
  marketPackageVersion: string;
  risk: CrossBorderRiskResult;
};

export const CROSS_BORDER_COMMERCE_VERSION = "2026.07.12";

const sources = {
  amazon: {
    title: "Amazon Seller Central image requirements",
    url: "https://sellercentral.amazon.com/help/hub/reference/G1881",
    verifiedAt: "2026-07-12",
  },
  shopee: {
    title: "Shopee Seller Centre image guidance",
    url: "https://seller.shopee.com/",
    verifiedAt: "2026-07-12",
  },
  tiktok: {
    title: "TikTok Shop and Ads specifications",
    url: "https://ads.tiktok.com/help/",
    verifiedAt: "2026-07-12",
  },
  lazada: {
    title: "Lazada Seller Center content guidance",
    url: "https://sellercenter.lazada.com/",
    verifiedAt: "2026-07-12",
  },
  china: {
    title: "China platform seller-center working specifications",
    url: "https://www.artxsd.com/",
    verifiedAt: "2026-07-12",
  },
} satisfies Record<string, CrossBorderSource>;

function placement(
  id: CrossBorderPlacementId,
  label: string,
  format: CrossBorderPlacement["format"],
  width: number,
  height: number,
  source: CrossBorderSource,
  inset: number,
  textPolicy: string
): CrossBorderPlacement {
  return {
    id,
    label,
    format,
    size: {
      width,
      height,
      safeArea: {
        top: inset,
        right: inset,
        bottom: inset,
        left: inset,
        unit: "percent",
      },
      source,
    },
    textPolicy,
  };
}

const platforms = {
  amazon: {
    id: "amazon",
    label: "Amazon",
    status: "active",
    placements: [
      placement("product_main", "商品主图", "square", 2000, 2000, sources.amazon, 6, "纯白背景，商品主体清晰，不放价格、徽章或促销文案。"),
      placement("feature_benefit", "卖点说明图", "square", 2000, 2000, sources.amazon, 10, "卖点、参数与认证只保留可编辑区域。"),
      placement("lifestyle_scene", "生活方式场景图", "landscape", 1920, 1080, sources.amazon, 10, "展示真实使用场景，不暗示未验证功效。"),
    ],
  },
  shopee: {
    id: "shopee",
    label: "Shopee",
    status: "active",
    placements: [
      placement("product_main", "商品主图", "square", 1024, 1024, sources.shopee, 8, "移动端主体占比高，背景干净。"),
      placement("feature_benefit", "卖点说明图", "square", 1024, 1024, sources.shopee, 10, "本地语言和卖点保留可编辑区域。"),
      placement("campaign_banner", "促销活动图", "landscape", 1200, 628, sources.shopee, 12, "价格、折扣、包邮和认证必须保留为卖家确认后的编辑层。"),
    ],
  },
  tiktokShop: {
    id: "tiktok_shop",
    label: "TikTok Shop",
    status: "active",
    placements: [
      placement("product_main", "商品卡图", "square", 1080, 1080, sources.tiktok, 8, "保持商品清晰，适合商品卡复用。"),
      placement("short_video_cover", "短视频封面", "story", 1080, 1920, sources.tiktok, 14, "中心偏上留标题区，避开底部 CTA 和右侧互动栏。"),
      placement("campaign_banner", "信息流活动图", "portrait", 1080, 1350, sources.tiktok, 12, "像短视频第一帧，促销信息保留可编辑层。"),
    ],
  },
  lazada: {
    id: "lazada",
    label: "Lazada",
    status: "active",
    placements: [
      placement("product_main", "商品主图", "square", 1000, 1000, sources.lazada, 8, "品牌旗舰店式干净主图，主体可检查。"),
      placement("lifestyle_scene", "生活方式场景图", "landscape", 1200, 900, sources.lazada, 10, "使用本地场景但避免文化刻板印象。"),
      placement("campaign_banner", "促销活动图", "landscape", 1200, 628, sources.lazada, 12, "促销标题、价格和 CTA 保留编辑区。"),
    ],
  },
  douyin: {
    id: "douyin",
    label: "抖音",
    status: "active",
    placements: [
      placement("product_main", "商品主图", "square", 800, 800, sources.china, 8, "货架主图保持电商清晰度。"),
      placement("short_video_cover", "短视频封面", "story", 1080, 1920, sources.china, 14, "突出使用瞬间，规避界面遮挡区。"),
      placement("campaign_banner", "直播商品图", "portrait", 750, 1000, sources.china, 12, "价格和功效文案保持可编辑。"),
    ],
  },
  xiaohongshu: {
    id: "xiaohongshu",
    label: "小红书",
    status: "active",
    placements: [
      placement("short_video_cover", "种草封面", "portrait", 1080, 1440, sources.china, 10, "真实生活与轻商业表达，标题不压住商品。"),
      placement("lifestyle_scene", "生活方式图", "square", 1080, 1080, sources.china, 10, "保留真实生活质感和商品可见性。"),
      placement("detail_module", "测评清单图", "portrait", 1080, 1440, sources.china, 10, "清单与测评文案保持可编辑，不伪造评价。"),
    ],
  },
  taobaoTmall: {
    id: "taobao_tmall",
    label: "淘宝 / 天猫",
    status: "active",
    placements: [
      placement("product_main", "商品主图", "square", 1200, 1200, sources.china, 8, "商品大、文字少、差异点清楚。"),
      placement("campaign_banner", "活动主图", "portrait", 750, 1000, sources.china, 12, "促销信息分层并保留可编辑区域。"),
      placement("detail_module", "详情页模块图", "portrait", 790, 1200, sources.china, 10, "卖点、参数、信任和售后信息保留编辑层。"),
    ],
  },
  jd: {
    id: "jd",
    label: "京东",
    status: "active",
    placements: [
      placement("product_main", "商品主图", "square", 1200, 1200, sources.china, 8, "强调可信、参数和商品清晰度。"),
      placement("feature_benefit", "参数卖点图", "square", 1200, 1200, sources.china, 10, "参数与服务信息保留编辑区。"),
      placement("detail_module", "详情页模块图", "portrait", 790, 1200, sources.china, 10, "产品细节清晰，避免夸大功效。"),
    ],
  },
} satisfies Record<string, CrossBorderPlatform>;

const market = (
  id: CrossBorderMarketId,
  label: string,
  region: CrossBorderMarket["region"],
  languages: string[],
  currency: string,
  culturalNotes: string[],
  availablePlatforms: CrossBorderPlatform[]
): CrossBorderMarket => ({
  id,
  label,
  region,
  languages,
  currency,
  culturalNotes,
  platforms: availablePlatforms,
});

export const CROSS_BORDER_MARKETS: CrossBorderMarket[] = [
  market("us", "美国", "north_america", ["English"], "USD", ["避免政治人物、虚假评价、未授权品牌和未经证实的功效或价格承诺。"], [platforms.amazon, platforms.tiktokShop]),
  market("br", "巴西", "latin_america", ["Portuguese"], "BRL", ["使用巴西葡语编辑层，避免虚假折扣与官方背书。"], [platforms.shopee, platforms.tiktokShop]),
  market("mx", "墨西哥", "latin_america", ["Spanish"], "MXN", ["使用本地西语编辑层，规避名人肖像、政治符号和误导价格。"], [platforms.shopee, platforms.tiktokShop]),
  market("id", "印尼", "southeast_asia", ["Bahasa Indonesia"], "IDR", ["尊重穆斯林文化；清真暗示需要商品证明并保持可编辑。"], [platforms.shopee, platforms.lazada, platforms.tiktokShop]),
  market("th", "泰国", "southeast_asia", ["Thai"], "THB", ["避免王室、宗教形象误用和文化服饰刻板印象。"], [platforms.shopee, platforms.lazada, platforms.tiktokShop]),
  market("vn", "越南", "southeast_asia", ["Vietnamese"], "VND", ["本地文案简洁，认证、折扣和产地信息保持可编辑。"], [platforms.shopee, platforms.lazada, platforms.tiktokShop]),
  market("sg", "新加坡", "southeast_asia", ["English", "Chinese"], "SGD", ["多文化人物和场景避免族群、宗教与国籍刻板印象。"], [platforms.shopee, platforms.lazada, platforms.amazon, platforms.tiktokShop]),
  market("ph", "菲律宾", "southeast_asia", ["English", "Filipino"], "PHP", ["宗教节庆和健康功效表达需要谨慎。"], [platforms.shopee, platforms.lazada, platforms.tiktokShop]),
  market("jp", "日本", "east_asia", ["Japanese"], "JPY", ["避免名人肖像、动漫 IP 模仿和未经证实的排名第一。"], [platforms.amazon, platforms.tiktokShop]),
  market("ae", "阿联酋（含迪拜）", "gulf", ["Arabic", "English"], "AED", ["规避酒类、猪制品、赌博、暴露人物、宗教符号娱乐化和敏感政治。"], [platforms.amazon]),
  market("sa", "沙特", "gulf", ["Arabic", "English"], "SAR", ["使用保守人物造型与阿拉伯语/英语编辑层。"], [platforms.amazon]),
  market("qa", "卡塔尔", "gulf", ["Arabic", "English"], "QAR", ["市场风险包已注册，平台开放前需要运营复核。"], []),
  market("kw", "科威特", "gulf", ["Arabic", "English"], "KWD", ["市场风险包已注册，平台开放前需要运营复核。"], []),
  market("cn", "中国大陆", "china", ["简体中文"], "CNY", ["规避极限词、虚假功效、医疗减肥母婴宣称、诱导点击和盗用 IP。"], [platforms.douyin, platforms.xiaohongshu, platforms.taobaoTmall, platforms.jd]),
];

export const CROSS_BORDER_CATEGORIES: Array<{
  id: CrossBorderCategoryId;
  label: string;
}> = [
  { id: "beauty_personal_care", label: "美妆个护" },
  { id: "fashion_accessories", label: "服饰配件" },
  { id: "home_living", label: "家居生活" },
  { id: "consumer_electronics", label: "3C 数码" },
  { id: "food_beverage", label: "食品饮品" },
  { id: "baby_pet", label: "母婴宠物" },
];

const categoryLens: Record<CrossBorderCategoryId, string> = {
  beauty_personal_care: "展示质地、日常护理与肤感，避免前后对比和医疗功效夸大。",
  fashion_accessories: "展示版型、材质、搭配和尺码，不使用受保护 Logo 或名人肖像。",
  home_living: "展示空间尺度、材质和使用情境，不虚构承重或安全性能。",
  consumer_electronics: "展示屏幕、接口、材质和使用场景，不复制受保护外观或应用 Logo。",
  food_beverage: "展示包装和食物质感，营养、清真、有机和健康声明保持可编辑。",
  baby_pet: "使用温和安全场景，不虚构医疗、发育或婴幼儿安全承诺。",
};

function template(
  id: CrossBorderTemplateId,
  label: string,
  summary: string,
  preferredSkillId: CrossBorderTemplate["preferredSkillId"],
  platformIds: CrossBorderPlatformId[],
  allowedPlacements: CrossBorderPlacementId[],
  promptRules: string[],
  disabledElements: string[],
  evidenceLabel: CrossBorderTemplate["trendEvidence"]["label"]
): CrossBorderTemplate {
  return {
    id,
    label,
    summary,
    preferredSkillId,
    platformIds,
    allowedPlacements,
    promptRules,
    categoryLens,
    disabledElements,
    trendEvidence: {
      label: evidenceLabel,
      validUntil: evidenceLabel === "运营复核" ? "2026-10-31" : "2026-12-31",
    },
  };
}

export const CROSS_BORDER_TEMPLATES: CrossBorderTemplate[] = [
  template("white_main", "白底高信任主图", "商品主体清晰、干净、适合搜索货架", "product-photography", ["amazon", "shopee", "lazada", "taobao_tmall", "jd"], ["product_main"], ["纯白或浅色背景", "商品占画面 75%-85%", "边缘锐利、轻阴影"], ["价格徽章", "折扣贴纸", "评价星级", "未授权 Logo"], "官方规格"),
  template("feature_callout", "功能卖点信息卡", "产品细节与 1-3 个可编辑事实卖点", "product-photography", ["amazon", "shopee", "lazada", "taobao_tmall", "jd"], ["feature_benefit", "detail_module"], ["保留卖点和图标区域", "产品材质与功能部位清晰"], ["医疗功效", "虚假认证", "保证排名"], "公开趋势"),
  template("ugc_review", "UGC 手持测评风", "像真实用户演示或短视频第一帧", "commerce-poster-social", ["tiktok_shop", "douyin", "xiaohongshu"], ["short_video_cover", "lifestyle_scene"], ["真实手持或使用瞬间", "商品仍可识别", "标题区域简洁"], ["伪造平台 UI", "名人肖像", "虚假用户评价"], "公开趋势"),
  template("lifestyle_seed", "真实生活种草风", "低广告感的生活方式场景与真实光线", "product-photography", ["tiktok_shop", "douyin", "xiaohongshu"], ["short_video_cover", "lifestyle_scene"], ["自然光和真实生活场景", "轻商业表达", "保留可编辑标题区"], ["夸大前后对比", "文化刻板印象", "硬烘焙价格"], "公开趋势"),
  template("promotion_event", "大促强转化活动图", "商品主视觉与活动层级并重，促销文字可编辑", "commerce-poster-social", ["shopee", "lazada", "taobao_tmall", "jd", "douyin", "tiktok_shop"], ["campaign_banner"], ["商品主视觉突出", "保留标题、价格、折扣和 CTA 区域", "移动端高对比"], ["硬烘焙价格", "虚假稀缺", "未经授权节庆符号"], "运营复核"),
  template("tech_parameter", "参数科技质感图", "参数可信、产品清晰、适合 3C 与家电", "product-photography", ["amazon", "taobao_tmall", "jd"], ["feature_benefit", "detail_module"], ["参数网格和局部特写", "克制科技光效", "产品边缘清晰"], ["伪造参数", "受保护应用 Logo", "虚假认证"], "公开趋势"),
  template("checklist_compare", "清单测评对比图", "信息清单或结构化测评，文案独立可编辑", "commerce-poster-social", ["xiaohongshu", "taobao_tmall"], ["detail_module", "short_video_cover"], ["清单式层级", "真实测评口吻", "商品与信息分区"], ["伪造评价", "绝对化推荐", "夸张前后对比"], "公开趋势"),
];

type RiskRule = {
  id: string;
  action: Exclude<CrossBorderRiskAction, "pass">;
  label: string;
  reason: string;
  safeAlternative: string;
  patterns: RegExp[];
  marketIds?: CrossBorderMarketId[];
  regions?: CrossBorderMarket["region"][];
  categories?: CrossBorderCategoryId[];
};

const riskRules: RiskRule[] = [
  {
    id: "political-sensitive",
    action: "block",
    label: "政治人物或敏感政治符号",
    reason: "商品创意不应使用政治人物、争议地图或敏感旗帜作为促销元素。",
    safeAlternative: "改用中性城市、生活方式或商品利益点场景。",
    patterns: [/trump|biden|putin|xi jinping|特朗普|拜登|普京|习近平|争议地图|敏感旗帜/i],
  },
  {
    id: "religious-misuse",
    action: "block",
    label: "宗教符号误用",
    reason: "宗教符号、圣地或神圣语言不能作为娱乐化装饰。",
    safeAlternative: "改用中性建筑、材质、光线或家庭场景。",
    patterns: [/quran|koran|mosque as decoration|temple party|清真寺装饰|宗教恶搞|亵渎/i],
  },
  {
    id: "indonesia-restricted",
    action: "block",
    label: "印尼市场限制内容",
    reason: "印尼市场默认规避酒类、猪制品、赌博、暴露人物和宗教符号误用。",
    safeAlternative: "改用商品优先、人物保守且文化中性的生活场景。",
    patterns: [/alcohol|beer|wine|pork|casino|gambling|bikini|啤酒|酒精|猪肉|赌场|赌博|暴露人物/i],
    marketIds: ["id"],
  },
  {
    id: "gulf-restricted",
    action: "block",
    label: "海湾市场限制内容",
    reason: "海湾市场默认规避酒类、猪制品、赌博、暴露人物和敏感政治。",
    safeAlternative: "改用保守人物造型与中性家庭或商业场景。",
    patterns: [/alcohol|beer|wine|pork|casino|gambling|bikini|啤酒|酒精|猪肉|赌场|赌博|暴露人物/i],
    regions: ["gulf"],
  },
  {
    id: "ip-logo-character",
    action: "block",
    label: "IP、Logo 或名人肖像",
    reason: "未授权角色、品牌 Logo、名人肖像和受保护外观存在侵权风险。",
    safeAlternative: "只描述颜色、材质、轮廓与情绪，不点名受保护品牌或角色。",
    patterns: [/disney|marvel|pokemon|nike logo|apple logo|迪士尼|漫威|宝可梦|耐克 logo|苹果 logo/i],
  },
  {
    id: "health-beauty-claim",
    action: "rewrite",
    label: "医美、减肥或功效宣称",
    reason: "美妆、食品和母婴功效需要证据，且不应直接烘焙进图片。",
    safeAlternative: "改写为质地、日常护理、舒适度或适用场景表达。",
    patterns: [/cure|guaranteed weight loss|lose\s*\d+\s*kg|before and after|治愈|根治|保证瘦\s*\d+\s*斤|前后对比|医美级/i],
    categories: ["beauty_personal_care", "food_beverage", "baby_pet"],
  },
  {
    id: "certification-claim",
    action: "rewrite",
    label: "认证暗示",
    reason: "清真、有机、医疗和安全认证需要商品证据。",
    safeAlternative: "留出空白认证区域，待卖家提供证明后编辑。",
    patterns: [/halal certified|organic certified|fda approved|clinically proven|清真认证|有机认证|FDA 认证|临床证明/i],
  },
  {
    id: "misleading-commerce-copy",
    action: "rewrite",
    label: "误导性折扣、评价或承诺",
    reason: "价格、折扣、排名、评价与平台认证需要卖家确认。",
    safeAlternative: "保留可编辑区域，确认数据后再填写。",
    patterns: [/guaranteed best seller|no\.?1|five star reviews|platform approved|全网第一|五星好评|平台认证|保证爆款|限时\s*\d+\s*折/i],
  },
];

const findMarket = (marketId: CrossBorderMarketId) =>
  CROSS_BORDER_MARKETS.find(item => item.id === marketId);

export function getAvailableCrossBorderPlatforms(
  marketId: CrossBorderMarketId,
  includeReview = false
) {
  const selectedMarket = findMarket(marketId);
  if (!selectedMarket) return [];
  return selectedMarket.platforms.filter(
    item => includeReview || item.status === "active"
  );
}

function combinedText(input: CrossBorderComposeInput) {
  return [
    input.productName,
    input.productFacts,
    input.userPrompt,
    input.finalUserText,
  ]
    .filter(Boolean)
    .join("\n");
}

export function evaluateCrossBorderCommerceRisk(
  input: CrossBorderComposeInput
): CrossBorderRiskResult {
  const selectedMarket = findMarket(input.marketId);
  const text = combinedText(input);
  const hits: CrossBorderRiskHit[] = [];

  for (const rule of riskRules) {
    if (rule.marketIds && !rule.marketIds.includes(input.marketId)) continue;
    if (
      rule.regions &&
      (!selectedMarket || !rule.regions.includes(selectedMarket.region))
    )
      continue;
    if (rule.categories && !rule.categories.includes(input.categoryId)) continue;
    const match = rule.patterns.find(pattern => pattern.test(text));
    if (!match) continue;
    hits.push({
      id: rule.id,
      action: rule.action,
      label: rule.label,
      reason: rule.reason,
      matched: match.source,
      safeAlternative: rule.safeAlternative,
    });
  }

  const action: CrossBorderRiskAction = hits.some(hit => hit.action === "block")
    ? "block"
    : hits.some(hit => hit.action === "rewrite")
      ? "rewrite"
      : hits.some(hit => hit.action === "advise")
        ? "advise"
        : "pass";

  return {
    action,
    hits,
    canGenerate: action !== "block" && action !== "rewrite",
    disclaimer:
      "ArtX 仅提供可追溯的创意风险提示，不构成法律、税务、商标或平台审核意见。",
  };
}

export function composeCrossBorderCommerceContext(
  input: CrossBorderComposeInput
): CrossBorderGenerationContext {
  const selectedMarket = findMarket(input.marketId);
  if (!selectedMarket) throw new Error(`Unknown market: ${input.marketId}`);
  const selectedPlatform = selectedMarket.platforms.find(
    item => item.id === input.platformId && item.status === "active"
  );
  if (!selectedPlatform)
    throw new Error(
      `Platform ${input.platformId} is not active for ${selectedMarket.label}`
    );
  const selectedPlacement = selectedPlatform.placements.find(
    item => item.id === input.placementId
  );
  if (!selectedPlacement)
    throw new Error(
      `Placement ${input.placementId} is not available for ${selectedPlatform.label}`
    );
  const selectedTemplate = CROSS_BORDER_TEMPLATES.find(
    item => item.id === input.templateId
  );
  if (!selectedTemplate)
    throw new Error(`Unknown template: ${input.templateId}`);
  if (
    !selectedTemplate.platformIds.includes(selectedPlatform.id) ||
    !selectedTemplate.allowedPlacements.includes(selectedPlacement.id)
  )
    throw new Error(
      `Template ${selectedTemplate.label} cannot be used for ${selectedPlatform.label} ${selectedPlacement.label}`
    );

  const risk = evaluateCrossBorderCommerceRisk(input);
  if (risk.action === "block")
    throw new Error(`Generation blocked: ${risk.hits.map(hit => hit.label).join("、")}`);
  const category = CROSS_BORDER_CATEGORIES.find(
    item => item.id === input.categoryId
  );
  const productFacts =
    input.productFacts?.trim() ||
    "Only use seller-provided product facts; do not invent certification, rating, discount, legal, or performance claims.";
  const editableLanguage = selectedMarket.languages.join(" / ");
  const prompt = [
    `ArtX intelligent ecommerce visual package ${CROSS_BORDER_COMMERCE_VERSION}.`,
    `Market: ${selectedMarket.label}; platform: ${selectedPlatform.label}; placement: ${selectedPlacement.label}; output: ${selectedPlacement.size.width}x${selectedPlacement.size.height}.`,
    `Product category: ${category?.label || input.categoryId}; product: ${input.productName || "seller product"}.`,
    `Verified product facts: ${productFacts}`,
    `Visual template: ${selectedTemplate.label}. ${selectedTemplate.promptRules.join("; ")}.`,
    `Category direction: ${selectedTemplate.categoryLens[input.categoryId]}`,
    `Market guardrails: ${selectedMarket.culturalNotes.join(" ")}`,
    `Editable copy language: ${editableLanguage}.`,
    `Text policy: ${selectedPlacement.textPolicy} Keep title, price, CTA, discount, legal and certification copy as editable safe-area overlays, not baked into pixels.`,
    `Disabled elements: ${selectedTemplate.disabledElements.join(", ")}.`,
    input.userPrompt ? `User creative addition: ${input.userPrompt}` : "",
    risk.hits.length
      ? `Required copy revisions: ${risk.hits.map(hit => `${hit.label}: ${hit.safeAlternative}`).join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    market: {
      id: selectedMarket.id,
      label: selectedMarket.label,
      languages: selectedMarket.languages,
      currency: selectedMarket.currency,
      region: selectedMarket.region,
    },
    platform: {
      id: selectedPlatform.id,
      label: selectedPlatform.label,
    },
    placement: selectedPlacement,
    category: input.categoryId,
    template: selectedTemplate,
    skillId: selectedTemplate.preferredSkillId,
    prompt,
    editableCopySuggestions: [
      `${editableLanguage}：简短商品标题`,
      `${editableLanguage}：1-3 条卖家确认的事实卖点`,
      `${editableLanguage}：卖家确认后的价格、优惠与 CTA`,
      "合规说明：认证、功效和法律文字需在证据确认后编辑。",
    ],
    exportSizes: selectedPlatform.placements.map(item => ({
      label: item.label,
      width: item.size.width,
      height: item.size.height,
      platform: selectedPlatform.label,
    })),
    marketPackageVersion: CROSS_BORDER_COMMERCE_VERSION,
    risk,
  };
}
