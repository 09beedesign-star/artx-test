import { describe, expect, it } from "vitest";
import { IMAGE_AI_MODEL_OPTIONS, mergeImageAiModelOptions } from "./workspace-data";
import {
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
  isSupportedImageModelId,
  isVodModelId,
  normalizeImageModelId,
} from "../../../shared/image-models";
import { getAiImageModelCreditPolicy } from "../../../shared/ai-credit-policy";

const expectedImageModelDescriptions = {
  "vod-og25-sunburst-medium": "高性价比默认推荐",
  "vod-og25-flare-medium": "高性价比另一画风",
  "vod-og25-sunburst-low": "极致低成本草稿",
  "vod-og25-flare-low": "极致低成本另一画风",
  "vod-og25-sunburst-high": "极致高清细节",
  "vod-og25-flare-high": "极致高清另一画风",
  "vod-gem": "高品质综合表现",
  "vod-gem-lite": "高性价比出图快",
  "vod-og": "高品质场景稳定",
  "vod-mj": "极致艺术表现",
  "vod-kling": "高品质国风电商",
  "vod-si": "极致写实质感",
  "vod-qwen": "高性价比中文强",
  "vod-jimeng": "高性价比中文强",
};

/** 2026-09-12 下线的 8 个中转站图片模型 id，一个都不许再出现在选择器里。 */
const RETIRED_RELAY_IDS = [
  "og-image2-low",
  "og-image2-medium",
  "og-image2-high",
  "gemini-3.5-flash-preview",
  "jimeng-4.0",
  "mj-v7",
  "mj-v8.1",
  "keling",
];

function expectUserFacingImageModelDescription(description: string | undefined) {
  expect(description).toBeTruthy();
  expect(description).not.toMatch(/[高中低]价/);
  expect(description!.length).toBeLessThanOrEqual(15);
}

