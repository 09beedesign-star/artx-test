import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 回归测试：引用类标签（image / annotation）的外观必须一致
//
// 修复前的两个问题：
//   1. annotation 标签是绿色，image 标签是黑色（选中态）/紫色（默认态）
//   2. 尺寸各写各的 —— image 走 inline style 且随选中态在 82/62 之间跳，
//      annotation 走 className（max-w-[92px] gap-1 px-1.5 py-0.5），
//      导致同一行里两类标签明显不一样大
//
// 修复后两者共用 COMPOSER_REF_TOKEN_SIZE + getComposerRefTokenColors。

const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

function sliceToken(kind: "image" | "annotation") {
  const start = source.indexOf(`data-composer-token="${kind}"`);
  expect(start).toBeGreaterThan(-1);
  // 截取该标签的样式区间，足够覆盖 className + style 块
  return source.slice(start, start + 2600);
}

describe("composer reference tokens share one size", () => {
  it("defines a single shared size constant", () => {
    expect(source).toContain("const COMPOSER_REF_TOKEN_SIZE = {");
    expect(source).toContain("maxWidth: 82");
    expect(source).toContain("height: 26");
  });

  it("image token reads every dimension from the shared constant", () => {
    const block = sliceToken("image");
    expect(block).toContain("maxWidth: COMPOSER_REF_TOKEN_SIZE.maxWidth");
    expect(block).toContain("height: COMPOSER_REF_TOKEN_SIZE.height");
    expect(block).toContain("gap: COMPOSER_REF_TOKEN_SIZE.gap");
    expect(block).toContain("padding: COMPOSER_REF_TOKEN_SIZE.padding");
  });

  it("annotation token reads the same dimensions", () => {
    const block = sliceToken("annotation");
    expect(block).toContain("maxWidth: COMPOSER_REF_TOKEN_SIZE.maxWidth");
    expect(block).toContain("height: COMPOSER_REF_TOKEN_SIZE.height");
    expect(block).toContain("gap: COMPOSER_REF_TOKEN_SIZE.gap");
    expect(block).toContain("padding: COMPOSER_REF_TOKEN_SIZE.padding");
  });

  it("annotation no longer carries sizing utility classes that would diverge", () => {
    const block = sliceToken("annotation");
    // 这些 Tailwind 尺寸类会与 inline style 打架，且是此前尺寸不一致的来源
    expect(block).not.toContain("max-w-[92px]");
    expect(block).not.toContain("gap-1 ");
    expect(block).not.toContain("px-1.5");
    expect(block).not.toContain("py-0.5");
  });

  it("no token size depends on selection state anymore", () => {
    const imageBlock = sliceToken("image");
    const annotationBlock = sliceToken("annotation");
    // 修复前是 `maxWidth: isSelectedImageToken ? 82 : 62` 这类写法
    expect(imageBlock).not.toMatch(/maxWidth: isSelectedImageToken/);
    expect(imageBlock).not.toMatch(/height: isSelectedImageToken/);
    expect(annotationBlock).not.toMatch(/isSelectedImageToken/);
  });
});

describe("composer reference tokens share one black color scheme", () => {
  it("defines a single shared color helper", () => {
    expect(source).toContain("function getComposerRefTokenColors(");
    expect(source).toContain('background: isDark ? "#121110" : "rgba(18,17,16,0.12)"');
  });

  it("both tokens spread the shared colors", () => {
    expect(sliceToken("image")).toContain("...getComposerRefTokenColors(");
    expect(sliceToken("annotation")).toContain("...getComposerRefTokenColors(");
  });

  it("annotation drops every green value", () => {
    const block = sliceToken("annotation");
    // 绿色来源：oklch(... 145) 色相、以及 emerald / lime 系 rgba
    expect(block).not.toMatch(/oklch\([^)]*\s145\b/);
    expect(block).not.toContain("52,211,153");
    expect(block).not.toContain("197,237,71");
  });

  it("image token drops every purple value", () => {
    const block = sliceToken("image");
    expect(block).not.toContain("144,88,252");
    expect(block).not.toMatch(/oklch\([^)]*\s292\b/);
  });

  it("annotation pin icon inherits the token color instead of green", () => {
    const block = sliceToken("annotation");
    expect(block).toContain('color: "currentColor"');
  });
});
