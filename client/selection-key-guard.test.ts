import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANVAS_SELECTION_KEY,
  shouldReleaseSelectionKey,
} from "./selection-key-guard";

/**
 * 事故（2026-09-20，用户报）：智能编辑文案「提取文字 → 应用到新图」之后，
 * 再选中图片节点想拖动，拖出来的是**框选矩形**，节点纹丝不动，刷新才好。
 *
 * 根因（读 @xyflow/react 12.10.2 源码取证）：
 * Pane 在 capture 阶段判 `(selectionOnDrag && 点在空白) || selectionKeyPressed`，
 * 点在节点上时前半条为假，所以**只剩 selectionKeyPressed 这一条路**能让
 * 「拖节点」变「拉框」。而 xyflow 的 useKeyPress 置位/复位不对称：
 * 焦点在 textarea 里按 Shift 照样置位，keyup 一旦丢失就永久卡 true。
 * 文案面板应用成功后整块卸载，用户此时还按着 Shift → keyup 落空 → 卡死。
 *
 * 📌⭐⭐⭐ 判据：「置位」在 A、「复位」在 B，只要 B 可能收不到，必然卡死。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

describe("框选热键判据（纯函数）", () => {
  it("Shift 的 keyup 必须触发复位", () => {
    expect(
      shouldReleaseSelectionKey({
        type: "keyup",
        key: "Shift",
        shiftKey: false,
      })
    ).toBe(true);
  });

  it("按下 Shift 本身不能被当成松开", () => {
    // 这一条是反向保护：把判据简化成 `!event.shiftKey` 会让 Shift 自己的
    // keydown 误命中，框选热键当场失效 —— 修好一个 bug、废掉一个功能。
    expect(
      shouldReleaseSelectionKey({
        type: "keydown",
        key: "Shift",
        shiftKey: true,
      })
    ).toBe(false);
  });

  it("⭐ 核心：keyup 丢失后，下一个不带 Shift 的按键必须能兜回来", () => {
    /*
      这是修复的关键价值点。真实卡死场景里 keyup **压根不会来**
      （面板连同 textarea 一起卸载了）。只认 keyup 的实现修不好这个 bug。
      浏览器在每个键盘事件上都如实带当前修饰键状态，这比「那次 keyup
      有没有送达」可靠得多。
    */
    expect(
      shouldReleaseSelectionKey({ type: "keydown", key: "a", shiftKey: false })
    ).toBe(true);
  });

  it("仍按着 Shift 时敲别的键，不能复位", () => {
    // Shift+A 打大写字母的中途，框选热键理应还是按下状态。
    expect(
      shouldReleaseSelectionKey({ type: "keydown", key: "A", shiftKey: true })
    ).toBe(false);
  });

  it("别的键的 keyup 不该触发复位", () => {
    expect(
      shouldReleaseSelectionKey({ type: "keyup", key: "a", shiftKey: true })
    ).toBe(false);
  });

  it("判据必须同时看事件类型，不能只看 shiftKey", () => {
    /*
      变异自证补的一条：把判据粗暴写成 `return !event.shiftKey` 时，
      上面所有用例的结果都不变（等价变异），只有这里能把它揪出来 ——
      别的键的 keyup 本身不携带「用户正在打字」的信号，不该驱动复位，
      否则复位出口会被无关事件高频触发，掩盖真实的键位状态。
    */
    expect(
      shouldReleaseSelectionKey({ type: "keyup", key: "a", shiftKey: false })
    ).toBe(false);
  });
});

describe("框选热键卡死兜底：接线必须真的挂上", () => {
  it("① selectionKeyCode 必须显式传给 ReactFlow", () => {
    // 不传时吃 xyflow 隐式默认值 'Shift'，行为一样但没有出处，
    // 兜底复位无从确知自己在复位哪个键。
    expect(
      source,
      "ReactFlow 没有显式传 selectionKeyCode，框选热键失去唯一事实源"
    ).toContain("selectionKeyCode={CANVAS_SELECTION_KEY}");
  });

  it("② 复位必须挂在 window 捕获阶段，且 pointerdown 这道闸不能少", () => {
    /*
      ⚠️⚠️ 捕获阶段是硬要求，不是风格选择：
      Pane 用 React 合成事件 onPointerDownCapture，React 18 代理在 root 容器上。
      window 捕获严格早于 root，复位才赶得上**同一次** pointerdown 的判定。
      退回冒泡 = 永远晚一拍，这次拖拽照样变框选，且零报错。
    */
    expect(
      source,
      "pointerdown 没挂在 window 捕获阶段 —— 复位会晚于 Pane 的判定，bug 原样复现"
    ).toContain(
      'window.addEventListener("pointerdown", handlePointerDown, true)'
    );
    expect(
      source,
      "pointerdown 退回了冒泡阶段，复位永远慢一拍"
    ).not.toContain(
      'window.addEventListener("pointerdown", handlePointerDown, false)'
    );
    expect(source, "pointerdown 省略了捕获参数，默认是冒泡阶段").not.toContain(
      'window.addEventListener("pointerdown", handlePointerDown)'
    );

    expect(source, "keydown 没挂在捕获阶段").toContain(
      'window.addEventListener("keydown", handleKeyEvent, true)'
    );
    expect(source, "keyup 没挂在捕获阶段").toContain(
      'window.addEventListener("keyup", handleKeyEvent, true)'
    );
  });

  it("③ 切窗口/页面隐藏必须兜住 —— 这几种情况浏览器不补发 keyup", () => {
    expect(source, "没监听 blur，Cmd+Tab 切走后热键会卡住").toContain(
      'window.addEventListener("blur", handleFocusChange)'
    );
    expect(source, "没监听 visibilitychange，页面切后台后热键会卡住").toContain(
      'document.addEventListener("visibilitychange", handleFocusChange)'
    );
  });

  it("④ 监听必须全部解绑，否则切项目时监听器越积越多", () => {
    for (const removal of [
      'window.removeEventListener("keydown", handleKeyEvent, true)',
      'window.removeEventListener("keyup", handleKeyEvent, true)',
      'window.removeEventListener("pointerdown", handlePointerDown, true)',
      'window.removeEventListener("blur", handleFocusChange)',
      'document.removeEventListener("visibilitychange", handleFocusChange)',
    ]) {
      expect(source, `监听没解绑：${removal}`).toContain(removal);
    }
  });

  it("⑤ 复位只能走补发 keyup 这一个出口", () => {
    /*
      selectionKeyPressed 活在 xyflow 内部 hook 里，没有对外 setter。
      它自己注册在 document 上的 keyup 监听器是唯一合法入口。
      这里锁死出口，防止以后有人去 hack 内部 store 或另起一份复位逻辑。
    */
    expect(source, "没有通过补发 keyup 复位，热键无法被清掉").toContain(
      "document.dispatchEvent(createSelectionKeyReleaseEvent())"
    );
    expect(
      source.match(/createSelectionKeyReleaseEvent\(\)/g) || [],
      "复位出口不止一个，逻辑出现第二份"
    ).toHaveLength(1);
  });

  it("⑥ 热键常量必须是 Shift —— 与 xyflow 默认值一致，不能改漂了", () => {
    expect(CANVAS_SELECTION_KEY).toBe("Shift");
  });
});
