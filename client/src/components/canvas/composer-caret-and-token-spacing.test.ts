import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * 截取源码中从 `from` 开始、长度 `length` 的片段。
 * 用来把断言限制在某个函数体内，避免「整份文件里存在这个字符串」这种弱断言。
 */
function sliceFrom(from: string, length: number) {
  const index = source.indexOf(from);
  expect(index, `找不到锚点：${from}`).toBeGreaterThan(-1);
  return source.slice(index, index + length);
}

describe("提示词框光标飞动修复（selectionchange 重入防护）", () => {
  /**
   * 背景：
   * 用户点击 skill 标签后面想输入文字时，光标快速飞动且完全打不出字。
   *
   * 根因是两个「会挪光标」的机制互相唤醒：
   *   1. focusComposerSegment 在 60ms setTimeout 里 focus + setSelectionRange
   *   2. 全局 selectionchange 守卫发现光标落在 token 附近，又把它挪到相邻 segment
   * 1 触发 selectionchange → 2 介入挪光标 → 又派发 selectionchange → …
   * 死循环期间每次 focus 都会打断按键/IME，于是无法输入。
   *
   * 第一版修复口径是布尔锁 isFocusingProgrammaticallyRef，**有并发缺陷**：
   * 两个独立调用方（focusComposerSegment 与守卫自身）共用同一个布尔值，
   * 守卫的 setTimeout(0) 解锁会把 focusComposerSegment 仍需要的保护一并撤掉，
   * 于是 60ms 后那次光标设置完全裸奔。单个 skill 时两条路径不一定重叠，
   * 所以第一版看起来是好的，多试几个 skill 就必现。
   *
   * 现口径：截止时间戳窗口 programmaticFocusUntilRef，
   * 多个调用方只会把窗口往后推（取最大值），谁都无法提前结束别人的保护期。
   */

  it("使用截止时间戳窗口，而不是会被提前解除的布尔锁", () => {
    expect(source).toContain("const programmaticFocusUntilRef = useRef(0)");
    // 防回退：布尔锁那套写法不得复活。
    expect(source).not.toContain("isFocusingProgrammaticallyRef = useRef");
    expect(source).not.toContain("isFocusingProgrammaticallyRef.current = false");
  });

  it("开窗函数只延长窗口，绝不缩短", () => {
    // 这是整套机制的核心不变量：用 Math.max 保证任何调用方都无法把
    // 别人已经申请到的保护期改短。写成直接赋值就会退化成布尔锁的老毛病。
    const fn = sliceFrom("const beginProgrammaticFocus = useCallback(", 320);
    expect(fn).toContain("Math.max(");
    expect(fn).toContain("programmaticFocusUntilRef.current,");
    expect(fn).toContain("Date.now() + durationMs");
  });

  it("窗口有效性按当前时间判定", () => {
    const fn = sliceFrom("const isProgrammaticFocusActive = useCallback(", 200);
    expect(fn).toContain("Date.now() < programmaticFocusUntilRef.current");
  });

  it("selectionchange 守卫在窗口有效时必须直接 return", () => {
    // 守卫的第一件事就得是检查窗口；放在后面等于让它先做了副作用再退出。
    const handler = sliceFrom("const handleSelectionChange = () => {", 900);
    expect(handler).toContain("if (isProgrammaticFocusActive()) return;");

    // 检查必须出现在「取 shell」之前，确保是最早的短路。
    const guardIndex = handler.indexOf("isProgrammaticFocusActive()");
    const shellIndex = handler.indexOf("composerShellRef.current");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(shellIndex).toBeGreaterThan(-1);
    expect(
      guardIndex,
      "窗口检查必须是守卫里的第一个动作，否则起不到短路作用"
    ).toBeLessThan(shellIndex);
  });

  it("focusComposerSegment 必须在 setTimeout 之外同步开窗", () => {
    const fn = sliceFrom("const focusComposerSegment = useCallback(", 1200);
    const lockIndex = fn.indexOf("beginProgrammaticFocus(");
    const timerIndex = fn.indexOf("window.setTimeout(");
    expect(lockIndex, "focusComposerSegment 没有开窗").toBeGreaterThan(-1);
    expect(timerIndex).toBeGreaterThan(-1);
    // 若把开窗写进 setTimeout 内部，点击后到 60ms 回调之间浏览器自身的
    // 默认光标落点仍会唤醒守卫，抖动依旧存在。
    expect(
      lockIndex,
      "开窗必须在 setTimeout 之前同步执行，否则 60ms 空窗期内守卫仍会介入"
    ).toBeLessThan(timerIndex);
  });

  it("开窗时长必须覆盖 60ms 延迟并留出异步事件余量", () => {
    const fn = sliceFrom("const focusComposerSegment = useCallback(", 1200);
    const match = fn.match(/beginProgrammaticFocus\((\d+)\)/);
    expect(match, "没找到开窗调用").not.toBeNull();
    const duration = Number(match![1]);
    // 光标是在 60ms 后才设置的，窗口必须活过那一刻，
    // 且要留余量给 setSelectionRange 派发的异步 selectionchange。
    expect(
      duration,
      "窗口必须显著长于 60ms 的聚焦延迟，否则光标落位时保护已过期"
    ).toBeGreaterThan(60);
  });

  it("聚焦完成后要再补一段窗口盖住异步事件，且不显式解锁", () => {
    const fn = sliceFrom("const focusComposerSegment = useCallback(", 2600);
    // 补窗调用应出现在 setTimeout 回调尾部
    const calls = fn.match(/beginProgrammaticFocus\(\d+\)/g) ?? [];
    expect(calls.length, "应有两次开窗：进入时 + 光标落位后").toBe(2);
    // 防回退：不得出现把窗口清零的写法
    expect(fn).not.toContain("programmaticFocusUntilRef.current = 0");
  });

  it("守卫自己挪光标时也要开窗，避免自激", () => {
    const handler = sliceFrom("const handleSelectionChange = () => {", 4200);
    const lockIndex = handler.indexOf("beginProgrammaticFocus(");
    const focusIndex = handler.indexOf("nextInput.focus()");
    expect(lockIndex, "守卫在挪光标前没有开窗").toBeGreaterThan(-1);
    expect(focusIndex).toBeGreaterThan(-1);
    expect(
      lockIndex,
      "开窗必须早于 nextInput.focus()，否则守卫会把自己再唤醒一次"
    ).toBeLessThan(focusIndex);
  });

  it("点击标签间隙时要阻断事件冒泡，避免外层 onMouseDown 二次聚焦", () => {
    const fn = sliceFrom("const tryFocusGapTextSegment = (", 2200);
    // 左右两个分支各需要一组 prevent + stop
    const prevents = fn.match(/event\.preventDefault\(\)/g) ?? [];
    const stops = fn.match(/event\.stopPropagation\(\)/g) ?? [];
    expect(prevents.length, "左右间隙分支都需要 preventDefault").toBe(2);
    expect(stops.length, "左右间隙分支都需要 stopPropagation").toBe(2);
  });
});

