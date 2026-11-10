import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「一键同款」的接线防护测试（2026-11-10）。
 *
 * 【为什么要扫源码】
 * 这个功能的价值全在**跨组件的一根线**上：页面写交接载荷 → 画布消费它。
 * 只测其中一半（比如载荷里有图）会得到「库是对的、画布没接」的恒绿结论，
 * 而这正是这个按钮**从上线起就点不出任何东西**的原因：
 * 画布侧拿到 `shouldAutoRun: false` 就 `return`，key 已经删了，两边都零报错。
 *
 * 📌 三条判据分别守住三个独立故障点：
 *   1. 载荷里必须带图（否则「同款」变成「空白画布」）；
 *   2. 载荷必须显式 `shouldAutoRun: false`（否则一次点击就替用户扣积分）；
 *   3. 画布必须消费「不自动跑」这一支：导图 + 聚焦输入框 + **不许掉进生成**。
 */

const root = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf-8");

const sameStyleLib = read("client/src/lib/inspiration-same-style.ts");
const canvasSource = read("client/src/components/canvas/InfiniteCanvas.tsx");

describe("一键同款 载荷", () => {
  it("把模板图作为参考图塞进交接载荷", () => {
    expect(sameStyleLib).toContain("references");
    expect(sameStyleLib).toContain("src: imageUrl");
    // 远程 URL 就够了：画布侧走 loadExternalImageWithProxyFallback，带代理兜底。
    // 反面：在这里硬转 dataURL 只会在主线程上白算一遍。
    expect(sameStyleLib).not.toContain("toDataURL");
  });

  it("绝不自动出图（一次生成要扣积分，必须用户自己点）", () => {
    expect(sameStyleLib).toContain("shouldAutoRun: false");
  });

  it("没有图片时明确报错，而不是建一块空画布", () => {
    expect(sameStyleLib).toContain("missing-image");
  });
});

describe("一键同款 画布侧消费", () => {
  /** 截出「不自动跑」这一支，避免整文件匹配把别处的调用算进来。 */
  const branchStart = canvasSource.indexOf("if (!payload.shouldAutoRun) {");
  const branchEnd = canvasSource.indexOf("if (!submittedText) return;");

  it("分支确实存在且顺序正确（先处理不自动跑，再进生成）", () => {
    expect(branchStart, "找不到 shouldAutoRun 分支").toBeGreaterThan(0);
    expect(branchEnd, "找不到生成前的空提示词闸门").toBeGreaterThan(branchStart);
  });

  it("这一支里导图 + 聚焦输入框，但绝不触发生成", () => {
    const branch = canvasSource.slice(branchStart, branchEnd);
    expect(branch).toContain("onImportHomeReferences(handoffReferences)");
    expect(branch).toContain("focusComposerSegment()");
    // 📌 关键反向断言：掉进生成就等于「点了同款直接扣积分」。
    expect(branch).not.toContain("generateAiImages");
    expect(branch).not.toContain("dispatchImageGenerationTask");
  });

  it("允许「只有图、没有提示词」的载荷", () => {
    /*
     * 旧守卫是 `!payload.prompt?.trim()` —— 一键同款恰好没有提示词，
     * 会被当成无效载荷直接忽略（而且 key 也不删）。
     */
    expect(canvasSource).toContain(
      "if (!submittedText && handoffReferences.length === 0) return;"
    );
  });
});
