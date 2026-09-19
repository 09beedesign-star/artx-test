import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ⚠️ 用相对路径，不用 @shared 别名：vitest 不解析该别名，写别名会让整个套件
// 加载失败并显示「0 test」——不是失败，是压根没跑，极易被误判成通过。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

/**
 * 空画布引导（暗纹缺省按钮 + 草稿图片节点）的接线防护测试。
 *
 * 【为什么光测纯函数不够】
 * `canvas-empty-state.ts` 的判据测得再全，只要 InfiniteCanvas 没接上它，
 * 用户看到的就是「新建画布还是一片空白，什么按钮都没有」，且零报错。
 * 📌 本项目踩过同类事故（`32a6561`）：测纯函数 ≠ 测修复。
 *
 * 【⚠️⚠️ 为什么全部断言都必须切片，不能扫全文件】
 * InfiniteCanvas.tsx 有三万多行。变异自证时实测暴露了两条**恒绿**断言：
 *   - `pointerEvents: "none"` 在全文件出现 **27 次**
 *   - `nodrag nopan` 在全文件出现 **48 次**
 * 我把空状态覆盖层的穿透属性删掉后，测试依旧全绿 —— 因为它匹配到的是
 * 别的组件里的同名属性，和我要守的那一处毫无关系。
 * 📌⭐⭐ **在超大文件里做源码断言，锚点必须先确认「在目标块外是否也存在」，
 *    否则断言守的是别人家的门。** 所以下面统一先切出组件块再断言。
 */

const source = (() => {
  const raw = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
  const stripped = stripSourceComments(raw);
  // ⚠️ 自检：剥离函数一旦退化成贪心正则会误吃代码，让反向断言集体恒绿。
  assertStripKeptSource(raw, stripped);
  return stripped;
})();

/**
 * 从源码里切出一段区间。
 *
 * ⚠️ 切不出来时直接抛错而不是返回空串：
 * 返回空串会让区间内的 `not.toContain` 全部恒绿 ——
 * 「没量到」和「没问题」输出长得一模一样，这是最阴险的一种失效。
 */
function sliceBetween(startMarker: string, endMarker: string, minLength = 200): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`切片起点不存在：${startMarker}（实现可能已重命名）`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`切片终点不存在：${endMarker}`);
  const block = source.slice(start, end);
  if (block.length < minLength) {
    throw new Error(`切片过短（${block.length} 字符），区间多半不对`);
  }
  return block;
}

/** 空状态覆盖层组件体 */
const overlayBlock = sliceBetween(
  "function CanvasEmptyStateOverlay(",
  "const nodeTypes: NodeTypes"
);

/** 草稿图片节点组件体 */
const draftNodeBlock = sliceBetween(
  "function DraftImageNodeComponent(",
  "function CanvasEmptyStateOverlay("
);

/** 「生成图片」回调体 */
const generateBlock = sliceBetween(
  "const handleEmptyStateGenerate",
  "const pasteCrossCanvasClipboard"
);