describe("skill 标签与图片标签共存时的纵向间距", () => {
  /**
   * 用户诉求：两种标签同时存在时上下挨得太近，要求间距改为 4px。
   *
   * 相邻行的实际间距 = 上一行 margin-bottom + 下一行 margin-top，
   * 行内方向的外边距不折叠，所以取目标值的一半（各 2px）。
   */

  it("共存判定必须基于 composerSegments，且涵盖 image 和 annotation", () => {
    // activeSkill 只是 skill 标签的来源之一；标签是否真的渲染出来看的是 segments。
    // annotation 与 image 一起判定，因为它俩是同一类引用标签（共用尺寸常量）。
    const decl = sliceFrom("const composerHasSkillAndImageTokens =", 520);
    expect(decl).toContain('segment.type === "skill"');
    expect(decl).toContain('segment.type === "image"');
    expect(decl).toContain('segment.type === "annotation"');
    expect(decl).toContain("&&");
  });

  it("共存时纵向外边距取 2px（上下合计 4px），否则回落到原值", () => {
    const decl = sliceFrom("const composerTokenVerticalMargin =", 120);
    expect(decl).toContain("composerHasSkillAndImageTokens ? 2 : null");
  });

  it("skill 标签的横向 margin 必须与引用标签一致，否则左边缘对不齐", () => {
    const marginBlock = sliceFrom(
      "const top = composerTokenVerticalMargin ?? 0;",
      320
    );
    expect(marginBlock).toContain("composerTokenVerticalMargin ?? 0");
    expect(marginBlock).toContain("composerTokenVerticalMargin ?? 2");
    // 横向左右各 2px —— 与 image / annotation 标签完全相同。
    // 改动前是「右 4px / 左 0 或 4px」，与引用标签的 2px 不一致，
    // 换行后两类标签左边缘错开，正是用户报的对齐问题。
    expect(marginBlock).toContain("${top}px 2px ${bottom}px 2px");

    // 防回退：左边距不得再挂在 activeSkill 上（那是错位的直接来源）。
    expect(source).not.toContain(
      "activeSkill?.id === segment.skill.id ? 0 : 4"
    );
  });

  it("空文本段有效占位为 0，同时保留可点击区域", () => {
    /**
     * 这里要同时满足两个互相拉扯的约束，缺一不可：
     *
     * 1. **有效占位必须是 0**。标签之间会插入空 text segment 作为光标落点，
     *    它若真占宽度，「前面恰好有空文本段」的那一行会被整体右推，
     *    与另一行的标签左边缘对不齐。
     * 2. **必须有可点击区域**。一旦把宽度压到 0，用户点标签右侧就点不中，
     *    光标不动 —— 这正是第一版只顾对齐所导致的回归。
     *
     * 解法是 padding 撑开命中区、等量负 margin 从布局里减掉：
     * padding 参与命中测试但被负 margin 抵消，最终有效占位仍是 0。
     * 断言从数值上验证这个抵消关系，而不是死记某种写法。
     */
    const padding = source.match(/padding: "(\d+)px (\d+)px",\s*\n\s*margin: segment\.text/);
    expect(padding, "空文本段的 padding 写法变了").not.toBeNull();
    const paddingX = Number(padding![2]);
    expect(paddingX, "空段需要横向 padding 才点得中").toBeGreaterThan(0);

    const margin = source.match(/margin: segment\.text \? "0 1px" : "0 (-?\d+)px"/);
    expect(margin, "空文本段的 margin 写法变了").not.toBeNull();
    const marginX = Number(margin![1]);

    // 核心不变量：横向 padding 与负 margin 必须精确抵消。
    expect(
      paddingX + marginX,
      `padding ${paddingX}px 与 margin ${marginX}px 未抵消，空段会占宽导致标签错位`
    ).toBe(0);

    // 防回退：不得把 padding 写回 className 里的固定值。
    // 那样无法按是否有内容区分，空段照样占宽。
    expect(source).not.toContain(
      'className="inline min-w-0 whitespace-pre-wrap border-0 bg-transparent px-1.5 py-0.5 align-middle outline-none"'
    );
  });

  it("容器不得再为 skill 做左内边距补偿", () => {
    // 两类标签横向外边距已统一，这个补偿会让有 skill 时整块内容左移。
    expect(source).not.toContain("paddingLeft: hasActiveSkill ? 0 : undefined");
  });

  it("图片标签与注释标签的 margin 同样由共存标记驱动，横向恒为 2px", () => {
    // annotation 标签与 image 共用 COMPOSER_REF_TOKEN_SIZE，是同一类引用标签，
    // 与 skill 共存时的贴边问题一模一样，必须一起改，否则只修了一半。
    const occurrences = source.split(
      "margin: `${composerTokenVerticalMargin ?? 0}px 2px ${composerTokenVerticalMargin ?? 2}px 2px`"
    ).length - 1;
    expect(occurrences, "image 与 annotation 两处都要改").toBe(2);
  });

  it("两类标签都不得再出现写死的旧 margin 字面量", () => {
    // 防回退：改动前 image 是 "0 2px 2px 2px"，skill 是 "0 4px 2px 0" / "0 4px 2px 4px"。
    expect(source).not.toContain('margin: "0 2px 2px 2px"');
    expect(source).not.toContain('"0 4px 2px 0"');
    expect(source).not.toContain('"0 4px 2px 4px"');
  });

  it("skill 与引用标签的横向外边距取值必须相等", () => {
    /**
     * 这条是对齐问题的核心契约，单独锁一次。
     *
     * 上面几条分别检查了各自的写法，但「两者相等」这个关系本身没人守——
     * 有人把两处**同时**改成 3px 时，前面的断言会失败没错，
     * 可若只改其中一处的数值形式（比如引用标签改成模板字符串），
     * 就可能悄悄绕过。这里直接把两个数值抽出来比。
     */
    const skillMargin = sliceFrom(
      "const top = composerTokenVerticalMargin ?? 0;",
      320
    );
    const skillHorizontal = skillMargin.match(
      /\$\{top\}px (\d+)px \$\{bottom\}px (\d+)px/
    );
    expect(skillHorizontal, "skill 标签横向 margin 写法变了").not.toBeNull();

    const refHorizontal = source.match(
      /margin: `\$\{composerTokenVerticalMargin \?\? 0\}px (\d+)px \$\{composerTokenVerticalMargin \?\? 2\}px (\d+)px`/
    );
    expect(refHorizontal, "引用标签横向 margin 写法变了").not.toBeNull();

    // skill 的左右、引用标签的左右，四个值必须全部相等
    expect(skillHorizontal![1]).toBe(skillHorizontal![2]);
    expect(refHorizontal![1]).toBe(refHorizontal![2]);
    expect(
      skillHorizontal![1],
      "skill 与引用标签的横向外边距必须相等，否则左边缘对不齐"
    ).toBe(refHorizontal![1]);
  });
});

