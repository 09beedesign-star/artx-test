import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("image node context-menu 设为封面", () => {
  const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
  const menu = source.match(
    /function NodeContextMenu[\s\S]*?(?=\n\/\/ ── Group Container Overlay)/
  )?.[0];
  const handler = source.match(
    /const handleNodeAction = useCallback\([\s\S]*?(?=\n  \/\/ ── Add node from position)/
  )?.[0];

  it("只给单张图片节点显示「设为封面」", () => {
    expect(menu).toBeTruthy();
    expect(menu).toContain('label: "设为封面"');
    expect(menu).toContain('action: "set-cover"');
    expect(menu).toMatch(
      /menu\.nodeType === "asset" && selectedCount === 1[\s\S]*?action: "set-cover"/
    );
    expect(menu).toContain("...setCoverItems");
  });

  it("点击后写入项目封面与 coverNodeId", () => {
    expect(handler).toBeTruthy();
    const branch = handler!.match(
      /action === "set-cover"[\s\S]*?(?=\} else if \(action === "add-asset"\))/
    )?.[0];
    expect(branch).toBeTruthy();
    expect(branch).toContain("createCanvasCoverThumbnail(src)");
    expect(branch).toContain("coverNodeId: node.id");
    expect(branch).toContain("updateWorkspaceProjectHistory(projectId");
    expect(branch).toContain('toast("已设为项目封面"');
  });

  it("三处自动封面刷新都经过手动封面判定，不会冲掉手动选择", () => {
    const calls = source.match(/getCanvasStateCoverSource\(/g) || [];
    // 1 处定义 + 3 处调用（恢复 / hydrate 后 / 节点变化防抖）
    expect(calls.length).toBe(4);
    expect(source).toMatch(
      /function getCanvasStateCoverSource\(projectId: string, nodes: Node\[\]\)[\s\S]*?resolveCanvasCoverSource\(nodes, project\?\.coverNodeId\)/
    );
  });
});
