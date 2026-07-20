import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SmartCommerceProductDialog", () => {
  const source = readFileSync(
    resolve(__dirname, "SmartCommerceProductDialog.tsx"),
    "utf8"
  );

  it("keeps only the basic product upload, prompt, count, and resolution workflow", () => {
    for (const label of [
      "产品图片",
      "上传产品图片",
      "提示词",
      "常用画幅",
      "分辨率",
      "生成数量",
      "生成产品图",
    ]) {
      expect(source).toContain(label);
    }

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

  it("restores the seven pre-commerce background styles with user prompt priority", () => {
    for (const label of [
      "商务科技感",
      "中国风",
      "欧美潮流",
      "日韩风",
      "赛博风",
      "可爱呆萌系",
      "二次元系",
    ]) {
      expect(source).toContain(`name: "${label}"`);
    }
    expect(source).toContain("anime-style.jpg");
    expect(source).toContain("用户明确要求：${trimmedPrompt}");
    expect(source).toContain("补充风格方向：${selectedStyle.prompt}");
    expect(source).toContain("风格只能影响背景");
  });

  it("lets users replace or delete submitted product images", () => {
    expect(source).toContain("setImageSrc(\"\")");
    expect(source).toContain("setFileName(\"\")");
    expect(source).toContain("替换");
    expect(source).toContain("删除");
    expect(source).toContain("<Trash2 size={11} />");
  });
});
