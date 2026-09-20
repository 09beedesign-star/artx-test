import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSource = readFileSync(
  resolve(here, "SmartCommerceProductDialog.tsx"),
  "utf8"
);

/**
 * 需求（2026-09-20）原文三条硬性规则：
 *   1. 默认背景 tab 下，左侧上传区不是正方形，要和提示词模式一样是长方形；
 *   2. 电商背景模板库向下增高，直到「生成数量」按钮底边与左列「4K」按钮底边对齐；
 *      两个条件必须同时满足，layout 才不会因切换模式而「上下动荡」；
 *   3. 增高后的模板库内一排两个放最近使用的模板，保留标题和 icon，
 *      最右侧有「查看全部」文字 + icon，点击进入模板详情页。
 */

/** 从源码里取一个数字常量的字面值。 */
function readNumericConstant(name: string): number {
  const match = dialogSource.match(
    new RegExp(`const ${name} = (\\d+);`)
  );
  expect(match, `找不到常量 ${name}`).not.toBeNull();
  return Number(match![1]);
}

describe("智能电商产品：两列底边对齐（需求 2）", () => {
  it("上传区高度写成 BACKGROUND_PANEL_HEIGHT + delta 的表达式，而不是字面量", () => {
    /*
      为什么要求写成表达式：
      两个高度必须成对变动。写成字面量 364 的话，以后有人调了背景区高度，
      上传区不会跟着变，两列底边错开——而错开**不报任何错**，
      只是视觉上重新开始「上下动荡」。表达式让这种脱钩在语法层面不可能发生。
    */
    expect(dialogSource).toMatch(
      /const UPLOAD_SLOT_HEIGHT = BACKGROUND_PANEL_HEIGHT \+ \d+;/
    );
  });

  it("导出的 delta 与上传区表达式里的加数一致", () => {
    // 守卫测试自己核对的是导出的 delta，而真正渲染用的是表达式里的加数。
    // 两者若不一致，测试会「守着一个没人用的数字」通过，属于典型的假绿。
    const exported = readNumericConstant("SMART_COMMERCE_COLUMN_HEIGHT_DELTA");
    const used = Number(
      dialogSource.match(
        /const UPLOAD_SLOT_HEIGHT = BACKGROUND_PANEL_HEIGHT \+ (\d+);/
      )![1]
    );
    expect(used).toBe(exported);
  });

  it("delta 与从 JSX 实际类名重新推导出的高度账吻合", () => {
    /*
      ⚠️ 这条是本文件里最重要的断言。

      只断言 `delta === 156` 是没有意义的——它锁的是「数字没被改」，
      而真正会出事的场景是：有人把「生成数量」按钮从 h-9 调成 h-10，
      此时 156 原封不动，测试照样绿，但两列已经错开 4px。

      所以这里不信任常量，而是**从源码 JSX 里把两列的每一项高度重新读出来**，
      再算一遍差值，和常量比对。任何一处行高/间距被改动，这条都会红。

      前提：Tailwind preflight 全局 box-sizing:border-box
        → h-10 这类自带高度类的元素 border 已含在内，不重复加；
          「无高度类的容器 + style border」则必须单独 +2px。
    */
    const SECTION_TITLE = 20 + 8; // SectionTitle: min-h-5 + mb-2

    // —— 从源码确认每一项的类名仍是账上写的那个 ——
    // 左列：分辨率列（4K 所在列，比画幅列高，决定左列底边）
    expect(dialogSource, "分辨率列不再是 grid-rows-3 gap-1.5").toContain(
      '<div className="grid grid-rows-3 gap-1.5">'
    );
    expect(dialogSource, "分辨率按钮行高不再是 h-8").toContain(
      'className="h-8 rounded-md text-[10px] font-semibold uppercase transition-colors"'
    );
    const resolutionColumn = SECTION_TITLE + (32 * 3 + 6 * 2); // 28 + 108

    // 画幅列必须仍然比分辨率列矮，否则「左列底边 = 4K 底边」这个前提就不成立
    const ratioColumn = SECTION_TITLE + (40 * 2 + 6); // 6 项 grid-cols-3 → 2 行 h-10
    expect(
      ratioColumn,
      "画幅列变得比分辨率列高了，左列底边不再是 4K 按钮，整笔账要重算"
    ).toBeLessThan(resolutionColumn);

    const leftFixed = SECTION_TITLE + 16 /* mt-4 */ + resolutionColumn;

    // 右列：tab / 构图 / 平台触发器 / 数量
    expect(dialogSource, "模式 tab 容器类名变了").toContain(
      'className="mb-2 grid grid-cols-2 gap-1 rounded-md p-1"'
    );
    expect(dialogSource, "tab 按钮行高不再是 h-8").toContain(
      'className="flex h-8 items-center justify-center gap-1.5 rounded text-[10px] font-semibold transition-colors"'
    );
    expect(dialogSource, "构图按钮行高不再是 h-12").toContain(
      "flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1"
    );
    expect(dialogSource, "平台触发器行高不再是 h-10").toContain(
      'className="flex h-10 w-full items-center justify-between gap-2 px-2.5 text-[10px] font-semibold"'
    );
    expect(dialogSource, "生成数量按钮行高不再是 h-9").toContain(
      'className="h-9 rounded-md text-[10px] font-semibold transition-colors"'
    );

    const tabRow = 32 + 8 + 2; // h-8 + p-1×2 + 容器 border×2
    const platformTrigger = 40 + 2; // h-10 + 外层无高度类容器的 border×2
    const rightFixed =
      SECTION_TITLE + // 背景生成方式 标题
      tabRow +
      8 + // mb-2
      16 +
      SECTION_TITLE +
      48 + // 构图 h-12
      16 +
      SECTION_TITLE +
      platformTrigger +
      16 +
      SECTION_TITLE +
      36; // 数量 h-9

    expect(rightFixed - leftFixed).toBe(
      readNumericConstant("SMART_COMMERCE_COLUMN_HEIGHT_DELTA")
    );
  });
});

