/**
 * 🔒 2026-11-14 打印面板接线锁：命令栏最右侧 + 每个图片节点右键 → 同一个面板。
 * ⚠️ 只锁了其中一个入口 = 另一个点了没反应（多出口事故 A）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
const panel = readFileSync("client/src/components/canvas/CanvasPrintPanel.tsx", "utf8");

function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `起点不存在：${start}`).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(end, i + start.length);
  expect(j, `终点不存在：${end}`).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe("两个入口 → 同一个打印面板", () => {
  it("命令栏最右侧是打印，且在 layers 之后", () => {
    const tools = block(canvas, "const tools = [", "];");
    expect(tools).toContain('{ id: "print", label: "打印", icon: <Printer size={17} /> }');
    expect(tools.indexOf('id: "layers"')).toBeLessThan(tools.indexOf('id: "print"'));
  });

  it("命令栏打印只派发事件，不改变工具模式", () => {
    const click = block(canvas, 'if (id === "print") {', 'if (id === "templates") {');
    expect(click).toContain("CANVAS_PRINT_OPEN_EVENT");
    expect(click).not.toContain('new CustomEvent("tool-mode-change"');
    expect(click).not.toContain("setActive(");
  });

  it("图片节点右键 + 多选右键都有打印项", () => {
    expect(canvas).toContain("...assetPrintItems");
    expect(canvas).toContain("...selectionPrintItems");
    const menu = block(canvas, "const printMenuItem = {", "// Group container right-click menu");
    expect(menu).toContain('menu.nodeType === "asset" && selectedCount === 1');
    expect(menu).toContain("isSelectionMenu");
    expect(menu).toContain('action: "print"');
  });

  it("action 分发与两个入口共用同一份 state", () => {
    expect(canvas).toContain('if (action === "print") {');
    expect(canvas).toContain("setPrintPanelState({ preselectIds: actionIds.length ? actionIds : [nodeId] })");
    expect(canvas).toContain("setPrintPanelState({ preselectIds: [] })");
    expect(canvas.split("useState<{ preselectIds: string[] } | null>(null)").length - 1).toBe(1);
    expect(canvas).toContain("<CanvasPrintPanel");
    expect(canvas).toContain("buildPrintableItems(nodesRef.current)");
  });
});

describe("打印面板功能", () => {
  it("黑白风格：黑底白字主按钮，无蓝色/紫色强调", () => {
    expect(panel).toContain('background: "#161616"');
    expect(panel).toContain('color: "#ffffff"');
    expect(panel).not.toContain("#9058fc");
    expect(panel).not.toContain("#1266c6");
  });

  it("复刻系统打印框字段：目标打印机 / 页面 / 布局 / 更多设置 / 取消+保存", () => {
    for (const label of ["目标打印机", "页面", "布局", "更多设置", "取消", "保存 / 打印"]) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain('value="pdf"');
    expect(panel).toContain("另存为 PDF");
    expect(panel).toContain("导出 PNG 图片");
    expect(panel).toContain("全部");
    expect(panel).toContain("仅当前页");
    expect(panel).toContain("纵向");
    expect(panel).toContain("横向");
  });

  it("选择容器多选 + 页数统计", () => {
    expect(panel).toContain("data-artx-print-containers=");
    expect(panel).toContain('type="checkbox"');
    expect(panel).toContain("全选");
    expect(panel).toContain("选择容器");
  });

  it("预览可调大小 / 左右移动 / 上下移动 / 四边剪裁", () => {
    expect(panel).toContain("data-artx-print-slider={key}");
    for (const key of ["scale", "offsetX", "offsetY", "cropLeft", "cropRight", "cropTop", "cropBottom"]) {
      expect(panel, `缺少 ${key} 滑块`).toContain(`, "${key}"`);
    }
    expect(panel).toContain("重置本页调整");
  });

  it("预览与导出共用 drawPrintPage（所见即所得）", () => {
    expect(panel.split("drawPrintPage(").length - 1).toBeGreaterThanOrEqual(2);
    expect(panel).toContain("data-artx-print-preview");
  });

  it("⚠️ 预览容器必须 flexShrink:0（被压缩会裁掉 canvas，只露白纸留白）", () => {
    expect(panel).toContain("flexShrink: 0");
    expect(panel).toContain('height: 320, width: "auto"');
  });

  it("⚠️ 容器数据异步到达，默认全选不能在 useState 初始值里算一次", () => {
    expect(panel).toContain("selectionInitializedRef");
    expect(panel).toContain("setSelectedIds(preset.length ? preset : items.map(i => i.id))");
  });

  it("打印 0 积分，AI 高清化明确标价且需用户主动点", () => {
    expect(panel).toContain("打印不消耗积分");
    expect(panel).toContain("PRINT_CREDIT_COST");
    expect(panel).toContain("AI_ENHANCE_CREDITS");
    expect(panel).toContain("AI_EXPANSION_CREDITS");
    expect(panel).toContain("8K 档是 4K 出图 + 本地插值");
    expect(panel).toContain("data-artx-print-ai-enhance=");
    expect(panel).toContain("enhanceImageToHd");
  });

  it("系统打印走 iframe，导出 PNG 逐张下载", () => {
    expect(panel).toContain("iframe.contentWindow?.print()");
    expect(panel).toContain("@page { size:");
    expect(panel).toContain("saveAs(blob");
  });
});
