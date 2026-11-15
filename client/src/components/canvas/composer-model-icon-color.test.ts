import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 右下角对话框 composer「模型」按钮 + 展开面板的配色锁（2026-11-15）。
 *
 * 【用户最终口径】
 *   1. 激活之后的模型下拉面板要**白色**（不能是浅色主题下的黑底深字）；
 *   2. 触发按钮上的图标只要和同一排「上传 / 技能 / 张数 / 图片尺寸」
 *      几颗 icon **同色**，不要单独定一套配色。
 *
 * 【为什么值得一条测试】
 *   这颗图标看不见的直接原因是调用 AssistantModelIcon 没传 color，
 *   吃了组件默认 #FFFFFF。但改成写死的纯黑也不对 —— 与旁边那排
 *   #777472 的线性图标深浅不一，且 hover 时按钮底色转深会变成
 *   「深底深图标」。约束是**同源**（跟随按钮文字色），不是某个色值。
 *
 *   ⚠️ 面板改白后还有第二个出口：面板内每行的品牌图标默认也是 #FFFFFF，
 *      白底白图标会重演同一个 bug，必须按选中态/主题显式给色。
 *      这正是本项目「同一份视觉的多个出口，只改一个等于没做」。
 */

const SOURCE_PATH = resolve(__dirname, "InfiniteCanvas.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

/** 抠出「模型」触发按钮的完整 JSX。 */
function readModelTriggerButton() {
  const anchor = source.indexOf('aria-label="选择模型"');
  expect(anchor, "找不到模型触发按钮锚点").toBeGreaterThan(-1);
  const start = source.lastIndexOf("<button", anchor);
  const end = source.indexOf("</button>", anchor);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  // 样本有效性闸门：切空了会让下面所有 not.toContain 恒绿。
  expect(block.length, "按钮区块切得太短，样本无效").toBeGreaterThan(300);
  expect(block, "切到的不是模型按钮").toContain("AssistantModelIcon");
  return block;
}

/** 抠出展开面板（portal 里的 model-selector-scroll 容器）的 style 块。 */
function readModelPanelStyle() {
  const anchor = source.indexOf("ref={assistantModelPopoverRef}");
  expect(anchor, "找不到模型下拉面板锚点").toBeGreaterThan(-1);
  const start = source.indexOf("style={{", anchor);
  const end = source.indexOf("}}", start);
  expect(start).toBeGreaterThan(anchor);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  expect(block.length, "面板 style 区块切得太短，样本无效").toBeGreaterThan(80);
  return block;
}

const triggerButton = readModelTriggerButton();
const panelStyle = readModelPanelStyle();

describe("右下角 composer 模型按钮与展开面板配色", () => {
  it("白面板：浅色主题下模型下拉不得是黑底", () => {
    // 反向：历史上这里两个分支都写死 #161616（浅色主题也黑底 + 深字，看不清）。
    expect(panelStyle, "浅色分支仍是黑面板").not.toContain(': "#161616"');
    // 正向：浅色必须白、深色保持深。
    expect(panelStyle).toMatch(/isDark\s*\?\s*"#161616"\s*:\s*"#ffffff"/);
    // 面板文字跟随 text（浅色是深色字），白底才可读。
    expect(panelStyle).toContain("color: text");
  });

  it("触发按钮的两颗图标都跟随按钮文字色，与隔壁 icon 同源", () => {
    // 正向：先抠出图标标签，证明样本有效（读空了下面会集体假绿）。
    const iconTag = triggerButton.match(/<AssistantModelIcon[\s\S]*?\/>/);
    expect(iconTag, "模型按钮里找不到 AssistantModelIcon 调用").toBeTruthy();
    expect(iconTag![0], "图标没接主题色，会退回默认白色").toContain(
      "color={assistantComposerModelIconColor}"
    );
    // 修复前那行「不带 color 的单行裸调用」不许回来。
    expect(triggerButton).not.toContain(
      "<AssistantModelIcon modelId={assistantModel.id} icon={assistantModel.icon} />"
    );
    // auto 态的魔法棒也要同源，否则两种模式视觉会分叉。
    expect(triggerButton).toMatch(
      /<WandSparkles[^>]*color=\{assistantComposerModelIconColor\}/
    );

    // 图标色定义必须复用整排按钮共用的 compactSelector* 变量，
    // 不允许再写一套独立色值（那正是本次被用户退回的做法）。
    const start = source.indexOf("const assistantComposerModelIconColor");
    expect(start, "找不到图标色变量定义").toBeGreaterThan(-1);
    const def = source.slice(start, start + 300);
    expect(def).toContain("compactSelectorText");
    expect(def).toContain("compactSelectorActiveText");
    expect(def).toContain("agentMenuOpen || agentButtonHover");
    expect(def, "不得再为这颗图标单写色值").not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("白面板里每一行的模型图标都显式给色（不得白底白图标）", () => {
    const panelStart = source.indexOf("ref={assistantModelPopoverRef}");
    const panelEnd = source.indexOf("document.body", panelStart);
    const panel = source.slice(
      panelStart,
      panelEnd > panelStart ? panelEnd : panelStart + 12000
    );
    expect(panel.length, "面板区块切得太短，样本无效").toBeGreaterThan(2000);
    const iconTags = panel.match(/<AssistantModelIcon[\s\S]*?\/>/g) || [];
    expect(iconTags.length, "面板内没扫到模型图标调用").toBeGreaterThan(0);
    for (const tag of iconTags) {
      expect(tag, `面板里出现白底白图标：${tag}`).toMatch(/\scolor=\{/);
    }
  });
});
