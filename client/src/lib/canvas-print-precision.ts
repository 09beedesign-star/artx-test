/**
 * 打印精度评估 —— 纯函数（2026-11-14）。
 *
 * 🔒 打印 / 导出**永远 0 积分**；只有用户主动点「AI 高清化」才走
 *    `image_enhance`（真实对齐 shared/ai-credit-policy.ts 的 baseCredits）。
 *
 * ⚠️ 为什么需要评估：AI 生成图常见 1K(1024) / 2K(2048) 长边，
 *    而 A4@300DPI 满版需要 2480×3508 px。把 1024px 图铺满 A4
 *    = 1024 / (210/25.4) ≈ 124 DPI，肉眼会糊，且**零报错**。
 *    这类「设置显示 300DPI、实际只有 124DPI」必须显式暴露给用户。
 */
import { AI_CREDIT_POLICIES } from "@shared/ai-credit-policy";
import { CREDIT_RECHARGE_RATE, MEMBERSHIP_CREDITS_PER_HKD } from "@shared/billing-config";
import {
  MM_PER_INCH,
  TEMPLATE_PAPER_PRESETS,
  resolveTemplateSize,
  type TemplateOrientation,
  type TemplateResolution,
} from "./canvas-templates";

/** 打印本身不消耗积分（与版式工作台口径一致）。 */
export const PRINT_CREDIT_COST = 0;

function creditsOf(capability: string): number {
  return AI_CREDIT_POLICIES.find(p => p.capability === capability)?.baseCredits ?? 0;
}

/** AI 高清化（真·上游超分，PicWish scale）160 积分/次。 */
export const AI_ENHANCE_CREDITS = creditsOf("image_enhance");
/** AI 扩图 200 积分/次；主要改变构图/外延，输出仍 1K，不推荐用来提精度。 */
export const AI_EXPANSION_CREDITS = creditsOf("image_expansion");

/** 积分 → HKD 区间：会员基准 170 积分/HKD，轻量补充 130 积分/HKD。 */
export function creditsToHkd(credits: number): { low: number; high: number } {
  return {
    low: Math.round((credits / MEMBERSHIP_CREDITS_PER_HKD) * 100) / 100,
    high: Math.round((credits / CREDIT_RECHARGE_RATE) * 100) / 100,
  };
}

/** 图片在纸上的放置参数；比例均为 0~1。 */
export interface PrintPlacement {
  /** 显示大小：1 = 铺满纸张短边（contain 基础上再乘） */
  scale: number;
  /** 左右移动：百分比，-100 ~ 100 */
  offsetX: number;
  /** 上下移动：百分比，-100 ~ 100 */
  offsetY: number;
  /** 四边剪裁比例 0~0.45 */
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}

export const DEFAULT_PRINT_PLACEMENT: PrintPlacement = {
  scale: 1, offsetX: 0, offsetY: 0,
  cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
};

/** 印刷级 300DPI / 打样级 150DPI。 */
export const PRINT_DPI_INDUSTRY = 300;
export const PRINT_DPI_PROOF = 150;

export interface PrintPrecisionResult {
  /** 按目标 DPI，纸张输出像素 */
  outputWidthPx: number;
  outputHeightPx: number;
  /** 设定的目标 DPI（长边档由纸张反算） */
  targetDpi: number;
  /** 源图经剪裁后可用于印刷的像素宽 */
  usableSourceWidthPx: number;
  /** 图片实际能提供的 DPI */
  effectiveDpi: number;
  /** 达到 300DPI 所需的源图像素宽（含当前缩放/剪裁） */
  requiredSourceWidthFor300: number;
  meets300: boolean;
  meets150: boolean;
  verdict: "excellent" | "acceptable" | "insufficient";
  suggestion: string;
  /** 浏览器 canvas 上限被触发 */
  clamped: boolean;
}

