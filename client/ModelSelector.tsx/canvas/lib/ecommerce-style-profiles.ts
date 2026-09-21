/**
 * 电商平台「设计风格档案」——平台视觉调性的唯一事实源。
 *
 * 【解决的问题】
 * 用户选了电商平台尺寸后，原先只有三件事被带进链路：宽、高、是否白底。
 * 但「800×800 + 白底」只约束了画布，没约束**长什么样**——
 * 同样是 800×800 白底，Amazon 的极简功能性主图和淘宝的精致促销感主图
 * 是两种完全不同的东西。用户在提示词里随手写一句「放在桌子上」，
 * 出来的图可能根本不像那个平台上会出现的商品图。
 *
 * 【为什么是「风格族」而不是每个平台一段文案】
 * ⚠️⚠️ 25 个平台逐个写风格文案 = 25 份高度重复的副本。
 *    Amazon / Walmart / Target / BestBuy 的主图要求几乎一模一样，
 *    抄 4 份的直接后果是：日后调整白底布光话术时改了 1 份忘了 3 份，
 *    而且**不会有任何报错**——只是某些平台的图悄悄变得不一样了。
 *    这正是本项目反复踩的「同一份知识多个出口」。
 * ✅ 所以抽出 6 个风格族，平台只持有一个 styleId 指过去。
 *    新增平台时只需挑一个已有族，不需要再写一遍风格。
 *
 * 【与 bg: "white" 的关系（重要不变量）】
 * ⚠️ bg === "white" 是平台**审核硬规则**，而风格文案是**视觉建议**。
 *    如果一个白底平台指向了「生活化场景」风格族，提示词里就会同时出现
 *    「必须纯白背景」和「温暖木质台面、自然环境」两条互相打架的指令——
 *    模型会二选一，选中哪条全凭运气，出的图有一半通不过平台审核。
 * 📌 因此存在一条硬不变量：**bg === "white" 的平台只能用 whiteBg 为 true 的风格族**。
 *    ecommerce-style-profiles.test.ts 里有守卫逐个平台核对这件事。
 */

export type EcommerceStyleProfile = {
  id: string;
  /** 风格族名称，UI 上展示给用户看 */
  label: string;
  /**
   * 这个风格族是否属于「纯白底」类。
   *
   * ⚠️ 它不是装饰字段，是上面那条硬不变量的判定依据。
   *    改动时务必同步检查引用了本族的平台的 bg 值。
   */
  whiteBg: boolean;
  /** 一句话调性，选中平台后显示在面板上 */
  tone: string;
  /**
   * 注入提示词的风格指令。
   *
   * ⚠️ 写成**正向描述**，不要写「不要做什么」。
   *    本项目在风格参考图上实测过：抽象否定会把模型的注意力引到
   *    那个被否定的东西上，改变比从 3.29x 崩到 0.94x。
   *    唯一允许的否定是指向明确的单点排除。
   */
  prompt: string;
  /**
   * 给用户点选、直接插进提示词框的风格关键词。
   *
   * ⚠️ 必须是**用户能直接用的半句话**，不是抽象标签。
   *    写「高级感」这种词等于没写，用户点进去也不知道自己在描述什么；
   *    写「浅灰水泥台面」才真的能帮他把提示词写具体。
   */
  keywords: readonly string[];
};