describe("智能电商产品：上传区不随模式伸缩（需求 1）", () => {
  it("上传区用固定高度，不再靠 flex-1 吃掉左列剩余空间", () => {
    /*
      根因：上传区原本是 h-full + flex-1，高度 = 左列剩余 = 右列高度的函数。
      右列一换模式，上传区就缩一截。判据：尺寸由会变化的兄弟节点推导 = 必然抖动。
    */
    expect(dialogSource).toContain("height: UPLOAD_SLOT_HEIGHT,");
    const uploadSlotClass = dialogSource.match(
      /className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-md px-4 text-center transition-colors"/
    );
    expect(uploadSlotClass, "上传区类名被改动，请确认没有重新引入 flex-1/h-full").not.toBeNull();
    expect(uploadSlotClass![0]).not.toContain("flex-1");
    expect(uploadSlotClass![0]).not.toContain("h-full");
    expect(uploadSlotClass![0]).not.toContain("aspect-square");
  });

  it("上传区高度远大于其宽度约束，保证是长方形而不是正方形", () => {
    // 需求 1 原文：「不是正方形，也变成和提示词模式一样的长方形区域」。
    // aspect-square / 1:1 的写法一旦回潮，这条会红。
    expect(dialogSource).not.toContain("aspect-square");
    expect(readNumericConstant("BACKGROUND_PANEL_HEIGHT")).toBeGreaterThan(0);
  });
});

