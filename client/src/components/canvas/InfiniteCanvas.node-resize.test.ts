import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("visual node outline resizing", () => {
  it("renders four-corner resize handles for text, shape, pen, and freehand nodes", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("function VisualNodeResizeHandles");
    expect(source).toContain('["nw", "ne", "se", "sw"]');
    expect(source).toContain('background: "white"');
    expect(source).toContain('cursor: "nwse-resize"');
    expect(source).toContain('cursor: "nesw-resize"');

    for (const component of [
      "TextNodeComponent",
      "ShapeNodeComponent",
      "PenNodeComponent",
      "FreehandNodeComponent",
    ]) {
      const block = source.match(new RegExp(`function ${component}[\\s\\S]*?(?=\\n// ──|\\nfunction )`))?.[0];
      expect(block, component).toBeTruthy();
      expect(block).toContain("<VisualNodeResizeHandles");
    }
  });

  it("commits visual node size changes and keeps text intrinsic sizing until manual resize", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain('new CustomEvent("visual-node-resize-start"');
    expect(source).toContain('new CustomEvent("visual-node-resize-end"');
    expect(source).toContain("sizeCustomized: true");
    expect(source).toContain("getTextNodeIntrinsicSize");
    expect(source).toContain("textContent.length");
    expect(source).toContain("!Boolean(nodeData.sizeCustomized)");
    expect(source).toContain('window.addEventListener("visual-node-resize-start"');
    expect(source).toContain('window.addEventListener("visual-node-resize-end"');
  });

  it("creates new text nodes with a 16px default font size", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const creationBlock = source.match(
      /const newNode = \{[\s\S]*?sizeCustomized: false,[\s\S]*?isEditing: true,[\s\S]*?\n          \},/
    )?.[0];

    expect(creationBlock).toBeTruthy();
    expect(creationBlock).toContain("fontSize: 16");
  });

  it("uses a native text stroke instead of offset text-shadow copies", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const textNodeBlock = source.match(
      /function TextNodeComponent[\s\S]*?(?=\n\/\/ ──|\nfunction )/
    )?.[0];

    expect(textNodeBlock).toBeTruthy();
    expect(textNodeBlock).toContain("WebkitTextStroke");
    expect(textNodeBlock).toContain("strokeWidthVal");
    expect(textNodeBlock).not.toContain("textShadow: textStrokeShadow");
  });
});