export const ECOMMERCE_STYLE_PROFILES: readonly EcommerceStyleProfile[] = [
  {
    id: "white-studio",
    label: "白底商业棚拍",
    whiteBg: true,
    tone: "纯白底、均匀布光、功能性主图",
    prompt:
      "视觉风格：标准电商白底棚拍主图。纯白背景（#FFFFFF），柔和均匀的商业布光，产品下方只保留一道轻微自然的接触阴影，边缘干净锐利，整体观感克制、专业、以展示产品本身为唯一目的。",
    keywords: [
      "纯白无缝背景",
      "柔和均匀布光",
      "轻微接触阴影",
      "锐利干净边缘",
      "产品居中平视角度",
    ],
  },
  {
    id: "premium-commerce",
    label: "精致商业质感",
    whiteBg: false,
    tone: "高级质感、层次光影、促销主图调性",
    prompt:
      "视觉风格：精致的商业电商主图。干净有层次的浅色背景，柔和的方向性主光配合细腻的环境反射，材质质感突出，画面通透有高级感，留白充足以便后期叠加促销文案。",
    keywords: [
      "浅灰水泥台面",
      "柔和方向性主光",
      "细腻材质反射",
      "通透的浅色渐层背景",
      "上方留白便于加文案",
    ],
  },
  {
    id: "lifestyle-social",
    label: "生活化种草",
    whiteBg: false,
    tone: "真实生活场景、自然光、社交内容感",
    prompt:
      "视觉风格：社交电商的生活化种草图。真实可信的居家或户外生活场景，自然光从侧上方打入，背景轻微虚化并保留少量生活化道具，氛围温暖亲切，像是真实用户随手拍下的高质量照片。",
    keywords: [
      "自然光从侧上方打入",
      "背景轻微虚化的居家场景",
      "原木与布艺质感道具",
      "温暖柔和的色调",
      "清晨窗边的自然氛围",
    ],
  },
  {
    id: "fashion-editorial",
    label: "时尚杂志感",
    whiteBg: false,
    tone: "高对比光影、时装大片调性",
    prompt:
      "视觉风格：时尚服饰电商的杂志感大片。简洁有设计感的背景，对比明确的戏剧性光影，色彩克制而高级，画面重心突出，整体接近时装画报的视觉语言。",
    keywords: [
      "简洁的纯色背景墙",
      "戏剧性的侧逆光",
      "克制的莫兰迪色调",
      "利落的几何投影",
      "高对比的明暗层次",
    ],
  },
  {
    id: "marketplace-clean",
    label: "通用货架干净风",
    whiteBg: false,
    tone: "浅色干净背景、主体清晰、跨境通用",
    prompt:
      "视觉风格：跨境货架电商通用主图。浅色干净的纯色或极简渐变背景，明亮均匀的光线，产品主体占据画面视觉中心且轮廓清晰，缩略图尺寸下依然一眼能看清是什么商品。",
    keywords: [
      "浅色纯色背景",
      "明亮均匀的光线",
      "主体占据画面中心",
      "极简渐变背景",
      "缩略图下依然清晰",
    ],
  },
  {
    id: "handcraft-warm",
    label: "手作温暖质感",
    whiteBg: false,
    tone: "自然材质、手作氛围、温润光线",
    prompt:
      "视觉风格：手作 / 设计师商品的温暖质感图。天然材质的台面与背景（原木、亚麻、粗陶），温润的自然侧光，画面带有手工制作的温度和故事感，细节纹理清晰可辨。",
    keywords: [
      "原木台面",
      "亚麻布纹理背景",
      "温润的自然侧光",
      "粗陶与干花道具",
      "手工质感的细节纹理",
    ],
  },
];

/**
 * 平台 → 风格族的映射。
 *
 * ⚠️ 这里的 key 必须与 SmartCommerceProductDialog.tsx 里
 *    ECOMMERCE_PRESET_GROUPS 的平台 id 完全一致。
 *    对不上的后果是静默回落到兜底风格——界面毫无异常，
 *    只是那个平台的风格指令从此再也没生效过。
 *    ecommerce-style-profiles.test.ts 会逐个核对两边的 id 集合。
 */
export const ECOMMERCE_PLATFORM_STYLE_MAP: Readonly<Record<string, string>> = {
  /*
    ⚠️ 这里按「白底 / 内容 / 时尚 / 货架」的**风格性质**归类，
       刻意不跟随面板上的「热门 / 主流」分组。
       面板分组是运营口径，会随热度调整；风格归类是视觉事实，
       跟着运营口径走的话，某个平台从热门挪到主流时风格会莫名其妙跟着变。
  */
  // 主图强制白底的国内平台，只能用白底族
  // 淘宝/天猫/京东/拼多多/得物
  "taobao-tmall": "white-studio",
  jd: "white-studio",
  pinduoduo: "white-studio",
  dewu: "white-studio",
  // 内容电商：主图就是种草图，生活感比棚拍更重要
  douyin: "lifestyle-social",
  kuaishou: "lifestyle-social",
  xiaohongshu: "lifestyle-social",
  "wechat-channel": "lifestyle-social",
  // TikTok Shop 与抖音同源，同属内容电商，主图即种草图
  tiktok: "lifestyle-social",
  // 唯品会以服饰鞋包为主，走时尚大片调性
  vip: "fashion-editorial",
  youzan: "marketplace-clean",

  // 北美大型零售商主图规则严格，一律纯白棚拍
  amazon: "white-studio",
  temu: "white-studio",
  walmart: "white-studio",
  target: "white-studio",
  bestbuy: "white-studio",
  ozon: "white-studio",
  flipkart: "white-studio",
  // 开放式货架平台：背景不限，但要在缩略图下看得清
  ebay: "marketplace-clean",
  aliexpress: "marketplace-clean",
  shopee: "marketplace-clean",
  lazada: "marketplace-clean",
  allegro: "marketplace-clean",
  mercadolibre: "marketplace-clean",
  // SHEIN 是快时尚
  shein: "fashion-editorial",
  // Etsy 是手作 / 设计师市集
  etsy: "handcraft-warm",
};