describe("智能电商产品：两种背景模式等高（需求 2 的另一半）", () => {
  it("提示词模式与模板模式共用同一个高度常量", () => {
    /*
      ⚠️ 这条最容易被漏掉。

      提示词区自然高 130px，模板区 208px，相差 78px；
      而且提示词区里的「平台风格助写块」是条件渲染的，选了平台还会再长高。
      也就是说右列高度有三种可能值。

      只钉模板区 → 切到提示词模式时右列缩 78px，
      「生成数量底边对齐 4K 底边」当场失效，且零报错。
    */
    const occurrences = dialogSource.match(/height: BACKGROUND_PANEL_HEIGHT/g);
    expect(
      occurrences?.length,
      "BACKGROUND_PANEL_HEIGHT 应同时用在模板区和提示词区"
    ).toBe(2);
  });

  it("提示词区内容超出时内部滚动，不把外轮廓顶高", () => {
    expect(dialogSource).toMatch(
      /className="overflow-y-auto"\s*\n\s*style=\{\{ height: BACKGROUND_PANEL_HEIGHT \}\}/
    );
  });

  it("背景区高度足以容纳模板模式的全部内容", () => {
    /*
      面板带 overflow-hidden。高度取小了，第二行「最近使用」卡片会被裁掉，
      零报错，表现为「明明用过的模板不显示」，极难联想到是常量问题。
      这里按内容逐项相加复核一遍。
    */
    const contentHeight =
      10 + // 头部 pt-2.5
      24 + // 头部行 h-6
      (6 + 2 + 8 + 16) + // 已选回显 mt-1.5 + border + py-1×2 + leading-4
      6 + // 主体 pt-1.5
      (12 + 4) + // 「最近使用」标签 + mb-1
      (52 * 2 + 6) + // 卡片两行 h-[52px] + gap-1.5
      10; // 主体 pb-2.5
    expect(readNumericConstant("BACKGROUND_PANEL_HEIGHT")).toBeGreaterThanOrEqual(
      contentHeight
    );
  });
});

describe("智能电商产品：模板库面板结构（需求 3）", () => {
  it("保留标题文字与 icon", () => {
    expect(dialogSource).toContain("电商背景模板库");
    expect(dialogSource).toContain("<Sparkles size={13} />");
  });

  it("最近使用固定一排两个，不用会漂移的 auto-fit", () => {
    /*
      auto-fit/minmax 会随面板宽度在 1/2/3 列间变化，需求要的是确定的两列。

      ⚠️ 这里必须把断言限制在**最近使用区的那段 JSX** 里再查 auto-fit。
         最初写成对整份源码 `not.toContain("auto-fit")`，结果被别处
         注释里的「不用 auto-fit」字样命中而假红 —— 断言范围过宽，
         锁到的是无关文本，既误报又会在将来挡住正常改动。
    */
    expect(dialogSource).toContain('<div className="grid grid-cols-2 gap-1.5">');

    const start = dialogSource.indexOf("recentTemplates.length > 0 ?");
    expect(start, "找不到最近使用区").toBeGreaterThan(-1);
    const end = dialogSource.indexOf("还没有用过模板", start);
    expect(end).toBeGreaterThan(start);
    const recentBlock = dialogSource.slice(start, end);

    // 只查真实的 CSS 写法（类名/样式值），不查注释里的词。
    expect(recentBlock).not.toMatch(/grid-cols-\[.*auto-fit/);
    expect(recentBlock).not.toMatch(/repeat\(\s*auto-fit/);
    expect(recentBlock).toContain("grid grid-cols-2");
  });

  it("最右侧有「查看全部」文字 + icon，点击打开模板详情页", () => {
    /*
      ⚠️ 不能只写 toContain("查看全部")。

      变异自证抓到过一次假绿：源码里 title="查看全部电商背景模板" 也含这四个字，
      于是把**按钮可见文案**删掉、只留 title，测试照样绿——
      而用户看到的是一个没有文字的光秃秃图标。

      需求原文要的是「文字 + icon」，所以必须断言**文本节点**本身存在，
      而不是这四个字在文件里随便什么地方出现过。
    */
    expect(dialogSource).toContain("onClick={() => setShowPicwishSelector(true)}");

    // 文本节点：独占一行的「查看全部」，紧跟 ArrowRight 图标
    expect(dialogSource).toMatch(/\n\s*查看全部\s*\n\s*<ArrowRight size=\{11\} \/>/);
  });

  it("模板选择只有一条入口，保证「最近使用」一定被记录", () => {
    /*
      ⚠️ 这条防的是本项目已经踩过 11 次的「透传 ≠ 被消费」：
         全屏选择器如果直接 onSelect={setSelectedPicwishTemplate}，
         选中确实生效，但绕过了记录逻辑，「最近使用」永远是空的，且零报错。
    */
    expect(dialogSource).toContain("onSelect={handlePickPicwishTemplate}");
    expect(dialogSource).not.toContain("onSelect={setSelectedPicwishTemplate}");
  });
});
