import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { distributeToColumns, resolveMasonryColumnCount } from "./masonry-columns";

const bps = [
  { minWidth: 0, columns: 1 },
  { minWidth: 560, columns: 2 },
  { minWidth: 840, columns: 3 },
  { minWidth: 1100, columns: 4 },
];

describe("瀑布流", () => {
  it("列数按容器宽度断点", () => {
    expect(resolveMasonryColumnCount(300, bps)).toBe(1);
    expect(resolveMasonryColumnCount(560, bps)).toBe(2);
    expect(resolveMasonryColumnCount(900, bps)).toBe(3);
    expect(resolveMasonryColumnCount(1400, bps)).toBe(4);
  });

  it("轮流分列：追加项不会让已有项换列", () => {
    const before = distributeToColumns([0, 1, 2, 3, 4], 3).map(c => c.map(x => x.item));
    const after = distributeToColumns([0, 1, 2, 3, 4, 5, 6, 7], 3).map(c => c.map(x => x.item));
    expect(before).toEqual([[0, 3], [1, 4], [2]]);
    before.forEach((col, i) => expect(after[i].slice(0, col.length)).toEqual(col));
  });

  it("两处入口都用瀑布流且不再裁切 16:10", () => {
    const page = readFileSync(resolve(__dirname, "../../pages/InspirationPage.tsx"), "utf8");
    const dialog = readFileSync(resolve(__dirname, "../inspiration/InspirationPromptDialog.tsx"), "utf8");
    const card = readFileSync(resolve(__dirname, "../inspiration/InspirationCard.tsx"), "utf8");
    expect(page).toContain("<MasonryColumns");
    expect(page).toMatch(/<InspirationCard\s+fitImage/);
    expect(dialog).toContain("<MasonryColumns");
    expect(dialog).not.toContain("aspect-[16/10]");
    expect(dialog).not.toContain("object-cover");
    // 瀑布流模式下图片 h-auto 不裁切
    expect(card).toContain("block h-auto w-full");
  });
});
