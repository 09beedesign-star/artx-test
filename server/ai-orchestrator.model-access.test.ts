import { describe, expect, it } from "vitest";
import { inferAiCapability } from "./ai-orchestrator";

describe("AI orchestration model access routing", () => {
  it("classifies automatic image requests as text-to-image before access checks", () => {
    expect(inferAiCapability({ intent: "generate a product poster image" })).toBe("text_to_image");
    expect(inferAiCapability({ prompt: "hello" })).toBe("chat");
  });

  it("rejects an unsupported explicit capability instead of falling through to image generation", () => {
    expect(() => inferAiCapability({ capability: "unknown" as never, model: "gpt-image-2" }))
      .toThrow("Unsupported AI capability");
  });
});