describe("workspace image model options", () => {
  it("keeps the fallback selector list aligned with the full image model catalog", () => {
    // 顺序 = IMAGE_MODEL_PRIORITY_IDS 的优先级顺序。
    // 2026-09-12 中转站图片模型整体下线后，这里是一条纯 VOD 清单，
    // 链首是全站默认模型 vod-og25-sunburst-medium（OG image2.5 medium）。
    expect(IMAGE_AI_MODEL_OPTIONS.map(option => option.id)).toEqual([
      "auto",
      ...IMAGE_MODEL_PRIORITY_IDS,
    ]);
    // 清单来源不再手抄：任何增删模型都会被上面这条自动覆盖，
    // 下面只额外锁住「必须全是 VOD」这个结构性承诺。
    for (const option of IMAGE_AI_MODEL_OPTIONS.filter(item => item.id !== "auto")) {
      expect(isVodModelId(option.id), `${option.id} 不是 VOD 模型`).toBe(true);
    }
    for (const [id, description] of Object.entries(expectedImageModelDescriptions)) {
      const option = IMAGE_AI_MODEL_OPTIONS.find(model => model.id === id);
      expect(option?.description).toBe(description);
      expectUserFacingImageModelDescription(option?.description);
    }
    // 每个在售模型都必须带品牌图标，否则 UI 上是一片空白。
    for (const option of IMAGE_AI_MODEL_OPTIONS.filter(item => item.id !== "auto")) {
      expect(option.icon, `${option.id} 缺少 icon`).toBeTruthy();
    }
  });

  it("removes every retired relay image model from the selector", () => {
    /**
     * 用户诉求：「不用保留中转站作为兜底，默认为 vod」。
     *
     * 这条锁住「摘除」本身 —— 只要有人把任何一个旧 id 重新加回
     * IMAGE_AI_MODELS 或注册表，这里立刻报警。
     */
    for (const id of RETIRED_RELAY_IDS) {
      expect(
        IMAGE_AI_MODEL_OPTIONS.some(option => option.id === id),
        `${id} 已下线却仍出现在选择器中`
      ).toBe(false);
      expect(
        IMAGE_MODEL_PRIORITY_IDS.includes(id as never),
        `${id} 已下线却仍在 auto fallback 链里`
      ).toBe(false);
    }
  });

  it("merges discovered image models into the shared selector options", () => {
    /**
     * 服务端下发的 label/description 必须能覆盖本地兜底文案，
     * 同时后端专用能力（gpt-image-* / gemini-3.1-flash-image）与文本模型
     * 一律不得混进图片选择器。
     */
    const options = mergeImageAiModelOptions([
      { id: "gpt-image-2", label: "gpt-image-2", color: "server-color" },
      { id: "gpt-image-2-4k", label: "gpt-image-2-4k", color: "server-color" },
      { id: "gemini-3.1-flash-image", label: "gemini-3.1-flash-image", color: "server-color" },
      { id: "vod-jimeng", label: "jimeng 4.0", color: "server-color", description: "高性价比中文强", icon: "jimeng" },
      { id: "gpt-5.4-mini", label: "GPT text", color: "server-color" },
    ]);

    expect(options[0]).toMatchObject({ id: "auto" });
    // vod-jimeng 来自 discovered，其余 vod-* 来自兜底，全部必须在列且顺序按优先级。
    expect(options.map(option => option.id)).toEqual([
      "auto",
      ...IMAGE_MODEL_PRIORITY_IDS,
    ]);
    expect(options.find(option => option.id === "vod-jimeng")).toMatchObject({
      label: "jimeng 4.0",
      description: "高性价比中文强",
      icon: "jimeng",
    });
    expectUserFacingImageModelDescription(options.find(option => option.id === "vod-jimeng")?.description);
    expect(options.some(option => option.id === "gpt-image-2")).toBe(false);
    expect(options.some(option => option.id === "gpt-image-2-4k")).toBe(false);
    expect(options.some(option => option.id === "gemini-3.1-flash-image")).toBe(false);
    expect(options.some(option => option.id === "gpt-5.4-mini")).toBe(false);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "gpt-image-2")).toBe(false);
  });

  it("uses discovered image models as the selector source when the provider returns a catalog", () => {
    /**
     * 中转站目录里若仍残留已下线的图片模型（它的 /models 接口不归我们控制），
     * 必须被整体过滤掉 —— 否则下线的模型会换个来源重新出现在 UI 上。
     *
     * 同时 vod-* 不在中转站目录里（走腾讯云独立链路），
     * 必须被无条件兜底保留，否则「有目录就用目录」的逻辑会把它们整体丢弃。
     */
    const options = mergeImageAiModelOptions([
      { id: "gemini-3.5-flash-preview", label: "gemini-3.5-flash-preview", color: "server-color" },
      { id: "og-image2-low", label: "image2 low", color: "server-color", description: "高性价比快速稿", icon: "openai" },
      { id: "og-image2-medium", label: "image2 medium", color: "server-color", description: "高品质场景稳定", icon: "openai" },
      { id: "og-image2-high", label: "image2 high", color: "server-color", description: "极致高清电影感", icon: "openai" },
      { id: "keling", label: "keling", color: "server-color", description: "高品质国风电商", icon: "keling" },
    ]);

    expect(options.map(option => option.id)).toEqual([
      "auto",
      ...IMAGE_MODEL_PRIORITY_IDS,
    ]);
    for (const id of RETIRED_RELAY_IDS) {
      expect(
        options.some(option => option.id === id),
        `${id} 已下线却被服务端目录重新带回选择器`
      ).toBe(false);
    }
    for (const option of options.filter(option => option.id !== "auto" && option.description)) {
      expectUserFacingImageModelDescription(option.description);
    }
  });
});

