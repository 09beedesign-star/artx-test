import { describe, expect, it } from "vitest";
import {
  isSelectableModel,
  listAvailableModels,
  listSelectableModelIds,
  normalizeAllowedModels,
} from "./model-router";

describe("selectable model catalog", () => {
  it("normalizes only models exposed in the frontend picker", () => {
    expect(listAvailableModels()).toEqual({
      image: expect.arrayContaining(["gpt-image-2", "gemini-3.1-flash-image"]),
      text: expect.arrayContaining(["gpt-5.4-mini", "gpt-5.5"]),
    });
    expect(normalizeAllowedModels([
      "IMAGE2",
      "gpt-5.4-mini",
      "picwish-scale",
      "not-a-model",
      "gpt-5.4-mini",
    ])).toEqual(["gpt-image-2", "gpt-5.4-mini"]);
  });

  it("excludes fixed backend function models from user model access", () => {
    expect(isSelectableModel("gpt-image-2")).toBe(true);
    expect(isSelectableModel("gpt-4o")).toBe(false);
    expect(isSelectableModel("picwish-scale")).toBe(false);
    expect(listSelectableModelIds()).not.toContain("gpt-4o");
    expect(listSelectableModelIds()).not.toContain("picwish-scale");
  });
});
