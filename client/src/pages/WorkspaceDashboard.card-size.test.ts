import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WorkspaceDashboard card sizing", () => {
  it("keeps the create-card frame aligned with project cards", () => {
    const source = readFileSync(resolve(__dirname, "WorkspaceDashboard.tsx"), "utf8");
    const projectCardBlock = source.match(/function ProjectCard[\s\S]*?\/\/ ── Create Project Card/)?.[0];
    const createCardBlock = source.match(/function CreateProjectCard[\s\S]*?\/\/ ── Main Page/)?.[0];

    expect(projectCardBlock).toBeTruthy();
    expect(createCardBlock).toBeTruthy();
    expect(projectCardBlock).toContain('height: "100%"');
    expect(projectCardBlock).toContain('style={{ minHeight: 52 }}');
    expect(createCardBlock).toContain('height: "100%"');
    expect(createCardBlock).not.toContain('alignSelf: "start"');
    expect(createCardBlock).toContain('style={{ aspectRatio: "4/3" }}');
    expect(createCardBlock).toContain('style={{ minHeight: 52 }}');
    expect(source).toContain('className="project-card h-full"');
  });
});
