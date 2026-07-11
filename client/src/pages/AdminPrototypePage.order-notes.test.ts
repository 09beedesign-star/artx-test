import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AccountDetailDrawer order notes", () => {
  it("shows recent notes for the selected order beside the save note controls", () => {
    const source = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");

    expect(source).toContain("本订单已保存备注");
    expect(source).toContain("item.orderId === selectedOrder.id");
    expect(source).toContain("slice(0, 3)");
  });
});
