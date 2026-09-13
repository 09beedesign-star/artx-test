import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 剥掉注释后再做文案断言。
 *
 * ⚠️ 为什么必须有这个函数：本文件用 `toContain` 扫**源码字符串**来断言 UI 文案，
 * 而源码里的解释性注释同样是字符串的一部分。2026-09-13 实测过一次：
 * 把「记住密码」改成「记住账号」后，`toContain("记住密码")` **依然通过** ——
 * 因为新写的注释里解释了"为什么不叫记住密码"，断言命中的是注释而不是 UI。
 *
 * 这类假通过最危险的地方在于：它不会让测试变红，只会让测试**失去意义** ——
 * 文案已经改了，守文案的断言却还在为旧值亮绿灯。
 *
 * 凡是断言「页面上应该/不应该出现某个词」，一律先过这个函数。
 */
function stripComments(source: string) {
  return source
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("HomePage auth flow", () => {
  it("does not create a workspace project automatically after login or registration", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");
    const handleAuthAction = source.match(
      /const handleAuthAction = async[\s\S]*?const handleAuthSubmit/
    )?.[0];

    expect(handleAuthAction).toBeTruthy();
    expect(handleAuthAction).not.toContain("createProjectFromPrompt()");
  });

  it("implements remember password without storing the raw password in browser cookies", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain('const REMEMBERED_LOGIN_COOKIE = "artx_remembered_login"');
    expect(source).toContain("saveRememberedLoginUsername(email.trim())");
    expect(source).toContain("storeBrowserPasswordCredential(email.trim(), password)");
    expect(stripComments(source)).toContain("记住账号");
    expect(source).toContain("忘记密码？");
    expect(source).toContain("className=\"mt-3 flex h-5 items-center justify-between gap-3\"");
    expect(source).toContain('name={isRegister ? "new-password" : "password"}');
    expect(source).toContain("autoComplete={isRegister ? \"new-password\" : \"current-password\"}");
    expect(source).not.toContain("navigator.credentials.get");
    expect(source).not.toContain("readBrowserPasswordCredential");
    expect(source).not.toContain("encodeURIComponent(password)");
    expect(source).not.toContain("password}; Max-Age");
    expect(source).not.toContain("localStorage.setItem(\"password\"");
  });

  it("⭐ 勾选框文案不得承诺「记住密码」——ArtX 并不保存密码", () => {
    /*
     * 2026-09-13 用户报「勾了记住密码，下次密码没自动填」。
     * 查下来不是功能坏了：ArtX 从设计上就不保存密码（见上一条测试的
     * 一串 not.toContain），只记用户名 + 把凭据交给浏览器密码管理器。
     * 真正的问题是**文案承诺了做不到的事**。
     *
     * 这条断言守的就是"别再承诺一次"。用反向断言而不是只断言新文案 ——
     * 只写 toContain("记住账号") 挡不住有人在别处又加一个「记住密码」勾选框。
     */
    const ui = stripComments(readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8"));

    expect(ui).toContain("记住账号");
    expect(ui).not.toContain("记住密码");
    // 勾选框必须带解释性 title，告诉用户密码归浏览器管，否则文案改了用户仍会困惑。
    expect(ui).toContain("密码由浏览器的密码管理器保存");
  });

  it("⭐ 登录面板收起时必须整块卸载，不能只靠 opacity-0 遮住", () => {
    /*
     * 这是「密码没自动填」的第二个真实成因，比文案更隐蔽。
     *
     * 原实现里 shouldRenderAuthPanel 只判断 !isAuthenticated，
     * 面板收起状态是靠 opacity-0 + pointer-events-none 遮住的，
     * 于是**未登录首屏一加载，登录表单就已经挂在 DOM 上且完全不可见**。
     * Chrome/Safari 的密码管理器在页面加载阶段扫描表单决定是否提示填充，
     * 对可见性为 0 的表单行为不稳定 —— 等用户点开面板，填充时机已经过去。
     *
     * 卸载后浏览器会在面板真正出现时重新发现表单，填充提示才按预期弹出。
     *
     * ⚠️ 断言挂载条件本身而不是断言 className：className 怎么写都行，
     * 真正决定 DOM 里有没有表单的是 shouldRenderAuthPanel 这个布尔值。
     */
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain(
      'const shouldRenderAuthPanel = !isAuthenticated && displayedMode !== "prelogin"'
    );
    // 反向断言：挡住有人把条件退回只判断登录态。
    expect(source).not.toContain("const shouldRenderAuthPanel = !isAuthenticated;");
    // 挂载块内不得再出现"收起时隐藏"的分支——那个分支存在即说明表单又常驻了。
    const authPanelBlock = source.match(
      /\{shouldRenderAuthPanel && \([\s\S]*?<LoginPanel/
    )?.[0];
    expect(authPanelBlock).toBeTruthy();
    expect(authPanelBlock).not.toContain("opacity-0");
  });

  it("keeps the native autofill attributes the browser password manager relies on", () => {
    /*
     * 这条原本是两份一字不差的重复用例，且都带一句
     *   toContain("const shouldRenderAuthPanel = !isAuthenticated")
     * ——**不带分号**，新旧两种实现都成立，守不住任何东西。
     * 挂载条件已由上一条「⭐ 登录面板收起时必须整块卸载」用带分号的精确断言
     * ＋反向断言完整覆盖，这里只保留真正有价值的部分：原生 autoComplete 属性。
     *
     * 这三个属性是浏览器密码管理器识别登录表单的前提，缺一个就可能不提示保存/填充，
     * 和本次「密码没自动填」的修复方向是同一件事的两面。
     */
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain("{shouldRenderAuthPanel && (");
    expect(source).toContain('autoComplete="on"');
    expect(source).toContain('autoComplete="username"');
    expect(source).toContain('autoComplete={isRegister ? "new-password" : "current-password"}');
  });

  it("keeps homepage inspiration cards focused on content without source or rank chrome", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).not.toContain(">EW<");
    expect(source).not.toContain("ArtX 灵感");
    expect(source).not.toContain("#{item.rank}");
    expect(source).toContain('className="flex items-start justify-between gap-3"');
    expect(source).toContain('className="min-w-0 flex-1"');
  });

  it("opens the home inspiration detail modal instead of routing away", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain("selectedHomeInspiration");
    expect(source).toContain("setSelectedHomeInspiration(item)");
    expect(source).not.toContain('onClick={() => navigate("/inspiration")}');
    expect(source).toContain("copyHomeInspirationPrompt(selectedHomeInspiration.prompt)");
    expect(source).toContain('aria-label="关闭弹层"');
    expect(source).toContain('style={{ maxWidth: 980, background: "#222222", border: `1px solid ${homeInspirationBorder}` }}');
  });

  it("randomizes home inspiration order and metrics for each login session", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain("const HOME_INSPIRATION_MIN_METRIC = 1000");
    expect(source).toContain("const HOME_INSPIRATION_MAX_METRIC = 10000");
    expect(source).toContain("function randomInspirationMetric()");
    expect(source).toContain("function shuffleInspirationRecommendations");
    expect(source).toContain("viewCount: randomInspirationMetric()");
    expect(source).toContain("likeCount: randomInspirationMetric()");
    expect(source).toContain("setHomeInspirationItems(createHomeInspirationFeed())");
  });
});
