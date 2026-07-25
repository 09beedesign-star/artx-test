import { describe, expect, it } from "vitest";
import { assertUserCanUseSelectableModel } from "./user-model-access";

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
      allowedAiModels: ["og-image2-medium"],
    }, "auto", "text_to_image")).not.toThrow();
  });

  it("allows a user with no explicit allowlist to use every selectable model", () => {
    expect(() => assertUserCanUseSelectableModel({}, "mj-v7", "text_to_image")).not.toThrow();
    expect(() => assertUserCanUseSelectableModel({}, "gpt-5.4-mini", "text_generation")).not.toThrow();
  });
});
