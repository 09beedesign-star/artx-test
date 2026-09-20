import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 需求：支持把本地图片 / 第三方网页图片**直接拖拽**到主提示词输入框，
 * 输入框要有专属的拖拽指引反馈区，松手后以引用标签显示在输入框里，
 * 同时图片要出现在画布上；拖进来的图片，其所有逻辑规则与交互视觉样式
 * 必须与「引用图片」完全一致。
 *
 * 这条链路最容易出的五种事故，每一种都零报错：
 *
 *   ① 外部拖拽被放行。改之前 composer 的拖拽处理器开头就是
 *      `if (!isComposerTokenDragEvent(event)) return;` ——
 *      外部图片拖拽直接冒泡到画布，图落在画布上，
 *      但**不会**变成输入框里的引用标签。表现是「拖进输入框没反应」。
 *
 *   ② 复制一套登记代码。拖拽如果自己写一遍
 *      「遍历节点 → push 进 referencedAssets」，当时行为一致，
 *      之后任何一次修改只会落到其中一份，另一份静默走偏。
 *      本项目已连续踩过十几次「同一份逻辑多个出口只改一个」。
 *
 *   ③ 自造 id。referencedAssets 按画布节点 id 索引，
 *      自造 id 会让标签与画布节点脱钩（删节点标签不消失、提交拿不到）。
 *
 *   ④ 先 await 再读 dataTransfer。drop 事件同步返回后 DataTransfer 失效，
 *      异步再读 files/items 永远是空的，且不报错。
 *
 *   ⑤ 落点用鼠标坐标。松手时鼠标停在对话框上，
 *      按它反算出的画布坐标在视口之外 —— 图「导入成功」却根本看不见。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * ⚠️⚠️ 按「下一个 const xxx = useCallback」切，而不是按固定字符数切。
 *
 * 固定长度切块会越界吃进后一个函数的代码 —— 这次变异自证真实踩到：
 * 把 drop 处理器里的 event.preventDefault() 删掉，测试居然还是绿的，
 * 因为切块尾巴上带着 handleComposerTextKeyDown 里的另一个 preventDefault，
 * toContain 照样命中。断言「看到了多少源码」比断言写得对不对更容易出事。
 */
function sliceFunction(anchor: string, maxLength = 2600) {
  const index = source.indexOf(anchor);
  expect(index, `找不到锚点：${anchor}`).toBeGreaterThan(-1);
  const rough = source.slice(index, index + maxLength);
  // 从锚点之后再找下一个顶层 useCallback/函数声明，作为硬边界。
  const nextDecl = rough.slice(anchor.length).search(/\n  const \w+ = useCallback|\n  const \w+ = use|\nfunction /);
  return nextDecl === -1
    ? rough
    : rough.slice(0, anchor.length + nextDecl);
}

