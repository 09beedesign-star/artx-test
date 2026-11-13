/**
 * 图片节点内悬浮按钮（再次生成 / GIF / SVG）的出现时机与配色（2026-11-13 用户两轮反馈）。
 *
 * 用户原话：
 *   ① 「图片节点下面会有两个黑色的方框，并且生成之后底部有两个奇怪的按钮。而且按钮的样式非常巨大。」
 *   ② 「这几个按钮不应该是在图片生成之后才出现的吗？而且再次生成的按钮已经变成了透明的。
 *       再次生成按钮，我希望他保持黑色」
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CANVAS = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf-8");
const DELIVERABLE = readFileSync(resolve(__dirname, "ImageDeliverableActions.tsx"), "utf-8");

function sliceBetween(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  expect(a, `起始锚点失效：${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `终止锚点失效：${end}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("出现时机：图真正加载出来之后才出现", () => {
  it("就绪判据 = 有图 + 该 src 已触发 onLoad + 未过期", () => {
    expect(CANVAS).toContain(
      "Boolean(displaySrc) && loadedDisplaySrc === displaySrc && !isImageExpired"
    );
  });

  it("onLoad 回调最先记下已加载的 src（早于任何 early return）", () => {
    const body = sliceBetween(
      CANVAS,
      "const handleImageNaturalSizeLoaded = useCallback(",
      "if (hasActiveCrop || hasFrameClipInsets) return;"
    );
    expect(body).toContain("setLoadedDisplaySrc(");
  });

  it("GIF/SVG 操作栏挂在就绪判据上，而不是 displaySrc 非空", () => {
    expect(CANVAS).toContain(
      "{isDisplayImageReady && !isAiProcessingImage && !isExtractingText && ("
    );
    expect(CANVAS).not.toContain(
      "{displaySrc && !isAiProcessingImage && !isExtractingText && ("
    );
  });

  it("再次生成：成功出图要等就绪；失败/中断时它是唯一重试入口，照常显示", () => {
    const cond = sliceBetween(CANVAS, "{regenerateDetail &&", 'aria-label="再次生成"');
    expect(cond).toContain(
      "(isDisplayImageReady || isGenerationFailed || isGenerationInterrupted)"
    );
    expect(cond).toContain("!isGeneratingImage");
  });
});

describe("配色：再次生成保持黑色，GIF/SVG 与之同款且字可读", () => {
  it("再次生成按钮黑底白字，不走透明线框 token", () => {
    const btn = sliceBetween(CANVAS, 'aria-label="再次生成"', "onMouseDown=");
    expect(btn).toContain('background: "#161616"');
    expect(btn).toContain('color: "#ffffff"');
    expect(btn).not.toContain("var(--artx-action-bg)");
  });

  it("GIF/SVG 按钮黑底白字（旧 bug：底与字同为 #161616 → 黑方框）", () => {
    const btn = sliceBetween(DELIVERABLE, "function DeliverableButton(", "export function ImageDeliverableActions(");
    expect(btn).toContain('const bg = "#161616"');
    expect(btn).toContain('color: "#ffffff"');
    expect(btn).not.toMatch(/const text = isDark \? "#bbbbbb" : "#161616"/);
  });
});
