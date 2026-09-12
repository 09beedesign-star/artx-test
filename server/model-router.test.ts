import { describe, expect, it } from "vitest";
import {
  isSelectableModel,
  listAvailableModels,
  listSelectableModelIds,
  normalizeAllowedModels,
  resolveModelRoute,
} from "./model-router";
import { DEFAULT_TEXT_MODEL } from "../shared/text-models";
import { DEFAULT_IMAGE_MODEL_ID, IMAGE_MODEL_PRIORITY_IDS } from "../shared/image-models";

/**
 * 直接引用注册表，**不要在测试里手抄一份清单**。
 *
 * 手抄过一次，代价是每次增删模型都要同步改测试，
 * 而漏改时测试失败的原因看起来像「功能坏了」，实际只是清单过期。
 * 这里只断言「路由输出 == 注册表」这个不变量，清单内容本身由注册表定义。
 *
 * 2026-09-12：中转站图片模型整体下线，注册表已只剩 vod-* 模型。
 */
const expectedPriority = [...IMAGE_MODEL_PRIORITY_IDS];

describe("selectable model catalog", () => {
  it("normalizes only models exposed in the frontend picker", () => {
    expect(listAvailableModels()).toEqual({
      image: expectedPriority,
      // 文本白名单仍保留 GPT 系列，只为兼容历史请求参数；
      // 用户可选项已切到 claude-opus-5（见下一个用例）。
      text: expect.arrayContaining([DEFAULT_TEXT_MODEL, "gpt-5.5"]),
    });
    expect(normalizeAllowedModels([
      DEFAULT_IMAGE_MODEL_ID,
      "vod-mj",
      DEFAULT_TEXT_MODEL,
      "picwish-scale",
      "not-a-model",
      DEFAULT_TEXT_MODEL,
    ])).toEqual([DEFAULT_IMAGE_MODEL_ID, "vod-mj", DEFAULT_TEXT_MODEL]);
  });

  it("excludes fixed backend function models from user model access", () => {
    expect(isSelectableModel(DEFAULT_IMAGE_MODEL_ID)).toBe(true);
    expect(isSelectableModel("gpt-image-2")).toBe(false);
    expect(isSelectableModel("gpt-4o")).toBe(false);
    expect(isSelectableModel("picwish-scale")).toBe(false);
    // 文本模型切到 claude-opus-5 后，旧的 gpt-5.4-mini 不再是「可选项」，
    // 它只留在 SUPPORTED 白名单里做历史参数兼容。
    expect(isSelectableModel("gpt-5.4-mini")).toBe(false);
    expect(listSelectableModelIds()).toEqual([...expectedPriority, DEFAULT_TEXT_MODEL]);
    expect(listSelectableModelIds()).not.toContain("gpt-image-2");
    expect(listSelectableModelIds()).not.toContain("gpt-4o");
    expect(listSelectableModelIds()).not.toContain("picwish-scale");
  });

  it("migrates a legacy GPT allowlist entry instead of dropping it", () => {
    // 这是存量账号不失效的**真正**防线。
    // auth-store.ts 在读取磁盘数据时（:373）就会调用 normalizeAllowedModels，
    // 若这里把旧 id 直接丢弃，用户白名单里就只剩图片模型，
    // 后续 user-model-access 的「新旧互认」根本拿不到旧 id，必然误判为无权限。
    expect(normalizeAllowedModels([DEFAULT_IMAGE_MODEL_ID, "gpt-5.4-mini"]))
      .toEqual([DEFAULT_IMAGE_MODEL_ID, DEFAULT_TEXT_MODEL]);
    for (const legacy of ["gpt-5.4", "gpt-5.5", "gpt-4o"]) {
      expect(normalizeAllowedModels([legacy])).toEqual([DEFAULT_TEXT_MODEL]);
    }
    // 迁移只对已知模型生效：未知 id 与后端固定模型仍应被丢弃，不能凭空放大权限。
    expect(normalizeAllowedModels(["not-a-model", "picwish-scale"])).toEqual([]);
    expect(normalizeAllowedModels(["gpt-image-2"])).toEqual([]);
  });

  it("migrates retired relay image models instead of dropping them", () => {
    /**
     * 2026-09-12 中转站图片模型下线后**最关键的一条存量保护**。
     *
     * 若这些旧 id 在归一化阶段被丢弃，白名单里只有它们的账号会得到 `[]`；
     * 而鉴权逻辑中只有 `undefined` 表示「放行全部」，`[]` 表示「一个都不准用」——
     * 该账号会彻底失去出图能力，报错还是误导性的「当前账号无权使用该模型」。
     */
    expect(normalizeAllowedModels(["og-image2-medium"])).toEqual([DEFAULT_IMAGE_MODEL_ID]);
    expect(normalizeAllowedModels(["og-image2-low"])).toEqual(["vod-og25-sunburst-low"]);
    expect(normalizeAllowedModels(["og-image2-high"])).toEqual(["vod-og25-sunburst-high"]);
    expect(normalizeAllowedModels(["jimeng-4.0"])).toEqual(["vod-jimeng"]);
    expect(normalizeAllowedModels(["keling"])).toEqual(["vod-kling"]);
    expect(normalizeAllowedModels(["gemini-3.5-flash-preview"])).toEqual(["vod-gem-lite"]);
    // mj-v7 与 mj-v8.1 都迁移到 vod-mj，去重后只剩一个。
    expect(normalizeAllowedModels(["mj-v7", "mj-v8.1"])).toEqual(["vod-mj"]);
    // 迁移后仍是合法的可选模型，不会在后续鉴权里被判为无权限。
    expect(isSelectableModel("og-image2-medium")).toBe(true);
  });

  it("routes chat and brand-kit capabilities to the claude text model", () => {
    // 回归防护：品牌包解析走的是多模态理解（读图），不是图片生成，
    // 必须落在文本模型上；若被误判成图片能力会直接把图片模型发给 /chat/completions。
    expect(resolveModelRoute("chat").model).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveModelRoute("brand_kit_parse").model).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveModelRoute("chat", "unknown-text-model").model).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveModelRoute("chat", "auto").model).toBe(DEFAULT_TEXT_MODEL);
  });
});

describe("model router image priority", () => {
  it("uses the VOD-direct image2.5 medium as the default image model", () => {
    // 2026-09-11 起默认模型 = vod-og25-sunburst-medium（腾讯 VOD 直连）。
    // 这三种入口（无参 / auto / 未知模型）都必须落到同一个默认值，
    // 否则「不走中转站」的承诺会在某条入口上漏掉。
    expect(resolveModelRoute("text_to_image").model).toBe("vod-og25-sunburst-medium");
    expect(resolveModelRoute("image_edit", "auto").model).toBe("vod-og25-sunburst-medium");
    expect(resolveModelRoute("text_to_image", "unknown-image-model").model).toBe("vod-og25-sunburst-medium");
  });

  it("keeps the available image models ordered by the default fallback priority", () => {
    expect(listAvailableModels().image).toEqual(expectedPriority);
  });
});
