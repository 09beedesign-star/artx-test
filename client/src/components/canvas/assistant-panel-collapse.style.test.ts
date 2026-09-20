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
    expect(actionButtonsBlock).toContain("灵感推荐");

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

  it("旧的「胶囊壳」装饰已移除（描边 + 投影一律不留）", () => {
    // 收起态过去有 chipBg 底 + border 描边 + 投影，是一枚和旁边完全两副长相的胶囊。
    expect(toggleButton).not.toContain("background: collapsed ? chipBg");
    expect(toggleButton).not.toContain("border: collapsed ?");
    expect(toggleButton).not.toContain('boxShadow: collapsed ? "0 8px 20px');
    // 正向：描边和投影两态都没有（2026-09-20 加的底托是纯色块，不带边框/投影）
    expect(toggleButton).toContain('border: "none"');
    expect(toggleButton).toContain('boxShadow: "none"');
  });

  it("⭐ 展开态必须仍与旁边 icon 同款：透明底、颜色取 sub", () => {
    /**
     * 需求 2 的原意是「展开态这颗按钮别再是一枚突兀胶囊」。
     * 2026-09-20 给收起态加了底托，但展开态背后本来就有面板实底，
     * 不需要也不能有底托 —— 否则又退回三个 icon 长相不一致。
     */
    expect(toggleButton).toContain('background: collapsed ? "rgba(0,0,0,0.7)" : "transparent"');
    expect(toggleButton).toContain("color: collapsed ? \"#FFFFFF\" : sub");
    // 反向：退回「两态都铺底」就变红。
    expect(toggleButton).not.toContain('background: "rgba(0,0,0,0.7)"');
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
 */
describe("需求 4：收起态必须有底托，否则和画布糊在一起", () => {
  it("底托是 30×30 圆角方形、黑色 70% 不透明", () => {
    // 正向锚点：先证明确实抠到了这颗按钮，否则下面全是空转。
    expect(toggleButton).toContain("onClick={item.onClick}");
    expect(toggleButton).toContain("{item.icon}");

    // 尺寸：收起态 30×30（用户指定），展开态维持 32（与旁边 icon 同尺寸）
    expect(toggleButton).toContain("h-[30px] w-[30px]");
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
    // 反向：改成全圆 / 直角就变红
    expect(toggleButton).not.toContain("h-[30px] w-[30px] flex items-center justify-center rounded-full");
    expect(toggleButton).not.toContain("h-[30px] w-[30px] flex items-center justify-center rounded-none");
    // 底色：纯黑 70%
    expect(toggleButton).toContain('"rgba(0,0,0,0.7)"');
  });

  it("底托只在收起态出现，展开态不能有", () => {
    /**
     * 展开态背后是面板自己的实底，再叠一层黑托就成了「按钮上贴按钮」，
     * 而且会和左边两个透明 icon 长相脱节。
     */
    expect(toggleButton).toContain('collapsed ? "rgba(0,0,0,0.7)" : "transparent"');
    // 反向：写成无条件铺底就变红
    expect(toggleButton).not.toContain('background: "rgba(0,0,0,0.7)",');
  });

  it("⭐ 图标在黑托上必须转成白色，否则等于没加底托", () => {
    /**
     * ⚠️ 这是最容易漏的一条。只加黑底、图标仍用 `sub`（深灰），
     * 深灰压在纯黑上依然看不清 —— 加了底托却没解决"看不清楚"，
     * 而且完全不报错，视觉上还像是做完了。
     */
    expect(toggleButton).toContain('collapsed ? "#FFFFFF" : sub');
    // 反向：退回两态同色就变红
    expect(toggleButton).not.toContain("color: sub,");
  });

  it("底托不带描边和投影（用户只要一个纯色块）", () => {
    const styleStart = toggleButton.indexOf("style={{");
    const styleBlock = toggleButton.slice(styleStart);
    expect(styleBlock).toContain('border: "none"');
    expect(styleBlock).toContain('boxShadow: "none"');
    // 反向：偷偷加回描边/投影就变红
    expect(styleBlock).not.toContain("border: collapsed");
    expect(styleBlock).not.toContain("boxShadow: collapsed");
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
