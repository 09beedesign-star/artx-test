import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSPIRATION_SAME_STYLE_MODEL_ID } from "@shared/image-models";
import { MEMORY_CONTEXT_SURCHARGE_CREDITS, quoteAiUsage } from "@shared/ai-credit-policy";
import {
  SAME_STYLE_MAX_CREDITS_PER_IMAGE,
  buildSameStyleImagePrompt,
  isSameStyleGeneration,
} from "./same-style-generation";

const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
const submitStart = canvas.indexOf("const needsReferenceComprehension =");
const handleSubmit = canvas.slice(
  submitStart,
  canvas.indexOf("dispatchImageGenerationTask(\n          { ...payload, status: \"pending\" },", submitStart)
);

const base = {
  modelTab: "image" as const,
  autoMode: false,
  imageModelId: INSPIRATION_SAME_STYLE_MODEL_ID,
  referenceIds: ["node-a"],
  sameStyleReferenceIds: new Set(["node-a"]),
  hasActiveSkill: false,
};

describe("一键同款单张 ≤ 90 积分（2026-11-14 用户要求）", () => {
  it("同款实际扣费：1k 出图 70，带长期记忆 75，均 ≤ 90", () => {
    const plain = quoteAiUsage({ capability: "text_to_image", model: INSPIRATION_SAME_STYLE_MODEL_ID, resolutionTier: "1k" });
    const withMemory = quoteAiUsage({
      capability: "text_to_image",
      model: INSPIRATION_SAME_STYLE_MODEL_ID,
      resolutionTier: "1k",
      userMemoryContext: "长期记忆",
    });
    expect(plain.chargedCredits).toBe(70);
    expect(withMemory.chargedCredits).toBe(70 + MEMORY_CONTEXT_SURCHARGE_CREDITS);
    expect(withMemory.chargedCredits).toBeLessThanOrEqual(SAME_STYLE_MAX_CREDITS_PER_IMAGE);
  });

  it("堵掉的口子确实会超 90（反证护栏有必要）", () => {
    const at = (tier: string) =>
      quoteAiUsage({ capability: "text_to_image", model: INSPIRATION_SAME_STYLE_MODEL_ID, resolutionTier: tier }).chargedCredits;
    expect(at("2k")).toBeGreaterThan(90);
    expect(at("8k")).toBeGreaterThan(90);
    expect(quoteAiUsage({ capability: "image_edit", model: INSPIRATION_SAME_STYLE_MODEL_ID }).chargedCredits).toBeGreaterThan(90);
    const routing = quoteAiUsage({ capability: "text_generation" }).chargedCredits;
    expect(routing + at("1k") + 2 * MEMORY_CONTEXT_SURCHARGE_CREDITS).toBeGreaterThan(90);
  });

  it("判定：只有「图片页签 + 非 auto + 同款模型 + 挂着模板图 + 无技能」才算同款", () => {
    expect(isSameStyleGeneration(base)).toBe(true);
    expect(isSameStyleGeneration({ ...base, autoMode: true })).toBe(false);
    expect(isSameStyleGeneration({ ...base, modelTab: "text" })).toBe(false);
    expect(isSameStyleGeneration({ ...base, imageModelId: "vod-og25-sunburst-high" })).toBe(false);
    expect(isSameStyleGeneration({ ...base, referenceIds: ["other"] })).toBe(false);
    expect(isSameStyleGeneration({ ...base, hasActiveSkill: true })).toBe(false);
    expect(isSameStyleGeneration({ ...base, referenceIds: ["other", "node-a"] })).toBe(true);
  });

  it("提示词点名模板图、带上用户需求；空需求也能出图", () => {
    const prompt = buildSameStyleImagePrompt({ userText: "换成猫", referenceTitles: ["t"], templateIndexes: [0] });
    expect(prompt).toContain("参考图 1 是用户选中的同款模板");
    expect(prompt).toContain("用户需求：换成猫");
    expect(buildSameStyleImagePrompt({ userText: "", referenceTitles: ["t"], templateIndexes: [0] })).toContain("直接生成一张同款图片");
  });

  it("画布接线：同款时不路由、不下发目标像素、不走 image_edit", () => {
    expect(handleSubmit).toContain("const isSameStyle = isSameStyleGeneration({");
    expect(handleSubmit).toMatch(/const shouldRouteIntent =\s*!isSameStyle &&/);
    expect(handleSubmit).toMatch(/const shouldEditTargetReference =\s*!isSameStyle && assistantImages\.length >= 2;/);
    expect(handleSubmit).toMatch(/targetWidth: shouldEditTargetReference \|\| isSameStyle\s*\?\s*undefined/);
    expect(handleSubmit).toMatch(/targetHeight: shouldEditTargetReference \|\| isSameStyle\s*\?\s*undefined/);
  });

  it("两个入口都登记模板图 id（漏一个 = 那个入口照旧 90~260）", () => {
    expect(canvas.match(/applyInspirationSameStyleModel\(imported\);/g)?.length).toBe(2);
    expect(canvas).not.toMatch(/applyInspirationSameStyleModel\(\);/);
  });
});
