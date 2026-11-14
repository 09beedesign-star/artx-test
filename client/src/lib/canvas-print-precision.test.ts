/**
 * 🔒 2026-11-14 打印精度评估（用户要求判断 DPI 是否满足印刷）。
 * 积分数字必须来自真实策略表，不允许硬编码。
 */
import { describe, expect, it } from "vitest";
import { AI_CREDIT_POLICIES } from "@shared/ai-credit-policy";
import { CREDIT_RECHARGE_RATE, MEMBERSHIP_CREDITS_PER_HKD } from "@shared/billing-config";
import {
  AI_ENHANCE_CREDITS,
  AI_EXPANSION_CREDITS,
  DEFAULT_PRINT_PLACEMENT,
  PRINT_CREDIT_COST,
  creditsToHkd,
  drawPrintPage,
  evaluatePrintPrecision,
} from "@/lib/canvas-print-precision";
import { TEMPLATE_RESOLUTIONS } from "@/lib/canvas-templates";

const DPI300 = TEMPLATE_RESOLUTIONS.find(r => r.kind === "dpi" && r.value === 300)!;
const DPI150 = TEMPLATE_RESOLUTIONS.find(r => r.kind === "dpi" && r.value === 150)!;

function evaluate(imageSize: number, overrides: Partial<Parameters<typeof evaluatePrintPrecision>[0]> = {}) {
  return evaluatePrintPrecision({
    imageWidth: imageSize,
    imageHeight: imageSize,
    paperId: "a4",
    orientation: "portrait",
    resolution: DPI300,
    bleedMm: 0,
    placement: DEFAULT_PRINT_PLACEMENT,
    ...overrides,
  });
}

describe("积分口径（真实来自策略表）", () => {
  it("打印 0 积分；AI 高清化 160、AI 扩图 200", () => {
    expect(PRINT_CREDIT_COST).toBe(0);
    expect(AI_ENHANCE_CREDITS).toBe(AI_CREDIT_POLICIES.find(p => p.capability === "image_enhance")?.baseCredits);
    expect(AI_ENHANCE_CREDITS).toBe(160);
    expect(AI_EXPANSION_CREDITS).toBe(AI_CREDIT_POLICIES.find(p => p.capability === "image_expansion")?.baseCredits);
    expect(AI_EXPANSION_CREDITS).toBe(200);
  });

  it("积分换算按会员 170 / 轻量 130 积分每 HKD", () => {
    const hkd = creditsToHkd(160);
    expect(hkd.low).toBe(Math.round((160 / MEMBERSHIP_CREDITS_PER_HKD) * 100) / 100);
    expect(hkd.high).toBe(Math.round((160 / CREDIT_RECHARGE_RATE) * 100) / 100);
    expect(hkd.low).toBeLessThan(hkd.high);
  });
});

describe("DPI 精度判断", () => {
  it("A4@300 满版需要 2480×3508 px（复用版式工作台事实源）", () => {
    const r = evaluate(1024);
    expect(r.outputWidthPx).toBe(2480);
    expect(r.outputHeightPx).toBe(3508);
    expect(r.targetDpi).toBe(300);
  });

  it("1K(1024) 图铺满 A4 只有约 124 DPI → 精度不足", () => {
    const r = evaluate(1024);
    expect(r.effectiveDpi).toBeGreaterThan(120);
    expect(r.effectiveDpi).toBeLessThan(130);
    expect(r.meets300).toBe(false);
    expect(r.verdict).toBe("insufficient");
    expect(r.requiredSourceWidthFor300).toBe(2480);
    expect(r.suggestion).toContain("160 积分");
  });

  it("2K(2048) 约 248 DPI 适合打样；4K(4096) 约 496 DPI 达印刷标准", () => {
    const twoK = evaluate(2048);
    expect(twoK.effectiveDpi).toBeGreaterThan(240);
    expect(twoK.effectiveDpi).toBeLessThan(255);
    expect(twoK.verdict).toBe("acceptable");
    const fourK = evaluate(4096);
    expect(fourK.effectiveDpi).toBeGreaterThan(300);
    expect(fourK.verdict).toBe("excellent");
  });

  it("⚠️ 有效 DPI 是图片+纸张的物理属性，不随导出 DPI 档位变化", () => {
    const at300 = evaluate(1024);
    const at150 = evaluate(1024, { resolution: DPI150 });
    expect(at150.outputWidthPx).toBeLessThan(at300.outputWidthPx);
    expect(at150.effectiveDpi).toBeCloseTo(at300.effectiveDpi, 0);
  });

  it("缩小显示(0.5)提升有效 DPI；剪裁降低有效 DPI", () => {
    const base = evaluate(1024);
    const smaller = evaluate(1024, { placement: { ...DEFAULT_PRINT_PLACEMENT, scale: 0.5 } });
    expect(smaller.effectiveDpi).toBeGreaterThan(base.effectiveDpi * 1.9);
    const cropped = evaluate(1024, { placement: { ...DEFAULT_PRINT_PLACEMENT, cropLeft: 0.2, cropRight: 0.2 } });
    expect(cropped.effectiveDpi).toBeLessThan(base.effectiveDpi);
    expect(cropped.usableSourceWidthPx).toBeLessThan(base.usableSourceWidthPx);
  });

  it("缩小纸张到 A5 可把 1K 图提到 150 DPI 以上（0 积分的解法）", () => {
    const r = evaluate(1024, { paperId: "a5" });
    expect(r.effectiveDpi).toBeGreaterThan(170);
    expect(r.meets150).toBe(true);
  });

  it("3mm 出血增加输出像素", () => {
    const noBleed = evaluate(1024);
    const bleed = evaluate(1024, { bleedMm: 3 });
    expect(bleed.outputWidthPx).toBeGreaterThan(noBleed.outputWidthPx);
  });
});

describe("预览与导出共用绘制", () => {
  it("drawPrintPage 用 9 参数 drawImage 实现源裁剪 + 目标缩放", () => {
    const calls: unknown[][] = [];
    const ctx = {
      fillStyle: "",
      fillRect: (...args: unknown[]) => calls.push(["fillRect", ...args]),
      drawImage: (...args: unknown[]) => calls.push(["drawImage", ...args]),
    } as unknown as CanvasRenderingContext2D;
    drawPrintPage(ctx, {} as CanvasImageSource, 1000, 800, 2480, 3508, {
      ...DEFAULT_PRINT_PLACEMENT, cropLeft: 0.1, scale: 0.8, offsetX: 10,
    });
    const draw = calls.find(c => c[0] === "drawImage")!;
    expect(draw.length).toBe(10); // 名称 + image + 8 个数值
    expect(draw[2]).toBe(100); // sx = 1000 * 0.1
    expect(draw[4]).toBe(900); // sw = 1000 * 0.9
  });
});
