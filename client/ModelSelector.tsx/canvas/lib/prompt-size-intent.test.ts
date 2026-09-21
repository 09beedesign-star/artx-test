import { describe, expect, it } from "vitest";
import {
  parsePromptSizeIntent,
  resolveOutputSizeFromPromptAndSelector,
} from "../../../shared/prompt-size-intent";
import {
  resolveImageRatio,
  SUPPORTED_IMAGE_RATIOS,
} from "../../../shared/image-ratios";

/**
 * 需求（用户原文）：
 * 「用户输入提示词中，一旦提到了关于分辨率(2k/4k/8k、高清、xx:xx、国际印刷尺寸)
 *   的时候，即使画布项的画幅比例 icon 没有选中 auto 模式，
 *   也必须优先按用户提示词的语义进行对应尺寸和分辨率输出。
 *   若提示词没有相关文字，则按照画幅 icon 下用户自主设定的参数生成。」
 *
 * 这条需求的两半同等重要，测试也必须成对：
 *   - 提到了 → 盖过 icon
 *   - 没提到 → 一个像素都不能改
 * 只测前半 = 用户改不了画幅也不会被发现。
 */
describe("prompt size intent", () => {
  it("resolves resolution tiers to long side pixels", () => {
    expect(parsePromptSizeIntent("画一张4K的科技感海报")?.width).toBe(3840);
    expect(parsePromptSizeIntent("生成一张 8K 超高清风景图")?.height).toBe(7680);
    // 「高清」是形容词不是可量数字，映射 2K 而非 4K —— 避免成本无谓翻倍。
    expect(parsePromptSizeIntent("高清产品图")?.width).toBe(2560);
  });

  it("treats 4K as the long side, not the width", () => {
    const intent = resolveOutputSizeFromPromptAndSelector({
      prompt: "4K 竖版海报",
      selectorRatio: "9:16",
      resolvedSelectorRatio: "9:16",
    });
    // 竖图的 4K = 长边 3840，宽度应当小于它。按宽度理解会让竖图整体偏小一圈。
    expect(Math.max(intent.width!, intent.height!)).toBe(3840);
    expect(intent.height).toBeGreaterThan(intent.width!);
  });

  it("maps international print formats to 300 DPI pixels", () => {
    const a4 = parsePromptSizeIntent("做一张A4尺寸的宣传单页");
    // 210mm x 297mm @300DPI
    expect(a4?.width).toBe(2480);
    expect(a4?.height).toBe(3508);
  });

  it("flips print formats only when the prompt asks for landscape", () => {
    const portrait = parsePromptSizeIntent("A3 展架");
    const landscape = parsePromptSizeIntent("A3 横版 展架");
    expect(portrait!.height).toBeGreaterThan(portrait!.width);
    expect(landscape!.width).toBeGreaterThan(landscape!.height);
  });

  /**
   * ⚠️⚠️⚠️ 这条是本次改造里抓到的**真实缺陷**的回归锁。
   *
   * 初版用最大公约数约简，A4 得到 "620:877" —— 数学上完全正确，
   * 但它不在 SUPPORTED_IMAGE_RATIOS 白名单里，resolveImageRatio()
   * 会把它**静默兜底成 9:16**。实测：A3 横版 "4961:3508" → 9:16，
   * 也就是「用户要 A3 横版，实际出竖图」，且全程零报错。
   *
   * 📌 判据：「算出一个合法数值」和「算出一个会被接受的数值」是两件事。
   */
  it("never emits a ratio that would be silently rejected by the whitelist", () => {
    const prompts = [
      "做一张A4尺寸的宣传单页",
      "A3 横版 展架",
      "A0 巨幅海报",
      "B5 内页",
      "letter 尺寸说明书",
      "legal 合同页",
      "tabloid 报纸版",
      "A4 4K 海报",
    ];
    for (const prompt of prompts) {
      const intent = parsePromptSizeIntent(prompt);
      expect(intent, prompt).toBeTruthy();
      expect(SUPPORTED_IMAGE_RATIOS, prompt).toContain(intent!.ratio);
      // 真正的判据：过一遍白名单校验后必须原样返回，而不是被换掉。
      expect(resolveImageRatio(intent!.ratio), prompt).toBe(intent!.ratio);
    }
  });

  it("keeps the real print pixels even though the ratio snaps to the whitelist", () => {
    const a4 = parsePromptSizeIntent("A4 宣传单页");
    // ratio 被吸附成 3:4（给上游选档位用），但像素仍是真实的 300DPI A4。
    expect(a4!.ratio).toBe("3:4");
    expect(a4!.width).toBe(2480);
    expect(a4!.height).toBe(3508);
  });

  it("does not mistake unrelated numbers for resolution keywords", () => {
    // 这三个是真实会出现在提示词里的陷阱。误判一个，用户就会莫名其妙出巨图。
    expect(parsePromptSizeIntent("这个包裹重 4kg")).toBeNull();
    expect(parsePromptSizeIntent("把价格从 4000 元改成 3000 元")).toBeNull();
    expect(parsePromptSizeIntent("Model A4X 的宣传图")).toBeNull();
    expect(parsePromptSizeIntent("一只可爱的猫")).toBeNull();
  });

  /**
   * 需求的**前半句**：提示词提到尺寸 → 即使 icon 不是 auto 也要盖过它。
   */
  it("overrides a non-auto ratio selector when the prompt mentions a size", () => {
    const decision = resolveOutputSizeFromPromptAndSelector({
      prompt: "做一张A4尺寸的宣传单页",
      selectorRatio: "16:9",
      resolvedSelectorRatio: "16:9",
    });
    expect(decision.source).toBe("prompt");
    expect(decision.ratio).toBe("3:4");
    expect(decision.width).toBe(2480);
    expect(decision.height).toBe(3508);
  });

  it("overrides a non-auto selector for explicit x:y ratios too", () => {
    const decision = resolveOutputSizeFromPromptAndSelector({
      prompt: "16:9 的电影感画面",
      selectorRatio: "3:4",
      resolvedSelectorRatio: "3:4",
    });
    expect(decision.source).toBe("prompt");
    expect(decision.ratio).toBe("16:9");
  });

  /**
   * 需求的**后半句**：提示词没提 → 完全按 icon，且不带任何像素。
   *
   * ⚠️ width/height 必须是 undefined 而不是「等于档位尺寸」的数字：
   * 服务端只在拿到像素时才做 sharp 重编码。给了数字 = 每一张普通图
   * 都会被无谓地重新编码一遍，是纯粹的性能损失。
   */
  it("falls back to the selector untouched when the prompt says nothing about size", () => {
    const decision = resolveOutputSizeFromPromptAndSelector({
      prompt: "一只在窗台上晒太阳的猫",
      selectorRatio: "16:9",
      resolvedSelectorRatio: "16:9",
    });
    expect(decision.source).toBe("selector");
    expect(decision.ratio).toBe("16:9");
    expect(decision.width).toBeUndefined();
    expect(decision.height).toBeUndefined();
  });

  /**
   * 「只说了分辨率没说形状」—— 最容易写错的一档。
   * 用户说「4K」但没说画幅，这时必须保留他在 icon 里选的形状，
   * 只把分辨率拉上去。擅自给一个默认比例 = 悄悄改掉了他的画幅设定。
   */
  it("keeps the selector shape when the prompt only mentions resolution", () => {
    const decision = resolveOutputSizeFromPromptAndSelector({
      prompt: "画一张4K的海报",
      selectorRatio: "3:4",
      resolvedSelectorRatio: "3:4",
    });
    expect(decision.ratio).toBe("3:4");
    expect(decision.width! / decision.height!).toBeCloseTo(3 / 4, 2);
    expect(Math.max(decision.width!, decision.height!)).toBe(3840);
  });

  it("does not drop the resolution intent when the selector is auto", () => {
    // 「auto」不是合法比例字符串，必须先经 resolveImageRatio 解析再传进来，
    // 否则 parseRatioToDimensions 判非法 → 整个尺寸意图被丢掉，用户说了 4K 却仍出 1536。
    const decision = resolveOutputSizeFromPromptAndSelector({
      prompt: "8K 超高清风景",
      selectorRatio: "auto",
      resolvedSelectorRatio: resolveImageRatio("auto"),
    });
    expect(decision.source).toBe("prompt");
    expect(Math.max(decision.width!, decision.height!)).toBe(7680);
  });

  it("clamps absurd sizes instead of forwarding them upstream", () => {
    const decision = parsePromptSizeIntent("长边 99999px 的巨图");
    // 没有上限 = 一次请求就能把 sharp 拖死，且账单由用户承担。
    if (decision) {
      expect(Math.max(decision.width, decision.height)).toBeLessThanOrEqual(8192);
    }
  });
});
