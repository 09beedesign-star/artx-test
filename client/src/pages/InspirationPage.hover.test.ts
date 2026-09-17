import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 灵感卡片「悬停 500ms 才放大」的防护测试。
 *
 * 【2026-09-17 重锚说明】
 * 这条测试原本只扫 `InspirationPage.tsx`，其中一条断言写的是
 *   `transform: hoveredItemKey === \`${item.rank}-${item.title}\` ? "scale(1.08)" : "scale(1)"`
 * 后来卡片 JSX 被抽成共享组件 `InspirationCard.tsx`（个人中心要复用同一张卡片），
 * **实现搬家了，断言的锚点还指着老地方** → 变红。
 *
 * ⚠️ 这里没有直接删掉那条断言求绿。原始意图拆成了两半，两半都还成立：
 *   - 「延时 500ms 才认定 hover」的逻辑仍在页面里（它持有 timer 和状态）；
 *   - 「hover 时才放大、不用 CSS group-hover」的渲染搬到了卡片组件里。
 * 所以按新的归属重新落锚，两处各守一半，覆盖面没有缩小。
 */

const pageSource = readFileSync(resolve(__dirname, "InspirationPage.tsx"), "utf-8");
const cardSource = readFileSync(
  resolve(__dirname, "../components/inspiration/InspirationCard.tsx"),
  "utf-8"
);

describe("InspirationPage card hover", () => {
  it("delays hover activation by 500ms in the page", () => {
    expect(pageSource).toContain("hoveredItemKey");
    expect(pageSource).toContain("setTimeout");
    expect(pageSource).toContain("500");
    expect(pageSource).toContain("clearTimeout");
    // 延时结果必须真的传给卡片，否则 timer 算了个寂寞
    expect(pageSource).toContain("hovered={hoveredItemKey === `${item.rank}-${item.title}`}");
  });

  it("zooms the image from the hovered state instead of CSS group-hover", () => {
    expect(cardSource).toContain('transform: hovered ? "scale(1.08)" : "scale(1)"');
    expect(cardSource).toContain("transition-transform");
    // 📌 group-hover 会立刻放大，绕过 500ms 延时 —— 正是这条测试要挡的
    expect(cardSource).not.toContain("group-hover:scale-105");
    expect(pageSource).not.toContain("group-hover:scale-105");
  });
});
