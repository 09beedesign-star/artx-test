import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(source).toContain("记住密码");
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

  it("does not keep the login password form mounted after the user is authenticated", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain("const shouldRenderAuthPanel = !isAuthenticated");
    expect(source).toContain("{shouldRenderAuthPanel && (");
    expect(source).toContain('autoComplete="on"');
    expect(source).toContain('autoComplete="username"');
    expect(source).toContain('autoComplete={isRegister ? "new-password" : "current-password"}');
  });

  it("does not keep the login password form mounted after the user is authenticated", () => {
    const source = readFileSync(resolve(__dirname, "HomePage.tsx"), "utf-8");

    expect(source).toContain("const shouldRenderAuthPanel = !isAuthenticated");
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
