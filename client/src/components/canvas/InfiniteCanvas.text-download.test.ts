import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getTextNodeExportLayout } from "./text-node-export";

describe("text node context-menu download", () => {
  it("opens the node menu for text and routes download to the existing exporter", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const menu = source.match(
      /function NodeContextMenu[\s\S]*?(?=\n\/\/ ── Group Container Overlay)/
    )?.[0];
    const textNode = source.match(
      /function TextNodeComponent\([\s\S]*?(?=\n\/\/ ── Custom Edge)/
    )?.[0];
    const handler = source.match(
      /const handleNodeAction = useCallback\([\s\S]*?(?=\n  \/\/ ── Add node from position)/
    )?.[0];

    expect(menu).toBeTruthy();
    expect(textNode).toBeTruthy();
    expect(handler).toBeTruthy();
    expect(menu).toContain('label: "下载"');
    expect(menu).toContain('action: "download"');
    expect(textNode).toContain('new CustomEvent("node-contextmenu"');
    expect(textNode).not.toContain('text-contextmenu-suppressed');
    expect(handler).toContain('text-node-download-request');
    expect(source).toContain('a.download = `artx-text-${Date.now()}.png`');
  });

  it("sizes the export canvas from the measured text width", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");

    expect(source).toContain("getTextNodeExportLayout");
    expect(source).toContain("measureText: value => measureCtx.measureText(value).width");
    expect(source).toContain("offscreen.width = exportCanvasW * 2");
  });

  it("keeps long measured lines inside the PNG and SVG bounds", () => {
    const layout = getTextNodeExportLayout({
      text: "地方深第三方v的范德萨",
      nodeWidth: 320,
      nodeHeight: 80,
      fontSize: 32,
      lineHeight: 1.4,
      letterSpacing: 0,
      padding: 12,
      measureText: value => value.length * 32,
    });

    expect(layout.maxLineWidth).toBe(32 * "地方深第三方v的范德萨".length);
    expect(layout.canvasW).toBeGreaterThan(320 + 24);
    expect(layout.canvasH).toBe(104);
  });
});