describe("canvas empty state wiring", () => {
  it("renders the overlay through the shared emptiness predicate", () => {
    expect(source).toContain("isCanvasEmpty(displayNodes)");
    expect(source).toContain("<CanvasEmptyStateOverlay");
    expect(overlayBlock).toContain('data-testid="canvas-empty-state-overlay"');
  });

  it("never re-implements the emptiness check inline", () => {
    // 📌 第二个出口 = 两套判据慢慢长歪。判据只能有一个来源。
    expect(source).not.toContain("displayNodes.length === 0 &&");
    expect(source).not.toContain("nodes.length === 0 && <CanvasEmptyStateOverlay");
  });

  it("keeps the overlay click-through so canvas interactions still work", () => {
    /*
     * ⚠️ 全屏层最典型的静默故障就是「画布点不动了」。
     * 断言必须落在覆盖层这一段里 —— 全文件有 27 处 pointerEvents:"none"，
     * 扫全文件等于没扫。
     */
    expect(overlayBlock).toContain('pointerEvents: "none"');
    // 按钮本身要放开，否则两个入口点不动
    expect(overlayBlock).toContain('pointerEvents: "auto"');
  });

  it("offers exactly the two entries the user asked for", () => {
    expect(overlayBlock).toContain('"上传图片"');
    expect(overlayBlock).toContain('"生成图片"');
  });

  it("reuses the existing upload flow instead of forking a new one", () => {
    // 这个回调本身只有三行，阈值单独放到 80（仍足以在区间失效时抛错）。
    const uploadBlock = sliceBetween(
      "const handleEmptyStateUpload",
      "const handleEmptyStateGenerate",
      80
    );
    expect(uploadBlock).toContain('new CustomEvent("workspace-upload-request")');
  });

  it("inserts a square draft node sized from the shared ratio helper", () => {
    expect(generateBlock).toContain("computeDraftNodeRect(usableWidth, viewportHeight)");
    // 正方形：换算到 flow 坐标后取较小边
    expect(generateBlock).toContain("const side = Math.min(flowWidth, flowHeight);");
    expect(generateBlock).toContain('type: "draftImage"');
  });

  it("registers the draft node type so it can actually render", () => {
    // 📌 漏这一行的话，节点会被插进去但渲染成空白，且不报错。
    expect(source).toContain("draftImage: DraftImageNodeComponent");
  });

  it("embeds a prompt input inside the draft node", () => {
    expect(draftNodeBlock).toContain('data-testid="canvas-draft-image-node"');
    expect(draftNodeBlock).toContain("<textarea");
    /*
     * ⚠️ ReactFlow 里的输入控件必须显式标 nodrag/nopan，
     * 否则在节点上打字会被画布当成拖拽/平移吞掉。
     * 全文件有 48 处 nodrag nopan，所以只在草稿节点这一段里断言。
     */
    expect(draftNodeBlock).toContain("nodrag nopan");
  });

  it("routes generation through the single dispatch entry point", () => {
    // ⚠️ 不能自己建占位节点 + 自己调模型，那会绕开落盘与积分链路。
    // 全文件有十几处调用，必须限定在草稿节点内。
    expect(draftNodeBlock).toContain("dispatchImageGenerationTask(");
    /*
     * ⚠️ 画幅曾经硬编码成 `ratio: "1:1"`，`1bf7029` 把画幅选择器接进节点后
     *    改成了 resolveRatio 的返回值，但这条断言没跟着改，一直红着。
     *    现在守的是「画幅来自统一的 resolveRatio，而不是又写死一个值」。
     */
    expect(draftNodeBlock).toContain("const ratio = resolveRatio(activeSkill, imageRatio);");
    expect(draftNodeBlock).toContain("displaySize: getImageDisplaySizeForRatio(ratio)");
  });

  it("records history before mutating nodes so undo still works", () => {
    expect(generateBlock).toContain("pushHistory();");
    // pushHistory 必须在 setNodes 之前，否则撤销会跳过这一步
    expect(generateBlock.indexOf("pushHistory();")).toBeLessThan(
      generateBlock.indexOf("setNodes(")
    );
  });

  it("gives the draft node a close button in its top-right corner", () => {
    expect(draftNodeBlock).toContain('aria-label="关闭图片生成节点"');
    // 右上角：两个类名都得在，只写一个会贴错边
    expect(draftNodeBlock).toContain("right-2");
    expect(draftNodeBlock).toContain("top-2");
  });

  it("anchors the close button to the node itself, not some ancestor", () => {
    /*
     * ⚠️ absolute 定位要生效，根容器必须是 relative。
     *    少了 relative，按钮会往上找到祖先的定位上下文，跑到画布别的地方去，
     *    **不报错**，只是位置不对 —— 典型的静默失效。
     */
    const rootAt = draftNodeBlock.indexOf('data-testid="canvas-draft-image-node"');
    expect(rootAt).toBeGreaterThan(-1);
    const rootClass = draftNodeBlock.slice(
      draftNodeBlock.indexOf("className=", rootAt),
      draftNodeBlock.indexOf("style=", rootAt)
    );
    expect(rootClass).toContain("relative");
  });

  it("keeps the close button clickable inside ReactFlow", () => {
    /*
     * ⚠️ ReactFlow 把节点上的 mousedown 当成拖拽起手。
     *    不标 nodrag nopan 并 stopPropagation，点击会被画布吞掉，
     *    表现为「点了 ✕ 没反应」且零报错。
     *    全文件有几十处 nodrag nopan，所以要限定在按钮那一小段里断言。
     */
    const btnAt = draftNodeBlock.indexOf('aria-label="关闭图片生成节点"');
    expect(btnAt).toBeGreaterThan(-1);
    const btnStart = draftNodeBlock.lastIndexOf("<button", btnAt);
    const btnBlock = draftNodeBlock.slice(btnStart, btnAt);
    expect(btnBlock).toContain("nodrag nopan");
    expect(btnBlock).toContain("onMouseDown={e => e.stopPropagation()}");
    expect(btnBlock).toContain("e.stopPropagation()");
  });

  it("closes through the existing deleteElements instead of a second removal path", () => {
    // 📌 同一份「移除本节点」逻辑只能有一个出口。
    expect(draftNodeBlock).toContain("const handleClose = useCallback(() => {");
    const closeAt = draftNodeBlock.indexOf("const handleClose = useCallback");
    const closeBlock = draftNodeBlock.slice(closeAt, closeAt + 260);
    expect(closeBlock).toContain("deleteElements({ nodes: [{ id }] })");
    // 不能自己写一套 setNodes 过滤
    expect(closeBlock).not.toContain("setNodes(");
    expect(closeBlock).not.toContain("filter(");
  });

  it("does not double-push history when closing", () => {
    /*
     * deleteElements 会走 handleNodesChangeWithHistory，那里已经自动 pushHistory。
     * 这里再压一次 → 多压一格，用户体验是「撤销一次没反应，撤两次才回来」。
     */
    const closeAt = draftNodeBlock.indexOf("const handleClose = useCallback");
    const closeBlock = draftNodeBlock.slice(closeAt, closeAt + 260);
    expect(closeBlock).not.toContain("pushHistory");
  });

  it("fails loudly when a slice marker disappears instead of silently passing", () => {
    // 📌 守检测器自己：切片函数必须在区间失效时抛错，
    //    否则重构改名后所有区间断言会静默变成「扫空串」。
    expect(() => sliceBetween("function ThisDoesNotExist(", "whatever")).toThrow();
  });
});
