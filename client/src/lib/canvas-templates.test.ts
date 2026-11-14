import { describe, expect, it } from "vitest";
import { TEMPLATE_CATALOG } from "./canvas-template-catalog";
import {
  TEMPLATE_CREDIT_COST,
  TEMPLATE_PAPER_PRESETS,
  TEMPLATE_RESOLUTIONS,
  buildTemplateNodes,
  buildTemplatePieces,
  computeTemplatePlacement,
  filterTemplateLayouts,
  pickTemplateVariant,
  renderPieceSvg,
  renderTemplateSvg,
  resolveTemplateSize,
  scaleSvgPath,
  TEMPLATE_PRINT_NOTE,
} from "./canvas-templates";

const A4_300 = TEMPLATE_RESOLUTIONS.find(r => r.kind === "dpi" && r.value === 300)!;

describe("版式目录", () => {
  it("分类、版式、ID 与文案都是本平台的", () => {
    expect(TEMPLATE_CATALOG.layouts).toHaveLength(104);
    expect(TEMPLATE_CATALOG.categories).toHaveLength(19);
    const ids = TEMPLATE_CATALOG.layouts.map(l => l.i);
    expect(new Set(ids).size).toBe(104);
    expect(ids.every(id => id.startsWith("tpl-"))).toBe(true);
    const blob = JSON.stringify(TEMPLATE_CATALOG);
    // 参考站的固定文案一个都不许留
    for (const banned of [
      "FORM STUDIO", "VISUAL SYSTEM", "图片占位", "栏网格", "视觉模块",
      "搜索全部模板", "添加模板", "印刷 PDF", "已添加",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("每个版式都保留 11 档长宽比与完整参数", () => {
    for (const layout of TEMPLATE_CATALOG.layouts) {
      expect(layout.g).toHaveLength(11);
      expect(layout.v.length).toBeGreaterThan(0);
      expect(layout.g.every(([, index]) => index < layout.v.length)).toBe(true);
      expect(layout.ts).toBeDefined();
      expect(layout.pc.mn).toBeLessThanOrEqual(layout.pc.mx);
      expect(layout.cl).toBeGreaterThan(0);
      for (const geo of layout.v) {
        expect(Array.isArray(geo.d)).toBe(true);
        expect(Array.isArray(geo.l)).toBe(true);
      }
    }
  });
});

describe("纸张 / 分辨率", () => {
  it("A4 竖版 300DPI 得到 2480×3508 左右", () => {
    const r = resolveTemplateSize({
      paperId: "a4", orientation: "portrait", resolution: A4_300, bleedMm: 0,
    });
    expect(r.print.width).toBe(2480);
    expect(r.print.height).toBe(3508);
    expect(r.display.width).toBe(794);
    expect(r.display.height).toBe(1123);
    expect(r.aspect).toBeLessThan(1);
  });

  it("横向会交换宽高，出血 3mm 会加进印刷尺寸", () => {
    const portrait = resolveTemplateSize({
      paperId: "a4", orientation: "portrait", resolution: A4_300, bleedMm: 0,
    });
    const landscape = resolveTemplateSize({
      paperId: "a4", orientation: "landscape", resolution: A4_300, bleedMm: 3,
    });
    expect(landscape.aspect).toBeGreaterThan(1);
    expect(landscape.print.width).toBeGreaterThan(portrait.print.height);
    expect(landscape.print.height).toBeGreaterThan(portrait.print.width);
  });

  it("4K 档位按长边出图，且不会超过浏览器画布上限", () => {
    const r = resolveTemplateSize({
      paperId: "a0", orientation: "portrait",
      resolution: TEMPLATE_RESOLUTIONS[TEMPLATE_RESOLUTIONS.length - 1],
      bleedMm: 0,
    });
    expect(Math.max(r.print.width, r.print.height)).toBe(4096);
    const huge = resolveTemplateSize({
      paperId: "a0", orientation: "portrait",
      resolution: TEMPLATE_RESOLUTIONS[3], bleedMm: 25,
    });
    expect(Math.max(huge.print.width, huge.print.height)).toBeLessThanOrEqual(8000);
    expect(huge.clamped).toBe(true);
  });

  it("所有纸张都能解析出正数尺寸", () => {
    for (const paper of TEMPLATE_PAPER_PRESETS) {
      const r = resolveTemplateSize({
        paperId: paper.id, orientation: "portrait", resolution: A4_300, bleedMm: 0,
      });
      expect(r.display.width).toBeGreaterThan(0);
      expect(r.display.height).toBeGreaterThan(0);
      expect(r.print.width).toBeGreaterThan(0);
      expect(r.print.height).toBeGreaterThan(0);
    }
  });

  it("打印 0 积分是明文写在产品里的", () => {
    expect(TEMPLATE_CREDIT_COST).toBe(0);
    expect(TEMPLATE_PRINT_NOTE).toContain("不消耗积分");
  });
});

describe("版式筛选与变体", () => {
  it("按分类 / 关键词 / 材质 / 长宽比过滤", () => {
    const cat = TEMPLATE_CATALOG.categories[0];
    const rows = filterTemplateLayouts({ category: cat, keyword: "", material: "all", aspect: 0.707 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.c === cat)).toBe(true);
    expect(filterTemplateLayouts({ category: "all", keyword: "绝不可能命中的词", material: "all", aspect: 1 }).length).toBe(0);
  });
  it("最接近的长宽比被选中", () => {
    const layout = TEMPLATE_CATALOG.layouts[0];
    expect(pickTemplateVariant(layout, 1)).toBeDefined();
    const nearest = layout.g.reduce((a, b) =>
      Math.abs(Math.log(b[0] / 0.71)) < Math.abs(Math.log(a[0] / 0.71)) ? b : a
    );
    expect(layout.v[nearest[1]]).toBe(pickTemplateVariant(layout, 0.71));
  });
});

describe("逐个向右放置，绝不重叠", () => {
  it("新画板落在所有已有节点右边界之外，顶部对齐", () => {
    const bounds = [
      { x: -400, y: 80, width: 300, height: 200 },
      { x: 1200, y: -30, width: 900, height: 500 },
      { x: 500, y: 220, width: 260, height: 140 },
    ];
    const size = { width: 794, height: 1123 };
    const p = computeTemplatePlacement(bounds, size);
    expect(p.x).toBe(1200 + 900 + 120);
    expect(p.y).toBe(-30);
    for (const b of bounds) {
      expect(p.x).toBeGreaterThanOrEqual(b.x + b.width);
    }
  });
  it("连续放 5 张，彼此不重叠", () => {
    const bounds: Array<{ x: number; y: number; width: number; height: number }> = [];
    const size = { width: 794, height: 1123 };
    for (let i = 0; i < 5; i += 1) {
      const p = computeTemplatePlacement(bounds, size);
      for (const b of bounds) {
        const overlap =
          p.x < b.x + b.width && p.x + size.width > b.x &&
          -30 < b.y + b.height && -30 + size.height > b.y;
        expect(overlap).toBe(false);
      }
      bounds.push({ x: p.x, y: p.y, width: size.width, height: size.height });
    }
    expect(bounds.map(b => b.x)).toEqual(
      [...bounds.map(b => b.x)].sort((a, b) => a - b)
    );
  });
  it("空画布从原点开始", () => {
    expect(computeTemplatePlacement([], { width: 100, height: 100 })).toEqual({ x: 0, y: 0 });
  });
});

describe("子单元与 SVG", () => {
  const layout =
    TEMPLATE_CATALOG.layouts.find(l => !pickTemplateVariant(l, 0.707).hc) ||
    TEMPLATE_CATALOG.layouts[0];
  const geo = pickTemplateVariant(layout, 0.707);
  const pieces = buildTemplatePieces(layout, geo);

  it("每个子单元都有名字、层级与归一化坐标", () => {
    expect(pieces.length).toBeGreaterThan(3);
    for (const p of pieces) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.role.length).toBeGreaterThan(0);
      expect(p.w).toBeGreaterThan(0);
      expect(p.h).toBeGreaterThan(0);
    }
    for (let i = 1; i < pieces.length; i += 1) {
      expect(pieces[i].order).toBeGreaterThanOrEqual(pieces[i - 1].order);
    }
  });

  it("页眉页脚用的是本平台文案", () => {
    const texts = pieces.filter(p => p.role === "页眉页脚").map(p => p.text).join(" ");
    expect(texts).toContain("ARTX");
    expect(texts).not.toContain("FORM STUDIO");
    expect(texts).not.toContain("图片占位");
  });

  it("整图与单单元的 SVG 都不含外链与源站文案", () => {
    const svg = renderTemplateSvg(pieces, 400, 566, "#ffffff");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    // 唯一允许的 http 是 svg 命名空间，禁止任何外链素材
    expect((svg.match(/http/g) || []).length).toBe(1);
    expect(svg).not.toContain("FORM STUDIO");
    const one = renderPieceSvg(pieces[0], 400, 566);
    expect(one.startsWith("<svg")).toBe(true);
  });

  it("文字基线落在单元盒子内，不会被 viewBox 削掉上半个字", () => {
    const textPiece = pieces.find(p => p.kind === "text" && p.text);
    expect(textPiece).toBeDefined();
    const svg = renderPieceSvg(textPiece!, 794, 1123);
    const viewBox = /viewBox="([^"]+)"/.exec(svg);
    const baseline = /<text[^>]*\by="([\d.]+)"/.exec(svg);
    expect(viewBox).not.toBeNull();
    expect(baseline).not.toBeNull();
    const top = Number(viewBox![1].split(" ")[1]);
    expect(Number(baseline![1])).toBeGreaterThanOrEqual(top);
  });

  it("路径缩放：M/L/C 都按单元尺寸映射", () => {
    expect(scaleSvgPath("M0 0 L1 1", 100, 200, 10, 20)).toBe("M10 20 L110 220");
    expect(scaleSvgPath("M0 .5 C.2 .1 .8 .9 1 1", 100, 100, 0, 0))
      .toBe("M0 50 C20 10 80 90 100 100");
  });

  it("生成的节点：画板 + 独立子单元，且都在画板范围内", () => {
    const nodes = buildTemplateNodes(layout, {
      frameId: "frame-tpl-1",
      position: { x: 300, y: 200 },
      size: { width: 794, height: 1123 },
      zIndex: 10,
      print: {
        paperId: "a4", orientation: "portrait", resolution: A4_300,
        bleedMm: 0, printWidth: 2480, printHeight: 3508,
      },
    });
    expect(nodes.length).toBe(pieces.length + 1);
    expect(nodes[0].type).toBe("canvasFrame");
    expect(nodes[0].selected).toBe(true);
    const children = nodes.slice(1);
    expect(children.every(n => n.type === "templatePiece")).toBe(true);
    expect(children.every(n => n.data.embeddedInFrame === "frame-tpl-1")).toBe(true);
    expect(new Set(children.map(n => n.id)).size).toBe(children.length);
    for (const n of children) {
      expect(n.position.x).toBeGreaterThanOrEqual(300);
      expect(n.position.y).toBeGreaterThanOrEqual(200);
    }
  });
});
