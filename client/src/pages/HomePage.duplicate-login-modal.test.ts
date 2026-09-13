import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔒 首页「重复登录弹窗」防护
 *
 * 首页自带右侧内嵌登录面板（HomePage 的 panelMode），而 AuthContext 还管着一个
 * 全站居中弹窗（LoginRegisterDialog）。二者本身都没问题，问题出在全局事件：
 *
 *   lib/ai.ts / BillingPage 在需要登录时派发 `artx:login-required`，
 *   AuthContext 收到后无条件 setLoginModalOpen(true) ——
 *   于是在首页会出现「内嵌面板 + 居中弹窗」两个登录入口叠在一起。
 *
 * 2026-09-13 修法：在**监听侧**按路径分流（派发点有多个且还会增加，
 * 改监听侧才能一次覆盖全部），首页改为切换自身面板。
 */

function readAuthContext() {
  return readFileSync(resolve(__dirname, "../contexts/AuthContext.tsx"), "utf-8");
}

function readHomePage() {
  return readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");
}

/** 切出 artx:login-required 的监听函数，避免全文件匹配命中别处的 setLoginModalOpen。 */
function readLoginRequiredHandler(source: string) {
  const start = source.indexOf("const handleLoginRequired");
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf('window.addEventListener("artx:login-required"');
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("首页不得出现重复的登录入口", () => {
  it("artx:login-required 在首页不直接打开全局弹窗", () => {
    const handler = readLoginRequiredHandler(readAuthContext());

    // 必须先判断当前是不是首页
    expect(handler).toMatch(/window\.location\.pathname\s*===\s*"\/"/);

    // ⚠️ 关键：首页分支必须在 setLoginModalOpen 之前 return。
    // 只断言「出现了 pathname 判断」是不够的 —— 判断可能写了却没起作用。
    const homeBranch = handler.slice(handler.indexOf('window.location.pathname'));
    const returnIndex = homeBranch.indexOf("return;");
    const openModalIndex = homeBranch.indexOf("setLoginModalOpen(true)");
    expect(returnIndex).toBeGreaterThan(-1);
    expect(openModalIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeLessThan(openModalIndex);
  });

  it("首页分支改为请求内嵌面板", () => {
    const handler = readLoginRequiredHandler(readAuthContext());
    expect(handler).toContain('"artx:home-auth-panel"');
    expect(handler).toContain('"artx:home-auth-panel-requested"');
  });

  it("HomePage 必须监听该事件，否则停留在首页时点登录毫无反应", () => {
    const source = readHomePage();

    // 反向断言：不能只在挂载时读一次 sessionStorage。
    // 首页不会重新挂载，少了监听器就等于登录入口失灵（而且是静默失灵）。
    expect(source).toContain('window.addEventListener("artx:home-auth-panel-requested"');
    expect(source).toContain('window.removeEventListener("artx:home-auth-panel-requested"');
  });

  it("首页仍保留挂载时读取，覆盖从 RequireLogin 重定向回来的场景", () => {
    const source = readHomePage();
    expect(source).toContain("applyRequestedPanel();");
    expect(source).toContain("HOME_AUTH_PANEL_STORAGE_KEY");
  });

  it("全局登录弹窗组件全站只渲染一处", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
    const matches = app.match(/<LoginRegisterDialog\s*\/>/g) || [];
    expect(matches).toHaveLength(1);
  });
});
