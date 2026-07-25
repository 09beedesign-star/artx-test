import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InfiniteCanvas layer separation", () => {
  it("places foreground and background outputs horizontally with a 10px gap", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const layerBlock = source.match(/if \(action === "edit-elements"\) \{[\s\S]*?if \(action === "move-object"\)/)?.[0];

    expect(layerBlock).toBeTruthy();
    expect(layerBlock).toContain("const layerGap = 10");
    expect(layerBlock).toContain("const baseX = assetNode.position.x + sourceSize.width + layerGap");
    expect(layerBlock).toContain("const foregroundPosition = splittingPosition");
    expect(layerBlock).toContain("x: foregroundPosition.x + layerW + layerGap");
    expect(layerBlock).toContain("y: foregroundPosition.y");
    expect(layerBlock).toContain("placement: foregroundPosition");
    expect(layerBlock).toContain("placement: backgroundPosition");
    expect(layerBlock).not.toContain("splittingPosition.y + sourceSize.height + 28");
  });
});
