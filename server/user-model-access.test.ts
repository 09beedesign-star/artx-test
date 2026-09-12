import { describe, expect, it } from "vitest";
import { assertUserCanUseSelectableModel } from "./user-model-access";
import { DEFAULT_TEXT_MODEL } from "../shared/text-models";
import { DEFAULT_IMAGE_MODEL_ID } from "../shared/image-models";

describe("user selectable model access", () => {
  it("rejects a disabled frontend-selectable model", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: ["gpt-5.4-mini"],
    }, "og-image2-medium", "text_to_image")).toThrow("当前账号无权使用该模型");
  });

  it("does not restrict fixed backend function models", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [],
    }, "picwish-scale", "image_enhance")).not.toThrow();
  });

  it("does not restrict a backend-only GPT model", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [],
    }, "gpt-4o", "text_generation")).not.toThrow();
  });

  it("does not restrict a fixed legacy image model", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [],
    }, "gpt-image-2", "image_edit")).not.toThrow();
  });

  it("resolves auto and unknown image requests to the default selectable model before checking access", () => {
    const user = { allowedAiModels: ["gpt-5.4-mini"] };

    expect(() => assertUserCanUseSelectableModel(user, "auto", "text_to_image"))
      .toThrow("当前账号无权使用该模型");
    expect(() => assertUserCanUseSelectableModel(user, "unrecognized-image-model", "image_edit"))
      .toThrow("当前账号无权使用该模型");
  });

  it("allows the canonical fallback when it is enabled", () => {
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [DEFAULT_IMAGE_MODEL_ID],
    }, "auto", "text_to_image")).not.toThrow();
  });

  it("allows a user whose allowlist still holds a retired relay image model", () => {
    /**
     * 存量账号保护：白名单里存的是已下线的中转站 id。
     *
     * 实际运行时 auth-store 读盘就会把它迁移成 vod-* ，
     * 但这里直接传未迁移的原始值，确保鉴权本身也扛得住
     * （例如管理后台直接写入、或历史 API 调用传入旧 id 的场景）。
     */
    expect(() => assertUserCanUseSelectableModel({
      allowedAiModels: [DEFAULT_IMAGE_MODEL_ID],
    }, "og-image2-medium", "text_to_image")).not.toThrow();
  });

  it("allows a user with no explicit allowlist to use every selectable model", () => {
    expect(() => assertUserCanUseSelectableModel({}, "vod-mj", "text_to_image")).not.toThrow();
    expect(() => assertUserCanUseSelectableModel({}, DEFAULT_TEXT_MODEL, "text_generation")).not.toThrow();
  });

  it("honors a legacy GPT text allowlist after the switch to the claude text model", () => {
    // 存量账号的 allowedAiModels 里存的是切换前的 GPT id。
    // 若不做新旧互认，这些账号在切换当天会集体拿到「当前账号无权使用该模型」。
    for (const legacy of ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5", "gpt-4o"]) {
      expect(() => assertUserCanUseSelectableModel(
        { allowedAiModels: [legacy] },
        DEFAULT_TEXT_MODEL,
        "text_generation",
      )).not.toThrow();
    }
  });

  it("does not let a legacy text allowlist unlock image models", () => {
    // 新旧互认必须严格限定在文本模型内部：
    // 只授权过文本模型的账号，不能因此拿到图片模型的使用权。
    expect(() => assertUserCanUseSelectableModel(
      { allowedAiModels: ["gpt-5.4-mini"] },
      "vod-mj",
      "text_to_image",
    )).toThrow("当前账号无权使用该模型");
  });
});
