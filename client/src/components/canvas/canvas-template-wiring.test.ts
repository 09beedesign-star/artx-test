/**
 * 版式工作台接线守护。
 *
 * 这些断言读的是源码文本：本项目已经踩过十四次「同一份逻辑多个出口，
 * 只改一个等于没做」，这里把最容易被顺手删掉的几个出口钉住。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import ts from "typescript";
import { CANVAS_TEMPLATES_ENABLED, TEMPLATE_CREDIT_COST } from "../../lib/canvas-templates";
import { assertStripKeptSource, stripSourceComments } from "../../../../shared/strip-source-comments";

const sourceCache = new Map<string, string>();
function read(relative: string, anchors: string[]) {
  const cached = sourceCache.get(relative);
  if (cached !== undefined) return cached;
  const raw = readFileSync(resolve(process.cwd(), relative), "utf8");
  // 共用剥离器不解析字面量；先用 TS 语法树保护字面量，避免把正则中的 // 当注释。
  const syntax = ts.createSourceFile(relative, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const literals: { start: number; end: number; text: string; placeholder: string }[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isRegularExpressionLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail) {
      const start = node.getStart(syntax);
      const text = raw.slice(start, node.end);
      const placeholder = `ARTX_LITERAL_${start}_END`;
      expect(raw.includes(placeholder), "字面量占位符不能与原文冲突").toBe(false);
      literals.push({ start, end: node.end, text, placeholder });
    }
    ts.forEachChild(node, collect);
  };
  collect(syntax);
  const chunks: string[] = [];
  let cursor = 0;
  for (const literal of literals.sort((a, b) => a.start - b.start)) {
    chunks.push(raw.slice(cursor, literal.start), literal.placeholder);
    cursor = literal.end;
  }
  chunks.push(raw.slice(cursor));
  const literalByPlaceholder = new Map(literals.map(literal => [literal.placeholder, literal.text]));
  const restored: string[] = [];
  const source = stripSourceComments(chunks.join("")).replace(/ARTX_LITERAL_\d+_END/g, placeholder => {
    restored.push(placeholder);
    return literalByPlaceholder.get(placeholder)!;
  });
  expect(restored.sort(), "剥离后所有字面量都必须恰好恢复一次").toEqual([...literalByPlaceholder.keys()].sort());
  assertStripKeptSource(raw, source);
  // 同一 TS 打印器去注释后比较完整程序，不把百万字符源码作为失败 diff 输出。
  const strippedSyntax = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  expect(printer.printFile(strippedSyntax) === printer.printFile(syntax), `${relative} 剥离后完整程序必须保全`).toBe(true);
  expect(source.length, `${relative} 的注释剥离应实际生效`).toBeLessThan(raw.length);
  for (const anchor of anchors) {
    const count = raw.split(anchor).length - 1;
    expect(count, `${relative} 缺少真实代码锚点 ${anchor}`).toBeGreaterThan(0);
    expect(source.split(anchor).length - 1, `${relative} 剥注释误删 ${anchor}`).toBe(count);
  }
  sourceCache.set(relative, source);
  return source;
}

function between(source: string, startAnchor: string, endAnchor: string) {
  expect(source.split(startAnchor).length - 1, `起锚必须唯一：${startAnchor}`).toBe(1);
  expect(source.split(endAnchor).length - 1, `止锚必须唯一：${endAnchor}`).toBe(1);
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor);
  expect(end, "止锚必须在起锚之后").toBeGreaterThan(start);
  const body = source.slice(start, end);
  expect(body.length).toBeGreaterThan(startAnchor.length);
  return body;
}

function readCard(panel: string) {
  const cards = [...panel.matchAll(/<button\b[\s\S]*?<\/button>/g)]
    .map(match => match[0]).filter(button => button.includes("data-artx-template-card="));
  expect(cards).toHaveLength(1);
  return cards[0]!;
}

describe("版式工作台接线", () => {
  let canvas: string;
  let panel: string;
  let properties: string;
  beforeEach(() => {
    canvas = read("client/src/components/canvas/InfiniteCanvas.tsx", [
      "const tools = [", "templatePiece: TemplatePieceNode", "const handlePieceReference =",
      "collectTemplatePieces(nodesRef.current, frameNode.id)",
    ]);
    panel = read("client/src/components/canvas/CanvasTemplatePanel.tsx", [
      "const FIGMA_ROWS:", "const LOCAL_ROWS:", "const rows = useMemo(",
      "const place =", "data-artx-template-card={layout.i}", "src={thumb.src}",
      "{layout.n}", "data-artx-template-import=",
    ]);
    properties = read("client/src/components/canvas/TemplatePiecePropertiesPanel.tsx", [
      "window.addEventListener(TEMPLATE_SELECTION_EVENT", "window.removeEventListener(TEMPLATE_SELECTION_EVENT",
    ]);
  });

  it("入口固定在顶部命令栏最左侧，且不占用画布工具模式", () => {
    const toolsStart = canvas.indexOf("const tools = [");
    const templatesAt = canvas.indexOf('id: "templates"', toolsStart);
    const moveAt = canvas.indexOf('id: "move"', toolsStart);
    expect(templatesAt).toBeGreaterThan(toolsStart);
    expect(templatesAt).toBeLessThan(moveAt);
    expect(canvas).toContain("TEMPLATE_PANEL_TOGGLE_EVENT");
    expect(canvas).toContain("PanelsTopLeft");
  });

  it("🔒 2026-11-15 恢复：入口已打开，同时保留开关过滤代码", () => {
    expect(CANVAS_TEMPLATES_ENABLED).toBe(true);
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
    const reference = between(canvas, "const handlePieceReference =", "const handlePieceCommand =");
    expect(reference).toContain("if (!asset?.id || !asset?.src) return;");
    expect(reference).toContain("setReferencedAssets(prev =>");
    expect(reference).toContain("prev.some(item => item.id === asset.id) ? prev : [...prev, asset]");
    expect(reference).not.toMatch(/addReferencedAsset\s*\(/);
  });

  it("模板面板保持黑白风搜索与计数，禁止旧灰字和旧按钮文案复活", () => {
    expect(panel).toMatch(/<h2\b[^>]*>模板<\/h2>/);
    expect(panel).toContain('placeholder="搜索全部模板"');
    expect(panel).toContain("data-artx-template-search");
    expect(panel).toContain("data-artx-template-count");
    expect(panel).not.toMatch(/个容器|导入到画布/);
    const card = readCard(panel);
    expect(card).not.toMatch(/thumb\.containers|layout\.c\b|color:\s*muted/);
    // 黑白配色：不许再出现 teal 渐变 / 强调色
    for (const banned of ["#0f766e", "#7dd3c0", "linear-gradient(90deg"]) {
      expect(panel).not.toContain(banned);
    }
    // ⚠️ 打印相关参数全部挪走，面板里一个都不能留
    for (const banned of [
      "纸张与输出参数", "TEMPLATE_PAPER_PRESETS", "TEMPLATE_RESOLUTIONS[", "TEMPLATE_BLEED_OPTIONS",
      "出血", "分辨率", "打印不消耗积分", "TEMPLATE_CREDIT_COST", "TEMPLATE_PRINT_NOTE",
      "Printer", "Ruler", "0 积分", "window.print(", "new CustomEvent(TEMPLATE_PRINT_EVENT",
    ]) {
      expect(panel, `模板面板不该出现 ${banned}`).not.toContain(banned);
    }
    expect(TEMPLATE_CREDIT_COST).toBe(0);
  });

  it("模板卡片只有缩略图与名称，不能插回副标题或额外信息", () => {
    const card = readCard(panel);
    const content = card.slice(card.indexOf(">", card.indexOf("style={{")) + 1, card.lastIndexOf("</button>"));
    // 精确限定两层内容：缩略图框内只有 img，之后只有名称 div；任意额外灰字都会失败。
    expect(content).toMatch(/^\s*<div\s+style=\{\{[\s\S]*?\}\}>\s*<img\b[^>]*\/>\s*<\/div>\s*<div\s+style=\{\{[^}]*\}\}>\s*\{layout\.n\}\s*<\/div>\s*$/);
    expect(content.match(/<img\b/g)).toHaveLength(1);
    expect(content.match(/<div\b/g)).toHaveLength(2);
    expect(content.match(/<\/div>/g)).toHaveLength(2);
    expect(content).toMatch(/<img\s+src=\{thumb\.src\}/);
    expect(content).not.toMatch(/thumb\.containers|layout\.c\b|个容器|<span\b|<p\b/);
  });

  it("模板列表三列网格间距必须为 20，不得误锁卡片内部 grid", () => {
    const grid = panel.match(/<div\s+style=\{\{([^\n]+)\}\}>\s*\{rows\.map\(layout => \{/);
    expect(grid, "未找到承载 rows.map 的实际网格").not.toBeNull();
    expect(grid![1]).toMatch(/display:\s*"grid"\s*,/);
    expect(grid![1]).toMatch(/gridTemplateColumns:\s*"repeat\(3, minmax\(0, 1fr\)\)"\s*,/);
    expect(grid![1]).toMatch(/\bgap:\s*20\s*$/);
  });

  it("单击选择、双击放置、底部加载和事件载荷必须保持接通", () => {
    const card = readCard(panel);
    expect(panel).toContain("const [pickedId, setPickedId] = useState<string | null>(null);");
    const rows = between(panel, "{rows.map(layout => {", "data-artx-template-card={layout.i}");
    expect(rows).toContain("const active = pickedId === layout.i;");
    expect(card).toContain("aria-pressed={active}");
    expect(card).toContain("onClick={() => setPickedId(layout.i)}");
    expect(card).toContain("onDoubleClick={() => place(layout.i)}");
    const loads = [...panel.matchAll(/<button\b[\s\S]*?<\/button>/g)]
      .map(match => match[0]).filter(button => button.includes("data-artx-template-import="));
    expect(loads).toHaveLength(1);
    const load = loads[0]!;
    expect(load).toContain("disabled={!pickedId}");
    expect(load).toContain("onClick={() => pickedId && place(pickedId)}");
    expect(load).toMatch(/>\s*加载到画布\s*<ArrowRight\b/);
    const place = between(panel, "const place =", "if (!open) return null;");
    expect(place).toContain("const row = ALL_ROWS.find(r => r.i === layoutId);");
    expect(place).toMatch(/window\.dispatchEvent\(new CustomEvent\(TEMPLATE_PLACE_EVENT,\s*\{\s*detail:\s*\{/);
    for (const field of ["layoutId,", 'paperId: row?.paperId ?? "a4",', 'orientation: row?.orientation ?? "portrait",', 'resolutionId: "dpi-300",', "bleedMm: 0,"])
      expect(place).toContain(field);
    expect(place).not.toMatch(/TEMPLATE_PRINT_EVENT|window\.print\(/);
  });

  it("面板派发事件不得谎报成功，画布必须查到模板并创建节点后才提示", () => {
    const place = between(panel, "const place =", "if (!open) return null;");
    expect(place).not.toMatch(/toast\s*\.\s*success\s*\(/);
    const handle = between(canvas, "const handlePlace =", "const handlePrint =");
    expect(handle).toContain("getTemplateLayout(detail?.layoutId)");
    expect(handle).toMatch(/if\s*\(!layout\)\s*\{\s*toast\.error\([^;]+;\s*return;/);
    expect(handle).toContain("const created = buildTemplateNodes(layout,");
    expect(handle).toMatch(/setNodes\(nds => \[\s*\.\.\.nds\.map\([\s\S]*?\.\.\.created,\s*\]\);/);
    expect(handle.indexOf("toast.success(")).toBeGreaterThan(handle.indexOf("...created,"));
  });

  it("打印参数仍完整保留在画布右上角的打印工具里", () => {
    const printPanel = read("client/src/components/canvas/CanvasPrintPanel.tsx", [
      "TEMPLATE_PAPER_PRESETS", "TEMPLATE_RESOLUTIONS", "TEMPLATE_BLEED_OPTIONS",
    ]);
    for (const label of ["目标打印机", "布局", "纸张", "分辨率", "出血", "更多设置", "打印不消耗积分"]) {
      expect(printPanel).toContain(label);
    }
    for (const [control, state, setter, options] of [
      ["paper", "paperId", "setPaperId", "TEMPLATE_PAPER_PRESETS"],
      ["resolution", "resolutionId", "setResolutionId", "TEMPLATE_RESOLUTIONS"],
      ["bleed", "bleedMm", "setBleedMm", "TEMPLATE_BLEED_OPTIONS"],
    ]) {
      const selects = [...printPanel.matchAll(/<select\b[\s\S]*?<\/select>/g)]
        .map(match => match[0]).filter(select => select.includes(`data-artx-print-${control}=`));
      expect(selects, `打印参数 ${control} 必须实际渲染且唯一`).toHaveLength(1);
      expect(selects[0]).toContain(`value={${state}}`);
      expect(selects[0]).toContain(`${setter}(`);
      expect(selects[0]).toContain(`${options}.map(`);
    }
  });
});
