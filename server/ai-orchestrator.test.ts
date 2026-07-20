import { describe, expect, it } from "vitest";
import { __testResolveImageEditReferences } from "./ai-orchestrator";

describe("AI orchestrator source-preserving edits", () => {
  it("does not duplicate the primary image as a smart copy reference", () => {
    const fallbackReferences = [{ src: "data:image/png;base64,source" }];

    expect(__testResolveImageEditReferences({ operation: "text_edit" }, fallbackReferences))
      .toEqual([]);
    expect(__testResolveImageEditReferences({ operation: "edit" }, fallbackReferences))
      .toEqual(fallbackReferences);
  });
});
