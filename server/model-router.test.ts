import { describe, expect, it } from "vitest";
import {
  isSelectableModel,
  listAvailableModels,
  listSelectableModelIds,
  normalizeAllowedModels,
  resolveModelRoute,
} from "./model-router";

const expectedPriority = [
  "og-image2-medium",
  "gemini-3.5-flash-preview",
  "jimeng-4.0",
  "mj-v7",
  "mj-v8.1",
  "keling",
  "og-image2-high",
  "og-image2-low",
];

describe("selectable model catalog", () => {
  it("normalizes only models exposed in the frontend picker", () => {
    expect(listAvailableModels()).toEqual({
      image: expectedPriority,
      text: expect.arrayContaining(["gpt-5.4-mini", "gpt-5.5"]),
    });
    expect(normalizeAllowedModels([
      "og-image2-medium",
      "mj-v7",
      "gpt-5.4-mini",
      "picwish-scale",
      "not-a-model",
      "gpt-5.4-mini",
    ])).toEqual(["og-image2-medium", "mj-v7", "gpt-5.4-mini"]);
  });

  it("excludes fixed backend function models from user model access", () => {
    expect(isSelectableModel("og-image2-medium")).toBe(true);
    expect(isSelectableModel("gpt-image-2")).toBe(false);
    expect(isSelectableModel("gpt-4o")).toBe(false);
    expect(isSelectableModel("picwish-scale")).toBe(false);
    expect(listSelectableModelIds()).toEqual([...expectedPriority, "gpt-5.4-mini"]);
    expect(listSelectableModelIds()).not.toContain("gpt-image-2");
    expect(listSelectableModelIds()).not.toContain("gpt-4o");
    expect(listSelectableModelIds()).not.toContain("picwish-scale");
  });
});

describe("model router image priority", () => {
  it("uses image2 medium as the default image model instead of the retired gpt-image-2", () => {
    expect(resolveModelRoute("text_to_image").model).toBe("og-image2-medium");
    expect(resolveModelRoute("image_edit", "auto").model).toBe("og-image2-medium");
    expect(resolveModelRoute("text_to_image", "unknown-image-model").model).toBe("og-image2-medium");
  });

  it("keeps the available image models ordered by the default fallback priority", () => {
    expect(listAvailableModels().image).toEqual(expectedPriority);
  });
});
