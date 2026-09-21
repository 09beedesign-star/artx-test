import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  copyPanelScreenScale,
  COPY_PANEL_BACK_Z,
  COPY_PANEL_FRONT_EVENT,
  COPY_PANEL_FRONT_Z,
  defaultPanelLeft,
  FLOATING_PANEL_FLAGS,
  FLOATING_PANEL_NODE_Z,
  hasOpenFloatingPanel,
  nextPanelPosition,
  orderNodesForFloatingPanels,
  PROMPT_BAR_BACK_Z,
  PROMPT_BAR_FRONT_EVENT,
  PROMPT_BAR_FRONT_Z,
  resolveCopyPanelZIndex,
  resolveNodeZIndex,
  resolvePromptBarZIndex,
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

describe("前后层切换：文案面板 ↔ 悬浮提示条", () => {
  it("⚠️⚠️ 核心语义：谁被点中谁的 z 更高（两组状态各验一遍）", () => {
    // 复刻用户看到的现象：两个面板互相压盖，点中谁谁在最前面，
    // 另一个退到后面但保持可见可交互（不是隐藏）。
    // 面板在前、提示条退后：
    expect(resolveCopyPanelZIndex(true)).toBeGreaterThan(
      resolvePromptBarZIndex(false)
    );
    // 提示条在前、面板退后：
    expect(resolvePromptBarZIndex(true)).toBeGreaterThan(
      resolveCopyPanelZIndex(false)
    );
  });

  it("⚠️ 状态失同步时也不能出现双方都压不住对方的死锁", () => {
    // 面板前值必须高于提示条前值、提示条前值必须高于面板后值 ——
    // 否则事件丢失导致状态错位时，点击切换会失效且零报错。
    expect(COPY_PANEL_FRONT_Z).toBeGreaterThan(PROMPT_BAR_FRONT_Z);
    expect(PROMPT_BAR_FRONT_Z).toBeGreaterThan(COPY_PANEL_BACK_Z);
    expect(COPY_PANEL_FRONT_Z).toBeGreaterThan(PROMPT_BAR_BACK_Z);
  });

  it("portal 后的补偿缩放：正常缩放区间恒为 1（与旧版节点内渲染逐位一致）", () => {
    expect(copyPanelScreenScale(1)).toBe(1);
    expect(copyPanelScreenScale(0.5)).toBe(1);
    expect(copyPanelScreenScale(0.2)).toBe(1);
    expect(copyPanelScreenScale(2.4)).toBe(1);
  });

  it("⚠️ 极端缩小（zoom<0.2）时要补回 zoom 那层缩放，NaN 归零不炸", () => {
    expect(copyPanelScreenScale(0.1)).toBe(0.5);
    expect(copyPanelScreenScale(Number.NaN)).toBe(0);
    expect(Number.isFinite(copyPanelScreenScale(0))).toBe(true);
  });
});

describe("接线断言：portal + 点击置前必须真的接上", () => {
  const raw = readFileSync(canvasPath, "utf8");
  const source = stripSourceComments(raw);

  it("注释剥离没有吃掉源码", () => {
    assertStripKeptSource(raw, source);
  });

  it("文案面板块：真的 portal 出去了，且根节点挂了点击置前", () => {
    const start = source.indexOf("{extractedTextPanelOpen && (");
    const end = source.indexOf("copyPanelPortalTarget ?? document.body");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const panelBlock = source.slice(start, end);
    // portal 出节点（否则 z 永远赢不了画布根层的提示条）
    expect(panelBlock).toContain("createPortal(");
    // 点击置前的捕获阶段 handler（capture 才能覆盖标题栏/正文/输入框所有落点）
    expect(panelBlock).toContain(
      "onPointerDownCapture={handleCopyPanelPointerDown}"
    );
    // 零尺寸锚点：portal 后屏幕坐标的唯一来源
    expect(panelBlock).toContain("ref={extractedTextPanelAnchorRef}");
    // z 值来自纯函数常量，不许写死
    expect(panelBlock).toContain("COPY_PANEL_FRONT_Z");
    expect(panelBlock).toContain("COPY_PANEL_BACK_Z");
  });

  it("文案面板的置前 handler：置本面板为前 + 广播事件", () => {
    const start = source.indexOf("const handleCopyPanelPointerDown");
    expect(start).toBeGreaterThan(-1);
    const handlerBlock = source.slice(start, start + 400);
    expect(handlerBlock).toContain("setExtractedTextPanelFront(true)");
    expect(handlerBlock).toContain("new CustomEvent(COPY_PANEL_FRONT_EVENT)");
  });

  it("⚠️ 面板位置靠锚点 rect 逐帧同步（rAF），portal 后才能跟着节点走", () => {
    // 布局 effect + rAF 各同步一次 = 恰好 2 处调用
    const calls = source.match(/syncCopyPanelToAnchor\(\);/g) || [];
    expect(calls.length).toBe(2);
    expect(source).toContain("requestAnimationFrame(tick)");
  });

  it("悬浮提示条：挂了点击置前，z 值不许再写死 106", () => {
    const start = source.indexOf("function AssetEditPromptBar({");
    expect(start).toBeGreaterThan(-1);
    // 切到组件根节点的 zIndex 行为止（组件体很长，全文搜会扫到别人家）
    const zIndexAt = source.indexOf("promptBarOnTop ? PROMPT_BAR_FRONT_Z", start);
    expect(zIndexAt).toBeGreaterThan(start);
    const barBlock = source.slice(start, zIndexAt + 80);
    expect(barBlock).toContain(
      "onPointerDownCapture={handlePromptBarPointerDown}"
    );
    expect(barBlock).toContain("setPromptBarOnTop(true)");
    expect(barBlock).toContain("new CustomEvent(PROMPT_BAR_FRONT_EVENT)");
  });

  it("画布根容器必须带 portal 挂载标记", () => {
    const start = source.indexOf("ref={containerRef}");
    expect(start).toBeGreaterThan(-1);
    const rootBlock = source.slice(start, start + 200);
    expect(rootBlock).toContain('data-artx-canvas-root=""');
  });
});
