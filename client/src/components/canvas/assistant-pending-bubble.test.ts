import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 画布对话等待气泡文案：
 *   出图 → 「正在生成图片中...」；只有走大语言模型文字回复时才是「AI 正在回复中...」。
 */
const source = readFileSync(resolve(__dirname, "InfiniteCanvas.tsx"), "utf8");

function sliceFrom(anchor: string, length = 20000) {
  const start = source.indexOf(anchor);
  expect(start, `anchor not found: ${anchor}`).toBeGreaterThanOrEqual(0);
  return source.slice(start, start + length);
}

describe("assistant pending bubble copy", () => {
  it("气泡按 submittingKind 切换文案，默认是出图", () => {
    expect(source).toContain('useState<"image" | "text">("image")');
    expect(source).toContain(
      '{submittingKind === "image" ? "正在生成图片中..." : "AI 正在回复中..."}'
    );
  });

  it("不再有写死的「AI 正在回复中」气泡", () => {
    const staticBubble = />\s*AI 正在回复中\.\.\.\s*</g;
    expect(source.match(staticBubble) ?? []).toHaveLength(0);
  });

  it("纯大语言模型能力调用标记为 text", () => {
    const body = sliceFrom("const runAssistantCapability", 6000);
    const kindAt = body.indexOf('setSubmittingKind("text")');
    const submitAt = body.indexOf("setIsSubmitting(true)");
    expect(kindAt).toBeGreaterThanOrEqual(0);
    expect(kindAt).toBeLessThan(submitAt);
  });

  it("handleSubmit 先预判再按路由结果校正", () => {
    const body = sliceFrom("let pendingImageTask: ImageGeneratorPayload | null = null;", 25000);
    const predictAt = body.indexOf("setSubmittingKind(");
    const submitAt = body.indexOf("setIsSubmitting(true)");
    expect(predictAt).toBeGreaterThanOrEqual(0);
    expect(predictAt).toBeLessThan(submitAt);
    expect(body).toMatch(/assistantModelTab === "image"\s*\?\s*"image"\s*:\s*"text"/);

    const replyAt = body.indexOf("const shouldReplyWithText =");
    const correctAt = body.indexOf("setSubmittingKind(", replyAt);
    expect(replyAt).toBeGreaterThan(0);
    expect(correctAt).toBeGreaterThan(replyAt);
    expect(body.slice(correctAt, correctAt + 200)).toContain("!shouldReplyWithText");
  });

  it("首页交接按最终路由结论校正", () => {
    expect(source).toContain('setSubmittingKind(decision.mode === "image" ? "image" : "text")');
  });
});
