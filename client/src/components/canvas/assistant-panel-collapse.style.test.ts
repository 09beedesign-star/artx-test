import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// ⚠️ 必须走相对路径。用 `@/` alias 在本项目的 vitest 配置下会收集到 0 个用例，
// 测试文件"跑了"但一条都没执行 —— 表现和全绿一模一样。
import {
  assertStripKeptSource,
  stripSourceComments,
} from "../../../../shared/strip-source-comments";

const here = dirname(fileURLToPath(import.meta.url));
const rawSource = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * 画布右侧「对话框」收起 / 展开按钮的接线锁。
 *
 * 【2026-09-18 需求原文】
 *   1. 画板对话框右上角的收起展开 icon 换成「面板轮廓」图标，
 *      尺寸、交互形式、配色与旁边的 icon 保持一致。
 *   2. 右上角的「展开」文案和箭头 icon → 换成收起 icon 的左右镜像，去掉「展开」文案。
 *   3. 收起之后，那条长灰条去掉。
 *
 * ⚠️ 本文件全部是**源码断言**，所以先过剥离闸门：
 * 注释被当成代码、或代码被当成注释吃掉，下面每一条都会变成摆设。
 */
const source = stripSourceComments(rawSource);

/**
 * ⚠️ 这里必须量「剥离后还剩多少」。
 * InfiniteCanvas.tsx 是两万多行的大文件、注释占比不高，
 * 用默认阈值即可；一旦哪天剥离函数误吃代码，这条会先炸。
 */
assertStripKeptSource(rawSource, source, {
  label: "InfiniteCanvas.tsx",
});

/** 抠出 `actionButtons` 数组（收起/展开按钮的图标定义所在）。 */
function extractActionButtons() {
  const start = source.indexOf("const actionButtons = [");
  expect(start, "找不到 actionButtons 定义").toBeGreaterThan(-1);
  const end = source.indexOf("const handleUploadClick", start);
  expect(end, "actionButtons 后面的边界没找到").toBeGreaterThan(start);
  const block = source.slice(start, end);
  // ⚠️ 切不出来必须抛错，不能返回空串 —— 空串会让下面所有反向断言恒绿。
  expect(block.length, "actionButtons 区块切得太短，样本无效").toBeGreaterThan(200);
  return block;
}

/** 抠出右侧对话面板 <aside> 的 style 块（背景 / 毛玻璃 / 位移都在这里）。 */
function extractAsideStyle() {
  const anchor = "data-tour-id={TOUR_ANCHORS.canvasAssistantPanel}";
  const anchorIndex = source.indexOf(anchor);
  expect(anchorIndex, "找不到对话面板 aside 锚点").toBeGreaterThan(-1);
  const start = source.indexOf("style={{", anchorIndex);
  const end = source.indexOf("}}", source.indexOf("transform: collapsed", start));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  expect(block.length, "aside style 区块切得太短，样本无效").toBeGreaterThan(200);
  return block;
}

/**
 * 收起/展开按钮的**渲染处**。
 *
 * 锚点用 `actionButtons.slice(-1)`（全文唯一），它出现在 map 表达式里、
 * 位于目标 <button> 之前，所以这里是从锚点**向后**找按钮，
 * 不能套用 extractButton 的 lastIndexOf（那样会往回抓到上一颗按钮）。
 */
function extractToggleButton() {
  const anchor = "actionButtons.slice(-1)";
  const hits = source.split(anchor).length - 1;
  expect(hits, `锚点必须唯一命中，实际 ${hits} 次：${anchor}`).toBe(1);
  const anchorIndex = source.indexOf(anchor);
  const start = source.indexOf("<button", anchorIndex);
  const end = source.indexOf("</button>", start);
  expect(start).toBeGreaterThan(anchorIndex);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  expect(block.length, "收起/展开按钮区块切得太短，样本无效").toBeGreaterThan(100);
  return block;
}

const actionButtonsBlock = extractActionButtons();
const asideStyle = extractAsideStyle();
const toggleButton = extractToggleButton();

