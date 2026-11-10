/**
 * 工作台卡片尺寸守卫（三级结构版本）。
 *
 * 旧版这里守的是「新建画板卡片要和项目卡片同高」；新建入口已经移到
 * 侧栏「新创作」和项目内的「新建画布」，那张卡片不存在了。
 *
 * 现在要守的同类问题是：**根层的项目卡片和项目内的画板卡片必须共用同一个
 * 封面比例**。两边各写一个数时，进出项目页面时卡片高度会跳一下，
 * 看起来像页面在抖 —— 而且不会报任何错。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "WorkspaceDashboard.tsx"), "utf8");

function block(startAnchor: string, endAnchor: string) {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + 1);
  expect(start, `起锚没找到：${startAnchor}`).toBeGreaterThan(-1);
  expect(end, `止锚没找到：${endAnchor}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("WorkspaceDashboard 卡片尺寸", () => {
  it("shares one cover aspect ratio between project cards and board cards", () => {
    expect(source).toContain('const COVER_ASPECT_RATIO = "3 / 2";');

    const boardCard = block("function BoardCard", "// ── 画板行");
    const folderCard = block("function FolderCard", "// ── 删除确认");

    expect(boardCard).toContain("aspectRatio: COVER_ASPECT_RATIO");
    expect(folderCard).toContain("aspectRatio: COVER_ASPECT_RATIO");
    // 不许再出现写死的比例字面量（比如 "4/3"），否则两边会分叉
    expect(boardCard).not.toMatch(/aspectRatio:\s*"/);
    expect(folderCard).not.toMatch(/aspectRatio:\s*"/);
  });

  it("keeps the responsive grids driven by the shared column constants", () => {
    expect(source).toContain('const BOARD_GRID_COLUMNS = "repeat(auto-fill, minmax(196px, 1fr))";');
    expect(source).toContain('const FOLDER_GRID_COLUMNS = "repeat(auto-fill, minmax(232px, 1fr))";');
    expect(source).toContain("gridTemplateColumns: BOARD_GRID_COLUMNS");
    expect(source).toContain("gridTemplateColumns: FOLDER_GRID_COLUMNS");
  });
});
