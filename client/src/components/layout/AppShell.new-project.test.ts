import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appShellSource = readFileSync(resolve(currentDir, "AppShell.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(currentDir, "../../pages/WorkspaceDashboard.tsx"), "utf8");

describe("AppShell 新创作入口", () => {
  it("opens the create-project dialog instead of navigating back to the homepage", () => {
    const start = appShellSource.indexOf("New creation button");
    const end = appShellSource.indexOf("Main nav items");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const newCreateBlock = appShellSource.slice(start, end);

    expect(newCreateBlock).toContain("onClick={openCreateProject}");
    // 曾经的实现是 navigate("/")：点「新创作」只回首页，用户拿不到新画板。
    expect(newCreateBlock).not.toContain('navigate("/")');
    expect(appShellSource).toContain("<CreateProjectDialog");
  });

  it("uses ⌘N / Ctrl+N and no longer advertises ⌘K", () => {
    expect(appShellSource).not.toContain("⌘K");
    expect(appShellSource).toContain("⌘N");
    expect(appShellSource).toContain("event.metaKey : event.ctrlKey");
    expect(appShellSource).toContain("createWorkspaceHistoryProject(payload.name)");
    expect(appShellSource).toContain("navigate(`/project/${project.id}`)");
  });
});

describe("工作台不再提供新建画板入口", () => {
  it("removes the create-project card and its dialog", () => {
    expect(dashboardSource).not.toContain("新建画板");
    expect(dashboardSource).not.toContain("CreateProjectCard");
    expect(dashboardSource).not.toContain("CreateProjectDialog");
  });

  it("keeps an empty state that points users to the sidebar entry", () => {
    expect(dashboardSource).toContain("点击左侧「新创作」开始");
  });
});
