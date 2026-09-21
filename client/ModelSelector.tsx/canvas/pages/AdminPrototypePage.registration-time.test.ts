import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage account registration times", () => {
  it("shows every account registration time with seconds in the account list", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain("注册时间");
    expect(page).toContain('formatExactOrderTime(user.registeredAt, "未提供精确时间")');
  });
});
