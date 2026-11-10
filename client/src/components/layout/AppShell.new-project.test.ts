import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appShellSource = readFileSync(resolve(currentDir, "AppShell.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(currentDir, "../../pages/WorkspaceDashboard.tsx"), "utf8");
const folderStoreSource = readFileSync(resolve(currentDir, "../../lib/project-folders.ts"), "utf8");

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
    expect(appShellSource).toContain("navigate(`/project/${project.id}`)");
  });

  /*
   * 三级结构下的归属规则：人在项目里按 ⌘N，画板必须落在该项目下，
   * 否则用户「新建了但看不见」—— 新画板跑到项目外面去了。
   */
  it("creates the board inside the project the user is currently in", () => {
    expect(appShellSource).toContain("const folder = activeFolder");
    expect(appShellSource).toContain(
      "createWorkspaceHistoryProject(payload.name, undefined, folder)"
    );
    expect(appShellSource).toContain('new URLSearchParams(search).get("p")');
  });

  it("renders real projects and recent boards in the middle panel instead of a hardcoded empty state", () => {
    expect(appShellSource).toContain("listWorkspaceFolders()");
    expect(appShellSource).toContain("readWorkspaceProjectHistory().slice(0, 5)");
    expect(appShellSource).toContain("navigate(`/workspace?p=${folder.id}`)");
    expect(appShellSource).toContain("WORKSPACE_FOLDERS_UPDATED_EVENT");
  });
});

describe("工作台三级结构（工作台 → 项目 → 画板）", () => {
  it("root level offers 新建项目, project level offers 新建画布", () => {
    expect(dashboardSource).toContain("新建项目");
    expect(dashboardSource).toContain("新建画布");
    // 旧实现是网格里插一张「新建画板」卡片，已随层级改造移除
    expect(dashboardSource).not.toContain("CreateProjectCard");
  });

  it("enters a project via ?p= and opens a board via /project/:id", () => {
    expect(dashboardSource).toContain('new URLSearchParams(search).get("p")');
    expect(dashboardSource).toContain("navigate(`/workspace?p=${folder.id}`)");
    expect(dashboardSource).toContain("navigate(`/project/${id}`)");
  });

  it("keeps boards that belong to no project reachable instead of hiding them", () => {
    expect(dashboardSource).toContain("listUnfiledBoards()");
    expect(dashboardSource).toContain("未归类画板");
    expect(folderStoreSource).toContain("export function listUnfiledBoards");
  });

  it("requires a second confirmation before deleting a project or a board", () => {
    expect(dashboardSource).toContain("pendingDelete");
    expect(dashboardSource).toContain("此操作不可撤销");
  });
});
