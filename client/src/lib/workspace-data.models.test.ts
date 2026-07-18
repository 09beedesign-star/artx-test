import { describe, expect, it } from "vitest";
import { IMAGE_AI_MODEL_OPTIONS, mergeImageAiModelOptions } from "./workspace-data";

describe("workspace image model options", () => {
  it("merges discovered image models into the shared selector options", () => {
    const options = mergeImageAiModelOptions([
      { id: "gpt-image-2", label: "gpt-image-2", color: "server-color" },
      { id: "gpt-image-2-4k", label: "gpt-image-2-4k", color: "server-color" },
      { id: "gemini-3.1-flash-image", label: "gemini-3.1-flash-image", color: "server-color" },
      { id: "gpt-5.4-mini", label: "GPT text", color: "server-color" },
    ]);

    expect(options[0]).toMatchObject({ id: "auto" });
    expect(options.map(option => option.id)).toEqual([
      "auto",
      "gpt-image-2",
      "gpt-image-2-4k",
      "gemini-3.1-flash-image",
    ]);
    expect(options.find(option => option.id === "gpt-image-2-4k")).toMatchObject({
      label: "gpt-image-2-4k",
    });
    expect(options.some(option => option.id === "gpt-5.4-mini")).toBe(false);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "gpt-image-2")).toBe(true);
  });

  it("uses discovered image models as the selector source when the provider returns a catalog", () => {
    const options = mergeImageAiModelOptions([
      { id: "gemini-3.5-flash-preview", label: "gemini-3.5-flash-preview", color: "server-color" },
      { id: "og-image2-low", label: "image2 low", color: "server-color", description: "低价快速稿", icon: "image2" },
      { id: "og-image2-medium", label: "image2 medium", color: "server-color", description: "中价均衡稳", icon: "image2" },
      { id: "og-image2-high", label: "image2 high", color: "server-color", description: "高价高清强", icon: "image2" },
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
      description: "低价快速稿",
      icon: "image2",
    });
  });
});
