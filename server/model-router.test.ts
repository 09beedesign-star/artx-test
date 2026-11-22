import { describe, expect, it } from "vitest";
import {
  isSelectableModel,
  listAvailableModels,
  listSelectableModelIds,
  normalizeAllowedModels,
  resolveModelRoute,
} from "./model-router";
import { DEFAULT_TEXT_MODEL, SELECTABLE_TEXT_MODEL_IDS } from "../shared/text-models";
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
      // 三级当前文本型号全部开放手动选择。
      text: [...SELECTABLE_TEXT_MODEL_IDS],
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
    // 历史文本模型只用于迁移识别，不再出现在可执行 / 可选清单里。
    expect(isSelectableModel("gpt-5.4-mini")).toBe(false);
    expect(isSelectableModel("claude-opus-5")).toBe(false);
    expect(listSelectableModelIds()).toEqual([...expectedPriority, ...SELECTABLE_TEXT_MODEL_IDS]);
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
    for (const legacy of ["gpt-5.4", "gpt-5.5", "gpt-4o", "claude-opus-5", "claude-sonnet-5"]) {
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

  it.each(SELECTABLE_TEXT_MODEL_IDS)("当前型号 %s 保留在文本路由和白名单中", (model) => {
    expect(isSelectableModel(model)).toBe(true);
    expect(normalizeAllowedModels([` ${model} `, model])).toEqual([model]);
    for (const capability of ["chat", "brand_kit_parse"] as const) {
      expect(resolveModelRoute(capability, ` ${model} `)).toEqual({ capability, model, provider: "text" });
    }
  });

  it("三级文本型号白名单去重后保持注册表顺序", () => {
    expect(normalizeAllowedModels([...SELECTABLE_TEXT_MODEL_IDS].reverse().concat([...SELECTABLE_TEXT_MODEL_IDS])))
      .toEqual([...SELECTABLE_TEXT_MODEL_IDS]);
  });

  it.each([undefined, "", "auto", " AUTO ", "unknown", "claude-opus-5", "gpt-4o", DEFAULT_IMAGE_MODEL_ID])(
    "文本路由对自动、历史及无效型号 %s 默认 Luna", (model) => {
      for (const capability of ["chat", "brand_kit_parse"] as const) {
        expect(resolveModelRoute(capability, model)).toEqual({ capability, model: DEFAULT_TEXT_MODEL, provider: "text" });
      }
    },
  );

  it("品牌包理解与聊天默认走 Luna 文本路由而非图片路由", () => {
    // 回归防护：品牌包解析走的是多模态理解（读图），不是图片生成，
    // 必须落在文本模型上；若被误判成图片能力会直接把图片模型发给 /chat/completions。
    expect(resolveModelRoute("chat").model).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveModelRoute("brand_kit_parse").model).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveModelRoute("chat", "unknown-text-model").model).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveModelRoute("chat", "auto").model).toBe(DEFAULT_TEXT_MODEL);
  });
});

describe("model router image priority", () => {
  it.each(SELECTABLE_TEXT_MODEL_IDS)("文本型号 %s 不进入图片能力路由", (model) => {
    for (const capability of ["text_to_image", "image_edit", "image_expansion", "background_removal", "element_erasure"] as const) {
      expect(resolveModelRoute(capability, model)).toEqual({ capability, model: DEFAULT_IMAGE_MODEL_ID, provider: "image" });
    }
  });

  it.each(IMAGE_MODEL_PRIORITY_IDS)("合法图片型号 %s 在图片能力路由中仍保留", (model) => {
    expect(resolveModelRoute("image_edit", model)).toEqual({ capability: "image_edit", model, provider: "image" });
  });

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
