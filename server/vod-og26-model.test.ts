import { describe, expect, it } from "vitest";
import {
  __testResolveModelAndVersion,
  buildVodDeliverableExtInfo,
  isVodDeliverableCapableModel,
  resolveVodGifSize,
} from "./tencent-vod-aigc";
import { __testBuildImageModelCatalog } from "./image-generation";
import {
  IMAGE_MODEL_PRIORITY_IDS,
  isImage26ModelId,
  isSupportedImageModelId,
  isVodModelId,
  normalizeImageModelId,
} from "../shared/image-models";
import {
  getAiImageModelCreditPolicy,
  IMAGE_DELIVERABLE_BILLING,
  applyImageDeliverableBilling,
} from "../shared/ai-credit-policy";
import {
  resolveImageDeliverable,
  detectImageDeliverableFromPrompt,
} from "../shared/image-deliverable";
import { IMAGE_AI_MODEL_OPTIONS } from "../client/src/lib/workspace-data";

/**
 * image2.6 接入（2026-10-20）。腾讯侧 ModelName=OG、ModelVersion=image2.6_*。
 *
 * 关键风险（同 gg36 教训）：
 *  - resolveModelName 默认兜底是 GEM，漏掉 og 分支会把请求发成 GEM。
 *  - 6 个变体（sunburst/flare × low/medium/high）必须全部注册。
 *  - SVG / GIF 交付物 ExtInfo 格式已由生产探针验证，改之前看注释。
 */
describe("vod-og26（image2.6）模型注册", () => {
  it("发给腾讯的是 OG / image2.6_*，而不是兜底的 GEM", () => {
    expect(__testResolveModelAndVersion("vod-og26-sunburst-low")).toEqual({
      modelName: "OG",
      modelVersion: "image2.6_sunburst_low",
    });
    expect(__testResolveModelAndVersion("vod-og26-sunburst-medium")).toEqual({
      modelName: "OG",
      modelVersion: "image2.6_sunburst_medium",
    });
    expect(__testResolveModelAndVersion("vod-og26-sunburst-high")).toEqual({
      modelName: "OG",
      modelVersion: "image2.6_sunburst_high",
    });
    expect(__testResolveModelAndVersion("vod-og26-flare-low")).toEqual({
      modelName: "OG",
      modelVersion: "image2.6_flare_low",
    });
    expect(__testResolveModelAndVersion("vod-og26-flare-medium")).toEqual({
      modelName: "OG",
      modelVersion: "image2.6_flare_medium",
    });
    expect(__testResolveModelAndVersion("vod-og26-flare-high")).toEqual({
      modelName: "OG",
      modelVersion: "image2.6_flare_high",
    });
  });

  it("不影响既有 gem / gg 族映射", () => {
    expect(__testResolveModelAndVersion("vod-gem")).toEqual({ modelName: "GEM", modelVersion: "3.1" });
    expect(__testResolveModelAndVersion("vod-gg36")).toEqual({ modelName: "GG", modelVersion: "3.6" });
  });

  it("6 个 id 都在注册表中、走 VOD 链路", () => {
    const og26Ids = [
      "vod-og26-sunburst-low",
      "vod-og26-sunburst-medium",
      "vod-og26-sunburst-high",
      "vod-og26-flare-low",
      "vod-og26-flare-medium",
      "vod-og26-flare-high",
    ];
    for (const id of og26Ids) {
      expect(IMAGE_MODEL_PRIORITY_IDS).toContain(id);
      expect(isSupportedImageModelId(id)).toBe(true);
      expect(isVodModelId(id)).toBe(true);
    }
  });

  it("别名可归一（image2.6 → vod-og26-sunburst-medium）", () => {
    expect(normalizeImageModelId("image2.6")).toBe("vod-og26-sunburst-medium");
    expect(normalizeImageModelId("image2.6-medium")).toBe("vod-og26-sunburst-medium");
    expect(normalizeImageModelId("image2.6-low")).toBe("vod-og26-sunburst-low");
    expect(normalizeImageModelId("image2.6-high")).toBe("vod-og26-sunburst-high");
    expect(normalizeImageModelId("image2.6-medium-flare")).toBe("vod-og26-flare-medium");
  });

  it("isImage26ModelId 正确识别 og26 族，排除其他模型", () => {
    expect(isImage26ModelId("vod-og26-sunburst-medium")).toBe(true);
    expect(isImage26ModelId("vod-og26-flare-high")).toBe(true);
    expect(isImage26ModelId("image2.6")).toBe(true);
    expect(isImage26ModelId("vod-gem")).toBe(false);
    expect(isImage26ModelId("vod-gg36")).toBe(false);
    expect(isImage26ModelId(undefined)).toBe(false);
  });
});

describe("vod-og26 计费", () => {
  it("6 个变体都有独立计费条目", () => {
    const og26Ids = [
      "vod-og26-sunburst-low",
      "vod-og26-sunburst-medium",
      "vod-og26-sunburst-high",
      "vod-og26-flare-low",
      "vod-og26-flare-medium",
      "vod-og26-flare-high",
    ];
    for (const id of og26Ids) {
      const policy = getAiImageModelCreditPolicy(id);
      expect(policy?.model).toBe(id);
    }
  });

  it("SVG 交付物加 180 积分", () => {
    const base = { creditsPerImage: 70, costPerImage: 0.078 };
    const result = applyImageDeliverableBilling("svg", base.creditsPerImage, base.costPerImage);
    expect(result.creditsPerImage).toBe(70 + IMAGE_DELIVERABLE_BILLING.svg.creditsSurcharge);
    expect(result.costPerImage).toBe(0.078 + IMAGE_DELIVERABLE_BILLING.svg.costSurcharge);
  });

  it("GIF 交付物 3 倍积分", () => {
    const base = { creditsPerImage: 70, costPerImage: 0.078 };
    const result = applyImageDeliverableBilling("gif", base.creditsPerImage, base.costPerImage);
    expect(result.creditsPerImage).toBe(70 * 3);
    expect(result.costPerImage).toBeCloseTo(0.078 * 3, 5);
  });
});

