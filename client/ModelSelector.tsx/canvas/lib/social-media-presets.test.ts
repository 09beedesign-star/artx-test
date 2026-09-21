import { describe, expect, it } from "vitest";
import {
  SOCIAL_MEDIA_SIZE_PRESETS,
  getSocialMediaPresetCategory,
  groupSocialMediaSizePresets,
} from "./social-media-presets";

describe("social media size presets", () => {
  it("groups cover sizes into ecommerce, social, and content/video categories", () => {
    const categories = groupSocialMediaSizePresets().map(item => item.category);

    expect(categories).toEqual(["电商类", "社媒平台类", "内容/视频平台类"]);
  });

  it("keeps cross-border ecommerce presets under ecommerce", () => {
    const tiktokShop = SOCIAL_MEDIA_SIZE_PRESETS.find(
      preset => preset.id === "tiktok-shop-product-square"
    );
    const facebookShopping = SOCIAL_MEDIA_SIZE_PRESETS.find(
      preset => preset.id === "facebook-shopping-product-square"
    );

    expect(tiktokShop).toBeTruthy();
    expect(facebookShopping).toBeTruthy();
    expect(getSocialMediaPresetCategory(tiktokShop!)).toBe("电商类");
    expect(getSocialMediaPresetCategory(facebookShopping!)).toBe("电商类");
  });
});
