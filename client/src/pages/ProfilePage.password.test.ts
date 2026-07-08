import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ProfilePage password change entry", () => {
  it("keeps the personal profile password change dialog wired to auth", () => {
    const source = readFileSync(resolve(__dirname, "ProfilePage.tsx"), "utf-8");

    expect(source).toContain("修改密码");
    expect(source).toContain("changePassword(currentPassword, newPassword)");
    expect(source).toContain("ProfilePasswordInput");
    expect(source).toContain('autoComplete="current-password"');
    expect(source).toContain('autoComplete="new-password"');
  });
});
