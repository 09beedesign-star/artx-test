import { describe, expect, it } from "vitest";
import { buildImagePdf, mmToPt } from "@/lib/canvas-print-pdf";

describe("最小 PDF 生成", () => {
  it("A4 换算为 595.28 × 841.89 pt", () => {
    expect(mmToPt(210)).toBeCloseTo(595.28, 1);
    expect(mmToPt(297)).toBeCloseTo(841.89, 1);
  });

  it("多页结构正确，xref 偏移指向真实对象", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = buildImagePdf([{ jpeg, width: 2, height: 3 }, { jpeg, width: 2, height: 3 }], 595.28, 841.89);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = text.slice(startxref).split("\n").slice(3, 3 + 8);
    entries.forEach((line, idx) => {
      const off = Number(line.slice(0, 10));
      expect(text.slice(off, off + 12).startsWith(`${idx + 1} 0 obj`)).toBe(true);
    });
  });
});
