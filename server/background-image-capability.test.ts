import { describe, expect, it } from "vitest";
import { resolveBackgroundImageTaskCapability } from "./background-image-capability";

describe("background image task capability", () => {
  it("defaults omitted capability to text-to-image", () => {
    expect(resolveBackgroundImageTaskCapability({})).toBe("text_to_image");
  });

  it("rejects unknown capability before a task can be reserved", () => {
    expect(() => resolveBackgroundImageTaskCapability({ capability: "unknown" }))
      .toThrow("Unsupported background image task capability");
  });
});
