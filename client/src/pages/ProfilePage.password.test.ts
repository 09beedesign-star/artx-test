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

  it("prevents oversized avatar data from crashing profile persistence", () => {
    const source = readFileSync(resolve(__dirname, "ProfilePage.tsx"), "utf-8");

    expect(source).toContain("function writeStoredProfile");
    expect(source).toContain("isQuotaExceededError(error)");
    expect(source).toContain('avatar: ""');
    expect(source).toContain("头像图片过大");

    const persistenceEffect = source.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[profile\]\);/)?.[0];
    expect(persistenceEffect).toBeTruthy();
    expect(persistenceEffect).toContain("writeStoredProfile(profile)");
    expect(persistenceEffect).not.toContain("localStorage.setItem");
  });

  it("compresses cropped avatars before storing them in the browser", () => {
    const source = readFileSync(resolve(__dirname, "ProfilePage.tsx"), "utf-8");

    expect(source).toContain('canvas.toDataURL("image/jpeg", 0.86)');
    expect(source).not.toContain('canvas.toDataURL("image/png")');
  });
});
