import { describe, expect, it } from "vitest";
import { IMAGE_AI_MODEL_OPTIONS, mergeImageAiModelOptions } from "./workspace-data";

const expectedImageModelDescriptions = {
  "gemini-3.5-flash-preview": "高性价比场景快",
  "jimeng-4.0": "高性价比中文强",
  "mj-v7": "高品质电影质感",
  "mj-v8.1": "极致肖像细节",
  "og-image2-low": "高性价比快速稿",
  "og-image2-medium": "高品质场景稳定",
  "og-image2-high": "极致高清电影感",
};

function expectUserFacingImageModelDescription(description: string | undefined) {
  expect(description).toBeTruthy();
  expect(description).not.toMatch(/[高中低]价/);
  expect(description!.length).toBeLessThanOrEqual(15);
}

describe("workspace image model options", () => {
  it("keeps the fallback selector list aligned with the full image model catalog", () => {
    expect(IMAGE_AI_MODEL_OPTIONS.map(option => option.id)).toEqual([
      "auto",
      "gemini-3.5-flash-preview",
      "jimeng-4.0",
      "mj-v7",
      "mj-v8.1",
      "og-image2-low",
      "og-image2-medium",
      "og-image2-high",
    ]);
    expect(IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "og-image2-low")).toMatchObject({
      label: "image2 low",
      description: "高性价比快速稿",
      icon: "openai",
    });
    for (const [id, description] of Object.entries(expectedImageModelDescriptions)) {
      const option = IMAGE_AI_MODEL_OPTIONS.find(model => model.id === id);
      expect(option?.description).toBe(description);
      expectUserFacingImageModelDescription(option?.description);
    }
    expect(IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "gemini-3.5-flash-preview")).toMatchObject({
      icon: "gemini",
    });
    expect(IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "jimeng-4.0")).toMatchObject({
      icon: "jimeng",
    });
    expect(IMAGE_AI_MODEL_OPTIONS.find(option => option.id === "mj-v7")).toMatchObject({
      icon: "midjourney",
    });
  });

  it("merges discovered image models into the shared selector options", () => {
    const options = mergeImageAiModelOptions([
      { id: "gpt-image-2", label: "gpt-image-2", color: "server-color" },
      { id: "gpt-image-2-4k", label: "gpt-image-2-4k", color: "server-color" },
      { id: "gemini-3.1-flash-image", label: "gemini-3.1-flash-image", color: "server-color" },
      { id: "jimeng-4.0", label: "jimeng-4.0", color: "server-color", description: "高性价比中文强", icon: "jimeng" },
      { id: "gpt-5.4-mini", label: "GPT text", color: "server-color" },
    ]);

    expect(options[0]).toMatchObject({ id: "auto" });
    expect(options.map(option => option.id)).toEqual([
      "auto",
      "jimeng-4.0",
    ]);
    expect(options.find(option => option.id === "jimeng-4.0")).toMatchObject({
      label: "jimeng-4.0",
      description: "高性价比中文强",
      icon: "jimeng",
    });
    expectUserFacingImageModelDescription(options.find(option => option.id === "jimeng-4.0")?.description);
    expect(options.some(option => option.id === "gpt-image-2")).toBe(false);
    expect(options.some(option => option.id === "gpt-image-2-4k")).toBe(false);
    expect(options.some(option => option.id === "gemini-3.1-flash-image")).toBe(false);
    expect(options.some(option => option.id === "gpt-5.4-mini")).toBe(false);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "gpt-image-2")).toBe(false);
  });

  it("uses discovered image models as the selector source when the provider returns a catalog", () => {
    const options = mergeImageAiModelOptions([
      { id: "gemini-3.5-flash-preview", label: "gemini-3.5-flash-preview", color: "server-color" },
      { id: "og-image2-low", label: "image2 low", color: "server-color", description: "高性价比快速稿", icon: "openai" },
      { id: "og-image2-medium", label: "image2 medium", color: "server-color", description: "高品质场景稳定", icon: "openai" },
      { id: "og-image2-high", label: "image2 high", color: "server-color", description: "极致高清电影感", icon: "openai" },
    ]);

    expect(options.map(option => option.id)).toEqual([
      "auto",
      "gemini-3.5-flash-preview",
      "og-image2-low",
      "og-image2-medium",
      "og-image2-high",
    ]);
    expect(options.find(option => option.id === "og-image2-low")).toMatchObject({
      label: "image2 low",
      description: "高性价比快速稿",
      icon: "openai",
    });
    for (const option of options.filter(option => option.id !== "auto" && option.description)) {
      expectUserFacingImageModelDescription(option.description);
    }
  });
});
