import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("image generator popover layout", () => {
  it("keeps the prompt hint and pins the right-side controls to the input bottom", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const block = source.match(
      /function ImageGeneratorPopover[\s\S]*?(?=\ntype FontDesignPurpose)/
    )?.[0];

    expect(block).toBeTruthy();
    expect(block).toContain('className="fixed flex flex-col overflow-hidden');
    expect(block).toContain('className="flex min-h-0 min-w-0 flex-col"');
    expect(block).toContain('className="mt-auto pt-3"');
    expect(block).toContain("Enter 生成 · Shift+Enter 换行");
    expect(block).not.toContain("/500");
  });
});
