import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { FIGMA_LAYOUT_CATEGORIES, figmaLayoutCount, getFigmaLayout } from "./canvas-figma-layouts";
import {
  DEFAULT_PIECE_SHADOW,
  buildFigmaTemplatePieces,
  renderPieceSvg,
  renderTemplateSvg,
} from "./canvas-templates";
import { buildTemplatePptx } from "./canvas-template-pptx";
import { buildJpegPdf, cropJobToPiece, jobToSvg } from "./canvas-template-export";

describe("Figma Layout 导入：分类 = 每排黑色封面", () => {
  it("7 个分类、103 个版式，id 唯一且都以 fg- 开头", () => {
    expect(FIGMA_LAYOUT_CATEGORIES).toHaveLength(7);
    const ids = FIGMA_LAYOUT_CATEGORIES.flatMap(c => c.layouts.map(l => l.i));
    expect(ids).toHaveLength(103);
    expect(new Set(ids).size).toBe(103);
    expect(figmaLayoutCount()).toBe(103);
    for (const id of ids) expect(id.startsWith("fg-")).toBe(true);
    // 封面本身不进模板
    const covers = new Set(FIGMA_LAYOUT_CATEGORIES.map(c => c.coverId));
    for (const c of FIGMA_LAYOUT_CATEGORIES) for (const l of c.layouts) expect(covers.has(l.figmaId)).toBe(false);
  });

  it("每个分类内版式与封面同比例（同排口径）", () => {
    for (const c of FIGMA_LAYOUT_CATEGORIES) {
      for (const l of c.layouts) {
        expect(l.orientation ?? c.orientation).toBe(c.orientation);
        expect(c.orientation === "landscape" ? l.w >= l.h : l.h >= l.w).toBe(true);
      }
    }
  });

  it("统一文案：所有正文都是 Artxstudio 欢迎语，编号类保留", () => {
    let texts = 0;
    for (const c of FIGMA_LAYOUT_CATEGORIES) {
      for (const l of c.layouts) {
        for (const p of buildFigmaTemplatePieces(l)) {
          if (p.role === "文字") { texts += 1; expect((p.text || "").replace(/\s+/g, "")).toBe("欢迎使用Artxstudio模板，双击文案可编辑。"); }
        }
      }
    }
    expect(texts).toBeGreaterThan(100);
  });
});

describe("投影 / 导出", () => {
  const layout = FIGMA_LAYOUT_CATEGORIES[0].layouts[0];
  const pieces = buildFigmaTemplatePieces(layout);

  it("投影开启后 SVG 带 feDropShadow，且按节点 id 隔离", () => {
    const p = { ...pieces[0], shadow: { ...DEFAULT_PIECE_SHADOW } };
    const svg = renderPieceSvg(p, 800, 600, "node-1");
    expect(svg).toContain("feDropShadow");
    expect(svg).toContain('id="artxTplnode-1Sh"');
    expect(renderPieceSvg({ ...p, shadow: { ...DEFAULT_PIECE_SHADOW, enabled: false } }, 800, 600, "n")).not.toContain("feDropShadow");
  });

  it("单元裁切 SVG 的尺寸 = 单元尺寸", () => {
    const job = { pieces, width: 1200, height: 848, background: layout.bg, name: "t" };
    const piece = pieces.find(p => p.w < 0.9) || pieces[0];
    const svg = jobToSvg(cropJobToPiece(job, piece));
    expect(svg).toContain(`width="${Math.round(piece.w * 1200)}"`);
    expect(renderTemplateSvg(pieces, 1200, 848, layout.bg)).toContain("<svg");
  });

  it("PPTX 是合法 OOXML 包，文案作为可编辑文本", async () => {
    const blob = await buildTemplatePptx({ pieces, width: 1200, height: 848, background: layout.bg, title: "t" });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const f of ["[Content_Types].xml", "ppt/presentation.xml", "ppt/slides/slide1.xml", "ppt/slideMasters/slideMaster1.xml"]) {
      expect(zip.file(f), f).toBeTruthy();
    }
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("<p:sp>");
    expect(slide).toContain("Artxstudio");
  });

  it("PDF 头尾与 xref 正确", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = new Uint8Array(await buildJpegPdf(jpeg, 10, 10, 100, 70).arrayBuffer());
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const off = Number(text.match(/0000000000 65535 f \n(\d{10})/)![1]);
    expect(text.slice(off, off + 7)).toBe("1 0 obj");
  });

  it("getFigmaLayout 能按 id 取回", () => {
    expect(getFigmaLayout(layout.i)?.figmaId).toBe(layout.figmaId);
  });
});
