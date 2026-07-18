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
      "gemini-3.1-flash-image",
      "gpt-image-2-4k",
    ]);
    expect(options.find(option => option.id === "gpt-image-2-4k")).toMatchObject({
      label: "gpt-image-2-4k",
    });
    expect(options.some(option => option.id === "gpt-5.4-mini")).toBe(false);
    expect(IMAGE_AI_MODEL_OPTIONS.some(option => option.id === "gpt-image-2")).toBe(true);
  });
});
