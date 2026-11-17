/**
 * 2026-11-17：植入版式工作台的模板，可编辑文案统一为
 * 「欢迎使用Artxstudio模板，双击文案可编辑。」，且双击真的能改。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_DEFAULT_COPY_ZH,
  buildTemplatePieces,
  fitTemplateCopy,
  isTemplateCopyPiece,
  pickTemplateVariant,
} from "./canvas-templates";
import { TEMPLATE_CATALOG } from "./canvas-template-catalog";

const flat = (t?: string) => (t || "").replace(/\n/g, "");

describe("模板统一文案", () => {
  it("文案原样", () => {
    expect(TEMPLATE_DEFAULT_COPY_ZH).toBe("欢迎使用Artxstudio模板，双击文案可编辑。");
  });

  it("全部 104 个版式 × 全部几何变体：每段可编辑文案都换成统一文案", () => {
    let copyCount = 0;
    for (const layout of TEMPLATE_CATALOG.layouts) {
      for (const geometry of layout.v) {
        const pieces = buildTemplatePieces(layout, geometry, 0.707);
        for (const p of pieces.filter(isTemplateCopyPiece)) {
          copyCount += 1;
          expect(flat(p.text)).toBe(TEMPLATE_DEFAULT_COPY_ZH);
          expect(p.pathText).toBe(false);
          expect(Math.abs(p.rotation || 0)).not.toBe(90);
        }
      }
    }
    expect(copyCount).toBeGreaterThan(1000);
  });

  it("旧的英文占位 / 「在此补充文字」一条都不剩", () => {
    for (const layout of TEMPLATE_CATALOG.layouts) {
      const pieces = buildTemplatePieces(layout, pickTemplateVariant(layout, 0.707), 0.707);
      const texts = pieces.filter(isTemplateCopyPiece).map(p => p.text).join(" ");
      expect(texts).not.toContain("在此补充文字");
      expect(texts).not.toMatch(/MARK|SHARD|BLOCK/);
      if (layout.pt) expect(texts).not.toContain(layout.pt);
    }
  });

  it("版式骨架不动：品牌行、编号、页码、图位标签保留", () => {
    const layout = TEMPLATE_CATALOG.layouts.find(l => !pickTemplateVariant(l, 0.707).hc)!;
    const pieces = buildTemplatePieces(layout, pickTemplateVariant(layout, 0.707), 0.707);
    expect(pieces.find(p => p.name === "页眉标识")?.text).toContain("ARTX");
    expect(pieces.find(p => p.name === "页码")?.text).toMatch(/^\d+$/);
    for (const p of pieces.filter(x => x.kind === "placeholder")) {
      expect(p.text).toMatch(/^图位 \d+/);
    }
  });

  it("字号只缩不放，且不撑破原文字框", () => {
    const fit = fitTemplateCopy({ w: 0.3, h: 0.04 }, 0.707, 0.05, 1.12);
    expect(fit.sizeRatio).toBeLessThanOrEqual(0.05);
    const lines = fit.text.split("\n");
    const em = Math.max(...lines.map(l => [...l].reduce((s, c) => s + (/[\u2E80-\uFFEF]/.test(c) ? 1 : 0.56), 0)));
    expect(em * fit.sizeRatio).toBeLessThanOrEqual(0.3 * 0.707 + 1e-9);
    expect(lines.length * 1.12 * fit.sizeRatio).toBeLessThanOrEqual(0.04 + 1e-9);
    // 宽框给足空间时不放大
    expect(fitTemplateCopy({ w: 1, h: 1 }, 1, 0.02, 1.12).sizeRatio).toBe(0.02);
  });
});

describe("双击真的能编辑（源码接线）", () => {
  const node = readFileSync("client/src/components/canvas/TemplatePieceNode.tsx", "utf8");
  it("文字单元挂了 onDoubleClick → 文本框", () => {
    expect(node).toContain("onDoubleClick={startEdit}");
    // 原生 dblclick 会被「选中→重渲染」吞掉，必须有 click.detail 这条主路径
    expect(node).toMatch(/e\.detail >= 2 && !editing\) startEdit\(e\)/);
    expect(node).toContain('data-testid="template-piece-text-editor"');
    expect(node).toContain("nodrag nopan");
  });
  it("写回只走画布的补丁事件，组件不碰 setNodes", () => {
    expect(node).toContain("TEMPLATE_PIECE_PATCH_EVENT");
    expect(node).not.toMatch(/setNodes\(|useReactFlow/);
    expect(node).toMatch(/patch: \{ text: draft \}/);
  });
  it("Esc 放弃、失焦保存、取消选中也保存", () => {
    expect(node).toContain('e.key === "Escape"');
    expect(node).toContain("onBlur={commit}");
    expect(node).toMatch(/editing && !selected\) textareaRef\.current\?\.blur\(\)/);
  });
});
