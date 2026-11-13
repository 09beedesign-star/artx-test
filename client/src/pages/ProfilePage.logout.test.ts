import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(__dirname, "ProfilePage.tsx"), "utf8");

describe("个人中心主卡片右上角退出登录", () => {
  it("按钮在主卡片内绝对定位于右上角，淡红色", () => {
    expect(src).toContain('className="relative overflow-hidden rounded-[var(--radius-xl-design)]"');
    const btn = src.slice(src.indexOf("data-profile-logout=\"\""), src.indexOf("data-profile-logout=\"\"") + 600);
    expect(btn).toContain("absolute right-5 top-5");
    expect(btn).toContain('background: "rgba(180,49,49,0.08)"');
    expect(btn).toContain('color: "#b43131"');
    expect(btn).toContain("退出登录");
  });

  it("点击按钮只打开二次确认，不直接退出", () => {
    const btn = src.slice(src.indexOf("data-profile-logout=\"\""), src.indexOf("data-profile-logout=\"\"") + 200);
    expect(btn).toContain("onClick={() => setLogoutConfirmOpen(true)}");
    expect(btn).not.toContain("logout()");
  });

  it("确认键才执行退出并回首页", () => {
    const fn = src.slice(src.indexOf("const handleConfirmLogout"), src.indexOf("const handleConfirmLogout") + 250);
    expect(fn).toContain("logout();");
    expect(fn).toContain('navigate("/");');
    const action = src.slice(src.indexOf("data-profile-logout-confirm-action"), src.indexOf("data-profile-logout-confirm-action") + 120);
    expect(action).toContain("onClick={handleConfirmLogout}");
    expect(src).toContain("确认退出当前账号？");
  });
});
