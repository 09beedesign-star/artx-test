import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drag node into grouped canvas", () => {
  it("uses a 500ms dwell before assigning groupId and flashes the group border", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("GROUP_MERGE_HOVER_MS = 500");
    expect(source).toContain("groupMergeHoverTimerRef");
    expect(source).toContain("clearGroupMergeHover");
    expect(source).toContain("window.clearTimeout(groupMergeHoverTimerRef.current)");
    expect(source).toContain("setTimeout");
    expect(source).toContain("groupMergeFlashId");
    expect(source).toContain("artx-group-merge-flash 0.8s ease-in-out 2");
    expect(source).toContain("groupId: targetGroupId");
    expect(source).toContain('type === "shape"');
    expect(source).toContain('type === "asset"');
  });
});
