import { describe, expect, it } from "vitest";
import { resolveBackgroundImageTaskCapability } from "./background-image-capability";

describe("background image task capability", () => {
  it("defaults omitted capability to text-to-image", () => {
    expect(resolveBackgroundImageTaskCapability({})).toBe("text_to_image");
  });

  it("allows the element-background layer worker used by canvas layer editing", () => {
    expect(resolveBackgroundImageTaskCapability({ capability: "element_background" }))
      .toBe("element_background");
  });

  it("rejects unknown capability before a task can be reserved", () => {
    expect(() => resolveBackgroundImageTaskCapability({ capability: "unknown" }))
      .toThrow("Unsupported background image task capability");
  });
});
