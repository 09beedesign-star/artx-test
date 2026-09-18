import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  defaultPanelLeft,
  FLOATING_PANEL_FLAGS,
  FLOATING_PANEL_NODE_Z,
  hasOpenFloatingPanel,
  nextPanelPosition,
  orderNodesForFloatingPanels,
  resolveNodeZIndex,
  shouldStartPanelDrag,
} from "./floating-panel-layer";
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

const here = dirname(fileURLToPath(import.meta.url));
const canvasPath = resolve(here, "InfiniteCanvas.tsx");

function assetNode(id: string, zIndex: number, data: Record<string, unknown> = {}) {
  return { id, type: "asset", zIndex, data };
}

describe("浮层面板层级：开着面板的节点必须压过其他节点", () => {
  it("识别三种面板的打开标记", () => {
    for (const flag of FLOATING_PANEL_FLAGS) {
      expect(hasOpenFloatingPanel(assetNode("a", 1, { [flag]: true }))).toBe(true);
    }
    expect(hasOpenFloatingPanel(assetNode("a", 1, {}))).toBe(false);
  });

  it("⚠️ 提示词反推面板必须在清单里 —— 漏了它就是「窗口被覆盖」的那个 bug", () => {
    expect(FLOATING_PANEL_FLAGS).toContain("reversePromptPanelOpen");
    expect(hasOpenFloatingPanel(assetNode("a", 1, { reversePromptPanelOpen: true }))).toBe(
      true
    );
  });

  it("非 asset 节点不参与提升", () => {
    expect(
      hasOpenFloatingPanel({ type: "text", zIndex: 1, data: { noteOpen: true } })
    ).toBe(false);
  });

  it("data 缺失或非对象时不崩", () => {
    expect(hasOpenFloatingPanel({ type: "asset", zIndex: 1 })).toBe(false);
    expect(hasOpenFloatingPanel({ type: "asset", zIndex: 1, data: null })).toBe(false);
    expect(hasOpenFloatingPanel({ type: "asset", zIndex: 1, data: 42 })).toBe(false);
  });

  it("没开面板的节点 zIndex 原样返回", () => {
    expect(resolveNodeZIndex(assetNode("a", 7))).toBe(7);
    expect(resolveNodeZIndex({ type: "asset", data: {} })).toBeUndefined();
  });

  it("开着面板的节点抬到 FLOATING_PANEL_NODE_Z", () => {
    expect(resolveNodeZIndex(assetNode("a", 7, { reversePromptPanelOpen: true }))).toBe(
      FLOATING_PANEL_NODE_Z
    );
  });

  it("⚠️ 节点自身 zIndex 更高时不能被压回去（用 max 不是直接赋值）", () => {
    const z = FLOATING_PANEL_NODE_Z + 500;
    expect(resolveNodeZIndex(assetNode("a", z, { reversePromptPanelOpen: true }))).toBe(z);
  });

  it("⚠️⚠️ 这才是真正的回归断言：开着反推面板的低 z 节点，必须排在高 z 节点之后", () => {
    // 复刻用户看到的现象：节点 A 开着反推面板但 zIndex 只有 3，
    // 旁边的节点 B zIndex 是 7 —— 修复前 B 整块压在反推窗口上面。
    const a = assetNode("a", 3, { reversePromptPanelOpen: true });
    const b = assetNode("b", 7, {});
    const ordered = orderNodesForFloatingPanels([a, b]);

    const indexA = ordered.findIndex(n => n.id === "a");
    const indexB = ordered.findIndex(n => n.id === "b");
    expect(indexA).toBeGreaterThan(indexB);

    const zA = ordered[indexA].zIndex as number;
    const zB = ordered[indexB].zIndex as number;
    expect(zA).toBeGreaterThan(zB);
  });

  it("⚠️ 数组顺序和 zIndex 两者都要动，缺一不可", () => {
    const ordered = orderNodesForFloatingPanels([
      assetNode("a", 3, { reversePromptPanelOpen: true }),
      assetNode("b", 7, {}),
    ]);
    // 顺序：开面板的排最后
    expect(ordered.map(n => n.id)).toEqual(["b", "a"]);
    // zIndex：开面板的被抬高
    expect(ordered[1].zIndex).toBe(FLOATING_PANEL_NODE_Z);
  });

  it("多个节点同时开面板时保持稳定相对顺序", () => {
    const ordered = orderNodesForFloatingPanels([
      assetNode("a", 1, { noteOpen: true }),
      assetNode("b", 2, {}),
      assetNode("c", 3, { extractedTextPanelOpen: true }),
      assetNode("d", 4, { reversePromptPanelOpen: true }),
    ]);
    expect(ordered.map(n => n.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("不修改传入的节点对象（避免把 React state 改脏）", () => {
    const a = assetNode("a", 3, { reversePromptPanelOpen: true });
    orderNodesForFloatingPanels([a, assetNode("b", 7)]);
    expect(a.zIndex).toBe(3);
  });

  it("全都没开面板时原样返回", () => {
    const input = [assetNode("a", 1), assetNode("b", 2)];
    expect(orderNodesForFloatingPanels(input).map(n => n.id)).toEqual(["a", "b"]);
  });
});

describe("浮层面板拖动几何", () => {
  const origin = {
    startClientX: 100,
    startClientY: 200,
    startLeft: 400,
    startTop: 50,
  };

  it("zoom = 1 时位移与鼠标 1:1", () => {
    expect(nextPanelPosition(origin, 160, 230, 1)).toEqual({ left: 460, top: 80 });
  });

  it("⚠️⚠️ zoom = 0.5 时位移必须放大一倍 —— 不除 zoom 面板会跟不上鼠标", () => {
    expect(nextPanelPosition(origin, 160, 230, 0.5)).toEqual({ left: 520, top: 110 });
  });

  it("zoom = 2 时位移减半", () => {
    expect(nextPanelPosition(origin, 160, 230, 2)).toEqual({ left: 430, top: 65 });
  });

  it("⚠️ zoom 为 0 / 负数 / NaN 时必须夹住，不能算出 Infinity 或反向位移", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = nextPanelPosition(origin, 160, 230, bad);
      expect(Number.isFinite(result.left)).toBe(true);
      expect(Number.isFinite(result.top)).toBe(true);
      expect(result.left).toBeGreaterThan(origin.startLeft);
    }
  });

  it("默认停靠位置 = 图片宽度 + 14 × 反缩放系数", () => {
    expect(defaultPanelLeft(300, 1)).toBe(314);
    expect(defaultPanelLeft(300, 2)).toBe(328);
  });

  it("⚠️ 只有左键能起拖，右键要留给上下文菜单", () => {
    expect(shouldStartPanelDrag(0, false)).toBe(true);
    expect(shouldStartPanelDrag(1, false)).toBe(false);
    expect(shouldStartPanelDrag(2, false)).toBe(false);
  });

  it("⚠️ 点在按钮/输入框上不起拖，否则点关闭时面板会乱跳", () => {
    expect(shouldStartPanelDrag(0, true)).toBe(false);
  });
});

describe("接线断言：InfiniteCanvas 必须真的用上这套逻辑", () => {
  const raw = readFileSync(canvasPath, "utf8");
  const source = stripSourceComments(raw);

  it("注释剥离没有吃掉源码（否则下面的反向断言会恒绿）", () => {
    assertStripKeptSource(raw, source);
  });

  it("displayNodes 走 orderNodesForFloatingPanels", () => {
    expect(source).toContain("orderNodesForFloatingPanels(displayNodesBase)");
  });

  it("⚠️⚠️ 禁止在 displayNodes 里重新写死 noteOpen 专用的层级补丁", () => {
    // 这正是老 bug 的形态：只认一种面板的一次性 filter/map。
    expect(source).not.toContain("Math.max(10000, typeof n.zIndex");
  });

  it("反推面板的 left/top 接了拖动位置，不再写死", () => {
    const panelBlock = source.slice(
      source.indexOf("{reversePromptPanelOpen && ("),
      source.indexOf("{reversePromptPanelOpen && (") + 1400
    );
    expect(panelBlock).toBeTruthy();
    expect(panelBlock).toContain("reversePromptPanelPosition?.left");
    expect(panelBlock).toContain("reversePromptPanelPosition?.top");
    // 防断言空跑：确认切片确实落在反推面板上
    expect(panelBlock).toContain("nodrag nopan shadow-2xl");
  });

  it("反推面板标题栏挂了拖动 handler", () => {
    expect(source).toContain("onPointerDown={handleReversePromptPanelDragStart}");
    expect(source).toContain("onPointerMove={handleReversePromptPanelDragMove}");
    expect(source).toContain("onPointerUp={handleReversePromptPanelDragEnd}");
    expect(source).toContain("onPointerCancel={handleReversePromptPanelDragEnd}");
  });

  it("⚠️ 两个面板的拖动几何必须共用纯函数，不许各写一份", () => {
    // 两个面板各调一次，说明都走了同一个纯函数。
    const calls = source.match(/nextPanelPosition\(drag,/g) || [];
    expect(calls.length).toBe(2);

    // ⚠️ 反向断言必须只盯这两个 setter，不能全文搜
    // `event.clientX - drag.startClientX` —— 画布里还有裁剪边、
    // 相机立方等好几处无关拖动用着同样的写法，全文搜会假红。
    const setterCalls =
      source.match(
        /set(?:ExtractedTextPanelPosition|ReversePromptPanelPosition)\(\s*[^)]*/g
      ) || [];
    // 两个 setter 各有两处调用：拖动时赋值 + 关闭时置 null
    expect(setterCalls.length).toBe(4);
    for (const call of setterCalls) {
      const isReset = call.includes("null");
      if (isReset) continue;
      // 修复前这里是内联的 `drag.startLeft + (event.clientX - ...) / zoom`
      expect(call).toContain("nextPanelPosition(");
      expect(call).not.toContain("drag.startLeft +");
    }
  });

  it("⚠️ 关闭面板时必须清掉拖动位置，否则下次打开可能在视野外", () => {
    expect(source).toContain("if (!reversePromptPanelOpen) setReversePromptPanelPosition(null)");
  });
});
