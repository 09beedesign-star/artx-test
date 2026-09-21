import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 事故（2026-09-20，用户截图）：把图片拖进主提示词输入框，图正常变成引用标签，
 * 但画布那层全屏虚线指引「将图片拖入该区域」**一直不消失**，
 * 右下角的鼠标跟随紫点也永久停在原地，只能刷新页面才能恢复。
 *
 * 根因是两个，都零报错：
 *
 *   ① 【复位执行不到】输入框卡片是画布容器的后代。
 *      输入框的 drop 处理器里有 event.stopPropagation()（这是对的，
 *      否则画布会把同一张图再接一次，变成双份）。
 *      于是 handleCanvasDrop 根本不会被调用，
 *      而 isDragOver / dragPos / dragCounterRef 的复位全写在它里面 ——
 *      复位代码一行没错，它只是永远执行不到。
 *
 *   ② 【指引一开始就不该亮】拖拽刚进入输入框时浏览器先发 dragenter，
 *      输入框当时没有 onDragEnter，事件冒泡到画布把 isDragOver 打开了。
 *      dragOver 里的 stopPropagation 拦不住**已经发生过**的 dragenter。
 *
 * 📌⭐⭐⭐ 通用判据：凡是「打开状态在 A 处、关闭状态在 B 处」的 UI，
 * 只要 B 可能被别人 stopPropagation 掉，这个状态迟早会卡住。
 * 关闭必须挂在**没人能拦截**的地方（window 捕获阶段）。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * ⚠️⚠️ 按「下一个顶层声明」切，不按固定字符数切。
 * 固定长度切块会越界吃进后一个函数的代码，让 toContain 被邻居糊弄
 * —— 上一轮变异自证真实踩过（删掉的 preventDefault 被隔壁函数的顶替）。
 */
function sliceFunction(anchor: string, maxLength = 2600) {
  const index = source.indexOf(anchor);
  expect(index, `找不到锚点：${anchor}`).toBeGreaterThan(-1);
  const rough = source.slice(index, index + maxLength);
  const nextDecl = rough
    .slice(anchor.length)
    .search(/\n  const \w+ = useCallback|\n  const \w+ = use|\nfunction /);
  return nextDecl === -1 ? rough : rough.slice(0, anchor.length + nextDecl);
}

describe("画布拖拽指引：松手后必须复位", () => {
  it("① 必须有一个独立的复位函数，三处状态一个都不能漏", () => {
    const reset = sliceFunction("const resetCanvasDragIndicator = useCallback");
    // 三处状态必须一起复位。只复位 isDragOver 的话虚线框没了、紫点还在；
    // 只复位 dragPos 的话紫点没了、虚线框还在 —— 用户截图里两个都在。
    expect(reset, "没有复位拖拽计数器，下次拖拽会从错误的计数开始").toContain(
      "dragCounterRef.current = 0"
    );
    expect(reset, "没有关闭全屏虚线指引").toContain("setIsDragOver(false)");
    expect(reset, "没有清掉鼠标跟随紫点").toContain("setDragPos(null)");
  });

  it("② 复位必须挂在 window 捕获阶段，否则会被输入框的 stopPropagation 吃掉", () => {
    const effectIndex = source.indexOf(
      'window.addEventListener("drop", handler, true)'
    );
    expect(
      effectIndex,
      "drop 没有挂在 window 捕获阶段 —— 落在输入框时复位永远执行不到"
    ).toBeGreaterThan(-1);

    // ⚠️ 第三个参数必须是 true（捕获）。写成 false / 省略都会退回冒泡阶段，
    // 而冒泡阶段正是被 stopPropagation 截断的那一段 —— bug 原样复现。
    expect(
      source,
      "drop 监听退回了冒泡阶段，会被输入框的 stopPropagation 截断"
    ).not.toContain('window.addEventListener("drop", handler, false)');
    expect(source, "drop 监听省略了捕获参数，默认是冒泡阶段").not.toContain(
      'window.addEventListener("drop", handler)'
    );

    // dragend：拖到一半按 Esc / 拖出浏览器窗口松手，全程没有 drop 事件，
    // 只有 dragend。少了它，这两种退出方式下指引同样会卡住。
    expect(source, "没有监听 dragend，按 Esc 取消拖拽时指引会卡住").toContain(
      'window.addEventListener("dragend", handler, true)'
    );

    // 必须解绑，否则组件卸载后监听器泄漏，切项目越积越多。
    expect(source, "drop 监听没有解绑").toContain(
      'window.removeEventListener("drop", handler, true)'
    );
    expect(source, "dragend 监听没有解绑").toContain(
      'window.removeEventListener("dragend", handler, true)'
    );
  });

  it("③ 复位逻辑只能有一份，画布自己的处理器必须复用它", () => {
    // 这是本项目踩过十几次的「同一份逻辑多个出口」：
    // 如果 dragLeave / drop 里各自抄一遍三行复位，
    // 以后加第四个状态时必然只改其中一处，另一处静默走偏。
    const leave = sliceFunction("const handleCanvasDragLeave = useCallback");
    expect(leave, "dragLeave 没有复用统一复位函数，复位逻辑出现第二份").toContain(
      "resetCanvasDragIndicator()"
    );
    expect(
      leave,
      "dragLeave 里残留了手写的 setIsDragOver(false)，说明复位逻辑仍有两份"
    ).not.toContain("setIsDragOver(false)");

    const drop = sliceFunction("const handleCanvasDrop = useCallback");
    expect(drop, "画布 drop 没有复用统一复位函数").toContain(
      "resetCanvasDragIndicator()"
    );
    expect(
      drop,
      "画布 drop 里残留了手写的 setDragPos(null)，说明复位逻辑仍有两份"
    ).not.toContain("setDragPos(null)");
  });

  it("④ 输入框必须自己接住 dragenter，不能让它冒泡到画布", () => {
    // 不接的话：拖拽刚进入输入框，画布的全屏指引先被 dragenter 打开，
    // 用户同时看到两个落区（输入框的绿框 + 画布的紫色虚线框）。
    const enter = sliceFunction(
      "const handleComposerImageDragEnterEvent = useCallback"
    );
    expect(enter, "dragenter 的判据必须认外部图片").toContain(
      "dataTransferHasExternalImage(event.dataTransfer)"
    );
    expect(
      enter,
      "dragenter 少了 stopPropagation，画布指引仍会被它打开"
    ).toContain("event.stopPropagation()");
    expect(enter, "dragenter 必须同时打开输入框自己的指引").toContain(
      "setIsComposerImageDragOver(true)"
    );

    // 必须真的挂上去 —— 只定义不挂载是这条链路的典型静默失效。
    expect(
      source.match(/onDragEnter=\{handleComposerImageDragEnterEvent\}/g) || [],
      "onDragEnter 没挂到输入框卡片上"
    ).toHaveLength(1);
  });

  it("⑤ 输入框的 dragleave 绝不能拦截，否则画布指引再也亮不起来", () => {
    // 反向保护：从输入框移回画布时，要靠 dragleave 冒泡到画布
    // 把 dragCounterRef 减回来。一旦在这里 stopPropagation，
    // 画布的计数永远减不掉，后续在画布上拖图时指引不再出现。
    const leave = sliceFunction(
      "const handleComposerImageDragLeaveEvent = useCallback"
    );
    expect(
      leave,
      "输入框的 dragleave 不能 stopPropagation，会让画布的拖拽计数永远减不回来"
    ).not.toContain("event.stopPropagation()");
  });
});
