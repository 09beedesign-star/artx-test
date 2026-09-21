import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dark content surfaces", () => {
  it("uses the sidebar-aligned #171717 surface for inspiration, skills, and billing pages", () => {
    for (const file of ["InspirationPage.tsx", "SkillsPage.tsx"]) {
      const source = readFileSync(resolve(__dirname, file), "utf-8");
      expect(source).toContain('const bg = isDark ? "#171717"');
    }

    /*
      ⚠️ 2026-09-15 计费页的配色被抽到 components/billing/billing-theme.ts
      （/billing 页面与画布充值弹窗必须长得一样，色值只能有一份），
      所以 bg 的定义锚点跟着搬到那个文件。
      页面本体仍然自己写 main 区域的背景，那条继续锚在 BillingPage。
    */
    const billingTheme = readFileSync(
      resolve(__dirname, "../components/billing/billing-theme.ts"),
      "utf-8",
    );
    expect(billingTheme).toContain('bg: isDark ? "#171717"');

    const inspiration = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");
    const billing = readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");
    expect(inspiration).toContain('background: isDark ? "#171717" : "var(--design-surface-soft)"');
    expect(billing).toContain('isDark ? "#171717" : "var(--design-surface-soft)"');
  });
});
