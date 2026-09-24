import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANVAS_SELECTION_KEY,
  isSelectionKeyReleaseEvent,
  markSelectionKeyReleaseEvent,
  SELECTION_KEY_RELEASE_FLAG,
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

/**
 * ════════════════════════════════════════════════════════════════
 * 事故二（2026-09-23，本地点测时从浏览器控制台抓到）：无限递归
 * ════════════════════════════════════════════════════════════════
 *
 * 表象：控制台每按一次 Shift 就刷一片
 * `RangeError: Maximum call stack size exceeded`，栈里 release / handleKeyEvent
 * 两行互相调用，**完全看不出跟"框选卡死兜底"有关**，而且框选功能本身看着还正常
 * （栈爆之前状态已经清掉了）。这是典型的「功能没坏但页面在冒烟」的静默故障。
 *
 * 根因：复位手段是往 document 补发合成 keyup，而兜底监听器挂在 window
 * **捕获阶段**。合成事件 bubbles:true → document 冒泡到 window → 被同一个
 * 监听器收到 → 判据认它是真 keyup → 又 release 一次 → 自激到爆栈。
 *
 * 📌⭐⭐⭐ 判据：**凡「监听某类事件」+「自己派发同类事件」的兜底，必须给自发事件
 *    打标记并在判据入口短路。** 靠"挂 document、听 window"这种层级差躲不开 ——
 *    冒泡正好把它们接上。
 */
describe("自发复位事件不能自激（无限递归事故）", () => {
  it("⭐ 核心：自己派发的复位事件必须被判据拒绝", () => {
    // 这一条就是递归的闸门。删掉入口短路，这里立刻变红。
    const echo = markSelectionKeyReleaseEvent({
      type: "keyup",
      key: CANVAS_SELECTION_KEY,
      shiftKey: false,
    });
    expect(
      shouldReleaseSelectionKey(echo),
      "自发复位事件又被判定为需要复位 —— 会无限递归到爆栈"
    ).toBe(false);
  });

  it("没打标记的同形状真事件仍必须触发复位（别把功能一起废了）", () => {
    /*
      反向保护：如果为了灭递归把「keyup + Shift」整条判据删掉，
      上面那条会绿、这条会红 —— 真实的 Shift 松开就再也复位不了，
      框选卡死 bug 原样回来。
    */
    expect(
      shouldReleaseSelectionKey({
        type: "keyup",
        key: CANVAS_SELECTION_KEY,
        shiftKey: false,
      })
    ).toBe(true);
  });

  it("标记函数真的把标记打上了，且识别函数认得出来", () => {
    const raw = { type: "keyup", key: CANVAS_SELECTION_KEY };
    expect(isSelectionKeyReleaseEvent(raw), "没打标记就被认成自发事件").toBe(
      false
    );
    const marked = markSelectionKeyReleaseEvent(raw);
    expect(isSelectionKeyReleaseEvent(marked)).toBe(true);
    expect(marked, "标记函数必须原地返回同一个事件对象").toBe(raw);
  });

  it("标记不可枚举 —— 不能被浅拷贝带到无关对象上", () => {
    /*
      ⚠️⚠️ 变异自证踩到的坑（2026-09-23）：最初这条写的是
        expect(Object.keys(marked)).not.toContain(...)
        expect(JSON.stringify(marked)).toBe('{"type":"keyup"}')
      两条**对 Symbol 键恒绿** —— Object.keys 和 JSON.stringify 都天然忽略
      Symbol 键，不管 enumerable 是 true 还是 false。把 enumerable 改成 true
      这个变异当场漏网。
      📌⭐⭐⭐ 判据：**恒绿的断言等于没有断言。**验"不可枚举"必须用能看见
      Symbol 的通道：Object.getOwnPropertyDescriptor / getOwnPropertySymbols
      + 展开运算符（`{...obj}` 会复制可枚举的 Symbol 键）。

      为什么这件事重要：标记若可枚举，`{...event}` 之类的浅拷贝会把豁免标记
      带到别的对象上，让一个无关事件被永久豁免复位 —— 框选卡死 bug 会以更隐蔽
      的形式回来。
    */
    const marked = markSelectionKeyReleaseEvent({ type: "keyup" });

    const descriptor = Object.getOwnPropertyDescriptor(
      marked,
      SELECTION_KEY_RELEASE_FLAG
    );
    expect(descriptor, "标记根本没打上").toBeDefined();
    expect(descriptor!.enumerable, "标记可枚举，会被浅拷贝带走").toBe(false);

    // 展开运算符会复制**可枚举的** Symbol 键 —— 这是能真正抓住变异的通道。
    const shallowCopy = { ...marked };
    expect(
      isSelectionKeyReleaseEvent(shallowCopy),
      "浅拷贝把自发标记带到了新对象上 —— 无关事件会被永久豁免复位"
    ).toBe(false);
    expect(Object.getOwnPropertySymbols(shallowCopy)).toHaveLength(0);
  });

  it("识别函数对 null/非对象输入必须安全返回 false", () => {
    for (const bad of [null, undefined, 0, "", "keyup", true]) {
      expect(isSelectionKeyReleaseEvent(bad), `输入 ${String(bad)} 处理不当`).toBe(
        false
      );
    }
  });

  it("标记键必须是全局 Symbol —— 跨模块实例也认得", () => {
    // Symbol.for 走全局注册表：即使 Vite 把模块打包两份，标记仍互认。
    // 换成 Symbol()（非全局）时，两份实例的标记互不认识，递归会悄悄回来。
    expect(SELECTION_KEY_RELEASE_FLAG).toBe(
      Symbol.for("artx.canvas.selectionKeyReleaseSynthetic")
    );
    expect(typeof SELECTION_KEY_RELEASE_FLAG).toBe("symbol");
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

  it("⑦ 派发出去的复位事件必须带自发标记，否则会自激爆栈", () => {
    /*
      ⚠️ 纯函数层的标记/识别逻辑再对，只要 createSelectionKeyReleaseEvent
      这个真正被派发的出口忘了打标记，递归就一字不差地回来 ——
      典型的「纯函数对了 ≠ 修复完成」。所以这里必须验接线。
      （node 环境没有 KeyboardEvent 构造器，测不了真事件，只能验源码接线。）
    */
    const guardSource = readFileSync(
      resolve(here, "selection-key-guard.ts"),
      "utf8"
    );
    const factory = guardSource.slice(
      guardSource.indexOf("export function createSelectionKeyReleaseEvent")
    );
    const body = factory.slice(0, factory.indexOf("\n}\n") + 2);
    expect(
      body,
      "createSelectionKeyReleaseEvent 没给事件打自发标记 —— 复位事件会被自己再次收到，无限递归"
    ).toContain("markSelectionKeyReleaseEvent(");
    expect(body, "复位事件必须冒泡才能到达 xyflow 的 document 监听器").toContain(
      "bubbles: true"
    );
  });

  it("⑧ 判据入口必须先短路自发事件，再做其它判断", () => {
    const guardSource = readFileSync(
      resolve(here, "selection-key-guard.ts"),
      "utf8"
    );
    const fn = guardSource.slice(
      guardSource.indexOf("export function shouldReleaseSelectionKey")
    );
    const shortCircuit = fn.indexOf("isSelectionKeyReleaseEvent(event)");
    const keyupCheck = fn.indexOf('event.type === "keyup"');
    expect(shortCircuit, "判据里没有自发事件短路").toBeGreaterThan(-1);
    expect(
      shortCircuit,
      "自发事件短路必须早于 keyup 判定，否则先命中 keyup 就已经递归了"
    ).toBeLessThan(keyupCheck);
  });
});