describe("腾讯 VOD 模型接入选择器（2026-09-11）", () => {
  const VOD_IDS = [
    "vod-gem",
    "vod-gem-lite",
    "vod-og",
    "vod-mj",
    "vod-kling",
    "vod-si",
    "vod-qwen",
    "vod-jimeng",
  ];

  it("八个 VOD 模型全部出现在选择器里", () => {
    for (const id of VOD_IDS) {
      expect(
        IMAGE_AI_MODEL_OPTIONS.some(option => option.id === id),
        `${id} 不在选择器中，用户无法主动选择`
      ).toBe(true);
    }
  });

  it("jimeng-4.0 下线后迁移到 vod-jimeng，而不是被丢弃", () => {
    /**
     * 语义在 2026-09-12 发生了翻转，这里记录一下前因后果：
     *
     * 09-11 时 `jimeng-4.0` 还是**中转站的在售 id**，当时的 bug 是它被别名规则
     * 误改写成 `vod-jimeng`，两者在去重时合并，导致它从选择器里消失。
     * 那一版的断言是「normalizeImageModelId('jimeng-4.0') === 'jimeng-4.0'」。
     *
     * 09-12 中转站图片模型整体下线，`jimeng-4.0` 变成**已退役 id**，
     * 此时正确行为恰恰相反 —— 它必须被迁移成 `vod-jimeng`，
     * 否则存量白名单里的这个 id 会在读盘时被 filter 掉，账号白名单被清空。
     *
     * 两个版本不矛盾：别名规则依然不许改写**注册表内**的 id
     * （由下一条「注册表内的 id 一律不被别名改写」守住），
     * 而退役 id 已不在注册表内，走的是迁移表而非别名表。
     */
    expect(normalizeImageModelId("jimeng-4.0")).toBe("vod-jimeng");
    // 退役 id 在语义上归属 VOD 链路，否则会被错发给已不提供该模型的中转站图片端点。
    expect(isVodModelId("jimeng-4.0")).toBe(true);
    // 裸名 jimeng 同样指向 VOD。
    expect(normalizeImageModelId("jimeng")).toBe("vod-jimeng");
    // 选择器里只留迁移目标，退役 id 不得再出现。
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "jimeng-4.0")).toBe(false);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "vod-jimeng")).toBe(true);
  });

  it("注册表内的 id 一律不被别名改写", () => {
    // 通用不变量：任何注册表 id 归一化后都应等于自身。
    for (const id of IMAGE_MODEL_PRIORITY_IDS) {
      expect(normalizeImageModelId(id), `${id} 被别名改写了`).toBe(id);
    }
  });

  it("hunyuan 已被移除，不得出现在任何一层", () => {
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "vod-hunyuan")).toBe(false);
    expect(IMAGE_MODEL_PRIORITY_IDS.includes("vod-hunyuan" as never)).toBe(false);
    expect(isSupportedImageModelId("vod-hunyuan")).toBe(false);
    // 别名也要一并失效，否则 normalizeImageModelId("hunyuan") 仍会产出一个
    // 注册表里不存在的 id，服务端白名单会静默丢弃，表现为「选了没反应」。
    expect(normalizeImageModelId("hunyuan")).not.toBe("vod-hunyuan");
    expect(isSupportedImageModelId("hunyuan")).toBe(false);
  });

  it("服务端目录不含 VOD 时仍必须保留它们", () => {
    /**
     * 这是本次改动最容易回退的一点。
     *
     * /api/ai/models 的目录 = 中转站 /models 返回 ∩ 本地注册表，
     * 而 vod-* 走腾讯云独立链路、根本不在中转站上，
     * 所以 discoveredModels 里永远不会有它们。
     *
     * 一旦 mergeImageAiModelOptions 的兜底被删掉，
     * 「有目录就以目录为准」会把 vod-* 整体丢弃 ——
     * IMAGE_AI_MODELS 里加了也白加，UI 上一个都看不到。
     */
    const options = mergeImageAiModelOptions([
      { id: "og-image2-medium", label: "image2 medium", color: "c" },
      { id: "gemini-3.5-flash-preview", label: "gemini", color: "c" },
    ]);
    for (const id of VOD_IDS) {
      expect(
        options.some(option => option.id === id),
        `${id} 被服务端目录覆盖掉了`
      ).toBe(true);
    }
  });

  it("VOD 模型带有品牌图标字段，避免掉成无图标", () => {
    /**
     * getModelBrandIconKind 匹配的是 `${icon} ${modelId}`。
     * vod-gem / vod-si / vod-qwen 这些 id 本身不含品牌关键字，
     * 不显式给 icon 就会落到 "none"，UI 上是一片空白。
     */
    for (const id of VOD_IDS) {
      const option = IMAGE_AI_MODEL_OPTIONS.find(model => model.id === id);
      expect(option?.icon, `${id} 缺少 icon 字段`).toBeTruthy();
    }
  });

  it("VOD 模型的文案符合用户可见规范", () => {
    for (const id of VOD_IDS) {
      const option = IMAGE_AI_MODEL_OPTIONS.find(model => model.id === id);
      expect(option?.label).toBeTruthy();
      // label 不得直接暴露内部 id 前缀，那是实现细节。
      expect(option?.label).not.toMatch(/^vod-/);
      expectUserFacingImageModelDescription(option?.description);
    }
  });
});