export function evaluatePrintPrecision(options: {
  imageWidth: number;
  imageHeight: number;
  paperId: string;
  orientation: TemplateOrientation;
  resolution: TemplateResolution;
  bleedMm: number;
  placement: PrintPlacement;
}): PrintPrecisionResult {
  const size = resolveTemplateSize({
    paperId: options.paperId,
    orientation: options.orientation,
    resolution: options.resolution,
    bleedMm: options.bleedMm,
  });
  const paper = TEMPLATE_PAPER_PRESETS.find(p => p.id === options.paperId) || TEMPLATE_PAPER_PRESETS[0];
  // 物理宽度（inch）：mm 纸按真实毫米；px 纸按 CSS 96dpi 定义
  const pageWidthInch = paper.unit === "mm"
    ? (options.orientation === "landscape" ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h)) / MM_PER_INCH
    : (options.orientation === "landscape" ? Math.max(paper.w, paper.h) : Math.min(paper.w, paper.h)) / 96;

  const p = options.placement;
  const usableW = Math.max(1, options.imageWidth * Math.max(0.1, 1 - p.cropLeft - p.cropRight));
  const usableH = Math.max(1, options.imageHeight * Math.max(0.1, 1 - p.cropTop - p.cropBottom));
  /*
   * 与 drawPrintPage 保持同一套 contain 换算：fit = 每个源像素被放大成几个输出像素。
   * 输出像素按 targetDpi 映射到物理英寸 → 有效 DPI = targetDpi / fit。
   * （早先按「纸高 inch」算会把正方形图算成 87 DPI，偏保守；铺满纸宽时实际是 124 DPI。）
   */
  const fit = Math.min(
    (size.print.width * p.scale) / usableW,
    (size.print.height * p.scale) / usableH,
  );
  const effectiveDpi = size.effectiveDpi / Math.max(0.0001, fit);
  const required = Math.round(pageWidthInch * PRINT_DPI_INDUSTRY * p.scale);
  const meets300 = effectiveDpi >= PRINT_DPI_INDUSTRY;
  const meets150 = effectiveDpi >= PRINT_DPI_PROOF;
  const verdict: PrintPrecisionResult["verdict"] = meets300 ? "excellent" : meets150 ? "acceptable" : "insufficient";
  const hkd = creditsToHkd(AI_ENHANCE_CREDITS);
  const suggestion = meets300
    ? `当前约 ${Math.round(effectiveDpi)} DPI，达到 300 DPI 印刷标准，可直接打印。`
    : meets150
      ? `当前约 ${Math.round(effectiveDpi)} DPI，适合打样；正式印刷建议缩到 A5、改用 150 DPI（0 积分），或做一次 AI 高清化（${AI_ENHANCE_CREDITS} 积分）。`
      : `当前约 ${Math.round(effectiveDpi)} DPI，低于打样线。建议先缩小打印尺寸/降低 DPI（0 积分）；确需 ${paper.label.split(" · ")[0]} 满版 300 DPI 需约 ${required}px 源图，可做一次 AI 高清化（${AI_ENHANCE_CREDITS} 积分 ≈ HKD ${hkd.low}~${hkd.high}）。`;

  return {
    outputWidthPx: size.print.width,
    outputHeightPx: size.print.height,
    targetDpi: size.effectiveDpi,
    usableSourceWidthPx: Math.round(usableW),
    effectiveDpi: Math.round(effectiveDpi * 10) / 10,
    requiredSourceWidthFor300: required,
    meets300,
    meets150,
    verdict,
    suggestion,
    clamped: size.clamped,
  };
}

/** 把图片按 placement 画到纸张 canvas 上（预览与导出共用，保证所见即所得）。 */
export function drawPrintPage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width?: number; height?: number },
  sourceWidth: number,
  sourceHeight: number,
  pageWidth: number,
  pageHeight: number,
  placement: PrintPlacement,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  const p = placement;
  const sx = sourceWidth * p.cropLeft;
  const sy = sourceHeight * p.cropTop;
  const sw = Math.max(1, sourceWidth * (1 - p.cropLeft - p.cropRight));
  const sh = Math.max(1, sourceHeight * (1 - p.cropTop - p.cropBottom));
  const fit = Math.min((pageWidth * p.scale) / sw, (pageHeight * p.scale) / sh);
  const dw = sw * fit;
  const dh = sh * fit;
  const dx = (pageWidth - dw) / 2 + (pageWidth * p.offsetX) / 100;
  const dy = (pageHeight - dh) / 2 + (pageHeight * p.offsetY) / 100;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}
