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

/**
 * 2026-09-13：美图通道整体下线后，原来那组「provider/promptPos 透传」测试没了意义
 * ——它锁的是一条**恒不命中**的参数链（前端硬编码 provider:"meitu" → orchestrator
 * 透传 → 后端 provider==="meitu" 分支恒假）。删除通道时这两个字段一并移除。
 *
 * 这里换成反向约束：annotation_edit 仍然要正常走到 editImageWithPrompt，
 * 但**不允许**再把 provider/promptPos 这类供应商专属字段透传下去。
 */
describe("AI orchestrator annotation_edit passthrough", () => {
  it("reaches editImageWithPrompt without resurrecting vendor-specific fields", async () => {
    const spy = vi.spyOn(await import("./image-generation"), "editImageWithPrompt");
    spy.mockResolvedValue({ images: [{ src: "data:image/png;base64,edited", width: 64, height: 64 }] });

    const orchestrator = new AIOrchestrator();
    await orchestrator.run({
      capability: "image_edit",
      operation: "annotation_edit",
      imageSrc: "data:image/png;base64,source",
      maskSrc: "data:image/png;base64,mask",
      prompt: "把帽子换成红色",
      preserveSource: true,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const callArgs = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.operation).toBe("annotation_edit");
    expect(callArgs).not.toHaveProperty("provider");
    expect(callArgs).not.toHaveProperty("promptPos");
  });
});
