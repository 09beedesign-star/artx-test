/**
 * 全站默认图片模型 = 腾讯 VOD 直连的 OG image2.5 medium（sunburst 系）。
 *
 * 2026-09-11 从 `og-image2-medium`（中转站，0.398 元/张 @1K）切换而来：
 * image2.5 medium 同档只要 0.078 元/张，**便宜 5.1 倍**，且走 VOD 直连不经中转站。
 *
 * 版本字符串 `image2.5_sunburst_medium` 是实测确认的
 * （scripts/probe-vod-og-image25.mjs 枚举验证，sunburst / flare 两系
 * 各 low/medium/high 共 6 个版本有效并真实出图；
 * `image2.5_medium` 这种不带系列名的写法一律被腾讯拒为 InvalidParameterValue）。
 */
export const DEFAULT_IMAGE_MODEL_ID = "vod-og25-sunburst-medium";

/**
 * auto 模式的 fallback 链，**按优先级从高到低**。
 *
 * 2026-09-12 起为**纯 VOD 链路**：中转站图片模型已全部下线。
 *
 * 演进过程（两步）：
 * 1. 2026-09-11 先把 vod-* 提到链首，中转站图片模型退到链尾作兜底；
 * 2. 2026-09-12 按用户要求彻底摘除中转站图片模型 ——
 *    「不用保留中转站作为兜底，默认为 vod」。
 *
 * 注意边界：**中转站本身没有下线**，它继续承载文本/大语言模型
 * （AI_TEXT_BASE_URL，见 server/text-generation.ts）。
 * 这里下线的只是「中转站的图片生成能力」。
 *
 * 被摘除的 8 个 id 不是简单删掉就完事 —— 见下方
 * RETIRED_RELAY_IMAGE_MODEL_IDS 的说明，它们必须继续被识别并迁移，
 * 否则存量账号的模型白名单会被静默清空。
 */
export const IMAGE_MODEL_PRIORITY_IDS = [
  // —— 腾讯 VOD 直连：性价比最优的 image2.5 排最前 ——
  "vod-og25-sunburst-medium",
  "vod-og25-flare-medium",
  "vod-og25-sunburst-low",
  "vod-og25-flare-low",
  // —— 腾讯 VOD 直连：其余模型 ——
  "vod-gem",
  "vod-gem-lite",
  "vod-jimeng",
  "vod-og",
  "vod-mj",
  "vod-kling",
  "vod-si",
  "vod-qwen",
  "vod-og25-sunburst-high",
  "vod-og25-flare-high",
] as const;

/**
 * 已下线的中转站图片模型 → 等价 VOD 模型的迁移映射。
 *
 * **为什么必须保留这张表，而不是把 id 直接删干净：**
 *
 * 这些 id 已经被写进了持久化数据 —— 用户的 `allowedAiModels` 白名单
 * （.artx-data/auth-users.json）、历史作品记录里的 modelId、前端本地草稿。
 * server/model-router.ts 的 normalizeAllowedModels 在**读盘那一刻**
 * 就会 `.filter(isSelectableModel)`，任何不再被识别的 id 会被直接丢弃。
 *
 * 若只删不迁，后果是：
 *   - 白名单里只有中转站图片模型的账号 → 过滤后变成**空数组** `[]`；
 *     而鉴权逻辑里只有 `undefined` 才表示「放行全部」，`[]` 等于「一个都不准用」，
 *     该账号会彻底失去出图能力，且报错是误导性的「当前账号无权使用该模型」。
 *   - 历史作品的模型名会退化成裸 id，UI 上显示为无图标的陌生字符串。
 *
 * 所以正确做法是「迁移」而非「丢弃」：把旧 id 映射到画风/档位最接近的 VOD 模型，
 * 用户无感知地继续可用。映射按**同厂同档**原则选取。
 */
export const RETIRED_RELAY_IMAGE_MODEL_IDS = {
  // OpenAI 系：image2 的三个档位对应到 image2.5 的同名档位。
  // image2.5 同档更便宜且质量更好（medium 便宜 5.1 倍），属纯升级。
  "og-image2-low": "vod-og25-sunburst-low",
  "og-image2-medium": "vod-og25-sunburst-medium",
  "og-image2-high": "vod-og25-sunburst-high",
  // Google 系：中转站的 gemini-3.5-flash-preview 对应 VOD 的 gem 3.1 lite。
  "gemini-3.5-flash-preview": "vod-gem-lite",
  // 字节即梦。
  "jimeng-4.0": "vod-jimeng",
  // Midjourney：v7 / v8.1 统一迁移到 VOD 侧的 v8.2。
  "mj-v7": "vod-mj",
  "mj-v8.1": "vod-mj",
  // 快手可灵。
  "keling": "vod-kling",
} as const satisfies Record<string, (typeof IMAGE_MODEL_PRIORITY_IDS)[number]>;

export type RetiredRelayImageModelId = keyof typeof RETIRED_RELAY_IMAGE_MODEL_IDS;

export const RETIRED_RELAY_IMAGE_MODEL_ID_SET = new Set<string>(
  Object.keys(RETIRED_RELAY_IMAGE_MODEL_IDS)
);

/** 判断某个 id 是否为「已下线的中转站图片模型」。 */
export function isRetiredRelayImageModelId(model?: string): boolean {
  return RETIRED_RELAY_IMAGE_MODEL_ID_SET.has((model || "").trim().toLowerCase());
}

