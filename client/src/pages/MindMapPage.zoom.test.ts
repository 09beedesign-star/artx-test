import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(resolve(__dirname, "MindMapPage.tsx"), "utf8");
const file = ts.createSourceFile("MindMapPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wheelEffects: ts.ArrowFunction[] = [];
const asides: ts.JsxElement[] = [];
const svgs: ts.JsxElement[] = [];
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === "useEffect") {
    const effect = node.arguments[0];
    if (effect && ts.isArrowFunction(effect) && effect.getText(file).includes('addEventListener("wheel"')) {
      wheelEffects.push(effect);
    }
  }
  if (ts.isJsxElement(node)) {
    if (node.openingElement.tagName.getText(file) === "aside") asides.push(node);
    if (node.openingElement.tagName.getText(file) === "svg") svgs.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(file);

function mountWheel(svg: EventTarget | null) {
  expect(wheelEffects).toHaveLength(1);
  let zoom = 1;
  const code = ts.transpileModule(`const effect = ${wheelEffects[0].getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const cleanup = new Function("svgRef", "setZoom", `${code}\nreturn effect();`)(
    { current: svg },
    (update: (z: number) => number) => { zoom = update(zoom); },
  ) as (() => void) | undefined;
  return { cleanup, zoom: () => zoom };
}

function wheel(target: EventTarget, deltaY: number, ctrlKey = false) {
  const event = new Event("wheel", { cancelable: true });
  Object.assign(event, { deltaY, ctrlKey });
  target.dispatchEvent(event);
  return event;
}

describe("思维导图画布缩放隔离", () => {
  it("仅在 SVG 注册非被动滚轮，并在卸载时移除同一监听器", () => {
    const svg = new EventTarget();
    const add = vi.spyOn(svg, "addEventListener");
    const remove = vi.spyOn(svg, "removeEventListener");
    const mounted = mountWheel(svg);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    expect(wheel(svg, -300).defaultPrevented).toBe(true);
    expect(mounted.zoom()).toBe(1.3);
    mounted.cleanup!();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("wheel", add.mock.calls[0][1]);
    expect(wheel(svg, -100).defaultPrevented).toBe(false);
    expect(mounted.zoom()).toBe(1.3);
  });

  it("普通滚轮和捏合累积缩放，保留上下限，左栏滚轮不改变导图", () => {
    const svg = new EventTarget();
    const mounted = mountWheel(svg);
    try {
      expect(wheel(svg, -100, true).defaultPrevented).toBe(true);
      expect(mounted.zoom()).toBeCloseTo(1.1);
      wheel(svg, -100);
      expect(mounted.zoom()).toBeCloseTo(1.2);
      const aside = new EventTarget();
      expect(wheel(aside, -300).defaultPrevented).toBe(false);
      expect(mounted.zoom()).toBeCloseTo(1.2);
      wheel(svg, -10000);
      expect(mounted.zoom()).toBe(2.5);
      wheel(svg, 10000);
      expect(mounted.zoom()).toBe(0.3);
    } finally { mounted.cleanup!(); }
  });

  it("SVG 尚未挂载时不注册监听", () => {
    expect(mountWheel(null).cleanup).toBeUndefined();
  });

  it("220px 左栏与画布是兄弟元素，缩放只落在 SVG 图层且不走 React 滚轮", () => {
    expect(asides).toHaveLength(1);
    expect(svgs).toHaveLength(1);
    const aside = asides[0];
    const svg = svgs[0];
    expect(aside.parent).toBe(svg.parent.parent);
    expect(aside.openingElement.getText(file)).toMatch(/width:\s*220\b/);
    expect(aside.openingElement.getText(file)).toContain("shrink-0");
    expect(svg.openingElement.getText(file)).toContain("ref={svgRef}");
    expect(svg.openingElement.getText(file)).not.toMatch(/onWheel/);
    const zoomTransforms: ts.JsxAttribute[] = [];
    function findZoom(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.getText(file).includes("${zoom}")) zoomTransforms.push(node);
      ts.forEachChild(node, findZoom);
    }
    findZoom(file);
    expect(zoomTransforms).toHaveLength(1);
    expect(zoomTransforms[0].name.getText(file)).toBe("transform");
    expect(zoomTransforms[0].parent.parent.getText(file)).toMatch(/^<g\s/);
    expect(svg.getText(file)).toContain(zoomTransforms[0].getText(file));
    expect(aside.getText(file)).not.toContain("${zoom}");
  });
});
