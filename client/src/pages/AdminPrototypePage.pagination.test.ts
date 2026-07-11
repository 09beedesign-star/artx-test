import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage data pagination", () => {
  it("paginates account management and payment orders in 20-row pages", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(page).toContain("const PAGE_SIZE = 20");
    expect(page).toContain("const [userPage, setUserPage]");
    expect(page).toContain("const [orderPage, setOrderPage]");
    expect(page).toContain("<PagePaginator");
    expect(page).toContain("items={filteredUsers}");
    expect(page).toContain("items={adminData.orders}");
  });
});
