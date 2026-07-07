import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginDialogSource = readFileSync("client/src/components/auth/LoginRegisterDialog.tsx", "utf-8");
const homePageSource = readFileSync("client/src/pages/HomePage.tsx", "utf-8");

describe("front-end forgot password entry points", () => {
  it("wires the global login dialog forgot password button to the auth reset action", () => {
    expect(loginDialogSource).toContain("forgotPassword");
    expect(loginDialogSource).toContain("handleForgotPassword");
    expect(loginDialogSource).toMatch(/onClick=\{\(\) => void handleForgotPassword\(\)\}/);
  });

  it("wires the home login panel forgot password button to the auth reset action", () => {
    expect(homePageSource).toContain("forgotPassword");
    expect(homePageSource).toContain("handleForgotPassword");
    expect(homePageSource).toContain("onForgotPassword={handleForgotPassword}");
    expect(homePageSource).toMatch(/onClick=\{\(\) => void onForgotPassword\(\)\}/);
  });
});
