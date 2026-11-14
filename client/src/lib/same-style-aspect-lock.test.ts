import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { INSPIRATION_SAME_STYLE_MODEL_ID } from "@shared/image-models";
import { quoteAiUsage, resolveImageResolutionTier } from "@shared/ai-credit-policy";
import { resolveSameStyleAspectLock, SAME_STYLE_MAX_CREDITS_PER_IMAGE } from "./same-style-generation";
import {
  __testCropGeneratedImagesToAspectLock,
  __testResolveAspectLockCropSize,
} from "../../../server/image-generation";

/**
 * 2026-11-14 用户硬规定：一键同款出图与模板图**比例完全一致**，除非用户手动调比例/分辨率。
 * 同时不能击穿「同款 ≤ 90 积分」护栏（只裁不放大 → 档位不升）。
 */
describe("一键同款画幅锁", () => {
  it("默认（选择器 auto、提示词没写尺寸）锁模板真实像素，ratio 取白名单最近值", () => {
    const lock = resolveSameStyleAspectLock({
      templateWidth: 1237,
      templateHeight: 1653,
      selectorRatio: "auto",
      promptSizeSource: "selector",
    });
    expect(lock).toEqual({ ratio: "3:4", aspectLockWidth: 1237, aspectLockHeight: 1653 });
  });

  it("用户手动选了比例 / 提示词写了尺寸 → 不锁，按用户的来", () => {
    expect(resolveSameStyleAspectLock({ templateWidth: 1000, templateHeight: 1500, selectorRatio: "16:9" })).toBeNull();
    expect(
      resolveSameStyleAspectLock({ templateWidth: 1000, templateHeight: 1500, selectorRatio: "auto", promptSizeSource: "prompt" })
    ).toBeNull();
  });

  it("读不到模板尺寸 → 不锁（不编造比例）", () => {
    expect(resolveSameStyleAspectLock({ selectorRatio: "auto" })).toBeNull();
  });

  it("裁切尺寸：比例精确等于模板，且宽高都不超过上游原图（只裁不放大）", () => {
    // 上游 3:4 档 864×1152，模板 1237×1653
    const size = __testResolveAspectLockCropSize(864, 1152, 1237, 1653);
    expect(size.width).toBeLessThanOrEqual(864);
    expect(size.height).toBeLessThanOrEqual(1152);
    expect(Math.abs(size.width / size.height - 1237 / 1653)).toBeLessThan(0.002);
    // 上游 9:16 出给一张方模板
    expect(__testResolveAspectLockCropSize(768, 1344, 1000, 1000)).toEqual({ width: 768, height: 768 });
  });

  it("真实 sharp 裁切：输出比例 = 模板比例，计费档位仍是 1k、≤ 90 积分", async () => {
    const png = await sharp({
      create: { width: 864, height: 1152, channels: 3, background: { r: 200, g: 50, b: 50 } },
    }).png().toBuffer();
    const [out] = await __testCropGeneratedImagesToAspectLock(
      [{ src: `data:image/png;base64,${png.toString("base64")}`, width: 864, height: 1152 }],
      1237,
      1653,
    );
    const meta = await sharp(Buffer.from(out.src.split(",")[1], "base64")).metadata();
    expect(meta.width).toBe(out.width);
    expect(meta.height).toBe(out.height);
    expect(Math.abs(meta.width! / meta.height! - 1237 / 1653)).toBeLessThan(0.002);
    const tier = resolveImageResolutionTier(meta.width!, meta.height!);
    expect(tier).toBe("1k");
    const quote = quoteAiUsage({ capability: "text_to_image", model: INSPIRATION_SAME_STYLE_MODEL_ID, resolutionTier: tier });
    expect(quote.chargedCredits).toBeLessThanOrEqual(SAME_STYLE_MAX_CREDITS_PER_IMAGE);
  });

  it("接线：前端 payload → ai.ts 两条出口 → orchestrator → 服务端 VOD/中转两条分支都消费", () => {
    const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
    expect(canvas).toContain("resolveSameStyleAspectLock({");
    expect(canvas).toContain("aspectLockWidth: sameStyleAspectLock?.aspectLockWidth");
    expect(canvas).toContain("sameStyleAspectLock?.ratio ?? promptSizeDecision.ratio");
    // 同款仍不下发 targetWidth（不升档）
    expect(canvas).toContain("targetWidth: shouldEditTargetReference || isSameStyle");
    // 再次生成可重放
    expect(canvas).toContain("generationAspectLockWidth: detail.aspectLockWidth");
    expect(canvas).toContain("data.generationAspectLockWidth");

    const ai = readFileSync("client/src/lib/ai.ts", "utf8");
    expect(ai.match(/aspectLockWidth,\n/g)?.length).toBeGreaterThanOrEqual(4);

    const orchestrator = readFileSync("server/ai-orchestrator.ts", "utf8");
    expect(orchestrator).toContain("aspectLockWidth: input.aspectLockWidth");

    const server = readFileSync("server/image-generation.ts", "utf8");
    expect(server.match(/__testCropGeneratedImagesToAspectLock\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
