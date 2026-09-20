/**
 * 画布框选热键（Shift）的「卡死」防护 —— 唯一事实源。
 *
 * ════════════════════════════════════════════════════════════════
 * 事故现场（2026-09-20，用户报）
 * ════════════════════════════════════════════════════════════════
 *
 * 「智能编辑文案 → 提取文字 → 应用到新图」之后，再去点选图片节点想拖动，
 * 拖出来的却是一个**框选矩形**，节点纹丝不动。刷新页面才恢复。
 *
 * ════════════════════════════════════════════════════════════════
 * 根因（读 @xyflow/react 12.10.2 源码取证，不是猜的）
 * ════════════════════════════════════════════════════════════════
 *
 * Pane 决定「这次 pointerdown 要不要起框选」的闸门只有两条路：
 *
 *   const isSelectionActive =
 *     (selectionOnDrag && eventTargetIsContainer) || selectionKeyPressed;
 *   if (isNoKeyEvent || !isSelecting || !isSelectionActive || button !== 0) return;
 *   ...
 *   if (!eventTargetIsContainer) { event.stopPropagation(); event.preventDefault(); }
 *
 * 第一条要求「按下的那个点就是画布空白（pane 容器本身）」—— 点在节点上时
 * `eventTargetIsContainer` 为 false，走不通。
 *
 * 所以 **在节点上按下左键还能变成框选，全项目只剩 `selectionKeyPressed === true`
 * 这一条路**。而且注意最后那两行：它在 **capture 阶段** 就 stopPropagation，
 * 节点的拖拽根本收不到这次 pointerdown —— 于是「拖节点」静默变成「拉选框」，
 * 零报错、零提示。
 *
 * `selectionKeyPressed` 来自 xyflow 的 `useKeyPress(selectionKeyCode)`，
 * 而本项目从来没给 ReactFlow 传过 `selectionKeyCode`，吃的是默认值 `'Shift'`。
 *
 * ⚠️⚠️⚠️ 那个 hook 的 down / up 两个处理器**不对称**：
 *
 *   down: 若 (没按修饰键) 且 (焦点在 input/textarea) → 直接 return，不记录
 *   up:   没有任何等价判断，无条件按 pressedKeys 结算
 *
 * 由于 `actInsideInputWithModifier` 默认 true，**Shift 本身就是修饰键**，
 * 所以哪怕焦点正在文案面板的 textarea 里，按下 Shift 也照样把
 * `selectionKeyPressed` 置成 true。只要这一次的 **keyup 没有被收到**，
 * 这个 true 就永远挂在那里 —— 这正是「文案应用成功 → 面板整块卸载」
 * 那一瞬间会发生的事：用户还按着 Shift（打大写字母 / Shift+Enter 换行），
 * 面板连同获得焦点的 textarea 一起从 DOM 消失，keyup 落空。
 *
 * 📌⭐⭐⭐ 判据（与 drag-drop-indicator-stuck 同构，第三次踩）：
 *    **「置位」在 A、「复位」在 B，只要 B 可能收不到，这个状态迟早卡死。**
 *    复位必须挂在**没人能拦、且不依赖那个元素还活着**的地方。
 *
 * ════════════════════════════════════════════════════════════════
 * 为什么是纯函数 + 单独文件
 * ════════════════════════════════════════════════════════════════
 *
 * 本项目 vitest 跑在 `environment: "node"`，组件渲染测不了。把判定抽成
 * 不依赖 React / DOM 的纯函数，才能写真断言而不是源码字符串断言。
 */

/**
 * 画布框选热键。
 *
 * ⚠️ 必须显式传给 `<ReactFlow selectionKeyCode={...}>`。
 *    不传时 xyflow 用它自己的默认值 'Shift'，行为一样 —— 但那样这个值就
 *    没有名字、没有出处，下面的兜底复位也无从对齐是在复位「哪个键」。
 */
export const CANVAS_SELECTION_KEY = "Shift";

/**
 * 需要兜底复位的按键事件判据。
 *
 * 返回 true 表示：这次事件意味着「框选热键此刻不应该还处于按下状态」，
 * 调用方应当强制把框选热键状态清掉。
 *
 * ⚠️⚠️ 不能只判 `event.key === "Shift"`。真实卡死场景里那个 keyup **压根不会来**
 *    （元素已卸载 / 切窗口 / 系统快捷键吃掉）。所以这里同时认第二条线索：
 *    **任何一个 shiftKey 为 false 的键盘事件，都反证 Shift 已经松开了。**
 *    浏览器在每个键盘事件上都如实带着当前修饰键状态，这是比 keyup 可靠得多
 *    的事实源 —— 它不依赖「那一次 keyup 有没有送达」。
 */
export function shouldReleaseSelectionKey(event: {
  type: string;
  key?: string;
  shiftKey?: boolean;
}): boolean {
  if (event.type === "keyup" && event.key === CANVAS_SELECTION_KEY) return true;
  /*
   * ⚠️ keydown 也要查：用户松开 Shift 后按下的**任何**下一个键，
   *    其 shiftKey 都是 false。这一条能把「keyup 丢了但用户继续在用键盘」
   *    的情况兜回来。
   *
   * ⚠️ 必须排除 Shift 自己的 keydown —— 那一次 shiftKey 是 true，不会误命中；
   *    写这条判断纯粹是提醒后来者别把条件简化成 `!event.shiftKey` 就完事。
   */
  if (event.type === "keydown" && event.shiftKey === false) return true;
  return false;
}

/**
 * 合成一个「Shift 已松开」的 keyup 事件，用来喂给 xyflow 的 document 监听器。
 *
 * 【为什么是补发事件，而不是去改 xyflow 的内部 state】
 * `selectionKeyPressed` 活在 xyflow 内部的 `useKeyPress` 里，没有任何对外
 * 的 setter 或 store 字段可以写。唯一能让它复位的合法入口，就是它自己注册在
 * `document` 上的那个 keyup 监听器。
 *
 * ⚠️⚠️ `key` 和 `code` 都要给。xyflow 的 `useKeyOrCode` 会先看 `event.code`
 *    在不在监听列表里，在就用 code、不在就用 key。selectionKeyCode 传的是
 *    'Shift'（key 口径），所以 code 必须给一个**不在**监听列表里的值
 *    （ShiftLeft），才能让它回落到按 key 结算 —— 否则清的是 'ShiftLeft'
 *    这个从没被记录过的键，pressedKeys 里的 'Shift' 原封不动留着，
 *    看起来复位了，实际没有。这一步错了不会报错，只是白做。
 *
 * ⚠️ `bubbles: true` 必需：监听器挂在 document 上，不冒泡就到不了。
 */
export function createSelectionKeyReleaseEvent(): KeyboardEvent {
  return new KeyboardEvent("keyup", {
    key: CANVAS_SELECTION_KEY,
    code: "ShiftLeft",
    shiftKey: false,
    bubbles: true,
    cancelable: true,
  });
}
