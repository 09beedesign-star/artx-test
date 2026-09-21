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

describe("需求 6（2026-09-21）：底部按钮区与全局提示词输入框左右自适应对齐", () => {
  /*
   * 用户原话：「悬浮提示词面板下方的按钮布局按照这个样式来调整。
   *            icon按照全局提示词输入框左右两边自适应对齐。」
   *
   * ⚠️ 切片必须收窄到**底部按钮区本身**。
   *    整个 AssetEditPromptBar 里 `justify-between` / `flex-1` 出现多处
   *    （参考图条、字数提示等），在整段上 toContain 会恒真 —— 2026-09-21
   *    的 B2 变异就是这么漏网的。
   */
  const bottomBar = (() => {
    const start = source.indexOf("{/* Bottom action bar：布局与右下角");
    if (start === -1) return "";
    const end = source.indexOf("// ── Zoom Control Bar", start);
    return end === -1 ? "" : source.slice(start, end);
  })();

  it("切片非空且足够窄（锚点有效，断言不会恒真）", () => {
    expect(
      bottomBar.length,
      "底部按钮区切片为空 —— 后面每条断言都会恒假，等于没有锁"
    ).toBeGreaterThan(800);
    expect(
      bottomBar.length,
      "切片过宽，可能把组件其它区域也圈进来，断言会恒真"
    ).toBeLessThan(3200);
  });

  it("外层必须是 justify-between 单行容器，不能是 flex-wrap", () => {
    expect(
      bottomBar,
      "外层不是 justify-between —— 左右两端不会自适应对齐"
    ).toContain('className="flex min-w-0 items-center justify-between px-3 pb-3"');
    expect(
      bottomBar,
      "退回了 flex-wrap —— 窄框时发送按钮会被挤到第二行"
    ).not.toContain("flex flex-wrap items-center gap-2 px-3 pb-3");
  });

  it("左侧 icon 组必须 flex-1 自适应吃掉剩余宽度", () => {
    expect(
      bottomBar,
      "左侧 icon 没有包进 flex-1 容器 —— 无法自适应贴左"
    ).toContain('className="flex min-w-0 flex-1 items-center"');
  });

  it("右侧发送按钮必须 shrink-0 贴右", () => {
    expect(
      bottomBar,
      "右侧没有 shrink-0 容器 —— 空间不足时发送按钮会被压扁"
    ).toContain('className="flex shrink-0 items-center"');
  });

  it("不能再用 `<div className=\"flex-1\" />` 空占位符撑开", () => {
    expect(
      bottomBar,
      "还留着空 div 占位符 —— 那是旧布局，与全局输入框不同构"
    ).not.toContain('<div className="flex-1" />');
  });

  it('「回车发送」文案必须移除（全局输入框右侧只有发送按钮）', () => {
    expect(
      bottomBar,
      "底部仍有「回车发送」文案 —— 与全局输入框右侧结构不一致"
    ).not.toContain("回车发送");
  });

  it("发送按钮配色必须与全局输入框同源（#C5ED47 + 同款阴影）", () => {
    expect(bottomBar, "发送按钮不是全局同款绿色").toContain('"#C5ED47"');
    expect(bottomBar, "缺少全局同款投影").toContain(
      '"0 12px 30px rgba(197,237,71,0.24)"'
    );
    // 反向：旧的紫色方块不能留着
    expect(
      bottomBar,
      "还在用旧的紫色发送按钮 —— 没对齐全局样式"
    ).not.toContain("oklch(0.58 0.22 290)");
  });

  it("发送按钮的禁用条件必须与 handleSend 的放行条件同源", () => {
    expect(
      source,
      "canSendPrompt 没有被定义成唯一事实源"
    ).toContain(
      "const canSendPrompt = prompt.trim().length > 0 || uploadedRefs.length > 0;"
    );
    expect(bottomBar, "按钮没绑禁用态").toContain("disabled={!canSendPrompt}");
    // handleSend 必须复用同一个变量，而不是另写一遍条件
    const sendFn = (() => {
      const at = source.indexOf("const handleSend = () => {");
      return at === -1 ? "" : source.slice(at, at + 160);
    })();
    expect(sendFn.length, "handleSend 锚点失效").toBeGreaterThan(50);
    expect(
      sendFn,
      "handleSend 另写了一遍放行条件 —— 会出现「按钮亮着点了没反应」"
    ).toContain("if (canSendPrompt) {");
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

/**
 * ─────────────────────────────────────────────────────────────
 * 2026-09-20 缺陷修复的回归锁
 *
 * 用户报告：「悬浮提示面板中，局部重绘提示词生成的图片完全没有基于原图的
 * 内容结合」，并要求「默认调用 vod-jimeng4.0 接口」。
 *
 * 根因有二，都是**零报错**的静默失效：
 *   ① 面板默认模型是 "auto"，服务端把它展开成优先级表，首位恒为
 *      vod-og25-sunburst-medium，即梦排第 6 永远轮不到 →「选了 auto
 *      实际用别的模型」；
 *   ② 服务端 editViaReferenceGeneration 对普通 edit 没关 VOD 的
 *      EnhancePrompt，增强器把「保持原图主体/构图」的约束整段重写掉，
 *      模型退化成照着提示词重画一张 →「完全没基于原图」。
 * ─────────────────────────────────────────────────────────────
 */
describe("缺陷修复：局部重绘必须基于原图，且默认走即梦 4.0", () => {
  const bar = sliceBetween(
    "function AssetEditPromptBar(",
    "const handleSkillChange ="
  );

  it("切片非空", () => {
    expect(bar.length, "AssetEditPromptBar 头部片段为空，锚点失效").toBeGreaterThan(300);
  });

  it("默认模型必须是即梦 4.0 常量，绝不能是 auto", () => {
    expect(
      bar,
      '默认模型退回了 "auto" —— 服务端会展开成优先级表，首位是 image2.5，'
        + "即梦永远轮不到，且全程零报错"
    ).toContain("useState(NODE_COMPOSER_EDIT_AI_MODEL_ID)");
    expect(
      bar,
      '不允许 useState("auto")：auto 把选型权交给了按性价比排序的优先级表，'
        + "而局部重绘要的是保真度"
    ).not.toContain('const [model, setModel] = useState("auto")');
  });

  it("默认模型常量必须真的解析到 vod-jimeng（不能只是改了个名字）", async () => {
    const shared = readFileSync(
      join(__dirname, "..", "..", "..", "..", "shared", "image-models.ts"),
      "utf8"
    );
    expect(
      shared,
      "NODE_COMPOSER_EDIT_MODEL_ID 不存在或不指向 vod-jimeng"
    ).toMatch(/export const NODE_COMPOSER_EDIT_MODEL_ID = "vod-jimeng";/);
    // vod-jimeng 必须是注册表里的合法 id，否则前端选择器选不中、
    // 服务端 isVodModelId 也会走错分支。
    expect(shared, "vod-jimeng 不在优先级表里，属于无效 id").toContain(
      '"vod-jimeng",'
    );
  });

  it("常量必须从 workspace-data 正确导出并被 InfiniteCanvas 导入", () => {
    const workspaceData = readFileSync(
      join(__dirname, "..", "..", "lib", "workspace-data.ts"),
      "utf8"
    );
    expect(workspaceData).toContain(
      "export const NODE_COMPOSER_EDIT_AI_MODEL_ID = NODE_COMPOSER_EDIT_MODEL_ID;"
    );
    expect(source, "InfiniteCanvas 没导入该常量，编译期就会炸").toContain(
      "NODE_COMPOSER_EDIT_AI_MODEL_ID,"
    );
  });

  it("提交链路必须把选中图片的最新像素作为编辑源传下去", () => {
    const quickEdit = sliceBetween(
      "const handleAssetEditSubmit = useCallback(",
      "const handleNodeComposerSubmit = useCallback("
    );
    // 原图来源：优先取节点当前可见像素，回落到 target.src。
    expect(
      quickEdit,
      "没有取节点最新可见图像 —— 会拿一张过期的图去做局部重绘"
    ).toContain("(await getVisibleAssetImageSource(target.nodeId)) || target.src");
    // 前台与后台两条链路都必须把它当作 imageSrc 传下去，少一条就是
    // 「只改一个出口等于没做」。
    expect(
      quickEdit,
      "前台单次编辑没传 imageSrc，服务端会当成纯文生图"
    ).toContain("imageSrc: latestImageSrc,");
    expect(
      (quickEdit.match(/imageSrc: latestImageSrc,/g) || []).length,
      "imageSrc 只在一条链路上传了 —— 前台 runSingleEdit 与后台 backgroundTaskInput 必须都传"
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("缺陷修复：服务端必须把原图当作编辑画布，而不是风格参考", () => {
  const serverSource = readFileSync(
    join(__dirname, "..", "..", "..", "..", "server", "image-generation.ts"),
    "utf8"
  );
  const block = serverSource.match(
    /const editViaReferenceGeneration = async \(\) => \{[\s\S]*?\n {2}\};/
  )?.[0];

  const emitted = (block || "")
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*")
      );
    })
    .join("\n");

  it("切片非空（锚点失效会让下面全部恒绿）", () => {
    expect(block, "editViaReferenceGeneration 切片失败").toBeTruthy();
    expect(emitted.length).toBeGreaterThan(500);
  });

  it("原图必须作为第一张参考图下发", () => {
    expect(
      emitted,
      "原图没作为参考图 1 传下去 —— VOD 侧拿不到要编辑的那张图"
    ).toContain('{ src: sourceDataUrl, title: "target image" }');
  });

  it("必须显式告诉模型「参考图 1 是目标画布」", () => {
    expect(
      emitted,
      "缺少 target canvas 指令，模型会把原图当成普通风格参考"
    ).toContain("Use reference image 1 as the target canvas");
  });

  it("VOD 服务端提示词增强必须恒关", () => {
    expect(
      emitted,
      "增强开启会把「保持原图主体/构图」的约束整段重写掉，"
        + "模型退化成照着提示词重画一张，且零报错"
    ).toContain("enhancePrompt: false");
    expect(
      emitted,
      "不允许退回按 operation 分类 —— 上次正是这样漏判了普通 edit"
    ).not.toMatch(/enhancePrompt:\s*isCameraViewOperation/);
  });
});
