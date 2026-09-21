import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InfiniteCanvas copy regression", () => {
  const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

  it("keeps image copying enabled while adding text, artboard, and shape copy support", () => {
    expect(source).toContain('const CROSS_CANVAS_COPY_TYPES = [');
    expect(source).toContain('"asset"');
    expect(source).toContain('"canvasFrame"');
    expect(source).toContain('"shape"');
    expect(source).toContain('"freehand"');
    expect(source).toContain('"text"');
  });

  it("still bakes visible image pixels before cross-canvas copy", () => {
    expect(source).toContain("bakeVisibleAssetNodeForCopy");
    expect(source).toContain(
      "Promise.all(nodesToCopy.map(node => bakeVisibleAssetNodeForCopy(node)))"
    );
  });

  it("uses the shared copy filter for keyboard shortcuts and Alt drag duplication", () => {
    expect(source).toContain("nodes.some(n => n.id === id && isCrossCanvasCopyNode(n))");
    expect(source).toContain("isCrossCanvasCopyNode(node)");
    expect(source).toContain("selectedNodeIds");
    expect(source).toContain("e.key.toLowerCase() === \"c\"");
  });
});
