import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SmartCommerceProductDialog", () => {
  const source = readFileSync(
    resolve(__dirname, "SmartCommerceProductDialog.tsx"),
    "utf8"
  );

  it("keeps only the basic product upload, template, count, and resolution workflow", () => {
    for (const label of [
      "产品图片",
      "上传产品图片",
      "电商背景模板选择",
      "常用画幅",
      "分辨率",
      "生成数量",
      "生成产品图",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).not.toContain('SectionTitle aside="用于生成背景">提示词</SectionTitle>');
    expect(source).not.toContain('placeholder="例如：干净的高级灰摄影棚背景');

    for (const removedCommerceLabel of [
      "选择平台",
      "国家 / 地区",
      "商品品类",
      "图片用途",
      "爆款风格模板",
      "风险检查",
      "审计记录",
      "可编辑文案建议",
      "相关导出尺寸",
      "主流电商平台",
    ]) {
      expect(source).not.toContain(removedCommerceLabel);
    }
  });

  it("does not load or compose cross-border commerce rules before dispatching", () => {
    expect(source).not.toContain("@/lib/cross-border-commerce");
    expect(source).not.toContain("fetchCommerceMarkets");
    expect(source).not.toContain("checkCommerceRisk");
    expect(source).not.toContain("composeCommerceContext");
    expect(source).not.toContain("CommerceSelection");
    expect(source).toContain('new CustomEvent<SmartCommerceProductCreateDetail>');
    expect(source).toContain('"smart-commerce-product-create"');
  });

  it("sends only PicWish r-background compatible fields to the canvas", () => {
    expect(source).toContain("imageSrc");
    expect(source).toContain("prompt");
    expect(source).toContain("ratio");
    expect(source).toContain("resolution");
    expect(source).toContain("count");
    expect(source).toContain("customWidth");
    expect(source).toContain("customHeight");
    expect(source).not.toContain("platformId");
    expect(source).not.toContain("marketId");
    expect(source).not.toContain("categoryId");
    expect(source).not.toContain("placementId");
    expect(source).not.toContain("templateId");
    expect(source).not.toContain("skillId");
    expect(source).not.toContain("backgroundReferenceSrc");
  });

  it("keeps output controls bounded to 2K, 4K, common ratios, and one through nine images", () => {
    expect(source).toContain('useState<"2k" | "4k">("2k")');
    expect(source).toContain("const IMAGE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]");
    for (const ratio of ['ratio: "1:1"', 'ratio: "4:5"', 'ratio: "16:9"', 'ratio: "9:16"']) {
      expect(source).toContain(ratio);
    }
  });

  it("places aspect ratio and resolution controls beneath the product upload column", () => {
    expect(source).toContain('lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]');
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_104px]');
    expect(source).toContain('className="grid grid-cols-3 gap-1.5"');
    expect(source).toContain('className="grid grid-rows-2 gap-1.5"');
    expect(source).toContain('<SectionTitle>常用画幅</SectionTitle>');
    expect(source).toContain('overflow-hidden rounded-md px-1.5');
    expect(source).toContain('truncate whitespace-nowrap text-[8px]');
    expect(source).not.toContain('SectionTitle aside={`${outputSize.width}×${outputSize.height}`}>常用画幅');
  });

  it("uses the right-column top area for the ecommerce background template selector", () => {
    const rightColumnPosition = source.indexOf('<section className="min-w-0">', source.indexOf("常用画幅"));
    const templatePosition = source.indexOf("<SectionTitle>电商背景模板选择</SectionTitle>");
    expect(templatePosition).toBeGreaterThan(rightColumnPosition);
    expect(source).not.toContain("<SectionTitle>背景风格</SectionTitle>");
    expect(source).not.toContain("<SectionTitle>PicWish 背景模板</SectionTitle>");
  });

  it("uses the selected template or PicWish random background without local background style cards", () => {
    expect(source).toContain("创建真实、干净、有商业质感的产品背景。");
    expect(source).toContain("使用 PicWish 默认随机电商背景模板。");
    expect(source).toContain("电商背景模板：${selectedPicwishTemplate.name}");
    expect(source).toContain("风格只能影响背景");
    expect(source).not.toContain("PRODUCT_BACKGROUND_STYLES");
    expect(source).not.toContain("selectedStyle");
  });

  it("sends product composition and frame occupancy controls with the generated background request", () => {
    for (const label of ["居中主视觉", "左侧留白", "右侧留白", "底部陈列", "斜向布局", "留白展示", "均衡陈列", "产品聚焦"]) {
      expect(source).toContain(`label: "${label}"`);
    }
    expect(source).toContain("产品构图要求：${selectedComposition.prompt}");
    expect(source).toContain("产品占画面比例要求：${selectedProductScale.prompt}");
    expect(source).toContain("composition: selectedComposition.id");
    expect(source).toContain("productScale: selectedProductScale.id");
  });

  it("lets users replace or delete submitted product images", () => {
    expect(source).toContain("setImageSrc(\"\")");
    expect(source).toContain("setFileName(\"\")");
    expect(source).toContain("替换");
    expect(source).toContain("删除");
    expect(source).toContain("<Trash2 size={11} />");
  });
});
