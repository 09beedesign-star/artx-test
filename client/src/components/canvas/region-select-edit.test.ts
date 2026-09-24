import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 局部框选重绘（2026-09-23）的回归锁。
 *
 * 需求原文（用户）：
 *   「图片节点悬浮菜单栏的红框位置加一个 icon。点击之后鼠标变成选区状态，
 *     可以在该图片当中框选对应的内容。框选完内容之后，悬浮提示词输入框会出现
 *     该框选内容的局部引用标签。局部引用标签位于正文输入区域，不会覆盖紫色的
 *     全图引用标签。该局部引用标签可以和提示词输入框内的正文部分共同构成语义
 *     提示，从而对局部引用标签的内容进行局部修改。但是必须保持局部引用标签内容
 *     的边缘在修改后要和整图的边缘完全融合在一起，不要出现明显的分割、割裂。」
 *
 * ⚠️ 全部是源码文本断言 —— 光跑绿说明不了任何问题，每条都必须配变异自证。
 *    本文件对应的变异记录见同目录 region-select-edit.mutation.md。
 */

const CANVAS_PATH = join(__dirname, "InfiniteCanvas.tsx");
const MASK_PATH = join(__dirname, "region-select-mask.ts");
const source = readFileSync(CANVAS_PATH, "utf8");
const maskSource = readFileSync(MASK_PATH, "utf8");

