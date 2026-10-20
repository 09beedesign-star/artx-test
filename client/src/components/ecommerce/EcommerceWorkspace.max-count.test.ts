/**
 * 电商画布图片张数最大值测试
 * 2026-10-20 用户需求：带货图文和产品图的图片张数最大值改为 8
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const source = readFileSync(
  "client/src/components/ecommerce/EcommerceWorkspace.tsx",
  "utf8",
);

describe("图片张数最大值限制", () => {
  it("带货图文模式（post）的 max 应该是 8", () => {
    // 2026-10-20：从 max={9} 改为 max={8}
    const postCountRow = source.match(
      /mode\s*===\s*["']post["'][^]*?<CountRow[^>]*postCount[^>]*max=\{(\d+)\}/s
    );
    expect(postCountRow).toBeDefined();
    const maxValue = postCountRow![1];
    expect(maxValue).toBe("8");
  });

  it("产品图模式（product）的 max 应该是 8", () => {
    // 产品图模式本来就是 8，不需要修改，但验证一下
    const productCountRow = source.match(
      /mode\s*===\s*["']product["'][^]*?<CountRow[^>]*productCount[^>]*max=\{(\d+)\}/s
    );
    expect(productCountRow).toBeDefined();
    const maxValue = productCountRow![1];
    expect(maxValue).toBe("8");
  });

  it("不应该有任何 max={9} 的 CountRow", () => {
    // 确保没有遗漏的 max={9}
    const countRows = source.match(/<CountRow[^>]*>/g) || [];
    const max9Rows = countRows.filter(row => row.includes("max={9}"));
    expect(max9Rows).toHaveLength(0);
  });

  it("描述文案应该与实际最大值一致", () => {
    // 产品图的描述：「1 - 8 张」
    expect(source).toContain("1 - 8 张");
  });
});