describe("提示词输入框拖入图片 → 同步画布 + 生成引用标签", () => {
  it("① 外部图片拖拽必须被输入框接住，而不是放行到画布", () => {
    const dragOver = sliceFunction(
      "const handleComposerImageDragOverEvent = useCallback",
      900
    );
    // 判据必须是「这次拖拽里有没有外部图片」，
    // 而不是沿用内部标签重排那套 token 判据。
    expect(
      dragOver,
      "拖拽指引的触发判据必须认外部图片"
    ).toContain("dataTransferHasExternalImage(event.dataTransfer)");
    // preventDefault 是「允许在这里 drop」的唯一表态，少了它浏览器会直接打开图片。
    expect(dragOver, "缺少 preventDefault，浏览器会直接打开图片").toContain(
      "event.preventDefault()"
    );
    // stopPropagation 拦住冒泡，否则画布那层全屏指引也会一起亮。
    expect(
      dragOver,
      "缺少 stopPropagation，画布的全屏拖拽指引会同时亮起"
    ).toContain("event.stopPropagation()");
    expect(dragOver, "必须显示为复制而不是移动").toContain(
      'dropEffect = "copy"'
    );

    const drop = sliceFunction(
      "const handleComposerImageDropEvent = useCallback",
      1200
    );
    expect(drop).toContain("dataTransferHasExternalImage(event.dataTransfer)");
    expect(drop).toContain("event.preventDefault()");
    expect(drop).toContain("event.stopPropagation()");
  });

  it("② 三个外部拖拽处理器必须真的挂到输入框卡片上", () => {
    // 只定义不挂载是这条链路的典型静默失效：
    // 代码看起来全都写了，实际一个事件都收不到。
    const dragOverUsages =
      source.match(/onDragOver=\{handleComposerImageDragOverEvent\}/g) || [];
    const dragLeaveUsages =
      source.match(/onDragLeave=\{handleComposerImageDragLeaveEvent\}/g) || [];
    const dropUsages =
      source.match(/onDrop=\{handleComposerImageDropEvent\}/g) || [];
    expect(dragOverUsages.length, "onDragOver 没挂上").toBe(1);
    expect(dragLeaveUsages.length, "onDragLeave 没挂上").toBe(1);
    expect(dropUsages.length, "onDrop 没挂上").toBe(1);

    // 内部标签重排那三个处理器必须仍然挂着，不能被顺手替换掉。
    expect(
      source.match(/onDragOver=\{handleComposerShellDragOver\}/g) || [],
      "内部标签重排的 onDragOver 被改没了"
    ).toHaveLength(1);
    expect(
      source.match(/onDrop=\{handleComposerShellDrop\}/g) || [],
      "内部标签重排的 onDrop 被改没了"
    ).toHaveLength(1);
  });

  it("③ 拖入与粘贴必须共用同一个引用登记口，不能各写一份", () => {
    const drop = sliceFunction(
      "const handleComposerImageDropEvent = useCallback",
      1200
    );
    // composer 侧只负责同步交出 dataTransfer，登记逻辑在画布侧。
    expect(drop, "必须同步把 dataTransfer 交出去").toContain(
      "void onDropImages(event.dataTransfer)"
    );
    expect(drop, "不能在读取 dataTransfer 之前 await").not.toContain(
      "await onDropImages"
    );

    // 画布侧的同名兄弟函数（异步、吃 DataTransfer）才是真正建节点 + 登记的地方。
    const handler = sliceFunction(
      "const handleComposerImageDrop = useCallback(\n    async (dataTransfer",
      1800
    );
    // 建节点复用画布既有链路。
    expect(handler, "没有复用画布的 pasteClipboardPayload").toContain(
      "pasteClipboardPayload("
    );
    // 登记必须走唯一登记口，不能自己再遍历一遍节点。
    expect(handler, "拖拽没有走统一的引用登记口").toContain(
      "registerImageNodesAsReferences("
    );
    expect(
      handler,
      "拖拽处理里不应自己 setReferencedAssets，那是第二套登记逻辑"
    ).not.toContain("setReferencedAssets(");
    expect(
      handler,
      "拖拽处理里不应直接造 segment，标签应由 referencedAssets 的同步 effect 自动插入"
    ).not.toContain("createAssistantImageSegment");
  });

  it("④ 粘贴也必须改成走同一个登记口（否则又是两个出口）", () => {
    const paste = sliceFunction(
      "const handleComposerImagePaste = useCallback",
      1400
    );
    expect(paste, "粘贴没有改成走统一登记口").toContain(
      "registerImageNodesAsReferences("
    );
    expect(
      paste,
      "粘贴里残留了自己的 setReferencedAssets，说明登记逻辑仍有两份"
    ).not.toContain("setReferencedAssets(");

    // 唯一登记口本身必须用画布节点 id。
    const register = sliceFunction(
      "const registerImageNodesAsReferences = useCallback",
      1400
    );
    expect(register, "引用素材的 id 必须取画布节点 id").toContain(
      "id: node.id"
    );
    expect(register, "登记口必须写进 referencedAssets").toContain(
      "setReferencedAssets("
    );
  });

  it("⑤ 落点必须用画布中心，不能用鼠标坐标", () => {
    const handler = sliceFunction(
      "const handleComposerImageDrop = useCallback(\n    async (dataTransfer",
      1800
    );
    // originOverride 传 undefined = 用画布中心。
    // 一旦出现 screenToFlowPosition，说明有人按鼠标坐标反算落点，
    // 而松手时鼠标在对话框上，算出来的位置在视口之外，图会看不见。
    expect(
      handler,
      "不能按鼠标坐标反算落点，松手时鼠标在对话框上，图会落到视口外"
    ).not.toContain("screenToFlowPosition");
  });

  it("⑥ 必须有输入框专属的拖拽指引区，且与内部标签重排状态分开", () => {
    expect(
      source,
      "缺少输入框专属的拖拽悬停状态"
    ).toContain("const [isComposerImageDragOver, setIsComposerImageDragOver]");
    // 指引区文案：必须说清楚「会变成引用图片」，
    // 而不是复用画布那句「将图片拖入该区域」。
    expect(source, "缺少输入框专属的拖拽指引文案").toContain(
      "松手即可作为引用图片"
    );
    // 指引层必须 pointer-events-none，否则它自己会吃掉 dragleave/drop。
    const overlayIndex = source.indexOf("松手即可作为引用图片");
    expect(overlayIndex).toBeGreaterThan(-1);
    const overlay = source.slice(overlayIndex - 900, overlayIndex);
    expect(
      overlay,
      "指引层必须 pointer-events-none，否则会吃掉自己的 drop 事件"
    ).toContain("pointer-events-none");
    expect(overlay, "指引区必须是虚线框，与画布指引视觉语言一致").toContain(
      "dashed"
    );

    // 反向断言：绝不能复用 dragOverComposerSegmentId 来驱动这个指引区，
    // 那个状态是内部标签重排用的，复用会让拖标签时也弹出「松手即可作为引用图片」。
    const overlayBlockStart = source.lastIndexOf(
      "{isComposerImageDragOver && (",
      overlayIndex
    );
    expect(overlayBlockStart).toBeGreaterThan(-1);
    expect(
      source.slice(overlayBlockStart, overlayIndex),
      "拖拽指引区不能由内部标签重排的状态驱动"
    ).not.toContain("dragOverComposerSegmentId");
  });

  it("⑦ 拿不到图片时必须明确告知，不能静默什么都不发生", () => {
    const drop = sliceFunction(
      "const handleComposerImageDropEvent = useCallback",
      1200
    );
    expect(drop, "拖入失败时没有任何反馈").toContain(
      "未读取到可拖入的图片"
    );
  });
});