/** 剥掉块注释 —— 注释里提一嘴不算"实现了"，否则断言会被文档骗绿 */
function stripComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "");
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`起始锚点失效，找不到：${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`终止锚点失效，找不到：${endMarker}`);
  return source.slice(start, end);
}

describe("局部框选：锚点前置保障", () => {
  it.each([
    "{/* Header: asset chip + close */}",
    "data-region-select-toggle",
    "data-region-ref-token",
    "const handleRegionSelectPointerUp = useCallback(",
    "const setRegionSelectMode = useCallback(",
  ])("锚点 %s 必须在源码中唯一出现", marker => {
    expect(
      countOf(source, marker),
      "锚点不唯一或已消失，后续切片断言会切错位置（恒绿风险）"
    ).toBe(1);
  });
});

describe("需求 ①：入口 icon 落在紫色「已引用」标签右侧的悬浮菜单栏里", () => {
  const header = sliceBetween(
    "{/* Header: asset chip + close */}",
    "{/* Prompt textarea */}"
  );

  it("入口按钮必须在 header 切片内（不是别的地方）", () => {
    expect(
      header,
      "框选入口不在悬浮面板 header 里 —— 用户点名的位置是紫色标签右边"
    ).toContain("data-region-select-toggle");
  });

  it("入口必须排在紫色「已引用」标签之后、关闭按钮之前", () => {
    const chipAt = header.indexOf("已引用");
    const toggleAt = header.indexOf("data-region-select-toggle");
    const closeAt = header.indexOf("title=\"关闭 (Esc)\"");
    expect(chipAt, "紫色引用标签锚点失效").toBeGreaterThan(-1);
    expect(closeAt, "关闭按钮锚点失效").toBeGreaterThan(-1);
    expect(toggleAt, "框选入口必须排在「已引用」标签右侧").toBeGreaterThan(
      chipAt
    );
    expect(toggleAt, "框选入口必须排在关闭按钮左侧").toBeLessThan(closeAt);
  });

  it("图标用截图里那枚「虚线选框 + 闪光」，且带 AI 角标", () => {
    const code = stripComments(header);
    expect(code, "图标必须是 SquareDashedMousePointer（虚线选框 + 鼠标指针）")
      .toContain("<SquareDashedMousePointer");
    expect(
      code,
      "必须套 AiDecoratedIcon —— 截图里图标右上角有 AI 闪光角标，与命令条同一套视觉语言"
    ).toContain("<AiDecoratedIcon");
  });

  it("图标必须真的被 import 进来（不然是运行时 ReferenceError）", () => {
    expect(source).toMatch(/^\s*SquareDashedMousePointer,$/m);
  });

  it("入口必须有可访问名，否则浏览器点测无从定位", () => {
    expect(stripComments(header)).toContain('aria-label="框选局部区域"');
  });

  it("入口图标尺寸必须与引用标签同源，不能写死字面量", () => {
    /*
     * 变异自证补的断言（M25 曾存活）：把 size={COMPOSER_REF_TOKEN_SIZE.iconSize}
     * 改成 size={18} 本文件原先一条都不红 —— 因为尺寸计数断言写在
     * node-composer-floating.test.ts 里，本文件视角看不到。
     * 📌 判据：「别的文件管着呢」不能当作本文件不管的理由 ——
     *    功能的回归锁要能独立成立，否则那个文件一重构这条就无声失守。
     */
    const toggleCode = stripComments(
      header.slice(header.indexOf("data-region-select-toggle"))
    );
    expect(
      countOf(toggleCode, "COMPOSER_REF_TOKEN_SIZE.iconSize"),
      "入口图标尺寸要与引用标签缩略图同源（外层 AiDecoratedIcon + 内层图标各一次）"
    ).toBe(2);
  });
});

describe("需求 ②：点击后鼠标变成选区状态，可在图片内拖拽框选", () => {
  const overlay = sliceBetween(
    "{isRegionSelecting && !isAiProcessingImage && (",
    "{isErasing && !isAiProcessingImage && ("
  );

  it("叠层必须带 crosshair 光标（这就是「鼠标变成选区状态」）", () => {
    expect(stripComments(overlay)).toContain('cursor: "crosshair"');
  });

  it("叠层必须带 nodrag nopan，否则按下去是拖节点/平移画布而不是框选", () => {
    expect(
      overlay,
      "React Flow 里漏掉 nodrag nopan，pointerdown 会被当成拖节点 —— 零报错，只是框不出来"
    ).toContain("nodrag nopan");
  });

  it("三个指针事件必须齐全，且 cancel 也要走收尾", () => {
    const code = stripComments(overlay);
    expect(code).toContain("onPointerDown={handleRegionSelectPointerDown}");
    expect(code).toContain("onPointerMove={handleRegionSelectPointerMove}");
    expect(code).toContain("onPointerUp={handleRegionSelectPointerUp}");
    expect(
      code,
      "指针被系统取消时不收尾，start ref 会残留，下次进来直接画出一个错位的框"
    ).toContain("onPointerCancel={handleRegionSelectPointerUp}");
  });

  it("拖拽过程中必须有实时预览框（用户得看得见自己框了多大）", () => {
    expect(stripComments(overlay)).toContain("{regionSelectPreview && (");
  });
});

describe("选区必须是 0~1 比例，不能是像素", () => {
  const handlers = sliceBetween(
    "const getRegionSelectRatioPoint = useCallback(",
    "const getRenderedImagePayload = useCallback("
  );

  it("屏幕坐标必须除以容器尺寸换算成比例并夹取到 [0,1]", () => {
    const code = stripComments(handlers);
    /*
     * ⚠️⚠️⚠️ 这是整条链路里最容易零报错跑偏的一处。
     *    节点在画布上是被缩放显示的，getBoundingClientRect 拿到的是**屏幕尺寸**。
     *    直接把像素传下去 = 把当前缩放级别烤进了数据：用户缩放到 50% 时框一块，
     *    生成出来的蒙版落在完全错误的位置上，而且不报错。
     */
    expect(code).toContain("(event.clientX - rect.left) / rect.width");
    expect(code).toContain("(event.clientY - rect.top) / rect.height");
    expect(code, "必须夹取到 0~1，否则拖出图外会产生负数/超 1 的选区").toContain(
      "Math.min(1, Math.max(0,"
    );
  });

  it("容器尺寸为 0 时必须直接放弃（否则除零得到 NaN 选区）", () => {
    expect(stripComments(handlers)).toContain(
      "if (rect.width === 0 || rect.height === 0) return null;"
    );
  });

  it("退化矩形（单击产生的 w=h=0）必须被拦下，不能发给上游", () => {
    const code = stripComments(handlers);
    /*
     * 不拦的话：生成一张零编辑区的全黑蒙版 → 上游照常跑完、照常扣积分 →
     * 返回一张和原图一模一样的图。用户看到的只是"点了没反应"，全程零报错。
     */
    expect(code).toContain("region.w < REGION_SELECT_MIN_RATIO");
    expect(code).toContain("region.h < REGION_SELECT_MIN_RATIO");
    expect(code, "拦下时必须告诉用户为什么，不能静默吞掉").toContain(
      "框选区域太小"
    );
  });

  it("有效选区才通过事件交给面板", () => {
    expect(stripComments(handlers)).toContain(
      "new CustomEvent(REGION_SELECT_COMMIT_EVENT"
    );
  });
});

describe("需求 ③：局部引用标签在正文区，且不覆盖紫色全图标签", () => {
  const promptArea = sliceBetween(
    "{/* Prompt textarea */}",
    "{uploadedRefs.length > 0 && ("
  );

  /*
   * ⚠️ 这里必须用**带边界的正则**，不能用 toContain。
   *    变异自证抓到的真漏网：把属性改名成 data-region-ref-tokenX，
   *    toContain("data-region-ref-token") 依然命中（子串匹配），断言恒绿。
   *    📌 判据：凡是断言「某个标识符存在」，子串匹配都可能被更长的名字骗过。
   */
  const REGION_TOKEN_ATTR = /data-region-ref-token(?![\w-])/;

  it("局部引用标签必须落在 textarea 所在的正文容器里", () => {
    expect(
      promptArea,
      "用户点名「局部引用标签位于正文输入区域」—— 不能挂到 header 那一行去"
    ).toMatch(REGION_TOKEN_ATTR);
    // 反向锁：header 里不许出现它，否则就会压住紫色全图标签那一行
    const header = sliceBetween(
      "{/* Header: asset chip + close */}",
      "{/* Prompt textarea */}"
    );
    expect(
      header,
      "局部引用标签跑到 header 了 —— 用户明确要求它不能覆盖紫色的全图引用标签"
    ).not.toMatch(REGION_TOKEN_ATTR);
  });

  it("局部标签必须排在 textarea 之后（在输入框下方，不压住输入区）", () => {
    const textareaAt = promptArea.indexOf("<textarea");
    const tokenAt = promptArea.search(REGION_TOKEN_ATTR);
    expect(textareaAt, "textarea 锚点失效").toBeGreaterThan(-1);
    expect(tokenAt, "局部引用标签不在正文区").toBeGreaterThan(-1);
    expect(tokenAt).toBeGreaterThan(textareaAt);
  });

  it("紫色全图标签必须仍然存在 —— 两者并存，不是替换关系", () => {
    const header = sliceBetween(
      "{/* Header: asset chip + close */}",
      "{/* Prompt textarea */}"
    );
    expect(
      header,
      "紫色「已引用」标签被局部标签顶掉了 —— 用户明确要求两者并存"
    ).toContain("已引用");
    expect(
      header,
      "紫色标签的配色（色相 290）被改掉了，就分不出全图引用和局部引用"
    ).toContain("oklch(0.58 0.22 290");
  });

  it("局部标签配色必须与紫色标签明显不同（青色系，色相 200）", () => {
    const tokenCode = stripComments(
      promptArea.slice(promptArea.search(REGION_TOKEN_ATTR))
    );
    expect(
      tokenCode,
      "两种引用用同一个色相 = 用户一眼分不清哪个是整图哪个是局部"
    ).toContain("200");
    expect(
      tokenCode,
      "局部标签不该用紫色色相 290，那是全图引用的身份色"
    ).not.toContain("0.22 290");
  });

  it("局部标签尺寸必须与引用标签同源（COMPOSER_REF_TOKEN_SIZE），不能写字面量", () => {
    const tokenCode = stripComments(
      promptArea.slice(promptArea.search(REGION_TOKEN_ATTR))
    );
    expect(tokenCode).toContain("height: COMPOSER_REF_TOKEN_SIZE.height");
    expect(tokenCode).toContain("padding: COMPOSER_REF_TOKEN_SIZE.padding");
  });

  it("局部标签必须可单独移除（框错了要能撤，不用关整个面板）", () => {
    const tokenCode = stripComments(
      promptArea.slice(promptArea.search(REGION_TOKEN_ATTR))
    );
    expect(tokenCode).toContain('aria-label="移除局部引用"');
    expect(tokenCode).toContain("setRegionRef(null)");
  });
});

describe("需求 ④：标签 + 正文共同构成语义提示，走局部编辑链路", () => {
  const submit = sliceBetween(
    "const regionRect = payload.region || null;",
    "const handleNodeComposerSubmit = useCallback("
  );

  it("选区必须从 payload 里透传到提交侧（不是面板自己偷偷用）", () => {
    expect(source).toContain("region: regionRef?.region ?? null");
  });

  it("蒙版必须用节点当前真实显示的图来渲染，不能用面板传来的旧 src", () => {
    /*
     * 用户可能已经重绘过几轮，asset.src 与节点当下显示的图尺寸/内容都可能不同。
     * 拿旧图算蒙版 = 选区落在错误位置上，零报错。
     */
    expect(stripComments(submit)).toContain(
      "createRegionSelectMask(latestImageSrc, regionRect)"
    );
  });

  it("蒙版生成失败必须中断，绝不能降级成整图重绘", () => {
    const code = stripComments(submit);
    const catchAt = code.indexOf("} catch (maskError) {");
    expect(catchAt, "蒙版生成的 catch 分支消失了").toBeGreaterThan(-1);
    const catchBlock = code.slice(catchAt, catchAt + 500);
    expect(
      catchBlock,
      "必须显式报错 —— 悄悄退回整图重绘会把整张图换掉，比报错严重得多且不报错"
    ).toContain("notifyAiFailure");
    expect(catchBlock, "报错后必须 return，不能继续往下跑整图链路").toContain(
      "return;"
    );
  });

  it("正文提示词必须与选区约束拼在一起（这就是「共同构成语义提示」）", () => {
    const code = stripComments(submit);
    expect(code).toContain("buildRegionEditPromptPrefix(regionRect)");
    expect(code, "正文部分必须原样带进去").toContain(
      "具体修改要求：${optimizedText}"
    );
  });

  it("⚠️ 约束必须加在 callLLM 增强之后（加在之前会被增强洗掉，且零报错）", () => {
    const code = stripComments(submit);
    const optimizeAt = code.indexOf("optimizedText");
    const prefixAt = code.indexOf("buildRegionEditPromptPrefix");
    expect(optimizeAt, "optimizedText 锚点失效").toBeGreaterThan(-1);
    expect(
      prefixAt,
      "约束前缀必须出现在 optimizedText 之后 —— 记忆里的 cb247da：提示词增强会把「保持/不要改变 X」这类否定约束洗掉"
    ).toBeGreaterThan(optimizeAt);
  });
});

describe("⚠️ maskSrc 必须打通全部出口（少一个 = 功能等于没做，零报错）", () => {
  const submit = sliceBetween(
    "const regionRect = payload.region || null;",
    "const handleNodeComposerSubmit = useCallback("
  );
  const code = stripComments(submit);

  /*
   * 记忆里的 A 类高频事故：同一份数据的多个出口只改了一个。
   * 本链路 maskSrc 有 3 个运行时出口 —— 占位 backgroundTaskInput、
   * 真实 editImageWithPrompt、真实 backgroundTaskInput。
   * 漏掉占位那个，AI 任务恢复守护器会拿占位当真任务、用同一 taskId 抢先起掉，
   * 真实载荷被整份丢弃 —— 表象是"框了但出来还是整图重绘"，全程零报错。
   */
  it("maskSrc 必须恰好出现在 3 个运行时出口", () => {
    expect(
      countOf(code, "maskSrc: regionMaskSrc"),
      "maskSrc 出口数不对 —— 占位 payload / editImageWithPrompt / 真实后台任务，三个都得有"
    ).toBe(3);
  });

  it("每个出口都必须同时带 preserveSource: true", () => {
    expect(
      countOf(code, "preserveSource: true"),
      "preserveSource 漏了就命中不了后端 isSourcePreservingEdit，蒙版贴回整条不生效"
    ).toBe(3);
  });

  it("有蒙版时 operation 必须切到后端的局部编辑分叉", () => {
    expect(
      countOf(code, 'operation: regionMaskSrc ? "annotation_edit" : "edit"'),
      "占位与真实后台任务的 operation 必须写成同一个表达式，字段不一致会被守护器错判"
    ).toBe(2);
    expect(
      code,
      "前台直调也要切 annotation_edit"
    ).toContain('operation: "annotation_edit"');
  });

  it("没有选区时必须保持原行为（整图编辑链路不能被带坏）", () => {
    expect(code, "无选区时 operation 要回落 edit").toContain('"edit"');
    expect(
      code,
      "无选区时不能硬塞 maskSrc —— 用扩散式展开，空字符串会让后端误判"
    ).toContain("...(regionMaskSrc");
  });
});

describe("⭐ 需求 ⑤：边缘必须与整图完全融合，不得割裂（两道并行防线）", () => {
  /*
   * 这是用户这次需求里唯一一条"做不到就不算做完"的硬约束。
   * 它由两道并行防线承载，**缺任何一道都不报错，只是每张图都带一圈框痕**：
   *   防线 A｜蒙版羽化：后端按 alpha 加权贴回，硬边 alpha 从 255 直跳 0
   *                    → 选框边界上留一条一像素宽的硬切缝。
   *   防线 B｜提示词硬约束：上游模型普遍不真正遵守蒙版（VOD 12 模型横评实测），
   *                    得先让它自己尽量别乱改，减少贴回时的内容冲突。
   */

  it("防线 A：羽化常量必须被真正消费，不能只是定义在那儿", () => {
    const fn = maskSource.slice(
      maskSource.indexOf("export function resolveRegionFeatherPx")
    );
    const code = stripComments(fn);
    expect(code).toContain("REGION_SELECT_FEATHER_RATIO");
    expect(code).toContain("REGION_SELECT_FEATHER_MIN_PX");
    expect(code).toContain("REGION_SELECT_FEATHER_MAX_PX");
  });

  it("防线 A：羽化半径必须大于 0，否则等同硬边", () => {
    const ratio = maskSource.match(
      /REGION_SELECT_FEATHER_RATIO = ([\d.]+)/
    )?.[1];
    const minPx = maskSource.match(
      /REGION_SELECT_FEATHER_MIN_PX = (\d+)/
    )?.[1];
    expect(Number(ratio), "羽化比例被改成 0 = 硬边 = 一定会露缝").toBeGreaterThan(
      0
    );
    expect(
      Number(minPx),
      "羽化下限被改成 0，小图上就会退化成硬边"
    ).toBeGreaterThan(0);
  });

  it("防线 A：挖洞时必须真的开 blur（羽化的唯一实现手段）", () => {
    const code = stripComments(maskSource);
    expect(code, "canvas filter blur 没了 = 羽化常量算出来也白算").toMatch(
      /ctx\.filter = `blur\(/
    );
    expect(
      code,
      "必须用 destination-out 挖洞 —— 黑色不透明=保留、透明=允许重绘"
    ).toContain('ctx.globalCompositeOperation = "destination-out"');
  });

  it("防线 A：挖洞矩形必须内缩，否则可编辑区会比用户框的大一圈", () => {
    const code = stripComments(maskSource);
    expect(
      code,
      "模糊会让影响范围向外扩散约一个半径，不内缩用户会觉得「AI 改到框外面去了」"
    ).toContain("const inset = feather / 2;");
    expect(code).toContain("rectX + inset");
    expect(code).toContain("rectY + inset");
  });

  it("防线 A：小选区必须用自身尺寸夹一道羽化上限", () => {
    const code = stripComments(maskSource);
    expect(
      code,
      "小选区套用大羽化 → 渐变带吃掉整个选区、中心 alpha 都到不了 0 → 表现是「框了但几乎没改」，零报错"
    ).toContain("regionShortEdge / 3");
  });

  it("防线 A：蒙版底色必须是黑色不透明（写反了会把框外全交给模型重画）", () => {
    const code = stripComments(maskSource);
    const fillAt = code.indexOf('ctx.fillStyle = "rgba(0,0,0,1)"');
    expect(
      fillAt,
      "蒙版语义与直觉相反：黑色不透明=保留原图，透明=允许重绘。写反不报错，只是整张图被重画"
    ).toBeGreaterThan(-1);
    expect(code).toContain("ctx.fillRect(0, 0, width, height)");
  });

  it("防线 B：提示词前缀必须逐条说清「不要割裂」", () => {
    const prefix = maskSource.slice(
      maskSource.indexOf("export function buildRegionEditPromptPrefix")
    );
    for (const phrase of [
      "边缘必须与周围原图自然衔接",
      "不允许出现可见的矩形边框",
      "拼接缝",
      "割裂感",
    ]) {
      expect(prefix, `边缘融合约束缺了「${phrase}」`).toContain(phrase);
    }
  });

  it("防线 B：前缀必须带上选区坐标，否则模型不知道改哪儿", () => {
    const prefix = stripComments(
      maskSource.slice(
        maskSource.indexOf("export function buildRegionEditPromptPrefix")
      )
    );
    expect(prefix).toContain("region.x * 100");
    expect(prefix).toContain("region.y * 100");
    expect(prefix, "框外内容必须明确要求逐像素不变").toContain(
      "必须逐像素保持不变"
    );
  });
});