describe("需求 1：收起/展开 icon 换成面板轮廓图标", () => {
  it("两态分别用 PanelRight / PanelLeft，且都已从 lucide 导入", () => {
    // 正向锚点：先证明我确实抠到了 actionButtons 这块，
    // 否则下面的 not.toContain 会在「读空了」的情况下集体恒绿。
    expect(actionButtonsBlock).toContain("onClick: onToggleCollapsed");
    expect(actionButtonsBlock).toContain("灵感模板");

    // 展开态（面板开着，点它收起）→ 竖线在右
    expect(actionButtonsBlock).toContain("<PanelRight size={16} />");
    // 收起态（面板合上，点它展开）→ 竖线在左，即上一个的左右镜像
    expect(actionButtonsBlock).toContain("<PanelLeft size={16} />");

    // 导入必须真的加了，否则运行时直接崩
    expect(source).toContain("PanelRight,");
    expect(source).toContain("PanelLeft,");
  });

  it("尺寸与旁边两个 icon 一致，都是 16", () => {
    // 「灵感推荐」「分享对话」是这一排的视觉基准。
    expect(actionButtonsBlock).toContain("<Sparkles size={16} />");
    expect(actionButtonsBlock).toContain("<Share2 size={16} />");
    // 反向锁：换成别的字号就变红。
    expect(actionButtonsBlock).not.toContain("<PanelRight size={14}");
    expect(actionButtonsBlock).not.toContain("<PanelLeft size={14}");
    expect(actionButtonsBlock).not.toContain("<PanelRight size={18}");
    expect(actionButtonsBlock).not.toContain("<PanelLeft size={18}");
  });

  it("旧的 ChevronLeft 旋转方案已彻底拆除", () => {
    // 原实现是一个 ChevronLeft + collapsed 时 rotate(180deg)。
    expect(actionButtonsBlock).not.toContain("ChevronLeft");
    expect(actionButtonsBlock).not.toContain("rotate(180deg)");
  });

  it("icon 颜色不在图标上写死，由按钮统一决定（保证三个 icon 同源）", () => {
    // 一旦有人给 PanelRight/PanelLeft 单独加 color，就会和旁边两个 icon 脱节。
    expect(actionButtonsBlock).not.toContain("<PanelRight size={16} color");
    expect(actionButtonsBlock).not.toContain("<PanelLeft size={16} color");
    // 正向：颜色统一由按钮的 color 给出（展开态取 sub，与旁边两个 icon 同源）。
    // ⚠️ 必须带上后面的 `}` 前缀语境，不能只写 "color: sub" ——
    // 那样收起态改成白色后这条依然恒绿，等于失去保护。
    expect(toggleButton).toContain(': sub,');
    expect(toggleButton).toContain("color: collapsed ?");
  });
});

describe("需求 2：去掉「展开」文案，并连带回收为它而加的样式", () => {
  it("按钮里不再渲染「展开」文案", () => {
    // 正向锚点：证明抠到的确实是这颗按钮。
    expect(toggleButton).toContain("onClick={item.onClick}");
    expect(toggleButton).toContain("{item.icon}");

    // 反向：文案本体
    expect(toggleButton).not.toContain("展开</span>");
    expect(toggleButton).not.toContain('<span className="type-caption">');
  });

  it("为文案而加的布局补偿已一并删除", () => {
    /**
     * ⚠️ 这是这次最容易漏的一条。
     * 原来的收起态是一枚「‹ 展开」胶囊，为了容下文案额外加了：
     *   width: "auto"、padding: "0 10px"、gap: 6
     * 只删 <span> 不删这些，会剩一个空荡荡的胶囊壳 —— 不报错，但明显没做完。
     */
    expect(toggleButton).not.toContain('width: collapsed ? "auto" : 32');
    expect(toggleButton).not.toContain('padding: collapsed ? "0 10px" : 0');
    expect(toggleButton).not.toContain("gap: collapsed ? 6 : 0");
    // 宽高改由 className 统一表达（展开态 32，收起态 30 底托）
    expect(toggleButton).toContain("h-8 w-8");
    // ⚠️ 尺寸只能在 className 里说一次。style 里再写一份 width/height，
    // 两处各说一套，改一处不生效 —— 这是零报错的静默失效。
    const styleStart = toggleButton.indexOf("style={{");
    expect(styleStart, "按钮里找不到 style 块").toBeGreaterThan(-1);
    const styleBlock = toggleButton.slice(styleStart);
    expect(styleBlock).not.toContain("width:");
    expect(styleBlock).not.toContain("height:");
  });

  it("旧的「胶囊壳」装饰已移除（chipBg 底 + 重投影一律不留）", () => {
    // 收起态过去有 chipBg 底 + border 描边 + 投影，是一枚和旁边完全两副长相的胶囊。
    expect(toggleButton).not.toContain("background: collapsed ? chipBg");
    expect(toggleButton).not.toContain('boxShadow: collapsed ? "0 8px 20px');
    /**
     * ⚠️ 2026-11-10 起收起态**有**描边和投影了（用户要求与左上「返回」同款），
     * 所以这里不能再断言 `border: "none"` / `boxShadow: "none"` 是按钮的唯一取值 ——
     * 只能断言**展开态**那一支仍然是无装饰的。
     */
    expect(toggleButton).toContain('border: collapsed ? surfaceTokens.border : "none"');
    expect(toggleButton).toContain('boxShadow: collapsed ? surfaceTokens.shadow : "none"');
  });

  it("⭐ 展开态必须仍与旁边 icon 同款：透明底、颜色取 sub", () => {
    /**
     * 需求 2 的原意是「展开态这颗按钮别再是一枚突兀胶囊」。
     * 2026-09-20 给收起态加了底托，但展开态背后本来就有面板实底，
     * 不需要也不能有底托 —— 否则又退回三个 icon 长相不一致。
     */
    expect(toggleButton).toContain(
      'background: collapsed ? surfaceTokens.surface : "transparent"'
    );
    expect(toggleButton).toContain("color: collapsed ? surfaceTokens.text : sub");
    // 反向：退回「两态都铺底」就变红。
    expect(toggleButton).not.toContain("background: surfaceTokens.surface,");
  });
});

