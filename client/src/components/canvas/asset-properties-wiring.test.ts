/**
 * 右键「图片属性」接线锁：菜单项 → action → 弹窗 → 三条来源入口写真实字段。
 * ⚠️ 只改菜单不改分发 = 点了没反应（多出口事故），这里逐环断言。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
const dialog = readFileSync("client/src/components/canvas/AssetPropertiesDialog.tsx", "utf8");

describe("图片节点右键属性", () => {
  it("单张 asset 节点才有「图片属性」菜单项", () => {
    expect(canvas).toContain('label: "图片属性"');
    expect(canvas).toContain('action: "asset-properties"');
    expect(canvas).toContain("...assetPropertiesItems");
    const block = canvas.slice(canvas.indexOf("const assetPropertiesItems"), canvas.indexOf("// Group container right-click menu"));
    expect(block).toContain('menu.nodeType === "asset" && selectedCount === 1');
  });

  it("action 分发打开弹窗，且取的是真实节点 data", () => {
    expect(canvas).toContain('if (action === "asset-properties")');
    expect(canvas).toContain("setAssetPropertiesTarget({ nodeId, data: (node.data || {}) as Record<string, unknown> })");
    expect(canvas).toContain("<AssetPropertiesDialog");
    expect(canvas).toContain('onClose={() => setAssetPropertiesTarget(null)}');
  });

  it("弹窗展示四项属性并读图片原始像素", () => {
    for (const label of ["分辨率", "格式", "时间", "图片来源"]) {
      expect(dialog).toContain(`label: "${label}"`);
    }
    expect(dialog).toContain("naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight");
    expect(dialog).toContain("data-artx-asset-properties");
    expect(dialog).toContain("createPortal(");
  });

  it("三条来源入口都写入显式 assetSource", () => {
    expect(canvas).toContain('assetSource: "upload"');
    expect(canvas).toContain('assetSource: "web"');
    expect(canvas).toContain('assetSource: "ai"');
  });
});