describe("⚠️ 模式开关必须有唯一出口 + 强制复位（漏一次就永久吞点击）", () => {
  it("进出框选模式只能走 setRegionSelectMode 一个出口", () => {
    const panel = sliceBetween(
      "const setRegionSelectMode = useCallback(",
      "{/* Prompt textarea */}"
    );
    const code = stripComments(panel);
    expect(
      countOf(code, "setRegionSelecting("),
      "setRegionSelecting 被直接调用了 —— 只改 state 不广播事件，面板和节点必然脱节"
    ).toBe(1);
  });

  it("面板卸载时必须强制关掉框选模式", () => {
    const panel = sliceBetween(
      "const setRegionSelectMode = useCallback(",
      "/** 接收节点传来的框选结果"
    );
    const code = stripComments(panel);
    /*
     * 「开」在面板、「关」在节点 —— 只要节点可能收不到关闭信号就必然卡死。
     * 面板卸载时机有好几处（点空白取消选中 / Esc / 切图 / 关闭按钮），
     * 每处手动关一次必然会漏；漏掉的那次，节点上的全屏叠层永久吞掉所有点击，
     * 用户只能刷新页面，且零报错。所以复位必须收口在卸载副作用里。
     */
    expect(code, "卸载副作用里没有广播关闭事件").toContain("active: false");
    expect(code).toContain("return () => {");
  });

  it("画布侧收到关闭信号时必须全量复位所有 asset 节点", () => {
    const listener = sliceBetween(
      "window.addEventListener(REGION_SELECT_MODE_EVENT, handler);",
      "return () => window.removeEventListener(REGION_SELECT_MODE_EVENT, handler);"
    );
    expect(listener.length).toBeGreaterThan(0);
    const around = source.slice(
      source.indexOf("const nextActive"),
      source.indexOf("window.addEventListener(REGION_SELECT_MODE_EVENT, handler);")
    );
    expect(
      stripComments(around),
      "只复位当前节点的话，切过图之后旧节点的叠层会留在那儿吞点击"
    ).toContain("isRegionSelecting: nextActive");
  });

  it("框选态按 Esc 只退出框选，不关掉整个面板", () => {
    const esc = sliceBetween(
      "/** 框选模式下按 Esc 只退出框选，不关闭整个面板 */",
      "const text = isDark ?"
    );
    const code = stripComments(esc);
    expect(code).toContain("e.stopPropagation()");
    expect(
      code,
      "必须挂捕获阶段抢在面板那个冒泡的 onClose 之前，否则 Esc 直接把面板关了"
    ).toContain('window.addEventListener("keydown", handler, true)');
  });
});

