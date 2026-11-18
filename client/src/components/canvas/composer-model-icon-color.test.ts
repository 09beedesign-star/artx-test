import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 右下角对话框 composer「模型」按钮 + 展开面板的配色锁（2026-11-15 建，2026-11-18 适配重构）。
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
 *
 * 2026-11-18 重构：浮层 UI 抽到 ModelSelector.tsx 的公共组件
 * AssistantModelPopover。配色 token 由调用方用 modelPopoverTokens 算好后
 * 通过 tokens={} 传入，面板内部统一用 tokens.*。断言指向新位置，意图不变。
 */

const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");
const selectorSource = readFileSync(resolve(__dirname, "ModelSelector.tsx"), "utf8");

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
const triggerButton = readModelTriggerButton();

/** 抠出调用方传给公共浮层的那一小段（从 AssistantModelPopover 开始）。 */
function readPopoverInvocation() {
  const start = source.indexOf("<AssistantModelPopover");
  expect(start, "找不到公共浮层调用").toBeGreaterThan(-1);
  const block = source.slice(start, start + 2400);
  expect(block.length, "浮层调用区块切得太短，样本无效").toBeGreaterThan(400);
  return block;
}
const popoverInvocation = readPopoverInvocation();

/** 抠出公共浮层组件本体。 */
function readPopoverComponent() {
  const start = selectorSource.indexOf("export function AssistantModelPopover");
  expect(start, "找不到公共浮层组件定义").toBeGreaterThan(-1);
  const block = selectorSource.slice(start);
  expect(block.length, "公共浮层组件切片太短，样本无效").toBeGreaterThan(2000);
  return block;
}
const popoverComponent = readPopoverComponent();

describe("右下角 composer 模型按钮与展开面板配色", () => {
  it("白面板：整套配色走共用 modelPopoverTokens 的 light 口径，再经 tokens={} 传入浮层", () => {
    // 调用方：token 定义必须按主题取，不能写死任一分支。
    const start = source.indexOf("const assistantModelPopoverTokens");
    expect(start, "找不到面板配色 token 定义").toBeGreaterThan(-1);
    const def = source.slice(start, start + 240);
    expect(def).toContain("modelPopoverTokens(");
    expect(def).toMatch(/isDark\s*\?\s*"dark"\s*:\s*"light"/);
    // 调用方把整套 token 传给公共浮层（不是在任何分支里写死颜色）。
    expect(popoverInvocation).toContain("tokens={assistantModelPopoverTokens}");
    expect(popoverInvocation).not.toContain(': "#161616"');

    // 公共组件：背景/边框/文字/阴影全部从 tokens 取，成套不散落。
    expect(popoverComponent).toContain("tokens.background");
    expect(popoverComponent).toContain("tokens.border");
    expect(popoverComponent).toContain("tokens.text");
    expect(popoverComponent, "阴影没走 token，浅色分支可能掉回深色").toContain(
      "tokens.shadow"
    );
    // 选中行 / hover 也要同源。
    expect(popoverComponent).toContain("tokens.selectedBackground");
    expect(popoverComponent).toContain("tokens.hoverBackground");
    // 反向：公共组件里不得写死黑底（历史上两个分支都写死 #161616 的 bug）。
    expect(popoverComponent).not.toContain(': "#161616"');
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
    // 面板内每行图标的 color 统一来自 tokens.icon —— 白底主题下 tokens.icon
    // 是深色，不会重演默认白色导致的白底白图标。
    const iconTag = popoverComponent.match(
      /<AssistantModelIcon[\s\S]*?color=\{tokens\.icon\}[\s\S]*?\/>/
    );
    expect(iconTag, "公共浮层模型行图标没显式接 tokens.icon").toBeTruthy();
    // 反向：不许退回不传 color 的裸调用（那会吃默认 #FFFFFF）。
    expect(popoverComponent).not.toMatch(
      /<AssistantModelIcon modelId=\{model\.id\} icon=\{model\.icon\} \/>/
    );
    // light 口径下 tokens.icon 必须是深色（不能是白）—— 定义在独立 token 文件。
    const tokensSource = readFileSync(
      resolve(__dirname, "model-popover-tokens.ts"),
      "utf8"
    );
    const lightStart = tokensSource.indexOf('if (theme === "light")');
    expect(lightStart, "找不到 light 配色分支").toBeGreaterThan(-1);
    const lightBlock = tokensSource.slice(lightStart, lightStart + 500);
    expect(lightBlock).toMatch(/icon:\s*"rgba\(20,20,36/);
  });
});
