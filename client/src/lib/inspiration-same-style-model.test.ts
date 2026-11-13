import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INSPIRATION_SAME_STYLE_MODEL_ID,
  IMAGE_MODEL_PRIORITY_IDS,
} from "@shared/image-models";
import {
  AI_IMAGE_MODEL_CREDIT_POLICIES,
  FREE_PLAN_LOCKED_IMAGE_MODEL_ID,
  getAiImageModelCreditPolicy,
} from "@shared/ai-credit-policy";

const canvas = readFileSync("client/src/components/canvas/InfiniteCanvas.tsx", "utf8");
const lib = readFileSync("client/src/lib/inspiration-same-style.ts", "utf8");

describe("灵感模板一键同款默认模型（2026-11-13 用户拍板：≤90 积分内质量最好）", () => {
  it("单张积分不超过 90，且是可选模型", () => {
    expect(getAiImageModelCreditPolicy(INSPIRATION_SAME_STYLE_MODEL_ID)!.creditsPerImage).toBeLessThanOrEqual(90);
    expect(IMAGE_MODEL_PRIORITY_IDS as readonly string[]).toContain(INSPIRATION_SAME_STYLE_MODEL_ID);
  });

  it("≤90 积分范围内已是最高档（没有比它更贵且仍 ≤90 的模型）", () => {
    const own = getAiImageModelCreditPolicy(INSPIRATION_SAME_STYLE_MODEL_ID)!.creditsPerImage;
    const better = AI_IMAGE_MODEL_CREDIT_POLICIES.filter(
      p => (IMAGE_MODEL_PRIORITY_IDS as readonly string[]).includes(p.model) && p.creditsPerImage <= 90 && p.creditsPerImage > own
    );
    expect(better).toEqual([]);
  });

  it("免费用户也能用（否则一键同款对免费用户一点生成就被拒）", () => {
    expect(INSPIRATION_SAME_STYLE_MODEL_ID).toBe(FREE_PLAN_LOCKED_IMAGE_MODEL_ID);
  });

  it("切模型时必须关 auto（auto+引用图会改道 300 积分的 gem）", () => {
    const start = canvas.indexOf("const applyInspirationSameStyleModel = useCallback(");
    const body = canvas.slice(start, canvas.indexOf("}, [availableAssistantImageModels]);", start));
    expect(body).toContain("setAssistantImageModelId(INSPIRATION_SAME_STYLE_MODEL_ID)");
    expect(body).toContain("setAssistantAutoMode(false)");
  });

  it("两个入口都接上：画布内灵感弹窗 + 首页/灵感页交接", () => {
    const handler = canvas.slice(
      canvas.indexOf("const handleInspirationSameStyle = useCallback("),
      canvas.indexOf("const setComposerTextSegment = useCallback(")
    );
    expect(handler).toContain("applyInspirationSameStyleModel();");
    const handoff = canvas.slice(
      canvas.indexOf("if (!payload.shouldAutoRun) {"),
      canvas.indexOf("if (!submittedText) return;")
    );
    expect(handoff).toContain("applyInspirationSameStyleModel();");
    expect(lib).toContain("model: INSPIRATION_SAME_STYLE_MODEL_ID");
  });
});
