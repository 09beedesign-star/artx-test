import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage order notes placement", () => {
  it("places note entry and saved notes directly below the account order list", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");
    const ordersIndex = page.indexOf('title="账户订单"');
    const notesIndex = page.indexOf('placeholder="为当前订单添加备注"');
    const detailIndex = page.indexOf("当前处理订单");

    expect(ordersIndex).toBeGreaterThan(-1);
    expect(notesIndex).toBeGreaterThan(ordersIndex);
    expect(notesIndex).toBeLessThan(detailIndex);
    expect(page).toContain("当前订单已保存备注");
  });
});
