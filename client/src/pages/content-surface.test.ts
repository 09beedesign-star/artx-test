import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dark content surfaces", () => {
  it("uses the sidebar-aligned #171717 surface for inspiration, skills, and billing pages", () => {
    for (const file of ["InspirationPage.tsx", "SkillsPage.tsx", "BillingPage.tsx"]) {
      const source = readFileSync(resolve(__dirname, file), "utf-8");
      expect(source).toContain('const bg = isDark ? "#171717"');
    }

    const inspiration = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");
    const billing = readFileSync(resolve(__dirname, "BillingPage.tsx"), "utf-8");
    expect(inspiration).toContain('background: isDark ? "#171717" : "var(--design-surface-soft)"');
    expect(billing).toContain('background: isDark ? "#171717" : "var(--design-surface-soft)"');
  });
});
