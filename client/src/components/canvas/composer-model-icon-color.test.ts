import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 右下角对话框 composer「模型」按钮的图标可见性锁（2026-11-15）。
 *
 * 【用户反馈】浅色主题下这颗图标完全看不见，只剩右边一颗展开箭头。
 * 【根因】这里直接调用共享的 AssistantModelIcon 却没传 color，而它的
 *   默认值是 #FFFFFF —— 白图标画在白色按钮底上。
 *
 * ⚠️ 不能改成「修 AssistantModelIcon 的默认值」：同文件的模型下拉列表
 *   是深色 #161616 底，本来就依赖那颗白色。所以约束是**这个调用点必须
 *   显式传一份跟随主题/交互态的颜色**，不是改全局默认值。
 */

const SOURCE_PATH = resolve(__dirname, "InfiniteCanvas.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

/** 抠出「模型」触发按钮的完整 JSX（从 aria-label 往前找到 <button，往后到 </button>）。 */
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

describe("右下角 composer 模型按钮图标必须在浅色主题下可见", () => {
  it("助手模型图标显式传 color，不再吃 #FFFFFF 默认值", () => {
    // 正向：先真的抠出图标标签，证明样本有效（读空了下面会集体假绿）。
    const iconTag = triggerButton.match(/<AssistantModelIcon[\s\S]*?\/>/);
    expect(iconTag, "模型按钮里找不到 AssistantModelIcon 调用").toBeTruthy();
    expect(iconTag![0], "图标没接主题色，会退回默认白色").toContain(
      "color={assistantComposerModelIconColor}"
    );
    // 反向：修复前那行「不带 color 的单行裸调用」不许回来。
    expect(triggerButton).not.toContain(
      "<AssistantModelIcon modelId={assistantModel.id} icon={assistantModel.icon} />"
    );
    // 魔法棒也要跟着接色，否则 auto 态和手动选模型态视觉会分叉。
    expect(triggerButton).toMatch(
      /<WandSparkles[^>]*color=\{assistantComposerModelIconColor\}/
    );
  });

  it("默认态用深色，hover/展开态跟随按钮转白", () => {
    const start = source.indexOf("const assistantComposerModelIconColor");
    expect(start, "找不到图标色变量定义").toBeGreaterThan(-1);
    const block = source.slice(start, start + 420);
    expect(block.length).toBeGreaterThan(80);

    // 默认态：浅色主题必须是黑色系，不能是白色（否则又看不见）。
    expect(block).toContain('"#161616"');
    expect(block, "浅色默认态不能是白色").not.toContain(
      ': "#FFFFFF"'
    );
    // 深色主题给浅白，避免深底深图标。
    expect(block).toContain('"#f5f5f5"');
    // 交互态：按钮底色转深时图标必须同步转白。
    expect(block).toContain("agentMenuOpen || agentButtonHover");
    expect(block).toContain("compactSelectorActiveText");
  });

  it("图标色定义在按钮文字色旁边，且只有一个事实源", () => {
    const hits = source.match(
      /const assistantComposerModelIconColor\s*=/g
    ) || [];
    expect(hits.length, "图标色只允许一处定义").toBe(1);
    // 全文件里给这两颗图标用的颜色只能来自这个变量，不许再抄一份字面量。
    expect(source).not.toMatch(
      /<AssistantModelIcon[^>]*color="#(?:FFFFFF|ffffff)"/
    );
  });
});
