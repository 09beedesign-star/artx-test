import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminPrototypePage order notes placement", () => {
  it("places note entry and manual reissue directly below credit adjustment", () => {
    const page = readFileSync(resolve(__dirname, "AdminPrototypePage.tsx"), "utf-8");
    const creditAdjustmentIndex = page.indexOf("人工积分调整");
    const notesIndex = page.indexOf('placeholder="为当前订单添加备注"');
    const reissueIndex = page.indexOf("onClick={onReissue}");
    const ordersIndex = page.indexOf('title="账户订单"');

    expect(notesIndex).toBeGreaterThan(creditAdjustmentIndex);
    expect(reissueIndex).toBeGreaterThan(notesIndex);
    expect(ordersIndex).toBeGreaterThan(reissueIndex);
    expect(page).toContain("当前订单已保存备注");
    expect(page).toContain("收起订单");
    expect(page).toContain("收起支付流");
  });
});
