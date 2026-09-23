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
  getCompatibleCrossBorderTemplates,
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

  it("blocks unavailable templates during risk checks before compose runs", () => {
    const input = {
      marketId: "us" as const,
      platformId: "tiktok_shop" as const,
      placementId: "short_video_cover" as const,
      categoryId: "beauty_personal_care" as const,
      templateId: "lifestyle_showcase" as const,
    };

    const risk = evaluateCrossBorderCommerceRisk(input);
    expect(risk.action).toBe("block");
    expect(risk.canGenerate).toBe(false);
    expect(risk.hits.map(hit => hit.id)).toContain("configuration-unavailable");
    expect(() => composeCrossBorderCommerceContext(input)).toThrow(
      "Template lifestyle_showcase is not available"
    );
  });

  it("keeps every template compatible with at least one placement", () => {
    const placementIds = new Set(
      CROSS_BORDER_MARKETS.flatMap(market =>
        market.platforms.flatMap(platform => platform.placements.map(item => item.id))
      )
    );

    expect(CROSS_BORDER_TEMPLATES).toHaveLength(8);
    for (const template of CROSS_BORDER_TEMPLATES) {
      expect(template.allowedPlacements.some(id => placementIds.has(id))).toBe(true);
      expect(template.keywords.length).toBeGreaterThan(0);
    }
  });

  it("keeps every active market platform placement and category covered by a template", () => {
    for (const market of CROSS_BORDER_MARKETS) {
      for (const platform of getAvailableCrossBorderPlatforms(market.id)) {
        for (const placement of platform.placements) {
          for (const category of CROSS_BORDER_CATEGORIES) {
            expect(
              getCompatibleCrossBorderTemplates({
                marketId: market.id,
                platformId: platform.id,
                placementId: placement.id,
                categoryId: category.id,
              }),
              `${market.label} / ${platform.label} / ${placement.label} / ${category.label}`
            ).not.toEqual([]);
          }
        }
      }
    }
    expect(getAvailableCrossBorderPlatforms("qa")).toEqual([]);
    expect(getAvailableCrossBorderPlatforms("kw")).toEqual([]);
  });

  it("keeps smart commerce output at nine while batching through the existing provider limit", () => {
    const source = readFileSync(resolve(__dirname, "image-generation.ts"), "utf8");

    expect(source).toContain("const MAX_SMART_COMMERCE_IMAGE_COUNT = 9");
    expect(source).toContain("const PROVIDER_IMAGE_BATCH_SIZE = 4");
    expect(source).toContain("__testNormalizeGeneratedImagesToTargetAspect(");
  });

  it("skill 注入发生在编排层，而不是留在出图模块里", () => {
    /**
     * ⚠️ 2026-09-23 断言搬迁：原来这条断言写在上面那个用例里，
     * 在 server/image-generation.ts 里找 `await getSkill(input.skillId)`。
     * 实现后来把 skill 注入上移到了 server/ai-orchestrator.ts，
     * image-generation.ts 只剩一条**没人调用的死导入** —— 断言因此恒红。
     * 📌⭐⭐⭐ 判据：源码断言要跟着实现走。断言红了先查「这段逻辑是不是搬走了」，
     *    搬走了就把断言搬到新位置，顺手删掉旧文件里的死导入，
     *    否则死导入会一直骗人「这里还在用」。
     */
    const orchestrator = readFileSync(resolve(__dirname, "ai-orchestrator.ts"), "utf8");
    // 显式指定 skillId 走精确取用，没指定才按能力+提示词匹配。两条路都不能丢。
    expect(orchestrator).toContain("await getSkill(input.skillId)");
    expect(orchestrator).toContain("await matchSkill(capability, input.prompt)");
    // skill 的提示词必须真的拼进最终提示词，光取出来不用等于没注入。
    // 注意：参数表里还嵌着 brandKitToPrompt(brandKit)，所以不能用 [^)]* 做界定。
    expect(orchestrator).toMatch(/buildPrompt\([^;]*skill\?\.prompt/);

    // 出图模块不该再残留 getSkill 的死导入。
    const imageGeneration = readFileSync(resolve(__dirname, "image-generation.ts"), "utf8");
    expect(imageGeneration).not.toMatch(/import\s*\{\s*getSkill\s*\}\s*from/);
  });
});
