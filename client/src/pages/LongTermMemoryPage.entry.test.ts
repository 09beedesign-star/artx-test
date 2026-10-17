import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("长期记忆入口与归属规则", () => {
  it("/memory 路由需登录并挂 AppShell", () => {
    const app = read("App.tsx");
    expect(app).toMatch(
      /<Route path="\/memory">\s*<RequireLogin>\s*<AppShell>\s*<LongTermMemoryPage \/>/
    );
  });

  it("侧栏「长期记忆」紧跟在「电商画布」之后", () => {
    const shell = read("components/layout/AppShell.tsx");
    const ec = shell.indexOf('label="电商画布"');
    const mem = shell.indexOf('label="长期记忆" path="/memory"');
    expect(ec).toBeGreaterThan(-1);
    expect(mem).toBeGreaterThan(ec);
    // 切片内唯一的 <NavItem 是「长期记忆」自己的开标签 → 中间没有插别的项
    expect(shell.slice(ec, mem).match(/<NavItem/g)?.length ?? 0).toBe(1);
  });

  it("删除项目时同步删除该项目的记忆（note 为空）", () => {
    const dash = read("pages/WorkspaceDashboard.tsx");
    const body = dash.slice(dash.indexOf("const confirmDelete"));
    expect(body).toContain("removeWorkspaceProjectHistory(ids)");
    expect(body).toMatch(/saveProjectMemory\(\{\s*projectId,\s*note:\s*""\s*\}\)/);
  });

  it("四维度输入框都存在,且上限取自数据层", () => {
    const page = read("pages/LongTermMemoryPage.tsx");
    for (const k of ["projectMemory", "skill", "generalRules", "regularMemory"]) {
      expect(page).toContain(`key: "${k}"`);
      expect(page).toContain(`USER_MEMORY_LIMITS.${k}Dimension`);
    }
  });

  it("页面有下载记忆文档按钮，使用原生文件保存 API", () => {
    const page = read("pages/LongTermMemoryPage.tsx");
    expect(page).toContain('data-testid="memory-download"');
    expect(page).toContain("下载记忆文档");
    expect(page).toContain("handleDownloadMemory");
    expect(page).toContain("saveMarkdownWithPicker");
  });
});