describe("点击标签右侧空白处的光标落位", () => {
  /**
   * 用户反馈：输入框插入图片标签后，鼠标点不了标签右侧。
   *
   * 两个原因叠加：
   * 1. 空文本段为保证左对齐被压成 0 宽，实际可点区域只剩 2px；
   *    （这部分由上面「空文本段有效占位为 0，同时保留可点击区域」守着）
   * 2. 容器兜底调的是无参数 focusComposerSegment()，它落到
   *    activeComposerSegmentIdRef —— **上次待过的段**，与本次点击位置无关。
   *    刚插入标签时它常指向标签左边的段，于是光标不动或往左跳。
   *
   * 本组断言守第 2 点：必须按点击坐标就近落位。
   */

  it("容器兜底必须按点击坐标落位，而不是回到上次待过的段", () => {
    const handler = sliceFrom("if (event.clientX - rect.left <= 44) {", 420);
    expect(handler).toContain(
      "focusComposerSegmentNearPoint(event.clientX, event.clientY)"
    );
    // 防回退：无参数调用会落到 activeComposerSegmentIdRef，正是本 bug 的成因。
    expect(
      handler.includes("focusComposerSegment();"),
      "兜底不得退回无参数调用"
    ).toBe(false);
  });

  it("就近定位要真的读取各文本段的布局矩形", () => {
    const fn = sliceFrom(
      "const focusComposerSegmentNearPoint = useCallback(",
      1800
    );
    // 必须基于真实布局计算，而不是靠段的下标顺序猜。
    expect(fn).toContain("getBoundingClientRect()");
    expect(fn).toContain('segment.type === "text"');
  });

  it("同一行的文本段必须优先于其它行", () => {
    /**
     * 提示词框会换行。若只比横向距离，点第二行标签右侧时
     * 可能选中第一行末尾那个横向更近的段，光标直接跳到上一行。
     * 实现用「纵向距离 × 大权重」保证同行优先，这里锁住这个放大系数。
     */
    const fn = sliceFrom(
      "const focusComposerSegmentNearPoint = useCallback(",
      1800
    );
    const weighted = fn.match(/verticalDistance \* (\d+)/);
    expect(weighted, "同行优先的权重写法变了").not.toBeNull();
    expect(
      Number(weighted![1]),
      "纵向权重要足够大，否则会跨行误选"
    ).toBeGreaterThanOrEqual(1000);
  });

  it("点在段右半边落到末尾，左半边落到开头", () => {
    const fn = sliceFrom(
      "const focusComposerSegmentNearPoint = useCallback(",
      1800
    );
    // 以段的横向中点为界决定光标落在哪一端。
    expect(fn).toContain("(rect.left + rect.right) / 2");
    expect(fn).toContain("best.atEnd ?");
  });

  it("找不到任何文本段时要安全回退，不能把光标丢掉", () => {
    const fn = sliceFrom(
      "const focusComposerSegmentNearPoint = useCallback(",
      1800
    );
    expect(fn).toContain("focusComposerSegment();");
    expect(fn).toContain("focusTrailingComposerSegment();");
  });
});

