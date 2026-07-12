import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SmartCommerceProductDialog", () => {
  const source = readFileSync(
    resolve(__dirname, "SmartCommerceProductDialog.tsx"),
    "utf8"
  );

  it("contains the complete in-canvas commerce workflow", () => {
    for (const label of [
      "产品素材",
      "选择平台",
      "国家 / 地区",
      "商品品类",
      "图片用途",
      "爆款风格模板",
      "风格关键词",
      "风险检查",
      "输出规格",
      "生成智能电商产品图",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("lg:grid-cols-[220px_minmax(360px,1fr)_280px]");
    expect(source).toContain("overflow-x-hidden");
    expect(source).toContain("item.keywords?.length");
    expect(source).toContain("item.promptRules.slice(0, 3)");
  });

  it("checks risk and composes before dispatching to the canvas", () => {
    expect(source).toContain("fetchCommerceMarkets");
    expect(source).toContain("checkCommerceRisk");
    expect(source).toContain("await composeCommerceContext(input)");
    expect(source).toContain('new CustomEvent<SmartCommerceProductCreateDetail>');
    expect(source).toContain('"smart-commerce-product-create"');
    expect(source.indexOf("await composeCommerceContext(input)")).toBeLessThan(
      source.indexOf('"smart-commerce-product-create"')
    );
  });

  it("keeps output controls bounded to 2K, 4K, and one through nine images", () => {
    expect(source).toContain('useState<"2k" | "4k">("2k")');
    expect(source).toContain("const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]");
    expect(source).toContain("risk.action === \"block\"");
    expect(source).toContain("risk.action === \"rewrite\"");
  });

  it("keeps the mobile header and footer on one stable row", () => {
    expect(source).toContain('className="mt-0.5 hidden text-[10px] leading-4 sm:block"');
    expect(source).toContain('className="mt-2 grid grid-cols-5 gap-1"');
    expect(source).toContain('className="hidden min-w-0 text-[9px] leading-4 sm:block"');
  });

  it("shows the composed generation receipt before returning to the canvas", () => {
    for (const label of [
      "生成任务已发送到画布",
      "审计记录",
      "可编辑文案建议",
      "相关导出尺寸",
      "继续调整",
      "查看画布",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("setComposeReceipt({ context, auditRecordId })");
    expect(source).toContain("exportSizes: context.exportSizes");
    expect(source).toContain("marketPackageVersion: context.marketPackageVersion");
  });
});