/**
 * 【2026-09-20 需求原文】
 * 「画布右上角的收起展开按钮缺少底托容器，容易跟画面混淆、看不清楚，
 *   加上一个圆角方形的底托，黑色透明度为 70，尺寸为 30X30」
 *
 * ⚠️ 背景：需求 3 把收起态的面板背景做成了 transparent，这颗按钮因此
 * **直接浮在画布图像上**。浅色图片一拖到右上角，细线图标就完全看不清。
 * 这不是需求 2 的回退 —— 需求 2 约束的是**展开态**要和旁边 icon 一致。
 *
 * 【2026-11-10 需求原文】
 * 「右上角的收起按钮，改为与左侧返回 icon 一样的颜色和质感。
 *   icon 颜色与画布中的 icon 颜色保持一致」
 *
 * 覆盖的是上一版的「黑托 70% + 白图标」：那套解决了对比度，却让这颗按钮
 * 和左上角「返回」变成了两种卡片（一颗像系统按钮、一颗像浮在图片上的播放键）。
 * 现在底托 = `canvasSurfaceTokens`（白面 + 极淡描边 + 柔和投影），
 * 与返回按钮同源；图标回落到画布 icon 的正文色。
 */
describe("需求 4：收起态底托与左上「返回」同源", () => {
  it("底托取自 canvasSurfaceTokens，不在这里另写数值", () => {
    // 正向锚点：先证明确实抠到了这颗按钮，否则下面全是空转。
    expect(toggleButton).toContain("onClick={item.onClick}");
    expect(toggleButton).toContain("{item.icon}");

    expect(toggleButton).toContain(
      'background: collapsed ? surfaceTokens.surface : "transparent"'
    );
    expect(toggleButton).toContain(
      'border: collapsed ? surfaceTokens.border : "none"'
    );
    expect(toggleButton).toContain(
      'boxShadow: collapsed ? surfaceTokens.shadow : "none"'
    );
  });

  it("⭐ icon 颜色回落到画布 icon 的正文色，不再写死白色", () => {
    /**
     * ⚠️ 这是最容易漏的一条。底托换成白面后，如果图标还留着 `#FFFFFF`，
     * 就是**白底白字** —— 完全看不见，而且零报错。
     * 底和字必须成对改，这条锁的就是「成对」。
     */
    expect(toggleButton).toContain("color: collapsed ? surfaceTokens.text : sub");
    // 反向：白字回来就变红
    expect(toggleButton).not.toContain('collapsed ? "#FFFFFF"');
  });

  it("黑托与白字必须彻底消失，不能两态并存", () => {
    // 只停止使用、把旧值留在代码里，下一个人会顺手接回去。
    expect(toggleButton).not.toContain("rgba(0,0,0,0.7)");
    expect(toggleButton).not.toContain('"#FFFFFF"');
  });

  it("token 是唯一来源：返回按钮也必须用它", () => {
    /**
     * 📌⭐⭐ 用户说的「和左侧返回一样」，本质是**同一份规格只能有一个出口**。
     * 要是两边各写一份 #ffffff / rgba(22,22,22,0.12)，下次改一边就分叉，
     * 而且两边各自看起来都"对"。
     */
    const definitions = source.split("function canvasSurfaceTokens(").length - 1;
    expect(definitions, "canvasSurfaceTokens 必须只定义一次").toBe(1);

    const consumers = source.split("canvasSurfaceTokens(isDark)").length - 1;
    expect(
      consumers,
      "两处消费点：左上「返回」+ 右上收起按钮"
    ).toBe(2);
  });

  it("尺寸与圆角不变（用户只要求换配色和质感）", () => {
    /**
     * 圆角方形：沿用设计令牌的中号圆角，不写死像素。
     *
     * ⚠️⚠️ 这里**必须连着收起态的尺寸类名一起断言**。
     * 只写 `toContain("rounded-[var(--radius-md-design)]")` 会被**展开态那支分支**
     * 里的同一个类名顶替 —— 把收起态改成 rounded-full，测试照样全绿。
     * 变异自证 M6 真的漏网过一次，就是栽在这里。
     */
    expect(toggleButton).toContain(
      "h-[30px] w-[30px] flex items-center justify-center rounded-[var(--radius-md-design)]"
    );
    expect(toggleButton).not.toContain(
      "h-[30px] w-[30px] flex items-center justify-center rounded-full"
    );
    expect(toggleButton).not.toContain(
      "h-[30px] w-[30px] flex items-center justify-center rounded-none"
    );
  });

  it("hover 反馈与返回按钮同款：换底色，不是整颗调透明度", () => {
    /**
     * 白底 + `hover:opacity-85` = 悬停时半透明，画布从按钮里透出来，
     * 和返回按钮（底色变 #f4f4f4）是两种反馈。
     */
    expect(toggleButton).toContain("surfaceTokens.hoverSurface");
    expect(toggleButton).not.toContain(
      "h-[30px] w-[30px] flex items-center justify-center rounded-[var(--radius-md-design)] transition-colors hover:opacity-85"
    );
  });
});