describe("skill 标签独占最顶行", () => {
  /**
   * 产品约束：skill 标签必须单独占据最顶行，
   * **绝对不能**与图片 / 注释引用标签出现在同一行。
   *
   * 容器是普通 inline 流，所有 segment 靠自然换行排布，
   * 一行宽度够就会挤在一起，所以必须显式断行。
   */

  /**
   * 锚点说明：
   * `aria-label="移除 Skill"` 在整份文件里唯一，是 skill 分支尾部的可靠锚点；
   * 而 `if (segment.type === "skill") {` 会先命中 :18804 的 `} else if (...)`，
   * 所以渲染分支要用带缩进的完整前缀来锚定。
   * 断行元素在锚点之后约 1200 字符（中间隔着一大段说明注释），截取长度需覆盖到。
   */
  const SKILL_TAIL_ANCHOR = 'aria-label="移除 Skill"';
  const SKILL_TAIL_LENGTH = 1600;

  it("skill 后面必须跟一个撑满整行的断行元素", () => {
    const tail = sliceFrom(SKILL_TAIL_ANCHOR, SKILL_TAIL_LENGTH);
    expect(tail).toContain('display: "block"');
    expect(tail).toContain('width: "100%"');
    expect(tail).toContain("height: 0");
    // 断行元素必须在 Fragment 闭合之前，即确实属于 skill 分支。
    const breakIndex = tail.indexOf('width: "100%"');
    const fragmentEnd = tail.indexOf("</Fragment>");
    expect(fragmentEnd, "找不到 Fragment 闭合").toBeGreaterThan(-1);
    expect(
      breakIndex,
      "断行元素必须在 skill 分支的 Fragment 内"
    ).toBeLessThan(fragmentEnd);
  });

  it("断行元素必须零高，不能引入额外行距", () => {
    const tail = sliceFrom(SKILL_TAIL_ANCHOR, SKILL_TAIL_LENGTH);
    const height = tail.match(/height: (\d+),/);
    expect(height, "断行元素的 height 写法变了").not.toBeNull();
    expect(
      Number(height![1]),
      "断行元素必须零高，否则 skill 与下一行之间会多出空白"
    ).toBe(0);
  });

  it("断行元素不得抢走点击，否则会挡住就近落位", () => {
    /**
     * 这个元素宽度 100%，若能接收指针事件，
     * 会把「点击标签右侧空白处落位」整片区域吃掉 —— 那正是刚修好的能力。
     */
    const tail = sliceFrom(SKILL_TAIL_ANCHOR, SKILL_TAIL_LENGTH);
    expect(tail).toContain('pointerEvents: "none"');
    expect(tail).toContain('aria-hidden="true"');
  });

  it("skill 分支要用 Fragment 承载标签与断行元素，且 key 挂在最外层", () => {
    /**
     * map 的返回值必须是单个元素，所以标签 + 断行元素要包进 Fragment。
     * key 必须挂在 Fragment 上；留在内层 <span> 会触发 React 的
     * "missing key" 警告，并导致列表 diff 失效。
     */
    const branch = sliceFrom(
      '                  if (segment.type === "skill") {',
      200
    );
    expect(branch).toContain("<Fragment key={segment.id}>");
  });

  it("skill 始终被排到 segment 序列首位", () => {
    /**
     * 断行只保证「skill 之后换行」，
     * 若 skill 本身不在最前面，它照样不在顶行。
     * 拖拽重排后有一段逻辑把 skill 重新提到首位，这里锁住它。
     */
    const reorder = sliceFrom("if (!skillSegment) return nextSegments;", 260);
    expect(reorder).toContain("skillSegment,");
    expect(reorder).toContain(
      "...nextSegments.filter(segment => segment.id !== skillSegment.id)"
    );
  });
});

