import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage test account operations", () => {
  it("keeps test-account operations inside the existing account management page", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain("测试账号");
    expect(page).toContain('"/api/admin/test-accounts"');
    expect(page).toContain("/test-profile");
    expect(page).toContain("/test-account/cancel");
    expect(page).toContain("temporaryPassword");
    expect(page).toContain("defaultTestAccountExpiry");
    expect(page).toContain("isIssuingTestAccount");
    expect(page).toContain("测试账号发放失败：");
    expect(page).toContain("正在发放...");
    expect(page).toContain("aiTasks");
    expect(page).toContain("formatExactOrderTime(task.createdAt");
    expect(page).toContain('user?.role === "super_admin"');
  });
});