describe("需求 3：收起后那条长灰条去掉", () => {
  it("收起态背景必须透明", () => {
    // 正向锚点：证明抠到的是对话面板的 style 块。
    expect(asideStyle).toContain("width: panelWidth");
    expect(asideStyle).toContain("collapsedPeekWidth");

    expect(asideStyle).toContain('background: collapsed ? "transparent" : bg');
    // 反向：退回无条件铺底就变红 —— 那正是灰条的成因。
    expect(asideStyle).not.toContain("background: bg,");
  });

  it("毛玻璃必须跟着背景一起关掉", () => {
    /**
     * ⚠️ 只把 background 置成 transparent、留着 blur(22px)，
     * 露出的那一条依然会把画布糊成一片 —— 灰条淡了，但「有一根长条」还在。
     */
    expect(asideStyle).toContain('backdropFilter: collapsed ? "none" : "blur(22px)"');
    expect(asideStyle).not.toContain('backdropFilter: "blur(22px)",');
  });

  it("收起态仍不带描边与投影（否则灰条会变成一道亮边）", () => {
    expect(asideStyle).toContain('border: collapsed ? "none"');
    expect(asideStyle).toContain("boxShadow: collapsed");
  });

  it("不能靠改高度来消灰条", () => {
    /**
     * aside 是 flex 容器，展开态要靠满高撑起消息区 + 输入框。
     * 收起时动高度会让展开/收起过渡跳变，所以定位类名必须保持满高。
     */
    const asideTagStart = source.lastIndexOf("<aside", source.indexOf("data-tour-id={TOUR_ANCHORS.canvasAssistantPanel}"));
    const asideTag = source.slice(asideTagStart, asideTagStart + 400);
    expect(asideTag).toContain("top-3 bottom-3");
    expect(asideTag).not.toContain("height: collapsed");
  });
});