export type VodModelId = (typeof IMAGE_MODEL_PRIORITY_IDS)[number];

export const VOD_MODEL_IDS = new Set<string>(
  IMAGE_MODEL_PRIORITY_IDS.filter((id): id is VodModelId => id.startsWith("vod-"))
);

export const SUPPORTED_IMAGE_MODEL_IDS = new Set<string>(IMAGE_MODEL_PRIORITY_IDS);

export function isVodModelId(model?: string): boolean {
  const normalized = (model || "").trim().toLowerCase();
  if (normalized.startsWith("vod-")) return true;
  /**
   * 注册表里的 id 一律原样判定，不再走下面的别名规则。
   *
   * （历史背景：`jimeng-4.0` 曾被误列入裸名单。它当时是**中转站**的正式模型 id，
   * 判成 VOD 会导致用户选中转站的 jimeng-4.0 时被路由到腾讯云链路。
   * 2026-09-12 中转站图片模型整体下线后，jimeng-4.0 已改为迁移到 vod-jimeng，
   * 这条防御依然保留 —— 它保证「注册表 id」与「别名」两个概念不互相污染。）
   */
  if (SUPPORTED_IMAGE_MODEL_IDS.has(normalized)) return false;
  /**
   * 已下线的中转站图片模型会被 normalizeImageModelId 迁移到 VOD 模型，
   * 因此它们在语义上也属于 VOD 链路。这里必须一并判 true，
   * 否则 server/image-generation.ts 的路由分支会把它们错发给中转站的图片端点
   * （该端点已不再提供这些模型，必然 404）。
   */
  if (RETIRED_RELAY_IMAGE_MODEL_ID_SET.has(normalized)) return true;
  return ["gem", "gem-3.1", "gem-3.1-lite", "gem-lite", "og", "og-image2", "mj", "mj-v8.2",
    "kling", "kling-3.0", "si", "si-5.0", "qwen", "jimeng"].includes(normalized);
}

export function normalizeImageModelId(model?: string) {
  const value = (model || "").trim();
  const normalized = value.toLowerCase();
  if (!value || value.toLowerCase() === "auto") return "";
  if (value === "IMAGE2" || normalized === "image2") return DEFAULT_IMAGE_MODEL_ID;
  /**
   * 注册表里已存在的 id 一律原样返回，不得再被下面的别名规则改写。
   *
   * 别名的职责是「把裸名/历史写法映射到注册表 id」，
   * 而不是「把一个注册表 id 改写成另一个注册表 id」。
   */
  if (SUPPORTED_IMAGE_MODEL_IDS.has(normalized)) return normalized;
  /**
   * 已下线的中转站图片模型 → 等价 VOD 模型。
   *
   * 这一步必须排在所有别名规则**之前**，因为持久化数据里存的就是这些 id，
   * 它们的优先级高于任何裸名简写。详见 RETIRED_RELAY_IMAGE_MODEL_IDS 的说明。
   */
  const retiredTarget = RETIRED_RELAY_IMAGE_MODEL_IDS[normalized as RetiredRelayImageModelId];
  if (retiredTarget) return retiredTarget;
  // nano-banana 曾指向中转站的 gemini-3.5-flash-preview，该模型已下线，
  // 现直接落到等价的 VOD 模型 gem 3.1 lite。
  if (normalized === "nano-banana" || normalized === "nano-banana-lite") return "vod-gem-lite";
  if (normalized === "gem" || normalized === "gem-3.1") return "vod-gem";
  if (normalized === "gem-3.1-lite" || normalized === "gem-lite") return "vod-gem-lite";
  if (normalized === "og" || normalized === "og-image2") return "vod-og";
  if (normalized === "mj" || normalized === "mj-v8.2") return "vod-mj";
  if (normalized === "kling" || normalized === "kling-3.0") return "vod-kling";
  if (normalized === "si" || normalized === "si-5.0") return "vod-si";
  if (normalized === "qwen") return "vod-qwen";
  // 裸名 "jimeng"。带版本号的 "jimeng-4.0" 由上面的下线迁移表处理。
  if (normalized === "jimeng") return "vod-jimeng";
  return normalized;
}

export function isSupportedImageModelId(model?: string) {
  const normalized = normalizeImageModelId(model);
  return Boolean(normalized && SUPPORTED_IMAGE_MODEL_IDS.has(normalized));
}

export function sortImageModelIdsByPriority(modelIds: string[]) {
  const uniqueIds = Array.from(new Set(modelIds.map(normalizeImageModelId).filter(Boolean)));
  const priority = new Map<string, number>(IMAGE_MODEL_PRIORITY_IDS.map((id, index) => [id, index]));
  return uniqueIds
    .filter(id => SUPPORTED_IMAGE_MODEL_IDS.has(id))
    .sort((a, b) => (priority.get(a) ?? 999) - (priority.get(b) ?? 999));
}

export function getImageModelFallbackAttempts(requestedModel?: string) {
  const normalized = normalizeImageModelId(requestedModel);
  const requested = normalized && SUPPORTED_IMAGE_MODEL_IDS.has(normalized)
    ? [normalized]
    : [];
  return Array.from(new Set([...requested, ...IMAGE_MODEL_PRIORITY_IDS]));
}

export function getDefaultImageModelPriorityLabel() {
  return IMAGE_MODEL_PRIORITY_IDS.join(" -> ");
}
