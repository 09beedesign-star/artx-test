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
    expect(source).toContain("readBrowserPasswordCredential()");
    expect(source).toContain("记住密码");
    expect(source).toContain("忘记密码？");
    expect(source).toContain("className=\"mt-3 flex h-5 items-center justify-between gap-3\"");
    expect(source).toContain('name={isRegister ? "new-password" : "password"}');
    expect(source).toContain("autoComplete={isRegister ? \"new-password\" : \"current-password\"}");
    expect(source).not.toContain("encodeURIComponent(password)");
    expect(source).not.toContain("password}; Max-Age");
    expect(source).not.toContain("localStorage.setItem(\"password\"");
  });
});
