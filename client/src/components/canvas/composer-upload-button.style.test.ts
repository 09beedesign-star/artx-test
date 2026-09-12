import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "InfiniteCanvas.tsx"), "utf8");

/**
 * 从源码里抠出某个 <button> 的完整文本。
 * 用 anchor（按钮内独有的标记）定位，再向前找最近的 `<button`，
 * 向后找配对的 `</button>`。
 */
function extractButton(anchor: string) {
  const anchorIndex = source.indexOf(anchor);
  expect(anchorIndex, `找不到锚点：${anchor}`).toBeGreaterThan(-1);
  const start = source.lastIndexOf("<button", anchorIndex);
  const end = source.indexOf("</button>", anchorIndex);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

// 提示词框左下角的「+上传」按钮
const uploadButton = extractButton('aria-label="上传图片"');
// 紧挨着它的模型选择器按钮 —— 上传按钮的视觉基准
const modelButton = extractButton('aria-label="选择模型"');

describe("提示词框「+上传」按钮与模型选择器的视觉一致性", () => {
  it("三态配色必须取自同一组 compactSelector* 变量", () => {
    // 用户明确要求：默认态、hover 态、点击态都和模型选择器完全一致。
    // 第一版实现照抄了 ImageCountSelector，底色是 oklch(0.13 0.015 270)，
    // 而模型选择器是 #525252 / #2b2b2b —— 暗色主题下这一排按钮会深浅不一。
    // 所以这里锁死「必须引用同名变量」，而不是锁死具体色值。
    const requiredTokens = [
      "compactSelectorBg", // 默认底板
      "compactSelectorHoverBg", // hover 底板
      "compactSelectorActiveBg", // 点击态底板
      "compactSelectorBorder", // 默认描边
      "compactSelectorActiveBorder", // 点击态描边
      "compactSelectorText", // 默认图标/文字色
      "compactSelectorActiveText", // 高亮图标/文字色
    ];
    for (const token of requiredTokens) {
      expect(uploadButton, `上传按钮缺少 ${token}`).toContain(token);
      expect(modelButton, `模型选择器缺少 ${token}`).toContain(token);
    }
  });

  it("不得混入 ImageCountSelector 的那套配色", () => {
    // 这几个色值是计数器/比例选择器专用的，出现在上传按钮里就说明又抄错了模板。
    const forbidden = ["oklch(0.13 0.015 270)", "oklch(0.74 0.01 270)"];
    for (const color of forbidden) {
      expect(uploadButton, `上传按钮混入了 ${color}`).not.toContain(color);
    }
  });

  it("尺寸与形状类名与模型选择器逐项一致", () => {
    const shared = [
      "h-8",
      "shrink-0",
      "rounded-[var(--radius-md-design)]",
      "px-2",
      "gap-1.5", // 计数器用的是 gap-1，模型选择器是 gap-1.5
      "transition-colors",
      "active:scale-95",
    ];
    for (const cls of shared) {
      expect(uploadButton, `上传按钮缺少类名 ${cls}`).toContain(cls);
      expect(modelButton, `模型选择器缺少类名 ${cls}`).toContain(cls);
    }
  });

  it("compact 宽度与字号排版与模型选择器一致", () => {
    for (const rule of [
      "width: compactAssistantControls ? 32 : undefined",
      "maxWidth: compactAssistantControls ? 32 : 138",
      "fontSize: 11",
      'lineHeight: "14px"',
      "letterSpacing: 0",
    ]) {
      expect(uploadButton, `上传按钮缺少 ${rule}`).toContain(rule);
      expect(modelButton, `模型选择器缺少 ${rule}`).toContain(rule);
    }
  });

  it("图标尺寸与模型选择器的 compact 图标一致（13px）", () => {
    // 模型选择器 compact 态用的是 <WandSparkles size={13} />，
    // 计数器那套是 size={12}。跟错会显得加号偏小。
    expect(uploadButton).toContain("<Plus size={13}");
  });

  it("点击态必须真的被驱动，而不是只声明了变量", () => {
    // 只写 compactSelectorActiveBg 但没人 setPressed(true)，
    // 点击态就永远不会出现。这里确认按下/抬起/取消都接上了。
    expect(uploadButton).toContain("onPointerDown");
    expect(uploadButton).toContain("setComposerUploadButtonPressed(true)");
    expect(uploadButton).toContain("onPointerUp");
    expect(uploadButton).toContain("onPointerCancel");
    // 移出按钮时必须同时清掉 hover 和 pressed，
    // 否则按住后拖出去松手，按钮会卡在点击态。
    const leaveBlock = uploadButton.slice(uploadButton.indexOf("onMouseLeave"));
    expect(leaveBlock).toContain("setComposerUploadButtonHovered(false)");
    expect(leaveBlock).toContain("setComposerUploadButtonPressed(false)");
  });
});
