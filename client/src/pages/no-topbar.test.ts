import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 全站内容区不再有顶部 bar（2026-11-10 用户要求）。
 *
 * 原状：三段式布局的右侧内容区，顶部还有一条 56px 的 `TopBar`，
 * 右边挂着「积分 + 升级」和头像菜单（个人中心）。用户要求整条去掉，
 * 把高度全留给内容 —— 也就是内容区从窗口最顶端开始。
 *
 * ⚠️ 这条测试的价值在于「11 个页面里漏一个」：
 *    漏掉的那一页照样渲染、照样能用，只是比别人多一条 56px 的浅色横条。
 *    只有把每个页面都点名，才挡得住「改到第 9 页时以为改完了」。
 *
 * ⚠️ 每个文件都先断言长度：readFileSync 读到空文件时
 *    `not.toContain("<TopBar")` 会恒绿 —— 那不是「没有顶栏」，是「没读到东西」。
 */

const PAGES = [
  "AssetsPage",
  "BillingPage",
  "CommunityPage",
  "CreditsGuidePage",
  "CrossBorderCommercePage",
  "HelpPage",
  "InspirationPage",
  "ProfilePage",
  "SettingsPage",
  "SkillsPage",
  "Workspace",
];

const readPage = (name: string) => readFileSync(resolve(__dirname, `${name}.tsx`), "utf-8");

describe("内容区顶栏已移除", () => {
  for (const name of PAGES) {
    it(`${name} 不再渲染 TopBar`, () => {
      const source = readPage(name);
      expect(source.length, `${name} 读到的内容过短，可能是空文件`).toBeGreaterThan(600);
      expect(source).not.toContain("<TopBar");
      expect(source).not.toContain('from "@/components/workspace/TopBar"');
    });
  }

  it("画布页仍然把新建画板登记进工作台", () => {
    // 顶栏去掉时最容易顺手把 ensureProjectMeta 一起删掉 ——
    // 那样新画板不会出现在工作台「最近」里，而且零报错。
    const source = readPage("Workspace");
    expect(source).toContain("ensureProjectMeta(");
    expect(source).toContain("updateWorkspaceProjectHistory(");
    expect(source).toContain("<InfiniteCanvas");
  });
});