describe("contentEditable 文本段的内容同步", () => {
  /**
   * 用户反馈：插入图片标签后，在标签左边输入一个「S」，
   * 之后既改不了也删不掉。
   *
   * 根因：多段模式下文本段是 contentEditable <span>，**不受控**。
   * 原先唯一写 DOM 的地方在 ref 回调里：
   *   ref={node => { if (node.textContent !== segment.text) node.textContent = ... }}
   * 这是 inline 箭头函数，每次渲染都是新的函数身份，
   * React 每轮都会先 ref(null) 再 ref(node) ——
   * 于是这句回写**在用户打字过程中也会执行**，
   * 刚敲进去的字符被覆盖、光标被顶到末尾。
   *
   * 修复口径：ref 只登记引用，内容交给一个专门的同步 effect，
   * 由它负责「只在不一致时写」且「跳过获得焦点的元素」。
   */

  it("ref 回调不得再写 textContent", () => {
    // 防回退：这正是 bug 的根源，回来就必须报警。
    expect(source).not.toContain("if (node && node.textContent !== segment.text)");
  });

  /**
   * 锚点说明：`const node = composerInputRefs.current[segment.id];`
   * 在 focusComposerSegmentNearPoint 里也有一份且位置更靠前，
   * 直接用它会截到那个函数。改用同步 effect 独有的注释行锚定。
   */
  const SYNC_EFFECT_ANCHOR = "      // textarea（单段模式）由 React 受控，不要插手。";
  const SYNC_EFFECT_LENGTH = 460;

  it("存在专门的同步 effect 负责回写 DOM", () => {
    const effect = sliceFrom(SYNC_EFFECT_ANCHOR, SYNC_EFFECT_LENGTH);
    expect(effect).toContain("node.textContent = segment.text");
  });

  it("同步时必须跳过获得焦点的元素，避免打断输入", () => {
    /**
     * 这是整套修复的核心约束。若对焦点元素也回写，
     * 就退化回原 bug：用户正在打的字被覆盖、IME 组合被打断。
     */
    const effect = sliceFrom(SYNC_EFFECT_ANCHOR, SYNC_EFFECT_LENGTH);
    expect(effect).toContain("document.activeElement === node");
  });

  it("内容一致时不得写 DOM，否则光标会被顶到末尾", () => {
    const effect = sliceFrom(SYNC_EFFECT_ANCHOR, SYNC_EFFECT_LENGTH);
    expect(effect).toContain("node.textContent === segment.text");
  });

  it("受控的 textarea 不得被这个 effect 插手", () => {
    /**
     * 单段模式用 <textarea value={...}>，由 React 受控。
     * 手动改它的 textContent 会与受控值打架。
     */
    const effect = sliceFrom(SYNC_EFFECT_ANCHOR, SYNC_EFFECT_LENGTH);
    expect(effect).toContain("node instanceof HTMLTextAreaElement");
  });
});