describe("vod-og26 交付物 ExtInfo", () => {
  it("isVodDeliverableCapableModel 只允许 og26 族", () => {
    expect(isVodDeliverableCapableModel("vod-og26-sunburst-medium")).toBe(true);
    expect(isVodDeliverableCapableModel("vod-og26-flare-high")).toBe(true);
    expect(isVodDeliverableCapableModel("vod-gem")).toBe(false);
    expect(isVodDeliverableCapableModel("vod-gg36")).toBe(false);
  });

  it("SVG ExtInfo 格式与生产探针一致", () => {
    const extInfo = buildVodDeliverableExtInfo("svg");
    const parsed = JSON.parse(extInfo);
    expect(parsed.AdditionalParameters).toBeDefined();
    const params = JSON.parse(parsed.AdditionalParameters);
    expect(params.output_format).toBe("svg");
    expect(params.svg).toEqual({ model: "gpt-5" });
  });

  it("GIF ExtInfo 包含 size 参数", () => {
    const extInfo = buildVodDeliverableExtInfo("gif", "1:1");
    const parsed = JSON.parse(extInfo);
    const params = JSON.parse(parsed.AdditionalParameters);
    expect(params.output_format).toBe("gif");
    expect(params.size).toMatch(/^\d+x\d+$/);
  });

  it("resolveVodGifSize 按 aspectRatio 返回合法尺寸", () => {
    // 1:1 正方形 → 512x512（短边 512，腾讯侧实测 1024x1024 ErrCode 70000，≤768 才可过）
    expect(resolveVodGifSize("1:1")).toBe("512x512");
    // 横图 → 768x512
    expect(resolveVodGifSize("16:9")).toBe("768x512");
    // 竖图 → 512x768
    expect(resolveVodGifSize("9:16")).toBe("512x768");
    // 3:2 横图 → 768x512（ratio > 1.1）
    expect(resolveVodGifSize("3:2")).toBe("768x512");
    // 短边不超过 768（所有档位均满足）
    const [w, h] = resolveVodGifSize("3:2").split("x").map(Number);
    expect(Math.min(w, h)).toBeLessThanOrEqual(768);
  });
});

describe("image2.6 提示词关键词检测", () => {
  it("detectImageDeliverableFromPrompt 识别中文关键词", () => {
    expect(detectImageDeliverableFromPrompt("帮我导出svg")).toBe("svg");
    expect(detectImageDeliverableFromPrompt("生成gif动图")).toBe("gif");
    expect(detectImageDeliverableFromPrompt("矢量化这张图")).toBe("svg");
  });

  it("detectImageDeliverableFromPrompt 识别英文关键词", () => {
    expect(detectImageDeliverableFromPrompt("export svg please")).toBe("svg");
    expect(detectImageDeliverableFromPrompt("make a gif animation")).toBe("gif");
  });

  it("无关键词时返回 undefined", () => {
    expect(detectImageDeliverableFromPrompt("画一只猫")).toBeUndefined();
  });

  it("resolveImageDeliverable 只对 og26 模型生效", () => {
    expect(resolveImageDeliverable({ model: "vod-og26-sunburst-medium", prompt: "导出svg" })).toBe("svg");
    expect(resolveImageDeliverable({ model: "vod-gem", prompt: "导出svg" })).toBeUndefined();
  });

  it("显式 deliverable 字段优先于提示词检测", () => {
    expect(
      resolveImageDeliverable({ model: "vod-og26-sunburst-medium", deliverable: "gif", prompt: "导出svg" })
    ).toBe("gif");
  });
});

describe("vod-og26 前端注册", () => {
  it("前端选择器与服务端目录都有 6 个变体", async () => {
    const og26Ids = [
      "vod-og26-sunburst-low",
      "vod-og26-sunburst-medium",
      "vod-og26-sunburst-high",
      "vod-og26-flare-low",
      "vod-og26-flare-medium",
      "vod-og26-flare-high",
    ];
    for (const id of og26Ids) {
      const client = IMAGE_AI_MODEL_OPTIONS.find(option => option.id === id);
      expect(client).toBeDefined();
      expect(client!.icon).toBe("openai");
    }
    // mock 中转站 /models 只回无关项：VOD 模型必须靠「目录 ∪ 全部 VOD」那一步进来。
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ id: "gpt-5.4-mini" }] }), { status: 200 })) as typeof fetch;
    const catalog = await __testBuildImageModelCatalog({ apiKey: "k", baseUrl: "https://t.example/v1", fetchImpl });
    for (const id of og26Ids) {
      const server = catalog.image.find(option => option.id === id);
      expect(server).toBeDefined();
      const client = IMAGE_AI_MODEL_OPTIONS.find(option => option.id === id);
      expect(server!.label).toBe(client!.label);
      expect(server!.description).toBe(client!.description);
    }
  });
});
