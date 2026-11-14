/**
 * 版式工作台接线守护。
 *
 * 这些断言读的是源码文本：本项目已经踩过十四次「同一份逻辑多个出口，
 * 只改一个等于没做」，这里把最容易被顺手删掉的几个出口钉住。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_CREDIT_COST } from "@/lib/canvas-templates";

const read = (relative: string) =>
  readFileSync(resolve(process.cwd(), relative), "utf8");

describe("版式工作台接线", () => {
  const canvas = read("client/src/components/canvas/InfiniteCanvas.tsx");
  const panel = read("client/src/components/canvas/CanvasTemplatePanel.tsx");

  it("入口固定在顶部命令栏最左侧，且不占用画布工具模式", () => {
    const toolsStart = canvas.indexOf("const tools = [");
    const templatesAt = canvas.indexOf('id: "templates"', toolsStart);
    const moveAt = canvas.indexOf('id: "move"', toolsStart);
    expect(templatesAt).toBeGreaterThan(toolsStart);
    expect(templatesAt).toBeLessThan(moveAt);
    expect(canvas).toContain("TEMPLATE_PANEL_TOGGLE_EVENT");
    expect(canvas).toContain("PanelsTopLeft");
  });

  it("新节点类型与画板联动都接上了（不是只建了组件）", () => {
    expect(canvas).toContain('templatePiece: TemplatePieceNode');
    expect(canvas).toContain('n.type === "asset" || n.type === "templatePiece"');
    expect(canvas).toContain('item.type !== "asset" && item.type !== "templatePiece"');
    expect(canvas).toContain("collectTemplatePieces(nodesRef.current, frameNode.id)");
  });

  it("放置、打印、属性、引用四个出口都有监听", () => {
    for (const event of [
      "TEMPLATE_PLACE_EVENT",
      "TEMPLATE_PRINT_EVENT",
      "TEMPLATE_PIECE_PATCH_EVENT",
      "TEMPLATE_PIECE_REFERENCE_EVENT",
    ]) {
      expect(
        new RegExp(`window\\.addEventListener\\(\\s*${event}\\b`).test(canvas)
      ).toBe(true);
    }
    // 选中事件方向相反：画布派发、面板监听
    expect(canvas).toContain("new CustomEvent(TEMPLATE_SELECTION_EVENT");
    expect(panel).toContain("window.addEventListener(TEMPLATE_SELECTION_EVENT");
    expect(canvas).toContain("computeTemplatePlacement(bounds, size.display)");
  });

  it("引用图片直接写入 referencedAssets，没有误走 asset 专用入口", () => {
    expect(canvas).toContain("setReferencedAssets(prev =>");
    expect(canvas).toContain("版式子单元不是 asset 节点");
  });

  it("UI、图标、文案都是本平台自己的，且把 0 积分写在明处", () => {
    expect(panel).toContain("版式工作台");
    expect(panel).toContain("打印不消耗积分");
    expect(panel).toContain("引用到节日提示词");
    expect(TEMPLATE_CREDIT_COST).toBe(0);
    for (const banned of ["搜索全部模板", "添加模板", "印刷 PDF", "已添加", "图片占位"]) {
      expect(panel).not.toContain(banned);
    }
  });
});