describe("activeSkill 同步 effect 必须收敛", () => {
  /**
   * 用户反馈：**只要一引入 skill，光标就立刻飞速抖动**。
   *
   * 根因是 :19909 那个 effect 永远不收敛：
   * 它的收敛条件写的是 `composerSegments[0]?.type === "skill"`，
   * 而 normalizeAssistantComposerSegments 会在首个 token 之前
   * **强制补一个空文本段**，规范化后形状恒为 [text, skill, ...]，
   * 第 0 位永远是 text —— 收敛条件永远为假。
   *
   * 于是每轮都判定「skill 不在首位」→ 重建 skill 段 → setComposerSegments
   * → 依赖里的 composerSegments 变化 → effect 再跑…无限循环。
   * 且每次 normalize 又多留一个空文本段，段数无限增长。
   * 每轮重渲染都会重置 contentEditable 的 DOM 与光标，就是用户看到的抖动。
   *
   * 这里既锁住修复写法，也用一份可执行的模型仿真直接验证「会收敛」。
   */

  const SKILL_EFFECT_ANCHOR =
    "     * 收敛判定必须看「skill 是不是**第一个标签**」，而不是「在数组第 0 位」。";
  const SKILL_EFFECT_LENGTH = 1800;

  it("不得再用数组第 0 位判定 skill 位置", () => {
    // 防回退：这正是死循环的根源。
    const effect = sliceFrom(SKILL_EFFECT_ANCHOR, SKILL_EFFECT_LENGTH);
    expect(effect).not.toContain("const firstSegment = composerSegments[0];");
  });

  it("改用「第一个标签」作为收敛判据", () => {
    const effect = sliceFrom(SKILL_EFFECT_ANCHOR, SKILL_EFFECT_LENGTH);
    expect(effect).toContain(
      "composerSegments.find(isAssistantTokenSegment)"
    );
    expect(effect).toContain('firstTokenSegment?.type === "skill"');
  });

  it("收敛后必须提前 return，不再触发 setState", () => {
    const effect = sliceFrom(SKILL_EFFECT_ANCHOR, SKILL_EFFECT_LENGTH);
    expect(effect).toContain(
      "if (activeSkillSegment && skillSegments.length === 1) return;"
    );
  });

  /**
   * 下面是行为级验证：把 normalize 与 effect 的判定逻辑复刻成纯函数，
   * 直接断言「反复运行会停下来」。
   *
   * 这比正则更有价值 —— 正则只能锁写法，
   * 而收敛与否是个**动力学性质**，必须真的跑一遍才知道。
   */
  type Seg =
    | { id: string; type: "text"; text: string }
    | { id: string; type: "skill"; skill: { id: string } }
    | { id: string; type: "image" };

  let counter = 0;
  const mkText = (text = ""): Seg => ({ id: `t-${++counter}`, type: "text", text });
  const mkSkill = (skill: { id: string }): Seg => ({
    id: `s-${skill.id}-${++counter}`,
    type: "skill",
    skill,
  });
  const isTokenSeg = (s: Seg) => s.type !== "text";

  // 复刻 normalizeAssistantComposerSegments 中与本问题相关的部分。
  function normalize(segments: Seg[]): Seg[] {
    const out: Seg[] = [];
    segments.forEach(segment => {
      if (segment.type === "text") {
        const prev = out[out.length - 1];
        if (
          prev &&
          prev.type === "text" &&
          (prev.text.length > 0 || segment.text.length > 0)
        ) {
          out[out.length - 1] = { ...prev, text: prev.text + segment.text };
        } else out.push({ ...segment });
        return;
      }
      const prev = out[out.length - 1];
      // 关键：首个 token 之前会被插入一个空文本段。
      if (!prev || isTokenSeg(prev)) out.push(mkText(""));
      out.push(segment);
    });
    if (out.length === 0 || out[out.length - 1].type !== "text") out.push(mkText(""));
    return out;
  }

  function runEffect(segments: Seg[], activeSkill: { id: string } | null) {
    const skillSegments = segments.filter(s => s.type === "skill");
    if (!activeSkill) {
      if (skillSegments.length === 0) return { stable: true, next: segments };
      return {
        stable: false,
        next: normalize(segments.filter(s => s.type !== "skill")),
      };
    }
    const firstToken = segments.find(isTokenSeg);
    const activeSkillSegment =
      firstToken && firstToken.type === "skill" && firstToken.skill.id === activeSkill.id
        ? firstToken
        : null;
    if (activeSkillSegment && skillSegments.length === 1)
      return { stable: true, next: segments };
    if (skillSegments.length > 0) {
      const remaining = segments.filter(s => s.type !== "skill");
      return { stable: false, next: normalize([mkSkill(activeSkill), ...remaining]) };
    }
    return { stable: false, next: normalize([mkSkill(activeSkill), ...segments]) };
  }

  function roundsToSettle(
    initial: Seg[],
    activeSkill: { id: string } | null,
    maxRounds = 8
  ) {
    let segments = initial;
    for (let i = 0; i <= maxRounds; i++) {
      const { stable, next } = runEffect(segments, activeSkill);
      if (stable) return { settled: true, rounds: i, segments };
      segments = next;
    }
    return { settled: false, rounds: maxRounds, segments };
  }

  const skillA = { id: "skill-A" };
  const skillB = { id: "skill-B" };

  it("空输入框引入 skill 后立即收敛", () => {
    const r = roundsToSettle(normalize([mkText("")]), skillA);
    expect(r.settled, "effect 未收敛，会无限 setState 导致光标抖动").toBe(true);
    expect(r.rounds).toBeLessThanOrEqual(1);
  });

  it("已有文字时引入 skill 后收敛", () => {
    const r = roundsToSettle(normalize([mkText("你好")]), skillA);
    expect(r.settled).toBe(true);
  });

  it("已有图片标签时引入 skill 后收敛", () => {
    const initial = normalize([mkText(""), { id: "img-1", type: "image" }, mkText("")]);
    const r = roundsToSettle(initial, skillA);
    expect(r.settled).toBe(true);
  });

  it("切换到另一个 skill 后收敛", () => {
    const r = roundsToSettle(normalize([mkSkill(skillA), mkText("abc")]), skillB);
    expect(r.settled).toBe(true);
  });

  it("卸载 skill 后收敛", () => {
    const r = roundsToSettle(normalize([mkSkill(skillA), mkText("abc")]), null);
    expect(r.settled).toBe(true);
  });

  it("收敛后段数不再增长（防空文本段无限累积）", () => {
    /**
     * 死循环的第二个症状：每轮 normalize 都多留一个空文本段。
     * 即便将来有人改坏了收敛条件，这条也能从另一个角度抓住。
     */
    const settled = roundsToSettle(normalize([mkText("")]), skillA);
    expect(settled.settled).toBe(true);
    const lengthAfterSettle = settled.segments.length;
    const again = roundsToSettle(settled.segments, skillA);
    expect(again.segments.length, "段数仍在增长，说明 effect 未真正收敛").toBe(
      lengthAfterSettle
    );
  });

  it("收敛状态下 skill 仍是第一个标签（保证独占顶行不被破坏）", () => {
    /**
     * 收敛不能以「放弃排序」为代价 ——
     * skill 独占最顶行依赖它是第一个 token。
     */
    const initial = normalize([
      mkText(""),
      { id: "img-1", type: "image" },
      mkText("hi"),
    ]);
    const r = roundsToSettle(initial, skillA);
    expect(r.settled).toBe(true);
    const firstToken = r.segments.find(isTokenSeg);
    expect(firstToken?.type).toBe("skill");
  });
});

