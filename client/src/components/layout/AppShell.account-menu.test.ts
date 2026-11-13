/**
 * 侧栏「个人中心」入口小菜单（2026-11-13）
 *
 * 需求：点个人中心入口 → 白色小窗口，两项：个人中心页 / 退出登录；
 *       退出登录必须二次确认，确认后才真正退出。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AppShell.tsx"), "utf8");

describe("个人中心入口小菜单", () => {
  it("入口是 Popover 触发器，菜单白底，只有两项", () => {
    expect(source).toContain("data-account-menu-trigger");
    const i = source.indexOf('data-account-menu=""');
    expect(i).toBeGreaterThan(-1);
    const block = source.slice(i, i + 1600);
    expect(block).toContain('background: "#ffffff"');
    expect(block.match(/key: "(profile|logout)"/g)).toEqual(['key: "profile"', 'key: "logout"']);
    expect(block).toContain('navigate("/profile")');
  });

  it("菜单里点「退出登录」只打开确认框，不直接调用 logout()", () => {
    const i = source.indexOf('key: "logout"');
    const line = source.slice(i, source.indexOf("\n", i));
    expect(line).toContain("setLogoutConfirmOpen(true)");
    expect(line).not.toContain("logout()");
  });

  it("logout() 只在确认框的「确认退出」里调用", () => {
    expect(source.match(/\blogout\(\)/g)?.length).toBe(1);
    const fn = source.slice(source.indexOf("const handleConfirmLogout"), source.indexOf("const handleConfirmLogout") + 200);
    expect(fn).toContain("logout();");
    expect(source).toContain("onClick={handleConfirmLogout}");
    expect(source).toContain("确认退出当前账号？");
  });

  it("未登录时点入口仍是弹登录，不弹菜单", () => {
    expect(source).toContain("setAccountMenuOpen(isAuthenticated && open)");
    const i = source.indexOf("data-account-menu-trigger");
    expect(source.slice(i, i + 300)).toContain("openLoginModal()");
  });
});
