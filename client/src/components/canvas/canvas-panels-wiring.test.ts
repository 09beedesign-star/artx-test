/**
 * 🔒 2026-11-14 用户要求：图层右键(重命名/复制/多选打组)、右侧属性编辑面板、
 * 两个面板可左键拖拽移动、只有 X 能关、画布空击不消失。
 *
 * ⚠️ 锁「不自动消失」必须用切片，否则 not.toContain 在整文件上恒绿。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
const layers = readFileSync("client/src/components/canvas/CanvasLayersPanel.tsx", "utf8");
const props = readFileSync("client/src/components/canvas/CanvasPropertiesPanel.tsx", "utf8");
const dragHook = readFileSync("client/src/components/canvas/useDraggablePanel.ts", "utf8");

function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `起点不存在：${start}`).toBeGreaterThanOrEqual(0);
  const j = src.indexOf(end, i + start.length);
  expect(j, `终点不存在：${end}`).toBeGreaterThan(i);
  return src.slice(i, j);
}

describe("图层右键动作", () => {
  it("每个图层行都绑定了 onContextMenu", () => {
    expect(layers).toContain("onContextMenu={e => openContext(row, e)}");
    expect(layers).toContain("data-artx-layer-row={row.id}");
  });

  it("菜单含重命名 / 复制 / 属性编辑 / 打组 / 解散打组", () => {
    for (const label of ["重命名", "复制", "属性编辑", "打组", "解散打组"]) {
      expect(layers).toContain(`label: "${label}"`);
    }
    expect(layers).toContain("data-artx-layer-context-menu");
  });

  it("打组只在多选时出现；重命名/属性编辑始终作用于被右键的那一行", () => {
    expect(layers).toContain('hidden: (ctx?.ids.length || 0) < 2');
    expect(layers).toContain('const selected = rows.filter(r => r.selected).map(r => r.id)');
    expect(layers).toContain('label: "属性编辑", icon: <SlidersHorizontal size={13} />');
    expect(layers).toContain('label: "重命名", icon: <PenLine size={13} />');
    // 多选时也不能把这两项藏掉
    expect(layers).not.toContain('hidden: (ctx?.ids.length || 0) !== 1');
  });

  it("InnerCanvas 五个新事件都注册且都清理", () => {
    for (const name of ["canvas-layer-rename", "canvas-layer-duplicate", "canvas-layer-group", "canvas-layer-ungroup", "canvas-layer-properties"]) {
      expect(canvas).toContain(`window.addEventListener("${name}"`);
      expect(canvas).toContain(`window.removeEventListener("${name}"`);
    }
  });

  it("复制/打组写的是真实节点数据，不是只弹 toast", () => {
    expect(canvas).toContain("position: { x: n.position.x + 24, y: n.position.y + 24 }");
    expect(canvas).toContain("groupId }");
    expect(canvas).toContain("title: name");
  });
});

describe("属性编辑面板", () => {
  it("字段分组齐全（图层/变换/外观/排列）", () => {
    for (const t of ["图层", "变换", "外观", "排列"]) {
      expect(props).toContain(`sectionTitle("${t}")`);
    }
    for (const key of ["title", "x", "y", "width", "height", "rotation", "opacity", "cornerRadius", "fill", "stroke", "strokeWidth", "blendMode", "shadowEnabled", "shadowBlur", "shadowColor"]) {
      expect(props).toContain(`data-artx-prop="${key}"`);
    }
    expect(props).toContain("锁定宽高比");
    expect(props).toContain("data-artx-layer-order={b.action}");
  });

  it("写回落到节点并由画布应用视觉属性", () => {
    expect(canvas).toContain("const patchPropertiesNode = useCallback((patch: NodePropertiesPatch)");
    expect(canvas).toContain("d.panelRotation = patch.rotation");
    expect(canvas).toContain("d.panelOpacity = patch.opacity");
    expect(canvas).toContain("<CanvasPropertiesPanel");
    // ⚠️ 用独立 CSS rotate，不能覆盖 ReactFlow 的 transform: translate(...)
    expect(canvas).toContain('rotate: `${nodeData.panelRotation}deg`');
    const visual = block(canvas, "const visualStyle = {", "as React.CSSProperties;");
    expect(visual).not.toContain("transform:");
  });
});

describe("两个面板：可拖拽 + 只能被 X 关闭", () => {
  it("都用同一个拖拽 hook，且头部是把手、X 不触发拖拽", () => {
    expect(layers).toContain('useDraggablePanel("layers"');
    expect(props).toContain('useDraggablePanel("properties"');
    expect(layers).toContain("{...dragHandlers}");
    expect(props).toContain("{...dragHandlers}");
    expect(props).toContain("data-panel-no-drag");
    expect(layers).toContain("data-panel-no-drag");
    expect(dragHook).toContain('if (e.button !== 0) return;');
    expect(dragHook).toContain("[data-panel-no-drag]");
  });

  it("X 关闭存在且是唯一关闭路径", () => {
    expect(layers).toContain("data-artx-canvas-layers-close=");
    expect(props).toContain("data-artx-canvas-properties-close=");
    expect(canvas).toContain("onClose={() => setPropertiesTargetId(null)}");
    expect(canvas).toContain("onClose={() => setLayersOpen(false)}");
  });

  it("⚠️ pane-click 只关工具下拉，绝不关图层/属性面板", () => {
    const handler = block(canvas, "window.addEventListener(\"pane-click\", handler)", "return () => window.removeEventListener(\"pane-click\", handler);");
    expect(handler).not.toContain("setLayersOpen(false)");
    expect(handler).not.toContain("setPropertiesTargetId(null)");
    const effect = block(canvas, "// 点击画布空白处时关闭「工具子菜单」", "window.addEventListener(\"pane-click\", handler)");
    expect(effect).not.toContain("setLayersOpen(false)");
  });

  it("两个面板组件都不监听 pane-click / mousedown 自动关闭", () => {
    for (const src of [layers, props]) {
      expect(src).not.toContain('addEventListener("pane-click"');
      expect(src).not.toContain("onClose()"); // 只由 X 按钮的 onClick={onClose} 调用
    }
    // 图层右键菜单点外部只关菜单，不关面板
    const menuEffect = block(layers, "if (!ctx) return;", "}, [ctx]);");
    expect(menuEffect).toContain("setCtx(null)");
    expect(menuEffect).not.toContain("onClose()");
  });

  it("图层面板贴左侧边栏展开、属性面板在右侧", () => {
    expect(layers).toContain('useDraggablePanel("layers", { x: 84, y: 68 }');
    expect(props).toContain("window.innerWidth - 316");
  });
});
