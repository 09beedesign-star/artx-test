/** 🔒 打印容器列表：取图口径必须与画布其它出口一致（多出口事故 A）。 */
import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { buildPrintableItems, CANVAS_PRINT_OPEN_EVENT } from "@/lib/canvas-print-items";

function n(id: string, type: string, data: Record<string, unknown>, style: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data, style } as Node;
}

describe("可打印容器", () => {
  it("图片节点优先 localSrc，其次 sourceUrl", () => {
    const items = buildPrintableItems([
      n("a", "asset", { localSrc: "data:image/png;base64,AA", sourceUrl: "https://x/a.png", title: "主图" }),
      n("b", "asset", { sourceUrl: "https://x/b.png", title: "网页图" }),
    ]);
    expect(items.map(i => i.id)).toEqual(["a", "b"]);
    expect(items[0].src).toContain("data:image/png");
    expect(items[0].name).toBe("主图");
    expect(items[1].src).toBe("https://x/b.png");
  });

  it("没有图片源的节点跳过，不会产出打不开的空页", () => {
    expect(buildPrintableItems([n("a", "asset", { title: "空" })])).toEqual([]);
  });

  it("版式画板走同一个 SVG 出口（renderTemplateSvg），不是另画一份", () => {
    const piece = { id: "p1", x: 0, y: 0, w: 1, h: 1, kind: "shape", order: 0 };
    const items = buildPrintableItems([
      n("f1", "canvasFrame", { title: "年度报告封面", templateLayoutId: "tpl-001" }, { width: 800, height: 1131 }),
      n("p1", "templatePiece", { embeddedInFrame: "f1", piece }),
      n("noise", "text", { text: "忽略" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("frame");
    expect(items[0].src).toContain("data:image/svg+xml");
    expect(items[0].naturalWidth).toBe(800);
  });

  it("事件常量稳定，命令栏与画布用同一个", () => {
    expect(CANVAS_PRINT_OPEN_EVENT).toBe("canvas-print-open");
  });
});