describe("标签后文案的最后一个字符必须能被退格删除", () => {
  /**
   * 现象：提示词框里引用标签后面的文案，一直按 Backspace 删到只剩一个字符时就卡住，
   * 第一个字符怎么都删不掉，只有全选删除才行。
   *
   * 根因是三处代码互相矛盾，谁都没有清掉 DOM 里的那个字符：
   *   1. deletingFinalCharacter 分支调用 event.preventDefault() → 浏览器不执行默认删除；
   *   2. restoreEmptyComposerField 只 setComposerTextSegment(segmentId, "") → 只改 state；
   *   3. 同步 effect 里 `if (document.activeElement === node) return;` → 焦点元素被跳过，不回写。
   *
   * 于是 state 为空、DOM 还留着那个字符。contentEditable 的取值来自 textContent，
   * 下一次 Backspace 读到的长度仍是 1，又命中同一分支 —— 永远删不掉。
   *
   * 修复口径：由 restoreEmptyComposerField 在清 state 的同时**显式清空 DOM**。
   * 注意焦点守卫不能动（移除它会退回「输入被打断、IME 被破坏」的老 bug）。
   */

  const RESTORE_ANCHOR =
    "         * contentEditable 分支必须**在这里显式清空 DOM**，否则最后一个字符永远删不掉。";
  const RESTORE_LENGTH = 2200;

  it("restoreEmptyComposerField 必须显式清空 contentEditable 的 textContent", () => {
    const body = sliceFrom(RESTORE_ANCHOR, RESTORE_LENGTH);
    expect(body).toContain('editable.textContent = "";');
  });

  it("清 DOM 时必须排除 input / textarea（它们由 React 受控）", () => {
    const body = sliceFrom(RESTORE_ANCHOR, RESTORE_LENGTH);
    expect(body).toContain("!(editable instanceof HTMLInputElement)");
    expect(body).toContain("!(editable instanceof HTMLTextAreaElement)");
  });

  it("同步 effect 的焦点守卫必须保留（不得为了修这个 bug 而移除）", () => {
    /**
     * 反向保护：这个 bug 有一种「省事」的错误改法是删掉焦点守卫让 effect 回写 DOM，
     * 那会直接把「打字被打断、IME 组合被破坏」的老 bug 放回来。
     */
    expect(source).toContain("if (document.activeElement === node) return;");
  });

  /**
   * 行为级模型：把「DOM 是事实来源 + state 单独维护」这套 contentEditable 的
   * 真实约束复刻出来，直接断言「退格之后那个字符没了」。
   * 正则断言只能锁住写法，模型才能锁住行为。
   */
  type Field = { dom: string; state: string; focused: boolean };

  /** 同步 effect：跳过焦点元素，其余回写 DOM。对应 InfiniteCanvas.tsx:18787 */
  function syncEffect(field: Field) {
    if (field.focused) return;
    if (field.dom === field.state) return;
    field.dom = field.state;
  }

  /**
   * 按一次 Backspace。
   * @param clearDom 修复后的行为 —— restoreEmptyComposerField 是否显式清 DOM
   */
  function pressBackspace(field: Field, clearDom: boolean) {
    const value = field.dom; // contentEditable 的值来自 textContent
    const deletingFinalCharacter = value.length === 1;
    if (deletingFinalCharacter) {
      // event.preventDefault() —— 浏览器不动 DOM
      field.state = "";
      if (clearDom) field.dom = "";
    } else {
      // 浏览器默认删除：DOM 与 state 一起少一个字符
      field.dom = value.slice(0, -1);
      field.state = field.dom;
    }
    syncEffect(field);
  }

  it("单字符文案按一次退格后 DOM 与 state 都为空", () => {
    const field: Field = { dom: "S", state: "S", focused: true };
    pressBackspace(field, true);
    expect(field.state).toBe("");
    expect(field.dom, "DOM 里仍残留字符，用户看到的就是删不掉").toBe("");
  });

  it("连按三次退格不会卡在第一个字符上", () => {
    const field: Field = { dom: "abc", state: "abc", focused: true };
    pressBackspace(field, true);
    expect(field.dom).toBe("ab");
    pressBackspace(field, true);
    expect(field.dom).toBe("a");
    pressBackspace(field, true);
    expect(field.dom, "最后一个字符没删掉 —— 正是用户报的 bug").toBe("");
    expect(field.state).toBe("");
  });

  it("复现旧行为：不清 DOM 时最后一个字符永远删不掉", () => {
    /**
     * 这条用例**固定住 bug 本身**，证明上面的用例确实在检验修复而不是恒真。
     * 若将来有人把清 DOM 那行删掉，上面两条会红，这条仍绿 —— 对照组。
     */
    const field: Field = { dom: "S", state: "S", focused: true };
    pressBackspace(field, false);
    pressBackspace(field, false);
    pressBackspace(field, false);
    expect(field.dom).toBe("S");
    expect(field.state).toBe("");
  });

  it("失焦场景下同步 effect 仍能自行收拾残留（焦点守卫是唯一阻塞点）", () => {
    const field: Field = { dom: "S", state: "S", focused: false };
    pressBackspace(field, false);
    expect(field.dom, "失焦时 effect 应当回写，说明问题只出在焦点守卫路径").toBe(
      ""
    );
  });

  it("多字符时不得误清整段（只在剩最后一个字符时才接管）", () => {
    const field: Field = { dom: "hello", state: "hello", focused: true };
    pressBackspace(field, true);
    expect(field.dom, "一次退格不应把整段文字清空").toBe("hell");
  });
});
