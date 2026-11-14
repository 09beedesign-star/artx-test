/**
 * 版式工作台接线守护。
 *
 * 这些断言读的是源码文本：本项目已经踩过十四次「同一份逻辑多个出口，
 * 只改一个等于没做」，这里把最容易被顺手删掉的几个出口钉住。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CANVAS_TEMPLATES_ENABLED, TEMPLATE_CREDIT_COST } from "@/lib/canvas-templates";

const read = (relative: string) =>
  readFileSync(resolve(process.cwd(), relative), "utf8");

describe("版式工作台接线", () => {
  const canvas = read("client/src/components/canvas/InfiniteCanvas.tsx");
  const panel = read("client/src/components/canvas/CanvasTemplatePanel.tsx");
  const properties = read("client/src/components/canvas/TemplatePiecePropertiesPanel.tsx");

  it("入口固定在顶部命令栏最左侧，且不占用画布工具模式", () => {
    const toolsStart = canvas.indexOf("const tools = [");
    const templatesAt = canvas.indexOf('id: "templates"', toolsStart);
    const moveAt = canvas.indexOf('id: "move"', toolsStart);
    expect(templatesAt).toBeGreaterThan(toolsStart);
    expect(templatesAt).toBeLessThan(moveAt);
    expect(canvas).toContain("TEMPLATE_PANEL_TOGGLE_EVENT");
    expect(canvas).toContain("PanelsTopLeft");
  });

  it("🔒 2026-11-14 暂时屏蔽：入口被开关过滤掉，前端不显示（代码保留）", () => {
    expect(CANVAS_TEMPLATES_ENABLED).toBe(false);
    expect(canvas).toContain('tool => tool.id !== "templates" || CANVAS_TEMPLATES_ENABLED');
  });

  it("新节点类型与画板联动都接上了（不是只建了组件）", () => {
    expect(canvas).toContain('templatePiece: TemplatePieceNode');
    expect(canvas).toContain('n.type === "asset" || n.type === "templatePiece"');
    expect(canvas).toContain('item.type !== "asset" && item.type !== "templatePiece"');
    expect(canvas).toContain("collectTemplatePieces(nodesRef.current, frameNode.id)");
  });

  it("放置、打印、属性、引用、命令五个出口都有监听与清理", () => {
    for (const event of [
      "TEMPLATE_PLACE_EVENT",
      "TEMPLATE_PRINT_EVENT",
      "TEMPLATE_PIECE_PATCH_EVENT",
      "TEMPLATE_PIECE_REFERENCE_EVENT",
      "TEMPLATE_PIECE_COMMAND_EVENT",
    ]) {
      expect(
        new RegExp(`window\\.addEventListener\\(\\s*${event}\\b`).test(canvas),
        `${event} 没接上`
      ).toBe(true);
      expect(
        new RegExp(`window\\.removeEventListener\\(\\s*${event}\\b`).test(canvas),
        `${event} 没清理`
      ).toBe(true);
    }
    // 选中事件方向相反：画布派发、属性面板监听（模板面板已不再持有选中态）
    expect(canvas).toContain("new CustomEvent(TEMPLATE_SELECTION_EVENT");
    expect(properties).toContain("window.addEventListener(TEMPLATE_SELECTION_EVENT");
    expect(canvas).toContain("computeTemplatePlacement(bounds, size.display)");
  });

  it("引用图片直接写入 referencedAssets，没有误走 asset 专用入口", () => {
    expect(canvas).toContain("setReferencedAssets(prev =>");
    expect(canvas).toContain("版式子单元不是 asset 节点");
  });

  it("🔒 模板面板按参考截图：黑白风「模板」，只提供选择与导入", () => {
    expect(panel).toContain("模板");
    expect(panel).toContain("搜索全部模板");
    expect(panel).toContain("data-artx-template-search");
    expect(panel).toContain("data-artx-template-count");
    expect(panel).toContain("data-artx-template-card={layout.i}");
    expect(panel).toContain("个容器 ·");
    expect(panel).toContain("data-artx-template-import");
    expect(panel).toContain("导入到画布");
    // 黑白配色：不许再出现 teal 渐变 / 强调色
    for (const banned of ["#0f766e", "#7dd3c0", "linear-gradient(90deg"]) {
      expect(panel).not.toContain(banned);
    }
    // ⚠️ 打印相关参数全部挪走，面板里一个都不能留
    for (const banned of [
      "纸张与输出参数", "TEMPLATE_PAPER_PRESETS", "TEMPLATE_RESOLUTIONS[", "TEMPLATE_BLEED_OPTIONS",
      "出血", "分辨率", "打印不消耗积分", "TEMPLATE_CREDIT_COST", "TEMPLATE_PRINT_NOTE",
      "Printer", "Ruler", "0 积分",
    ]) {
      expect(panel, `模板面板不该出现 ${banned}`).not.toContain(banned);
    }
    expect(TEMPLATE_CREDIT_COST).toBe(0);
  });

  it("🔒 打印参数仍完整保留在画布右上角的打印工具里", () => {
    const printPanel = read("client/src/components/canvas/CanvasPrintPanel.tsx");
    for (const label of ["目标打印机", "布局", "纸张", "分辨率", "出血", "更多设置", "打印不消耗积分"]) {
      expect(printPanel).toContain(label);
    }
    expect(printPanel).toContain("TEMPLATE_PAPER_PRESETS");
    expect(printPanel).toContain("TEMPLATE_RESOLUTIONS");
    expect(printPanel).toContain("TEMPLATE_BLEED_OPTIONS");
  });
});
