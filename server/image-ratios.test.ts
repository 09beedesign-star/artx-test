import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_RATIO_VALUE,
  DEFAULT_AUTO_RATIO,
  SUPPORTED_IMAGE_RATIOS,
  isAutoRatio,
  resolveImageRatio,
} from "../shared/image-ratios";

/**
 * 【2026-09-13】全站 auto 比例默认值 1:1 → 9:16。
 *
 * ⚠️ 测试文件必须放在 server/ 或 client/src/ 下：
 * vitest.config.ts 的 include 只有 `server/**\/*.test.ts` 和 `client/src/**\/*.test.ts`，
 * 放在 shared/ 下不会被收集 —— 会静默「零用例通过」。
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(resolve(__dirname, "..", relativePath), "utf-8")
  );
}

describe("shared/image-ratios 唯一事实源", () => {
  it("auto 的默认比例是 9:16，不是 1:1", () => {
    expect(DEFAULT_AUTO_RATIO).toBe("9:16");
    // 反向断言：明确锁死不能退回方图。
    expect(DEFAULT_AUTO_RATIO).not.toBe("1:1");
  });

  it("默认比例本身必须在支持白名单内", () => {
    expect(SUPPORTED_IMAGE_RATIOS).toContain(DEFAULT_AUTO_RATIO);
  });

  it("resolveImageRatio 把 auto 解析为 9:16", () => {
    expect(resolveImageRatio(AUTO_RATIO_VALUE)).toBe("9:16");
    expect(resolveImageRatio("auto")).toBe("9:16");
    expect(resolveImageRatio("AUTO")).toBe("9:16");
    expect(resolveImageRatio("  auto  ")).toBe("9:16");
  });

  it("resolveImageRatio 把空值 / undefined 也解析为 9:16", () => {
    expect(resolveImageRatio(undefined)).toBe("9:16");
    expect(resolveImageRatio(null)).toBe("9:16");
    expect(resolveImageRatio("")).toBe("9:16");
    expect(resolveImageRatio("   ")).toBe("9:16");
  });

  it("resolveImageRatio 原样返回用户显式选择的合法比例", () => {
    // 关键反向断言：用户明确选了 1:1，绝不能被默认值劫持成 9:16。
    expect(resolveImageRatio("1:1")).toBe("1:1");
    expect(resolveImageRatio("16:9")).toBe("16:9");
    expect(resolveImageRatio("3:2")).toBe("3:2");
    expect(resolveImageRatio("21:9")).toBe("21:9");
    for (const ratio of SUPPORTED_IMAGE_RATIOS) {
      expect(resolveImageRatio(ratio)).toBe(ratio);
    }
  });

  it("resolveImageRatio 把白名单外的脏值回落到默认值而不是透传", () => {
    // 透传非法比例会让上游 API 直接报错或静默出方图。
    expect(resolveImageRatio("99:1")).toBe("9:16");
    expect(resolveImageRatio("竖版")).toBe("9:16");
    expect(resolveImageRatio("1x1")).toBe("9:16");
  });

  it("resolveImageRatio 的 fallback 参数可覆盖默认值（技能自带尺寸场景）", () => {
    expect(resolveImageRatio("auto", "4:5")).toBe("4:5");
    expect(resolveImageRatio(undefined, "16:9")).toBe("16:9");
    // fallback 只影响 auto/非法值，不影响显式合法选择。
    expect(resolveImageRatio("1:1", "16:9")).toBe("1:1");
  });

  it("isAutoRatio 正确识别自动与非自动", () => {
    expect(isAutoRatio("auto")).toBe(true);
    expect(isAutoRatio("AUTO")).toBe(true);
    expect(isAutoRatio(undefined)).toBe(true);
    expect(isAutoRatio("")).toBe(true);
    expect(isAutoRatio("1:1")).toBe(false);
    expect(isAutoRatio("9:16")).toBe(false);
  });
});

describe("全站比例出口都接入了唯一事实源", () => {
  /*
   * 这些是「同一份数据的多个出口」—— 只改一个出口等于没改。
   * 每个出口都必须实际引用 shared/image-ratios，且不得保留旧的 1:1 硬兜底。
   */

  it("后端 tencent-vod-aigc 的 resolveAspectRatio 对 auto 回落到默认值", () => {
    const source = readSource("server/tencent-vod-aigc.ts");
    expect(source).toContain('from "../shared/image-ratios"');
    expect(source).toContain("DEFAULT_AUTO_RATIO");
    expect(source).toContain('normalized === "auto"');
  });

  it("后端 image-generation 的比例转尺寸走 resolveRatioSize", () => {
    const source = readSource("server/image-generation.ts");
    expect(source).toContain('from "../shared/image-ratios"');
    expect(source).toContain("function resolveRatioSize");
    // 反向断言：旧的裸兜底写法必须已被全部替换掉。
    expect(source).not.toContain('ratioToSize[input.ratio || "1:1"]');
  });

  it("后端 nano-banana-client 先归一化再映射 size", () => {
    const source = readSource("server/nano-banana-client.ts");
    expect(source).toContain('from "../shared/image-ratios"');
    expect(source).toContain("resolveNanoBananaSize");
    // 原写法直接判 input.ratio，auto 会掉进方图分支。
    expect(source).not.toContain('input.ratio === "9:16" ? "1024x1536"');
  });

  it("前端 ai.ts 的三个生图入口都在函数体内收口 ratio", () => {
    const source = readSource("client/src/lib/ai.ts");
    expect(source).toContain('from "../../../shared/image-ratios"');
    expect(source).toContain("const resolvedRatio = resolveImageRatio(ratio)");
    expect(source).toContain("ratio: resolveImageRatio(ratio)");
    /*
     * 反向断言：默认参数不能再写死 1:1。
     * 注意默认参数只在调用方「完全不传」时生效，调用方显式传 "auto" 时
     * 默认参数兜不住 —— 所以函数体内的收口才是真正的防线。
     */
    expect(source).not.toContain('ratio = "1:1"');
  });

  it("前端 ai-intent.ts 的 generateIntentImages 收口 ratio", () => {
    const source = readSource("client/src/lib/ai-intent.ts");
    expect(source).toContain('from "../../../shared/image-ratios"');
    expect(source).toContain("ratio: resolveImageRatio(ratio)");
    expect(source).not.toContain('ratio = "1:1"');
  });

  it("前端 InfiniteCanvas 三处比例消费点都已接入", () => {
    const source = readSource(
      "client/src/components/canvas/InfiniteCanvas.tsx"
    );
    expect(source).toContain('from "@shared/image-ratios"');
    // 右侧助手：必须拆开 shouldEditTargetReference 与 auto 两个条件。
    expect(source).toContain("resolveImageRatio(assistantImageRatio)");
    // 技能分支：auto 时优先用技能自带比例，否则用全站默认。
    expect(source).toContain("isAutoRatio(assistantImageRatio)");
    // 首页入口没有比例选择器，等价于未选择，必须走默认值。
    expect(source).toContain("ratio: DEFAULT_AUTO_RATIO");
    expect(source).not.toContain('ratio: message.imageBackup?.ratio || "1:1"');
  });

  it("局部重绘走画幅锁而不是写死的 1:1", () => {
    const source = readSource(
      "client/src/components/canvas/InfiniteCanvas.tsx"
    );
    /*
     * 【2026-09-13 二次修订】本条原先断言 `shouldEditTargetReference ? "1:1"`，
     * 即"多图融合锁死 1:1"。
     *
     * ⚠️ 那个口径本身就是 bug：写死 1:1 的本意是"贴合底图"，
     * 但只有底图恰好是方图时才成立。底图是竖版实拍图时，
     * 这行等于主动要求上游出方图 —— 用户反馈的「内容一致但比例变形」正是它。
     *
     * 现在改由 shared/edit-aspect-lock.ts 的 resolveEditAspectLock 裁决：
     * 提示词显式比例 > 比例选择器 > 底图真实比例 > 1:1 兜底。
     * 原条目"不要被 auto 默认值误伤"的意图仍然保留 —— 见反向断言：
     * 重绘分支绝不能退回 resolveImageRatio(assistantImageRatio)，
     * 否则 auto 会把底图比例冲成 9:16。
     */
    expect(source).toContain("shouldEditTargetReference");
    expect(source).toContain("resolveEditAspectLock");
    // 正向：重绘分支取画幅锁的比例（三元跨行，故用 [\s\S]）
    expect(source).toMatch(
      /ratio:\s*shouldEditTargetReference[\s\S]{0,80}?referenceEditAspectLock\.ratio/
    );
    // 正向：纯文生图分支仍保留 auto 默认值链路，没有被画幅锁误伤
    expect(source).toContain("resolveImageRatio(assistantImageRatio)");
    // 反向：写死的 1:1 必须已经消失
    expect(source).not.toMatch(
      /ratio:\s*shouldEditTargetReference\s*\?\s*"1:1"/
    );
    // 反向：重绘分支不能被 auto 默认值（9:16）接管
    expect(source).not.toMatch(
      /ratio:\s*shouldEditTargetReference\s*\?\s*resolveImageRatio\(assistantImageRatio\)/
    );
  });

  it("画框显示尺寸表补齐了 3:2 并先归一化再查表", () => {
    const source = readSource(
      "client/src/components/canvas/InfiniteCanvas.tsx"
    );
    const block = source.match(
      /function getImageDisplaySizeForRatio[\s\S]*?\n}/
    )?.[0];
    expect(block).toBeTruthy();
    // 3:2 此前缺失，选了它的用户会静默拿到 1:1 画框。
    expect(block).toContain('"3:2"');
    expect(block).toContain("resolveImageRatio(ratio)");
  });
});
