import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CROSS_BORDER_CATEGORIES,
  CROSS_BORDER_MARKETS,
  CROSS_BORDER_TEMPLATES,
  composeCrossBorderCommerceContext,
  evaluateCrossBorderCommerceRisk,
  getAvailableCrossBorderPlatforms,
} from "../shared/cross-border-commerce-agent";

describe("cross-border commerce visual agent", () => {
  it("exposes the eight required commerce platforms through market packages", () => {
    const platformLabels = new Set(
      CROSS_BORDER_MARKETS.flatMap(market =>
        getAvailableCrossBorderPlatforms(market.id).map(platform => platform.label)
      )
    );

    expect(platformLabels).toEqual(
      new Set([
        "Amazon",
        "Shopee",
        "TikTok Shop",
        "Lazada",
        "抖音",
        "小红书",
        "淘宝 / 天猫",
        "京东",
      ])
    );
    expect(CROSS_BORDER_MARKETS.some(market => market.id === "cn")).toBe(true);
    expect(CROSS_BORDER_CATEGORIES).toHaveLength(6);
  });

  it("composes the required Shopee Indonesia campaign path", () => {
    const context = composeCrossBorderCommerceContext({
      marketId: "id",
      platformId: "shopee",
      placementId: "campaign_banner",
      categoryId: "home_living",
      templateId: "promotion_event",
      productName: "收纳架",
      productFacts: "卖家确认的材质、尺寸与承重信息",
      userPrompt: "明亮本地家居场景，保留活动标题和价格编辑区",
    });

    expect(context.platform.label).toBe("Shopee");
    expect(context.market.label).toBe("印尼");
    expect(context.placement.size).toMatchObject({ width: 1200, height: 628 });
    expect(context.template.label).toBe("大促强转化活动图");
    expect(context.skillId).toBe("commerce-poster-social");
    expect(context.prompt).toContain("not baked into pixels");
  });

  it("supports the China content-commerce path from the same source of truth", () => {
    expect(getAvailableCrossBorderPlatforms("cn").map(platform => platform.id)).toEqual([
      "douyin",
      "xiaohongshu",
      "taobao_tmall",
      "jd",
    ]);

    const context = composeCrossBorderCommerceContext({
      marketId: "cn",
      platformId: "xiaohongshu",
      placementId: "short_video_cover",
      categoryId: "beauty_personal_care",
      templateId: "lifestyle_seed",
      productName: "润肤乳",
      userPrompt: "真实浴室台面，轻商业种草氛围",
    });

    expect(context.placement.size).toMatchObject({ width: 1080, height: 1440 });
    expect(context.template.label).toBe("真实生活种草风");
    expect(context.prompt).toContain("中国大陆");
  });

  it("blocks prohibited content and requires rewrites for unsupported claims", () => {
    const blocked = evaluateCrossBorderCommerceRisk({
      marketId: "id",
      platformId: "shopee",
      placementId: "campaign_banner",
      categoryId: "food_beverage",
      templateId: "promotion_event",
      productName: "啤酒礼盒",
      userPrompt: "清真寺装饰的赌场派对",
    });
    expect(blocked.action).toBe("block");
    expect(blocked.canGenerate).toBe(false);

    const rewrite = evaluateCrossBorderCommerceRisk({
      marketId: "cn",
      platformId: "xiaohongshu",
      placementId: "short_video_cover",
      categoryId: "beauty_personal_care",
      templateId: "lifestyle_seed",
      productName: "瘦身霜",
      userPrompt: "保证瘦 10 斤，临床证明，全网第一",
    });
    expect(rewrite.action).toBe("rewrite");
    expect(rewrite.hits.map(hit => hit.id)).toEqual(
      expect.arrayContaining(["health-beauty-claim", "misleading-commerce-copy"])
    );
  });

  it("keeps every template compatible with at least one placement", () => {
    const placementIds = new Set(
      CROSS_BORDER_MARKETS.flatMap(market =>
        market.platforms.flatMap(platform => platform.placements.map(item => item.id))
      )
    );

    expect(CROSS_BORDER_TEMPLATES).toHaveLength(7);
    for (const template of CROSS_BORDER_TEMPLATES) {
      expect(template.allowedPlacements.some(id => placementIds.has(id))).toBe(true);
      expect(template.keywords.length).toBeGreaterThan(0);
    }
  });

  it("keeps smart commerce output at nine while batching through the existing provider limit", () => {
    const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf8");

    expect(source).toContain("const MAX_SMART_COMMERCE_IMAGE_COUNT = 9");
    expect(source).toContain("const PROVIDER_IMAGE_BATCH_SIZE = 4");
    expect(source).toContain("await getSkill(input.skillId)");
    expect(source).toContain("__testNormalizeGeneratedImagesToTargetAspect(");
  });
});