describe("对外模型命名规范（2026-09-12）", () => {
  /**
   * 用户要求：选择器里 og 前缀全部去掉、gem 前缀全部改成 banana，后缀保持不变，
   * 且**只改前端展示名，不动后端真实模型接口**。
   *
   * 这组断言把「展示名」与「路由 id」的解耦关系钉死：
   * label 怎么改都行，id 必须原样，否则改个名字就会把出图链路改坏。
   */
  it("展示名里不出现 og 前缀", () => {
    for (const option of IMAGE_AI_MODEL_OPTIONS.filter(item => item.id !== "auto")) {
      expect(
        /^og[\s-]/i.test(option.label),
        `${option.id} 的展示名 "${option.label}" 仍带 og 前缀`
      ).toBe(false);
    }
  });

  it("gem 系展示名改用 banana，后缀保持不变", () => {
    const gem = IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "vod-gem");
    const gemLite = IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "vod-gem-lite");
    expect(gem?.label).toBe("banana 3.1");
    expect(gemLite?.label).toBe("banana 3.1 lite");
    // 任何展示名都不得再出现裸 gem 前缀。
    for (const option of IMAGE_AI_MODEL_OPTIONS.filter(item => item.id !== "auto")) {
      expect(
        /^gem[\s-]/i.test(option.label),
        `${option.id} 的展示名 "${option.label}" 仍带 gem 前缀`
      ).toBe(false);
    }
  });

  it("改展示名不得影响模型 id（后端接口保持不变）", () => {
    // id 是路由与计费的唯一依据，改名动作绝不能顺手改到它。
    expect(IMAGE_AI_MODEL_OPTIONS.map(option => option.id)).toEqual([
      "auto",
      ...IMAGE_MODEL_PRIORITY_IDS,
    ]);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "vod-gem")).toBe(true);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "vod-og")).toBe(true);
    // 改名前后 icon 判定必须稳定：图标看的是 icon 字段 + id，不看 label。
    expect(IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "vod-gem")?.icon).toBe("gemini");
    expect(IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "vod-og")?.icon).toBe("openai");
  });
});