/**
 * 兜底风格族。
 *
 * ⚠️ 兜底必须选**最中性**的一族。
 *    如果兜底选了「生活化种草」，一个新加的白底平台在忘记配映射时
 *    会拿到与白底硬规则打架的风格指令，出的图直接过不了审核。
 *    marketplace-clean 是唯一在任何平台上都不会明显跑偏的选择。
 */
export const FALLBACK_ECOMMERCE_STYLE_ID = "marketplace-clean";

export function getEcommerceStyleProfile(
  platformId: string | null | undefined
): EcommerceStyleProfile {
  const styleId = platformId ? ECOMMERCE_PLATFORM_STYLE_MAP[platformId] : undefined;
  return (
    ECOMMERCE_STYLE_PROFILES.find(item => item.id === styleId) ||
    ECOMMERCE_STYLE_PROFILES.find(item => item.id === FALLBACK_ECOMMERCE_STYLE_ID)!
  );
}

/**
 * 判断用户写的提示词是否与「纯白底」硬规则冲突。
 *
 * 【为什么需要它】
 * 用户选了 Amazon（强制纯白底）却写「放在森林的树桩上」，这是真实冲突。
 * 提示词里两条指令打架时模型只会挑一条，用户拿到图才发现不能用。
 *
 * ⚠️ 只做**提示**，不做拦截。
 *    自动改写用户的提示词是更糟的选择：用户会发现自己写的话被偷偷改了，
 *    而且不知道改成了什么。把冲突摆在他面前，让他自己决定。
 *
 * ⚠️ 词表保持**短而准**。加一堆模糊词（如「自然」「氛围」）会让提示频繁误报，
 *    用户很快就会对它完全免疫，等于没有。
 */
const WHITE_BG_CONFLICT_WORDS = [
  "场景",
  "背景墙",
  "桌面",
  "台面",
  "木质",
  "大理石",
  "户外",
  "森林",
  "海边",
  "沙滩",
  "草地",
  "室内",
  "客厅",
  "厨房",
  "渐变",
  "彩色背景",
  "道具",
  "植物",
  "绿植",
  "鲜花",
];

export function findWhiteBackgroundConflicts(prompt: string): string[] {
  const text = (prompt || "").trim();
  if (!text) return [];
  return WHITE_BG_CONFLICT_WORDS.filter(word => text.includes(word));
}

/** 构造电商规则所需的平台最小信息，与面板里 ECOMMERCE_PRESETS 的元素结构对齐。 */
export type EcommercePlatformSpec = {
  id: string;
  name: string;
  width: number;
  height: number;
  ratio: string;
  bg: "white" | "any";
};

/**
 * 把选中的电商平台翻译成注入提示词的规则行。
 *
 * 【为什么是独立纯函数，而不是留在组件里内联】
 * ⚠️ 这段逻辑决定了「用户选了平台」到底有没有真的影响出图，
 *    是本次需求的**唯一生效路径**。留在组件 JSX 的闭包里，测试就只能去
 *    扫源码字符串——而源码断言是本项目已经踩实过的恒绿陷阱：
 *    `toContain` 的子串一旦在文件里出现两处，它就不再指向你以为的那处，
 *    把实现改坏了测试照样全绿。
 * ✅ 抽成纯函数后可以直接断言**返回值本身**：顺序对不对、风格有没有真的进去，
 *    改坏了必然红。
 *
 * 【顺序是语义的一部分，不是排版】
 * ⚠️ 返回数组的顺序固定为：规格 → 背景硬规则 → 风格调性。
 *    风格必须排在白底硬规则**之后**：提示词里靠后的指令修正作用更强，
 *    而风格是建议、白底是平台审核硬线。顺序反了，风格描述会盖过硬规则，
 *    用户选了 Amazon 却拿到一张过不了审的场景图——而且不会有任何报错。
 */
export function buildEcommercePromptRules(
  platform: EcommercePlatformSpec | null | undefined
): string[] {
  if (!platform) return [];
  const style = getEcommerceStyleProfile(platform.id);
  return [
    `目标电商平台：${platform.name}，主图规格 ${platform.width}×${platform.height}（${platform.ratio}）。`,
    platform.bg === "white"
      ? `${platform.name} 平台要求主图为纯白背景（#FFFFFF），只做干净的白底商业布光和自然接触阴影，不要添加任何场景、道具或彩色背景。`
      : "背景可自由设计，但要符合该平台的商业主图调性，主体清晰、边缘干净。",
    `${platform.name} 的${style.label}调性——${style.prompt}`,
  ];
}
