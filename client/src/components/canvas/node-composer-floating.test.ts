import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 「图片节点下方悬浮提示词输入框」2026-09-20 新增功能的回归锁。
 *
 * 需求原文（用户）：
 *   1. 点击图片节点 → 悬浮输入框出现在图片节点**正下方 8px**、与节点**左右居中**
 *   2. **直接复用**右下角输入框的所有能力，**包括引用功能**
 *   3. 点画布空白处取消选中 → 该悬浮框随即消失
 *   4. 点生成 → 该图的生成内容**沉淀在右侧对话框**内
 *   5. 悬浮框比右下角提示词输入框**宽 80px**，两侧 icon 响应式重排
 *
 * ⚠️ 全部是源码文本断言，必须配合变异自证使用 —— 光跑绿说明不了任何问题。
 *    每条断言都在本目录的变异记录里逐条验过能挡下对应的破坏。
 */

const SOURCE_PATH = join(__dirname, "InfiniteCanvas.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

/** 锚点唯一性保障：切片前先确认锚只出现一次，否则 indexOf 切到的可能不是我想要的那段 */
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

describe("悬浮输入框：锚点前置保障", () => {
  it.each([
    "const nodeComposerGap =",
    "const attachedNodeComposerAnchor = selectedImageBounds",
    "const nodeComposerWidth = assistantComposerInnerWidth + 80;",
    "const handleNodeComposerSubmit = useCallback(",
    "function AssetEditPromptBar(",
    "const target = targetOverride || editAsset;",
    "anchor={attachedNodeComposerAnchor}",
  ])("锚点 %s 在源码中必须唯一出现", marker => {
    expect(
      countOf(marker),
      `锚点不唯一或已消失，后续切片断言会切错位置（恒绿风险）`
    ).toBe(1);
  });
});

describe("需求 1 / 5：定位在节点正下方 8px、左右居中、宽度 +80", () => {
  /*
   * ⚠️ 切片起点故意**不含数字 8** —— 如果拿 `const nodeComposerGap = 8;` 当锚，
   *    有人把间距改成 24 时会变成「锚点失效整套抛错」，而不是「间距断言失败」，
   *    失败信息会把人引去查锚点而不是查间距。
   */
  const anchorBlock = sliceBetween(
    "const nodeComposerGap =",
    "const displayNodesBase"
  );

  it("切片非空（范围没划错）", () => {
    expect(anchorBlock.length, "anchor 计算片段为空，锚点失效").toBeGreaterThan(
      300
    );
  });

  it("top 必须由「图片下边缘 + gap」算出，不能用上边缘", () => {
    expect(anchorBlock, "top 必须基于图片下边缘 bottom").toContain(
      "selectedImageBounds.bottom * viewport.zoom + viewport.y"
    );
    expect(anchorBlock, "必须是下边缘 + gap（在图片下方）").toContain(
      "const desiredTop = screenBottom + nodeComposerGap"
    );
    // 反向：不能退化成命令条那种「上边缘 - gap」
    expect(
      anchorBlock,
      "用成了上边缘减间距 —— 那是上方命令条的算法，框会跑到图片上面"
    ).not.toContain("screenTop - nodeComposerGap");
  });

  it("间距常量必须是 8（需求写死的数字）", () => {
    expect(source, "间距不是 8px").toContain("const nodeComposerGap = 8;");
  });

  it("left 必须用 centerX，否则不可能与节点左右居中", () => {
    expect(anchorBlock, "left 必须用 centerX 才能左右居中").toContain(
      "left: selectedImageBounds.centerX * viewport.zoom + viewport.x"
    );
    // 反向：用左边缘 x 会贴到图片左侧
    expect(
      anchorBlock,
      "left 用了图片左边缘 x —— 会贴左而不是居中"
    ).not.toContain("left: selectedImageBounds.x * viewport.zoom");
  });

  it("宽度基准必须是「右下角输入框宽 + 80」，不是图片宽度", () => {
    expect(source, "宽度没按右下角输入框 + 80 算").toContain(
      "const nodeComposerWidth = assistantComposerInnerWidth + 80;"
    );
    expect(
      source,
      "右下角输入框内宽应为「助手面板宽 - 左右各 12px 内边距」"
    ).toContain("(isAssistantCollapsed ? 372 : assistantPanelWidth) - 24");
    // 反向：不能退回按图片宽度算（用户 2026-09-20 明确改过口径）
    expect(
      anchorBlock,
      "宽度按图片宽度算了 —— 用户已明确改成按右下角输入框算"
    ).not.toContain("selectedImageBounds.width * viewport.zoom + 80");
  });

  it("必须做底部夹取，否则图片靠近画布底边时整条跑出可视区", () => {
    expect(anchorBlock, "缺少 top 夹取").toContain("Math.min(desiredTop");
    expect(anchorBlock, "缺少视口内边距兜底").toContain(
      "nodeComposerViewportPadding"
    );
  });
});

describe("需求 1 / 3：显示与消失条件", () => {
  const mount = sliceBetween(
    "attachedNodeComposerAnchor &&",
    "onClose={() => setSelectedNodeIds([])}"
  );

  it("切片非空", () => {
    expect(mount.length, "挂载片段为空，锚点失效").toBeGreaterThan(200);
  });

  it("必须绑定 anchor，否则组件仍固定在画布底部", () => {
    expect(mount, "没把 anchor 传进去 —— 框不会跟随节点").toContain(
      "anchor={attachedNodeComposerAnchor}"
    );
  });

  it("只对单选的 asset 图片节点显示（画板框 / 多选都不给）", () => {
    /*
     * ⚠️ `{selectedVisualNodeIds.length === 1 &&` 在本文件里出现两次
     *    （另一处是上方命令条），必须从**唯一锚** anchor={...} 往回切，
     *    否则会切到命令条那段，断言全部变成在守别人的代码。
     */
    const mountEnd = source.indexOf("anchor={attachedNodeComposerAnchor}");
    expect(mountEnd, "唯一锚 anchor={...} 不见了").toBeGreaterThan(-1);
    const condStart = source.lastIndexOf(
      "{selectedVisualNodeIds.length === 1 &&",
      mountEnd
    );
    const condition = source.slice(condStart, mountEnd);
    expect(condition, "缺少单选闸门").toContain(
      "selectedVisualNodeIds.length === 1"
    );
    expect(condition, "多选时不应出现").toContain("!multiVisualSelectionActive");
    expect(condition, "必须只对 asset 图片节点显示").toContain(
      'selectedImageNode?.type === "asset"'
    );
    expect(
      condition,
      "缺少 !editAsset 闸门 —— 双击快捷编辑时会和悬浮框同时出现两个输入框"
    ).toContain("!editAsset");
  });

  it("换选另一张图必须强制重建，防止上一张的草稿串台", () => {
    expect(
      mount,
      "key 没绑 nodeId —— React 会复用实例，上一张图的文字和参考图会留着"
    ).toContain("key={`node-composer-${selectedImageNode.id}`}");
  });

  it("取消选中即消失：显示条件本身挂在选中态上（无独立开关 state）", () => {
    // 若引入了独立的 showNodeComposer 之类 state，取消选中时就可能关不掉
    expect(
      source,
      "出现了独立的显示开关 state —— 取消选中时可能关不掉（需求 3 会失效）"
    ).not.toContain("setNodeComposerVisible");
  });
});

describe("需求 2：复用右下角输入框的能力（含引用功能）", () => {
  /*
   * ⚠️ `const [prompt, setPrompt]` 在整文件出现 6 次，不能当终止锚。
   *    从唯一的 function 声明起切到它自己的 props 解构结束（`}: {` 之后的类型块结尾）。
   */
  const promptBarProps = (() => {
    const start = source.indexOf("function AssetEditPromptBar(");
    expect(start, "组件声明锚点失效").toBeGreaterThan(-1);
    const rest = source.slice(start);
    const end = rest.indexOf("const [prompt, setPrompt]");
    expect(end, "组件体内找不到 prompt state，切片范围异常").toBeGreaterThan(-1);
    return rest.slice(0, end);
  })();

  it("切片非空", () => {
    expect(promptBarProps.length, "组件签名片段为空").toBeGreaterThan(300);
  });

  it("anchor 是可选 prop，不传时保持原有底部居中行为（老调用点零影响）", () => {
    expect(promptBarProps, "anchor 必须是可选的").toContain(
      "anchor?: { left: number; top: number; width: number }"
    );
  });

  it("提交载荷必须带 references —— 引用功能是用户点名要的", () => {
    expect(promptBarProps, "提交载荷丢了 references，引用功能等于没接").toContain(
      "references: Array<{ id: string; title: string; src: string }>"
    );
  });

  it("吸附模式下发完不能关闭（要能对同一张图连续改）", () => {
    expect(
      source,
      "吸附模式发完就关了 —— 无法连续改同一张图"
    ).toContain("if (!anchor) onClose();");
  });

  it("吸附模式不能自动抢焦点（否则 Delete / 方向键对节点失效且零报错）", () => {
    // 组件内唯一那处自动聚焦必须被 !anchor 包住
    const focusAt = source.indexOf(
      "setTimeout(() => textareaRef.current?.focus(), 80)"
    );
    expect(focusAt, "自动聚焦那行不见了，锚点失效").toBeGreaterThan(-1);
    const guard = source.slice(focusAt - 200, focusAt);
    expect(
      guard,
      "自动聚焦没有被 !anchor 包住 —— 吸附模式会抢焦点，吞掉画布快捷键"
    ).toContain("if (!anchor) {");
  });
});

describe("需求 4：生成内容沉淀到右侧对话框", () => {
  const submit = sliceBetween(
    "const handleNodeComposerSubmit = useCallback(",
    "[getLatestAssetImageSource, handleAssetEditSubmit, nodesRef]"
  );

  it("切片非空", () => {
    expect(submit.length, "提交入口片段为空，锚点失效").toBeGreaterThan(300);
  });

  it("必须往右侧对话面板派发消息", () => {
    expect(
      submit,
      "没有派发 canvas-assistant-external-message —— 右侧对话框不会有任何记录"
    ).toContain('new CustomEvent("canvas-assistant-external-message"');
    expect(submit, "消息角色应为 user（是用户发起的请求）").toContain(
      'role: "user"'
    );
  });

  it("右侧面板必须仍挂着这个事件的监听（对面被删掉 = 消息石沉大海）", () => {
    expect(
      source,
      "面板侧的 canvas-assistant-external-message 监听不见了"
    ).toContain('window.addEventListener("canvas-assistant-external-message"');
  });

  it("必须复用 handleAssetEditSubmit 这条唯一的图生图链路，不能另写一套", () => {
    expect(
      submit,
      "没有调用 handleAssetEditSubmit —— 会绕开画幅回落 / 并发合并 / 失败回写四套既有规则"
    ).toContain("await handleAssetEditSubmit(payload, {");
    expect(submit, "必须把目标节点作为 override 传下去").toContain("nodeId,");
  });

  it("handleAssetEditSubmit 必须参数化目标，且不传时行为不变", () => {
    expect(source, "缺少 targetOverride 参数").toContain(
      "targetOverride?: { nodeId: string; title: string; src: string }"
    );
    expect(
      source,
      "不传 override 时必须回落到 editAsset（老的双击编辑路径不能被改坏）"
    ).toContain("const target = targetOverride || editAsset;");
  });
});
