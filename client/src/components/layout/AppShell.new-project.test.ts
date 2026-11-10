import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appShellSource = readFileSync(resolve(currentDir, "AppShell.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(currentDir, "../../pages/WorkspaceDashboard.tsx"), "utf8");
const folderStoreSource = readFileSync(resolve(currentDir, "../../lib/project-folders.ts"), "utf8");

describe("AppShell 开始创作入口", () => {
  /*
   * 入口按钮的源码切片。
   * ⚠️ 用「New creation button / Main nav items」两个锚点切片，别用行号：
   *    行号会因为上面任何一处改动而失效，切出来的块可能恰好不包含按钮。
   */
  const createButtonBlock = (() => {
    const start = appShellSource.indexOf("New creation button");
    const end = appShellSource.indexOf("Main nav items");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return appShellSource.slice(start, end);
  })();

  const startCreatingBody = (() => {
    const start = appShellSource.indexOf("const startCreating");
    const end = appShellSource.indexOf("const handleCreateFolder");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return appShellSource.slice(start, end);
  })();

  it("按钮文案是「开始创作」，不再是「新创作」", () => {
    expect(createButtonBlock).toContain("开始创作");
    expect(createButtonBlock).not.toContain("新创作");
  });

  /*
   * 2026-11-10 用户要求「点击之后一键进入画布」：
   * 点这个按钮**不能**再弹「新建画布」表单 —— 填名称/封面/负责人那一步是路障。
   */
  it("点一下就直接进画布，不再弹「新建画布」表单", () => {
    expect(createButtonBlock).toContain("onClick={startCreating}");
    expect(createButtonBlock).not.toContain("setCreateOpen");
    // 曾经的实现：点「新创作」只回首页（用户拿不到新画板）
    expect(createButtonBlock).not.toContain('navigate("/")');
    expect(appShellSource).not.toContain("<CreateProjectDialog");
    expect(appShellSource).not.toContain("setCreateOpen(true)");
  });

  it("startCreating 建完画板立刻 navigate 进 /project/:id", () => {
    expect(startCreatingBody).toContain("createWorkspaceHistoryProject(undefined, undefined, folder)");
    expect(startCreatingBody).toContain("navigate(`/project/${project.id}`)");
    // 顺序：先判登录 → 再建画板 → 最后跳转（反过来的话未登录也会建出一块孤儿画板）
    expect(startCreatingBody.indexOf("openLoginModal")).toBeLessThan(
      startCreatingBody.indexOf("createWorkspaceHistoryProject")
    );
    expect(startCreatingBody.indexOf("createWorkspaceHistoryProject")).toBeLessThan(
      startCreatingBody.indexOf("navigate(")
    );
  });

  it("⌘N / Ctrl+N 与按钮走同一个函数", () => {
    expect(appShellSource).not.toContain("⌘K");
    expect(appShellSource).toContain("⌘N");
    expect(appShellSource).toContain("event.metaKey : event.ctrlKey");
    expect(appShellSource).toContain("startCreating();");
    expect(appShellSource).not.toContain("openCreateProject");
  });

  /*
   * 三级结构下的归属规则：人在项目里按 ⌘N，画板必须落在该项目下，
   * 否则用户「新建了但看不见」—— 新画板跑到项目外面去了。
   */
  it("creates the board inside the project the user is currently in", () => {
    expect(startCreatingBody).toContain("const folder = activeFolder");
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