/**
 * ── 需求 ⑤ 的第三道防线：后端必须真的做蒙版贴回 ──────────────────────
 *
 * 2026-09-23 线上实测暴露的缺陷：前端字段全对、请求体全对、蒙版也传到了，
 * 但后端 `editSmartAnnotationImage` 里 `isVodMaskModel` 那条分支
 * **直接 return、跳过了贴回合成**，理由是「VOD 已保证蒙版外保持原图」。
 *
 * 实测该前提是假的：选区外改动率 16.27%（白字区 51%、右下角 74%、maxDelta 239）。
 * 全站默认模型 DEFAULT_IMAGE_MODEL_ID = "vod-og25-sunburst-medium" 恒命中这条分支，
 * 即「边缘完全融合」这个硬需求在修复前 100% 落空，且零报错。
 *
 * 📌⭐⭐⭐ 判据：前端把字段发对了 ≠ 后端消费了它。凡是新增的跨端字段，
 *    必须一路断言到「真正改变行为的那一行」，中间任何一个 early-return 都能
 *    把它悄悄吃掉。
 */
describe("需求 ⑤（后端）：框选重绘必须强制蒙版贴回，不能被 VOD 早退跳过", () => {
  const IMAGE_GEN_PATH = join(__dirname, "../../../../server/image-generation.ts");
  const AI_CLIENT_PATH = join(__dirname, "../../lib/ai.ts");
  const ORCHESTRATOR_PATH = join(__dirname, "../../../../server/ai-orchestrator.ts");
  const backend = readFileSync(IMAGE_GEN_PATH, "utf8");
  const aiClient = readFileSync(AI_CLIENT_PATH, "utf8");
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, "utf8");

  it("VOD mask 模型的早退分支必须排除框选重绘", () => {
    const code = stripComments(backend);
    expect(
      code,
      "少了 regionSelectEdit 判断 = 所有 vod-* 模型都跳过贴回，选区外被整图重绘"
    ).toContain("if (isVodMaskModel && input.regionSelectEdit !== true)");
    expect(
      countOf(code, "if (isVodMaskModel) {"),
      "无条件早退必须已经不存在，否则框选链路仍会绕过贴回"
    ).toBe(0);
  });

  it("框选重绘贴回必须用前端那张羽化蒙版，而不是 OG 的膨胀蒙版", () => {
    const code = stripComments(backend);
    expect(
      code,
      "膨胀蒙版是给「凭空加物体」留余量的，用在框选上等于悄悄把用户框的区域放大"
    ).toContain("input.regionSelectEdit === true ? maskImageData.buffer : ogCompositeMaskBuffer");
  });

  it("regionSelectEdit 必须声明在后端入参类型里（否则 tsc 放行但字段被丢）", () => {
    expect(stripComments(backend)).toContain("regionSelectEdit?: boolean;");
  });

  it("客户端 editImageWithPrompt 的两个出口都要转发 regionSelectEdit", () => {
    const code = stripComments(aiClient);
    expect(
      countOf(code, "regionSelectEdit,"),
      "该函数是显式解构逐字段转发：解构 1 + 后台任务出口 1 + orchestrate 出口 1 = 3。" +
        "少一处就静默丢字段（tsc 不报错）"
    ).toBe(3);
    expect(code).toContain("regionSelectEdit?: boolean;");
  });

  it("orchestrator 必须把 regionSelectEdit 真的传给 editImageWithPrompt", () => {
    const code = stripComments(orchestrator);
    expect(code).toContain("regionSelectEdit?: boolean;");
    expect(
      code,
      "只在类型里声明而不在调用处传 = 经典「透传≠被消费」，字段走到一半消失"
    ).toContain("regionSelectEdit: input.regionSelectEdit,");
  });

  it("画布三个出口在有选区时都要带上 regionSelectEdit", () => {
    const code = stripComments(source);
    expect(
      countOf(code, "regionSelectEdit: true"),
      "占位 backgroundTaskInput / 前台 runSingleEdit / 真实 backgroundTaskInput 各一处；" +
        "漏掉占位那处会被任务恢复守护器用错载荷抢先起任务"
    ).toBe(3);
  });
});
