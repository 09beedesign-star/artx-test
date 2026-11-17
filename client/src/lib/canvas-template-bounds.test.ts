/**
 * 2026-11-17 模板「创建文字 / 导入图片 / 边界判定 / 批量序列号导出」回归。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Node } from "@xyflow/react";
import {
  createTemplateImagePiece,
  createTemplateTextPiece,
  findTemplateFrameAt,
  isPieceInsideTemplate,
  renderTemplateSvg,
  syncDraggedTemplatePiece,
  templatePieceToNode,
  type TemplatePiece,
} from "./canvas-templates";
import { serialFileNames } from "./canvas-template-export";
import { buildPrintableItems } from "./canvas-print-items";

const frame: Node = {
  id: "f1",
  type: "canvasFrame",
  position: { x: 100, y: 200 },
  style: { width: 800, height: 600 },
  data: { width: 800, height: 600, templateLayoutId: "x", bgColor: "#ffffff" },
};
const frame2: Node = { ...frame, id: "f2", position: { x: 2000, y: 200 } };
const plainFrame: Node = { ...frame, id: "plain", position: { x: 5000, y: 0 }, data: { width: 800, height: 600 } };

const piece = (p: Partial<TemplatePiece>): TemplatePiece => ({
  id: "p", name: "p", role: "图形", kind: "rect", x: 0, y: 0, w: 0.1, h: 0.1, order: 0, fill: "#f00", ...p,
});

describe("模板边界 = 中心点口径（与画板入画 / 出画一致）", () => {
  it("中心点在 [0,1] 内算模板内，超出算模板外", () => {
    expect(isPieceInsideTemplate(piece({ x: 0.5, y: 0.5 }))).toBe(true);
    // 大半截在外、中心仍在内 → 仍属于模板
    expect(isPieceInsideTemplate(piece({ x: -0.04, y: 0.2 }))).toBe(true);
    // 中心点出界 → 出画
    expect(isPieceInsideTemplate(piece({ x: 0.96, y: 0.2 }))).toBe(false);
    expect(isPieceInsideTemplate(piece({ x: 0.2, y: -0.2 }))).toBe(false);
  });

  it("打印出口剔除出画单元（与导出同口径）", () => {
    const inside = templatePieceToNode(frame, piece({ id: "in", x: 0.1, y: 0.1, fill: "#00ff00" }), 1);
    const outside = templatePieceToNode(frame, piece({ id: "out", x: 1.5, y: 0.1, fill: "#0000ff" }), 2);
    const [item] = buildPrintableItems([frame, inside, outside]);
    const svg = decodeURIComponent(item.src.split(",")[1]);
    expect(svg).toContain("#00ff00");
    expect(svg).not.toContain("#0000ff");
  });

  it("findTemplateFrameAt 只认模板画板，不认普通画板", () => {
    expect(findTemplateFrameAt([frame, frame2], { x: 150, y: 250 })?.id).toBe("f1");
    expect(findTemplateFrameAt([frame, frame2], { x: 2100, y: 250 })?.id).toBe("f2");
    expect(findTemplateFrameAt([frame, plainFrame], { x: 5100, y: 100 })).toBeNull();
    expect(findTemplateFrameAt([frame], { x: 0, y: 0 })).toBeNull();
  });
});

describe("拖动结束写回坐标 + 入画 / 出画", () => {
  it("在模板内移动：piece.x/y 按新位置重算（导出读到新位置）", () => {
    const n = templatePieceToNode(frame, piece({ id: "a", x: 0.1, y: 0.1 }), 1);
    const moved = { ...n, position: { x: 100 + 400, y: 200 + 300 } };
    const synced = syncDraggedTemplatePiece(moved, [frame, moved]);
    const p = (synced.data as Record<string, unknown>).piece as TemplatePiece;
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
    expect((synced.data as Record<string, unknown>).embeddedInFrame).toBe("f1");
  });

  it("中心点拖出模板 → 解除归属（不再随模板导出 / 跟随移动）", () => {
    const n = templatePieceToNode(frame, piece({ id: "a" }), 1);
    const moved = { ...n, position: { x: 1200, y: 200 } };
    const synced = syncDraggedTemplatePiece(moved, [frame, moved]);
    expect((synced.data as Record<string, unknown>).embeddedInFrame).toBeUndefined();
  });

  it("拖进另一套模板 → 归属切换，像素尺寸不变", () => {
    const n = templatePieceToNode(frame, piece({ id: "a", w: 0.1, h: 0.1 }), 1);
    const moved = { ...n, position: { x: 2100, y: 300 } };
    const synced = syncDraggedTemplatePiece(moved, [frame, frame2, moved]);
    const d = synced.data as Record<string, unknown>;
    expect(d.embeddedInFrame).toBe("f2");
    const p = d.piece as TemplatePiece;
    expect(p.w * 800).toBeCloseTo(80);
    expect(p.x).toBeCloseTo(100 / 800);
  });
});

describe("创建文字 / 导入图片", () => {
  it("点击位置 = 文字左上角，归属该模板", () => {
    const p = createTemplateTextPiece(frame, { x: 100 + 200, y: 200 + 150 });
    expect(p.kind).toBe("text");
    expect(p.x).toBeCloseTo(0.25);
    expect(p.y).toBeCloseTo(0.25);
    const node = templatePieceToNode(frame, p, 9, { autoEdit: true });
    const d = node.data as Record<string, unknown>;
    expect(d.embeddedInFrame).toBe("f1");
    expect(d.autoEdit).toBe(true);
    expect(node.position).toEqual({ x: 300, y: 350 });
  });

  it("图片单元按原图比例居中，并渲染进模板 SVG", () => {
    const p = createTemplateImagePiece(frame, "data:image/png;base64,AAAA", { width: 1000, height: 500 });
    expect(p.kind).toBe("image");
    expect(p.w * 800 / (p.h * 600)).toBeCloseTo(2);
    expect(p.x + p.w / 2).toBeCloseTo(0.5);
    const svg = renderTemplateSvg([p], 800, 600, "#fff");
    expect(svg).toContain("<image");
    expect(svg).toContain("data:image/png;base64,AAAA");
  });
});

describe("批量导出序列号命名", () => {
  it("重名模板也不会互相覆盖", () => {
    const names = serialFileNames(["海报", "海报", "海报"], "png");
    expect(names).toEqual(["海报_01.png", "海报_02.png", "海报_03.png"]);
    expect(new Set(names).size).toBe(3);
  });
  it("超过 99 个自动加宽序号位", () => {
    const names = serialFileNames(Array(120).fill("a"), "jpg");
    expect(names[0]).toBe("a_001.jpg");
    expect(names[119]).toBe("a_120.jpg");
  });
});

describe("接线（源码断言）", () => {
  const canvas = readFileSync(resolve(__dirname, "../components/canvas/InfiniteCanvas.tsx"), "utf8");
  it("顶部文字工具点在模板内 → 建模板文字单元", () => {
    const click = canvas.slice(canvas.indexOf("const handlePaneClick = useCallback("));
    const textBranch = click.slice(click.indexOf('if (activeToolMode === "text")'));
    expect(textBranch.indexOf("findTemplateFrameAt")).toBeGreaterThan(-1);
    expect(textBranch.indexOf("findTemplateFrameAt")).toBeLessThan(textBranch.indexOf('type: "text" as const'));
  });
  it("命令条 create-text / import-image 在提前 return 之前处理", () => {
    const cmd = canvas.slice(canvas.indexOf("const handlePieceCommand = "));
    const early = cmd.indexOf("if (!result.patches.length && !result.additions.length");
    expect(cmd.indexOf('result.mode === "create-text"')).toBeLessThan(early);
    expect(cmd.indexOf('result.mode === "import-image"')).toBeLessThan(early);
  });
  it("拖动结束同步模板单元坐标", () => {
    expect(canvas).toContain("syncDraggedTemplatePiece(n, nds)");
  });
  // 以下两条来自 2026-11-17 线上点测抓到的真 bug（单测全绿但点了零反应）
  const frameClick = canvas.slice(
    canvas.indexOf("const handleCanvasFrameClick = useCallback("),
    canvas.indexOf("const handleCanvasFrameDoubleClick")
  );
  it("文字工具激活时画板不吞点击（否则点模板内建文字零反应）", () => {
    const guard = frameClick.indexOf('canvasToolModeSnapshot.current === "text"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(frameClick.indexOf("e.stopPropagation()"));
    expect(canvas).toContain("canvasToolModeSnapshot.current = mode;");
  });
  it("画板 Ctrl/⌘ 点击累加选中（否则多选模板被覆盖成单选，批量导出走不到）", () => {
    expect(frameClick).toContain("e.ctrlKey || e.metaKey");
    expect(frameClick).not.toMatch(/selectedIds:\s*\[id\]/);
  });
  it("多画板不再拒绝，改为序列号批量导出", () => {
    expect(canvas).not.toContain("一次只能导出一个画板");
    expect(canvas).toContain("serialFileNames(");
  });
});
