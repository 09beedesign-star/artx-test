import { describe, expect, it } from "vitest";
import { filterAllowedAiModelOptions, resolveAllowedAiModelId } from "./model-access";

const imageModels = [
  { id: "gpt-image-2", label: "GPT image2", color: "blue" },
  { id: "gemini-3.1-flash-image", label: "Nano banana PRO 3.5", color: "green" },
];

describe("frontend AI model access", () => {
  it("keeps every visible model available when no allowlist is saved", () => {
    expect(filterAllowedAiModelOptions(imageModels, undefined)).toEqual(imageModels);
  });

  it("removes disabled models and falls back from a persisted blocked selection", () => {
    const allowed = filterAllowedAiModelOptions(imageModels, ["gemini-3.1-flash-image"]);

    expect(allowed).toEqual([imageModels[1]]);
    expect(resolveAllowedAiModelId("gpt-image-2", allowed)).toBe("gemini-3.1-flash-image");
  });
});
