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
    expect(source).toContain('const WORKSPACE_CARD_COVER_ASPECT_RATIO = "4/3";');
    expect(source).toContain('const WORKSPACE_CARD_INFO_HEIGHT = 96;');
    expect(source).toContain('const WORKSPACE_PROJECT_GRID_COLUMNS = "repeat(auto-fit, minmax(320px, 1fr))";');
    expect(projectCardBlock).toContain("aspectRatio: WORKSPACE_CARD_COVER_ASPECT_RATIO");
    expect(projectCardBlock).toContain("height: WORKSPACE_CARD_INFO_HEIGHT");
    expect(projectCardBlock).toContain('width: "100%"');
    expect(createCardBlock).toContain("aspectRatio: WORKSPACE_CARD_COVER_ASPECT_RATIO");
    expect(createCardBlock).toContain("height: WORKSPACE_CARD_INFO_HEIGHT");
    expect(createCardBlock).toContain('width: "100%"');
    expect(createCardBlock).not.toContain('alignSelf: "start"');
    expect(source).toContain("gridTemplateColumns: WORKSPACE_PROJECT_GRID_COLUMNS");
    expect(source).toContain('<div className="project-card">\n            <CreateProjectCard');
    expect(source).toContain('className="project-card"');
    expect(source).not.toContain('className="project-card h-full"');
  });
});
