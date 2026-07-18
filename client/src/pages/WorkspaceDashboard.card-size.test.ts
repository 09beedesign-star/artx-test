import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WorkspaceDashboard card sizing", () => {
  it("keeps the create-card frame aligned with project cards", () => {
    const source = readFileSync(resolve(__dirname, "WorkspaceDashboard.tsx"), "utf8");
    const createCardBlock = source.match(/function CreateProjectCard[\s\S]*?\/\/ ── Main Page/)?.[0];

    expect(createCardBlock).toBeTruthy();
    expect(createCardBlock).toContain('style={{ aspectRatio: "4/3" }}');
    expect(createCardBlock).toContain('className="px-3 py-2.5"');
    expect(createCardBlock).toContain('minHeight: 42');
    expect(createCardBlock).not.toContain('aspectRatio: "1 / 1"');
  });
});
