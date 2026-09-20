import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 需求：支持从外部粘贴图片到 AI 助手对话框，
 * 并且同步在画布中显示这张图；对话框里生成的标签
 * 必须与「引用图片」标签同规则、同样式、所有属性完全一致。
 *
 * 这条链路最容易出的三种事故，每一种都是零报错的：
 *
 *   ① 只改了一处 onPaste。composer 的文本段有两种渲染形态
 *      （单段时是 <textarea>，多段时是 contentEditable <span>），
 *      各有一个 onPaste。只改一个 → 有标签时粘贴就失效，
 *      而这恰恰是「粘贴第二张图」的场景。
 *
 *   ② 自己造了一套标签结构。粘贴图片如果不进 referencedAssets，
 *      而是直接 createAssistantImageSegment，标签当时看着一样，
 *      但它与画布节点脱钩：删画布节点标签不消失、提交时拿不到、
 *      onRemoveReference 也删不掉它。用户要求的「所有属性完全一致」
 *      只有走 referencedAssets 这条唯一事实源才成立。
 *
 *   ③ 先 await 再读 clipboardData。paste 事件同步返回后
 *      DataTransfer.items 会被清空，异步再读永远是空的，
 *      表现为「粘贴没反应」且不报任何错。
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * ⚠️⚠️ 按「下一个顶层声明」切，而不是按固定字符数切。
 * 固定长度会越界吃进后一个函数的代码，让 toContain 被邻居的同名调用糊弄过去
 * （composer-image-drop 的变异自证真实踩过：删掉 preventDefault 测试仍绿）。
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

