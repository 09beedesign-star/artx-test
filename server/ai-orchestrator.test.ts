import { describe, expect, it, vi } from "vitest";
import { AIOrchestrator, __testResolveImageEditReferences } from "./ai-orchestrator";

describe("AI orchestrator source-preserving edits", () => {
  it("does not duplicate the primary image as a smart copy reference", () => {
    const fallbackReferences = [{ src: "data:image/png;base64,source" }];

    expect(__testResolveImageEditReferences({ operation: "text_edit" }, fallbackReferences))
      .toEqual([]);
    expect(__testResolveImageEditReferences({ operation: "edit" }, fallbackReferences))
      .toEqual(fallbackReferences);
  });
});

describe("AI orchestrator meitu provider passthrough", () => {
  it("forwards provider/promptPos from the request into editImageWithPrompt (annotation_edit)", async () => {
    const spy = vi.spyOn(await import("./image-generation"), "editImageWithPrompt");
    spy.mockResolvedValue({ images: [{ src: "data:image/png;base64,edited", width: 64, height: 64 }] });

    const orchestrator = new AIOrchestrator();
    await orchestrator.run({
      capability: "image_edit",
      operation: "annotation_edit",
      imageSrc: "data:image/png;base64,source",
      maskSrc: "data:image/png;base64,mask",
      prompt: "把帽子换成红色",
      provider: "meitu",
      promptPos: "把帽子换成红色",
      preserveSource: true,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const callArgs = spy.mock.calls[0][0];
    expect(callArgs.provider).toBe("meitu");
    expect(callArgs.promptPos).toBe("把帽子换成红色");
    expect(callArgs.operation).toBe("annotation_edit");
  });

  it("leaves provider undefined when the request does not set it (default gpt path unchanged)", async () => {
    const spy = vi.spyOn(await import("./image-generation"), "editImageWithPrompt");
    spy.mockResolvedValue({ images: [{ src: "data:image/png;base64,edited", width: 64, height: 64 }] });

    const orchestrator = new AIOrchestrator();
    await orchestrator.run({
      capability: "image_edit",
      operation: "annotation_edit",
      imageSrc: "data:image/png;base64,source",
      maskSrc: "data:image/png;base64,mask",
      prompt: "把帽子换成红色",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].provider).toBeUndefined();
    expect(spy.mock.calls[0][0].promptPos).toBeUndefined();
  });
});
