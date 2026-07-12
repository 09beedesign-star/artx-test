import { describe, expect, it } from "vitest";
import {
  CROSS_BORDER_CATEGORIES,
  CROSS_BORDER_COMMERCE_VERSION,
  CROSS_BORDER_MARKETS,
  CROSS_BORDER_TEMPLATES,
} from "../../../shared/cross-border-commerce-agent";
import {
  createDefaultCommerceSelection,
  getCommercePlatformOptions,
  getCompatibleCommerceTemplates,
  getMarketsForCommercePlatform,
  repairCommerceSelection,
  ratioFromCommerceSize,
  riskActionLabel,
  scaleCommerceOutputSize,
  type CommerceMarketsResponse,
} from "./cross-border-commerce";

const data: CommerceMarketsResponse = {
  version: CROSS_BORDER_COMMERCE_VERSION,
  markets: CROSS_BORDER_MARKETS,
  categories: CROSS_BORDER_CATEGORIES,
  templates: CROSS_BORDER_TEMPLATES,
  governance: { reviewCadence: "monthly", disclaimer: "test" },
};

describe("cross-border commerce client selection", () => {
  it("defaults to Amazon US with a compatible placement and template", () => {
    expect(createDefaultCommerceSelection(data)).toMatchObject({
      platformId: "amazon",
      marketId: "us",
      categoryId: "beauty_personal_care",
      placementId: "product_main",
      templateId: "white_main",
    });
  });

  it("lists eight unique platforms and markets supported by a platform", () => {
    expect(getCommercePlatformOptions(data).map(item => item.id)).toEqual([
      "amazon",
      "shopee",
      "tiktok_shop",
      "lazada",
      "douyin",
      "xiaohongshu",
      "taobao_tmall",
      "jd",
    ]);
    expect(getMarketsForCommercePlatform(data, "shopee").map(item => item.id)).toEqual([
      "br",
      "mx",
      "id",
      "th",
      "vn",
      "sg",
      "ph",
    ]);
  });

  it("repairs downstream choices when the platform changes", () => {
    const repaired = repairCommerceSelection(data, {
      platformId: "xiaohongshu",
      marketId: "us",
      categoryId: "consumer_electronics",
      placementId: "product_main",
      templateId: "white_main",
    });

    expect(repaired).toEqual({
      platformId: "xiaohongshu",
      marketId: "cn",
      categoryId: "consumer_electronics",
      placementId: "short_video_cover",
      templateId: "ugc_review",
    });
  });

  it("filters templates by both platform and placement", () => {
    expect(
      getCompatibleCommerceTemplates(data, "shopee", "campaign_banner").map(
        item => item.id
      )
    ).toEqual(["promotion_event"]);
    expect(
      getCompatibleCommerceTemplates(data, "xiaohongshu", "short_video_cover").map(
        item => item.id
      )
    ).toEqual(["ugc_review", "lifestyle_seed", "checklist_compare"]);
  });

  it("derives stable ratios and user-facing risk labels", () => {
    expect(ratioFromCommerceSize(1200, 628)).toBe("16:9");
    expect(ratioFromCommerceSize(1080, 1440)).toBe("3:4");
    expect(ratioFromCommerceSize(1080, 1920)).toBe("9:16");
    expect(scaleCommerceOutputSize(1200, 628, "2k")).toEqual({
      width: 2048,
      height: 1072,
    });
    expect(scaleCommerceOutputSize(1080, 1440, "4k")).toEqual({
      width: 2880,
      height: 3840,
    });
    expect(riskActionLabel("pass")).toBe("检查通过");
    expect(riskActionLabel("rewrite")).toBe("需要改写");
    expect(riskActionLabel("block")).toBe("阻止生成");
  });
});