describe("对话框粘贴图片 → 同步画布 + 生成引用标签", () => {
  it("① composer 的两处 onPaste 必须都接到同一个处理函数上", () => {
    // 数「出口个数」是这条测试的全部意义。
    // 项目里已经连续踩过多次「同一份逻辑的多个出口只改一个」，
    // 漏掉的那个出口不会报错，只是功能在特定场景下静默失效。
    const handlerUsages = source.match(
      /onPaste=\{handleComposerImagePasteEvent\}/g
    );
    expect(handlerUsages, "composer 的 onPaste 没有接上统一处理函数").not.toBeNull();
    expect(
      handlerUsages!.length,
      "composer 有两种文本段渲染形态（textarea / contentEditable），两处 onPaste 必须都接"
    ).toBe(2);

    // 反向断言：旧的「拒绝粘贴」提示在**真实渲染的**组件里必须彻底消失。
    //
    // ⚠️ 这里刻意不对整个文件做 not.toContain。
    // BottomPromptBar 里还有一处同样的提示，但那个组件是死代码——
    // onboarding-tour.test.ts 里已有断言证明它从未被 <BottomPromptBar 渲染过。
    // 把死代码算进出口数会高估覆盖面，真该改的地方反而可能被漏掉。
    const panelStart = source.indexOf("function CanvasAssistantPanel(");
    const panelEnd = source.indexOf("function InnerCanvas(");
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelSource = source.slice(panelStart, panelEnd);
    expect(
      panelSource,
      "真实渲染的助手面板里还残留着「拒绝粘贴」的旧分支"
    ).not.toContain("图片不能粘贴到提示词输入框");

    // 同时确认那处残留确实只在死代码里，而不是又冒出了新的出口。
    const rejectionCount = source.match(/图片不能粘贴到提示词输入框/g) || [];
    expect(
      rejectionCount.length,
      "「拒绝粘贴」应当只剩 BottomPromptBar（死代码）那一处"
    ).toBe(1);
  });

  it("② 粘贴的图片必须先落成画布节点，再登记进 referencedAssets", () => {
    const handler = sliceFunction("const handleComposerImagePaste = useCallback");

    // 必须复用画布既有的粘贴链路建节点，而不是另造一套。
    expect(handler, "没有复用画布的 pasteClipboardPayload").toContain(
      "pasteClipboardPayload("
    );
    // 浏览器拿不到 items 时要回落到异步 Clipboard API，
    // 画布那条链路本来就有这层兜底，对话框不能少。
    expect(handler, "缺少 navigator.clipboard 兜底").toContain(
      "pasteClipboardFromNavigator("
    );

    // 关键：标签必须走 referencedAssets 这条唯一事实源。
    //
    // ⚠️ 登记逻辑已抽成 registerImageNodesAsReferences（粘贴与拖拽共用），
    // 所以这里断言「调了唯一登记口」，而不是断言「函数体里有 setReferencedAssets」。
    // 反过来：粘贴函数里**不该**再自己 setReferencedAssets —— 那就是第二份登记逻辑。
    expect(handler, "粘贴的图片没有走统一的引用登记口").toContain(
      "registerImageNodesAsReferences("
    );
    expect(
      handler,
      "粘贴里残留了自己的 setReferencedAssets，说明登记逻辑又分叉成两份"
    ).not.toContain("setReferencedAssets(");

    // 唯一登记口本身必须用画布节点 id，否则标签与画布节点脱钩。
    const register = sliceFunction(
      "const registerImageNodesAsReferences = useCallback",
      1400
    );
    expect(register, "引用素材的 id 必须取画布节点 id").toContain("id: node.id");
    expect(register, "登记口必须真的写进 referencedAssets").toContain(
      "setReferencedAssets("
    );

    // 反向断言：这里绝不能自己拼标签 segment。
    // 一旦出现，就说明又分叉出了第二套标签数据流。
    expect(
      handler,
      "粘贴处理函数里不应直接造 segment，标签应由 referencedAssets 的同步 effect 自动插入"
    ).not.toContain("createAssistantImageSegment");
  });

  it("③ clipboardData 必须同步交出去，不能先 await", () => {
    const handler = sliceFunction(
      "const handleComposerImagePasteEvent = useCallback",
      900
    );
    expect(handler).toContain("event.preventDefault()");
    // void + .then 表示同步调用、异步收尾；
    // 写成 async (event) => { await ... } 就会丢失 clipboardData。
    expect(handler, "必须同步把 clipboardData 交出去").toContain(
      "void onPasteImages(event.clipboardData)"
    );
    expect(handler, "不能在读取 clipboardData 之前 await").not.toContain(
      "await onPasteImages"
    );
  });

  it("④ 普通链接不能被当成图片吞掉", () => {
    // clipboardPayloadHasImageContent 对纯文本的判据是「任何 https:// 都算图片」。
    // 画布那样宽松没问题，但输入框里用它，
    // 用户粘一条普通链接进提示词就会被拦下来，文字进不去。
    const handler = sliceFunction(
      "const handleComposerImagePasteEvent = useCallback",
      900
    );
    expect(handler, "输入框必须用更严格的判据").toContain(
      "clipboardPayloadHasDirectImageContent"
    );
    expect(handler, "输入框不能直接用画布那套宽松判据").not.toContain(
      "clipboardPayloadHasImageContent("
    );

    // 严格判据本身要确实把普通网址排除掉：
    // 纯文本分支只认 data:image / blob: / 图片扩展名直链。
    const predicate = sliceFunction(
      "function clipboardPayloadHasDirectImageContent",
      1400
    );
    expect(predicate).toContain("^(data:image\\/|blob:)");
    expect(predicate, "纯文本网址必须要求图片扩展名结尾").toMatch(
      /png\|jpe\?g\|gif\|webp/
    );
  });

  it("⑤ 画布粘贴函数必须把新建节点交出来，否则拿不到 id 去建标签", () => {
    const pasteImages = sliceFunction(
      "const pasteClipboardImages = useCallback",
      1800
    );
    expect(pasteImages, "返回类型必须是节点数组").toContain("Promise<Node[]>");
    expect(pasteImages, "必须把新建节点返回出去").toContain(
      "return nodesToPaste;"
    );
    // 反向断言：老的 boolean 返回不能残留，
    // 残留会让调用方的 `if (!pasted)` 在空数组时判断反了。
    expect(pasteImages).not.toContain("return true;");

    const pasteSources = sliceFunction(
      "const pasteClipboardImageSources = useCallback",
      1900
    );
    expect(pasteSources).toContain("Promise<Node[]>");
    expect(pasteSources).toContain("return nodesToPaste;");
  });

  it("⑥ 画布自身的粘贴调用点必须改成按长度判断", () => {
    // 返回值从 boolean 改成数组后，`if (!pasted)` 会永远为 false
    // （空数组是 truthy），粘贴失败时的兜底链路就全废了，且零报错。
    expect(source).toContain("if (pastedNodes.length === 0)");
    expect(source).toContain("if (fallbackNodes.length > 0) return;");
    expect(source).toContain("if (pastedExternalNodes.length > 0) return;");
  });
});
