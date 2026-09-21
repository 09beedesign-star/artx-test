import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 单张图片「局部重绘」的三条需求的回归锁（2026-09-21）。
 *
 * 需求原文（用户）：
 *   1. 单张图片的局部重绘的修改**在原图上进行**；
 *   2. 一旦生成效果不理想，要给到用户返回 undo 按钮，回退到上一步局部重绘之前的效果；
 *   3. 局部重绘生成进行中的状态效果是把**当前图片高斯模糊**之后加上 **LOGO 的循环动画**，
 *      直到新图完成。
 *
 * ⚠️ 全部是源码文本断言，**必须配合变异自证使用** —— 光跑绿说明不了任何问题。
 *    每条断言都在本目录的变异记录里逐条验过能挡下对应的破坏。
 * ⚠️ 切片一律先确认锚点唯一，锚点不唯一时 indexOf 会切到别人身上，断言恒真。
 */

const SOURCE_PATH = join(__dirname, "InfiniteCanvas.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");
const cssSource = readFileSync(
  join(__dirname, "..", "..", "index.css"),
  "utf8"
);

function countOf(needle: string): number {
  let count = 0;
  let cursor = 0;
  for (;;) {
    const hit = source.indexOf(needle, cursor);
    if (hit === -1) return count;
    count += 1;
    cursor = hit + needle.length;
  }
}

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`起始锚点失效，找不到：${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`终止锚点失效，找不到：${endMarker}`);
  return source.slice(start, end);
}

describe("就地局部重绘：锚点前置保障", () => {
  it.each([
    "const inPlaceTargetNodeId = detail.inPlaceRepaintNodeId;",
    "const repaintsInPlace = Boolean(inPlaceTargetNode);",
    "const images = getValidGeneratedImages(detail.images, requestedCount);",
    'if (detail.status === "pending") {',
    "const handleAssetEditSubmit = useCallback(",
    "const handleNodeComposerSubmit = useCallback(",
    "canUndoInPlaceRepaint",
    'aria-label="撤销局部重绘"',
  ])("锚点 %s 在源码中必须唯一出现", marker => {
    const expected = marker === "canUndoInPlaceRepaint" ? 2 : 1;
    expect(
      countOf(marker),
      "锚点不唯一或已消失，后续切片断言会切错位置（恒绿风险）"
    ).toBe(expected);
  });
});

describe("需求 1：修改落在原图上（payload 与唯一回包出口）", () => {
  it("payload 必须声明就地重绘目标字段", () => {
    expect(
      source,
      "ImageGeneratorPayload 上没有 inPlaceRepaintNodeId —— 状态无法经由持久化的 payload 传递"
    ).toContain("  inPlaceRepaintNodeId?: string;");
    expect(
      sliceBetween("type ImageGeneratorPayload = {", "type ImageRegenerateRequestDetail = {"),
      "字段声明跑到别的类型上去了"
    ).toContain("inPlaceRepaintNodeId?: string;");
  });

  it("闸门要求目标节点真的还在（找不到节点必须回落，不能静默什么都不做）", () => {
    const gate = sliceBetween(
      "const inPlaceTargetNodeId = detail.inPlaceRepaintNodeId;",
      "const imageGenerationGap = 20;"
    );
    expect(gate, "没有按 id + 类型找回目标节点").toContain(
      'node.id === inPlaceTargetNodeId && node.type === "asset"'
    );
    expect(
      gate,
      "闸门不是「节点真的存在」—— 节点被删掉后用户点了生成会永远等不到结果"
    ).toContain("const repaintsInPlace = Boolean(inPlaceTargetNode);");
  });

  it("pending：标记原图为重绘中并**提前 return**，不插占位框", () => {
    const pending = sliceBetween(
      'if (detail.status === "pending") {',
      "if (detail.editMode !== true) {"
    );
    expect(pending, "切片非空保障").toContain("inPlaceRepainting: true");
    expect(pending, "没有把当前像素交给模糊层").toContain(
      "sourceBackgroundSrc: currentSrc"
    );
    // 提前 return 的证据：这一段里不能出现占位框的构造
    expect(
      pending,
      "没有提前 return —— 会在原图旁边多插一个空占位框"
    ).not.toContain("placeholderForGeneration");
    expect(pending, "缺少提前 return").toContain("toast(\"AI 局部重绘中\"");
  });

  it("failed：原图必须原样保留，绝不贴「生成图片失败」面板", () => {
    const failed = sliceBetween(
      "         * 就地重绘失败 = **什么都不改**。",
      "const blockedByCredits = isAiCreditBlockedMessage(detail.error);"
    );
    expect(failed, "切片非空保障").toContain("inPlaceRepainting: false");
    expect(failed, "失败后必须清掉生成中标记，否则图永远卡在模糊态").toContain(
      "isGeneratingImage: false"
    );
    expect(
      failed,
      "走了通用失败标记 —— 用户的原图会被「生成图片失败」面板整张顶掉"
    ).not.toContain("isGenerationFailed: true");
    expect(
      failed,
      "没有清掉 sourceBackgroundSrc，模糊底会留在节点上"
    ).toContain("sourceBackgroundSrc: undefined");
  });

  it("completed：结果写回原节点，并留下撤销快照", () => {
    const completed = sliceBetween(
      "const images = getValidGeneratedImages(detail.images, requestedCount);",
      "if (images.length === 0) {"
    );
    expect(completed, "切片非空保障").toContain("localSrc: versionedSrc");
    expect(completed, "缺少撤销快照").toContain("inPlaceRepaintUndo: {");
    expect(
      completed,
      "快照里只存了重绘前的像素，没有重绘后的 —— 撤销按钮无法判断快照是否过期"
    ).toContain("repaintedLocalSrc: versionedSrc");
    expect(
      completed,
      "重绘结果又被写成一个新节点了 —— 需求要的是改在原图上"
    ).not.toContain("generated-${generationId}");
  });

  it("completed 的就地分支必须排在「新建节点」逻辑之前", () => {
    const inPlaceIdx = source.indexOf("── 就地局部重绘回包");
    const newNodeIdx = source.indexOf("const generatedNodes = images.map");
    expect(inPlaceIdx, "就地回包分支不见了").toBeGreaterThan(-1);
    expect(newNodeIdx, "新建节点分支不见了").toBeGreaterThan(-1);
    expect(
      inPlaceIdx,
      "就地分支排到了新建节点之后 —— 结果会先被落成一张新图，就地分支再也轮不到"
    ).toBeLessThan(newNodeIdx);
  });

  it("超时清理也要分叉：超时不能把用户的原图变成失败面板", () => {
    const timeout = sliceBetween(
      "if (data.inPlaceRepainting === true) {",
      "isGenerationFailed: true,"
    );
    expect(timeout, "切片非空保障").toContain("inPlaceRepainting: false");
    expect(timeout, "超时后没清生成中标记").toContain("isGeneratingImage: false");
  });
});

describe("需求 2：撤销按钮与快照失效边界", () => {
  it("撤销按钮必须挂在「快照仍然有效」的判断上", () => {
    const flag = sliceBetween(
      "  const canUndoInPlaceRepaint =",
      "  const isEditing ="
    );
    expect(
      flag,
      "判据用了重绘前的 localSrc —— 原节点本来没有 localSrc 时按钮永远不出现，用户失去撤销入口"
    ).toContain('typeof inPlaceRepaintUndo?.repaintedLocalSrc === "string"');
    expect(
      flag,
      "没有比对节点当前像素是否仍等于重绘后的那一个 —— 快照过期后点撤销会覆盖用户后来的图"
    ).toContain("inPlaceRepaintUndo.repaintedLocalSrc");
  });

  it("按钮点击必须派发唯一的撤销事件，且不能把点击传给画布", () => {
    const button = sliceBetween(
      "            ── 局部重绘的「撤销」按钮",
      "{isCameraViewAdjusting && !isAiProcessingImage && ("
    );
    expect(button, "切片非空保障").toContain(
      'new CustomEvent("in-place-repaint-undo-request"'
    );
    expect(button, "没有把节点 id 传出去，父级不知道撤销哪一张").toContain(
      "detail: { nodeId }"
    );
    expect(
      button,
      "没有 stopPropagation —— 点撤销会同时选中/拖动节点"
    ).toContain("event.stopPropagation()");
    expect(
      button,
      "按钮没有走「快照有效」的判断，换图之后还会亮着"
    ).toContain("canUndoInPlaceRepaint &&");
  });

  it("撤销执行点：回退像素并清掉快照，且拒绝执行过期快照", () => {
    /*
     * ⚠️ 起止锚点都不能用 `useEffect(() => {\n const handler = ...` ——
     *    那个形状在文件里出现多次，indexOf 会切到 text-node-download 那一段，
     *    切片横跨几千行，断言全部恒真。
     */
    const body = sliceBetween(
      "   * ⚠️ 快照可能过期 —— 用户重绘完又换了图",
      'window.addEventListener("in-place-repaint-undo-request", handler);'
    );
    expect(body.length, "撤销执行点切片为空或过宽，锚点失效").toBeGreaterThan(600);
    expect(body.length, "切片过宽，可能把别的监听器圈进来了").toBeLessThan(6000);
    expect(body, "没有回退像素").toContain("localSrc: undo.localSrc");
    expect(
      body,
      "撤销后没有清掉快照 —— 按钮会永远亮着"
    ).toContain("inPlaceRepaintUndo: undefined");
    expect(body, "没有拦截过期快照").toContain(
      "data.localSrc !== undo.repaintedLocalSrc"
    );
    expect(body, "撤销必须进历史栈，否则 Ctrl+Z 与它互相打架").toContain(
      "pushHistory(nodesRef.current, edgesRef.current)"
    );
    expect(
      body,
      "撤销依据不是节点自己的快照 —— 另开 state 会出现「开在 A 关在 B」"
    ).toContain("nodesRef.current.find(item => item.id === nodeId)");
    expect(
      source.indexOf(
        'window.removeEventListener("in-place-repaint-undo-request", handler);'
      ),
      "监听器没有解绑"
    ).toBeGreaterThan(
      source.indexOf(
        'window.addEventListener("in-place-repaint-undo-request", handler);'
      )
    );
  });
});

describe("需求 3：生成中 = 当前图片高斯模糊 + LOGO 循环动画", () => {
  it("模糊层必须读就地重绘标记，且带模糊滤镜", () => {
    const blurLayer = sliceBetween(
      "{sourceBackgroundSrc &&\n            isAiProcessingImage &&",
      "{isAiProcessingImage ? ("
    );
    expect(blurLayer, "切片非空保障").toContain("blur(26px)");
    expect(
      blurLayer,
      "模糊层没区分就地重绘，仍是普通处理态的低亮度"
    ).toContain("isInPlaceRepainting");
    expect(
      blurLayer,
      "模糊层读的是 sourceBackgroundSrc —— 就地重绘时必须由 pending 分支写进节点，否则一片黑"
    ).toContain("src={sourceBackgroundSrc}");
  });

  it("遮罩底色必须是半透明，不能把模糊层盖死", () => {
    const overlay = sliceBetween(
      "background: isInPlaceRepainting",
      'color: "rgba(255,255,255,0.30)",\n                zIndex: 1,'
    );
    expect(overlay, "切片非空保障").toContain("rgba(8,8,10,0.30)");
    /*
     * 顺序断言：三元链里就地分支必须排在 isGenerationFailed / isGeneratingImage 之前。
     * ⚠️ 不能用「indexOf(...) < indexOf(...) + 1」这种写法 —— 那是恒真式，
     *    等于没断言（本项目在别处栽过「恒绿断言」）。
     */
    const branchOrder = sliceBetween(
      "background: isInPlaceRepainting",
      'color: "rgba(255,255,255,0.30)",'
    );
    expect(
      branchOrder.indexOf("isInPlaceRepainting"),
      "就地分支没有排在 isGeneratingImage 之前"
    ).toBeLessThan(branchOrder.indexOf("isGenerationFailed"));
    expect(
      branchOrder,
      "就地分支后面没有紧跟失败与生成判断，三元链结构被改动了"
    ).toContain("isGenerationFailed");
  });

  it("处理中文字必须提亮，否则压在模糊照片上读不出来", () => {
    const textColor = sliceBetween(
      "  const processingTextColor =",
      "  const processingTextShadow ="
    );
    expect(textColor, "就地重绘没有单独的文字色").toContain(
      "rgba(255,255,255,0.94)"
    );
    expect(textColor, "没有按就地重绘分叉").toContain("isInPlaceRepainting");
    const span = sliceBetween(
      "color: processingTextColor,",
      "fontSize: processingTextSize,"
    );
    expect(span, "文字没用到提亮后的颜色").toContain("textShadow");
  });

  it("文案分支必须把就地重绘排在 isGeneratingImage 之前", () => {
    const lines = sliceBetween(
      "  const processingLines = (() => {",
      "  const displaySrc ="
    );
    const inPlaceAt = lines.indexOf("AI 局部重绘中");
    const generatingAt = lines.indexOf('["正在开足马力", "为您生成图片"]');
    expect(inPlaceAt, "就地重绘文案不见了").toBeGreaterThan(-1);
    expect(generatingAt, "普通生成文案不见了").toBeGreaterThan(-1);
    expect(
      inPlaceAt,
      "就地重绘文案排在 isGeneratingImage 之后 —— 永远轮不到，字会写「正在开足马力」"
    ).toBeLessThan(generatingAt);
  });

  it("LOGO 循环动画必须仍在（infinite）", () => {
    const shell = cssSource.slice(
      cssSource.indexOf(".artx-ai-generation-mark-shell {"),
      cssSource.indexOf(".artx-ai-generation-mark-shell-failed")
    );
    expect(shell.length, "LOGO 容器样式切片为空").toBeGreaterThan(100);
    expect(
      shell,
      "LOGO 容器不再是无限循环动画 —— 需求要的是「LOGO 的循环动画」"
    ).toContain("infinite");
    expect(
      source,
      "生成中的节点必须仍然渲染 LOGO 图（generationMark）"
    ).toContain("src={generationMark}");
  });
});

describe("入口接线：只在单张时启用就地重绘", () => {
  const quickEdit = sliceBetween(
    "const handleAssetEditSubmit = useCallback(",
    "const handleNodeComposerSubmit = useCallback("
  );

  it("切片非空", () => {
    expect(quickEdit.length, "提交出口切片为空，锚点失效").toBeGreaterThan(1500);
  });

  it("就地重绘只在单张时启用（多张没有「哪张覆盖原图」的答案）", () => {
    expect(
      quickEdit,
      "多张也会就地覆盖同一个节点 —— 三个结果互相覆盖，用户只看到最后一张"
    ).toContain("requestedCount === 1 ? target.nodeId : undefined");
  });

  it("占位 payload 与真实生成链路必须都带上目标（只带一条 = 一半流程还在旁边出图）", () => {
    expect(
      (quickEdit.match(/inPlaceRepaintNodeId,/g) || []).length,
      "inPlaceRepaintNodeId 只在一条链路上传了 —— 另一条仍然会新建节点"
    ).toBeGreaterThanOrEqual(2);
  });

  it("runDerivedImageGeneration 必须支持该可选参数，且默认行为不变", () => {
    const signature = sliceBetween(
      "  const runDerivedImageGeneration = useCallback(",
      "      /**\n       * 失败时是否把错误抛给调用方"
    );
    expect(signature, "runDerivedImageGeneration 没有接收该参数").toContain(
      "      inPlaceRepaintNodeId,\n"
    );
    expect(signature, "参数没有声明为可选，老调用点会全部编译失败").toContain(
      "inPlaceRepaintNodeId?: string;"
    );
    /*
     * payload 构造在函数体内、签名之后，必须单独切一段。
     * ⚠️ 这一段才是「刷新页面后续跑还认得就地重绘」的关键：
     *    payload 会被持久化，字段只写在调用处 = 重放时丢失。
     * 起始锚点用**八空格缩进的** editMode（全文件唯一），否则会切到别的 payload 上。
     */
    const payload = sliceBetween(
      "        editMode: true,",
      "      activeForegroundImageTaskIdsRef.current.add(generationId);"
    );
    expect(payload.length, "payload 切片为空，锚点失效").toBeGreaterThan(200);
    expect(
      payload,
      "参数没有进 payload —— 持久化后刷新页面这次重绘会退回成新建一张图"
    ).toContain("inPlaceRepaintNodeId,");
  });
});
