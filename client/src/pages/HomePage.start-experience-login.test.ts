import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔒「开始体验」登录入口按浏览位置分流（产品定稿 2026-09-24）
 *
 *   还在第一屏  → 右侧内嵌面板切登录态
 *   已滚出第一屏 → 全站通用居中小弹窗（LoginRegisterDialog）
 *
 * 防的是一个零报错缺陷：内嵌面板固定在第一屏右侧，用户滚到灵感区再点登录，
 * 面板确实切了，但在几屏之外——用户看不到，表现为「点了没反应」。
 */

function readHomePage() {
  return readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");
}

/** 只切出分流函数本体，避免全文件匹配命中别处的 setPanelMode / openLoginModal。 */
function readScrollRouter(source: string) {
  const start = source.indexOf("const requestLoginByScrollPosition");
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf("const handleStartExperience");
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

function readStartExperience(source: string) {
  const start = source.indexOf("const handleStartExperience");
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf("\n  };");
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

function readHeroVisibleCheck(source: string) {
  const start = source.indexOf("const isHomeHeroVisible");
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf("\n  };");
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("开始体验按浏览位置选择登录形态", () => {
  it("滚动真值取自内部滚动容器，不能用 window.scrollY", () => {
    const check = readHeroVisibleCheck(readHomePage());

    // 首页装在 <main class="overflow-y-auto"> 里，window.scrollY 恒为 0，
    // 用它判断会永远走「在第一屏」分支——规则彻底失效且零报错。
    expect(check).toContain("mainRef.current?.scrollTop");
    expect(check).not.toContain("window.scrollY");
    expect(check).not.toContain("document.documentElement.scrollTop");
  });

  it("两个分支都存在，且内嵌面板分支必须先 return", () => {
    const router = readScrollRouter(readHomePage());

    const panelIndex = router.indexOf('setPanelMode("login")');
    const returnIndex = router.indexOf("return;");
    const modalIndex = router.indexOf("openLoginModal()");

    expect(panelIndex).toBeGreaterThan(-1);
    expect(modalIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(-1);

    // 少了 return 会两个入口同时触发，正是 09-13 修过的「重复登录弹窗」。
    expect(panelIndex).toBeLessThan(returnIndex);
    expect(returnIndex).toBeLessThan(modalIndex);
  });

  it("开始体验必须走分流函数，不得写死任一形态", () => {
    const handler = readStartExperience(readHomePage());

    expect(handler).toContain("requestLoginByScrollPosition()");
    // 反向断言：直接写死会让分流规则形同虚设。
    expect(handler).not.toContain('setPanelMode("login")');
    expect(handler).not.toContain("openLoginModal()");
  });

  it("首屏阈值是共享常量，不是散落的字面量", () => {
    const source = readHomePage();

    expect(source).toContain("const HOME_HERO_VISIBLE_RATIO");

    // 分流判断与滚动复位必须引用同一常量，否则改一处漏一处，
    // 会出现「面板已复位成 prelogin、点击却按已滚走处理」的错位。
    const usages = source.match(/homeHeight \* HOME_HERO_VISIBLE_RATIO/g) || [];
    expect(usages.length).toBeGreaterThanOrEqual(2);

    // 旧的硬编码写法不得残留。
    expect(source).not.toContain("homeHeight * 0.15");
  });

  it("openLoginModal 已从 useAuth 取出，否则调用即崩", () => {
    const source = readHomePage();
    const hookLine = source.match(/const \{[^}]*\} = useAuth\(\);/)?.[0] ?? "";
    expect(hookLine).toContain("openLoginModal");
  });
});
