import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canvas layer ordering", () => {
  it("exposes four layer actions and applies them through the node action handler", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const menu = source.match(
      /function NodeContextMenu[\s\S]*?(?=\n\/\/ ── Group Container Overlay)/
    )?.[0];
    const handler = source.match(
      /const handleNodeAction = useCallback\([\s\S]*?(?=\n  \/\/ ── Add node from position)/
    )?.[0];

    expect(menu).toBeTruthy();
    expect(handler).toBeTruthy();
    for (const label of ["上一层", "下一层", "置于顶层", "置于底层"]) {
      expect(menu).toContain(`label: "${label}"`);
    }
    for (const action of [
      "bring-forward",
      "send-backward",
      "bring-to-front",
      "send-to-back",
    ]) {
      expect(menu).toContain(`action: "${action}"`);
      expect(handler).toContain(`"${action}"`);
    }
    expect(handler).toContain("applyCanvasLayerAction");
    expect(handler).toContain("pushHistory(currentNodes, edgesRef.current)");
    expect(source).toContain("zIndex: index");
  });

  it("uses the latest canvas snapshot when applying a layer action", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const handler = source.match(
      /const handleNodeAction = useCallback\([\s\S]*?(?=\n  \/\/ ── Add node from position)/
    )?.[0];

    expect(handler).toBeTruthy();
    expect(handler).toContain("getNodes()");
    expect(handler).toContain("selectedNodeIdsRef.current");
  });

  it("moves a selected node across the next higher unselected layer", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const helper = source.match(
      /function applyCanvasLayerAction\([\s\S]*?(?=\nconst edgeTypes)/
    )?.[0];

    expect(helper).toBeTruthy();
    expect(helper).toContain(
      "selected.has(ordered[index].node.id) && !selected.has(ordered[index + 1].node.id)"
    );
    expect(helper).not.toContain(
      "!selected.has(ordered[index].node.id) && selected.has(ordered[index + 1].node.id)"
    );
  });

  it("does not change a node's z-order during ordinary selection", () => {
    const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
    const assetClick = source.match(
      /const handleAssetClick = useCallback\([\s\S]*?(?=\n  const handleImageAnnotateClick)/
    )?.[0];
    const selectionChange = source.match(
      /const handleSelectionChange = useCallback\([\s\S]*?(?=\n  const handleSelectionStart)/
    )?.[0];

    expect(assetClick).toBeTruthy();
    expect(selectionChange).toBeTruthy();
    expect(assetClick).not.toContain("zIndex");
    expect(selectionChange).not.toContain("shouldSelectToFront");
    expect(source).not.toContain('new CustomEvent("visual-node-select-to-front"');
    expect(source).toContain("elevateNodesOnSelect={false}");
  });
});