describe("默认图片模型切换到 OG image2.5 直连（2026-09-11）", () => {
  const OG25_IDS = [
    "vod-og25-sunburst-low",
    "vod-og25-sunburst-medium",
    "vod-og25-sunburst-high",
    "vod-og25-flare-low",
    "vod-og25-flare-medium",
    "vod-og25-flare-high",
  ];

  it("默认模型是 image2.5 medium 且走 VOD 直连", () => {
    /**
     * 用户诉求是「默认与 auto 都用 image2.5 medium，且不经中转站」。
     * 这三条断言分别锁住：是哪个模型、是否 VOD 链路、是否 auto 首选。
     */
    expect(DEFAULT_IMAGE_MODEL_ID).toBe("vod-og25-sunburst-medium");
    expect(isVodModelId(DEFAULT_IMAGE_MODEL_ID)).toBe(true);
    expect(IMAGE_MODEL_PRIORITY_IDS[0]).toBe(DEFAULT_IMAGE_MODEL_ID);
  });

  it("image2.5 两个系列六个档位全部可选", () => {
    for (const id of OG25_IDS) {
      expect(isSupportedImageModelId(id), `${id} 不在注册表`).toBe(true);
      expect(
        IMAGE_AI_MODEL_OPTIONS.some(option => option.id === id),
        `${id} 不在选择器中`
      ).toBe(true);
    }
  });

  it("auto 链必须是纯 VOD，一个中转站模型都不许有", () => {
    /**
     * 这是「不走中转站」的结构性保证，09-12 从「排序约束」升级为「全称约束」。
     *
     * 09-11 的版本只要求 VOD 排在中转站模型之前（那时中转站还留作链尾兜底）。
     * 用户明确「不用保留中转站作为兜底」之后，兜底链上不该再有任何非 VOD 模型 ——
     * 只要混进一个，它就会在所有 VOD 模型失败后被调用，
     * 「纯直连」的承诺就存在一个隐蔽的逃逸口。
     */
    expect(IMAGE_MODEL_PRIORITY_IDS.length).toBeGreaterThan(0);
    for (const id of IMAGE_MODEL_PRIORITY_IDS) {
      expect(isVodModelId(id), `${id} 不是 VOD 模型，却混在 auto 兜底链里`).toBe(true);
      expect(id.startsWith("vod-"), `${id} 不是 vod- 前缀`).toBe(true);
    }
  });

  it("每个 image2.5 档位都有计费策略，不得静默漏计费", () => {
    for (const id of OG25_IDS) {
      const policy = getAiImageModelCreditPolicy(id);
      expect(policy, `${id} 缺少计费策略，会被当成 0 成本`).toBeTruthy();
      expect(policy!.creditsPerImage).toBeGreaterThan(0);
      expect(policy!.estimatedCostPerImage).toBeGreaterThan(0);
    }
  });

  it("image2.5 medium 必须比 image2 更便宜", () => {
    /**
     * 切换的核心动机就是降本；若哪天定价倒挂，这条会立刻报警。
     *
     * 对照组从 `og-image2-medium`（中转站，已于 09-12 下线并从计费表移除）
     * 换成 `vod-og`（同一个 image2 模型的 VOD 直连版本）。
     * 不能再用退役 id 做对照：getAiImageModelCreditPolicy 会把它归一化到
     * vod-og25-sunburst-medium，等于拿自己跟自己比，断言恒假。
     */
    const next = getAiImageModelCreditPolicy("vod-og25-sunburst-medium");
    const previous = getAiImageModelCreditPolicy("vod-og");
    expect(next!.estimatedCostPerImage).toBeLessThan(previous!.estimatedCostPerImage);
  });

  it("退役的中转站 id 查计费时必须命中迁移目标，不能落空", () => {
    /**
     * 历史订单、历史作品记录里存的是旧 id。
     * 若 getAiImageModelCreditPolicy 对它们返回 undefined，
     * quoteAiUsage 会回落到通用 baseCredits —— 计费与真实成本脱钩，
     * 且不会报错，属于最难发现的那类静默漏计费。
     */
    const migrations: Record<string, string> = {
      "og-image2-low": "vod-og25-sunburst-low",
      "og-image2-medium": "vod-og25-sunburst-medium",
      "og-image2-high": "vod-og25-sunburst-high",
      "gemini-3.5-flash-preview": "vod-gem-lite",
      "jimeng-4.0": "vod-jimeng",
      "mj-v7": "vod-mj",
      "mj-v8.1": "vod-mj",
      "keling": "vod-kling",
    };
    for (const [legacyId, targetId] of Object.entries(migrations)) {
      const legacy = getAiImageModelCreditPolicy(legacyId);
      const target = getAiImageModelCreditPolicy(targetId);
      expect(target, `${targetId} 缺少计费策略`).toBeTruthy();
      expect(legacy, `${legacyId} 查不到计费策略，会被当成 0 成本`).toBeTruthy();
      expect(legacy!.creditsPerImage).toBe(target!.creditsPerImage);
      expect(legacy!.estimatedCostPerImage).toBe(target!.estimatedCostPerImage);
    }
  });

  it("sunburst 与 flare 同档同价", () => {
    // 腾讯报价单明确两系价格相同，计费表若写歪会导致同档收费不一致。
    for (const tier of ["low", "medium", "high"]) {
      const sunburst = getAiImageModelCreditPolicy(`vod-og25-sunburst-${tier}`);
      const flare = getAiImageModelCreditPolicy(`vod-og25-flare-${tier}`);
      expect(flare!.creditsPerImage).toBe(sunburst!.creditsPerImage);
      expect(flare!.estimatedCostPerImage).toBe(sunburst!.estimatedCostPerImage);
    }
  });
});
